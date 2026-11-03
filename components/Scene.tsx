"use client";

import { CITIZEN_IDS, CITIZENS, type CitizenId, type LedgerEntry, type TownState } from "@/lib/game/types";

export const SPOTS: Record<CitizenId, { x: number; y: number }> = {
  carol: { x: 205, y: 262 },
  mabel: { x: 500, y: 262 },
  bob: { x: 795, y: 262 },
  alice: { x: 195, y: 498 },
  gus: { x: 500, y: 510 },
  dee: { x: 805, y: 498 },
};

const COLORS: Record<CitizenId, string> = {
  alice: "#4f8a3c",
  bob: "#d99a1c",
  carol: "#3b5b92",
  dee: "#d9548f",
  gus: "#7a6a9c",
  mabel: "#c4412d",
};

/** Fixed scatter so litter stays in the same place between renders. */
const LITTER = Array.from({ length: 40 }, (_, i) => ({
  x: 40 + ((i * 137) % 320),
  y: 425 + ((i * 89) % 150),
  r: (i * 47) % 360,
}));

function Hat({ id }: { id: CitizenId }) {
  switch (id) {
    case "alice":
      return (
        <g>
          <ellipse cx="0" cy="-49" rx="19" ry="5" fill="#e8d48a" stroke="#1d2433" strokeWidth="2.5" />
          <path d="M-10 -50 Q0 -66 10 -50 Z" fill="#e8d48a" stroke="#1d2433" strokeWidth="2.5" />
        </g>
      );
    case "bob":
      return <path d="M-15 -49 Q0 -70 15 -49 L18 -46 L-18 -46 Z" fill="#f2c230" stroke="#1d2433" strokeWidth="2.5" />;
    case "carol":
      return (
        <g fill="none" stroke="#1d2433" strokeWidth="2.5">
          <circle cx="-6" cy="-38" r="5" fill="#fffaf0" />
          <circle cx="6" cy="-38" r="5" fill="#fffaf0" />
          <circle cx="0" cy="-58" r="6" fill="#3a2a22" />
        </g>
      );
    case "dee":
      return (
        <g>
          <path d="M-14 -44 Q-18 -62 0 -60 Q18 -62 14 -44 Q6 -54 -14 -44 Z" fill="#f08bbb" stroke="#1d2433" strokeWidth="2.5" />
          <rect x="17" y="-30" width="10" height="17" rx="2" fill="#1d2433" />
        </g>
      );
    case "gus":
      return (
        <g>
          <path d="M-14 -48 Q2 -70 16 -46 Q2 -52 -14 -48 Z" fill="#a897cc" stroke="#1d2433" strokeWidth="2.5" />
          <circle cx="18" cy="-44" r="4" fill="#fffaf0" stroke="#1d2433" strokeWidth="2" />
        </g>
      );
    case "mabel":
      return (
        <g>
          <rect x="-10" y="-68" width="20" height="20" fill="#1d2433" />
          <rect x="-16" y="-50" width="32" height="4" fill="#1d2433" />
          <rect x="-10" y="-54" width="20" height="4" fill="#c4412d" />
        </g>
      );
  }
}

function Citizen({
  id,
  stock,
  active,
  selected,
  onSelect,
}: {
  id: CitizenId;
  stock: number;
  active: boolean;
  selected: boolean;
  onSelect: (id: CitizenId) => void;
}) {
  const { x, y } = SPOTS[id];
  const crates = Math.min(5, Math.ceil(stock / 10));
  return (
    <g
      transform={`translate(${x} ${y}) scale(1.35)`}
      className="citizen"
      role="button"
      tabIndex={0}
      aria-label={`${CITIZENS[id].name}, see reasoning and transactions`}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(id);
        }
      }}
    >
      <circle cx="0" cy="-22" r="52" fill="transparent" />
      {selected && <ellipse cx="0" cy="4" rx="34" ry="10" fill="none" stroke="#c4412d" strokeWidth="4" strokeDasharray="6 5" />}
      <ellipse cx="0" cy="3" rx="22" ry="6" fill="#1d2433" opacity="0.2" />
      {Array.from({ length: crates }, (_, i) => (
        <rect
          key={i}
          x={26 + (i % 3) * 13}
          y={-10 - Math.floor(i / 3) * 12}
          width="12"
          height="12"
          fill="#c9a26b"
          stroke="#1d2433"
          strokeWidth="2"
        />
      ))}
      <g className={active ? "figure figure-active" : "figure"}>
        <path
          d="M-14 0 Q-17 -24 -10 -27 L10 -27 Q17 -24 14 0 Z"
          fill={COLORS[id]}
          stroke="#1d2433"
          strokeWidth="2.5"
        />
        <circle cx="0" cy="-38" r="12" fill="#f3d3ae" stroke="#1d2433" strokeWidth="2.5" />
        {id !== "carol" && (
          <g fill="#1d2433">
            <circle cx="-4" cy="-38" r="1.6" />
            <circle cx="4" cy="-38" r="1.6" />
          </g>
        )}
        <Hat id={id} />
      </g>
      <g transform="translate(0 26)">
        <rect
          x={-(CITIZENS[id].name.length * 5 + 8)}
          y="-14"
          width={CITIZENS[id].name.length * 10 + 16}
          height="21"
          rx="3"
          fill="#fffaf0"
          stroke="#1d2433"
          strokeWidth="2"
        />
        <text textAnchor="middle" fontSize="15" fontWeight="700" fill="#1d2433" fontFamily="var(--font-ui)">
          {CITIZENS[id].name}
        </text>
      </g>
    </g>
  );
}

const INK = { stroke: "#1d2433", strokeWidth: 3, strokeLinejoin: "round" as const };

export function Scene({
  state,
  active,
  selected,
  busy,
  onSelect,
}: {
  state: Pick<TownState, "treasury" | "publicStock" | "citizens">;
  active: LedgerEntry | null;
  selected: CitizenId | null;
  busy: boolean;
  onSelect: (id: CitizenId) => void;
}) {
  const litter = Math.min(LITTER.length, state.publicStock);
  const sack = 0.45 + Math.min(1, state.treasury / 1000) * 0.75;
  const smoking = active?.type === "produce";

  return (
    <svg viewBox="0 0 1000 600" className="scene" role="img" aria-label="Illustrated map of Loophole City and its six citizens">
      <rect width="1000" height="600" fill="#b9e0dc" />
      <path d="M0 150 Q250 110 500 140 T1000 130 V600 H0 Z" fill="#a9c97a" />
      <g fill="#fffaf0" opacity="0.85">
        <ellipse cx="330" cy="58" rx="46" ry="14" />
        <ellipse cx="360" cy="46" rx="30" ry="13" />
        <ellipse cx="670" cy="44" rx="38" ry="11" />
      </g>

      <path d="M-10 320 H1010 V385 H-10 Z" fill="#e7d8b4" />
      <path d="M-10 352 H1010" stroke="#fffaf0" strokeWidth="5" strokeDasharray="30 22" />
      <path d="M470 220 H530 V320 H470 Z" fill="#e7d8b4" />

      {/* Bank */}
      <g {...INK}>
        <rect x="95" y="118" width="210" height="112" fill="#e9e1cc" />
        <path d="M80 118 L200 62 L320 118 Z" fill="#f4ecdb" />
        {[120, 170, 220, 270].map((x) => (
          <rect key={x} x={x} y="128" width="16" height="102" fill="#fffaf0" />
        ))}
        <circle cx="200" cy="96" r="13" fill="#d99a1c" />
      </g>
      <text x="200" y="102" textAnchor="middle" fontSize="18" fontWeight="800" fill="#1d2433">$</text>

      {/* Town Hall */}
      <g {...INK}>
        <path d="M500 18 V-4" />
        <path d="M500 2 L532 12 L500 22 Z" fill="#c4412d" />
        <path d="M452 92 Q452 26 500 26 Q548 26 548 92 Z" fill="#7fb7b2" />
        <rect x="395" y="92" width="210" height="128" fill="#f4ecdb" />
        <path d="M382 92 H618 L605 76 H395 Z" fill="#e9e1cc" />
        <rect x="475" y="158" width="50" height="62" fill="#8b5a3c" />
        <circle cx="500" cy="124" r="19" fill="#fffaf0" />
        <path d="M500 124 V112 M500 124 L510 130" strokeWidth="2.5" />
        {[418, 440, 560, 582].map((x) => (
          <rect key={x} x={x - 7} y="108" width="14" height="112" fill="#fffaf0" />
        ))}
      </g>

      {/* The treasury shrinks as money leaves it */}
      <g transform={`translate(642 208) scale(${sack})`} className="sack">
        <path d="M-26 8 Q-34 -22 -9 -28 L-14 -40 H14 L9 -28 Q34 -22 26 8 Q0 18 -26 8 Z" fill="#d99a1c" {...INK} />
        <text y="0" textAnchor="middle" fontSize="24" fontWeight="800" fill="#1d2433">$</text>
      </g>

      {/* Factory */}
      <g {...INK}>
        <rect x="838" y="50" width="26" height="92" fill="#8a8f98" />
        <rect x="878" y="74" width="22" height="68" fill="#8a8f98" />
        <path d="M700 230 V132 L755 104 V132 L810 104 V132 L865 104 V132 L920 104 V230 Z" fill="#c9765a" />
        <rect x="725" y="168" width="48" height="62" fill="#5a3a30" />
        {[800, 860].map((x) => (
          <rect key={x} x={x} y="158" width="36" height="28" fill="#f2d98a" />
        ))}
      </g>
      <g className={smoking ? "smoke smoke-on" : "smoke"} fill="#fffaf0" opacity="0.85">
        <circle cx="851" cy="34" r="12" />
        <circle cx="866" cy="16" r="16" />
        <circle cx="889" cy="60" r="9" />
      </g>

      {/* Park */}
      <g {...INK}>
        <path d="M20 420 Q200 390 370 425 Q385 520 350 585 H30 Q0 500 20 420 Z" fill="#8fbb5e" />
        <rect x="62" y="445" width="12" height="44" fill="#7a5233" />
        <circle cx="68" cy="426" r="34" fill="#4f8a3c" />
        <rect x="322" y="452" width="10" height="36" fill="#7a5233" />
        <circle cx="327" cy="436" r="27" fill="#5f9b4a" />
        <path d="M108 540 H178 M116 540 V556 M170 540 V556 M108 528 H178" strokeWidth="5" />
      </g>
      {LITTER.slice(0, litter).map((p, i) => (
        <rect
          key={i}
          x={p.x}
          y={p.y}
          width="9"
          height="7"
          rx="1"
          fill={i % 3 === 0 ? "#c4412d" : i % 3 === 1 ? "#fffaf0" : "#3b5b92"}
          stroke="#1d2433"
          strokeWidth="1.5"
          transform={`rotate(${p.r} ${p.x} ${p.y})`}
        />
      ))}

      {/* Gus's hammock */}
      <g {...INK}>
        <path d="M415 448 V545 M585 448 V545" strokeWidth="9" stroke="#7a5233" />
        <path d="M415 470 Q500 545 585 470 Q500 514 415 470 Z" fill="#e8b4a0" />
      </g>

      {/* Dee's stage */}
      <g {...INK}>
        <rect x="705" y="510" width="245" height="44" fill="#6d4d8f" />
        <rect x="705" y="500" width="245" height="12" fill="#a897cc" />
        <circle cx="905" cy="442" r="34" fill="none" stroke="#fffaf0" strokeWidth="9" />
        <circle cx="905" cy="442" r="34" fill="none" />
        <path d="M905 476 V500" />
        <rect x="716" y="440" width="58" height="26" fill="#c4412d" />
      </g>
      <text x="745" y="459" textAnchor="middle" fontSize="16" fontWeight="800" fill="#fffaf0">LIVE</text>

      {CITIZEN_IDS.map((id) => (
        <Citizen
          key={id}
          id={id}
          stock={state.citizens[id].stock}
          active={busy || active?.citizen === id || active?.counterparty === id}
          selected={selected === id}
          onSelect={onSelect}
        />
      ))}
    </svg>
  );
}
