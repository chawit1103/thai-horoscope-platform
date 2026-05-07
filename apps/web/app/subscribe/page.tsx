import Link from "next/link";
import { selectMockPlanAction } from "../actions";
import { buildSubscriptionSummary, ENTERTAINMENT_DISCLAIMER, getLatestUserSubscription } from "../../src/mvp/beta-user-ux";
import { getMockMvpState } from "../../src/mvp/mock-flow";
import { getOptionalMockSession } from "../user-session";

const plans = [
  { code:"free", title:"Free", body:"อ่านดวงวันนี้แบบ preview และทดลองระบบ beta", access:"รายวัน" },
  { code:"basic", title:"Basic", body:"เหมาะกับการติดตามรายวันและรายสัปดาห์", access:"รายวัน / รายสัปดาห์" },
  { code:"premium", title:"Premium", body:"เปิด monthly และ yearly mock content สำหรับ beta", access:"รายวัน / รายสัปดาห์ / รายเดือน / รายปี" },
] as const;

export default async function SubscribePage() {
  const session = await getOptionalMockSession();
  const state = getMockMvpState(session?.sessionId);
  const summary = session ? buildSubscriptionSummary({ state, userId:session.userId, subscription:getLatestUserSubscription(session.userId), now:new Date() }) : undefined;

  return (
    <section className="page">
      <p className="eyebrow">Subscription</p>
      <h1>เลือกแพ็กเกจสำหรับ beta</h1>
      <p className="lead">การเลือกแพ็กเกจในหน้านี้เป็น mock เท่านั้น ไม่เปิด real payment และไม่เรียก provider ภายนอก</p>
      {summary ? <section className="guard">สถานะปัจจุบัน: {summary.planCode} · {summary.statusLabel}</section> : <section className="guard">เริ่ม onboarding ก่อนเลือกแพ็กเกจ</section>}
      <section className="grid">
        {plans.map((plan)=>(
          <article className="panel" key={plan.code}>
            <span className="badge">{plan.title}</span>
            <h2>{plan.access}</h2>
            <p>{plan.body}</p>
            <form action={selectMockPlanAction}>
              <input type="hidden" name="planCode" value={plan.code} />
              <button type="submit" disabled={!session}>เลือก {plan.title}</button>
            </form>
          </article>
        ))}
      </section>
      <div className="actions">
        <Link className="button-link secondary" href="/account">กลับบัญชี</Link>
      </div>
      <p className="disclaimer">{ENTERTAINMENT_DISCLAIMER}</p>
    </section>
  );
}
