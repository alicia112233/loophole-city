import {
  CITIZENS,
  CITIZEN_IDS,
  RULES,
  type CitizenId,
  type CitizenThought,
  type DayPlan,
  type DayResult,
  type LawTerms,
  type LedgerEntry,
  type PlannedAction,
  type TownState,
  type TrustChange,
} from "./types";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const whole = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 0);
const name = (id: CitizenId) => CITIZENS[id].name;
const money = (n: number) => `$${n.toLocaleString("en-US")}`;

export function sanitizeTerms(raw: DayPlan["law_terms"]): LawTerms {
  const unit = raw.unit.trim().slice(0, 40) || "thing";
  return {
    unit,
    unitPlural: raw.unit_plural.trim().slice(0, 40) || `${unit}s`,
    treasuryPaysPerUnit: clamp(whole(raw.treasury_pays_per_unit), 0, RULES.maxRatePerUnit),
    citizenPaysPerUnit: clamp(whole(raw.citizen_pays_per_unit), 0, RULES.maxRatePerUnit),
    plainEnglish: raw.plain_english.trim().slice(0, 160),
  };
}

type Tally = {
  actions: Partial<Record<CitizenId, number>>;
  stunts: Partial<Record<CitizenId, boolean>>;
  paidOut: number;
  levied: number;
  gathered: number;
  produced: number;
  dumps: number;
};

function blank(a: PlannedAction): LedgerEntry {
  return {
    citizen: a.citizen,
    type: a.type,
    ok: true,
    text: "",
    note: String(a.note ?? "").slice(0, 140),
    reject: null,
    counterparty: null,
    cash: 0,
    counterpartyCash: 0,
    stock: 0,
    clout: 0,
    treasury: 0,
  };
}

function rejected(entry: LedgerEntry, attempted: string, reason: string): LedgerEntry {
  return { ...entry, ok: false, text: attempted, reject: reason };
}

function applyAction(s: TownState, a: PlannedAction, terms: LawTerms, t: Tally): LedgerEntry {
  const entry = blank(a);
  const me = s.citizens[a.citizen];
  const plural = terms.unitPlural;
  const units = Math.min(whole(a.units), RULES.maxUnitsPerAction);
  const other = a.counterparty !== "none" && a.counterparty in s.citizens ? a.counterparty : null;

  const used = t.actions[a.citizen] ?? 0;
  if (used >= RULES.maxActionsPerCitizen) {
    return rejected(entry, `Tried a ${a.type} action`, "Out of actions for today");
  }
  t.actions[a.citizen] = used + 1;

  switch (a.type) {
    case "gather": {
      const got = Math.min(units, s.publicStock);
      if (units <= 0) return rejected(entry, `Tried to gather ${plural}`, "Gathered nothing");
      if (got <= 0) return rejected(entry, `Tried to gather ${plural}`, "None left in town");
      s.publicStock -= got;
      me.stock += got;
      t.gathered += got;
      const clout = Math.max(1, Math.floor(got / 10));
      me.clout = clamp(me.clout + clout, 0, 100);
      return { ...entry, text: `Gathered ${got} ${plural} around town`, stock: got, clout };
    }
    case "produce": {
      const afford = Math.floor(me.cash / RULES.produceCostPerUnit);
      const made = Math.min(units, afford);
      if (units <= 0) return rejected(entry, `Tried to make ${plural}`, "Made nothing");
      if (made <= 0) return rejected(entry, `Tried to make ${plural}`, "Could not afford materials");
      const cost = made * RULES.produceCostPerUnit;
      me.cash -= cost;
      me.stock += made;
      t.produced += made;
      return { ...entry, text: `Manufactured ${made} ${plural} for ${money(cost)}`, cash: -cost, stock: made };
    }
    case "dump": {
      const out = Math.min(units, me.stock);
      if (out <= 0) return rejected(entry, `Tried to dump ${plural}`, `Holding no ${plural}`);
      me.stock -= out;
      s.publicStock += out;
      t.dumps += 1;
      me.clout = clamp(me.clout - 2, 0, 100);
      return { ...entry, text: `Dumped ${out} ${plural} back into town`, stock: -out, clout: -2 };
    }
    case "buy": {
      if (!other || other === a.citizen) {
        return rejected(entry, `Tried to buy ${plural}`, "No valid seller");
      }
      const seller = s.citizens[other];
      const price = clamp(whole(a.price), 0, RULES.maxRatePerUnit);
      const afford = price > 0 ? Math.floor(me.cash / price) : units;
      const bought = Math.min(units, seller.stock, afford);
      const attempted = `Tried to buy ${plural} from ${name(other)}`;
      if (units <= 0) return rejected(entry, attempted, "Bought nothing");
      if (seller.stock <= 0) return rejected(entry, attempted, `${name(other)} has none to sell`);
      if (bought <= 0) return rejected(entry, attempted, "Could not afford it");
      const total = bought * price;
      me.cash -= total;
      me.stock += bought;
      seller.cash += total;
      seller.stock -= bought;
      return {
        ...entry,
        text: `Bought ${bought} ${plural} from ${name(other)} at ${money(price)} each (${money(total)})`,
        counterparty: other,
        cash: -total,
        counterpartyCash: total,
        stock: bought,
      };
    }
    case "claim": {
      const rate = terms.treasuryPaysPerUnit;
      const attempted = `Tried to claim the payout on ${plural}`;
      if (rate <= 0) return rejected(entry, attempted, "This law pays nothing");
      if (units <= 0) return rejected(entry, attempted, "Claimed nothing");
      if (me.stock <= 0) return rejected(entry, attempted, `Holding no ${plural}`);
      const payable = Math.floor(s.treasury / rate);
      if (payable <= 0) return rejected(entry, attempted, "The treasury is empty");
      const paid = Math.min(units, me.stock, payable);
      const total = paid * rate;
      me.stock -= paid;
      me.cash += total;
      s.treasury -= total;
      t.paidOut += total;
      return {
        ...entry,
        text: `Claimed ${money(total)} from the treasury for ${paid} ${plural}`,
        cash: total,
        stock: -paid,
        treasury: -total,
      };
    }
    case "pay_levy": {
      const rate = terms.citizenPaysPerUnit;
      const attempted = "Tried to pay what the law demands";
      if (rate <= 0) return rejected(entry, attempted, "This law charges nothing");
      if (units <= 0) return rejected(entry, attempted, "Paid nothing");
      const count = Math.min(units, Math.floor(me.cash / rate));
      if (count <= 0) return rejected(entry, attempted, "Could not afford it");
      const total = count * rate;
      me.cash -= total;
      s.treasury += total;
      t.levied += total;
      me.clout = clamp(me.clout + 1, 0, 100);
      return {
        ...entry,
        text: `Paid ${money(total)} to the treasury on ${count} ${plural}`,
        cash: -total,
        treasury: total,
        clout: 1,
      };
    }
    case "pay": {
      if (!other || other === a.citizen) {
        return rejected(entry, "Tried to pay someone", "No valid recipient");
      }
      const total = Math.min(clamp(whole(a.price), 0, 100000), me.cash);
      if (total <= 0) return rejected(entry, `Tried to pay ${name(other)}`, "Had no money to give");
      me.cash -= total;
      s.citizens[other].cash += total;
      return {
        ...entry,
        text: `Paid ${name(other)} ${money(total)}`,
        counterparty: other,
        cash: -total,
        counterpartyCash: total,
      };
    }
    case "stunt": {
      if (t.stunts[a.citizen]) return rejected(entry, "Tried a second publicity stunt", "One stunt per day");
      t.stunts[a.citizen] = true;
      me.clout = clamp(me.clout + 4, 0, 100);
      return { ...entry, text: "Pulled a publicity stunt", clout: 4 };
    }
    case "rest": {
      me.rest += 1;
      return { ...entry, text: "Did absolutely nothing, on purpose" };
    }
    default:
      return rejected(entry, "Tried something undefined", "Not a recognised action");
  }
}

function trustChangesFor(s: TownState, t: Tally, moodRaw: number, decreeToday: boolean): TrustChange[] {
  const changes: TrustChange[] = [];
  const add = (amount: number, reason: string) => {
    if (amount !== 0) changes.push({ amount, reason });
  };
  if (decreeToday) add(-RULES.decreeTrustCost, "You forced a law through without a vote");
  add(-Math.min(15, Math.floor(t.paidOut / 40)), `${money(t.paidOut)} left the treasury`);
  add(-Math.min(8, Math.floor(t.levied / 40)), `Citizens paid ${money(t.levied)} in charges`);
  add(-Math.min(6, Math.floor(t.produced / 15)), `${t.produced} units were manufactured to game the law`);
  add(-Math.min(8, t.dumps * 2), "People saw stuff being dumped back into town");
  add(Math.min(4, Math.floor(t.gathered / 10)), "Honest work was spotted");

  const wealth = CITIZEN_IDS.map((id) => s.citizens[id].cash);
  const total = wealth.reduce((a, b) => a + b, 0);
  if (total > 0 && Math.max(...wealth) / total > 0.45) add(-3, "One citizen now holds most of the money");

  add(clamp(whole(moodRaw), -6, 3), "The mood on the street");
  return changes;
}

function memoryLine(s: TownState, headline: string, ledger: LedgerEntry[]): string {
  const moves = ledger
    .filter((l) => l.ok && l.citizen !== "town" && l.type !== "rest")
    .map((l) => `${l.citizen}: ${l.text}`)
    .join("; ");
  return `Day ${s.day} (law: "${s.law?.text ?? "none"}"; treasury ${money(s.treasury)}, trust ${s.trust}). "${headline}". ${moves}`.slice(
    0,
    700,
  );
}

function thoughtsFrom(plan: DayPlan): CitizenThought[] {
  return CITIZEN_IDS.map((id) => {
    const found = plan.citizens.find((c) => c.id === id);
    return {
      id,
      reasoning: found?.reasoning.slice(0, 500) || "Stared at the law for a while and said nothing.",
      bubble: found?.bubble.slice(0, 70) || "…",
    };
  });
}

/**
 * Applies a model-proposed plan to a town. The plan is only a request: every
 * balance is checked here, so nothing the model writes can mint money or stock.
 */
export function simulateDay(prev: TownState, plan: DayPlan): DayResult {
  const s: TownState = structuredClone(prev);
  s.day += 1;

  if (s.law && !s.law.terms) {
    s.law.terms = sanitizeTerms(plan.law_terms);
    resetStockIfUnitChanged(s);
    s.lastUnit = s.law.terms.unit;
  }
  const terms: LawTerms = s.law?.terms ?? sanitizeTerms(plan.law_terms);

  const tally: Tally = {
    actions: {},
    stunts: {},
    paidOut: 0,
    levied: 0,
    gathered: 0,
    produced: 0,
    dumps: 0,
  };

  const ledger: LedgerEntry[] = plan.actions
    .slice(0, RULES.maxActionsPerDay)
    .filter((a) => a.citizen in s.citizens)
    .map((a) => applyAction(s, a, terms, tally));

  const upkeep = Math.min(RULES.upkeepPerDay, s.treasury);
  s.treasury -= upkeep;
  if (upkeep > 0) {
    ledger.push({
      citizen: "town",
      type: "upkeep",
      ok: true,
      text: `City upkeep cost ${money(upkeep)}`,
      note: "",
      reject: null,
      counterparty: null,
      cash: 0,
      counterpartyCash: 0,
      stock: 0,
      clout: 0,
      treasury: -upkeep,
    });
  }

  const decreeToday = Boolean(s.law?.decree && s.law.enactedDay === s.day);
  const trustChanges = trustChangesFor(s, tally, plan.town_mood, decreeToday);
  s.trust = clamp(s.trust + trustChanges.reduce((sum, c) => sum + c.amount, 0), 0, 100);

  if (s.treasury <= 0) s.status = "bankrupt";
  else if (s.trust <= 0) s.status = "ousted";
  else if (s.day >= RULES.termDays) s.status = "term_complete";

  const paper = {
    headline: plan.headline.slice(0, 140),
    subhead: plan.subhead.slice(0, 220),
    mayorQuote: plan.mayor_quote.slice(0, 220),
  };

  s.memory = [...s.memory, memoryLine(s, paper.headline, ledger)].slice(-4);

  return { state: s, ledger, thoughts: thoughtsFrom(plan), paper, trustChanges };
}

/** A new law about a different thing starts a fresh market: old stock is worthless. */
function resetStockIfUnitChanged(s: TownState) {
  const before = s.lastUnit;
  const now = s.law?.terms?.unit;
  if (!before || !now || before.toLowerCase() === now.toLowerCase()) return;
  for (const id of CITIZEN_IDS) s.citizens[id].stock = 0;
  s.publicStock = RULES.startPublicStock;
}

/** Puts a passed law into force on the coming day. */
export function enactLaw(
  state: TownState,
  law: { id: string; text: string; proposer: string; decree: boolean },
): TownState {
  return { ...state, law: { ...law, enactedDay: state.day + 1, terms: null } };
}

export const STATUS_LABEL: Record<TownState["status"], string> = {
  active: "In office",
  bankrupt: "Treasury collapsed",
  ousted: "Run out of town",
  term_complete: "Survived the full term",
  resigned: "Resigned in disgrace",
};

export type EndingStats = {
  days: number;
  treasury: number;
  trust: number;
  winner: { id: CitizenId; name: string; gain: number };
  loser: { id: CitizenId; name: string; gain: number };
};

export function endingStats(state: TownState): EndingStats {
  const gains = CITIZEN_IDS.map((id) => ({
    id,
    name: CITIZENS[id].name,
    gain: state.citizens[id].cash - CITIZENS[id].startCash,
  })).sort((a, b) => b.gain - a.gain);
  return {
    days: state.day,
    treasury: state.treasury,
    trust: state.trust,
    winner: gains[0],
    loser: gains[gains.length - 1],
  };
}
