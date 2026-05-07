import { createBetaInviteAction, requireAdminSession, revokeBetaInviteAction } from "../../actions";
import { getBetaLaunchState, safeBetaInviteForAdmin } from "../../../src/mvp/beta-launch";

const BETA_INVITE_DOC_URL = "https://github.com/chawit1103/thai-horoscope-platform/blob/main/docs/BETA_INVITE_MANAGEMENT.md";

export default async function AdminBetaPage() {
  await requireAdminSession("/admin/beta");
  const state = getBetaLaunchState();
  const invites = state.invites.map(safeBetaInviteForAdmin);

  return (
    <section className="page">
      <p className="eyebrow">Protected beta invites</p>
      <h1>Beta invite management</h1>
      <p className="lead">Create mock-safe beta invites without sending email, LINE, or payment calls.</p>
      <div className="actions">
        <a className="button-link secondary" href="/admin">Back to admin</a>
        <a className="button-link secondary" href="/admin/operator">Operator console</a>
        <a className="button-link secondary" href={BETA_INVITE_DOC_URL}>Invite doc</a>
      </div>
      <form className="form-panel" action={createBetaInviteAction}>
        <label>
          Invite code
          <input name="inviteCode" autoComplete="off" />
        </label>
        <label>
          Allowlisted email
          <input name="email" type="email" autoComplete="off" />
        </label>
        <label>
          Allowlisted mock user
          <input name="userId" autoComplete="off" />
        </label>
        <button type="submit">Create beta invite</button>
      </form>
      <section className="grid">
        {invites.length === 0 ? (
          <article className="panel">
            <h2>No beta invites</h2>
            <p>Create an invite code or allowlist entry for the current mock admin session.</p>
          </article>
        ) : invites.map((invite) => (
          <article className="panel status-card" key={invite.id}>
            <span className="badge">{invite.status}</span>
            <h2>{invite.kind}</h2>
            <dl className="status-meta">
              <div><dt>Invite</dt><dd>{invite.id}</dd></div>
              <div><dt>Type</dt><dd>{invite.identifier}</dd></div>
              <div><dt>Created</dt><dd>{invite.createdAt}</dd></div>
              <div><dt>Updated</dt><dd>{invite.updatedAt}</dd></div>
            </dl>
            {invite.status !== "revoked" ? (
              <form action={revokeBetaInviteAction}>
                <input type="hidden" name="inviteId" value={invite.id} />
                <button type="submit">Revoke invite</button>
              </form>
            ) : null}
          </article>
        ))}
      </section>
    </section>
  );
}
