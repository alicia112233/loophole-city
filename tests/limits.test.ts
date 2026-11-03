import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { clientNetwork, networkKey } from "@/lib/limits";

describe("networkKey", () => {
  it("keeps IPv4 addresses whole", () => {
    expect(networkKey(" 203.0.113.9 ")).toBe("203.0.113.9");
    expect(networkKey("::ffff:203.0.113.9")).toBe("203.0.113.9");
  });

  it("groups IPv6 addresses by their /64, however they are written", () => {
    const key = "2001:db8:1:2::/64";
    expect(networkKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(key);
    expect(networkKey("2001:0db8:0001:0002::1")).toBe(key);
    expect(networkKey("2001:DB8:1:2::9%eth0")).toBe(key);
    expect(networkKey("2001:db8:1:3::1")).not.toBe(key);
    expect(networkKey("::1")).toBe("0:0:0:0::/64");
  });

  it("reads the first forwarded address", () => {
    expect(clientNetwork(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientNetwork(new Headers({ "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8");
    expect(clientNetwork(new Headers())).toBe("unknown");
  });
});

describe("usage limits migration", () => {
  const migration = readFileSync("supabase/migrations/0002_usage_limits.sql", "utf8");
  let pg: PGlite;

  const claim = async (newGame: boolean, hour = 1000, day = 10) =>
    (await pg.query<{ s: string }>("select claim_day($1, $2, $3) as s", [newGame, hour, day])).rows[0].s;
  const slot = async (kind: string, ip: string, limit = 2) =>
    (await pg.query<{ ok: boolean }>("select claim_ip_slot($1, $2, $3) as ok", [kind, ip, limit])).rows[0].ok;

  beforeEach(async () => {
    pg = new PGlite();
    // The same three roles a Supabase project has. Only service_role bypasses row level security.
    await pg.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    await pg.exec(migration);
  });

  it("stops new games at 80% of the daily limit and running games at 100%", async () => {
    for (let i = 0; i < 8; i++) expect(await claim(true)).toBe("ok");
    expect(await claim(true)).toBe("closed");
    expect(await claim(false)).toBe("ok");
    expect(await claim(false)).toBe("ok");
    expect(await claim(false)).toBe("closed");
  });

  it("makes new games wait at the hourly limit without touching running games", async () => {
    expect(await claim(true, 2, 100)).toBe("ok");
    expect(await claim(true, 2, 100)).toBe("ok");
    expect(await claim(true, 2, 100)).toBe("busy");
    expect(await claim(false, 2, 100)).toBe("ok");
  });

  it("ignores calls older than 24 hours", async () => {
    await pg.exec("insert into usage_events (kind, created_at) select 'day', now() - interval '25 hours' from generate_series(1, 50)");
    expect(await claim(true)).toBe("ok");
    const { rows } = await pg.query<{ n: number }>(
      "select count(*)::int as n from usage_events where created_at > now() - interval '1 day'",
    );
    expect(rows[0].n).toBe(1);
  });

  it("limits each network separately, and each kind separately", async () => {
    expect(await slot("town", "a")).toBe(true);
    expect(await slot("town", "a")).toBe(true);
    expect(await slot("town", "a")).toBe(false);
    expect(await slot("town", "b")).toBe(true);
    expect(await slot("feedback", "a")).toBe(true);
  });

  it("purges network hashes after two days", async () => {
    await pg.exec("insert into usage_events (kind, ip_hash, created_at) values ('town', 'old', now() - interval '3 days')");
    await slot("town", "a");
    const { rows } = await pg.query("select 1 from usage_events where ip_hash = 'old'");
    expect(rows).toHaveLength(0);
  });

  it("keeps the budget and feedback out of reach of the public anon key", async () => {
    await pg.exec("set role anon");
    await expect(pg.query("select claim_day(false, 1, 1)")).rejects.toThrow(/permission denied/);
    await expect(pg.query("select claim_ip_slot('town', 'a', 1)")).rejects.toThrow(/permission denied/);
    await expect(pg.query("select day_budget_status(false, 1, 1)")).rejects.toThrow(/permission denied/);
    await expect(pg.query("select * from usage_events")).rejects.toThrow(/permission denied/);
    await expect(pg.query("select * from feedback")).rejects.toThrow(/permission denied/);
    await expect(pg.query("insert into feedback (message) values ('spam')")).rejects.toThrow(/permission denied/);
    await pg.exec("reset role");

    // The server's role must still be able to do everything the routes need.
    await pg.exec("set role service_role");
    expect(await claim(true)).toBe("ok");
    expect(await slot("town", "a")).toBe(true);
    await pg.query("insert into feedback (message, page) values ('Add more citizens', 'landing')");
    await pg.exec("reset role");

    const { rows } = await pg.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relname in ('usage_events', 'feedback')",
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
    const policies = await pg.query("select 1 from pg_policies where tablename in ('usage_events', 'feedback')");
    expect(policies.rows).toHaveLength(0);
  });
});
