// VumbuaAI background knowledge - read by the agent before every reply.
// Condensed and paraphrased from course material supplied by the project team.
// To extend: add a new section below, keep it concise, then redeploy.

export const KNOWLEDGE = `
# Background knowledge: the Customer Discovery playbook

Use this playbook to structure your coaching. It sits alongside Blank and Dorf; the methodology rules in your instructions always take priority (no evidence, no validation; behaviour over enthusiasm; the founder decides).

## Why it matters
- The most common reason early-stage ventures fail is building something for a problem that isn't worth solving, or for a market that is too small.
- Discovery applies to new ventures and to established firms launching new products, new customer groups or new markets.
- Discovery should be done properly before building. It answers: who the prospective customers are, what problems they face, how they solve them today, what they need versus what they merely want, how big the market is, and whether the opportunity is worth pursuing.
- Techniques: customer interviews (primary), ethnography/observation, customer journey mapping.

## The five-step process
1. Define the hypothesis
2. Identify a user persona
3. Validate the hypothesis, then a gate check (go / no-go)
4. Take the validated idea to a Minimum Viable Product (MVP), then a gate check
5. Move from MVP to scale

VumbuaAI's core scope is steps 1-3. Steps 4-5 are where a "solution experiment" recommendation leads; only discuss them in depth once customer and problem hypotheses are Provisionally Supported.

## Step 1 - Define the hypothesis
Help the founder document answers to each of these. Missing answers are assumptions to test, not facts:
- What is the problem?
- Why is it a problem? Ask "why?" repeatedly (the 5 Whys) until you reach the root cause and the "so what". A fishbone (Ishikawa) diagram is an alternative. A solution should only be designed once the root cause is understood. Not every chain needs all five whys.
- Where does it occur? When (is there a trigger or deadline, e.g. a new regulation)?
- How would the customer use a solution, and to achieve what?
- Buying process: who decides, who pays, how purchases happen.
- Buying imperative: what forces the customer to act now?
- Adoption barriers: cost, trust, switching effort, habit, regulation.
- Pain of the status quo: how costly is the current way? Quantify where possible.
- Available alternatives and competitors: including "do nothing" and workarounds.
- Why us: the founder's specific advantages.
Pattern of a well-structured hypothesis: "(What) [customer] needs [capability] (Why) so that [outcome], because [root cause chain] (Where) in [place] (When) from [date/trigger] (Imperative) [why they must act] (Alternatives) [current options] (Pain) [quantified, e.g. willing to pay X per month] (Competitors) [named] (Why us) [reasons]."
When drafting hypotheses, break this into separate testable statements (customer, problem, value proposition, channel, revenue). A willingness-to-pay figure is a revenue hypothesis to test, never a fact.

## Step 2 - Identify a persona
- A persona is a fictional but research-based profile of one specific user type who has the problem. Define it as narrowly as possible, with as many concrete characteristics as possible (role, situation, location, behaviours, goals).
- Questions: who has the problem; what problems we think they have; what solutions we think would help; what they have in common; where they are.
- Expect to create several personas, and test hypotheses against each persona separately. Grouping personas dilutes the problem and therefore the solution. "You cannot be everything to everybody - start narrow before going broad."
- Personas guide recruitment: interview real people who match the persona.

## Step 3 - Validate the hypothesis
Objective: gather evidence that proves or disproves the hypothesis (or reveals a new one) and refines the product idea.
- Recruit people/companies who match the persona. Talk to enough of them that patterns are credible; discourage conclusions from one or two conversations.
- Interview technique:
  - Ask them to describe the current process: "Walk me through the steps...", "What does a typical day look like?", "If you could do it differently, what would you change?", "How?", "Why?"
  - Explore past behaviour: "Tell me about the last time you..."
  - Use the 5 Whys to reach root causes.
  - Listen far more than you talk - aim for at least four times as much listening (the "two big ears, one small mouth" principle).
  - Learn, don't pitch or sell.
  - Never ask leading questions, never interview for sentiment ("would you like...?"), never accept an answer without probing further.
- Also: competitive research; later, test a high-fidelity prototype with prospects; establish willingness to pay; size the target market; secure commitments.
- Key measures - competitive: how many competitors; what problems and features they address; what differentiates the founder; can the solution be clearly better (around twice as good) to overcome switching costs?
- Key measures - customer funnel. Encourage founders to track these numbers:
  1. Prospects spoken to
  2. Prospects who showed interest
  3. Interested prospects who signed a Letter of Intent (LOI)
  4. Prospects who committed a specific amount they would pay ("committed customers")
  Interest alone is weak evidence; LOIs and payment commitments are strong behavioural evidence.

## Step 3 gate check (go / no-go)
Before moving to an MVP, weigh the opportunity against alternatives:
- Cost and time to build and implement
- Schedule: timing relative to the customer's business rhythm
- SAM and SOM: extrapolate from research to the Serviceable Available Market and Serviceable Obtainable Market
- Lifetime value (LTV) of a customer
- Moat: does it strengthen competitive position, and how?
- Revenue implied by SAM/SOM
- Plan for the next phase: capital, resources, dependencies across cost, scope, schedule and quality
Outcome: an estimated ROI, a prioritisation against other opportunities, and a decision record (log the decision and update the roadmap).
In VumbuaAI, the founder records this decision in the Decision panel; your role is to set out the evidence and gaps for each factor, not to decide.

## Step 4 - From validated idea to MVP (for context)
- Build the MVP from the validated design; demo it during development; check usage (are they using it?) and value (are they happy?); refine market research; develop messaging that resonates; segment ideal prospects; identify channels to reach them at scale.
- Measures: build progress against budget, schedule, scope and quality; which features are and aren't used; how many committed customers followed through, gave strong testimonials, use it unassisted or needed help; whether onboarding learnings can be systemised; waiting-list sign-ups; channels identified.
- Step 4 gate check: refine ROI with development, implementation and sustainment costs; weigh desirability and urgency (can costs shift to customers?); refine SAM, SOM, LTV and revenue; plan capital and resources for scaling.

## How to use this knowledge
- When a founder is vague about the problem, run the 5 Whys with them.
- When the persona is broad, push for one narrow persona first and suggest testing others separately.
- When suggesting next actions, refer to the customer funnel numbers (spoken to, interested, LOI, committed) and ask for them.
- When a recommendation approaches a go/no-go, walk through the gate-check factors and flag which ones lack evidence.
- Refer to the steps by name so founders learn the process ("You're in Step 2: Identify a persona").
`;
