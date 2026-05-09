import Link from "next/link";
import { saveOnboardingAction } from "../actions";
import { redirect } from "next/navigation";
import { canAccessBetaOnlyFlow } from "../../src/mvp/beta-launch";
import { ENTERTAINMENT_DISCLAIMER, UNKNOWN_BIRTH_TIME_WARNING } from "../../src/mvp/beta-user-ux";
import { getMockMvpState } from "../../src/mvp/mock-flow";
import { getOptionalMockSession } from "../user-session";

export default async function OnboardingPage() {
  const session = await getOptionalMockSession();
  const state = getMockMvpState(session?.sessionId);
  if (!session || !canAccessBetaOnlyFlow({ state, sessionId:session.sessionId, userId:session.userId })) redirect("/beta");

  return (
    <section className="page">
      <p className="eyebrow">Beta onboarding</p>
      <h1>ตั้งค่าโปรไฟล์เกิดอย่างปลอดภัย</h1>
      <p className="lead">
        ข้อมูลเกิดใช้เพื่อสร้างผลลัพธ์ mock ในระบบทดลองเท่านั้น คุณสามารถเลือกไม่ทราบเวลาเกิดได้
      </p>
      <section className="guard">
        <strong>กรณีไม่ทราบเวลาเกิด</strong>
        <p>{UNKNOWN_BIRTH_TIME_WARNING}</p>
      </section>
      <form className="form-panel" action={saveOnboardingAction}>
        <label>
          วันเกิด
          <input name="birthDate" type="date" defaultValue="1992-08-15" required />
        </label>
        <label>
          เวลาเกิด
          <input name="birthTime" type="time" defaultValue="07:30" aria-describedby="birth-time-help" />
          <span id="birth-time-help" className="muted">ถ้าไม่แน่ใจ ให้เลือก “ไม่ทราบเวลาเกิด” แทนการเดา</span>
        </label>
        <label className="check-row">
          <input name="birthTimeUnknown" type="checkbox" />
          ไม่ทราบเวลาเกิด
        </label>
        <label>
          สถานที่เกิด
          <input name="birthPlaceText" defaultValue="Bangkok" required />
        </label>
        <label>
          Timezone
          <input name="timezone" defaultValue="Asia/Bangkok" required />
        </label>
        <label className="check-row">
          <input name="consentBirthData" type="checkbox" defaultChecked required />
          ยินยอมให้ใช้ข้อมูลเกิดเพื่อสร้างผลลัพธ์ mock
        </label>
        <button type="submit">บันทึกและสร้าง mock horoscope</button>
      </form>
      <div className="actions">
        <Link href="/chart-preview?mode=user">ดูผังดวง / ตรวจตำแหน่งดาว</Link>
        <Link href="/chart-preview?mode=golden">ดู Golden Fixture Reference</Link>
      </div>
      <p className="disclaimer">{ENTERTAINMENT_DISCLAIMER}</p>
    </section>
  );
}
