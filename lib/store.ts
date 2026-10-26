"use client";
// Storage: Supabase when configured (save/resume across devices, FR-06), else browser localStorage.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DiscoverySession } from "./types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
// Sign-in is ON by default so each user keeps a saved history across devices (Supabase).
// Set NEXT_PUBLIC_REQUIRE_LOGIN=false in Vercel (and redeploy) for open, no-login access with browser-only storage.
export const loginRequired = process.env.NEXT_PUBLIC_REQUIRE_LOGIN?.trim().toLowerCase() !== "false";
export const cloudEnabled = loginRequired && !!(URL && KEY);

let sb: SupabaseClient | null = null;
export function supabase() {
  if (!cloudEnabled) return null;
  if (!sb) sb = createClient(URL!, KEY!);
  return sb;
}

export async function authToken(): Promise<string | null> {
  const c = supabase();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.access_token ?? null;
}

export interface SessionSummary { id: string; title: string; updatedAt: string }

const LS = "vumbuaai.sessions.v1";
function lsAll(): Record<string, DiscoverySession> {
  try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; }
}
function lsWrite(all: Record<string, DiscoverySession>) {
  try { localStorage.setItem(LS, JSON.stringify(all)); } catch { /* storage full or blocked */ }
}

export async function listSessions(): Promise<SessionSummary[]> {
  const c = supabase();
  if (c) {
    const { data, error } = await c.from("sessions").select("id,title,updated_at").order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
  }
  return Object.values(lsAll())
    .map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadSession(id: string): Promise<DiscoverySession | null> {
  const c = supabase();
  if (c) {
    const { data, error } = await c.from("sessions").select("data").eq("id", id).maybeSingle();
    if (error) throw error;
    // Fall back to the browser copy (e.g. a session started before signing in), so work is never lost
    return (data?.data as DiscoverySession) ?? lsAll()[id] ?? null;
  }
  return lsAll()[id] ?? null;
}

/** True when sign-in is not required, or the visitor has a valid session. */
export async function isSignedIn(): Promise<boolean> {
  const c = supabase();
  if (!c) return true;
  const { data } = await c.auth.getSession();
  return !!data.session;
}

/** Sessions saved in this browser that are not yet in the signed-in user's account. */
export async function localOnlySessions(): Promise<DiscoverySession[]> {
  const c = supabase();
  if (!c) return [];
  const { data, error } = await c.from("sessions").select("id");
  if (error) return [];
  const cloud = new Set((data || []).map((r) => r.id));
  return Object.values(lsAll()).filter((s) => !cloud.has(s.id));
}

/** Copy browser-only sessions into the signed-in account. */
export async function importLocalSessions(list: DiscoverySession[]): Promise<number> {
  let n = 0;
  for (const s of list) { await saveSession(s); n++; }
  return n;
}

/** Remove browser-only copies the user chose not to import. */
export function discardLocalSessions(ids: string[]) {
  const all = lsAll();
  for (const id of ids) delete all[id];
  lsWrite(all);
}

export async function saveSession(s: DiscoverySession): Promise<void> {
  // Always keep a local copy so nothing is lost if the network or AI fails (NFR-07)
  const all = lsAll(); all[s.id] = s; lsWrite(all);
  const c = supabase();
  if (c) {
    const { error } = await c.from("sessions").upsert({ id: s.id, title: s.title, data: s, updated_at: s.updatedAt });
    if (error) throw error;
  }
}

export async function deleteSession(id: string): Promise<void> {
  const all = lsAll(); delete all[id]; lsWrite(all);
  const c = supabase();
  if (c) {
    const { error } = await c.from("sessions").delete().eq("id", id);
    if (error) throw error;
  }
}

export async function deleteAllSessions(): Promise<void> {
  lsWrite({});
  const c = supabase();
  if (c) {
    const { data } = await c.auth.getUser();
    if (data.user) await c.from("sessions").delete().eq("user_id", data.user.id);
  }
}
