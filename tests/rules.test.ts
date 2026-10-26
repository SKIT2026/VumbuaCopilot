// Rule-level checks for the lecturer's acceptance tests. Run: npm test
import assert from "node:assert/strict";
import {
  applyRules, checkRecommendation, excerptFromUser, lintQuestion, lintText, newSession, uid, now,
} from "../lib/rules";
import type { Evidence, Hypothesis } from "../lib/types";

let pass = 0;
const t = (name: string, fn: () => void) => { fn(); pass++; console.log("  ok -", name); };

const hyp = (over: Partial<Hypothesis> = {}): Hypothesis => ({
  id: uid("h_"), type: "problem", statement: "Market traders lose sales because customers lack cash",
  approved: true, source: "ai", priority: 1, status: "Untested", createdAt: now(), ...over,
});
const ev = (h: string, over: Partial<Evidence>): Evidence => ({
  id: uid("e_"), hypothesisId: h, interviewRef: "Interview 1", context: "", kind: "statement",
  observation: "x", direction: "supports", simulated: false, recordedBy: "user", createdAt: now(), ...over,
});

console.log("UAT rule checks");

t("UAT1 'Everyone needs my app' is flagged as vague", () => {
  assert.ok(lintText("Everyone needs my app").some((n) => n.kind === "vague_customer"));
});

t("UAT2 'Customers will definitely buy it' is flagged as unsupported", () => {
  assert.ok(lintText("Customers will definitely buy it").some((n) => n.kind === "unsupported_claim"));
});

t("UAT3 'Would you buy our product?' flagged hypothetical + solution-biased", () => {
  const issues = lintQuestion("Would you buy our product?").map((f) => f.issue);
  assert.ok(issues.includes("hypothetical"));
  assert.ok(issues.includes("solution_biased"));
});

t("Good past-behaviour question is not flagged", () => {
  assert.equal(lintQuestion("Tell me about the last time a customer could not pay you in cash.").length, 0);
});

t("UAT4 3 supporting + 1 contradicting: both visible, not Contradicted", () => {
  const s = newSession(); const h = hyp(); s.hypotheses = [h];
  s.evidence = [
    ev(h.id, { interviewRef: "I1" }), ev(h.id, { interviewRef: "I2", kind: "behaviour" }),
    ev(h.id, { interviewRef: "I3" }), ev(h.id, { interviewRef: "I4", direction: "contradicts" }),
  ];
  s.findings = [{ id: "f1", hypothesisId: h.id, summary: "", supportingIds: [s.evidence[0].id], contradictingIds: [], gaps: [], ruleNotes: [], createdAt: now() }];
  const r = applyRules(s);
  assert.equal(r.hypotheses[0].status, "Provisionally Supported");
  assert.equal(r.findings[0].contradictingIds.length, 1, "Rule 3 restores dropped contradiction");
});

t("Rule 2: opinions only never reach Provisionally Supported", () => {
  const s = newSession(); const h = hyp(); s.hypotheses = [h];
  s.evidence = [1, 2, 3, 4].map((i) => ev(h.id, { interviewRef: "I" + i }));
  assert.equal(applyRules(s).hypotheses[0].status, "Evidence Emerging");
});

t("UAT5 no interviews: hypotheses Untested and validating actions blocked", () => {
  const s = applyRules(Object.assign(newSession(), { hypotheses: [hyp()] }));
  assert.equal(s.hypotheses[0].status, "Untested");
  assert.ok(checkRecommendation(s, "solution_experiment", []));
  assert.equal(checkRecommendation(s, "continue_discovery", []), null);
});

t("FR-23 simulated responses never count", () => {
  const s = newSession(); const h = hyp(); s.hypotheses = [h];
  s.evidence = [1, 2, 3].map((i) => ev(h.id, { interviewRef: "I" + i, kind: "behaviour", simulated: true }));
  assert.equal(applyRules(s).hypotheses[0].status, "Untested");
});

t("FR-19 founder interpretation never counts", () => {
  const s = newSession(); const h = hyp(); s.hypotheses = [h];
  s.evidence = [ev(h.id, { kind: "interpretation" })];
  assert.equal(applyRules(s).hypotheses[0].status, "Untested");
});

t("Contradictions >= support -> Contradicted", () => {
  const s = newSession(); const h = hyp(); s.hypotheses = [h];
  s.evidence = [ev(h.id, {}), ev(h.id, { direction: "contradicts", interviewRef: "I2" })];
  assert.equal(applyRules(s).hypotheses[0].status, "Contradicted");
});

t("Rule 4: AI evidence must come from the founder's own words", () => {
  const user = ["Interview 2: the bursar said she chases late fees on WhatsApp every Friday"];
  assert.ok(excerptFromUser("chases late fees on WhatsApp every Friday", user));
  assert.ok(!excerptFromUser("she would happily pay K200 a month", user));
});

t("Unapproved AI proposals stay Untested even with evidence", () => {
  const s = newSession(); const h = hyp({ approved: false }); s.hypotheses = [h];
  s.evidence = [1, 2, 3].map((i) => ev(h.id, { interviewRef: "I" + i, kind: "behaviour" }));
  assert.equal(applyRules(s).hypotheses[0].status, "Untested");
});

console.log(`\n${pass} checks passed`);

// ---- agent tool guards ----
import { runTool } from "../lib/agent-tools";
console.log("\nAgent tool guards");
{
  const s = newSession(); const h = hyp(); s.hypotheses = [h];
  const ctx = { userTexts: ["Interview 1 with a bursar: she chases late bus fees on WhatsApp every Friday afternoon"] };
  t("AI cannot record invented evidence", () => {
    const r = runTool(s, "record_evidence", { hypothesis_id: h.id, interview_ref: "I1", kind: "behaviour", observation: "Would pay K500", direction: "supports", source_excerpt: "would pay K500 a month" }, ctx);
    assert.ok(r.isError && r.result.startsWith("REJECTED"));
  });
  t("AI can record evidence quoted from founder", () => {
    const r = runTool(s, "record_evidence", { hypothesis_id: h.id, interview_ref: "I1", kind: "behaviour", observation: "Chases late fees on WhatsApp weekly", direction: "supports", source_excerpt: "chases late bus fees on WhatsApp every Friday" }, ctx);
    assert.ok(!r.isError); assert.equal(r.state.evidence.length, 1);
  });
  t("AI hypotheses arrive unapproved", () => {
    const r = runTool(s, "propose_hypotheses", { hypotheses: [{ type: "customer", statement: "Bursars at Lusaka private schools..." }] }, ctx);
    assert.equal(r.state.hypotheses.filter((x) => !x.approved).length, 1);
  });
  t("AI revision preserves original", () => {
    const r = runTool(s, "revise_hypothesis", { hypothesis_id: h.id, new_statement: "Revised", reason: "Interviews" }, ctx);
    assert.equal(r.state.hypotheses.length, 2); assert.ok(r.state.hypotheses.find((x) => x.id === h.id)!.statement !== "Revised");
  });
  t("AI cannot recommend solution experiment without evidence", () => {
    const r = runTool(applyRules(s), "recommend_next_action", { action: "solution_experiment", rationale: "x", evidence_ids: [], uncertainty: "x", unresolved: [] }, ctx);
    assert.ok(r.isError);
  });
  t("AI interview questions are linted", () => {
    const r = runTool(s, "add_interview_questions", { questions: [{ text: "Would you buy our product?", hypothesis_ids: [h.id] }] }, ctx);
    assert.ok(r.state.questions[0].flags.length >= 2);
  });
}
console.log(`\n${pass} checks passed`);

// ---- robustness: malformed tool inputs must not crash ----
console.log("\nTool input robustness");
{
  const s = newSession(); const h = hyp(); s.hypotheses = [h];
  const ctx = { userTexts: ["young women in Lusaka"] };
  t("segments sent as a plain string", () => {
    const r = runTool(s, "update_customer_discovery", { segments: "Young working women in Lusaka aged 22-30" }, ctx);
    assert.deepEqual(r.state.venture.segments, ["Young working women in Lusaka aged 22-30"]);
  });
  t("hypotheses sent as a JSON string", () => {
    const r = runTool(s, "propose_hypotheses", { hypotheses: JSON.stringify([{ type: "customer", statement: "Young women..." }]) }, ctx);
    assert.ok(!r.isError); assert.equal(r.state.hypotheses.length, 2);
  });
  t("questions sent as plain strings", () => {
    const r = runTool(s, "add_interview_questions", { questions: ["Tell me about the last time you saved money."] }, ctx);
    assert.equal(r.state.questions.length, 1);
  });
  t("missing order / remove never throws", () => {
    assert.ok(!runTool(s, "set_priorities", {}, ctx).isError);
    assert.ok(!runTool(s, "update_customer_discovery", { remove: "x" }, ctx).isError);
  });
  t("whole input as a JSON string", () => {
    const r = runTool(s, "update_venture", JSON.stringify({ idea: "Pension savings for young women" }), ctx);
    assert.equal(r.state.venture.idea, "Pension savings for young women");
  });
}
console.log(`\n${pass} checks passed`);
