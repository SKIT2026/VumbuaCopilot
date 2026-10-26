"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cloudEnabled, deleteSession, listSessions, saveSession, supabase, type SessionSummary } from "@/lib/store";
import { newSession } from "@/lib/rules";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(!cloudEnabled);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    const c = supabase();
    if (!c) return;
    c.auth.getSession().then(({ data }) => { setEmail(data.session?.user.email ?? null); setReady(true); });
    const { data: sub } = c.auth.onAuthStateChange((_e, s) => setEmail(s?.user.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signedIn = !cloudEnabled || !!email;

  useEffect(() => {
    if (ready && signedIn) listSessions().then(setSessions).catch((e) => setErr(e.message));
  }, [ready, signedIn]);

  async function create() {
    const s = newSession();
    s.messages.push({
      id: "welcome", role: "assistant", createdAt: s.createdAt,
      content:
        "Hi, I'm VumbuaAI - your customer discovery co-pilot.\n\nI'll help you turn your idea into testable hypotheses, prepare unbiased customer interviews, make sense of what real customers tell you, and decide what to do next. I won't validate anything without real evidence.\n\nTo start: what's your idea, and who do you think has the problem it solves?",
    });
    try { await saveSession(s); router.push(`/s/${s.id}`); } catch (e: any) { setErr(e.message); }
  }

  async function remove(id: string, title: string) {
    if (!confirm(`Delete "${title}" permanently? This cannot be undone.`)) return;
    await deleteSession(id);
    setSessions((x) => x.filter((s) => s.id !== id));
  }

  return (
    <main className="home">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="brandmark"><div className="logo" aria-hidden>V</div>VumbuaAI</div>
        {cloudEnabled && email && (
          <div className="row"><small>{email}</small>
            <button className="btn-sm" onClick={() => supabase()!.auth.signOut()}>Sign out</button></div>
        )}
      </div>

      <section className="hero">
        <h1>Test your startup assumptions with real customer evidence.</h1>
        <p>
          VumbuaAI is a customer discovery co-pilot based on Blank and Dorf's method. Chat with it the way you'd talk to a coach:
          it builds hypotheses, coaches your interviews, weighs the evidence you collect, and recommends a next step - while you
          stay in charge of every decision.
        </p>
      </section>

      {err && <p className="err-note" role="alert">{err}</p>}

      {!ready ? <p className="muted">Loading...</p> : !signedIn ? <Auth /> : (
        <section className="stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Your discovery sessions</h2>
            <button className="btn-primary" onClick={create}>+ New discovery session</button>
          </div>
          {sessions.length === 0 ? (
            <div className="card"><p className="muted">No sessions yet. Start one to describe your venture to VumbuaAI.</p></div>
          ) : (
            <ul className="sessions" style={{ listStyle: "none", padding: 0 }}>
              {sessions.map((s) => (
                <li key={s.id} className="card session-row">
                  <div>
                    <Link href={`/s/${s.id}`} style={{ fontWeight: "bold" }}>{s.title}</Link>
                    <div><small>Last updated {new Date(s.updatedAt).toLocaleString("en-GB")}</small></div>
                  </div>
                  <div className="row">
                    <Link className="btn btn-sm" href={`/s/${s.id}`}>Resume</Link>
                    <button className="btn-sm btn-danger" onClick={() => remove(s.id, s.title)} aria-label={`Delete ${s.title}`}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="card" style={{ marginTop: 28 }}>
        <h3>Your data</h3>
        <p className="muted" style={{ margin: 0 }}>
          {cloudEnabled
            ? "Sessions are stored in a secured database linked to your account, only visible to you, and kept until you delete them. "
            : "No sign-in needed. Your sessions are saved only in this browser on this device - they won't appear on another device, and clearing your browser data deletes them, so download your report to keep a copy. "}
          Messages you send to VumbuaAI are processed by Anthropic's Claude to generate guidance. Please don't enter customers' names,
          contact details or confidential information. <Link href="/privacy">Privacy and data details</Link>.
        </p>
      </section>
    </main>
  );
}

function Auth() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg("");
    const c = supabase()!;
    const { data, error } = mode === "in"
      ? await c.auth.signInWithPassword({ email, password: pw })
      : await c.auth.signUp({ email, password: pw });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === "up" && !data.session) setMsg("Check your email to confirm your account, then sign in.");
  }

  return (
    <form className="card" style={{ maxWidth: 420 }} onSubmit={submit}>
      <h2>{mode === "in" ? "Sign in" : "Create an account"}</h2>
      <div className="field"><label htmlFor="em">Email</label>
        <input id="em" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="field"><label htmlFor="pw">Password</label>
        <input id="pw" type="password" required minLength={6} autoComplete={mode === "in" ? "current-password" : "new-password"}
          value={pw} onChange={(e) => setPw(e.target.value)} /></div>
      {msg && <p className="ai-note" role="status">{msg}</p>}
      <div className="row">
        <button className="btn-primary" disabled={busy}>{busy ? "Please wait..." : mode === "in" ? "Sign in" : "Sign up"}</button>
        <button type="button" className="btn-ghost" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </div>
    </form>
  );
}
