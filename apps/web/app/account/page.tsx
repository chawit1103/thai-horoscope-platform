import Link from "next/link";
import { buildBirthProfileSummary, buildChannelStatusSummary, buildNotificationPreferenceSummary, buildSubscriptionSummary, getLatestUserSubscription, maskEmail, ENTERTAINMENT_DISCLAIMER } from "../../src/mvp/beta-user-ux";
import { getMockMvpState } from "../../src/mvp/mock-flow";
import { getOptionalMockSession } from "../user-session";

export default async function AccountPage() {
  const session = await getOptionalMockSession();
  if (!session) return <EmptyAccount />;
  const state = getMockMvpState(session.sessionId);
  const subscription = getLatestUserSubscription(session.userId);
  const subscriptionSummary = buildSubscriptionSummary({ state, userId:session.userId, subscription, now:new Date("2026-05-03T00:00:00.000Z") });
  const profile = state.birthProfiles.find((item)=>item.userId===session.userId);
  const birthProfile = buildBirthProfileSummary(profile);
  const preferences = buildNotificationPreferenceSummary(state, session.userId);
  const channels = buildChannelStatusSummary({ maskedEmail:maskEmail(`${session.userId}@example.test`), emailVerified:true, lineConnected:false });

  return (
    <section className="page">
      <p className="eyebrow">Account</p>
      <h1>บัญชี beta ของคุณ</h1>
      <p className="lead">ดูสถานะสมาชิก โปรไฟล์เกิด ช่องทางแจ้งเตือน และทางลัด privacy โดยไม่แสดง provider IDs หรือข้อมูลภายใน</p>
      <section className="meta-grid">
        <div className="panel"><span className="muted">Plan</span><strong>{subscriptionSummary.planCode}</strong></div>
        <div className="panel"><span className="muted">Status</span><strong>{subscriptionSummary.statusLabel}</strong></div>
        <div className="panel"><span className="muted">Birth profile</span><strong>{birthProfile.confidenceLabel}</strong></div>
        <div className="panel"><span className="muted">Beta</span><strong>mock-safe</strong></div>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>สิทธิ์การอ่าน</h2>
          <ul className="plain-list">
            {Object.entries(subscriptionSummary.periodAccess).map(([period, allowed])=>(
              <li key={period}><strong>{period}</strong>: {allowed ? "เปิดอ่านได้" : "ต้องอัปเกรด"}</li>
            ))}
          </ul>
        </article>
        <article className="panel">
          <h2>โปรไฟล์เกิด</h2>
          <p>{birthProfile.birthDateLabel} · {birthProfile.birthTimeLabel} · {birthProfile.birthPlaceLabel}</p>
          {birthProfile.warnings.map((warning)=><p className="guard" key={warning}>{warning}</p>)}
        </article>
        <article className="panel">
          <h2>ช่องทาง</h2>
          <ul className="plain-list">{channels.map((channel)=><li key={channel.channel}><strong>{channel.label}</strong>: {channel.detail}</li>)}</ul>
        </article>
        <article className="panel">
          <h2>Notification preferences</h2>
          <ul className="plain-list">{preferences.map((preference)=><li key={preference.topicCode}>{preference.label}: {preference.lineEnabled || preference.emailEnabled ? "เปิดอยู่" : "พักการแจ้งเตือน"}</li>)}</ul>
        </article>
      </section>
      <div className="actions">
        <Link href="/onboarding">แก้ไขโปรไฟล์เกิด</Link>
        <Link href="/subscribe">จัดการแพ็กเกจ</Link>
        <Link href="/settings/notifications">ตั้งค่าแจ้งเตือน</Link>
        <Link href="/settings/privacy">Privacy controls</Link>
      </div>
      <p className="disclaimer">{ENTERTAINMENT_DISCLAIMER}</p>
    </section>
  );
}

function EmptyAccount() {
  return (
    <section className="page">
      <p className="eyebrow">Account</p>
      <h1>ยังไม่มี session beta</h1>
      <p className="lead">เริ่ม onboarding ก่อนเพื่อสร้างโปรไฟล์ mock และดูสถานะสมาชิก</p>
      <Link className="button-link" href="/onboarding">เริ่ม onboarding</Link>
    </section>
  );
}
