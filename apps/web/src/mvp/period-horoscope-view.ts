import { ENTERTAINMENT_DISCLAIMER, buildSafeHoroscopeView, type SafeHoroscopeView } from "./beta-user-ux";
import { fetchUserChartPreviewModel, selectUserBirthProfileForChartPreview, type ChartPreviewModel } from "./chart-preview";
import { generateHoroscopeContent, type HoroscopeContentOutput, type HoroscopeSafetyFlag, type StructuredChartSnapshot } from "./horoscope-content-engine";
import { type MockMvpState, type PeriodType } from "./mock-flow";
import { type SubscriptionRecord } from "./subscription-lifecycle";
import { zodiacSignIndex } from "./zodiac";

export type HoroscopeSourceMode = "live_chart_based" | "prototype_rules" | "mock_rules";

export interface DisplayHoroscopeRuleHit {
  rule_id:string;
  trigger:string;
  category:string;
  weight:number;
  source_points:string[];
}

export interface PeriodHoroscopeView extends SafeHoroscopeView {
  sourceMode:HoroscopeSourceMode;
  sourceStatus:string;
  periodKey:string;
  calculationHash:string;
  contentProfileCode:string;
  ruleHits:DisplayHoroscopeRuleHit[];
  safetyFlags:HoroscopeSafetyFlag[];
  liveUnavailableReason:string|null;
}

const CONTENT_PROFILE_CODE = "TH_SAFE_REFLECTION_V1";

const periodTitles:Record<PeriodType, string> = {
  daily:"ดวงวันนี้จากผังดวงของคุณ",
  weekly:"ดวงสัปดาห์นี้จากผังดวงของคุณ",
  monthly:"ดวงเดือนนี้จากผังดวงของคุณ",
  yearly:"ดวงปีนี้จากผังดวงของคุณ",
};

const periodSummaryPrefixes:Record<PeriodType, string> = {
  daily:"โฟกัสรายวัน",
  weekly:"ธีมรายสัปดาห์",
  monthly:"ทิศทางรายเดือน",
  yearly:"ภาพรวมรายปี",
};

const sectionLabels:Array<{ key:keyof Pick<HoroscopeContentOutput, "overview"|"work"|"money"|"relationship"|"wellness"|"advice"|"caution">; heading:string }> = [
  { key:"overview", heading:"ภาพรวม" },
  { key:"work", heading:"งาน/การเรียน" },
  { key:"money", heading:"การเงิน" },
  { key:"relationship", heading:"ความสัมพันธ์" },
  { key:"wellness", heading:"สุขภาวะ" },
  { key:"advice", heading:"คำแนะนำ" },
  { key:"caution", heading:"ข้อควรระวัง" },
];

export async function buildPeriodHoroscopeView(input:{
  state:MockMvpState;
  userId:string;
  periodType:PeriodType;
  subscription?:SubscriptionRecord;
  now?:Date;
  env?:Record<string, string|undefined>;
  fetcher?:typeof fetch;
  timeoutMs?:number;
}):Promise<PeriodHoroscopeView> {
  const now = input.now ?? new Date();
  const baseView = buildSafeHoroscopeView({
    state:input.state,
    userId:input.userId,
    periodType:input.periodType,
    subscription:input.subscription,
    now,
  });

  if (!baseView.allowed) {
    return decorateUnavailableView(baseView, {
      sourceMode:"prototype_rules",
      sourceStatus:"Entitlement check blocked this period before horoscope generation.",
      periodKey:periodKeyFor(input.periodType, now),
      liveUnavailableReason:null,
    });
  }

  const profile = selectUserBirthProfileForChartPreview({ state:input.state, userId:input.userId });
  const periodKey = periodKeyFor(input.periodType, now, profile?.timezone);
  const liveResult = await fetchUserChartPreviewModel({
    profile,
    env:input.env,
    fetcher:input.fetcher,
    timeoutMs:input.timeoutMs,
  });

  if (liveResult.model) {
    return buildLiveChartBasedView({
      baseView,
      model:liveResult.model,
      periodType:input.periodType,
      periodKey,
      now,
    });
  }

  return buildMockDiagnosticFallbackView({
    state:input.state,
    userId:input.userId,
    periodType:input.periodType,
    baseView,
    periodKey,
    liveUnavailableReason:liveResult.unavailableReason,
  });
}

function buildLiveChartBasedView(input:{
  baseView:SafeHoroscopeView;
  model:ChartPreviewModel;
  periodType:PeriodType;
  periodKey:string;
  now:Date;
}):PeriodHoroscopeView {
  const content = generateHoroscopeContent({
    periodType:input.periodType,
    periodKey:input.periodKey,
    chartSnapshot:structuredChartSnapshotFromPreviewModel(input.model),
    contentProfileCode:CONTENT_PROFILE_CODE,
    generatedAt:input.now,
  });
  const warningTexts = [
    ...input.baseView.warnings,
    ...input.model.metadata.warnings,
    ...content.warnings.map((warning)=>`${warning.code}: ${warning.message}`),
  ];

  return {
    ...input.baseView,
    title:periodTitles[input.periodType],
    summary:`${periodSummaryPrefixes[input.periodType]}สำหรับ ${input.periodKey} อ้างอิง live chart snapshot แล้ว แต่กฎรายช่วงยังเป็น prototype rules ที่ปลอดภัยและไม่ใช้ LLM`,
    sections:sectionLabels.map((section)=>({ heading:section.heading, body:content[section.key] })),
    warnings:dedupeStrings(warningTexts),
    disclaimer:ENTERTAINMENT_DISCLAIMER,
    sourceMode:"live_chart_based",
    sourceStatus:"Live chart available; period horoscope rules are still prototype.",
    periodKey:content.period_key,
    calculationHash:content.calculation_hash,
    contentProfileCode:content.content_profile_code,
    ruleHits:content.rule_hits,
    safetyFlags:content.safety_flags,
    liveUnavailableReason:null,
  };
}

function buildMockDiagnosticFallbackView(input:{
  state:MockMvpState;
  userId:string;
  periodType:PeriodType;
  baseView:SafeHoroscopeView;
  periodKey:string;
  liveUnavailableReason:string|null;
}):PeriodHoroscopeView {
  const result = input.state.horoscopeResults.find((item)=>item.userId === input.userId && item.periodType === input.periodType);
  const sourceStatus = `Live chart unavailable; displaying Mock MVP diagnostic content only. ${input.liveUnavailableReason ?? "No live chart result was available."}`;
  return {
    ...input.baseView,
    summary:`${periodSummaryPrefixes[input.periodType]}สำหรับ ${input.periodKey}: mock diagnostic only. Configure ASTRO_CALC_SERVICE_URL for live user chart-based content.`,
    warnings:dedupeStrings([
      ...input.baseView.warnings,
      "MOCK_RULES_DIAGNOSTIC_ONLY",
      input.liveUnavailableReason ?? "Live chart unavailable; no silent mock fallback was used.",
    ]),
    disclaimer:ENTERTAINMENT_DISCLAIMER,
    sourceMode:"mock_rules",
    sourceStatus,
    periodKey:input.periodKey,
    calculationHash:"[mock-diagnostic-calculation-hash-redacted]",
    contentProfileCode:"MOCK_MVP_DIAGNOSTIC",
    ruleHits:(result?.rule_hits_json ?? []).map((hit)=>({
      rule_id:hit.rule_id,
      trigger:"mock_diagnostic_rule",
      category:hit.category,
      weight:hit.weight,
      source_points:["mock_chart"],
    })),
    safetyFlags:[],
    liveUnavailableReason:input.liveUnavailableReason,
  };
}

function decorateUnavailableView(
  baseView:SafeHoroscopeView,
  input:{ sourceMode:HoroscopeSourceMode; sourceStatus:string; periodKey:string; liveUnavailableReason:string|null },
):PeriodHoroscopeView {
  return {
    ...baseView,
    sourceMode:input.sourceMode,
    sourceStatus:input.sourceStatus,
    periodKey:input.periodKey,
    calculationHash:"[not-generated]",
    contentProfileCode:"[not-generated]",
    ruleHits:[],
    safetyFlags:[],
    liveUnavailableReason:input.liveUnavailableReason,
  };
}

function structuredChartSnapshotFromPreviewModel(model:ChartPreviewModel):StructuredChartSnapshot {
  return {
    id:`live_chart_${model.metadata.calculation_hash.slice(0, 12)}`,
    calculation_hash:model.metadata.calculation_hash,
    calculation_profile_code:model.metadata.calculation_profile_code,
    planets:Object.fromEntries(model.planets.map((planet)=>[
      planet.planet_key,
      {
        sign_index:zodiacSignIndex(planet.sidereal_longitude_deg),
        longitude_deg:planet.sidereal_longitude_deg,
        retrograde:planet.retrograde,
        house_number:model.housesReliable ? planet.house_number : null,
      },
    ])),
    houses:{
      reliable:model.housesReliable,
      ascendant_deg:model.angles.ascendant_deg,
      cusps_deg:model.houseCusps.map((house)=>house.cusp_deg),
    },
    angles:{ reliable:model.housesReliable },
    warnings:model.metadata.warnings,
  };
}

function periodKeyFor(periodType:PeriodType, now:Date, timezone = "UTC"):string {
  const parts = datePartsInTimeZone(now, timezone);
  if (periodType === "daily") return `${parts.year}-${parts.month}-${parts.day}`;
  if (periodType === "monthly") return `${parts.year}-${parts.month}`;
  if (periodType === "yearly") return parts.year;
  return isoWeekKey(new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))));
}

function datePartsInTimeZone(date:Date, timezone:string):{ year:string; month:string; day:string } {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone:timezone,
      year:"numeric",
      month:"2-digit",
      day:"2-digit",
    }).formatToParts(date);
    const value = (type:string)=>parts.find((part)=>part.type === type)?.value;
    const year = value("year");
    const month = value("month");
    const day = value("day");
    if (year && month && day) return { year, month, day };
  } catch {
    // Fall back to UTC for invalid local timezone strings; validation handles profile issues elsewhere.
  }
  return {
    year:String(date.getUTCFullYear()),
    month:String(date.getUTCMonth() + 1).padStart(2, "0"),
    day:String(date.getUTCDate()).padStart(2, "0"),
  };
}

function isoWeekKey(date:Date):string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function dedupeStrings(values:string[]):string[] {
  return [...new Set(values.filter((value)=>value.trim()))];
}
