-- Loophole City schema.
-- Browsers hold only the anon key: they may read and subscribe, never write.
-- All writes go through Next.js routes using the service role, which bypasses RLS.

create extension if not exists pgcrypto;

create table towns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  timeline int not null default 1,
  state jsonb not null,
  pending_law_id uuid,
  busy_since timestamptz,
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  town_id uuid not null references towns (id) on delete cascade,
  name text not null,
  is_host boolean not null default false,
  created_at timestamptz not null default now()
);
create index players_town on players (town_id);

create table laws (
  id uuid primary key default gen_random_uuid(),
  town_id uuid not null references towns (id) on delete cascade,
  timeline int not null,
  day int not null,
  text text not null,
  proposer_id uuid references players (id) on delete set null,
  proposer_name text not null,
  status text not null default 'open' check (status in ('open', 'enacted', 'rejected', 'expired')),
  decree boolean not null default false,
  created_at timestamptz not null default now()
);
create index laws_town on laws (town_id, timeline);

alter table towns
  add constraint towns_pending_law_fk foreign key (pending_law_id) references laws (id) on delete set null;

create table votes (
  law_id uuid not null references laws (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  town_id uuid not null references towns (id) on delete cascade,
  value boolean not null,
  created_at timestamptz not null default now(),
  primary key (law_id, player_id)
);
create index votes_town on votes (town_id);

-- One row per day per timeline. `state` is the complete town after that day,
-- which is what makes rewinding possible. Rewinds copy earlier rows into the new
-- timeline with generated = false, so only real model calls count against the budget.
create table days (
  id bigint generated always as identity primary key,
  town_id uuid not null references towns (id) on delete cascade,
  timeline int not null,
  day int not null,
  state jsonb not null,
  ledger jsonb not null default '[]',
  thoughts jsonb not null default '[]',
  paper jsonb,
  trust_changes jsonb not null default '[]',
  generated boolean not null default false,
  created_at timestamptz not null default now(),
  unique (town_id, timeline, day)
);
create index days_generated_recent on days (created_at) where generated;

create table endings (
  id uuid primary key default gen_random_uuid(),
  town_id uuid not null references towns (id) on delete cascade,
  timeline int not null,
  days_lasted int not null,
  status text not null,
  law_text text,
  headline text not null,
  subhead text not null,
  story text not null,
  epitaph text not null,
  stats jsonb not null,
  created_at timestamptz not null default now(),
  unique (town_id, timeline)
);

alter table towns enable row level security;
alter table players enable row level security;
alter table laws enable row level security;
alter table votes enable row level security;
alter table days enable row level security;
alter table endings enable row level security;

create policy "read towns" on towns for select to anon, authenticated using (true);
create policy "read players" on players for select to anon, authenticated using (true);
create policy "read laws" on laws for select to anon, authenticated using (true);
create policy "read votes" on votes for select to anon, authenticated using (true);
create policy "read days" on days for select to anon, authenticated using (true);
create policy "read endings" on endings for select to anon, authenticated using (true);

alter publication supabase_realtime add table towns, players, laws, votes;