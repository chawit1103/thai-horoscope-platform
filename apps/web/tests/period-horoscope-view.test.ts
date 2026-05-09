import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { buildPeriodHoroscopeView, safeChartReference } from "../src/mvp/period-horoscope-view";
import { callMockAstroCalc, generateHoroscopeResult, getMockMvpState, getMockPeriodKey, resetMockMvpState, saveBirthProfile, setMockUserPlan, storeChartSnapshot, type PeriodType } from "../src/mvp/mock-flow";
import { resetMockSubscriptionState, type SubscriptionRecord } from "../src/mvp/subscription-lifecycle";

const sessionId = "period_horoscope_view_test";
const userId = "period_horoscope_user";
const now = new Date("2026-05-09T04:00:00.000Z");

describe("period horoscope live user chart view", () => {
  beforeEach(() => {
    resetMockMvpState("free");
    resetMockSubscriptionState();
  });

  it("uses the current user's live chart source for daily content when astro-calc is available", async () => {
    createBirthProfile({ planCode:"free" });
    const view = await buildPeriodHoroscopeView({
      state:getMockMvpState(sessionId),
      userId,
      periodType:"daily",
      now,
      env:{ ASTRO_CALC_SERVICE_URL:"https://astro-calc.example.test" },
      fetcher:mockLiveFetcher(liveServiceSnapshot()),
    });

    assert.equal(view.allowed, true);
    assert.equal(view.sourceMode, "live_chart_based");
    assert.match(view.sourceStatus, /Live chart available/);
    assert.doesNotMatch(view.summary, /mock rule hits/i);
    assert.equal(view.periodKey, "2026-05-09");
    assert.equal(view.calculationReference, safeChartReference(liveCalculationHash));
    assert.doesNotMatch(JSON.stringify(view), new RegExp(liveCalculationHash));
    assert.doesNotMatch(JSON.stringify(view), /[a-f0-9]{32,}/i);
    assert.equal(view.contentProfileCode, "TH_SAFE_REFLECTION_V1");
    assert.equal(view.ruleHits.some((hit)=>hit.rule_id.includes("DAILY")), true);
  });

  it("renders distinct period-specific content for weekly monthly and yearly live views", async () => {
    createBirthProfile({ planCode:"premium" });
    const subscription = activePremiumSubscription();
    const views = await Promise.all((["weekly", "monthly", "yearly"] as PeriodType[]).map((periodType)=>buildPeriodHoroscopeView({
      state:getMockMvpState(sessionId),
      userId,
      periodType,
      subscription,
      now,
      env:{ ASTRO_CALC_SERVICE_URL:"https://astro-calc.example.test" },
      fetcher:mockLiveFetcher(liveServiceSnapshot()),
    })));

    assert.deepEqual(views.map((view)=>view.sourceMode), ["live_chart_based", "live_chart_based", "live_chart_based"]);
    assert.deepEqual(views.map((view)=>view.periodKey), ["2026-W19", "2026-05", "2026"]);
    assert.equal(new Set(views.map((view)=>view.summary)).size, 3);
    assert.equal(new Set(views.map((view)=>view.ruleHits[0]?.rule_id)).size, 3);
    assert.equal(views.every((view)=>!JSON.stringify(view).includes("สร้างจาก 6 mock rule hits")), true);
  });

  it("shows an explicit unavailable mock diagnostic state when astro-calc service is unavailable", async () => {
    createBirthProfile({ planCode:"free", generateMock:true });
    let fetchCalled = false;
    const view = await buildPeriodHoroscopeView({
      state:getMockMvpState(sessionId),
      userId,
      periodType:"daily",
      now,
      env:{},
      fetcher:async () => {
        fetchCalled = true;
        return new Response("{}");
      },
    });

    assert.equal(fetchCalled, false);
    assert.equal(view.sourceMode, "mock_rules");
    assert.match(view.sourceStatus, /Live chart unavailable/);
    assert.match(view.sourceStatus, /ASTRO_CALC_SERVICE_URL/);
    assert.equal(view.calculationReference, "mock-diagnostic-chart-reference-redacted");
    assert.equal(view.contentProfileCode, "MOCK_MVP_DIAGNOSTIC");
    assert.doesNotMatch(view.summary, /สร้างจาก 6 mock rule hits/);
  });

  it("surfaces unknown birth time warnings without exposing raw birth data", async () => {
    createBirthProfile({ planCode:"free", birthTimeUnknown:true });
    const view = await buildPeriodHoroscopeView({
      state:getMockMvpState(sessionId),
      userId,
      periodType:"daily",
      now,
      env:{ ASTRO_CALC_SERVICE_URL:"https://astro-calc.example.test" },
      fetcher:mockLiveFetcher(liveServiceSnapshot({
        datetime_local:"1971-03-11T12:00:00",
        datetime_utc:"1971-03-11T05:00:00Z",
        warnings:[{ code:"UNKNOWN_BIRTH_TIME" }, { code:"UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE" }],
        houses:{ system:"whole_sign", reliable:false, cusps_deg:[], ascendant_deg:null },
        angles:{ reliable:false, ascendant_deg:null, lagna_deg:null, mc_deg:null, descendant_deg:null, ic_deg:null },
        derived_points:{},
      })),
    });
    const serialized = JSON.stringify(view);

    assert.equal(view.sourceMode, "live_chart_based");
    assert.match(view.warnings.join("\n"), /UNKNOWN_BIRTH_TIME|เวลาเกิดไม่ชัดเจน/);
    assert.doesNotMatch(serialized, /1971-03-11|08:17|12:00|Bangkok|Asia\/Bangkok|beta@example|UrawLine|payment_/);
  });
});

function createBirthProfile(input:{ planCode:"free"|"basic"|"premium"; birthTimeUnknown?:boolean; generateMock?:boolean }) {
  setMockUserPlan(userId, input.planCode, sessionId);
  const profile = saveBirthProfile({
    birthDate:"1971-03-11",
    birthTime:input.birthTimeUnknown ? "" : "08:17",
    birthTimeUnknown:input.birthTimeUnknown ?? false,
    birthPlaceText:"Bangkok",
    timezone:"Asia/Bangkok",
    consentBirthData:true,
  }, { sessionId, userId });
  if (input.generateMock) {
    const chart = storeChartSnapshot(callMockAstroCalc(profile), sessionId);
    for (const periodType of ["daily", "weekly", "monthly", "yearly"] as PeriodType[]) {
      generateHoroscopeResult({ chartSnapshot:chart, periodType, periodKey:getMockPeriodKey(periodType), sessionId });
    }
  }
  return profile;
}

function activePremiumSubscription():SubscriptionRecord {
  return {
    id:"sub_period_horoscope_premium",
    userId,
    planCode:"premium",
    status:"active",
    currentPeriodStart:"2026-05-01T00:00:00.000Z",
    currentPeriodEnd:"2026-06-01T00:00:00.000Z",
    cancelAtPeriodEnd:false,
    updatedAt:"2026-05-01T00:00:00.000Z",
  };
}

function mockLiveFetcher(snapshot:unknown):typeof fetch {
  return async (_url, _init) => new Response(JSON.stringify(snapshot), { status:200 });
}

const liveCalculationHash = "8a78d428b4a3ddb828f06df56c6bdd0683b37600a0e7d72d6f248ffe7d8bc99f";

function liveServiceSnapshot(override:Record<string, unknown> = {}) {
  const datetimeLocal = String(override.datetime_local ?? "1971-03-11T08:17:00");
  const datetimeUtc = String(override.datetime_utc ?? "1971-03-11T01:17:00Z");
  return {
    chart_type:"natal",
    calculation_profile_code:"TH_ALMANAC_LAHIRI_MEAN_NODE_SWISSEPH_V1",
    datetime_local:datetimeLocal,
    datetime_utc:datetimeUtc,
    datetime:{ local:datetimeLocal, utc:datetimeUtc, timezone:"Asia/Bangkok", julian_day_ut:2441021.5534722223 },
    location:{ latitude:13.759, longitude:100.535, elevation_m:0 },
    engine:{ name:"swisseph", version:"adapter-0.1.0", ephemeris_fingerprint:"swisseph-test-fingerprint" },
    zodiac:{ type:"sidereal", ayanamsa_code:"LAHIRI", ayanamsa_deg:23.4546517 },
    calculation_profile:{ code:"TH_ALMANAC_LAHIRI_MEAN_NODE_SWISSEPH_V1", house_system:"whole_sign", node_type:"mean_node" },
    ephemeris_fingerprint:"swisseph-test-fingerprint",
    calculation_hash:liveCalculationHash,
    planets:{
      sun:point(326.36536075, false, 12),
      moon:point(134.97763777, false, 6),
      mercury:point(330.35385332, false, 1),
      venus:point(284.65438755, false, 11),
      mars:point(245.7132242, false, 10),
      jupiter:point(222.76113283, false, 9),
      saturn:point(24.6892194, false, 2),
      rahu:point(298.849263, true, 11),
      ketu:point(118.849263, true, 5),
    },
    houses:{ system:"whole_sign", reliable:true, cusps_deg:[330,0,30,60,90,120,150,180,210,240,270,300], ascendant_deg:358.08990736 },
    angles:{ reliable:true, ascendant_deg:358.08990736, lagna_deg:349.59979108, mc_deg:262.99334732, descendant_deg:178.08990736, ic_deg:82.99334732 },
    derived_points:{
      astronomical_ascendant:point(358.08990736, false, 1),
      thai_lagna:point(349.59979108, false, 1),
      mc:point(262.99334732, false, 10),
    },
    warnings:[],
    metadata:{
      zodiac_type:"sidereal",
      ayanamsa_code:"LAHIRI",
      node_type:"mean_node",
      ketu_method:"south_node",
      thai_ketu_9_method:"not_enabled",
      lagna_method:"thai_antonathi_saman_local_time_sunrise",
      lagna_source:"local_mean_time_plus_sunrise_sun",
      local_time_correction_minutes:-17.86,
      sunrise_local_time:"06:29",
    },
    ...override,
  };
}

function point(sidereal_longitude_deg:number, retrograde:boolean, house_number:number|null) {
  return {
    sidereal_longitude_deg,
    tropical_longitude_deg:(sidereal_longitude_deg + 23.4546517) % 360,
    retrograde,
    speed_longitude_deg_per_day:1,
    house_number,
  };
}
