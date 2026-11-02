import { NextResponse } from "next/server";
import { db, getTown, HttpError, playerToken, route } from "@/lib/server";

const MAX_PLAYERS = 30;

export const POST = route(async (req: Request, ctx: { params: Promise<{ code: string }> }) => {
  const { code } = await ctx.params;
  const town = await getTown(code);
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 24);
  if (!name) throw new HttpError(400, "Tell us your name.");

  const client = db();
  const { count } = await client
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("town_id", town.id);
  if ((count ?? 0) >= MAX_PLAYERS) throw new HttpError(409, "This town is full.");

  const { data: player, error } = await client
    .from("players")
    .insert({ town_id: town.id, name })
    .select("id")
    .single();
  if (error) throw error;

  return NextResponse.json({
    code: town.code,
    identity: { id: player.id, token: playerToken(player.id), name },
  });
});
