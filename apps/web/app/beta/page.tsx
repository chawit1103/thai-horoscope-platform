import Link from "next/link";
import { enrollBetaUserAction } from "../actions";
import { buildBetaLaunchView, ensureLocalMockBetaInvite, getBetaLaunchCopy, getLocalMockBetaInviteCode } from "../../src/mvp/beta-launch";
import { readDeploymentEnvironment } from "../../src/mvp/environment-validation";
import { getMockMvpState } from "../../src/mvp/mock-flow";
import { getOptionalMockSession } from "../user-session";

export default async function BetaPage() {
  const deploymentEnvironment = readDeploymentEnvironment();
  const localDemoInviteCode = getLocalMockBetaInviteCode({ deploymentEnvironment });
  ensureLocalMockBetaInvite({ deploymentEnvironment });
  const session = await getOptionalMockSession();
  const state = getMockMvpState(session?.sessionId);
  const view = buildBetaLaunchView({ state, sessionId:session?.sessionId, userId:session?.userId });
  const copy = getBetaLaunchCopy();

  return (
    <section className="page">
      <p className="eyebrow">Beta launch</p>
      <h1>พื้นที่ beta สำหรับผู้ได้รับเชิญ</h1>
      <p className="lead">{view.summary}</p>
      <div className="stats-grid">
        <Stat label="สถานะการเข้าร่วม" value={view.accessStatus} />
        <Stat label="การเข้าใช้งาน beta" value={view.allowed ? "พร้อมทดลอง" : "ต้องมี invite"} />
      </div>
      <section className="guard">
        <strong>ข้อจำกัดสำคัญ</strong>
        <p>{copy.subscriptionBetaLimitation}</p>
      </section>
      {!view.allowed ? (
        <form className="form-panel" action={enrollBetaUserAction}>
          {localDemoInviteCode ? (
            <p className="muted">Local/mock demo invite code: <strong>{localDemoInviteCode}</strong></p>
          ) : null}
          <label>
            Invite code
            <input name="inviteCode" autoComplete="off" defaultValue={localDemoInviteCode ?? ""} />
          </label>
          <button type="submit">เข้าร่วม beta</button>
        </form>
      ) : (
        <div className="actions">
          <Link href="/onboarding">เริ่ม onboarding</Link>
          <Link href="/subscribe">ดูสิทธิ์ subscription</Link>
          <Link href="/settings/privacy">Privacy controls</Link>
        </div>
      )}
      <section className="grid">
        {view.bullets.map((item) => (
          <article className="panel" key={item}>
            <p>{item}</p>
          </article>
        ))}
      </section>
      {view.disclaimers.map((disclaimer) => (
        <p className="disclaimer" key={disclaimer}>{disclaimer}</p>
      ))}
    </section>
  );
}

function Stat({ label, value }: { label:string; value:string }) {
  return (
    <div className="panel">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
