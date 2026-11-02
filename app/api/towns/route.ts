import { NextResponse } from "next/server";
import { initialState } from "@/lib/game/types";
import { db, HttpError, playerToken, route } from "@/lib/server";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";

function randomCode() {
  return Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
}

export const POST = route(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 24);
  if (!name) throw new HttpError(400, "Tell us your name.");

  const client = db();
  const state = initialState();

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: town, error } = await client
      .from("towns")
      .insert({ code: randomCode(), state })
      .select("id, code")
      .single();
    if (error?.code === "23505") continue;
    if (error) throw error;

    const { data: player, error: playerError } = await client
      .from("players")
      .insert({ town_id: town.id, name, is_host: true })
      .select("id")
      .single();
    if (playerError) throw playerError;

    const { error: dayError } = await client
      .from("days")
      .insert({ town_id: town.id, timeline: 1, day: 0, state });
    if (dayError) throw dayError;

    return NextResponse.json({
      code: town.code,
      identity: { id: player.id, token: playerToken(player.id), name },
    });
  }
  throw new HttpError(503, "Could not find a free town code. Try again.");
});
