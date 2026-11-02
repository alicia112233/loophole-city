import { NextResponse } from "next/server";
import type { TownState } from "@/lib/game/types";
import {
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
import type { DayRow } from "@/lib/snapshot";

export const maxDuration = 120;

export const POST = route(async (req: Request, ctx: { params: Promise<{ code: string }> }) => {
  const { code } = await ctx.params;
  const town = await getTown(code);
  await requireHost(req, town);

  const locked = await lockTown(town);
  try {
    if (locked.state.status !== "active") throw new HttpError(409, "This administration is already over.");

    const client = db();
    const state: TownState = { ...locked.state, status: "resigned" };
    const { data, error } = await client
      .from("days")
      .select("*")
      .eq("town_id", locked.id)
      .eq("timeline", locked.timeline)
      .eq("day", state.day)
      .single();
    if (error) throw error;
    const last = data as DayRow;

    await saveEnding(locked, locked.timeline, state, last.ledger);

    const { error: dayError } = await client.from("days").update({ state }).eq("id", last.id);
    if (dayError) throw dayError;
    const { error: townError } = await client
      .from("towns")
      .update({ state, pending_law_id: null, busy_since: null })
      .eq("id", locked.id);
    if (townError) throw townError;
  } finally {
    await unlockTown(locked.id);
  }

  return NextResponse.json(await loadSnapshot(await getTown(code)));
});
