import { approveAndQueueAction, rejectDraftAction, requireAdminSession } from "../actions";
import { bootstrapDemoFlow, getMockMvpState } from "../../src/mvp/mock-flow";

export default async function AdminPage() {
  const adminSession = await requireAdminSession();
  const sessionId = adminSession.sessionId;

  bootstrapDemoFlow(sessionId, "user_mock_001");
  const state = getMockMvpState(sessionId);
  const drafts = state.horoscopeResults.filter((result) => result.status === "draft");

  return (
    <section className="page">
      <p className="eyebrow">Protected admin</p>
      <h1>Admin approve และ mock notification queue</h1>
      <p className="lead">Role: {adminSession.role}. Actor: {adminSession.actorId}.</p>
      <div className="actions">
        <a className="button-link secondary" href="/admin/operator">Open beta operator console</a>
      </div>
      <section className="grid">
        {drafts.map((draft) => (
          <article className="panel" key={draft.id}>
            <span className="badge">{draft.periodType}</span><h2>{draft.content_json.title}</h2><p>{draft.content_json.summary}</p>
            <form action={approveAndQueueAction}><input type="hidden" name="resultId" value={draft.id} /><button type="submit">Approve + queue mock message</button></form>
            <form action={rejectDraftAction}><input type="hidden" name="resultId" value={draft.id} /><button type="submit">Reject draft</button></form>
          </article>
        ))}
      </section>
    </section>
  );
}
