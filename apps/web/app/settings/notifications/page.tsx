import Link from "next/link";
import { saveNotificationPreferenceAction, unsubscribeNotificationsAction } from "../../actions";
import { buildNotificationPreferenceSummary, ENTERTAINMENT_DISCLAIMER } from "../../../src/mvp/beta-user-ux";
import { getMockMvpState } from "../../../src/mvp/mock-flow";
import { getOptionalMockSession } from "../../user-session";

export default async function NotificationSettingsPage() {
  const session = await getOptionalMockSession();
  if (!session) return <SettingsEmpty title="ตั้งค่าแจ้งเตือน" />;
  const state = getMockMvpState(session.sessionId);
  const preferences = buildNotificationPreferenceSummary(state, session.userId);

  return (
    <section className="page">
      <p className="eyebrow">Notifications</p>
      <h1>ตั้งค่าการแจ้งเตือน</h1>
      <p className="lead">พักหรือเปิดการแจ้งเตือน mock ตามหัวข้อ โดยไม่ส่ง LINE หรือ email จริงจากหน้านี้</p>
      <section className="grid">
        {preferences.map((preference)=>(
          <article className="panel" key={preference.topicCode}>
            <h2>{preference.label}</h2>
            <p>LINE: {preference.lineEnabled ? "เปิด" : "พัก"} · Email: {preference.emailEnabled ? "เปิด" : "พัก"}</p>
            <div className="actions">
              <form action={saveNotificationPreferenceAction}>
                <input type="hidden" name="topicCode" value={preference.topicCode} />
                <input type="hidden" name="enabled" value="true" />
                <button type="submit">เปิด</button>
              </form>
              <form action={unsubscribeNotificationsAction}>
                <input type="hidden" name="topicCode" value={preference.topicCode} />
                <button type="submit">พักหัวข้อนี้</button>
              </form>
            </div>
          </article>
        ))}
      </section>
      <div className="actions"><Link className="button-link secondary" href="/settings/channels">ดูช่องทาง</Link></div>
      <p className="disclaimer">{ENTERTAINMENT_DISCLAIMER}</p>
    </section>
  );
}

function SettingsEmpty({ title }:{ title:string }) {
  return (
    <section className="page">
      <p className="eyebrow">Settings</p>
      <h1>{title}</h1>
      <p className="lead">เริ่ม onboarding ก่อนเพื่อจัดการการตั้งค่า</p>
      <Link className="button-link" href="/onboarding">เริ่ม onboarding</Link>
    </section>
  );
}
