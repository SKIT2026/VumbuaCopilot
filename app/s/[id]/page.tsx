"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { ChatMessage, DiscoverySession } from "@/lib/types";
import { applyRules, nextStepHint, now, STAGES, stageDone, uid, type StageKey } from "@/lib/rules";
import { authToken, cloudEnabled, deleteSession, isSignedIn, loadSession, saveSession } from "@/lib/store";
import { DecisionPanel, EvidencePanel, HypothesesPanel, InterviewPanel, VenturePanel } from "@/components/panels";
import { ReportPanel } from "@/components/report";

type Tab = "venture" | "hypotheses" | "interview" | "evidence" | "decision" | "report";
const TABS: { key: Tab; label: string }[] = [
  { key: "venture", label: "Venture & customers" },
  { key: "hypotheses", label: "Hypotheses" },
  { key: "interview", label: "Interview coach" },
  { key: "evidence", label: "Evidence Lab" },
  { key: "decision", label: "Decision" },
  { key: "report", label: "Report" },
];
const STAGE_TAB: Record<StageKey, Tab> = {
  venture: "venture", hypotheses: "hypotheses", customers: "venture", interview: "interview",
  evidence: "evidence", decision: "decision", report: "report",
};

export default function Workspace() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [s, setS] = useState<DiscoverySession | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("venture");
  const [mobileView, setMobileView] = useState<"chat" | "work">("chat");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [simulateFailure, setSimulateFailure] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [needsSignIn, setNeedsSignIn] = useState(false);

  useEffect(() => {
    isSignedIn().then((ok) => {
      if (!ok) { setNeedsSignIn(true); return; }
      loadSession(id).then((x) => (x ? setS(applyRules(x)) : setMissing(true))).catch(() => setMissing(true));
    });
  }, [id]);

  const persist = useCallback((next: DiscoverySession) => {
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveSession(next).then(() => setSaveState("saved")).catch(() => setSaveState("error"));
    }, 500);
  }, []);

  const update = useCallback((fn: (x: DiscoverySession) => DiscoverySession) => {
    setS((prev) => { if (!prev) return prev; const next = applyRules(fn(prev)); persist(next); return next; });
  }, [persist]);

  // ---------- chat ----------
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }); }, [s?.messages.length, pending, busy, error]);

  const send = useCallback(async (text: string) => {
    if (!s || !text.trim() || busy) return;
    setBusy(true); setError(null); setPending(text);
    try {
      const token = await authToken();
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ session: s, message: text, simulateFailure }),
      });
      const data = await res.json().catch(() => ({ error: "The AI service returned an unreadable response." }));
      if (res.status === 401) { setNeedsSignIn(true); throw new Error("Your sign-in has expired. Please sign in again - your work is saved."); }
      if (!res.ok || data.error) throw new Error(data.error || `AI request failed (${res.status})`);
      const userMsg: ChatMessage = { id: uid("m_"), role: "user", content: text, createdAt: now() };
      const aiMsg: ChatMessage = { id: uid("m_"), role: "assistant", content: data.reply, actions: data.actions, createdAt: now() };
      const next = applyRules({ ...data.session, messages: [...s.messages, userMsg, aiMsg] });
      setS(next); persist(next);
      setDraft(""); setPending(null);
    } catch (e: any) {
      // NFR-07: keep the message, show a clear recovery path
      setError(e.message || "The AI service is unavailable.");
      setDraft(text);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [s, busy, simulateFailure, persist]);

  const ask = (prompt: string) => { setMobileView("chat"); send(prompt); };

  if (needsSignIn && !s) return (
    <main className="home">
      <h1>Please sign in</h1>
      <p>Sign in to open this discovery session. Anything you saved in this browser is kept, and you can add it to your account after signing in.</p>
      <Link className="btn btn-primary" href="/">Go to sign in</Link>
    </main>
  );
  if (missing) return (
    <main className="home"><h1>Session not found</h1><p>It may have been deleted, or you may need to sign in.</p><Link href="/">Back to your sessions</Link></main>
  );
  if (!s) return <main className="home"><p className="muted">Loading your discovery session...</p></main>;

  const done = stageDone(s);
  const currentStage = STAGES.find((st) => !done[st.key])?.key || "report";
  const suggestions = suggestionsFor(s, done);

  return (
    <div className="ws">
      <header className="ws-top">
        <Link href="/" className="brandmark" style={{ textDecoration: "none", color: "inherit", fontSize: 16 }} aria-label="VumbuaAI home">
          <span className="logo" style={{ width: 28, height: 28, fontSize: 14 }} aria-hidden>V</span><span className="hide-mobile">VumbuaAI</span>
        </Link>
        <div className="ws-title">{s.title}</div>
        <small role="status" aria-live="polite">
          {saveState === "saving" ? "Saving..." : saveState === "error" ? "Couldn't save - try again" : cloudEnabled ? "Saved" : "Saved in this browser"}
        </small>
        <label style={{ fontWeight: "normal", display: "flex", gap: 6, alignItems: "center", margin: 0 }} title="For the acceptance test: makes the next AI request fail">
          <input type="checkbox" style={{ width: "auto" }} checked={simulateFailure} onChange={(e) => setSimulateFailure(e.target.checked)} />
          <small>Demo: simulate AI outage</small>
        </label>
        <button className="btn-sm btn-danger" onClick={async () => {
          if (confirm("Delete this whole discovery session permanently?")) { await deleteSession(s.id); router.push("/"); }
        }}>Delete session</button>
      </header>

      <nav className="journey" aria-label="Discovery journey progress">
        {STAGES.map((st, i) => (
          <button key={st.key} className={`step ${done[st.key] ? "done" : ""} ${st.key === currentStage ? "active" : ""}`}
            onClick={() => { setTab(STAGE_TAB[st.key]); setMobileView("work"); }}
            aria-current={st.key === currentStage ? "step" : undefined}>
            <span className="dot" aria-hidden />{i + 1}. {st.label}<span className="sr-only">{done[st.key] ? " (done)" : ""}</span>
          </button>
        ))}
      </nav>

      <div className="mobile-switch" role="tablist" aria-label="View">
        <button role="tab" aria-selected={mobileView === "chat"} className={mobileView === "chat" ? "btn-primary" : ""} onClick={() => setMobileView("chat")}>Chat</button>
        <button role="tab" aria-selected={mobileView === "work"} className={mobileView === "work" ? "btn-primary" : ""} onClick={() => setMobileView("work")}>Workspace</button>
      </div>

      <div className="ws-body">
        <section className={`chat ${mobileView === "chat" ? "" : "hide-mobile"}`} aria-label="Chat with VumbuaAI">
          <div className="chat-log" ref={logRef} aria-live="polite">
            {s.messages.map((m) => (
              <div key={m.id} className={`msg ${m.role}`}>
                {m.role === "assistant" && <div className="who">VumbuaAI</div>}
                <RichText text={m.content} />
                {m.actions && m.actions.length > 0 && (
                  <div className="actions">{m.actions.map((a, i) => <span key={i} className={`badge ${a.includes("blocked") ? "tag-warn" : "tag"}`}>{a}</span>)}</div>
                )}
              </div>
            ))}
            {pending && (
              <div className="msg user" style={error ? { opacity: 0.7 } : undefined}>{pending}{error && <div><small style={{ color: "#fff" }}>Not sent</small></div>}</div>
            )}
            {busy && <div className="msg assistant typing" role="status">VumbuaAI is thinking and updating your workspace...</div>}
            {error && (
              <div className="err-note" role="alert">
                <strong>Something went wrong.</strong> {error}
                <div style={{ marginTop: 6 }}>Your message and all your work are safe.</div>
                <div className="row" style={{ marginTop: 8 }}>
                  {needsSignIn
                    ? <Link className="btn btn-primary btn-sm" href="/">Sign in</Link>
                    : <button className="btn-primary btn-sm" onClick={() => pending && send(pending)}>Retry</button>}
                  <button className="btn-sm" onClick={() => { setError(null); setPending(null); }}>Edit message instead</button>
                  {simulateFailure && <button className="btn-sm" onClick={() => setSimulateFailure(false)}>Turn off simulated outage</button>}
                </div>
              </div>
            )}
          </div>
          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
            {!busy && suggestions.length > 0 && (
              <div className="chips" aria-label="Suggested prompts">
                {suggestions.map((q) => <button type="button" key={q} className="chip" onClick={() => send(q)}>{q}</button>)}
              </div>
            )}
            <label htmlFor="chat-box" className="sr-only">Message VumbuaAI</label>
            <textarea id="chat-box" ref={inputRef} value={draft} disabled={busy} maxLength={4000}
              placeholder="Message VumbuaAI... (Enter to send, Shift+Enter for a new line)"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }} />
            <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
              <small>Don't enter customers' names or contact details.</small>
              <button className="btn-primary" disabled={busy || !draft.trim()}>{busy ? "Working..." : "Send"}</button>
            </div>
          </form>
        </section>

        <section className={`panel ${mobileView === "work" ? "" : "hide-mobile"}`} aria-label="Discovery workspace">
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.key} role="tab" className="tab" aria-selected={tab === t.key} aria-controls="tabpanel" id={`tab-${t.key}`} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>
          <div className="panel-inner" id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
            <div className="rule-note hint no-print" style={{ marginBottom: 14 }}>
              <span><strong>Next step: </strong>{nextStepHint(s)}</span>
            </div>
            {busy && tab !== "report" && <p className="muted no-print">Editing is paused while VumbuaAI updates your workspace.</p>}
            {tab === "venture" && <VenturePanel s={s} update={update} busy={busy} ask={ask} />}
            {tab === "hypotheses" && <HypothesesPanel s={s} update={update} busy={busy} ask={ask} />}
            {tab === "interview" && <InterviewPanel s={s} update={update} busy={busy} ask={ask} />}
            {tab === "evidence" && <EvidencePanel s={s} update={update} busy={busy} ask={ask} />}
            {tab === "decision" && <DecisionPanel s={s} update={update} busy={busy} ask={ask} />}
            {tab === "report" && <ReportPanel s={s} />}
          </div>
        </section>
      </div>
    </div>
  );
}

function suggestionsFor(s: DiscoverySession, d: Record<StageKey, boolean>): string[] {
  if (!d.venture) return ["Here's my idea...", "What is customer discovery?"];
  if (!d.hypotheses) return ["Turn my idea into testable hypotheses"];
  if (s.hypotheses.some((h) => !h.approved && !h.supersededBy) && !d.customers) return ["Who exactly are my early adopters?"];
  if (!d.customers) return ["Who exactly are my early adopters?", "What alternatives do my customers use today?"];
  if (!d.interview) return ["Draft my interview guide", "Is 'Would you buy our product?' a good question?"];
  if (!d.evidence) return ["How do I find people to interview?", "Let me practise an interview (simulation)"];
  if (!d.decision) return ["Assess my evidence and recommend a next step"];
  return ["What should my next experiment be?", "Help me revise a hypothesis"];
}

/** Minimal safe renderer: paragraphs, bullet lists and **bold**. No HTML injection. */
function RichText({ text }: { text: string }) {
  const bold = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>);
  const blocks = text.split(/\n{2,}/);
  return (
    <div style={{ whiteSpace: "normal" }}>
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
          const ordered = /^\s*\d/.test(lines[0]);
          const items = lines.map((l, j) => <li key={j}>{bold(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""))}</li>);
          return ordered ? <ol key={i} style={{ margin: "4px 0 8px 18px", padding: 0 }}>{items}</ol> : <ul key={i} style={{ margin: "4px 0 8px 18px", padding: 0 }}>{items}</ul>;
        }
        return <p key={i} style={{ margin: "0 0 8px" }}>{lines.map((l, j) => <span key={j}>{j > 0 && <br />}{bold(l.replace(/^#+\s*/, ""))}</span>)}</p>;
      })}
    </div>
  );
}
