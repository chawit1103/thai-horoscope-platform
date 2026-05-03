import { saveOnboardingAction } from "../actions";

export default function OnboardingPage() {
  return (
    <section className="page">
      <p className="eyebrow">Onboarding</p>
      <h1>บันทึกข้อมูลเกิดสำหรับ mock flow</h1>
      <p className="lead">
        แบบฟอร์มนี้ใช้เฉพาะ development mock เท่านั้น เมื่อบันทึกแล้วระบบจะเรียก mock astro adapter และสร้าง horoscope drafts
      </p>
      <form className="form-panel" action={saveOnboardingAction}>
        <label>
          วันเกิด
          <input name="birthDate" type="date" defaultValue="1992-08-15" required />
        </label>
        <label>
          เวลาเกิด
          <input name="birthTime" type="time" defaultValue="07:30" />
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
    </section>
  );
}
