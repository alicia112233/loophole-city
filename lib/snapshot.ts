import type { CitizenThought, LedgerEntry, Paper, TownState, TrustChange } from "./game/types";
import type { EndingStats } from "./game/engine";

export type TownRow = {
  id: string;
  code: string;
  timeline: number;
  state: TownState;
  pending_law_id: string | null;
  busy_since: string | null;
};

export type PlayerRow = { id: string; town_id: string; name: string; is_host: boolean };

export type LawRow = {
  id: string;
  town_id: string;
  timeline: number;
  day: number;
  text: string;
  proposer_id: string | null;
  proposer_name: string;
  status: "open" | "enacted" | "rejected" | "expired";
  decree: boolean;
};

export type VoteRow = { law_id: string; player_id: string; value: boolean };

export type DayRow = {
  id: number;
  town_id: string;
  timeline: number;
  day: number;
  state: TownState;
  ledger: LedgerEntry[];
  thoughts: CitizenThought[];
  paper: Paper | null;
  trust_changes: TrustChange[];
};

export type EndingRow = {
  id: string;
  town_id: string;
  timeline: number;
  days_lasted: number;
  status: TownState["status"];
  law_text: string | null;
  headline: string;
  subhead: string;
  story: string;
  epitaph: string;
  stats: EndingStats;
};

export type Snapshot = {
  town: { id: string; code: string; timeline: number; busy: boolean };
  state: TownState;
  pendingLaw: LawRow | null;
  players: PlayerRow[];
  laws: LawRow[];
  votes: VoteRow[];
  days: DayRow[];
  endings: EndingRow[];
  viewerId: string | null;
};

export type Identity = { id: string; token: string; name: string };
