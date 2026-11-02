import { NextResponse } from "next/server";
import { RULES } from "@/lib/game/types";
import {
  db,
  getTown,
  HttpError,
  loadSnapshot,
  lockTown,
  requireHost,
  route,
  unlockTown,
} from "@/lib/server";
import type { DayRow } from "@/lib/snapshot";

export const POST = route(async (req: Request, ctx: { params: Promise<{ code: string }> }) => {
  const { code } = await ctx.params;
  const town = await getTown(code);
  await requireHost(req, town);

  const body = await req.json().catch(() => ({}));
  const day = Number(body.day);
  if (!Number.isInteger(day) || day < 0) throw new HttpError(400, "Pick a day to rewind to.");
  if (town.timeline >= RULES.maxTimelines) throw new HttpError(409, "History can only take so many rewrites.");

  const locked = await lockTown(town);
  try {
    const client = db();
    const { data, error } = await client
      .from("days")
      .select("*")
      .eq("town_id", locked.id)
      .eq("timeline", locked.timeline)
      .lte("day", day)
      .order("day");
    if (error) throw error;
    const rows = (data ?? []) as DayRow[];
    const target = rows.find((r) => r.day === day);
    if (!target) throw new HttpError(404, "That day never happened in this timeline.");
    if (target.state.status !== "active") throw new HttpError(409, "That day is already the end. Pick an earlier one.");

    const timeline = locked.timeline + 1;
    const { error: copyError } = await client.from("days").insert(
      rows.map((r) => ({
        town_id: r.town_id,
        timeline,
        day: r.day,
        state: r.state,
        ledger: r.ledger,
        thoughts: r.thoughts,
        paper: r.paper,
        trust_changes: r.trust_changes,
        generated: false,
      })),
    );
    if (copyError) throw copyError;

    const { error: lawError } = await client
      .from("laws")
      .update({ status: "expired" })
      .eq("town_id", locked.id)
      .eq("status", "open");
    if (lawError) throw lawError;

    const { error: townError } = await client
      .from("towns")
      .update({ state: target.state, timeline, pending_law_id: null, busy_since: null })
      .eq("id", locked.id);
    if (townError) throw townError;
  } finally {
    await unlockTown(locked.id);
  }

  return NextResponse.json(await loadSnapshot(await getTown(code)));
});
