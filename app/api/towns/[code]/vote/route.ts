import { NextResponse } from "next/server";
import { db, getTown, HttpError, loadSnapshot, requireHost, requirePlayer, route } from "@/lib/server";
import { decreeLaw, settleLaw } from "@/lib/voting";

export const POST = route(async (req: Request, ctx: { params: Promise<{ code: string }> }) => {
  const { code } = await ctx.params;
  const town = await getTown(code);
  const body = await req.json().catch(() => ({}));
  const lawId = String(body.lawId ?? "");

  const { data: law, error } = await db()
    .from("laws")
    .select("id, status")
    .eq("id", lawId)
    .eq("town_id", town.id)
    .maybeSingle();
  if (error?.code === "22P02") throw new HttpError(404, "No such bill.");
  if (error) throw error;
  if (!law) throw new HttpError(404, "No such bill.");
  if (law.status !== "open") throw new HttpError(409, "Voting on that bill has closed.");

  if (body.decree === true) {
    await requireHost(req, town);
    await decreeLaw(town.id, lawId);
  } else {
    const player = await requirePlayer(req, town);
    if (typeof body.value !== "boolean") throw new HttpError(400, "Vote yes or no.");
    const { error: voteError } = await db()
      .from("votes")
      .upsert({ law_id: lawId, player_id: player.id, town_id: town.id, value: body.value });
    if (voteError) throw voteError;
    await settleLaw(town.id, lawId);
  }

  return NextResponse.json(await loadSnapshot(await getTown(code)));
});
