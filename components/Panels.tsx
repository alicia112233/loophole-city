"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { money } from "@/lib/client";
import { STATUS_LABEL } from "@/lib/game/engine";
import { CITIZENS, RULES, type CitizenId, type LedgerEntry, type TownState } from "@/lib/game/types";
import type { DayRow, EndingRow, Identity, LawRow, Snapshot } from "@/lib/snapshot";
import { Support } from "./Support";

const SUGGESTIONS = [
  "The town will pay $5 for every piece of litter collected.",
  "Anyone who plants a tree gets $20 from the treasury.",
  "A $10 tax on every hat worn in public.",
  "Citizens who report a crime receive a $50 reward.",
  "Anyone caught not smiling in public pays a $3 fine.",
];

export function Paper({ row }: { row: DayRow | null }) {
  if (!row?.paper) {
    return (
      <article className="paper paper-empty">
        <div className="masthead">The Daily Loophole</div>
        <p className="paper-sub">No news yet. Nothing has gone wrong because nothing has been attempted.</p>
      </article>
    );
  }
  return (
    <article className="paper" key={`${row.timeline}-${row.day}`}>
      <div className="masthead">The Daily Loophole</div>
      <div className="paper-meta">
        <span>Day {row.day}</span>
        <span>Price: one loophole</span>
      </div>
      <h2 className="paper-head">{row.paper.headline}</h2>
      <p className="paper-sub">{row.paper.subhead}</p>
      <blockquote className="paper-quote">
        {row.paper.mayorQuote}
        <cite>Mayor Mabel</cite>
      </blockquote>
      {row.trust_changes.length > 0 && (
        <ul className="trust-list" aria-label="Why public trust changed">
          {row.trust_changes.map((c, i) => (
            <li key={i}>
              <b className={c.amount < 0 ? "down" : "up"}>
                {c.amount > 0 ? "+" : ""}
                {c.amount} trust
              </b>{" "}
              {c.reason}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Entry({ entry, viewer }: { entry: LedgerEntry; viewer?: CitizenId }) {
  const who = entry.citizen === "town" ? "City Hall" : CITIZENS[entry.citizen].name;
  const cash = viewer && viewer === entry.counterparty ? entry.counterpartyCash : entry.cash;
  return (
    <li className={entry.ok ? "entry" : "entry entry-rejected"}>
      <div className="entry-line">
        <span className="entry-who">{who}</span>
        <span className="entry-text">{entry.text}</span>
        {cash !== 0 && (
          <span className={cash > 0 ? "delta up" : "delta down"}>
            {cash > 0 ? "+" : ""}
            {money(cash)}
          </span>
        )}
      </div>
      {entry.note && <div className="entry-note">{entry.note}</div>}
      {!entry.ok && <div className="entry-stamp">Rejected: {entry.reject}</div>}
    </li>
  );
}

export function Books({ row }: { row: DayRow | null }) {
  if (!row || row.ledger.length === 0) return null;
  return (
    <section className="panel">
      <h3>The books, day {row.day}</h3>
      <ul className="entries">
        {row.ledger.map((e, i) => (
          <Entry key={i} entry={e} />
        ))}
      </ul>
    </section>
  );
}

export function CitizenDrawer({
  id,
  state,
  row,
  onClose,
}: {
  id: CitizenId;
  state: TownState;
  row: DayRow | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const profile = CITIZENS[id];
  const c = state.citizens[id];
  const thought = row?.thoughts.find((t) => t.id === id);
  const entries = (row?.ledger ?? []).filter((e) => e.citizen === id || e.counterparty === id);
  const unit = state.law?.terms?.unitPlural ?? "units";

  return (
    <div className="drawer-wrap" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${profile.name}'s file`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="drawer-close" onClick={onClose} aria-label="Close" autoFocus>
          ×
        </button>
        <div className="file-tab">Confidential file</div>
        <h2>{profile.name}</h2>
        <p className="drawer-title">
          {profile.title} <span className={`motive motive-${profile.motive}`}>Motive: {profile.motive}</span>
        </p>
        <p className="drawer-bio">{profile.bio}</p>
        <dl className="drawer-stats">
          <div>
            <dt>Cash</dt>
            <dd>{money(c.cash)}</dd>
          </div>
          <div>
            <dt>Clout</dt>
            <dd>{c.clout}</dd>
          </div>
          <div>
            <dt>{unit}</dt>
            <dd>{c.stock}</dd>
          </div>
          <div>
            <dt>Rested</dt>
            <dd>{c.rest}</dd>
          </div>
        </dl>
        <h3>What they were thinking{row && row.day > 0 ? `, day ${row.day}` : ""}</h3>
        <p className="drawer-thought">{thought?.reasoning ?? "No scheme yet. Pass a law and give them something to work with."}</p>
        <h3>Their transactions</h3>
        {entries.length ? (
          <ul className="entries">
            {entries.map((e, i) => (
              <Entry key={i} entry={e} viewer={id} />
            ))}
          </ul>
        ) : (
          <p className="muted">Nothing on the books for this day.</p>
        )}
      </aside>
    </div>
  );
}

export function LawDesk({
  snap,
  me,
  act,
  working,
}: {
  snap: Snapshot;
  me: Identity;
  act: (path: string, body: unknown) => Promise<boolean>;
  working: boolean;
}) {
  const [text, setText] = useState("");
  const isHost = snap.players.find((p) => p.id === me.id)?.is_host ?? false;
  const open = snap.laws.filter((l) => l.status === "open");
  const ended = snap.state.status !== "active";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await act("laws", { text })) setText("");
  };

  const tally = (law: LawRow) => {
    const votes = snap.votes.filter((v) => v.law_id === law.id);
    return {
      yes: votes.filter((v) => v.value).length,
      no: votes.filter((v) => !v.value).length,
      mine: votes.find((v) => v.player_id === me.id)?.value,
    };
  };

  return (
    <section className="panel" aria-label="Law desk">
      <h3>{snap.state.law || snap.pendingLaw ? "Fix it with a new law" : "Write your first law"}</h3>
      {ended ? (
        <p className="muted">This administration is over. Rewind to a past day to try another law.</p>
      ) : (
        <form onSubmit={submit}>
          <textarea
            value={text}
            maxLength={200}
            rows={3}
            aria-label="Text of your law"
            placeholder="Be it enacted that…"
            onChange={(e) => setText(e.target.value)}
          />
          <div className="law-actions">
            <span className="muted count">{text.length}/200</span>
            <button className="btn btn-red" disabled={working || text.trim().length < 5}>
              Propose law
            </button>
          </div>
          {!snap.state.law && (
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button type="button" className="chip" key={s} onClick={() => setText(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </form>
      )}

      {open.length > 0 && (
        <ul className="bills">
          {open.map((law) => {
            const t = tally(law);
            return (
              <li key={law.id} className="bill">
                <p className="bill-text">{law.text}</p>
                <p className="muted">
                  Proposed by {law.proposer_name}. {t.yes} yes, {t.no} no, {snap.players.length} in town.
                </p>
                <div className="bill-actions">
                  <button
                    className={t.mine === true ? "btn btn-small btn-on" : "btn btn-small"}
                    disabled={working}
                    onClick={() => act("vote", { lawId: law.id, value: true })}
                  >
                    Aye
                  </button>
                  <button
                    className={t.mine === false ? "btn btn-small btn-on" : "btn btn-small"}
                    disabled={working}
                    onClick={() => act("vote", { lawId: law.id, value: false })}
                  >
                    Nay
                  </button>
                  {isHost && (
                    <button
                      className="btn btn-small btn-ghost"
                      disabled={working}
                      onClick={() => act("vote", { lawId: law.id, decree: true })}
                    >
                      Force it through ({RULES.decreeTrustCost} trust)
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function JoinCard({ code, players }: { code: string; players: Snapshot["players"] }) {
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(`${window.location.origin}/t/${code}`), [code]);
  return (
    <section className="panel join-card">
      <div>
        <h3>Friends vote from their phones</h3>
        <p className="join-code">{code}</p>
        <p className="muted">
          {players.length} in town: {players.map((p) => p.name).join(", ")}
        </p>
      </div>
      {url && (
        <div className="qr">
          <QRCodeSVG value={url} size={104} bgColor="#fffaf0" fgColor="#1d2433" title={`Join link for town ${code}`} />
        </div>
      )}
    </section>
  );
}

export function Timeline({
  days,
  viewing,
  isHost,
  working,
  onView,
  onRewind,
}: {
  days: DayRow[];
  viewing: number | null;
  isHost: boolean;
  working: boolean;
  onView: (day: number | null) => void;
  onRewind: (day: number) => void;
}) {
  const latest = days[days.length - 1]?.day ?? 0;
  const selected = viewing ?? latest;
  const row = days.find((d) => d.day === selected);
  const canRewind = isHost && row && row.state.status === "active" && selected !== latest;
  return (
    <section className="timeline" aria-label="Timeline">
      <div className="timeline-days">
        {days.map((d) => (
          <button
            key={d.day}
            className={d.day === selected ? "tick tick-on" : "tick"}
            aria-pressed={d.day === selected}
            onClick={() => onView(d.day === latest ? null : d.day)}
          >
            <span className="tick-day">{d.day === 0 ? "Start" : `Day ${d.day}`}</span>
            <span className="tick-money">{money(d.state.treasury)}</span>
          </button>
        ))}
      </div>
      {canRewind && (
        <button className="btn btn-teal" disabled={working} onClick={() => onRewind(selected)}>
          Rewind to {selected === 0 ? "the start" : `day ${selected}`} and change history
        </button>
      )}
    </section>
  );
}

export function PastRuns({ endings, current }: { endings: EndingRow[]; current: number }) {
  const past = endings.filter((e) => e.timeline !== current);
  if (!past.length) return null;
  return (
    <section className="panel">
      <h3>Other timelines</h3>
      <ul className="runs">
        {past.map((e) => (
          <li key={e.id}>
            <a href={`/card/${e.id}`}>
              <b>
                {e.days_lasted} {e.days_lasted === 1 ? "day" : "days"}
              </b>{" "}
              {STATUS_LABEL[e.status]}
              <span className="muted run-law">{e.law_text}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EndingOverlay({
  ending,
  days,
  isHost,
  working,
  onRewind,
  onClose,
}: {
  ending: EndingRow;
  days: DayRow[];
  isHost: boolean;
  working: boolean;
  onRewind: (day: number) => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const rewindable = days.filter((d) => d.state.status === "active");

  const share = async () => {
    const url = `${window.location.origin}/card/${ending.id}`;
    const text = `My administration lasted ${ending.days_lasted} ${ending.days_lasted === 1 ? "day" : "days"} in Loophole City.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Loophole City", text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setCopied(true);
      }
    } catch {
      // Closing the share sheet is not an error worth reporting.
    }
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Your administration has ended">
      <div className="overlay-inner">
        <button className="drawer-close" onClick={onClose} aria-label="Close and look around town">
          ×
        </button>
        <article className="paper paper-final">
          <div className="masthead">The Daily Loophole</div>
          <div className="paper-meta">
            <span>Final edition</span>
            <span>{STATUS_LABEL[ending.status]}</span>
          </div>
          <h2 className="paper-head">{ending.headline}</h2>
          <p className="paper-sub">{ending.subhead}</p>
          <div className="paper-story">
            {ending.story.split(/\n\s*\n/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </article>
        <div className="card-box">
          <ScoreCard ending={ending} />
          <div className="card-actions">
            <button className="btn btn-red" onClick={share}>
              {copied ? "Link copied" : "Share this card"}
            </button>
            <a className="btn" href={`/api/card/${ending.id}`} download="loophole-city.png">
              Save image
            </a>
          </div>
          {isHost && rewindable.length > 0 && (
            <div className="rewind-box">
              <h3>Change one law. Get a different disaster.</h3>
              <div className="chips">
                {rewindable.map((d) => (
                  <button key={d.day} className="chip chip-strong" disabled={working} onClick={() => onRewind(d.day)}>
                    Rewind to {d.day === 0 ? "the start" : `day ${d.day}`}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Support page="ending" />
        </div>
      </div>
    </div>
  );
}

export function ScoreCard({ ending }: { ending: EndingRow }) {
  return (
    <div className="score-card">
      <div className="score-kicker">Your administration lasted</div>
      <div className="score-days">
        {ending.days_lasted} <span>{ending.days_lasted === 1 ? "day" : "days"}</span>
      </div>
      <p className="score-epitaph">{ending.epitaph}</p>
      {ending.law_text && <p className="score-law">The law: “{ending.law_text}”</p>}
      <dl className="score-stats">
        <div>
          <dt>Treasury</dt>
          <dd>{money(ending.stats.treasury)}</dd>
        </div>
        <div>
          <dt>Trust</dt>
          <dd>{ending.stats.trust}</dd>
        </div>
        <div>
          <dt>Biggest winner</dt>
          <dd>
            {ending.stats.winner.name} {ending.stats.winner.gain >= 0 ? "+" : ""}
            {money(ending.stats.winner.gain)}
          </dd>
        </div>
      </dl>
      <div className="score-foot">Loophole City</div>
    </div>
  );
}