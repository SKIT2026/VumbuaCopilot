import Link from "next/link";

export default function Privacy() {
  return (
    <main className="home">
      <Link href="/">&larr; Back to VumbuaAI</Link>
      <h1 style={{ marginTop: 16 }}>Privacy and data</h1>
      <div className="card stack">
        <h3>What is stored</h3>
        <p>Your venture details, hypotheses, interview guide, the evidence you record, AI assessments, your decisions and the chat history of each discovery session.</p>
        <h3>Where and for how long</h3>
        <p>No account is needed. Your sessions are saved only in your own browser on this device - they are not stored on our servers. They stay until you delete them or clear your browser's site data. Download your Evidence Report to keep a permanent copy.</p>
        <h3>AI processing</h3>
        <p>When you message VumbuaAI, your message and a summary of the session are sent to Anthropic's Claude API to generate guidance. The API key stays on our server and is never sent to your browser.</p>
        <h3>Please minimise personal information</h3>
        <p>Describe interviewees by role and setting (for example "Interview 3 - school bursar, Lusaka") rather than names, phone numbers or emails. VumbuaAI warns you if it detects contact details.</p>
        <h3>Correcting and deleting</h3>
        <p>Every hypothesis, question and evidence record can be edited or deleted inside a session. Whole sessions can be deleted from the home page or the session menu. Deleting is permanent.</p>
        <h3>AI guidance is not fact</h3>
        <p>AI assessments are guidance to help you think. Hypothesis statuses come from fixed rules applied to the evidence you record, and every decision remains yours.</p>
      </div>
    </main>
  );
}
