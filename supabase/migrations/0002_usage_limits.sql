-- Spending limits and player feedback.
--
-- Both tables have row level security on and no policies, so the anon key in every
-- browser can neither read nor write them. Only server routes (service role) can.
-- This matters because the game's other tables are publicly readable.

-- One row per model call, written BEFORE the call is made, so requests that are
-- still running count towards the limit. Also one row per town founded and per
-- feedback message, keyed on a keyed hash of the player's network. Rows are purged
-- after two days, so hashes are not kept long term.
create table usage_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('day', 'town', 'feedback')),
  ip_hash text,
  created_at timestamptz not null default now()
);
create index usage_events_kind_time on usage_events (kind, created_at);
create index usage_events_ip on usage_events (ip_hash, kind, created_at) where ip_hash is not null;
alter table usage_events enable row level security;

create table feedback (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(message) between 3 and 1000),
  page text,
  created_at timestamptz not null default now()
);
alter table feedback enable row level security;

revoke all on usage_events, feedback from anon, authenticated;
grant select, insert, update, delete on usage_events, feedback to service_role;

-- New games stop at 80% of the daily limit. The last 20% is kept back so that
-- games already under way can finish instead of being cut off mid-term.
create function day_budget_status(p_new_game boolean, p_hour_limit int, p_day_limit int)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  used_today int;
begin
  select count(*) into used_today
  from usage_events
  where kind = 'day' and created_at > now() - interval '24 hours';

  if used_today >= p_day_limit then
    return 'closed';
  end if;

  if p_new_game then
    if used_today >= floor(p_day_limit * 0.8) then
      return 'closed';
    end if;
    if (
      select count(*) from usage_events
      where kind = 'day' and created_at > now() - interval '1 hour'
    ) >= p_hour_limit then
      return 'busy';
    end if;
  end if;

  return 'ok';
end;
$$;

-- Atomically checks the budget and records one model call. The lock stops a burst
-- of simultaneous requests from all passing the check at once.
create function claim_day(p_new_game boolean, p_hour_limit int, p_day_limit int)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  status text;
begin
  perform pg_advisory_xact_lock(hashtext('usage_events'));
  status := day_budget_status(p_new_game, p_hour_limit, p_day_limit);
  if status = 'ok' then
    insert into usage_events (kind) values ('day');
  end if;
  return status;
end;
$$;

-- Atomically takes one of a network's daily slots for founding towns or sending feedback.
create function claim_ip_slot(p_kind text, p_ip_hash text, p_limit int)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtext('usage_events'));
  delete from usage_events where created_at < now() - interval '2 days';

  if (
    select count(*) from usage_events
    where kind = p_kind and ip_hash = p_ip_hash and created_at > now() - interval '24 hours'
  ) >= p_limit then
    return false;
  end if;

  insert into usage_events (kind, ip_hash) values (p_kind, p_ip_hash);
  return true;
end;
$$;

-- Supabase exposes public functions over its API. Without this, anyone holding the
-- anon key could call these directly and use up the budget.
revoke all on function day_budget_status(boolean, int, int) from public, anon, authenticated;
revoke all on function claim_day(boolean, int, int) from public, anon, authenticated;
revoke all on function claim_ip_slot(text, text, int) from public, anon, authenticated;
grant execute on function day_budget_status(boolean, int, int) to service_role;
grant execute on function claim_day(boolean, int, int) to service_role;
grant execute on function claim_ip_slot(text, text, int) to service_role;
