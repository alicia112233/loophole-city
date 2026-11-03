"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadIdentity, money, post, realtimeClient, saveIdentity } from "@/lib/client";
import { CITIZENS, CITIZEN_IDS, RULES, type CitizenId, type LedgerEntry, type TownState } from "@/lib/game/types";
import type { DayRow, Identity, Snapshot } from "@/lib/snapshot";
import { CitizenDrawer, Books, EndingOverlay, JoinCard, LawDesk, Paper, PastRuns, Timeline } from "./Panels";
import { Scene, SPOTS } from "./Scene";

const STEP_MS = 850;

const SCHEMING = [
  "The citizens are reading your law very carefully…",
  "Carol has found a footnote…",
  "Bob is pricing up a second factory…",
  "Mayor Mabel is drafting a victory speech…",
  "Dee is going live about it…",
  "Gus is paying someone to read it for him…",
];

type Playback = { row: DayRow; prev: TownState; index: number };

/** Replays the ledger up to `index`, so the numbers move as each event appears. */
function stateAtStep(prev: TownState, ledger: LedgerEntry[], index: number) {
  const s = structuredClone(prev);
  for (const e of ledger.slice(0, index + 1)) {
    if (!e.ok) continue;
    s.treasury += e.treasury;
    if (e.citizen === "town") continue;
    const c = s.citizens[e.citizen];
    c.cash += e.cash;
    c.stock += e.stock;
    c.clout += e.clout;
    if (e.counterparty) {
      s.citizens[e.counterparty].cash += e.counterpartyCash;
      if (e.type === "buy") s.citizens[e.counterparty].stock -= e.stock;
    }
    if (e.type === "gather" || e.type === "dump") s.publicStock -= e.stock;
  }
  return s;
}

function deltaLabel(e: LedgerEntry) {
  if (!e.ok) return "Rejected";
  if (e.treasury < 0 && e.citizen !== "town") return `+${money(-e.treasury)} from treasury`;
  if (e.cash !== 0) return `${e.cash > 0 ? "+" : ""}${money(e.cash)}`;
  if (e.stock !== 0) return `${e.stock > 0 ? "+" : ""}${e.stock} stuff`;
  if (e.clout !== 0) return `${e.clout > 0 ? "+" : ""}${e.clout} clout`;
  return "";
}

function JoinGate({ code, onJoined }: { code: string; onJoined: (i: Identity) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  return (
    <main className="center-page">
      <form
        className="gate"
        onSubmit={async (e) => {
          e.preventDefault();
          setWorking(true);
          setError(null);
          try {
            const out = await post<{ identity: Identity }>(`/api/towns/${code}/join`, { name });
            saveIdentity(code, out.identity);
            onJoined(out.identity);
          } catch (err) {
            setError((err as Error).message);
            setWorking(false);
          }
        }}
      >
        <div className="masthead">Loophole City</div>
        <p>You have been called to serve on the town council of {code}.</p>
        <label htmlFor="join-name">Your name</label>
        <input id="join-name" value={name} maxLength={24} autoFocus onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-red" disabled={working || !name.trim()}>
          {working ? "Swearing you in…" : "Take your seat"}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </main>
  );
}

export function Game({ code }: { code: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [me, setMe] = useState<Identity | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [selected, setSelected] = useState<CitizenId | null>(null);
  const [viewDay, setViewDay] = useState<number | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [schemeLine, setSchemeLine] = useState(0);
  const lastSeen = useRef<{ timeline: number; day: number; row: DayRow } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/towns/${code}`, { cache: "no-store" });
    if (res.status === 404) {
      setFatal("There is no town with that code.");
      return;
    }
    if (res.ok) setSnap(await res.json());
  }, [code]);

  useEffect(() => {
    setMe(loadIdentity(code));
    setReady(true);
    refresh();
  }, [code, refresh]);

  const townId = snap?.town.id;
  useEffect(() => {
    if (!townId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 150);
    };
    const client = realtimeClient();
    const channel = client
      ?.channel(`town-${townId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "towns", filter: `id=eq.${townId}` }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `town_id=eq.${townId}` }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "laws", filter: `town_id=eq.${townId}` }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "votes", filter: `town_id=eq.${townId}` }, debounced)
      .subscribe();
    // Polling is the safety net if a venue's Wi-Fi blocks websockets.
    const poll = setInterval(refresh, 8000);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      if (channel) client?.removeChannel(channel);
    };
  }, [townId, refresh]);

  // A new day arrived: play it out for everyone in town.
  useEffect(() => {
    if (!snap) return;
    const row = snap.days[snap.days.length - 1];
    if (!row) return;
    const seen = lastSeen.current;
    lastSeen.current = { timeline: snap.town.timeline, day: row.day, row };
    if (!seen) return;
    if (seen.timeline !== snap.town.timeline) {
      setViewDay(null);
      setPlayback(null);
      return;
    }
    if (row.day > seen.day) {
      setViewDay(null);
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!calm) setPlayback({ row, prev: seen.row.state, index: 0 });
    }
  }, [snap]);

  useEffect(() => {
    if (!playback) return;
    const timer = setTimeout(() => {
      setPlayback((p) => {
        if (!p) return p;
        return p.index + 1 >= p.row.ledger.length ? null : { ...p, index: p.index + 1 };
      });
    }, STEP_MS);
    return () => clearTimeout(timer);
  }, [playback]);

  const busy = snap?.town.busy ?? false;
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setSchemeLine((n) => (n + 1) % SCHEMING.length), 2600);
    return () => clearInterval(timer);
  }, [busy]);

  const act = useCallback(
    async (action: string, body: unknown) => {
      setWorking(true);
      setError(null);
      try {
        setSnap(await post(`/api/towns/${code}/${action}`, body, me));
        return true;
      } catch (err) {
        setError((err as Error).message);
        refresh();
        return false;
      } finally {
        setWorking(false);
      }
    },
    [code, me, refresh],
  );

  const closeDrawer = useCallback(() => setSelected(null), []);

  const rewind = useCallback(
    async (day: number) => {
      setDismissed(null);
      await act("rewind", { day });
    },
    [act],
  );

  const latestRow = snap?.days[snap.days.length - 1] ?? null;
  const shownRow = useMemo(() => {
    if (!snap) return null;
    if (viewDay !== null) return snap.days.find((d) => d.day === viewDay) ?? latestRow;
    return latestRow;
  }, [snap, viewDay, latestRow]);

  if (fatal) {
    return (
      <main className="center-page">
        <div className="gate">
          <div className="masthead">Loophole City</div>
          <p>{fatal}</p>
          <a className="btn" href="/">Back to the town gates</a>
        </div>
      </main>
    );
  }
  if (!snap || !ready) {
    return (
      <main className="center-page">
        <p className="muted" role="status">Opening Town Hall…</p>
      </main>
    );
  }
  if (!me) return <JoinGate code={code} onJoined={setMe} />;

  const baseState = viewDay !== null && shownRow ? shownRow.state : snap.state;
  const liveState = playback ? stateAtStep(playback.prev, playback.row.ledger, playback.index) : baseState;
  const activeEntry = playback ? playback.row.ledger[playback.index] : null;
  const activeThought =
    activeEntry && activeEntry.citizen !== "town" && playback
      ? playback.row.thoughts.find((t) => t.id === activeEntry.citizen)
      : null;
  const firstForCitizen =
    playback && activeEntry
      ? playback.row.ledger.findIndex((e) => e.citizen === activeEntry.citizen) === playback.index
      : false;

  const player = snap.players.find((p) => p.id === me.id);
  const isHost = player?.is_host ?? false;
  const host = snap.players.find((p) => p.is_host);
  const law = baseState.law;
  const terms = law?.terms;
  const ended = snap.state.status !== "active";
  const ending = snap.endings.find((e) => e.timeline === snap.town.timeline) ?? null;
  const canAdvance = !ended && !busy && !working && !playback && Boolean(snap.state.law || snap.pendingLaw);
  const showEnding = ended && ending && !playback && dismissed !== snap.town.timeline && viewDay === null;
  const paperRow = playback ? snap.days.find((d) => d.day === playback.row.day - 1) ?? null : shownRow;

  const treasuryPct = Math.max(0, Math.min(100, (liveState.treasury / RULES.startTreasury) * 100));
  const spot = activeEntry && activeEntry.citizen !== "town" ? SPOTS[activeEntry.citizen] : null;
  const edge = spot ? (spot.x < 300 ? "left" : spot.x > 700 ? "right" : "mid") : "mid";

  return (
    <div className="game">
      <header className="topbar">
        <a className="brand" href="/">Loophole City</a>
        <div className="topbar-meta">
          {snap.town.timeline > 1 && <span className="tag tag-teal">Timeline {snap.town.timeline}</span>}
          <span className="tag">
            {playback ? `Day ${playback.row.day}` : liveState.day === 0 ? "Before day 1" : `Day ${liveState.day}`} of {RULES.termDays}
          </span>
          <span className="tag">Town {snap.town.code}</span>
        </div>
      </header>

      <section className="stats" aria-label="Town status">
        <div className="stat">
          <div className="stat-label">Treasury</div>
          <div className={treasuryPct < 25 ? "stat-value danger" : "stat-value"}>{money(liveState.treasury)}</div>
          <div className="meter"><span className="meter-gold" style={{ width: `${treasuryPct}%` }} /></div>
        </div>
        <div className="stat">
          <div className="stat-label">Public trust</div>
          <div className={liveState.trust < 25 ? "stat-value danger" : "stat-value"}>{liveState.trust}</div>
          <div className="meter"><span className="meter-teal" style={{ width: `${liveState.trust}%` }} /></div>
        </div>
        <div className="stat stat-law">
          <div className="stat-label">Law in force</div>
          {law ? (
            <>
              <p className="law-text">“{law.text}”</p>
              {terms && (
                <p className="muted law-terms">
                  {terms.treasuryPaysPerUnit > 0 && `Town pays ${money(terms.treasuryPaysPerUnit)} per ${terms.unit}. `}
                  {terms.citizenPaysPerUnit > 0 && `Citizens owe ${money(terms.citizenPaysPerUnit)} per ${terms.unit}.`}
                </p>
              )}
            </>
          ) : (
            <p className="muted law-text">None. The town is suspiciously calm.</p>
          )}
          {snap.pendingLaw && viewDay === null && !ended && (
            <p className="pending">
              <b>Starts next day:</b> “{snap.pendingLaw.text}”{snap.pendingLaw.decree ? " (by decree)" : ""}
            </p>
          )}
        </div>
      </section>

      <div className="layout">
        <div className="main-col">
          <div className="stage">
            <Scene
              state={liveState}
              active={activeEntry}
              selected={selected}
              busy={busy}
              onSelect={setSelected}
            />
            {activeEntry && spot && (
              <div
                key={playback?.index}
                className={`bubble bubble-${edge}${activeEntry.ok ? "" : " bubble-rejected"}`}
                style={{ left: `${spot.x / 10}%`, top: `${(spot.y - 100) / 6}%` }}
              >
                <p>{firstForCitizen && activeThought ? activeThought.bubble : activeEntry.note || activeEntry.text}</p>
                {deltaLabel(activeEntry) && <b>{deltaLabel(activeEntry)}</b>}
              </div>
            )}
            {playback && (
              <button className="btn btn-small skip" onClick={() => setPlayback(null)}>
                Skip to the news
              </button>
            )}
            {busy && (
              <div className="scheming" role="status">
                <span className="dots" aria-hidden="true"><i /><i /><i /></span>
                {SCHEMING[schemeLine]}
              </div>
            )}
          </div>

          <div className="citizen-row">
            {CITIZEN_IDS.map((id) => (
              <button key={id} className="citizen-chip" onClick={() => setSelected(id)}>
                <span className="citizen-chip-name">{CITIZENS[id].name}</span>
                <span className="citizen-chip-cash">{money(liveState.citizens[id].cash)}</span>
              </button>
            ))}
          </div>

          <div className="controls">
            {isHost ? (
              <button
                className="btn btn-red btn-big"
                disabled={!canAdvance}
                onClick={() => act("next", {})}
              >
                {busy
                  ? "Citizens scheming…"
                  : ended
                    ? "Administration over"
                    : !snap.state.law && !snap.pendingLaw
                      ? "Pass a law to begin"
                      : "Next day ▸"}
              </button>
            ) : (
              <p className="muted">
                {busy ? "The citizens are scheming." : `${host?.name ?? "The host"} presses Next day. You propose and vote.`}
              </p>
            )}
            {isHost && !ended && snap.state.day > 0 && (
              <button className="btn btn-ghost" disabled={busy || working || Boolean(playback)} onClick={() => act("resign", {})}>
                Resign in disgrace
              </button>
            )}
            {ended && ending && !showEnding && (
              <button className="btn" onClick={() => { setDismissed(null); setViewDay(null); }}>
                See the final edition
              </button>
            )}
          </div>
          {error && <p className="error" role="alert">{error}</p>}

          <Timeline
            days={snap.days}
            viewing={viewDay}
            isHost={isHost}
            working={working || busy}
            onView={setViewDay}
            onRewind={rewind}
          />

          <Paper row={paperRow} />
        </div>

        <aside className="side-col">
          <LawDesk snap={snap} me={me} act={act} working={working} />
          {isHost && <JoinCard code={snap.town.code} players={snap.players} />}
          <Books row={playback ? null : shownRow} />
          <PastRuns endings={snap.endings} current={snap.town.timeline} />
        </aside>
      </div>

      {selected && (
        <CitizenDrawer
          id={selected}
          state={liveState}
          row={playback ? playback.row : shownRow}
          onClose={closeDrawer}
        />
      )}

      {showEnding && ending && (
        <EndingOverlay
          ending={ending}
          days={snap.days}
          isHost={isHost}
          working={working}
          onRewind={rewind}
          onClose={() => setDismissed(snap.town.timeline)}
        />
      )}
    </div>
  );
}
