// End-to-end check of a running server: node scripts/e2e.mjs [baseUrl]
// Uses the real database and makes real model calls (about 4 days' worth of credit).
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^(\w+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const BASE = process.argv[2] ?? "http://localhost:3100";
let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
  if (!ok) failures++;
};

async function call(path, body, who, method = "POST") {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(who ? { "x-player-id": who.id, "x-player-token": who.token } : {}),
    },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const created = await call("/api/towns", { name: "Host" });
check("create town", created.status === 200, created.data.code);
const { code, identity: host } = created.data;
const T = `/api/towns/${code}`;

const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: townRows } = await anon.from("towns").select("id,code").eq("code", code);
const townId = townRows?.[0]?.id;
check("anon key can read", Boolean(townId));

// Realtime: confirm a browser-style subscription hears server writes.
const events = [];
const channel = anon
  .channel(`e2e-${townId}`)
  .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `town_id=eq.${townId}` }, (p) => events.push(p))
  .on("postgres_changes", { event: "*", schema: "public", table: "towns", filter: `id=eq.${townId}` }, (p) => events.push(p));
await new Promise((resolve) => channel.subscribe((s) => s === "SUBSCRIBED" && resolve()));
await new Promise((r) => setTimeout(r, 1500));

// RLS: the key every browser holds must not be able to change the game.
const stolen = await anon.from("towns").update({ state: { treasury: 999999 } }).eq("id", townId).select();
check("anon cannot update towns", (stolen.data ?? []).length === 0);
const forged = await anon.from("players").insert({ town_id: townId, name: "Hacker", is_host: true });
check("anon cannot insert players", Boolean(forged.error));
const deleted = await anon.from("towns").delete().eq("id", townId).select();
check("anon cannot delete towns", (deleted.data ?? []).length === 0);

const joined = await call(`${T}/join`, { name: "Friend" });
const friend = joined.data.identity;
check("friend joins", joined.status === 200);
await new Promise((r) => setTimeout(r, 2000));
check("realtime delivers player join", events.some((e) => e.table === "players"), `${events.length} events`);

check("join requires a name", (await call(`${T}/join`, { name: "  " })).status === 400);
check("unknown town is 404", (await call("/api/towns/ZZZZ", null, null, "GET")).status === 404);
check("next requires login", (await call(`${T}/next`, {})).status === 401);
check("forged token rejected", (await call(`${T}/next`, {}, { id: host.id, token: "x".repeat(43) })).status === 401);
check("non-host cannot advance", (await call(`${T}/next`, {}, friend)).status === 403);
check("non-host cannot rewind", (await call(`${T}/rewind`, { day: 0 }, friend)).status === 403);
check("non-host cannot resign", (await call(`${T}/resign`, {}, friend)).status === 403);
check("next without a law is refused", (await call(`${T}/next`, {}, host)).status === 409);
check("short law refused", (await call(`${T}/laws`, { text: "no" }, host)).status === 400);
check("long law refused", (await call(`${T}/laws`, { text: "x".repeat(201) }, host)).status === 400);

// Voting: two players, so a proposal needs both.
const proposed = await call(`${T}/laws`, { text: "The town will pay $5 for every piece of litter collected." }, host);
const bill = proposed.data.laws?.[0];
check("proposal stays open without a majority", bill?.status === "open");
const passed = await call(`${T}/vote`, { lawId: bill.id, value: true }, friend);
check("second vote passes it", passed.data.pendingLaw?.id === bill.id);
check("closed bill refuses votes", (await call(`${T}/vote`, { lawId: bill.id, value: false }, friend)).status === 409);

const rejectedBill = await call(`${T}/laws`, { text: "Everyone must wear a hat." }, friend);
const hatId = rejectedBill.data.laws.find((l) => l.status === "open").id;
const hatVote = await call(`${T}/vote`, { lawId: hatId, value: false }, host);
check("a split vote fails the bill", hatVote.data.laws.find((l) => l.id === hatId)?.status === "rejected");

// Real model call, with a concurrent double tap that must not pay twice.
const t0 = Date.now();
const [first, second] = await Promise.all([call(`${T}/next`, {}, host), call(`${T}/next`, {}, host)]);
const statuses = [first.status, second.status].sort();
check("double tap runs one day only", statuses[0] === 200 && statuses[1] === 409, statuses.join(","));
const day1 = first.status === 200 ? first.data : second.data;
check("day 1 played", day1.state?.day === 1, `${((Date.now() - t0) / 1000).toFixed(1)}s, treasury $${day1.state?.treasury}`);
check("pending law took effect", day1.state?.law?.text?.includes("litter") && day1.pendingLaw === null);
check("law terms parsed", day1.state?.law?.terms?.treasuryPaysPerUnit === 5, JSON.stringify(day1.state?.law?.terms?.unit));
const row = day1.days?.[1];
check("day has ledger, thoughts and paper", row?.ledger?.length > 0 && row?.thoughts?.length === 6 && Boolean(row?.paper?.headline), row?.paper?.headline);
await new Promise((r) => setTimeout(r, 1500));
check("realtime delivers town updates", events.some((e) => e.table === "towns"));

const treasuryAfterDay1 = day1.state.treasury;
const day2 = await call(`${T}/next`, {}, host);
check("day 2 played", day2.data.state?.day === 2, `treasury $${day2.data.state?.treasury}`);

// Rewind to the end of day 1, swap the law, and confirm history forks.
const rewound = await call(`${T}/rewind`, { day: 1 }, host);
check("rewind restores the old state", rewound.data.state?.day === 1 && rewound.data.state?.treasury === treasuryAfterDay1);
check("rewind starts a new timeline", rewound.data.town?.timeline === 2 && rewound.data.days?.length === 2);
const fix = await call(`${T}/laws`, { text: "The $5 litter bounty now only applies to litter found in the park." }, host);
const fixId = fix.data.laws.find((l) => l.status === "open").id;
const decreed = await call(`${T}/vote`, { lawId: fixId, decree: true }, host);
check("host can force a law through", decreed.data.pendingLaw?.decree === true);
const altDay = await call(`${T}/next`, {}, host);
check("new timeline plays under the new law", altDay.data.state?.day === 2 && altDay.data.state?.law?.text?.includes("park"), altDay.data.days?.[2]?.paper?.headline);

const resigned = await call(`${T}/resign`, {}, host);
const ending = resigned.data.endings?.find((e) => e.timeline === 2);
check("resign writes a final edition", resigned.data.state?.status === "resigned" && Boolean(ending?.headline), ending?.headline);
check("a finished run refuses new days", (await call(`${T}/next`, {}, host)).status === 409);
check("a finished run refuses new laws", (await call(`${T}/laws`, { text: "One more law please." }, host)).status === 409);

const page = await fetch(`${BASE}/card/${ending.id}`);
const html = await page.text();
check("card page renders with share metadata", page.status === 200 && html.includes("og:image") && html.includes("days"));
const img = await fetch(`${BASE}/api/card/${ending.id}`);
check("card image renders", img.status === 200 && img.headers.get("content-type") === "image/png", `${(await img.arrayBuffer()).byteLength} bytes`);
check("bad card id is 404", (await fetch(`${BASE}/api/card/not-a-real-id`)).status === 404);

const back = await call(`${T}/rewind`, { day: 0 }, host);
check("can rewind out of a finished run", back.data.state?.status === "active" && back.data.town?.timeline === 3);

await anon.removeChannel(channel);
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
console.log(`Town code: ${code}`);
process.exit(failures ? 1 : 0);
