import { NextResponse } from "next/server";
import { db, getTown, HttpError, loadSnapshot, requirePlayer, route } from "@/lib/server";
import { settleLaw } from "@/lib/voting";

const MAX_OPEN = 8;

export const POST = route(async (req: Request, ctx: { params: Promise<{ code: string }> }) => {
  const { code } = await ctx.params;
  const town = await getTown(code);
  const player = await requirePlayer(req, town);
  if (town.state.status !== "active") throw new HttpError(409, "This administration is over. Rewind first.");

  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim().replace(/\s+/g, " ");
  if (text.length < 5) throw new HttpError(400, "That is not much of a law.");
  if (text.length > 200) throw new HttpError(400, "Keep it under 200 characters. Long laws have more loopholes.");

  const client = db();
  const { count } = await client
    .from("laws")
    .select("id", { count: "exact", head: true })
    .eq("town_id", town.id)
    .eq("status", "open");
  if ((count ?? 0) >= MAX_OPEN) throw new HttpError(409, "Too many bills on the table. Vote on some first.");

  const { data: law, error } = await client
    .from("laws")
    .insert({
      town_id: town.id,
      timeline: town.timeline,
      day: town.state.day,
      text,
      proposer_id: player.id,
      proposer_name: player.name,
    })
    .select("*")
    .single();
  if (error) throw error;

  // Proposing counts as a yes, so a solo player's law passes straight away.
  const { error: voteError } = await client
    .from("votes")
    .insert({ law_id: law.id, player_id: player.id, town_id: town.id, value: true });
  if (voteError) throw voteError;
  await settleLaw(town.id, law.id);

  return NextResponse.json(await loadSnapshot(await getTown(code)));
});
