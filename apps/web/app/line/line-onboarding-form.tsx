import Link from "next/link";
import { saveOnboardingAction } from "../actions";
import { ENTERTAINMENT_DISCLAIMER, UNKNOWN_BIRTH_TIME_WARNING } from "../../src/mvp/beta-user-ux";
import { type BirthProfile } from "../../src/mvp/mock-flow";

export function LineOnboardingForm({ mode, profile }:{ mode:"create"|"edit"; profile?:BirthProfile }) {
  const birthDateDefault = mode === "edit" ? profile?.birthDate ?? "" : "";
  const birthTimeDefault = mode === "edit" && !profile?.birthTimeUnknown ? profile?.birthTime ?? "" : "";
  const birthPlaceDefault = mode === "edit" ? profile?.birthPlaceText ?? "" : "";
  const timezoneDefault = mode === "edit" ? profile?.timezone ?? "" : "";
  const consentDefault = mode === "edit" ? profile?.consentBirthData ?? false : false;

  return (
    <section className="page line-webview">
      <p className="eyebrow">LINE web onboarding</p>
      <h1>{mode === "edit" ? "แก้ข้อมูลเกิด" : "กรอกข้อมูลเกิด"}</h1>
      <p className="lead">
        ฟอร์มนี้ออกแบบสำหรับเปิดจาก LINE เพื่อกรอกข้อมูลที่ไม่สะดวกพิมพ์ในแชต ข้อมูลนี้ใช้กับการคำนวณดวงในระบบ beta เท่านั้น
      </p>
      <section className="guard">
        <strong>กรณีไม่ทราบเวลาเกิด</strong>
        <p>{UNKNOWN_BIRTH_TIME_WARNING}</p>
      </section>
      <form className="form-panel line-form" action={saveOnboardingAction}>
        <input name="returnTo" type="hidden" value="/line/onboarding/saved" />
        <label>
          วันเกิด
          <input name="birthDate" type="date" defaultValue={birthDateDefault} required />
        </label>
        <label>
          เวลาเกิด
          <input name="birthTime" type="time" defaultValue={birthTimeDefault} aria-describedby="line-birth-time-help" />
          <span id="line-birth-time-help" className="muted">ถ้าไม่แน่ใจ ให้เลือก “ไม่ทราบเวลาเกิด” แทนการเดา</span>
        </label>
        <label className="check-row">
          <input name="birthTimeUnknown" type="checkbox" defaultChecked={profile?.birthTimeUnknown ?? false} />
          ไม่ทราบเวลาเกิด
        </label>
        <label>
          เมือง/สถานที่เกิด
          <input name="birthPlaceText" defaultValue={birthPlaceDefault} placeholder="เช่น Bangkok, Chiang Mai, Khon Kaen" required />
        </label>
        <label>
          Timezone
          <input name="timezone" defaultValue={timezoneDefault} placeholder="Asia/Bangkok" required />
        </label>
        <div className="field-grid">
          <label>
            Latitude (ถ้ามี)
            <input name="latitude" inputMode="decimal" defaultValue={profile?.latitude ?? ""} placeholder="13.759" />
          </label>
          <label>
            Longitude (ถ้ามี)
            <input name="longitude" inputMode="decimal" defaultValue={profile?.longitude ?? ""} placeholder="100.535" />
          </label>
        </div>
        <label className="check-row">
          <input name="consentBirthData" type="checkbox" defaultChecked={consentDefault} required />
          ยินยอมให้ใช้ข้อมูลเกิดเพื่อคำนวณดวงและตรวจผังดวงในระบบ beta
        </label>
        <button type="submit">บันทึกข้อมูลเกิด</button>
      </form>
      <div className="actions">
        <Link href="/chart-preview?mode=user">ดูผังดวง / ตรวจตำแหน่งดาว</Link>
        <Link href="/line/settings">ตั้งค่าจาก LINE</Link>
      </div>
      <p className="disclaimer">{ENTERTAINMENT_DISCLAIMER}</p>
    </section>
  );
}
