import { describe, expect, it } from "vitest";
import { enactLaw, simulateDay } from "@/lib/game/engine";
import {
  CITIZEN_IDS,
  initialState,
  RULES,
  type DayPlan,
  type PlannedAction,
  type TownState,
} from "@/lib/game/types";

const act = (a: Partial<PlannedAction> & Pick<PlannedAction, "citizen" | "type">): PlannedAction => ({
  units: 0,
  counterparty: "none",
  price: 0,
  note: "",
  ...a,
});

const plan = (actions: PlannedAction[], over: Partial<DayPlan["law_terms"]> = {}): DayPlan => ({
  law_terms: {
    unit: "piece of litter",
    unit_plural: "pieces of litter",
    treasury_pays_per_unit: 5,
    citizen_pays_per_unit: 0,
    plain_english: "$5 per piece",
    ...over,
  },
  citizens: [],
  actions,
  headline: "Headline",
  subhead: "Subhead",
  mayor_quote: "Quote",
  town_mood: 0,
});

const withLaw = (state: TownState = initialState()) =>
  enactLaw(state, { id: "law", text: "$5 per litter", proposer: "You", decree: false });

const totalCash = (s: TownState) =>
  s.treasury + CITIZEN_IDS.reduce((sum, id) => sum + s.citizens[id].cash, 0);

describe("simulateDay", () => {
  it("plays the litter scheme through to a real treasury loss", () => {
    const { state, ledger } = simulateDay(
      withLaw(),
      plan([
        act({ citizen: "alice", type: "gather", units: 10 }),
        act({ citizen: "alice", type: "claim", units: 10 }),
        act({ citizen: "bob", type: "produce", units: 40 }),
        act({ citizen: "carol", type: "buy", units: 40, counterparty: "bob", price: 2 }),
        act({ citizen: "carol", type: "claim", units: 40 }),
      ]),
    );
    expect(ledger.filter((l) => !l.ok)).toEqual([]);
    expect(state.citizens.alice.cash).toBe(150);
    expect(state.citizens.bob.cash).toBe(200 - 40 + 80);
    expect(state.citizens.carol.cash).toBe(150 - 80 + 200);
    expect(state.treasury).toBe(1000 - 50 - 200 - RULES.upkeepPerDay);
    expect(state.day).toBe(1);
  });

  it("never creates money: only production and upkeep leave the system", () => {
    const before = withLaw();
    const { state } = simulateDay(
      before,
      plan([
        act({ citizen: "bob", type: "produce", units: 30 }),
        act({ citizen: "gus", type: "pay", counterparty: "dee", price: 50 }),
        act({ citizen: "carol", type: "buy", units: 10, counterparty: "bob", price: 3 }),
        act({ citizen: "carol", type: "claim", units: 10 }),
      ]),
    );
    expect(totalCash(state)).toBe(totalCash(before) - 30 - RULES.upkeepPerDay);
  });

  it("rejects actions a citizen cannot afford or does not hold stock for", () => {
    const { state, ledger } = simulateDay(
      withLaw(),
      plan([
        act({ citizen: "gus", type: "claim", units: 10 }),
        act({ citizen: "dee", type: "buy", units: 5, counterparty: "bob", price: 1 }),
        act({ citizen: "gus", type: "pay", counterparty: "gus", price: 10 }),
      ]),
    );
    expect(ledger.slice(0, 3).map((l) => l.ok)).toEqual([false, false, false]);
    expect(state.citizens.gus.cash).toBe(80);
    expect(state.treasury).toBe(1000 - RULES.upkeepPerDay);
  });

  it("caps oversized requests and claims the model tries to inflate", () => {
    const { state, ledger } = simulateDay(
      withLaw(),
      plan(
        [
          act({ citizen: "bob", type: "produce", units: 999999 }),
          act({ citizen: "bob", type: "claim", units: 999999 }),
        ],
        { treasury_pays_per_unit: 1000000 },
      ),
    );
    expect(ledger[0].stock).toBe(RULES.maxUnitsPerAction);
    expect(state.law?.terms?.treasuryPaysPerUnit).toBe(RULES.maxRatePerUnit);
    expect(state.treasury).toBe(0);
    expect(state.status).toBe("bankrupt");
  });

  it("limits each citizen to the daily action allowance", () => {
    const actions = Array.from({ length: 6 }, () => act({ citizen: "alice", type: "rest" }));
    const { ledger, state } = simulateDay(withLaw(), plan(actions));
    expect(ledger.filter((l) => l.citizen === "alice" && l.ok)).toHaveLength(RULES.maxActionsPerCitizen);
    expect(state.citizens.alice.rest).toBe(RULES.maxActionsPerCitizen);
  });

  it("ignores garbage numbers from the model", () => {
    const { state, ledger } = simulateDay(
      withLaw(),
      plan([
        act({ citizen: "bob", type: "produce", units: NaN }),
        act({ citizen: "carol", type: "pay", counterparty: "bob", price: -500 }),
      ]),
    );
    expect(ledger[0].ok).toBe(false);
    expect(ledger[1].ok).toBe(false);
    expect(state.citizens.bob.cash).toBe(200);
    expect(state.citizens.carol.cash).toBe(150);
  });

  it("keeps law terms fixed after the first day so the model cannot move the goalposts", () => {
    const first = simulateDay(withLaw(), plan([]));
    const second = simulateDay(first.state, plan([], { treasury_pays_per_unit: 99 }));
    expect(second.state.law?.terms?.treasuryPaysPerUnit).toBe(5);
  });

  it("wipes stock when a new law is about a different thing", () => {
    const day1 = simulateDay(withLaw(), plan([act({ citizen: "bob", type: "produce", units: 20 })]));
    expect(day1.state.citizens.bob.stock).toBe(20);
    const hats = enactLaw(day1.state, { id: "l2", text: "Hat tax", proposer: "You", decree: false });
    const day2 = simulateDay(hats, plan([], { unit: "hat", unit_plural: "hats" }));
    expect(day2.state.citizens.bob.stock).toBe(0);
    expect(day2.state.publicStock).toBe(RULES.startPublicStock);
  });

  it("keeps stock when a new law patches the same thing", () => {
    const day1 = simulateDay(withLaw(), plan([act({ citizen: "bob", type: "produce", units: 20 })]));
    const patch = enactLaw(day1.state, { id: "l2", text: "Park litter only", proposer: "You", decree: false });
    const day2 = simulateDay(patch, plan([]));
    expect(day2.state.citizens.bob.stock).toBe(20);
  });

  it("charges the trust cost of a decree only on its first day", () => {
    const decreed = enactLaw(initialState(), { id: "d", text: "Decree", proposer: "You", decree: true });
    const day1 = simulateDay(decreed, plan([]));
    expect(day1.state.trust).toBe(RULES.startTrust - RULES.decreeTrustCost);
    const day2 = simulateDay(day1.state, plan([]));
    expect(day2.state.trust).toBe(day1.state.trust);
  });

  it("ends the run when trust hits zero or the term is served", () => {
    const low = withLaw({ ...initialState(), trust: 2 });
    expect(simulateDay(low, { ...plan([]), town_mood: -6 }).state.status).toBe("ousted");
    const last = withLaw({ ...initialState(), day: RULES.termDays - 1 });
    expect(simulateDay(last, plan([])).state.status).toBe("term_complete");
  });

  it("clamps the mood the model reports", () => {
    expect(simulateDay(withLaw(), { ...plan([]), town_mood: 500 }).state.trust).toBe(RULES.startTrust + 3);
    expect(simulateDay(withLaw(), { ...plan([]), town_mood: -500 }).state.trust).toBe(RULES.startTrust - 6);
  });

  it("does not mutate the previous state, so rewinds stay intact", () => {
    const before = withLaw();
    const snapshot = structuredClone(before);
    simulateDay(before, plan([act({ citizen: "bob", type: "produce", units: 10 })]));
    expect(before).toEqual(snapshot);
  });

  it("gives identical results for identical input", () => {
    const p = plan([act({ citizen: "bob", type: "produce", units: 10 })]);
    expect(simulateDay(withLaw(), p).state).toEqual(simulateDay(withLaw(), p).state);
  });
});
