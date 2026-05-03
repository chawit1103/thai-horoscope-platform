import { approveAndQueueAction } from "../actions";
import { bootstrapDemoFlow, getMockMvpState } from "../../src/mvp/mock-flow";

export default function AdminPage() {
  bootstrapDemoFlow();
  const state = getMockMvpState();
  const drafts = state.horoscopeResults.filter((result) => result.status === "draft");

  return (
    <section className="page">
      <p className="eyebrow">Development-only admin</p>
      <h1>Admin approve และ mock notification queue</h1>
      <p className="guard">Development-only admin guard: ยังไม่ใช่ production auth และไม่ส่ง notification จริง</p>

      <section className="grid">
        {drafts.map((draft) => (
          <article className="panel" key={draft.id}>
            <span className="badge">{draft.periodType}</span>
            <h2>{draft.content_json.title}</h2>
            <p>{draft.content_json.summary}</p>
            <form action={approveAndQueueAction}>
              <input type="hidden" name="resultId" value={draft.id} />
              <button type="submit">Approve + queue mock message</button>
            </form>
          </article>
        ))}
      </section>

      <section className="panel">
        <h2>Outbound queue</h2>
        <ul className="plain-list">
          {state.outboundMessages.map((message) => (
            <li key={message.id}>
              <strong>{message.topicCode}</strong> · {message.status} · {message.title}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Delivery attempts</h2>
        <ul className="plain-list">
          {state.deliveryAttempts.map((attempt) => (
            <li key={attempt.id}>
              <strong>{attempt.gateway}</strong> · {attempt.status} · {attempt.providerMessageId}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Audit logs</h2>
        <ul className="plain-list">
          {state.auditLogs.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.action}</strong> · {entry.targetId} · {entry.createdAt}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
