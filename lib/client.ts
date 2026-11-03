import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Identity, Snapshot } from "./snapshot";

let browser: SupabaseClient | null = null;

/** Read-only client for Realtime. Row level security blocks every write from this key. */
export function realtimeClient() {
  if (browser) return browser;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  browser = createClient(url, key, { auth: { persistSession: false } });
  return browser;
}

const storageKey = (code: string) => `loophole:${code.toUpperCase()}`;

export function loadIdentity(code: string): Identity | null {
  try {
    const raw = localStorage.getItem(storageKey(code));
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

export function saveIdentity(code: string, identity: Identity) {
  try {
    localStorage.setItem(storageKey(code), JSON.stringify(identity));
  } catch {
    // Private browsing can block storage. The player simply rejoins on reload.
  }
}

export async function post<T = Snapshot>(path: string, body: unknown, identity?: Identity | null): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(identity ? { "x-player-id": identity.id, "x-player-token": identity.token } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Town Hall is not answering. Try again.");
  return data as T;
}

export const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US")}`;
