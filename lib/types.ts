// VumbuaAI - core data model. One discovery session is stored as a single JSON document.

export type HypothesisType =
  | "customer"
  | "problem"
  | "solution"
  | "value_proposition"
  | "channel"
  | "revenue";

export type HypothesisStatus =
  | "Untested"
  | "Evidence Emerging"
  | "Contradicted"
  | "Provisionally Supported";

export interface Hypothesis {
  id: string;
  type: HypothesisType;
  statement: string;
  approved: boolean; // FR-04: AI proposals stay unapproved until the founder approves them
  source: "ai" | "user";
  priority: number; // FR-10: 1 = test first
  status: HypothesisStatus; // FR-21: always computed by rules.ts, never set by the AI
  supersededBy?: string; // FR-29: revisions keep the old version
  revisionOf?: string;
  revisionReason?: string;
  createdAt: string;
}

export type EvidenceKind = "statement" | "behaviour" | "interpretation"; // FR-19
export type EvidenceDirection = "supports" | "contradicts" | "neutral";

export interface Evidence {
  id: string;
  hypothesisId: string;
  interviewRef: string; // FR-18 interview context, e.g. "Interview 3 - market trader, Soweto Market"
  context: string;
  kind: EvidenceKind;
  observation: string;
  direction: EvidenceDirection;
  simulated: boolean; // FR-23: rehearsal / role-play data, never counts as evidence
  recordedBy: "user" | "ai_from_user_message";
  createdAt: string;
}

export interface InterviewQuestion {
  id: string;
  text: string;
  hypothesisIds: string[];
  purpose?: string;
  flags: QuestionFlag[];
}

export interface QuestionFlag {
  issue: "leading" | "hypothetical" | "solution_biased" | "future_intent" | "compound" | "yes_no";
  explanation: string;
  suggestion?: string;
  by: "rules" | "ai";
}

export interface Finding {
  id: string;
  hypothesisId: string;
  summary: string;
  supportingIds: string[];
  contradictingIds: string[];
  gaps: string[];
  ruleNotes: string[]; // what the rules engine corrected
  createdAt: string;
}

export type NextAction = "continue_discovery" | "revise_hypotheses" | "solution_experiment" | "stop";

export interface Recommendation {
  id: string;
  action: NextAction;
  rationale: string;
  evidenceIds: string[];
  uncertainty: string;
  unresolved: string[]; // FR-25
  experiment?: string;
  decision: "pending" | "accepted" | "rejected" | "modified"; // FR-28
  founderNote?: string;
  createdAt: string;
  decidedAt?: string;
}

export interface Venture {
  name: string;
  idea: string;
  solution: string;
  targetCustomer: string;
  stage: string;
  segments: string[];
  earlyAdopters: string[];
  problems: string[];
  alternatives: string[];
  unmetNeeds: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: string[]; // human-readable log of tool actions taken this turn
  createdAt: string;
}

export interface DiscoverySession {
  id: string;
  title: string;
  venture: Venture;
  hypotheses: Hypothesis[];
  questions: InterviewQuestion[];
  evidence: Evidence[];
  findings: Finding[];
  recommendations: Recommendation[];
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export const STATUS_HELP: Record<HypothesisStatus, string> = {
  Untested: "No real customer evidence recorded yet.",
  "Evidence Emerging": "Some real evidence, but not enough - or not behavioural enough - to lean on.",
  Contradicted: "Real evidence contradicts this as often as, or more than, it supports it.",
  "Provisionally Supported":
    "At least 3 supporting observations from 2+ interviews, including observed behaviour, and supporting evidence clearly outweighs contradictions. Still provisional.",
};

export const ACTION_LABEL: Record<NextAction, string> = {
  continue_discovery: "Continue discovery",
  revise_hypotheses: "Revise hypotheses",
  solution_experiment: "Run a solution experiment",
  stop: "Stop / pivot",
};
