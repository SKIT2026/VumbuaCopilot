// VumbuaAI business rules engine.
// These rules enforce Customer Discovery methodology in code, so they hold
// regardless of what the AI model says. Discovery rules 1-6 from the spec.

import type {
  DiscoverySession,
  Evidence,
  Hypothesis,
  HypothesisStatus,
  QuestionFlag,
  Venture,
} from "./types";

export const uid = (p = "") =>
  p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
export const now = () => new Date().toISOString();

export function emptyVenture(): Venture {
  return {
    name: "", idea: "", solution: "", targetCustomer: "", stage: "",
    segments: [], earlyAdopters: [], problems: [], alternatives: [], unmetNeeds: [],
  };
}

export function newSession(title = "Untitled venture"): DiscoverySession {
  const t = now();
  return {
    id: uid("s_"), title, venture: emptyVenture(), hypotheses: [], questions: [],
    evidence: [], findings: [], recommendations: [], messages: [], createdAt: t, updatedAt: t,
  };
}

// ---------- Rule 1 + 2: status is computed, never asserted ----------

/** Evidence that counts: real (not simulated), and an observation from a customer, not founder interpretation. */
export function countsAsEvidence(e: Evidence) {
  return !e.simulated && e.kind !== "interpretation";
}

export function computeStatus(h: Hypothesis, evidence: Evidence[]): HypothesisStatus {
  const real = evidence.filter((e) => e.hypothesisId === h.id && countsAsEvidence(e));
  if (real.length === 0) return "Untested"; // Rule 1: no evidence, no validation
  const sup = real.filter((e) => e.direction === "supports");
  const con = real.filter((e) => e.direction === "contradicts");
  if (con.length > 0 && con.length >= sup.length) return "Contradicted";
  const interviews = new Set(sup.map((e) => e.interviewRef.trim().toLowerCase())).size;
  const behaviour = sup.some((e) => e.kind === "behaviour"); // Rule 2: behaviour over enthusiasm
  if (sup.length >= 3 && interviews >= 2 && behaviour && sup.length >= 2 * con.length + 1) {
    return "Provisionally Supported";
  }
  return "Evidence Emerging";
}

/** Why a hypothesis is not yet Provisionally Supported - shown in the UI as guidance. */
export function statusGap(h: Hypothesis, evidence: Evidence[]): string[] {
  const real = evidence.filter((e) => e.hypothesisId === h.id && countsAsEvidence(e));
  const sup = real.filter((e) => e.direction === "supports");
  const con = real.filter((e) => e.direction === "contradicts");
  const gaps: string[] = [];
  if (real.length === 0) gaps.push("No real interview evidence recorded.");
  if (sup.length < 3) gaps.push(`${sup.length}/3 supporting observations.`);
  if (new Set(sup.map((e) => e.interviewRef.trim().toLowerCase())).size < 2)
    gaps.push("Supporting evidence comes from fewer than 2 interviews.");
  if (sup.length > 0 && !sup.some((e) => e.kind === "behaviour"))
    gaps.push("Only opinions so far - no observed behaviour (past action, spend, workaround).");
  if (con.length > 0) gaps.push(`${con.length} contradicting observation(s) to explain.`);
  const sim = evidence.filter((e) => e.hypothesisId === h.id && e.simulated).length;
  if (sim) gaps.push(`${sim} simulated record(s) excluded from scoring.`);
  return gaps;
}

/** Applied after every change (UI edit or AI tool call). */
export function applyRules(s: DiscoverySession): DiscoverySession {
  const hypotheses = s.hypotheses.map((h) => ({
    ...h,
    status: h.approved ? computeStatus(h, s.evidence) : ("Untested" as HypothesisStatus),
  }));
  // Rule 3: findings can never drop contradicting evidence for their hypothesis
  const findings = s.findings.map((f) => {
    const mustShow = s.evidence
      .filter((e) => e.hypothesisId === f.hypothesisId && countsAsEvidence(e) && e.direction === "contradicts")
      .map((e) => e.id);
    const missing = mustShow.filter((id) => !f.contradictingIds.includes(id));
    if (!missing.length) return f;
    return {
      ...f,
      contradictingIds: [...f.contradictingIds, ...missing],
      ruleNotes: [...f.ruleNotes, `Rules engine restored ${missing.length} contradicting record(s) the assessment omitted.`],
    };
  });
  return { ...s, hypotheses, findings, updatedAt: now() };
}

export function activeHypotheses(s: DiscoverySession) {
  return s.hypotheses.filter((h) => !h.supersededBy);
}

export function realEvidenceCount(s: DiscoverySession) {
  return s.evidence.filter(countsAsEvidence).length;
}

// ---------- FR-09: challenge vague customers and unsupported claims ----------

const VAGUE_CUSTOMER = [
  /\b(every|any)\s?(one|body)\b/i,
  /\ball (people|users|businesses|customers|smes|consumers)\b/i,
  /\b(the )?(general )?public\b/i,
  /\bpeople\b(?! who| that| aged| in| with)/i,
  /\bmillennials\b|\bgen ?z\b/i,
  /\bsmes?\b(?! (in|that|who|with|selling|run))/i,
  /\bconsumers\b/i,
];

const UNSUPPORTED_CLAIM = [
  /\b(definitely|certainly|surely|obviously|guaranteed|for sure)\b.*\b(buy|pay|use|want|love|need)\b/i,
  /\b(everyone|everybody|all of them|no one|nobody)\b.*\b(buy|pay|use|want|love|need|would)\b/i,
  /\b(will|would) (all )?(love|buy|pay for|use) (it|this|my|our)\b/i,
  /\bhuge (market|demand)\b|\bno competition\b|\bno competitors\b/i,
  /\bbillion(s)? (people|users)\b/i,
];

export interface LintNote { kind: "vague_customer" | "unsupported_claim" | "personal_data"; message: string }

export function lintText(text: string): LintNote[] {
  const notes: LintNote[] = [];
  if (VAGUE_CUSTOMER.some((r) => r.test(text)))
    notes.push({
      kind: "vague_customer",
      message:
        "Customer description is too broad. Name a specific segment: who exactly, where, doing what, and who feels the problem most (early adopters).",
    });
  if (UNSUPPORTED_CLAIM.some((r) => r.test(text)))
    notes.push({
      kind: "unsupported_claim",
      message:
        "This is a claim, not evidence. What have real customers actually done (paid, built a workaround, switched) that shows this?",
    });
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text) || /(\+?\d[\d\s-]{8,}\d)/.test(text))
    notes.push({
      kind: "personal_data",
      message:
        "Looks like an email or phone number. Please don't store customers' personal details - describe them by role instead (e.g. 'Interview 2 - school bursar').",
    });
  return notes;
}

// ---------- FR-13/14/16: interview question linting ----------

const Q_RULES: { re: RegExp; issue: QuestionFlag["issue"]; explanation: string; suggestion: string }[] = [
  {
    re: /\bwould you (buy|pay|use|subscribe|switch|recommend|download|try)\b/i,
    issue: "hypothetical",
    explanation:
      "Asks about imagined future behaviour. People are poor predictors of what they would do and tend to say yes to be polite.",
    suggestion: "Tell me about the last time you dealt with this problem. What did you do, and what did it cost you?",
  },
  {
    re: /\bhow much would you (pay|spend)\b/i,
    issue: "hypothetical",
    explanation: "Hypothetical pricing answers are unreliable. Ask what they spend today instead.",
    suggestion: "What do you currently spend - in money or time - to deal with this?",
  },
  {
    re: /\b(will|would|could|might) you\b/i,
    issue: "future_intent",
    explanation: "Future-intent questions produce opinions, not evidence of behaviour.",
    suggestion: "Ask about a specific past occasion: 'When did this last happen? Walk me through it.'",
  },
  {
    re: /\b(our|my) (product|app|solution|platform|idea|service|tool|wallet)\b/i,
    issue: "solution_biased",
    explanation: "Introducing your solution shifts the conversation to pitching and invites polite approval.",
    suggestion: "Keep the solution out of problem interviews. Ask how they solve the problem today.",
  },
  {
    re: /\b(don't you|wouldn't you|isn't it|aren't you|do you agree|wouldn't it be)\b/i,
    issue: "leading",
    explanation: "The question signals the answer you want to hear.",
    suggestion: "Use a neutral, open prompt: 'How do you feel about...?' or 'What happens when...?'",
  },
  {
    re: /\b(great|amazing|useful|helpful|easier|better|frustrating|annoying)\b.*\?$/i,
    issue: "leading",
    explanation: "Loaded adjectives steer the answer.",
    suggestion: "Remove the adjective and ask them to describe their experience in their own words.",
  },
  {
    re: /\b(do you like|do you think|do you want|would it help)\b/i,
    issue: "leading",
    explanation: "Asks for an opinion or approval, which is cheap to give and weak evidence.",
    suggestion: "Ask what they did last time, and what they tried instead.",
  },
];

export function lintQuestion(text: string): QuestionFlag[] {
  const flags: QuestionFlag[] = [];
  const seen = new Set<string>();
  for (const r of Q_RULES) {
    if (r.re.test(text) && !seen.has(r.issue)) {
      seen.add(r.issue);
      flags.push({ issue: r.issue, explanation: r.explanation, suggestion: r.suggestion, by: "rules" });
    }
  }
  if ((text.match(/\?/g) || []).length > 1 || /\?\s*(and|or)\b/i.test(text))
    flags.push({ issue: "compound", explanation: "Two questions in one - you won't know which one they answered.", suggestion: "Split into separate questions.", by: "rules" });
  return flags;
}

// ---------- Rule 4: traceability guard for AI-recorded evidence ----------

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** AI may only record evidence the founder actually typed. Returns true if the excerpt is found in a user message. */
export function excerptFromUser(excerpt: string, userTexts: string[]): boolean {
  const ex = norm(excerpt);
  if (ex.length < 12) return false;
  return userTexts.some((t) => norm(t).includes(ex));
}

// ---------- Rule 1 + 5 guard for recommendations ----------

export function checkRecommendation(
  s: DiscoverySession,
  action: string,
  evidenceIds: string[],
): string | null {
  const real = s.evidence.filter(countsAsEvidence);
  const known = new Set(s.evidence.map((e) => e.id));
  const bad = evidenceIds.filter((id) => !known.has(id));
  if (bad.length) return `Unknown evidence ids: ${bad.join(", ")}. Cite only recorded evidence.`;
  if (real.length === 0 && (action === "solution_experiment" || action === "stop"))
    return "No real customer evidence has been recorded. All hypotheses remain Untested, so only 'continue_discovery' or 'revise_hypotheses' can be recommended.";
  if ((action === "solution_experiment" || action === "stop") && evidenceIds.length === 0)
    return "This recommendation must cite the evidence records it is based on (Rule 4).";
  if (action === "solution_experiment") {
    const ok = activeHypotheses(s).some(
      (h) => (h.type === "problem" || h.type === "customer") && h.status === "Provisionally Supported",
    );
    if (!ok)
      return "No customer or problem hypothesis is Provisionally Supported yet, so a solution experiment is premature. Recommend continue_discovery or revise_hypotheses.";
  }
  return null;
}

// ---------- FR-33: journey progress ----------

export const STAGES = [
  { key: "venture", label: "Venture" },
  { key: "hypotheses", label: "Hypotheses" },
  { key: "customers", label: "Customers & problem" },
  { key: "interview", label: "Interview guide" },
  { key: "evidence", label: "Evidence" },
  { key: "decision", label: "Decision" },
  { key: "report", label: "Report" },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];

export function stageDone(s: DiscoverySession): Record<StageKey, boolean> {
  const v = s.venture;
  const act = activeHypotheses(s);
  return {
    venture: !!(v.idea && v.targetCustomer),
    hypotheses: act.some((h) => h.approved),
    customers: v.segments.length > 0 && v.problems.length > 0,
    interview: s.questions.length >= 3,
    evidence: realEvidenceCount(s) > 0,
    decision: s.recommendations.some((r) => r.decision !== "pending"),
    report: s.recommendations.some((r) => r.decision !== "pending") && s.findings.length > 0,
  };
}

export function nextStepHint(s: DiscoverySession): string {
  const d = stageDone(s);
  if (!d.venture) return "Tell VumbuaAI about your idea and who you think the customer is.";
  if (!d.hypotheses) return "Ask VumbuaAI to turn your idea into testable hypotheses, then approve the ones you want to test.";
  if (!d.customers) return "Narrow down a specific customer segment, early adopters, and the problem they face.";
  if (!d.interview) return "Build an interview guide focused on past behaviour - ask VumbuaAI to draft one.";
  if (!d.evidence) return "Go and interview real customers, then record what they said and did in the Evidence Lab.";
  if (!d.decision) return "Ask VumbuaAI for a discovery assessment, then accept, reject or modify its recommendation.";
  return "Download your Customer Discovery Evidence Report - or revise hypotheses and run another round.";
}
