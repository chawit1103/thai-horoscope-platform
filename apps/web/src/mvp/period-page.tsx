import { cookies } from "next/headers";
import Link from "next/link";
import { buildSafeHoroscopeView, buildSubscriptionSummary, getLatestUserSubscription } from "./beta-user-ux";
import { getMockMvpState, type PeriodType } from "./mock-flow";

export async function HoroscopePage({ periodType }: { periodType: PeriodType }) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("mock-session-id")?.value;
  const userId = cookieStore.get("mock-user-id")?.value;
  if (!sessionId || !userId) {
    return (
      <section className="page">
        <p className="eyebrow">Mock session required</p>
        <h1>เริ่มต้น onboarding ก่อนดูดวง</h1>
        <p className="lead">เพื่อแยกข้อมูลรายผู้ใช้ในโหมดพัฒนา กรุณากรอกข้อมูลที่หน้าเริ่มต้นก่อน</p>
        <Link className="button-link" href="/onboarding">
          ไปหน้า onboarding
        </Link>
      </section>
    );
  }
  const state = getMockMvpState(sessionId);
  const subscription = getLatestUserSubscription(userId);
  const currentPlan = buildSubscriptionSummary({ state, userId, subscription, now:new Date("2026-05-03T00:00:00.000Z") }).planCode;
  const view = buildSafeHoroscopeView({ state, userId, periodType, subscription, now:new Date("2026-05-03T00:00:00.000Z") });

  if (!view.allowed) {
    return (
      <section className="page">
        <p className="eyebrow">Entitlement</p>
        <h1>{view.title}</h1>
        <p className="lead">{view.summary}</p>
        <section className="guard">Free อ่านรายวัน, Basic อ่านรายวัน/รายสัปดาห์, Premium อ่านครบทุกช่วง</section>
        <div className="actions">
          <Link className="button-link" href="/today">กลับไปดูวันนี้</Link>
          <Link className="button-link secondary" href="/subscribe">ดูแพ็กเกจ</Link>
        </div>
        <p className="disclaimer">{view.disclaimer}</p>
      </section>
    );
  }

  return (
    <article className="page">
      <p className="eyebrow">Beta horoscope · {view.periodLabel}</p>
      <h1>{view.title}</h1>
      <p className="lead">{view.summary}</p>
      {view.warnings.map((warning)=>(
        <section className="guard" key={warning}>{warning}</section>
      ))}
      <section className="meta-grid">
        <div className="panel"><span className="muted">Plan</span><strong>{currentPlan}</strong></div>
        <div className="panel"><span className="muted">Calculation</span><strong>sanitized mock</strong></div>
        <div className="panel"><span className="muted">Confidence</span><strong>{view.warnings.length ? "ประมาณบางส่วน" : "พร้อมอ่าน"}</strong></div>
        <div className="panel"><span className="muted">Beta status</span><strong>ทดลอง</strong></div>
      </section>
      <section className="grid">
        {view.sections.map((section) => (
          <article className="panel" key={section.heading}><h2>{section.heading}</h2><p>{section.body}</p></article>
        ))}
      </section>
      <p className="disclaimer">{view.disclaimer}</p>
    </article>
  );
}
