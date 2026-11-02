export const CITIZEN_IDS = ["alice", "bob", "carol", "dee", "gus", "mabel"] as const;
export type CitizenId = (typeof CITIZEN_IDS)[number];
export type Motive = "money" | "popularity" | "leisure";

export const ACTION_TYPES = [
  "gather",
  "produce",
  "dump",
  "buy",
  "claim",
  "pay_levy",
  "pay",
  "stunt",
  "rest",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export type CitizenProfile = {
  name: string;
  title: string;
  motive: Motive;
  bio: string;
  startCash: number;
  startClout: number;
};

export const CITIZENS: Record<CitizenId, CitizenProfile> = {
  alice: {
    name: "Alice",
    title: "Park regular",
    motive: "leisure",
    bio: "Wants a quiet town and a clean bench to read on. Follows the spirit of every law, and resents having to.",
    startCash: 100,
    startClout: 30,
  },
  bob: {
    name: "Bob",
    title: "Factory owner",
    motive: "money",
    bio: "Sees every problem as a production line. If the town pays for something, Bob will manufacture it at scale.",
    startCash: 200,
    startClout: 15,
  },
  carol: {
    name: "Carol",
    title: "Accountant",
    motive: "money",
    bio: "Reads the small print for fun. Never breaks a rule, only stands very close to it with a spreadsheet.",
    startCash: 150,
    startClout: 20,
  },
  dee: {
    name: "Dee",
    title: "Local influencer",
    motive: "popularity",
    bio: "Would do anything for content. Turns every law into a challenge, a trend, or a sponsored apology.",
    startCash: 60,
    startClout: 45,
  },
  gus: {
    name: "Gus",
    title: "Professional napper",
    motive: "leisure",
    bio: "Will spend three hours finding a way to avoid ten minutes of effort. Pays others to comply on his behalf.",
    startCash: 80,
    startClout: 10,
  },
  mabel: {
    name: "Mayor Mabel",
    title: "Your figurehead",
    motive: "popularity",
    bio: "Signs whatever you pass and takes credit for whatever happens. Has never met a statistic she could not improve.",
    startCash: 120,
    startClout: 50,
  },
};

export const RULES = {
  startTreasury: 1000,
  startTrust: 60,
  startPublicStock: 40,
  upkeepPerDay: 25,
  produceCostPerUnit: 1,
  termDays: 15,
  maxActionsPerCitizen: 3,
  maxActionsPerDay: 18,
  maxUnitsPerAction: 40,
  maxRatePerUnit: 100,
  maxTimelines: 12,
  decreeTrustCost: 5,
} as const;

export type LawTerms = {
  unit: string;
  unitPlural: string;
  treasuryPaysPerUnit: number;
  citizenPaysPerUnit: number;
  plainEnglish: string;
};

export type Law = {
  id: string | null;
  text: string;
  proposer: string;
  decree: boolean;
  enactedDay: number;
  terms: LawTerms | null;
};

export type CitizenState = {
  cash: number;
  clout: number;
  stock: number;
  rest: number;
};

export type TownStatus = "active" | "bankrupt" | "ousted" | "term_complete" | "resigned";

export type TownState = {
  day: number;
  treasury: number;
  trust: number;
  publicStock: number;
  citizens: Record<CitizenId, CitizenState>;
  law: Law | null;
  lastUnit: string | null;
  status: TownStatus;
  memory: string[];
};

export type PlannedAction = {
  citizen: CitizenId;
  type: ActionType;
  units: number;
  counterparty: CitizenId | "none";
  price: number;
  note: string;
};

export type DayPlan = {
  law_terms: {
    unit: string;
    unit_plural: string;
    treasury_pays_per_unit: number;
    citizen_pays_per_unit: number;
    plain_english: string;
  };
  citizens: { id: CitizenId; reasoning: string; bubble: string }[];
  actions: PlannedAction[];
  headline: string;
  subhead: string;
  mayor_quote: string;
  town_mood: number;
};

export type LedgerEntry = {
  citizen: CitizenId | "town";
  type: ActionType | "upkeep";
  ok: boolean;
  text: string;
  note: string;
  reject: string | null;
  counterparty: CitizenId | null;
  cash: number;
  counterpartyCash: number;
  stock: number;
  clout: number;
  treasury: number;
};

export type TrustChange = { amount: number; reason: string };

export type CitizenThought = { id: CitizenId; reasoning: string; bubble: string };

export type Paper = { headline: string; subhead: string; mayorQuote: string };

export type DayResult = {
  state: TownState;
  ledger: LedgerEntry[];
  thoughts: CitizenThought[];
  paper: Paper;
  trustChanges: TrustChange[];
};

export function initialState(): TownState {
  const citizens = {} as Record<CitizenId, CitizenState>;
  for (const id of CITIZEN_IDS) {
    citizens[id] = {
      cash: CITIZENS[id].startCash,
      clout: CITIZENS[id].startClout,
      stock: 0,
      rest: 0,
    };
  }
  return {
    day: 0,
    treasury: RULES.startTreasury,
    trust: RULES.startTrust,
    publicStock: RULES.startPublicStock,
    citizens,
    law: null,
    lastUnit: null,
    status: "active",
    memory: [],
  };
}
