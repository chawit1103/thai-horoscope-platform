import Link from "next/link";
import { bootstrapDemoFlow, getMockMvpState } from "../src/mvp/mock-flow";

export default function HomePage() {
  bootstrapDemoFlow();
  const state = getMockMvpState();

  return (
    <section className="page">
      <p className="eyebrow">Mock MVP flow</p>
      <h1>เส้นทางทดลองตั้งแต่ onboarding ถึง mock delivery</h1>
      <p className="lead">
        Demo นี้ใช้ข้อมูล mock ทั้งหมด: บันทึก birth profile, สร้าง chart snapshot จาก mock adapter,
        สร้าง horoscope draft, admin approve, queue outbound message และบันทึก delivery attempt โดยไม่ส่งจริง
      </p>
      <div className="stats-grid">
        <Stat label="Birth profiles" value={state.birthProfiles.length} />
        <Stat label="Chart snapshots" value={state.chartSnapshots.length} />
        <Stat label="Horoscope results" value={state.horoscopeResults.length} />
        <Stat label="Delivery attempts" value={state.deliveryAttempts.length} />
      </div>
      <div className="actions">
        <Link href="/onboarding">เริ่ม onboarding</Link>
        <Link href="/today">ดูดวงวันนี้</Link>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
