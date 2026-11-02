import { NextResponse } from "next/server";
import { CitizensRefused, planDay } from "@/lib/ai";
import { enactLaw, simulateDay } from "@/lib/game/engine";
import {
  checkBudget,
  db,
  getTown,
  HttpError,
  loadSnapshot,
  lockTown,
  requireHost,
  route,
  saveEnding,
  unlockTown,
} from "@/lib/server";

export const maxDuration = 180;

export const POST = route(async (req: Request, ctx: { params: Promise<{ code: string }> }) => {
  const { code } = await ctx.params;
  const town = await getTown(code);
  await requireHost(req, town);
  await checkBudget();

  const locked = await lockTown(town);
  try {
    if (locked.state.status !== "active") throw new HttpError(409, "This administration is over. Rewind first.");

    const client = db();
    let state = locked.state;
    const pendingId = locked.pending_law_id;
    if (pendingId) {
      const { data: law, error } = await client.from("laws").select("*").eq("id", pendingId).single();
      if (error) throw error;
      state = enactLaw(state, { id: law.id, text: law.text, proposer: law.proposer_name, decree: law.decree });
    }
    if (!state.law) throw new HttpError(409, "Pass a law first. The citizens need something to exploit.");

    let plan;
    try {
      plan = await planDay(state);
    } catch (err) {
      if (err instanceof CitizensRefused) throw new HttpError(422, err.message);
      console.error("planDay failed", err);
      throw new HttpError(502, "The citizens could not be reached. Press Next day to try again.");
    }

    const result = simulateDay(state, plan);

    const { error: dayError } = await client.from("days").insert({
      town_id: locked.id,
      timeline: locked.timeline,
      day: result.state.day,
      state: result.state,
      ledger: result.ledger,
      thoughts: result.thoughts,
      paper: result.paper,
      trust_changes: result.trustChanges,
      generated: true,
    });
    if (dayError) throw dayError;

    if (result.state.status !== "active") {
      await saveEnding(locked, locked.timeline, result.state, result.ledger);
    }

    const { error: townError } = await client
      .from("towns")
      .update({ state: result.state, busy_since: null })
      .eq("id", locked.id);
    if (townError) throw townError;

    // Filtered on the law we used, in case a newer one passed during the model call.
    if (pendingId) {
      await client
        .from("towns")
        .update({ pending_law_id: null })
        .eq("id", locked.id)
        .eq("pending_law_id", pendingId);
    }
  } finally {
    await unlockTown(locked.id);
  }

  return NextResponse.json(await loadSnapshot(await getTown(code)));
});
