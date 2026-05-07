import { approveContentBatchAction, rejectContentBatchAction, requireAdminSession } from "../../actions";
import { CONTENT_PREVIEW_APPROVAL_SESSION_ID, ensureContentPreviewBatchesForApprovedResults, listContentPreviewBatches } from "../../../src/mvp/content-preview-approval";

const BETA_CONTENT_APPROVAL_DOC_URL = "https://github.com/chawit1103/thai-horoscope-platform/blob/main/docs/BETA_CONTENT_APPROVAL.md";

export default async function AdminContentPreviewPage() {
  const adminSession = await requireAdminSession("/admin/content-preview");
  ensureContentPreviewBatchesForApprovedResults({ sessionId:adminSession.sessionId, approvalSessionId:CONTENT_PREVIEW_APPROVAL_SESSION_ID });
  const batches = listContentPreviewBatches(CONTENT_PREVIEW_APPROVAL_SESSION_ID);

  return (
    <section className="page">
      <p className="eyebrow">Beta approval gate</p>
      <h1>Content preview approval</h1>
      <p className="lead">Generated horoscope content is reviewed here before beta delivery. Only sanitized rule, safety, and source metadata is shown.</p>
      <div className="actions">
        <a className="button-link secondary" href="/admin">Back to admin</a>
        <a className="button-link secondary" href="/admin/operator">Operator console</a>
        <a className="button-link secondary" href={BETA_CONTENT_APPROVAL_DOC_URL}>Approval doc</a>
      </div>

      {batches.length === 0 ? (
        <section className="panel">
          <h2>No preview batches</h2>
          <p>Approve horoscope drafts or run the beta scheduler in approval mode to create preview batches.</p>
        </section>
      ) : (
        <section className="grid">
          {batches.map((batch) => (
            <article className="panel status-card" key={batch.batchId}>
              <span className="badge">{batch.approvalStatus}</span>
              <h2>{batch.batchId}</h2>
              <dl className="status-meta">
                <div><dt>Items</dt><dd>{batch.items.length}</dd></div>
                <div><dt>Updated</dt><dd>{batch.updatedAt}</dd></div>
                <div><dt>Approved</dt><dd>{batch.approvedAt ?? "Not yet"}</dd></div>
                <div><dt>Rejected</dt><dd>{batch.rejectedAt ?? "Not yet"}</dd></div>
              </dl>
              {batch.items.map((item) => (
                <section className="guard" key={item.id}>
                  <h2>{item.periodType} content</h2>
                  <dl className="status-meta">
                    <div><dt>Period</dt><dd>{item.periodKey}</dd></div>
                    <div><dt>Topic</dt><dd>{item.topicCode}</dd></div>
                    <div><dt>Profile</dt><dd>{item.contentProfileCode}</dd></div>
                    <div><dt>Channels</dt><dd>{item.deliveryChannels.join(", ") || "None"}</dd></div>
                    <div><dt>Safety</dt><dd>{item.safetyFlags.join(", ") || "none"}</dd></div>
                    <div><dt>Warnings</dt><dd>{item.warnings.map((warning) => warning.code).join(", ") || "none"}</dd></div>
                    <div><dt>Rule hits</dt><dd>{item.ruleHits.length}</dd></div>
                    <div><dt>Calculation hash</dt><dd>{item.source.calculationHash}</dd></div>
                  </dl>
                  <ul className="plain-list">
                    {Object.entries(item.sections).map(([section, body]) => (
                      <li key={section}>
                        <strong>{section}</strong>: {body}
                      </li>
                    ))}
                    {item.ruleHits.map((hit) => (
                      <li key={hit.ruleId}>
                        <strong>{hit.ruleId}</strong>: {hit.category}, weight {hit.weight}, trigger {hit.trigger}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <div className="actions">
                <form action={approveContentBatchAction}>
                  <input type="hidden" name="batchId" value={batch.batchId} />
                  <button type="submit">Approve batch</button>
                </form>
                <form action={rejectContentBatchAction}>
                  <input type="hidden" name="batchId" value={batch.batchId} />
                  <button type="submit">Reject batch</button>
                </form>
              </div>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
