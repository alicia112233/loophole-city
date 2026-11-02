import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { endingStats } from "./game/engine";
import { fallbackEnding, writeEnding } from "./ai";
import type { LedgerEntry, TownState } from "./game/types";
import type { DayRow, EndingRow, LawRow, PlayerRow, Snapshot, TownRow, VoteRow } from "./snapshot";

export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

function secret() {
  const value = process.env.GAME_SECRET;
  if (!value) throw new Error("GAME_SECRET is not set");
  return value;
}

export function playerToken(playerId: string) {
  return createHmac("sha256", secret()).update(playerId).digest("base64url");
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wraps a route handler so thrown HttpErrors become clean JSON responses. */
export function route<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: "Something went wrong at Town Hall." }, { status: 500 });
    }
  };
}

export async function getTown(codeRaw: string): Promise<TownRow> {
  const code = codeRaw.trim().toUpperCase();
  const { data, error } = await db().from("towns").select("*").eq("code", code).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "No town with that code.");
  return data as TownRow;
}

export async function requirePlayer(req: Request, town: TownRow): Promise<PlayerRow> {
  const id = req.headers.get("x-player-id") ?? "";
  const token = req.headers.get("x-player-token") ?? "";
  const expected = Buffer.from(playerToken(id));
  const given = Buffer.from(token);
  if (!id || expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new HttpError(401, "Join this town first.");
  }
  const { data, error } = await db()
    .from("players")
    .select("*")
    .eq("id", id)
    .eq("town_id", town.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(401, "Join this town first.");
  return data as PlayerRow;
}

export async function requireHost(req: Request, town: TownRow): Promise<PlayerRow> {
  const player = await requirePlayer(req, town);
  if (!player.is_host) throw new HttpError(403, "Only the host can do that.");
  return player;
}

const LOCK_SECONDS = 150;

/** Atomically takes the town's lock so a double tap cannot pay for two model calls. */
export async function lockTown(town: TownRow) {
  const now = new Date();
  const stale = new Date(now.getTime() - LOCK_SECONDS * 1000).toISOString();
  const { data, error } = await db()
    .from("towns")
    .update({ busy_since: now.toISOString() })
    .eq("id", town.id)
    .or(`busy_since.is.null,busy_since.lt.${stale}`)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(409, "The citizens are already busy scheming.");
  return data as TownRow;
}

export async function unlockTown(townId: string) {
  await db().from("towns").update({ busy_since: null }).eq("id", townId);
}

/** Protects the AI Gateway credit from a public link getting hammered. */
export async function checkBudget() {
  const limit = Number(process.env.MAX_DAYS_PER_HOUR ?? 120);
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count, error } = await db()
    .from("days")
    .select("id", { count: "exact", head: true })
    .eq("generated", true)
    .gte("created_at", since);
  if (error) throw error;
  if ((count ?? 0) >= limit) {
    throw new HttpError(429, "Town Hall has run out of paperwork for this hour. Try again shortly.");
  }
}

/** Writes the final newspaper for a finished run. Safe to call twice. */
export async function saveEnding(town: TownRow, timeline: number, state: TownState, ledger: LedgerEntry[]) {
  const copy = process.env.AI_GATEWAY_API_KEY ? await writeEnding(state, ledger) : fallbackEnding(state);
  const { error } = await db()
    .from("endings")
    .upsert(
      {
        town_id: town.id,
        timeline,
        days_lasted: state.day,
        status: state.status,
        law_text: state.law?.text ?? null,
        headline: copy.headline,
        subhead: copy.subhead,
        story: copy.story,
        epitaph: copy.epitaph,
        stats: endingStats(state),
      },
      { onConflict: "town_id,timeline", ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function loadSnapshot(town: TownRow, viewerId?: string): Promise<Snapshot> {
  const client = db();
  const [players, laws, votes, days, endings, pending] = await Promise.all([
    client.from("players").select("*").eq("town_id", town.id).order("created_at"),
    client
      .from("laws")
      .select("*")
      .eq("town_id", town.id)
      .eq("timeline", town.timeline)
      .order("created_at", { ascending: false })
      .limit(20),
    client.from("votes").select("*").eq("town_id", town.id),
    client
      .from("days")
      .select("*")
      .eq("town_id", town.id)
      .eq("timeline", town.timeline)
      .order("day"),
    client.from("endings").select("*").eq("town_id", town.id).order("timeline"),
    town.pending_law_id
      ? client.from("laws").select("*").eq("id", town.pending_law_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const r of [players, laws, votes, days, endings, pending]) {
    if (r.error) throw r.error;
  }
  return {
    town: {
      id: town.id,
      code: town.code,
      timeline: town.timeline,
      busy: Boolean(town.busy_since),
    },
    state: town.state,
    pendingLaw: (pending.data as LawRow | null) ?? null,
    players: (players.data ?? []) as PlayerRow[],
    laws: (laws.data ?? []) as LawRow[],
    votes: (votes.data ?? []) as VoteRow[],
    days: (days.data ?? []) as DayRow[],
    endings: (endings.data ?? []) as EndingRow[],
    viewerId: viewerId ?? null,
  };
}
