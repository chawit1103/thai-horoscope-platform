import Link from "next/link";
import { getMockMvpState } from "../src/mvp/mock-flow";
import { buildSubscriptionSummary, ENTERTAINMENT_DISCLAIMER, getLatestUserSubscription } from "../src/mvp/beta-user-ux";
import { getOptionalMockSession } from "./user-session";

export default async function HomePage() {
  const session = await getOptionalMockSession();
  const state = getMockMvpState(session?.sessionId);
  const subscription = session ? getLatestUserSubscription(session.userId) : undefined;
  const summary = session ? buildSubscriptionSummary({ state, userId:session.userId, subscription, now:new Date("2026-05-03T00:00:00.000Z") }) : undefined;

  return (
    <section className="page">
      <p className="eyebrow">Beta experience</p>
      <h1>พื้นที่ทดลองอ่านดวงแบบสมาชิก</h1>
      <p className="lead">
        ระบบนี้เป็น beta mock-safe สำหรับทดลอง onboarding, subscription, notification preference และ privacy controls โดยไม่ส่ง LINE, email หรือ payment จริง
      </p>
      <div className="stats-grid">
        <Stat label="สถานะ beta" value="ทดลอง" />
        <Stat label="แผนปัจจุบัน" value={summary?.planCode ?? "ยังไม่เริ่ม"} />
        <Stat label="สถานะสมาชิก" value={summary?.statusLabel ?? "ยังไม่มี session"} />
        <Stat label="โปรไฟล์เกิด" value={session ? String(state.birthProfiles.filter((profile)=>profile.userId===session.userId).length) : "0"} />
      </div>
      <section className="guard">
        <strong>ข้อจำกัด beta</strong>
        <p>ข้อมูลบางส่วนเป็นระบบทดลอง ผลลัพธ์ใช้เพื่อช่วยทบทวนตัวเอง ไม่ใช่คำทำนายที่รับประกันผลลัพธ์</p>
      </section>
      <div className="actions">
        <Link href="/onboarding">เริ่ม onboarding</Link>
        <Link href="/today">ดูดวงวันนี้</Link>
        <Link href="/subscribe">ดูแพ็กเกจ</Link>
        <Link href="/settings/privacy">Privacy controls</Link>
      </div>
      <p className="disclaimer">{ENTERTAINMENT_DISCLAIMER}</p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
