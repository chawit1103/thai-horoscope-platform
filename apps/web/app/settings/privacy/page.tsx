import Link from "next/link";
import { deleteBirthProfileAction, exportMyDataAction, requestAccountDeletionAction } from "../../actions";
import { buildBirthProfileSummary, ENTERTAINMENT_DISCLAIMER } from "../../../src/mvp/beta-user-ux";
import { getMockMvpState } from "../../../src/mvp/mock-flow";
import { getOptionalMockSession } from "../../user-session";

export default async function PrivacySettingsPage() {
  const session = await getOptionalMockSession();
  if (!session) return <PrivacyEmpty />;
  const state = getMockMvpState(session.sessionId);
  const profiles = state.birthProfiles.filter((profile)=>profile.userId===session.userId);
  const deletionRequested = state.accountDeletionRequests.some((request)=>request.userId===session.userId && request.status==="requested");

  return (
    <section className="page">
      <p className="eyebrow">Privacy</p>
      <h1>Privacy controls</h1>
      <p className="lead">เข้าถึง export, ลบ birth profile, request account deletion และ unsubscribe โดยไม่แสดง audit IDs หรือ internal hashes</p>
      <section className="grid">
        <article className="panel">
          <h2>Export my data</h2>
          <p>สร้าง audit event สำหรับ mock export และเก็บข้อมูลไว้ในระบบทดลองเท่านั้น</p>
          <form action={exportMyDataAction}><button type="submit">Export my data</button></form>
        </article>
        <article className="panel">
          <h2>Account deletion</h2>
          <p>{deletionRequested ? "ส่งคำขอลบบัญชีแล้ว" : "ส่งคำขอลบบัญชีและหยุด queued notifications"}</p>
          <form action={requestAccountDeletionAction}><button type="submit" disabled={deletionRequested}>Request account deletion</button></form>
        </article>
      </section>
      <section className="grid">
        {profiles.length === 0 ? <article className="panel"><h2>Birth profile</h2><p>ยังไม่มี birth profile</p></article> : profiles.map((profile)=> {
          const summary = buildBirthProfileSummary(profile);
          const deleteSelectedBirthProfile = deleteBirthProfileAction.bind(null, profile.id);
          return (
            <article className="panel" key={profile.id}>
              <h2>Birth profile</h2>
              <p>{summary.birthDateLabel} · {summary.birthTimeLabel} · {summary.birthPlaceLabel}</p>
              {summary.warnings.map((warning)=><p className="guard" key={warning}>{warning}</p>)}
              <p><Link href={`/chart-preview?mode=user&birthProfileId=${encodeURIComponent(profile.id)}`}>ดูผังดวง / ตรวจตำแหน่งดาว</Link></p>
              <form action={deleteSelectedBirthProfile}>
                <button type="submit">Delete birth profile</button>
              </form>
            </article>
          );
        })}
      </section>
      <div className="actions">
        <Link className="button-link secondary" href="/settings/notifications">Notification settings</Link>
        <Link className="button-link secondary" href="/account">Account</Link>
      </div>
      <p className="disclaimer">{ENTERTAINMENT_DISCLAIMER}</p>
    </section>
  );
}

function PrivacyEmpty() {
  return (
    <section className="page">
      <p className="eyebrow">Privacy</p>
      <h1>Privacy controls</h1>
      <p className="lead">เริ่ม onboarding ก่อนเพื่อใช้ privacy controls</p>
      <Link className="button-link" href="/onboarding">เริ่ม onboarding</Link>
    </section>
  );
}
