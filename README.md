# VumbuaAI - Customer Discovery Co-Pilot

*"Vumbua" is Swahili for "discover".* VumbuaAI is a conversational AI agent that helps early-stage entrepreneurs test customer and business-model assumptions using Blank and Dorf's Customer Discovery method. Founders chat with it like a coach; it updates a structured workspace (hypotheses, interview guide, evidence, decisions) and produces a Customer Discovery Evidence Report.

**Core principle:** the app helps founders discover and interpret evidence - it never manufactures evidence or makes decisions for them. The methodology is enforced in code (`lib/rules.ts`), not just in AI prompts.

## Architecture

| Layer | Technology | Files |
|---|---|---|
| Web application | Next.js 15 / React 19, responsive, keyboard-accessible | `app/`, `components/` |
| Application backend | Next.js API route: session validation, rate limiting, business rules, agent loop | `app/api/agent/route.ts`, `lib/rules.ts` |
| AI service | Anthropic Claude via tool use (10 tools) | `lib/agent-tools.ts`, `lib/prompt.ts` |
| Data storage | Supabase Postgres + Auth with row-level security; browser fallback | `lib/store.ts`, `supabase/schema.sql` |
| Hosting | Vercel | - |

### How the agent works
1. The founder sends a chat message. The backend runs deterministic checks (vague customer, unsupported claim, personal data) and appends a `[Rules engine]` note the AI must address.
2. Claude replies and calls tools (`propose_hypotheses`, `add_interview_questions`, `record_evidence`, `record_assessment`, `recommend_next_action`, etc.) to update the workspace - up to 8 tool rounds per message.
3. Every tool call passes through the rules engine, which can **reject** it (e.g. invented evidence, a solution experiment with no evidence) and tells the AI why.
4. The updated session is returned and saved.

### Business rules enforced in code
| Rule | Enforcement |
|---|---|
| 1. No evidence, no validation | Statuses are computed by `computeStatus()`; the AI cannot set them. No real evidence = Untested. Validating recommendations without evidence are rejected. |
| 2. Behaviour over enthusiasm | Provisionally Supported needs 3+ supporting observations, 2+ interviews and at least one observed behaviour. Opinions alone cap at Evidence Emerging. Founder interpretations and simulated responses never count. |
| 3. Contradictions stay visible | `applyRules()` restores any contradicting evidence an AI assessment omits and notes it. Evidence Lab shows supporting and contradicting side by side. |
| 4. Traceability | AI-recorded evidence must quote an exact excerpt from the founder's own messages; assessments and recommendations may only cite existing evidence ids. |
| 5. Human-led decisions | AI hypotheses arrive as unapproved drafts; recommendations arrive as pending. Only the founder can approve, accept, reject or modify. |
| 6. Iteration | Revisions create a new version and preserve the original and its evidence in revision history. |

## Setup (about 15 minutes)

### 1. Supabase
1. Create a free project at supabase.com.
2. SQL Editor -> New query -> paste `supabase/schema.sql` -> Run.
3. Authentication -> Providers -> Email: enabled. For a classroom demo you may turn off "Confirm email" so students can sign in immediately.
4. Project Settings -> API: copy the **Project URL** and **anon public key**.

### 2. Anthropic
Create an API key at console.anthropic.com and set a monthly spend limit.

### 3. Environment variables (Vercel -> Project -> Settings -> Environment Variables)
| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your Claude key (server-only - never prefix with NEXT_PUBLIC_) |
| `ANTHROPIC_MODEL` | optional, default `claude-sonnet-5-5` |
| `RATE_LIMIT_PER_HOUR` | optional, default `60` per user |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

Then redeploy.

**Sign-in is on by default**, so each user keeps a saved history across devices. For open access without accounts (sessions saved only in the visitor's browser), add `NEXT_PUBLIC_REQUIRE_LOGIN=false` in Vercel and redeploy.

### Background knowledge
VumbuaAI reads `lib/knowledge.ts` before every reply (currently the five-step Customer Discovery playbook: hypothesis, persona, validation, gate checks, MVP). Add new sections there to teach it more.

### Local development
```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
npm test                     # business-rule and agent-guard checks
```

## Acceptance tests (lecturer demo script)

| # | Test | How to run it | Expected |
|---|---|---|---|
| 1 | Vague customer | Chat: "Everyone needs my app" | Rules engine note + AI asks for a specific segment and early adopters |
| 2 | Unsupported claim | Chat: "Customers will definitely buy it" | AI asks what customers have actually done; does not endorse |
| 3 | Leading question | Interview coach -> add "Would you buy our product?" (or ask the AI to review it) | Flagged hypothetical + solution-biased, with explanation and a better question |
| 4 | Mixed evidence | Evidence Lab -> record 3 supporting (one as observed behaviour) + 1 contradicting from 4 interviews | Both columns shown; contradiction visible in status, assessment and report |
| 5 | No interviews | Decision tab before recording evidence; or ask the AI to recommend a solution experiment | "No real customer evidence... remain Untested"; AI recommendation rejected by rules engine |
| 6 | Revision | Hypotheses -> Revise a tested problem hypothesis | New version active; original and its evidence kept in revision history |
| 7 | Full process | Get assessment -> accept recommendation -> Report | Structured report with next action; Download PDF / Markdown |
| 8 | AI failure | Tick "Demo: simulate AI outage", send a message | Message preserved, clear error, Retry button; untick and retry succeeds |

`npm test` runs automated checks for tests 1-6 and the agent guards (18 checks).

## Requirements traceability
- **Module A** FR-01-06: home page (create/resume), Venture tab, `propose_hypotheses` + approve/edit, computed statuses, autosave.
- **Module B** FR-07-11: Customers & problem lists, `lintText`, priority ordering, six hypothesis types incl. value proposition, channel, revenue.
- **Module C** FR-12-16: AI-drafted guide, `lintQuestion` + `critique_question`, edit/reorder/export, explanations.
- **Module D** FR-17-23: Evidence form + chat logging, statement/behaviour/interpretation, four statuses, linked findings, simulated flag excluded.
- **Module E** FR-24-29: Decision tab, unresolved assumptions, four actions, rationale + uncertainty, accept/reject/modify, revisions.
- **Module F** FR-30-34: Report tab, PDF (print) + Markdown, journey stepper + next-step hint, edit/delete everywhere.
- **NFRs**: labelled controls and keyboard navigation (01-02); loading state and 60s timeout (03); key server-side only (04); personal-data warnings and privacy page (05-06); local copy + retry (07); "AI guidance, not verified fact" labels (08); per-user hourly limit, 8-round cap, 2,000-token replies, 4,000-char inputs (09); Vercel URL (10).
