import Link from "next/link";
import { bootstrapDemoFlow, getEntitledHoroscope, getMockMvpState, type PeriodType } from "./mock-flow";

export function HoroscopePage({ periodType }: { periodType: PeriodType }) {
  bootstrapDemoFlow();
  const state = getMockMvpState();
  const result = getEntitledHoroscope(periodType);

  if (!result) {
    return (
      <section className="page">
        <p className="eyebrow">Entitlement</p>
        <h1>แพ็กเกจปัจจุบันยังไม่เปิดอ่านหน้านี้</h1>
        <p className="lead">แผน {state.user.planCode} เปิดอ่าน: daily สำหรับ free, daily/weekly สำหรับ basic, และครบทุกช่วงสำหรับ premium</p>
        <Link className="button-link" href="/today">
          กลับไปดูวันนี้
        </Link>
      </section>
    );
  }

  return (
    <article className="page">
      <p className="eyebrow">Mock horoscope · {result.status}</p>
      <h1>{result.content_json.title}</h1>
      <p className="lead">{result.content_json.summary}</p>
      <section className="meta-grid">
        <div className="panel">
          <span className="muted">Plan</span>
          <strong>{state.user.planCode}</strong>
        </div>
        <div className="panel">
          <span className="muted">Chart snapshot</span>
          <strong>{result.chartSnapshotId}</strong>
        </div>
        <div className="panel">
          <span className="muted">Rule hits</span>
          <strong>{result.rule_hits_json.length}</strong>
        </div>
      </section>
      <section className="grid">
        {result.content_json.sections.map((section) => (
          <article className="panel" key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </article>
        ))}
      </section>
      <p className="disclaimer">{result.content_json.disclaimer}</p>
    </article>
  );
}
