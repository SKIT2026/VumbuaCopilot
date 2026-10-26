// Server-side agent endpoint. The Anthropic API key lives only here (NFR-04).
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TOOLS, runTool, sessionSnapshot } from "@/lib/agent-tools";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { KNOWLEDGE } from "@/lib/knowledge";
import { applyRules, lintText } from "@/lib/rules";
import type { DiscoverySession } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MAX_TOOL_ROUNDS = 8;
const MAX_HISTORY = 24;
const MAX_INPUT_CHARS = 4000;
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_HOUR || 40);

// NFR-09: simple per-user hourly limit (per serverless instance).
const hits = new Map<string, number[]>();
function limited(key: string) {
  const t = Date.now();
  const arr = (hits.get(key) || []).filter((x) => t - x < 3600_000);
  arr.push(t);
  hits.set(key, arr);
  return arr.length > RATE_LIMIT;
}

async function authUser(req: NextRequest): Promise<{ id: string } | null | "no-auth"> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const loginRequired = process.env.NEXT_PUBLIC_REQUIRE_LOGIN?.trim().toLowerCase() === "true";
  if (!loginRequired || !url || !key) return "no-auth"; // open mode: no accounts, rate-limited per visitor
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data } = await createClient(url, key).auth.getUser(token);
  return data.user ? { id: data.user.id } : null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.session || typeof body.message !== "string")
    return NextResponse.json({ error: "Bad request" }, { status: 400 });

  // UAT: lets the demo simulate an AI outage (NFR-07)
  if (body.simulateFailure) return NextResponse.json({ error: "Simulated AI service failure (demo mode)." }, { status: 503 });

  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim(); // tolerate stray spaces/line breaks from copy-paste
  if (!apiKey)
    return NextResponse.json({ error: "The AI service is not configured yet (ANTHROPIC_API_KEY missing on the server)." }, { status: 503 });

  const user = await authUser(req);
  if (user === null) return NextResponse.json({ error: "Please sign in to use VumbuaAI." }, { status: 401 });
  const key = user === "no-auth" ? req.headers.get("x-forwarded-for")?.split(",")[0] || "anon" : user.id;
  if (limited(key))
    return NextResponse.json({ error: `You've reached the limit of ${RATE_LIMIT} AI requests per hour. Your work is saved - try again shortly.` }, { status: 429 });

  const message = body.message.slice(0, MAX_INPUT_CHARS);
  let session: DiscoverySession = applyRules(body.session);

  // Deterministic rule checks on the founder's text (FR-09, NFR-05)
  const notes = lintText(message);
  const noteText = notes.length ? `\n\n[Rules engine: ${notes.map((n) => n.message).join(" ")}]` : "";

  const history = session.messages.slice(-MAX_HISTORY);
  const userTexts = [...session.messages.filter((m) => m.role === "user").map((m) => m.content), message];

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content || "(no text)" }) as Anthropic.MessageParam),
    { role: "user", content: message + noteText },
  ];
  // API requires alternating turns starting with user
  while (messages.length && messages[0].role !== "user") messages.shift();

  const client = new Anthropic({ apiKey });
  const actions: string[] = [];
  let reply = "";

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: [
          { type: "text", text: SYSTEM_PROMPT },
          { type: "text", text: KNOWLEDGE, cache_control: { type: "ephemeral" } },
          { type: "text", text: `Current workspace state (JSON):\n${sessionSnapshot(session)}` },
        ],
        tools: TOOLS,
        messages,
      });

      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
      if (text) reply = text;
      const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (res.stop_reason !== "tool_use" || !uses.length) break;

      // Send back only clean text/tool_use blocks so newer response fields can't invalidate the next request
      const assistantBlocks: Anthropic.ContentBlockParam[] = [];
      for (const b of res.content as any[]) {
        if (b.type === "text" && b.text) assistantBlocks.push({ type: "text", text: b.text });
        else if (b.type === "tool_use") assistantBlocks.push({ type: "tool_use", id: b.id, name: b.name, input: b.input ?? {} });
        else if (b.type === "thinking" || b.type === "redacted_thinking") assistantBlocks.push(b);
      }
      messages.push({ role: "assistant", content: assistantBlocks });
      const results: Anthropic.ToolResultBlockParam[] = uses.map((u) => {
        const r = runTool(session, u.name, u.input, { userTexts });
        session = r.state;
        if (r.action) actions.push(r.action);
        if (r.isError && r.result.startsWith("REJECTED")) actions.push("Rules engine blocked an AI action");
        return { type: "tool_result", tool_use_id: u.id, content: r.result, is_error: r.isError };
      });
      messages.push({ role: "user", content: results });
    }
  } catch (e: any) {
    // Log the real cause for Vercel Runtime Logs, and give the user a specific, safe explanation
    console.error("[VumbuaAI] Claude API error:", e?.status, e?.message);
    const s = e?.status;
    const msg =
      s === 401 ? "The AI service rejected the API key (401). Check ANTHROPIC_API_KEY in Vercel, then redeploy." :
      s === 403 ? "The API key doesn't have permission for this request (403). Check the key's workspace in the Claude Console." :
      s === 404 ? `The AI model "${MODEL}" wasn't found (404). Check ANTHROPIC_MODEL in Vercel.` :
      s === 400 && /credit|balance|billing/i.test(e?.message || "") ? "The Claude API account has no credit. Add credit in the Claude Console." :
      s === 400 ? `The AI service rejected the request (400: ${String(e?.error?.error?.message || e?.message || "").slice(0, 160)}). Your input is saved - please retry.` :
      !s && e?.message ? `VumbuaAI hit an internal error (${String(e.message).slice(0, 160)}). Your input is saved - please retry.` :
      s === 429 ? "The AI service is busy or a usage limit was reached. Your input is saved - please retry shortly." :
      s === 529 || s === 503 ? "The AI service is temporarily overloaded. Your input is saved - please retry." :
      "The AI service didn't respond. Your input is saved - please retry.";
    return NextResponse.json({ error: msg }, { status: s === 429 ? 429 : 502 });
  }

  return NextResponse.json({ reply: reply || "Done - see the workspace for updates.", actions, notes, session });
}
