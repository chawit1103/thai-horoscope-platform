import Link from "next/link";
import { buildChannelStatusSummary, ENTERTAINMENT_DISCLAIMER, maskEmail } from "../../../src/mvp/beta-user-ux";
import { getOptionalMockSession } from "../../user-session";

export default async function ChannelSettingsPage() {
  const session = await getOptionalMockSession();
  if (!session) {
    return (
      <section className="page">
        <p className="eyebrow">Channels</p>
        <h1>ช่องทางยังไม่พร้อม</h1>
        <p className="lead">เริ่ม onboarding ก่อนเพื่อดูสถานะ LINE และ email</p>
        <Link className="button-link" href="/onboarding">เริ่ม onboarding</Link>
      </section>
    );
  }
  const channels = buildChannelStatusSummary({ maskedEmail:maskEmail(`${session.userId}@example.test`), emailVerified:true, lineConnected:false });
  return (
    <section className="page">
      <p className="eyebrow">Channels</p>
      <h1>สถานะช่องทาง</h1>
      <p className="lead">แสดงสถานะ email และ LINE แบบไม่เปิดเผย raw LINE user ID หรือ provider payload</p>
      <section className="grid">
        {channels.map((channel)=>(
          <article className="panel" key={channel.channel}>
            <span className="badge">{channel.status}</span>
            <h2>{channel.label}</h2>
            <p>{channel.detail}</p>
          </article>
        ))}
      </section>
      <div className="actions">
        <Link className="button-link secondary" href="/settings/notifications">Notification settings</Link>
        <Link className="button-link secondary" href="/account">Account</Link>
      </div>
      <p className="disclaimer">{ENTERTAINMENT_DISCLAIMER}</p>
    </section>
  );
}
