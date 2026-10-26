"use client";
import { useState } from "react";
import type {
  DiscoverySession, Evidence, EvidenceDirection, EvidenceKind, Hypothesis, HypothesisType, Recommendation,
} from "@/lib/types";
import { ACTION_LABEL } from "@/lib/types";
import {
  activeHypotheses, countsAsEvidence, lintQuestion, lintText, now, realEvidenceCount, statusGap, uid,
} from "@/lib/rules";
import { AIGuidance, ListEditor, StatusBadge, download } from "./ui";

type Upd = (fn: (s: DiscoverySession) => DiscoverySession) => void;
interface P { s: DiscoverySession; update: Upd; busy: boolean; ask: (prompt: string) => void }

const HTYPE_LABEL: Record<HypothesisType, string> = {
  customer: "Customer", problem: "Problem", solution: "Solution",
  value_proposition: "Value proposition", channel: "Channel", revenue: "Revenue",
};

const hLabel = (s: DiscoverySession, id: string) => {
  const h = s.hypotheses.find((x) => x.id === id);
  return h ? `${HTYPE_LABEL[h.type]}: ${h.statement}` : "(deleted hypothesis)";
};

// ================= Venture & customers (FR-02, FR-07, FR-08) =================
export function VenturePanel({ s, update, busy, ask }: P) {
  const v = s.venture;
  const set = (k: keyof typeof v, val: any) =>
    update((x) => ({ ...x, title: k === "name" && val ? val : x.title, venture: { ...x.venture, [k]: val } }));
  const notes = lintText(`${v.targetCustomer} ${v.idea}`);
  return (
    <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
      <div className="card">
        <h2>Venture</h2>
        <div className="grid2">
          <div className="field"><label htmlFor="v-name">Venture name</label>
            <input id="v-name" value={v.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="field"><label htmlFor="v-stage">Development stage</label>
            <select id="v-stage" value={v.stage} onChange={(e) => set("stage", e.target.value)}>
              <option value="">Select...</option>
              {["Idea", "Prototype", "Early customers", "Revenue"].map((o) => <option key={o}>{o}</option>)}
              {v.stage && !["Idea", "Prototype", "Early customers", "Revenue"].includes(v.stage) && <option>{v.stage}</option>}
            </select></div>
        </div>
        <div className="field"><label htmlFor="v-idea">Venture idea</label>
          <textarea id="v-idea" rows={2} value={v.idea} onChange={(e) => set("idea", e.target.value)} /></div>
        <div className="field"><label htmlFor="v-sol">Proposed solution</label>
          <textarea id="v-sol" rows={2} value={v.solution} onChange={(e) => set("solution", e.target.value)} /></div>
        <div className="field"><label htmlFor="v-cust">Target customer</label>
          <textarea id="v-cust" rows={2} value={v.targetCustomer} onChange={(e) => set("targetCustomer", e.target.value)} /></div>
        {notes.map((n, i) => <p key={i} className="rule-note" role="status"><strong>Rules check: </strong>{n.message}</p>)}
        <button onClick={() => ask("Help me turn my idea into testable hypotheses.")}>Ask VumbuaAI to draft hypotheses</button>
      </div>
      <div className="card">
        <h2>Customers and problem</h2>
        <p className="muted">Be specific: who exactly, where, in what situation. Early adopters have the problem, know it, are looking for a fix, have hacked a workaround, and have budget.</p>
        <div className="grid2">
          <ListEditor label="Customer segments" items={v.segments} onChange={(x) => set("segments", x)} placeholder="e.g. Private primary schools in Lusaka with 1-3 buses" />
          <ListEditor label="Potential early adopters" items={v.earlyAdopters} onChange={(x) => set("earlyAdopters", x)} placeholder="e.g. Bursars already tracking bus fees on WhatsApp" />
          <ListEditor label="Customer problems" items={v.problems} onChange={(x) => set("problems", x)} />
          <ListEditor label="Existing alternatives / workarounds" items={v.alternatives} onChange={(x) => set("alternatives", x)} />
          <ListEditor label="Suspected unmet needs" items={v.unmetNeeds} onChange={(x) => set("unmetNeeds", x)} />
        </div>
        <button onClick={() => ask("Challenge my customer segment and help me identify early adopters.")}>Ask VumbuaAI to challenge my segment</button>
      </div>
    </fieldset>
  );
}

// ================= Hypotheses (FR-03-05, FR-10, FR-11, FR-29) =================
export function HypothesesPanel({ s, update, busy, ask }: P) {
  const [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [nType, setNType] = useState<HypothesisType>("problem");
  const [nText, setNText] = useState("");
  const [reviseReason, setReviseReason] = useState("");

  const act = activeHypotheses(s).sort((a, b) => a.priority - b.priority);
  const old = s.hypotheses.filter((h) => h.supersededBy);

  const patch = (id: string, p: Partial<Hypothesis>) =>
    update((x) => ({ ...x, hypotheses: x.hypotheses.map((h) => (h.id === id ? { ...h, ...p } : h)) }));

  const approve = (h: Hypothesis) =>
    update((x) => ({
      ...x,
      hypotheses: x.hypotheses.map((y) =>
        y.id === h.id ? { ...y, approved: true } : h.revisionOf && y.id === h.revisionOf ? { ...y, supersededBy: h.id } : y),
    }));

  const remove = (h: Hypothesis) => {
    const n = s.evidence.filter((e) => e.hypothesisId === h.id).length;
    if (!confirm(n ? `Delete this hypothesis and its ${n} evidence record(s)?` : "Delete this hypothesis?")) return;
    update((x) => ({
      ...x,
      hypotheses: x.hypotheses.filter((y) => y.id !== h.id).map((y) => (y.supersededBy === h.id ? { ...y, supersededBy: undefined } : y)),
      evidence: x.evidence.filter((e) => e.hypothesisId !== h.id),
      findings: x.findings.filter((f) => f.hypothesisId !== h.id),
    }));
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= act.length) return;
    const order = act.map((h) => h.id); [order[i], order[j]] = [order[j], order[i]];
    update((x) => ({ ...x, hypotheses: x.hypotheses.map((h) => (order.includes(h.id) ? { ...h, priority: order.indexOf(h.id) + 1 } : h)) }));
  };

  // Edit an untested hypothesis in place; a tested one becomes a revision so history and evidence are preserved (FR-29)
  const saveEdit = (h: Hypothesis) => {
    if (!text.trim()) return;
    const tested = s.evidence.some((e) => e.hypothesisId === h.id);
    if (!tested || !h.approved) patch(h.id, { statement: text.trim() });
    else update((x) => {
      const nh: Hypothesis = { ...h, id: uid("h_"), statement: text.trim(), approved: true, source: "user", revisionOf: h.id,
        revisionReason: reviseReason || "Revised by founder", supersededBy: undefined, createdAt: now() };
      return { ...x, hypotheses: [...x.hypotheses.map((y) => (y.id === h.id ? { ...y, supersededBy: nh.id } : y)), nh] };
    });
    setEditing(null); setReviseReason("");
  };

  const addManual = () => {
    if (!nText.trim()) return;
    update((x) => ({ ...x, hypotheses: [...x.hypotheses, {
      id: uid("h_"), type: nType, statement: nText.trim(), approved: true, source: "user",
      priority: activeHypotheses(x).length + 1, status: "Untested", createdAt: now() }] }));
    setNText("");
  };

  return (
    <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Hypotheses</h2>
        <div className="row">
          <button onClick={() => ask("Help me turn my idea into testable hypotheses.")}>Draft with VumbuaAI</button>
          <button onClick={() => ask("Which of my hypotheses are riskiest? Help me prioritise them for testing.")}>Prioritise with VumbuaAI</button>
        </div>
      </div>
      <p className="muted">Ordered by testing priority (1 = riskiest). Status is computed by fixed rules from real evidence only - the AI cannot set it.</p>
      {act.length === 0 && <div className="card"><p className="muted" style={{ margin: 0 }}>No hypotheses yet. Describe your idea in the chat and ask VumbuaAI to draft some, or add your own below.</p></div>}
      {act.map((h, i) => {
        const gaps = statusGap(h, s.evidence);
        const base = h.revisionOf ? s.hypotheses.find((y) => y.id === h.revisionOf) : null;
        return (
          <div key={h.id} className={`card h-item ${h.approved ? "" : "draft"}`}>
            <div className="stack" style={{ textAlign: "center" }}>
              <span className="prio" aria-label={`Priority ${i + 1}`}>{i + 1}</span>
              <button className="btn-sm" onClick={() => move(i, -1)} aria-label="Move up" disabled={i === 0}>&uarr;</button>
              <button className="btn-sm" onClick={() => move(i, 1)} aria-label="Move down" disabled={i === act.length - 1}>&darr;</button>
            </div>
            <div>
              <div className="row" style={{ marginBottom: 4 }}>
                <span className="badge tag">{HTYPE_LABEL[h.type]}</span>
                {h.approved ? <StatusBadge status={h.status} title={gaps.join(" ")} /> : <span className="badge tag-warn">Draft - awaiting your approval</span>}
                {h.source === "ai" && <small>AI-suggested</small>}
              </div>
              {editing === h.id ? (
                <div className="stack">
                  <label htmlFor={`edit-${h.id}`} className="sr-only">Hypothesis statement</label>
                  <textarea id={`edit-${h.id}`} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
                  {h.approved && s.evidence.some((e) => e.hypothesisId === h.id) && (
                    <>
                      <p className="rule-note" style={{ margin: 0 }}>This hypothesis has evidence, so your change is saved as a revision. The original and its evidence are kept in the history.</p>
                      <input aria-label="Reason for revision" placeholder="Why are you revising it?" value={reviseReason} onChange={(e) => setReviseReason(e.target.value)} />
                    </>
                  )}
                  <div className="row"><button className="btn-primary btn-sm" onClick={() => saveEdit(h)}>Save</button>
                    <button className="btn-sm" onClick={() => setEditing(null)}>Cancel</button></div>
                </div>
              ) : <p style={{ margin: 0 }}>{h.statement}</p>}
              {base && <small>Revises: "{base.statement}" {h.revisionReason ? `- ${h.revisionReason}` : ""}</small>}
              {h.approved && h.status !== "Provisionally Supported" && gaps.length > 0 && (
                <div><small>Needs: {gaps.join(" ")}</small></div>
              )}
            </div>
            <div className="stack">
              {!h.approved && <button className="btn-primary btn-sm" onClick={() => approve(h)}>Approve</button>}
              <button className="btn-sm" onClick={() => { setEditing(h.id); setText(h.statement); }}>{h.approved && s.evidence.some((e) => e.hypothesisId === h.id) ? "Revise" : "Edit"}</button>
              <button className="btn-sm btn-danger" onClick={() => remove(h)}>{h.approved ? "Delete" : "Reject"}</button>
            </div>
          </div>
        );
      })}

      <div className="card">
        <h3>Add your own hypothesis</h3>
        <div className="row" style={{ flexWrap: "nowrap", alignItems: "stretch" }}>
          <label htmlFor="nh-type" className="sr-only">Type</label>
          <select id="nh-type" value={nType} onChange={(e) => setNType(e.target.value as HypothesisType)} style={{ width: 170 }}>
            {Object.entries(HTYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <label htmlFor="nh-text" className="sr-only">Statement</label>
          <input id="nh-text" value={nText} onChange={(e) => setNText(e.target.value)} placeholder="[Specific customer] experiences [problem] at least [frequency]..." />
          <button onClick={addManual} disabled={!nText.trim()}>Add</button>
        </div>
      </div>

      {old.length > 0 && (
        <div className="card">
          <button className="btn-ghost" onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory}>
            {showHistory ? "Hide" : "Show"} revision history ({old.length})
          </button>
          {showHistory && old.map((h) => (
            <div key={h.id} className="h-item superseded" style={{ display: "block", padding: "8px 0", borderTop: "1px dashed var(--line)" }}>
              <span className="badge tag">{HTYPE_LABEL[h.type]}</span> <StatusBadge status={h.status} /> <s>{h.statement}</s>
              <div><small>{s.evidence.filter((e) => e.hypothesisId === h.id).length} evidence record(s) kept</small></div>
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}

// ================= Interview guide (FR-12-16) =================
export function InterviewPanel({ s, update, busy, ask }: P) {
  const [nq, setNq] = useState("");
  const [nh, setNh] = useState<string>("");
  const [editing, setEditing] = useState<string | null>(null);
  const [txt, setTxt] = useState("");
  const act = activeHypotheses(s).filter((h) => h.approved);
  const qs = s.questions;

  const setQs = (q: typeof qs) => update((x) => ({ ...x, questions: q }));
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= qs.length) return; const c = [...qs]; [c[i], c[j]] = [c[j], c[i]]; setQs(c); };
  const save = (id: string) => {
    setQs(qs.map((q) => (q.id === id ? { ...q, text: txt, flags: lintQuestion(txt) } : q)));
    setEditing(null);
  };
  const add = () => {
    if (!nq.trim()) return;
    setQs([...qs, { id: uid("q_"), text: nq.trim(), hypothesisIds: nh ? [nh] : [], flags: lintQuestion(nq) }]);
    setNq("");
  };
  const exportTxt = () => {
    const lines = [`Customer interview guide - ${s.title}`, `Generated by VumbuaAI on ${new Date().toLocaleDateString("en-GB")}`, "",
      "Reminders: ask about specific past events; don't pitch your solution; listen for behaviour, spend and workarounds; record who (by role, not name).", "",
      ...qs.map((q, i) => `${i + 1}. ${q.text}${q.hypothesisIds.length ? `\n   Tests: ${q.hypothesisIds.map((id) => hLabel(s, id)).join("; ")}` : ""}`)];
    download(`${s.title.replace(/\W+/g, "-")}-interview-guide.txt`, lines.join("\n"));
  };
  const flagged = qs.filter((q) => q.flags.length).length;

  return (
    <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Interview guide</h2>
        <div className="row">
          <button onClick={() => ask("Draft an interview guide for my top-priority customer and problem hypotheses.")} disabled={!act.length}>Draft with VumbuaAI</button>
          <button onClick={() => ask("Review my interview guide. Flag leading, hypothetical or solution-biased questions and suggest better ones.")} disabled={!qs.length}>Review with VumbuaAI</button>
          <button onClick={exportTxt} disabled={!qs.length}>Export</button>
        </div>
      </div>
      {!act.length && <p className="rule-note">Approve at least one hypothesis first, so every question tests something.</p>}
      {flagged > 0 && <p className="rule-note" role="status"><strong>{flagged} question(s) flagged.</strong> These are likely to produce unreliable evidence - see why below.</p>}
      {qs.map((q, i) => (
        <div key={q.id} className="card">
          <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
            <strong style={{ minWidth: 22 }}>{i + 1}.</strong>
            <div style={{ flex: 1 }}>
              {editing === q.id ? (
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <label htmlFor={`q-${q.id}`} className="sr-only">Question</label>
                  <input id={`q-${q.id}`} value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save(q.id)} />
                  <button className="btn-sm btn-primary" onClick={() => save(q.id)}>Save</button>
                </div>
              ) : <p style={{ margin: 0 }}>{q.text}</p>}
              {q.purpose && <small>{q.purpose}</small>}
              {q.hypothesisIds.length > 0 && <div><small>Tests: {q.hypothesisIds.map((id) => hLabel(s, id)).join("; ")}</small></div>}
              {q.flags.map((f, j) => (
                <div key={j} className={f.by === "ai" ? "ai-note" : "rule-note"} style={{ marginTop: 6 }}>
                  <strong>{f.issue.replace("_", "-")} ({f.by === "ai" ? "AI review" : "rules check"}): </strong>{f.explanation}
                  {f.suggestion && <div><em>Try instead:</em> {f.suggestion}
                    {f.by === "ai" && <> <button className="btn-sm" onClick={() => setQs(qs.map((x) => x.id === q.id ? { ...x, text: f.suggestion!, flags: lintQuestion(f.suggestion!) } : x))}>Use this</button></>}
                  </div>}
                </div>
              ))}
            </div>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <button className="btn-sm" onClick={() => move(i, -1)} aria-label="Move up" disabled={i === 0}>&uarr;</button>
              <button className="btn-sm" onClick={() => move(i, 1)} aria-label="Move down" disabled={i === qs.length - 1}>&darr;</button>
              <button className="btn-sm" onClick={() => { setEditing(q.id); setTxt(q.text); }}>Edit</button>
              <button className="btn-sm btn-danger" onClick={() => setQs(qs.filter((x) => x.id !== q.id))} aria-label="Delete question">Delete</button>
            </div>
          </div>
        </div>
      ))}
      <div className="card">
        <h3>Add a question</h3>
        <div className="field"><label htmlFor="nq">Question</label>
          <input id="nq" value={nq} onChange={(e) => setNq(e.target.value)} placeholder="Tell me about the last time you..." onKeyDown={(e) => e.key === "Enter" && add()} /></div>
        {nq && lintQuestion(nq).map((f, i) => <p key={i} className="rule-note"><strong>{f.issue.replace("_", "-")}: </strong>{f.explanation}</p>)}
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <label htmlFor="nqh" className="sr-only">Hypothesis tested</label>
          <select id="nqh" value={nh} onChange={(e) => setNh(e.target.value)}>
            <option value="">Link to a hypothesis (optional)</option>
            {act.map((h) => <option key={h.id} value={h.id}>{HTYPE_LABEL[h.type]}: {h.statement.slice(0, 70)}</option>)}
          </select>
          <button onClick={add} disabled={!nq.trim()}>Add</button>
        </div>
      </div>
    </fieldset>
  );
}

// ================= Evidence Lab (FR-17-23) =================
const blankEv = { hypothesisId: "", interviewRef: "", context: "", kind: "statement" as EvidenceKind, observation: "", direction: "supports" as EvidenceDirection, simulated: false };

export function EvidencePanel({ s, update, busy, ask }: P) {
  const act = activeHypotheses(s).filter((h) => h.approved).sort((a, b) => a.priority - b.priority);
  const [f, setF] = useState({ ...blankEv, hypothesisId: act[0]?.id || "" });
  const [editId, setEditId] = useState<string | null>(null);
  const pii = lintText(`${f.interviewRef} ${f.context} ${f.observation}`).filter((n) => n.kind === "personal_data");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.hypothesisId || !f.observation.trim() || !f.interviewRef.trim()) return;
    if (editId) update((x) => ({ ...x, evidence: x.evidence.map((ev) => (ev.id === editId ? { ...ev, ...f } : ev)) }));
    else update((x) => ({ ...x, evidence: [...x.evidence, { ...f, id: uid("e_"), recordedBy: "user", createdAt: now() }] }));
    setF({ ...blankEv, hypothesisId: f.hypothesisId, interviewRef: editId ? "" : f.interviewRef });
    setEditId(null);
  };
  const edit = (ev: Evidence) => { setEditId(ev.id); setF({ hypothesisId: ev.hypothesisId, interviewRef: ev.interviewRef, context: ev.context, kind: ev.kind, observation: ev.observation, direction: ev.direction, simulated: ev.simulated }); window.scrollTo?.(0, 0); };
  const del = (id: string) => confirm("Delete this evidence record?") &&
    update((x) => ({ ...x, evidence: x.evidence.filter((e) => e.id !== id),
      findings: x.findings.map((fi) => ({ ...fi, supportingIds: fi.supportingIds.filter((i) => i !== id), contradictingIds: fi.contradictingIds.filter((i) => i !== id) })) }));

  const interviews = new Set(s.evidence.filter((e) => !e.simulated).map((e) => e.interviewRef.trim().toLowerCase())).size;

  const EvCard = ({ e }: { e: Evidence }) => (
    <div className={`card ev ${e.direction} ${e.simulated ? "sim" : ""}`} id={`ev-${e.id}`}>
      <div className="row" style={{ marginBottom: 4 }}>
        <span className="badge tag">{e.kind === "behaviour" ? "Observed behaviour" : e.kind === "statement" ? "Customer statement" : "Founder interpretation"}</span>
        {e.simulated && <span className="badge tag-sim">SIMULATED - not evidence</span>}
        {e.kind === "interpretation" && !e.simulated && <span className="badge tag-warn">Not scored</span>}
        <small>{e.interviewRef}</small>
      </div>
      <p style={{ margin: "0 0 4px" }}>{e.observation}</p>
      {e.context && <small>{e.context}</small>}
      <div className="row" style={{ marginTop: 6 }}>
        <small style={{ flex: 1 }}>{e.recordedBy === "ai_from_user_message" ? "Logged by VumbuaAI from your chat message" : "Recorded by you"} - ref {e.id}</small>
        <button className="btn-sm" onClick={() => edit(e)}>Edit</button>
        <button className="btn-sm btn-danger" onClick={() => del(e.id)}>Delete</button>
      </div>
    </div>
  );

  return (
    <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Evidence Lab</h2>
        <div className="row">
          <small>{realEvidenceCount(s)} scored observations from {interviews} interview(s)</small>
          <button onClick={() => ask("Assess the evidence I've recorded: what supports and contradicts each hypothesis, and what gaps remain?")} disabled={!s.evidence.length}>Assess with VumbuaAI</button>
        </div>
      </div>

      {!act.length ? <p className="rule-note">Approve hypotheses before recording evidence against them.</p> : (
        <form className="card" onSubmit={submit} aria-label="Record interview evidence">
          <h3>{editId ? "Edit evidence record" : "Record what a real customer said or did"}</h3>
          <p className="muted">Tip: you can also just tell VumbuaAI about an interview in the chat and it will log it for you, quoting your words.</p>
          <div className="grid2">
            <div className="field"><label htmlFor="ev-h">Hypothesis</label>
              <select id="ev-h" required value={f.hypothesisId} onChange={(e) => setF({ ...f, hypothesisId: e.target.value })}>
                <option value="">Select...</option>
                {act.map((h) => <option key={h.id} value={h.id}>{HTYPE_LABEL[h.type]}: {h.statement.slice(0, 80)}</option>)}
              </select></div>
            <div className="field"><label htmlFor="ev-ref">Interview (by role, not name)</label>
              <input id="ev-ref" required value={f.interviewRef} placeholder="Interview 3 - school bursar" onChange={(e) => setF({ ...f, interviewRef: e.target.value })} /></div>
          </div>
          <div className="field"><label htmlFor="ev-ctx">Interview context</label>
            <input id="ev-ctx" value={f.context} placeholder="Where, when, situation" onChange={(e) => setF({ ...f, context: e.target.value })} /></div>
          <div className="field"><label htmlFor="ev-obs">Observation</label>
            <textarea id="ev-obs" required rows={3} value={f.observation} onChange={(e) => setF({ ...f, observation: e.target.value })}
              placeholder="What exactly did they say or do? Quote where you can." /></div>
          <div className="grid2">
            <fieldset className="field" style={{ border: 0, padding: 0 }}>
              <legend style={{ fontSize: 13, fontWeight: "bold", marginBottom: 4 }}>Type of evidence</legend>
              {([["statement", "Customer statement (what they said)"], ["behaviour", "Observed behaviour (what they did / spend / workaround)"], ["interpretation", "My interpretation (not scored)"]] as const).map(([k, l]) => (
                <label key={k} style={{ fontWeight: "normal", display: "flex", gap: 6 }}>
                  <input type="radio" name="kind" style={{ width: "auto" }} checked={f.kind === k} onChange={() => setF({ ...f, kind: k })} />{l}</label>
              ))}
            </fieldset>
            <fieldset className="field" style={{ border: 0, padding: 0 }}>
              <legend style={{ fontSize: 13, fontWeight: "bold", marginBottom: 4 }}>Effect on hypothesis</legend>
              {([["supports", "Supports"], ["contradicts", "Contradicts"], ["neutral", "Neutral / unclear"]] as const).map(([k, l]) => (
                <label key={k} style={{ fontWeight: "normal", display: "flex", gap: 6 }}>
                  <input type="radio" name="dir" style={{ width: "auto" }} checked={f.direction === k} onChange={() => setF({ ...f, direction: k })} />{l}</label>
              ))}
              <label style={{ fontWeight: "normal", display: "flex", gap: 6, marginTop: 8 }}>
                <input type="checkbox" style={{ width: "auto" }} checked={f.simulated} onChange={(e) => setF({ ...f, simulated: e.target.checked })} />
                This is from a simulation / role-play, not a real customer</label>
            </fieldset>
          </div>
          {pii.map((n, i) => <p key={i} className="rule-note" role="alert">{n.message}</p>)}
          <div className="row">
            <button className="btn-primary">{editId ? "Save changes" : "Record evidence"}</button>
            {editId && <button type="button" onClick={() => { setEditId(null); setF({ ...blankEv, hypothesisId: f.hypothesisId }); }}>Cancel</button>}
          </div>
        </form>
      )}

      {act.map((h) => {
        const evs = s.evidence.filter((e) => e.hypothesisId === h.id);
        if (!evs.length) return (
          <div key={h.id} className="card"><div className="row"><StatusBadge status={h.status} /><strong>{h.statement}</strong></div>
            <p className="muted" style={{ margin: "6px 0 0" }}>No evidence yet - this hypothesis remains untested.</p></div>
        );
        const sup = evs.filter((e) => e.direction === "supports"), con = evs.filter((e) => e.direction === "contradicts"), neu = evs.filter((e) => e.direction === "neutral");
        const finding = s.findings.find((x) => x.hypothesisId === h.id);
        return (
          <section key={h.id} className="card stack" aria-label={h.statement}>
            <div className="row"><StatusBadge status={h.status} /><strong style={{ flex: 1 }}>{h.statement}</strong></div>
            {h.status !== "Provisionally Supported" && <small>Needs: {statusGap(h, s.evidence).join(" ")}</small>}
            <div className="ev-cols">
              <div className="stack"><h3 style={{ color: "var(--green)" }}>Supporting ({sup.length})</h3>{sup.map((e) => <EvCard key={e.id} e={e} />)}{!sup.length && <small>None</small>}</div>
              <div className="stack"><h3 style={{ color: "var(--red)" }}>Contradicting ({con.length})</h3>{con.map((e) => <EvCard key={e.id} e={e} />)}{!con.length && <small>None</small>}</div>
            </div>
            {neu.length > 0 && <div className="stack"><h3>Neutral / unclear ({neu.length})</h3>{neu.map((e) => <EvCard key={e.id} e={e} />)}</div>}
            {finding && (
              <AIGuidance>
                {finding.summary}
                <div style={{ marginTop: 6 }}><small>Supporting: {finding.supportingIds.map((id) => <a key={id} href={`#ev-${id}`} style={{ marginRight: 6 }}>{id}</a>)}{!finding.supportingIds.length && "none"}</small></div>
                <div><small>Contradicting: {finding.contradictingIds.map((id) => <a key={id} href={`#ev-${id}`} style={{ marginRight: 6 }}>{id}</a>)}{!finding.contradictingIds.length && "none"}</small></div>
                {finding.gaps.length > 0 && <div><small>Gaps: {finding.gaps.join("; ")}</small></div>}
                {finding.ruleNotes.map((n, i) => <div key={i}><small><strong>Rules engine:</strong> {n}</small></div>)}
              </AIGuidance>
            )}
          </section>
        );
      })}
    </fieldset>
  );
}

// ================= Decision (FR-24-28) =================
export function DecisionPanel({ s, update, busy, ask }: P) {
  const act = activeHypotheses(s).filter((h) => h.approved);
  const real = realEvidenceCount(s);
  const untested = act.filter((h) => h.status === "Untested");
  const contradicted = act.filter((h) => h.status === "Contradicted");
  const recs = [...s.recommendations].reverse();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const decide = (r: Recommendation, decision: Recommendation["decision"]) => {
    if (decision === "modified" && !notes[r.id]?.trim()) return alert("Describe how you're modifying the recommendation.");
    update((x) => ({ ...x, recommendations: x.recommendations.map((y) => y.id === r.id ? { ...y, decision, founderNote: notes[r.id] || y.founderNote, decidedAt: now() } : y) }));
  };

  return (
    <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Discovery decision</h2>
        <button className="btn-primary" onClick={() => ask("Give me a discovery assessment based on my evidence, list unresolved assumptions and inconsistencies, and recommend a next action.")}>Get assessment from VumbuaAI</button>
      </div>

      {real === 0 ? (
        <div className="err-note" role="status">
          <strong>No real customer evidence recorded yet.</strong> All {act.length || ""} customer hypotheses remain <strong>Untested</strong>.
          You cannot validate a customer, problem or solution without talking to real customers. Next step: interview customers and record what they said and did in the Evidence Lab.
        </div>
      ) : (
        <div className="card">
          <h3>Evidence position (computed by rules)</h3>
          <div className="row">
            {(["Untested", "Evidence Emerging", "Contradicted", "Provisionally Supported"] as const).map((st) => (
              <span key={st} className="row" style={{ gap: 4 }}><StatusBadge status={st} /><strong>{act.filter((h) => h.status === st).length}</strong></span>
            ))}
          </div>
          {untested.length > 0 && <p style={{ marginTop: 8 }}><small>Still untested: {untested.map((h) => h.statement).join("; ")}</small></p>}
          {contradicted.length > 0 && <p className="rule-note" style={{ marginTop: 8 }}>Contradicted: {contradicted.map((h) => h.statement).join("; ")}. Consider revising these rather than defending them.</p>}
        </div>
      )}

      {recs.length === 0 && <p className="muted">No recommendations yet. Ask VumbuaAI for an assessment - it will recommend continuing discovery, revising hypotheses, running a solution experiment or stopping, and you decide.</p>}
      {recs.map((r) => (
        <div key={r.id} className="card stack">
          <div className="row">
            <span className="badge tag" style={{ fontSize: 14 }}>{ACTION_LABEL[r.action]}</span>
            <span className={`badge ${r.decision === "pending" ? "tag-warn" : r.decision === "rejected" ? "st-Contradicted" : "st-Provisionally-Supported"}`}>
              {r.decision === "pending" ? "Awaiting your decision" : `You ${r.decision} this`}</span>
            <small>{new Date(r.createdAt).toLocaleString("en-GB")}</small>
          </div>
          <AIGuidance>
            <div>{r.rationale}</div>
            {r.experiment && <div style={{ marginTop: 6 }}><strong>Suggested experiment:</strong> {r.experiment}</div>}
            <div style={{ marginTop: 6 }}><strong>Uncertainty:</strong> {r.uncertainty}</div>
            {r.unresolved.length > 0 && <div style={{ marginTop: 6 }}><strong>Unresolved assumptions / inconsistencies:</strong><ul style={{ margin: "4px 0 0 18px", padding: 0 }}>{r.unresolved.map((u, i) => <li key={i}>{u}</li>)}</ul></div>}
            <div style={{ marginTop: 6 }}><small>Based on evidence: {r.evidenceIds.length ? r.evidenceIds.join(", ") : "none cited"}</small></div>
          </AIGuidance>
          {r.decision === "pending" ? (
            <>
              <label htmlFor={`note-${r.id}`}>Your note (required to modify)</label>
              <textarea id={`note-${r.id}`} rows={2} value={notes[r.id] || ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} placeholder="What will you actually do, and why?" />
              <div className="row">
                <button className="btn-primary" onClick={() => decide(r, "accepted")}>Accept</button>
                <button onClick={() => decide(r, "modified")}>Modify</button>
                <button className="btn-danger" onClick={() => decide(r, "rejected")}>Reject</button>
              </div>
            </>
          ) : (
            <div className="row">
              {r.founderNote && <p style={{ margin: 0, flex: 1 }}><strong>Your note:</strong> {r.founderNote}</p>}
              <button className="btn-sm" onClick={() => update((x) => ({ ...x, recommendations: x.recommendations.map((y) => y.id === r.id ? { ...y, decision: "pending" } : y) }))}>Change decision</button>
            </div>
          )}
          {r.decision !== "pending" && r.action === "revise_hypotheses" && <p className="rule-note" style={{ margin: 0 }}>Go to Hypotheses to revise - originals and their evidence are kept, then run another round of interviews.</p>}
        </div>
      ))}
    </fieldset>
  );
}

export { HTYPE_LABEL, countsAsEvidence };
