import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessBetaOnlyFlow } from "../../../../src/mvp/beta-launch";
import { ENTERTAINMENT_DISCLAIMER, UNKNOWN_BIRTH_TIME_WARNING } from "../../../../src/mvp/beta-user-ux";
import { getMockMvpState } from "../../../../src/mvp/mock-flow";
import { getOptionalMockSession } from "../../../user-session";

export default async function LineOnboardingSavedPage() {
  const session = await getOptionalMockSession();
  const state = getMockMvpState(session?.sessionId);
  if (!session || !canAccessBetaOnlyFlow({ state, sessionId:session.sessionId, userId:session.userId })) redirect("/beta");
  const profile = [...state.birthProfiles].reverse().find((item)=>item.userId === session.userId);
  if (!profile) redirect("/line/onboarding");

  return (
    <section className="page line-webview">
      <p className="eyebrow">LINE web onboarding</p>
      <h1>บันทึกข้อมูลเกิดแล้ว</h1>
      <p className="lead">คุณกลับไปที่ LINE เพื่อพิมพ์ “ดวงวันนี้” ได้ หรือเปิดตรวจผังดวงก่อนอ่านผลลัพธ์</p>
      {profile.birthTimeUnknown ? (
        <section className="guard">
          <strong>คำเตือนเรื่องเวลาเกิด</strong>
          <p>{UNKNOWN_BIRTH_TIME_WARNING}</p>
        </section>
      ) : null}
      <div className="actions">
        <Link href="/chart-preview?mode=user">ดูผังดวง / ตรวจตำแหน่งดาว</Link>
        <Link href="/today">ดูดวงวันนี้</Link>
        <Link href="/line/profile">แก้ข้อมูลเกิดอีกครั้ง</Link>
      </div>
      <section className="panel">
        <h2>กลับไปที่ LINE</h2>
        <p>ปิดหน้าต่างนี้แล้วกลับไปที่ LINE Official Account จากนั้นเลือกเมนูหรือพิมพ์คำสั่งที่ต้องการ</p>
      </section>
      <p className="disclaimer">{ENTERTAINMENT_DISCLAIMER}</p>
    </section>
  );
}
