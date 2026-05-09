import Link from "next/link";
import {
  LIVE_SWISSEPH_UNAVAILABLE_REASON,
  USER_CHART_PREVIEW_UNAVAILABLE_REASON,
  assertChartPreviewSafe,
  buildChartPreviewModeStatuses,
  buildChartPreviewModel,
  fetchLiveChartPreviewModel,
  fetchUserChartPreviewModel,
  normalizeChartPreviewMode,
  selectUserBirthProfileForChartPreview,
  type LiveChartPreviewLoadResult,
  type ChartPreviewMode,
  type ChartPreviewModel,
} from "../../src/mvp/chart-preview";
import { getMockMvpState, type BirthProfile, type MockMvpState } from "../../src/mvp/mock-flow";
import { degreeWithinSign, thaiSignNameFromLongitude } from "../../src/mvp/zodiac";
import { getOptionalMockSession } from "../user-session";

interface ChartPreviewPageProps {
  searchParams?:Promise<{ mode?:string|string[]; birthProfileId?:string|string[] }>;
}

export default async function ChartPreviewPage({ searchParams }:ChartPreviewPageProps) {
  const params = await searchParams;
  const mode = normalizeChartPreviewMode(params?.mode);
  const session = await getOptionalMockSession();
  const state = session ? getMockMvpState(session.sessionId) : undefined;
  const birthProfileId = paramValue(params?.birthProfileId);
  const mockModel = loadMockChartPreviewModel(session, state);
  const userProfile = session && state ? selectUserBirthProfileForChartPreview({ state, userId:session.userId, birthProfileId }) : undefined;
  const liveResult = mode === "live" ? await fetchLiveChartPreviewModel() : undefined;
  const userResult = mode === "user" ? await fetchUserChartPreviewModel({ profile:userProfile }) : undefined;
  const model = selectChartPreviewModel(mode, mockModel, liveResult?.model, userResult?.model);
  if (model) assertChartPreviewSafe(model);
  const modeStatuses = buildChartPreviewModeStatuses(mode, Boolean(mockModel), liveStatusFromResult(liveResult), userStatusFromResult(userResult, userProfile));
  const unavailableReason = unavailableReasonForMode(mode, model, liveResult, userResult);

  return (
    <section className="page">
      <p className="eyebrow">Local chart validation</p>
      <h1>ตรวจสอบค่าคำนวณดวงไทย</h1>
      <p className="lead">หน้านี้แสดงข้อมูลคำนวณเท่านั้น ไม่มีคำทำนายหรือข้อความตีความดวง</p>

      <section className="panel">
        <h2>Chart preview mode</h2>
        <div className="mode-selector" role="list" aria-label="Chart preview mode selector">
          {modeStatuses.map((item)=>(
            <Link
              key={item.mode}
              href={item.href}
              className={`mode-option ${item.selected ? "selected" : ""} ${item.available ? "available" : "unavailable"}`}
              aria-current={item.selected ? "page" : undefined}
              role="listitem"
            >
              <strong>{item.label}</strong>
              <span>{item.available ? "Available" : "Unavailable"}</span>
            </Link>
          ))}
        </div>
        <dl className="status-meta mode-status">
          {modeStatuses.map((item)=>(
            <div key={item.mode}>
              <dt>{item.label}</dt>
              <dd>{item.status}</dd>
            </div>
          ))}
        </dl>
      </section>

      {!model ? (
        <UnavailablePreview mode={mode} reason={unavailableReason} />
      ) : (
        <ChartPreviewContent model={model} />
      )}
    </section>
  );
}

function loadMockChartPreviewModel(
  session:{ sessionId:string; userId:string }|undefined,
  state:MockMvpState|undefined,
):ChartPreviewModel|undefined {
  if (!session) return undefined;
  if (!state) return undefined;
  return buildChartPreviewModel({ state, userId:session.userId });
}

function selectChartPreviewModel(
  mode:ChartPreviewMode,
  mockModel:ChartPreviewModel|undefined,
  liveModel:ChartPreviewModel|undefined,
  userModel:ChartPreviewModel|undefined,
):ChartPreviewModel|undefined {
  if (mode === "golden") return buildChartPreviewModel();
  if (mode === "mock") return mockModel;
  if (mode === "user") return userModel;
  return liveModel;
}

function unavailableReasonForMode(
  mode:ChartPreviewMode,
  model:ChartPreviewModel|undefined,
  liveResult:LiveChartPreviewLoadResult|undefined,
  userResult:LiveChartPreviewLoadResult|undefined,
):string {
  if (model) return "";
  if (mode === "live") return liveResult?.unavailableReason ?? LIVE_SWISSEPH_UNAVAILABLE_REASON;
  if (mode === "user") return userResult?.unavailableReason ?? USER_CHART_PREVIEW_UNAVAILABLE_REASON;
  if (mode === "mock") return "Mock MVP mode is unavailable because this browser session does not have a mock MVP chart snapshot. This mode is diagnostic only and is never treated as Thai calculation validation.";
  return "Chart preview mode is unavailable.";
}

function liveStatusFromResult(liveResult:LiveChartPreviewLoadResult|undefined) {
  if (!liveResult) {
    return { available:false, status:LIVE_SWISSEPH_UNAVAILABLE_REASON };
  }
  if (liveResult.model) {
    return { available:true, status:"Live Swisseph service returned a sanitized Thai almanac chart snapshot." };
  }
  return { available:false, status:liveResult.unavailableReason ?? LIVE_SWISSEPH_UNAVAILABLE_REASON };
}

function userStatusFromResult(liveResult:LiveChartPreviewLoadResult|undefined, profile:BirthProfile|undefined) {
  if (!profile) {
    return { available:false, status:"User Birth Profile mode unavailable: no active birth profile exists for this session." };
  }
  if (!liveResult) {
    return { available:false, status:USER_CHART_PREVIEW_UNAVAILABLE_REASON };
  }
  if (liveResult.model) {
    return { available:true, status:"Live astro-calc service returned a sanitized chart snapshot for the current birth profile." };
  }
  return { available:false, status:liveResult.unavailableReason ?? USER_CHART_PREVIEW_UNAVAILABLE_REASON };
}

function paramValue(value:string|string[]|undefined):string|undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

function UnavailablePreview({ mode, reason }:{ mode:ChartPreviewMode; reason:string }) {
  return (
    <section className="guard">
      <strong>{mode === "live" ? "Live Swisseph Calculation unavailable" : mode === "user" ? "User Birth Profile chart unavailable" : "Chart preview unavailable"}</strong>
      <p>{reason}</p>
      <div className="actions">
        <Link href="/chart-preview?mode=golden">Open Golden Fixture Reference</Link>
        <Link href="/chart-preview?mode=user">Open User Birth Profile</Link>
        <Link href="/onboarding">Create mock MVP data</Link>
      </div>
    </section>
  );
}

function ChartPreviewContent({ model }:{ model:ChartPreviewModel }) {
  const unknownBirthTime = model.metadata.warnings.includes("UNKNOWN_BIRTH_TIME") || !model.housesReliable;
  return (
    <>
      {model.warningBanner ? (
        <section className="guard">
          <strong>{model.warningBanner}</strong>
        </section>
      ) : null}
      {model.referenceNotice ? (
        <section className="guard">
          <strong>{referenceNoticeTitle(model)}</strong>
          <p>{model.referenceNotice}</p>
        </section>
      ) : null}

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
                <th>หมายเหตุ</th>
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
                  <td>{planet.source_note ?? "-"}</td>
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
            <li><strong>Astronomical Ascendant:</strong> {displayZodiacAngle(model.angles.ascendant_deg, model.housesReliable)}</li>
            <li><strong>Thai Lagna / ลัคนาไทย:</strong> {displayLagna(model)}</li>
            <li><strong>MC:</strong> {displayZodiacAngle(model.angles.mc_deg, model.housesReliable)}</li>
            <li><strong>Descendant:</strong> {displayZodiacAngle(model.angles.descendant_deg, model.housesReliable)}</li>
            <li><strong>IC:</strong> {displayZodiacAngle(model.angles.ic_deg, model.housesReliable)}</li>
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
    </>
  );
}

function Meta({ label, value }: { label:string; value:string }) {
  return <div className="panel"><span className="muted">{label}</span><strong>{value}</strong></div>;
}

function referenceNoticeTitle(model:ChartPreviewModel):string {
  if (model.dataSource === "live_swisseph_service") return "Live Swisseph service mode";
  if (model.dataSource === "golden_fixture_reference") return "Golden reference mode";
  return "Chart preview mode";
}

function formatDeg(value:number):string {
  return `${value.toFixed(6)}°`;
}

function displayLagna(model:ChartPreviewModel):string {
  if (model.metadata.lagna_method !== "thai_antonathi_saman_local_time_sunrise") return "not enabled; using astronomical ascendant only";
  return displayZodiacAngle(model.angles.lagna_deg, model.housesReliable);
}

function displayZodiacAngle(value:number|null, reliable:boolean):string {
  if (!reliable || value === null) return "ไม่ reliable";
  return `${thaiSignNameFromLongitude(value)} ${formatDeg(degreeWithinSign(value))} (${formatDeg(value)})`;
}

function displayNullableDegless(value:number|null, unit:string):string {
  return value === null ? "not enabled" : `${value.toFixed(6)} ${unit}`;
}

function planetLabelsForSign(planets:{ thai_zodiac_sign:string; planet_code:string }[], thaiSign:string):string {
  const labels = planets.filter((planet)=>planet.thai_zodiac_sign === thaiSign).map((planet)=>planet.planet_code);
  return labels.length ? labels.join(" ") : "-";
}
