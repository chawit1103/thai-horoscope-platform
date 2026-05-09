import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { buildLiveChartPreviewRequestFromBirthProfile, fetchUserChartPreviewModel } from "../src/mvp/chart-preview";
import { validateOnboardingFields } from "../src/mvp/beta-user-ux";
import { lineWebFormUrl, safeLineReturnPath } from "../src/mvp/line-liff-onboarding";
import { getMockMvpState, resetMockMvpState, saveBirthProfile, setMockUserPlan } from "../src/mvp/mock-flow";

const sessionId = "line_liff_onboarding_test";
const userId = "line_liff_user";

describe("LINE LIFF onboarding helpers", () => {
  beforeEach(() => {
    resetMockMvpState("free");
  });

  it("builds local dev fallback onboarding links without LIFF config", () => {
    const url = lineWebFormUrl({ path:"/line/onboarding", fallbackBaseUrl:"http://localhost:3000" });

    assert.equal(url, "http://localhost:3000/line/onboarding");
    assert.doesNotMatch(url, /lineUserId|U1234567890|secret|token|payment_/i);
  });

  it("uses configured LIFF URL for LINE onboarding profile and settings links", () => {
    const env = { LINE_LIFF_URL:"https://liff.example.test/line/onboarding?raw=ignored#hash", NEXT_PUBLIC_APP_BASE_URL:"https://app.example.test" };

    assert.equal(lineWebFormUrl({ env, path:"/line/onboarding" }), "https://liff.example.test/line/onboarding");
    assert.equal(lineWebFormUrl({ env, path:"/line/profile" }), "https://liff.example.test/line/profile");
    assert.equal(lineWebFormUrl({ env, path:"/line/settings" }), "https://liff.example.test/line/settings");
  });

  it("validates LINE onboarding birth profile fields including optional coordinates", () => {
    const valid = validateOnboardingFields({
      birthDate:"1971-03-11",
      birthTime:"08:17",
      birthPlaceText:"Bangkok",
      timezone:"Asia/Bangkok",
      latitude:"13.759",
      longitude:"100.535",
      consentBirthData:"on",
    });

    assert.equal(valid.ok, true);
    assert.equal(valid.normalized.latitude, 13.759);
    assert.equal(valid.normalized.longitude, 100.535);

    const invalid = validateOnboardingFields({
      birthDate:"not-a-date",
      birthTime:"25:99",
      birthPlaceText:"",
      timezone:"",
      latitude:"999",
      longitude:"",
      consentBirthData:"",
    });

    assert.equal(invalid.ok, false);
    assert.equal(invalid.errors.some((error)=>error.field === "birthDate"), true);
    assert.equal(invalid.errors.some((error)=>error.field === "birthTime"), true);
    assert.equal(invalid.errors.some((error)=>error.field === "birthPlaceText"), true);
    assert.equal(invalid.errors.some((error)=>error.field === "latitude" || error.field === "longitude"), true);
  });

  it("saves a LINE-entered birth profile and uses explicit coordinates for chart-preview user mode", async () => {
    setMockUserPlan(userId, "free", sessionId);
    const validation = validateOnboardingFields({
      birthDate:"1971-03-11",
      birthTime:"08:17",
      birthPlaceText:"Khon Kaen",
      timezone:"Asia/Bangkok",
      latitude:"16.4419",
      longitude:"102.8359",
      consentBirthData:"on",
    });
    assert.equal(validation.ok, true);
    const profile = saveBirthProfile(validation.normalized, { sessionId, userId });
    const request = buildLiveChartPreviewRequestFromBirthProfile(profile);

    assert.equal(request.latitude, 16.4419);
    assert.equal(request.longitude, 102.8359);
    assert.equal(request.expected_datetime_utc, "1971-03-11T01:17:00Z");

    const result = await fetchUserChartPreviewModel({
      profile,
      env:{ ASTRO_CALC_SERVICE_URL:"https://astro-calc.example.test" },
      fetcher:async () => new Response(JSON.stringify(liveServiceSnapshot(request)), { status:200 }),
    });

    assert.equal(result.model?.profile?.birthPlaceText, "Khon Kaen");
    assert.equal(result.model?.metadata.latitude, 16.4419);
    assert.equal(result.model?.metadata.longitude, 102.8359);
    assert.equal(JSON.stringify(result.model).includes("UrawLineUserIdShouldNotRender"), false);
  });

  it("surfaces unknown birth time warnings and keeps return paths fail-closed", () => {
    const valid = validateOnboardingFields({
      birthDate:"1971-03-11",
      birthTime:"",
      birthTimeUnknown:"on",
      birthPlaceText:"Bangkok",
      timezone:"Asia/Bangkok",
      consentBirthData:"on",
    });

    assert.equal(valid.ok, true);
    assert.equal(valid.normalized.birthTimeUnknown, true);
    assert.equal(valid.normalized.birthTime, "");
    assert.equal(safeLineReturnPath("/line/onboarding/saved"), "/line/onboarding/saved");
    assert.equal(safeLineReturnPath("https://evil.example.test/line/onboarding/saved"), undefined);
    assert.equal(safeLineReturnPath("/admin"), undefined);
  });

  it("keeps LINE onboarding links free of raw LINE IDs and secrets", () => {
    setMockUserPlan(userId, "free", sessionId);
    saveBirthProfile({
      birthDate:"1971-03-11",
      birthTime:"08:17",
      birthTimeUnknown:false,
      birthPlaceText:"Bangkok",
      timezone:"Asia/Bangkok",
      consentBirthData:true,
    }, { sessionId, userId });
    const serialized = JSON.stringify({
      onboardingUrl:lineWebFormUrl({ path:"/line/onboarding", fallbackBaseUrl:"https://beta.example.test" }),
      profileUrl:lineWebFormUrl({ path:"/line/profile", fallbackBaseUrl:"https://beta.example.test" }),
      settingsUrl:lineWebFormUrl({ path:"/line/settings", fallbackBaseUrl:"https://beta.example.test" }),
      activeBirthProfileCount:getMockMvpState(sessionId).birthProfiles.length,
    });

    assert.doesNotMatch(serialized, /\bU[A-Za-z0-9]{8,}\b|LINE_CHANNEL_ACCESS_TOKEN|payment_|webhook_secret|birthDate|birthTime|Bangkok/i);
  });
});

function liveServiceSnapshot(request:{ datetime_local:string; expected_datetime_utc?:string; timezone:string; latitude:number; longitude:number; birth_time_unknown:boolean }) {
  const datetimeUtc = request.expected_datetime_utc ?? "1971-03-11T01:17:00Z";
  return {
    chart_type:"natal",
    calculation_profile_code:"TH_ALMANAC_LAHIRI_MEAN_NODE_SWISSEPH_V1",
    datetime_local:request.datetime_local,
    datetime_utc:datetimeUtc,
    datetime:{ local:request.datetime_local, utc:datetimeUtc, timezone:request.timezone, julian_day_ut:2441021.5534722223 },
    location:{ latitude:request.latitude, longitude:request.longitude, elevation_m:0 },
    engine:{ name:"swisseph", version:"adapter-0.1.0", ephemeris_fingerprint:"swisseph-test-fingerprint" },
    zodiac:{ type:"sidereal", ayanamsa_code:"LAHIRI", ayanamsa_deg:23.4546517 },
    calculation_profile:{ code:"TH_ALMANAC_LAHIRI_MEAN_NODE_SWISSEPH_V1", house_system:"whole_sign", node_type:"mean_node" },
    ephemeris_fingerprint:"swisseph-test-fingerprint",
    calculation_hash:"8a78d428b4a3ddb828f06df56c6bdd0683b37600a0e7d72d6f248ffe7d8bc99f",
    planets:{
      sun:point(326.36536075, false, 12),
      moon:point(134.97763777, false, 6),
    },
    houses:{ system:"whole_sign", reliable:!request.birth_time_unknown, cusps_deg:[330,0,30,60,90,120,150,180,210,240,270,300], ascendant_deg:request.birth_time_unknown ? null : 358.08990736 },
    angles:{ reliable:!request.birth_time_unknown, ascendant_deg:request.birth_time_unknown ? null : 358.08990736, lagna_deg:null, mc_deg:request.birth_time_unknown ? null : 262.99334732, descendant_deg:null, ic_deg:null },
    derived_points:{},
    warnings:request.birth_time_unknown ? [{ code:"UNKNOWN_BIRTH_TIME" }] : [],
    metadata:{ zodiac_type:"sidereal", ayanamsa_code:"LAHIRI", node_type:"mean_node" },
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
