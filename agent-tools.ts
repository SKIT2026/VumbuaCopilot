// Tools the VumbuaAI agent can call. Every tool runs through the rules engine;
// the agent can propose and record, but cannot approve hypotheses, set statuses,
// invent evidence, or make decisions (Rules 1, 4, 5).

import type Anthropic from "@anthropic-ai/sdk";
import type { DiscoverySession, HypothesisType, Evidence } from "./types";
import { applyRules, checkRecommendation, excerptFromUser, lintQuestion, now, uid, activeHypotheses } from "./rules";

const HTYPES: HypothesisType[] = ["customer", "problem", "solution", "value_proposition", "channel", "revenue"];

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "update_venture",
    description: "Record or correct the venture basics the founder has told you (FR-02). Only use facts the founder stated.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" }, idea: { type: "string" }, solution: { type: "string" },
        target_customer: { type: "string" },
        stage: { type: "string", description: "e.g. idea, prototype, early customers, revenue" },
      },
    },
  },
  {
    name: "update_customer_discovery",
    description:
      "Add customer segments, early adopters, problems, existing alternatives or unmet needs the founder has described (FR-07, FR-08). Use 'remove' to delete items the founder asks to drop.",
    input_schema: {
      type: "object",
      properties: {
        segments: { type: "array", items: { type: "string" } },
        early_adopters: { type: "array", items: { type: "string" } },
        problems: { type: "array", items: { type: "string" } },
        alternatives: { type: "array", items: { type: "string" } },
        unmet_needs: { type: "array", items: { type: "string" } },
        remove: { type: "array", items: { type: "string" }, description: "Exact item texts to remove from any list" },
      },
    },
  },
  {
    name: "propose_hypotheses",
    description:
      "Propose falsifiable hypotheses (FR-03). They are added as UNAPPROVED drafts; the founder must approve them in the Hypotheses panel. Write each as a specific, testable statement: who, what problem/behaviour, measurable where possible.",
    input_schema: {
      type: "object",
      properties: {
        hypotheses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: HTYPES },
              statement: { type: "string" },
              priority: { type: "integer", description: "1 = riskiest, test first" },
            },
            required: ["type", "statement"],
          },
        },
      },
      required: ["hypotheses"],
    },
  },
  {
    name: "revise_hypothesis",
    description:
      "Propose a revised version of an existing hypothesis (FR-29, Rule 6). The original is preserved; the revision is a draft the founder approves, which then supersedes the original.",
    input_schema: {
      type: "object",
      properties: { hypothesis_id: { type: "string" }, new_statement: { type: "string" }, reason: { type: "string" } },
      required: ["hypothesis_id", "new_statement", "reason"],
    },
  },
  {
    name: "set_priorities",
    description: "Reorder hypotheses for testing, riskiest first (FR-10). Pass hypothesis ids in priority order.",
    input_schema: {
      type: "object",
      properties: { order: { type: "array", items: { type: "string" } } },
      required: ["order"],
    },
  },
  {
    name: "add_interview_questions",
    description:
      "Add questions to the interview guide (FR-12, FR-14). Questions must ask about past experiences, behaviours, spend and existing alternatives - not opinions about the solution. The rules engine lints every question and returns any flags; fix flagged questions.",
    input_schema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              hypothesis_ids: { type: "array", items: { type: "string" } },
              purpose: { type: "string", description: "What this question tests and why it yields reliable evidence" },
            },
            required: ["text", "hypothesis_ids"],
          },
        },
        replace_all: { type: "boolean", description: "Replace the whole guide instead of appending" },
      },
      required: ["questions"],
    },
  },
  {
    name: "critique_question",
    description:
      "Flag a problem with a question in the guide that the rules engine missed (FR-13, FR-16), with an explanation and an improved version.",
    input_schema: {
      type: "object",
      properties: {
        question_id: { type: "string" },
        issue: { type: "string", enum: ["leading", "hypothetical", "solution_biased", "future_intent", "compound", "yes_no"] },
        explanation: { type: "string" },
        suggestion: { type: "string" },
      },
      required: ["question_id", "issue", "explanation", "suggestion"],
    },
  },
  {
    name: "record_evidence",
    description:
      "Record an observation from a REAL interview that the founder has described in chat (FR-17-19). You MUST pass source_excerpt: an exact phrase (12+ characters) copied from the founder's message. Never invent, extrapolate or embellish evidence. Classify kind carefully: 'statement' = what the customer said; 'behaviour' = something the customer actually did or does (past action, spend, workaround); 'interpretation' = the founder's own reading. For role-play/rehearsal answers set simulated=true.",
    input_schema: {
      type: "object",
      properties: {
        hypothesis_id: { type: "string" },
        interview_ref: { type: "string", description: "Short anonymous label, e.g. 'Interview 3 - school bursar'" },
        context: { type: "string" },
        kind: { type: "string", enum: ["statement", "behaviour", "interpretation"] },
        observation: { type: "string" },
        direction: { type: "string", enum: ["supports", "contradicts", "neutral"] },
        source_excerpt: { type: "string" },
        simulated: { type: "boolean" },
      },
      required: ["hypothesis_id", "interview_ref", "kind", "observation", "direction", "source_excerpt"],
    },
  },
  {
    name: "record_assessment",
    description:
      "Record an evidence assessment for one hypothesis (FR-20, FR-22). Cite evidence ids for every claim. Include ALL contradicting evidence - the rules engine restores anything you omit. List information gaps.",
    input_schema: {
      type: "object",
      properties: {
        hypothesis_id: { type: "string" },
        summary: { type: "string" },
        supporting_ids: { type: "array", items: { type: "string" } },
        contradicting_ids: { type: "array", items: { type: "string" } },
        gaps: { type: "array", items: { type: "string" } },
      },
      required: ["hypothesis_id", "summary", "supporting_ids", "contradicting_ids", "gaps"],
    },
  },
  {
    name: "recommend_next_action",
    description:
      "Recommend a next action (FR-24-27). The founder accepts, rejects or modifies it - you never decide. Explain the evidence and the uncertainty. The rules engine rejects validating recommendations that lack real evidence.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["continue_discovery", "revise_hypotheses", "solution_experiment", "stop"] },
        rationale: { type: "string" },
        evidence_ids: { type: "array", items: { type: "string" } },
        uncertainty: { type: "string" },
        unresolved: { type: "array", items: { type: "string" }, description: "Unresolved assumptions and inconsistencies (FR-25)" },
        experiment: { type: "string", description: "Concrete next experiment: what, with whom, success threshold" },
      },
      required: ["action", "rationale", "evidence_ids", "uncertainty", "unresolved"],
    },
  },
];

export interface ToolResult { state: DiscoverySession; result: string; isError?: boolean; action?: string }

const addUnique = (list: string[], items?: string[]) => {
  const out = [...list];
  for (const raw of items || []) {
    const i = String(raw ?? "").trim();
    if (i && !out.some((x) => x.toLowerCase() === i.toLowerCase())) out.push(i);
  }
  return out;
};

const ARRAY_KEYS = [
  "segments", "early_adopters", "problems", "alternatives", "unmet_needs", "remove", "order", "questions",
  "hypotheses", "evidence_ids", "unresolved", "supporting_ids", "contradicting_ids", "gaps", "hypothesis_ids",
];

/** Models occasionally send an array as a JSON string or a single value - normalise before use. */
function toArray(x: unknown): any[] {
  if (Array.isArray(x)) return x;
  if (x == null || x === "") return [];
  if (typeof x === "string") {
    const t = x.trim();
    if (t.startsWith("[")) { try { const p = JSON.parse(t); if (Array.isArray(p)) return p; } catch { /* fall through */ } }
    return [t];
  }
  return [x];
}

export function normaliseInput(input: unknown): Record<string, any> {
  let obj: any = input;
  if (typeof obj === "string") { try { obj = JSON.parse(obj); } catch { obj = {}; } }
  if (!obj || typeof obj !== "object") obj = {};
  const out: Record<string, any> = { ...obj };
  for (const k of ARRAY_KEYS) if (k in out) out[k] = toArray(out[k]);
  for (const k of ["hypotheses", "questions"]) {
    if (Array.isArray(out[k])) out[k] = out[k].map((it: any) => {
      if (typeof it === "string") return k === "questions" ? { text: it, hypothesis_ids: [] } : { type: "problem", statement: it };
      return it && typeof it === "object" && "hypothesis_ids" in it ? { ...it, hypothesis_ids: toArray(it.hypothesis_ids) } : it;
    });
  }
  return out;
}

/** Never let one bad tool call crash the whole reply - return the problem to the model instead. */
export function runTool(
  s0: DiscoverySession,
  name: string,
  rawInput: unknown,
  ctx: { userTexts: string[] },
): ToolResult {
  try {
    return runToolInner(s0, name, normaliseInput(rawInput), ctx);
  } catch (e: any) {
    console.error(`[VumbuaAI] tool ${name} failed:`, e?.message);
    return { state: s0, result: `Tool error in ${name}: ${e?.message || "unknown error"}. Check the input format and try again.`, isError: true };
  }
}

function runToolInner(
  s0: DiscoverySession,
  name: string,
  input: Record<string, any>,
  ctx: { userTexts: string[] },
): ToolResult {
  const s: DiscoverySession = structuredClone(s0);
  const err = (m: string): ToolResult => ({ state: s0, result: m, isError: true });
  const findH = (id: string) => s.hypotheses.find((h) => h.id === id);

  switch (name) {
    case "update_venture": {
      const v = s.venture;
      if (input.name) { v.name = input.name; s.title = input.name; }
      if (input.idea) v.idea = input.idea;
      if (input.solution) v.solution = input.solution;
      if (input.target_customer) v.targetCustomer = input.target_customer;
      if (input.stage) v.stage = input.stage;
      return { state: applyRules(s), result: "Venture updated.", action: "Updated venture details" };
    }
    case "update_customer_discovery": {
      const v = s.venture;
      v.segments = addUnique(v.segments, input.segments);
      v.earlyAdopters = addUnique(v.earlyAdopters, input.early_adopters);
      v.problems = addUnique(v.problems, input.problems);
      v.alternatives = addUnique(v.alternatives, input.alternatives);
      v.unmetNeeds = addUnique(v.unmetNeeds, input.unmet_needs);
      const rm = new Set((input.remove || []).map((x: unknown) => String(x).toLowerCase()));
      if (rm.size) for (const k of ["segments", "earlyAdopters", "problems", "alternatives", "unmetNeeds"] as const)
        v[k] = v[k].filter((x) => !rm.has(x.toLowerCase()));
      return { state: applyRules(s), result: "Customer discovery map updated.", action: "Updated customers & problem map" };
    }
    case "propose_hypotheses": {
      const items = (input.hypotheses || []).filter((h: any) => HTYPES.includes(h.type) && h.statement);
      if (!items.length) return err("No valid hypotheses supplied.");
      const base = activeHypotheses(s).length;
      const added = items.map((h: any, i: number) => ({
        id: uid("h_"), type: h.type, statement: h.statement.trim(), approved: false, source: "ai" as const,
        priority: h.priority || base + i + 1, status: "Untested" as const, createdAt: now(),
      }));
      s.hypotheses.push(...added);
      return {
        state: applyRules(s),
        result: `Added ${added.length} draft hypotheses (ids: ${added.map((a: any) => a.id).join(", ")}). They are unapproved and Untested until the founder approves them and real evidence is recorded. Ask the founder to review them in the Hypotheses panel.`,
        action: `Proposed ${added.length} hypotheses for your approval`,
      };
    }
    case "revise_hypothesis": {
      const old = findH(input.hypothesis_id);
      if (!old) return err("Unknown hypothesis_id.");
      const h = {
        ...old, id: uid("h_"), statement: input.new_statement, approved: false, source: "ai" as const,
        revisionOf: old.id, revisionReason: input.reason, supersededBy: undefined, createdAt: now(),
      };
      s.hypotheses.push(h);
      return { state: applyRules(s), result: `Draft revision ${h.id} created; original ${old.id} is preserved until the founder approves the revision.`, action: "Proposed a hypothesis revision" };
    }
    case "set_priorities": {
      (input.order || []).forEach((id: string, i: number) => { const h = findH(id); if (h) h.priority = i + 1; });
      return { state: applyRules(s), result: "Priorities updated.", action: "Re-prioritised assumptions" };
    }
    case "add_interview_questions": {
      const qs = (input.questions || []).filter((q: any) => q && typeof q.text === "string" && q.text.trim()).map((q: any) => ({
        id: uid("q_"), text: q.text.trim(), hypothesisIds: q.hypothesis_ids || [], purpose: q.purpose, flags: lintQuestion(q.text),
      }));
      s.questions = input.replace_all ? qs : [...s.questions, ...qs];
      const flagged = qs.filter((q: any) => q.flags.length);
      return {
        state: applyRules(s),
        result: flagged.length
          ? `Added ${qs.length} questions. Rules engine flagged ${flagged.length}: ${flagged.map((q: any) => `${q.id} "${q.text}" -> ${q.flags.map((f: any) => f.issue).join("/")}`).join("; ")}. Explain the issue to the founder and replace them with past-behaviour questions.`
          : `Added ${qs.length} questions; none flagged.`,
        action: `Added ${qs.length} interview questions`,
      };
    }
    case "critique_question": {
      const q = s.questions.find((x) => x.id === input.question_id);
      if (!q) return err("Unknown question_id.");
      q.flags.push({ issue: input.issue, explanation: input.explanation, suggestion: input.suggestion, by: "ai" });
      return { state: applyRules(s), result: "Flag added.", action: "Flagged an interview question" };
    }
    case "record_evidence": {
      const h = findH(input.hypothesis_id);
      if (!h) return err("Unknown hypothesis_id.");
      if (!h.approved) return err("That hypothesis is not approved yet. Ask the founder to approve it first.");
      const simulated = !!input.simulated;
      if (!simulated && !excerptFromUser(input.source_excerpt || "", ctx.userTexts))
        return err(
          "REJECTED by rules engine (Rule 4 - traceability): source_excerpt was not found in the founder's messages. You may only record what the founder actually reported from a real interview. Ask the founder for the details instead.",
        );
      const e: Evidence = {
        id: uid("e_"), hypothesisId: h.id, interviewRef: input.interview_ref, context: input.context || "",
        kind: input.kind, observation: input.observation, direction: input.direction, simulated,
        recordedBy: "ai_from_user_message", createdAt: now(),
      };
      s.evidence.push(e);
      const next = applyRules(s);
      const st = next.hypotheses.find((x) => x.id === h.id)!.status;
      return {
        state: next,
        result: `Evidence ${e.id} recorded${simulated ? " as SIMULATED (excluded from scoring)" : ""}. Hypothesis status (computed by rules): ${st}.`,
        action: simulated ? "Logged a simulated (rehearsal) response" : "Recorded interview evidence",
      };
    }
    case "record_assessment": {
      const h = findH(input.hypothesis_id);
      if (!h) return err("Unknown hypothesis_id.");
      const known = new Set(s.evidence.map((e) => e.id));
      const cited = [...(input.supporting_ids || []), ...(input.contradicting_ids || [])];
      const bad = cited.filter((id: string) => !known.has(id));
      if (bad.length) return err(`Unknown evidence ids ${bad.join(", ")} - cite only recorded evidence (Rule 4).`);
      s.findings = s.findings.filter((f) => f.hypothesisId !== h.id);
      s.findings.push({
        id: uid("f_"), hypothesisId: h.id, summary: input.summary, supportingIds: input.supporting_ids || [],
        contradictingIds: input.contradicting_ids || [], gaps: input.gaps || [], ruleNotes: [], createdAt: now(),
      });
      const next = applyRules(s);
      const f = next.findings.find((x) => x.hypothesisId === h.id)!;
      return {
        state: next,
        result: `Assessment saved.${f.ruleNotes.length ? " " + f.ruleNotes.join(" ") : ""} Status (computed): ${next.hypotheses.find((x) => x.id === h.id)!.status}.`,
        action: "Saved an evidence assessment",
      };
    }
    case "recommend_next_action": {
      const problem = checkRecommendation(s, input.action, input.evidence_ids || []);
      if (problem) return err("REJECTED by rules engine: " + problem);
      s.recommendations.push({
        id: uid("r_"), action: input.action, rationale: input.rationale, evidenceIds: input.evidence_ids || [],
        uncertainty: input.uncertainty, unresolved: input.unresolved || [], experiment: input.experiment,
        decision: "pending", createdAt: now(),
      });
      return { state: applyRules(s), result: "Recommendation saved as PENDING. The founder must accept, reject or modify it in the Decision panel.", action: "Made a recommendation for your decision" };
    }
    default:
      return err(`Unknown tool ${name}`);
  }
}

/** Compact snapshot of the session for the model's context. */
export function sessionSnapshot(s: DiscoverySession) {
  return JSON.stringify({
    venture: s.venture,
    hypotheses: s.hypotheses.map((h) => ({
      id: h.id, type: h.type, statement: h.statement, approved: h.approved, priority: h.priority, status: h.status,
      supersededBy: h.supersededBy, revisionOf: h.revisionOf,
    })),
    questions: s.questions.map((q) => ({ id: q.id, text: q.text, hypothesisIds: q.hypothesisIds, flags: q.flags.map((f) => f.issue) })),
    evidence: s.evidence.map((e) => ({
      id: e.id, hypothesisId: e.hypothesisId, interview: e.interviewRef, kind: e.kind, direction: e.direction,
      simulated: e.simulated, observation: e.observation,
    })),
    findings: s.findings.map((f) => ({ hypothesisId: f.hypothesisId, summary: f.summary, gaps: f.gaps })),
    recommendations: s.recommendations.map((r) => ({ action: r.action, decision: r.decision, founderNote: r.founderNote })),
  });
}
