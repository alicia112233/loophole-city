import { db } from "./server";

/** A bill passes on a majority of everyone in town, and fails once it can no longer get one. */
export async function settleLaw(townId: string, lawId: string) {
  const client = db();
  const [{ count: playerCount }, { data: votes, error }] = await Promise.all([
    client.from("players").select("id", { count: "exact", head: true }).eq("town_id", townId),
    client.from("votes").select("value").eq("law_id", lawId),
  ]);
  if (error) throw error;

  const players = playerCount ?? 1;
  const yes = (votes ?? []).filter((v) => v.value).length;
  const no = (votes ?? []).length - yes;

  if (yes > players / 2) await enact(townId, lawId, false);
  else if (no >= players / 2) {
    await client.from("laws").update({ status: "rejected" }).eq("id", lawId).eq("status", "open");
  }
}

export async function decreeLaw(townId: string, lawId: string) {
  await enact(townId, lawId, true);
}

async function enact(townId: string, lawId: string, decree: boolean) {
  const client = db();
  // Only the update that flips the status moves the law into force, so concurrent votes settle once.
  const { data, error } = await client
    .from("laws")
    .update({ status: "enacted", decree })
    .eq("id", lawId)
    .eq("status", "open")
    .select("id");
  if (error) throw error;
  if (!data?.length) return;
  const { error: townError } = await client.from("towns").update({ pending_law_id: lawId }).eq("id", townId);
  if (townError) throw townError;
}
