import { cookies } from "next/headers";
import { approveAndQueueAction, startMockAdminSessionAction } from "../actions";
import { bootstrapDemoFlow, getMockMvpState } from "../../src/mvp/mock-flow";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("mock-session-id")?.value ?? "dev-default";
  const hasAdminSession = Boolean(cookieStore.get("mock-admin-session")?.value);

  bootstrapDemoFlow(sessionId, "user_mock_001");
  const state = getMockMvpState(sessionId);
  const drafts = state.horoscopeResults.filter((result) => result.status === "draft");

  return (
    <section className="page">
      <p className="eyebrow">Development-only admin</p>
      <h1>Admin approve และ mock notification queue</h1>
      {!hasAdminSession && (
        <section className="panel">
          <h2>Bootstrap mock admin session (development only)</h2>
          <form action={startMockAdminSessionAction}>
            <input name="adminToken" type="password" placeholder="MOCK_ADMIN_TOKEN" required />
            <button type="submit">Start mock admin session</button>
          </form>
        </section>
      )}
      <section className="grid">
        {drafts.map((draft) => (
          <article className="panel" key={draft.id}>
            <span className="badge">{draft.periodType}</span><h2>{draft.content_json.title}</h2><p>{draft.content_json.summary}</p>
            <form action={approveAndQueueAction}><input type="hidden" name="resultId" value={draft.id} /><button type="submit" disabled={!hasAdminSession}>Approve + queue mock message</button></form>
          </article>
        ))}
      </section>
    </section>
  );
}
