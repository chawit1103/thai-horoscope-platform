import Link from "next/link";
import { buildChartPreviewModel, assertChartPreviewSafe, type ChartPreviewModel } from "../../src/mvp/chart-preview";
import { getMockMvpState } from "../../src/mvp/mock-flow";
import { getOptionalMockSession } from "../user-session";

export default async function ChartPreviewPage() {
  const session = await getOptionalMockSession();
  if (!session) return <EmptyChartPreview />;
  const model = buildChartPreviewModel({ state:getMockMvpState(session.sessionId), userId:session.userId });
  if (!model) return <EmptyChartPreview />;
  assertChartPreviewSafe(model);
  const unknownBirthTime = model.metadata.warnings.includes("UNKNOWN_BIRTH_TIME") || !model.housesReliable;

  return (
    <section className="page">
      <p className="eyebrow">Local chart validation</p>
      <h1>ตรวจสอบค่าคำนวณดวงไทย</h1>
      <p className="lead">หน้านี้แสดงข้อมูลคำนวณเท่านั้น ไม่มีคำทำนายหรือข้อความตีความดวง</p>

      {unknownBirthTime ? (
        <section className="guard">
          <strong>คำเตือนจากระบบ</strong>
          <p>ไม่ทราบเวลาเกิด ลัคนาและเรือนชะตาไม่ reliable จึงไม่ควรใช้เป็นข้อสรุปแบบแน่นอน</p>
        </section>
      ) : null}

      <section className="meta-grid">
        <Meta label="ค่าคำนวณ" value={model.metadata.calculation_profile_code} />
        <Meta label="Engine" value={`${model.metadata.engine} ${model.metadata.engine_version}`} />
        <Meta label="อายนางศ์" value={`${model.metadata.ayanamsa_code} ${formatDeg(model.metadata.ayanamsa_deg)}`} />
        <Meta label="นิรายนะ" value={model.metadata.zodiac_type} />
        <Meta label="Lagna method" value={model.metadata.lagna_method} />
        <Meta label="Ketu method" value={model.metadata.ketu_method} />
      </section>

      <section className="panel">
        <h2>ค่าคำนวณ</h2>
        <dl className="status-meta">
          {Object.entries(model.metadata).map(([key, value])=>(
            <div key={key}>
              <dt>{key}</dt>
              <dd>{Array.isArray(value) ? value.join(", ") || "none" : String(value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel chart-table-panel">
        <h2>ตำแหน่งดาว</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ดาว</th>
                <th>Code</th>
                <th>tropical_longitude_deg</th>
                <th>ayanamsa_deg</th>
                <th>sidereal_longitude_deg</th>
                <th>ราศีไทย</th>
                <th>องศาในราศี</th>
                <th>ถอยหลัง</th>
                <th>speed_longitude_deg_per_day</th>
                <th>เรือน</th>
              </tr>
            </thead>
            <tbody>
              {model.planets.map((planet)=>(
                <tr key={planet.planet_key}>
                  <td>{planet.planet_name_th}</td>
                  <td>{planet.planet_code}</td>
                  <td>{formatDeg(planet.tropical_longitude_deg)}</td>
                  <td>{formatDeg(planet.ayanamsa_deg)}</td>
                  <td>{formatDeg(planet.sidereal_longitude_deg)}</td>
                  <td>{planet.thai_zodiac_sign}</td>
                  <td>{formatDeg(planet.degree_within_sign)}</td>
                  <td>{planet.retrograde ? "R" : "-"}</td>
                  <td>{planet.speed_longitude_deg_per_day === null ? "-" : formatDeg(planet.speed_longitude_deg_per_day)}</td>
                  <td>{planet.house_number ?? (model.housesReliable ? "-" : "ไม่ reliable")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>ผังราศีแบบทวนเข็มนาฬิกา</h2>
        <p className="muted">ราศีเรียงตามลองจิจูดนิรายนะ 0° ถึง 360° โดยปรับตำแหน่งบนจอให้เดินทวนเข็มนาฬิกา</p>
        <div className="zodiac-wheel" aria-label="Thai zodiac signs in counterclockwise order">
          {model.zodiacLayout.map((sign)=>(
            <div
              key={sign.index}
              className="zodiac-node"
              data-counterclockwise-order={sign.counterclockwise_order}
              style={{ left:`${50 + sign.screen_x * 42}%`, top:`${50 + sign.screen_y * 42}%` }}
            >
              <strong>{sign.th}</strong>
              <span>{sign.index} {sign.en}</span>
              <small>{planetLabelsForSign(model.planets, sign.th)}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>ลัคนา</h2>
          <ul className="plain-list">
            <li><strong>Astronomical Ascendant:</strong> {displayAngle(model.angles.ascendant_deg, model.housesReliable)}</li>
            <li><strong>Thai Lagna / ลัคนาไทย:</strong> {displayLagna(model)}</li>
            <li><strong>MC:</strong> {displayAngle(model.angles.mc_deg, model.housesReliable)}</li>
            <li><strong>Descendant:</strong> {displayAngle(model.angles.descendant_deg, model.housesReliable)}</li>
            <li><strong>IC:</strong> {displayAngle(model.angles.ic_deg, model.housesReliable)}</li>
            <li><strong>Local time correction:</strong> {displayNullableDegless(model.metadata.local_time_correction_minutes, "minutes")}</li>
            <li><strong>Sunrise local time:</strong> {model.metadata.sunrise_local_time ?? "not enabled"}</li>
          </ul>
        </article>
        <article className="panel">
          <h2>เรือนชะตา</h2>
          {model.housesReliable ? (
            <ol className="plain-list">
              {model.houseCusps.map((house)=><li key={house.house}>เรือน {house.house}: {formatDeg(house.cusp_deg)}</li>)}
            </ol>
          ) : (
            <p className="guard">เรือนชะตาไม่ reliable เพราะไม่ทราบเวลาเกิด</p>
          )}
        </article>
      </section>

      <section className="panel">
        <h2>คำเตือนจากระบบ</h2>
        {model.metadata.warnings.length ? (
          <ul className="plain-list">{model.metadata.warnings.map((warning)=><li key={warning}>{warning}</li>)}</ul>
        ) : (
          <p>none</p>
        )}
      </section>

      <details className="panel">
        <summary>Chart snapshot JSON</summary>
        <pre>{JSON.stringify(model.chartSnapshotJson, null, 2)}</pre>
      </details>
      <details className="panel">
        <summary>Calculation metadata JSON</summary>
        <pre>{JSON.stringify(model.calculationMetadataJson, null, 2)}</pre>
      </details>

      <div className="actions">
        <Link href="/onboarding">แก้ไขข้อมูลเกิด</Link>
        <Link href="/today">ไปหน้าดวงวันนี้</Link>
        <Link href="/account">บัญชี</Link>
      </div>
    </section>
  );
}

function EmptyChartPreview() {
  return (
    <section className="page">
      <p className="eyebrow">Local chart validation</p>
      <h1>ยังไม่มีข้อมูลคำนวณ</h1>
      <p className="lead">เข้าร่วม beta และบันทึกโปรไฟล์เกิดก่อนเพื่อดูตำแหน่งดาว ลัคนา เรือนชะตา และ metadata</p>
      <div className="actions">
        <Link href="/beta">เข้าร่วม beta</Link>
        <Link href="/onboarding">ไปหน้า onboarding</Link>
      </div>
    </section>
  );
}

function Meta({ label, value }: { label:string; value:string }) {
  return <div className="panel"><span className="muted">{label}</span><strong>{value}</strong></div>;
}

function formatDeg(value:number):string {
  return `${value.toFixed(6)}°`;
}

function displayAngle(value:number|null, reliable:boolean):string {
  return reliable && value !== null ? formatDeg(value) : "ไม่ reliable";
}

function displayLagna(model:ChartPreviewModel):string {
  if (model.metadata.lagna_method !== "thai_antonathi_saman_local_time_sunrise") return "not enabled; using astronomical ascendant only";
  return displayAngle(model.angles.lagna_deg, model.housesReliable);
}

function displayNullableDegless(value:number|null, unit:string):string {
  return value === null ? "not enabled" : `${value.toFixed(6)} ${unit}`;
}

function planetLabelsForSign(planets:{ thai_zodiac_sign:string; planet_code:string }[], thaiSign:string):string {
  const labels = planets.filter((planet)=>planet.thai_zodiac_sign === thaiSign).map((planet)=>planet.planet_code);
  return labels.length ? labels.join(" ") : "-";
}
