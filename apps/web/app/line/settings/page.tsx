import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessBetaOnlyFlow } from "../../../src/mvp/beta-launch";
import { ENTERTAINMENT_DISCLAIMER } from "../../../src/mvp/beta-user-ux";
import { getMockMvpState } from "../../../src/mvp/mock-flow";
import { getOptionalMockSession } from "../../user-session";

export default async function LineSettingsPage() {
  const session = await getOptionalMockSession();
  const state = getMockMvpState(session?.sessionId);
  if (!session || !canAccessBetaOnlyFlow({ state, sessionId:session.sessionId, userId:session.userId })) redirect("/beta");

  return (
    <section className="page line-webview">
      <p className="eyebrow">LINE web settings</p>
      <h1>ตั้งค่าจาก LINE</h1>
      <p className="lead">เลือกหน้าที่ต้องใช้ฟอร์มเว็บ ระบบจะไม่แสดง LINE user ID หรือข้อมูล provider ภายในหน้านี้</p>
      <div className="grid">
        <section className="panel">
          <h2>ข้อมูลเกิด</h2>
          <p>แก้วัน เวลา สถานที่เกิด และตัวเลือกไม่ทราบเวลาเกิด</p>
          <Link className="button-link" href="/line/profile">แก้ข้อมูลเกิด</Link>
        </section>
        <section className="panel">
          <h2>การแจ้งเตือน</h2>
          <p>ตั้งค่าหัวข้อและช่องทางแจ้งเตือน horoscope</p>
          <Link className="button-link" href="/settings/notifications">ตั้งค่าการแจ้งเตือน</Link>
        </section>
        <section className="panel">
          <h2>ความเป็นส่วนตัว</h2>
          <p>ส่งออกข้อมูล ลบข้อมูลเกิด หรือขอลบบัญชี</p>
          <Link className="button-link" href="/settings/privacy">จัดการความเป็นส่วนตัว</Link>
        </section>
      </div>
      <p className="disclaimer">{ENTERTAINMENT_DISCLAIMER}</p>
    </section>
  );
}
