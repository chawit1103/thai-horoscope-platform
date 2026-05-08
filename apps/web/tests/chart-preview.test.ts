import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { assertChartPreviewSafe, buildChartPreviewModel } from "../src/mvp/chart-preview";
import { callMockAstroCalc, getMockMvpState, resetMockMvpState, saveBirthProfile, storeChartSnapshot } from "../src/mvp/mock-flow";
import { buildCounterclockwiseZodiacLayout, degreeWithinSign, thaiSignNameFromLongitude, zodiacSignIndex } from "../src/mvp/zodiac";

const sessionId = "chart_preview_test";
const userId = "chart_preview_user";

describe("chart preview", () => {
  beforeEach(() => {
    resetMockMvpState("premium");
  });

  it("renders calculation metadata for the latest chart snapshot", () => {
    createStoredChart({ birthTimeUnknown:false });

    const model = buildChartPreviewModel({ state:getMockMvpState(sessionId), userId });

    assert.ok(model);
    assert.equal(model.metadata.calculation_profile_code, "TH_MOCK_MVP_V1");
    assert.equal(model.metadata.engine, "mock");
    assert.equal(model.metadata.engine_version, "0.1.0");
    assert.equal(model.metadata.ayanamsa_code, "lahiri_mock");
    assert.equal(model.metadata.house_system, "mock_whole_sign");
    assert.equal(model.metadata.lagna_method, "astronomical_ascendant");
    assert.equal(model.metadata.ketu_method, "south_node");
    assert.equal(model.metadata.thai_ketu_9_method, "not_enabled");
    assert.equal(model.metadata.local_time_correction_minutes, null);
    assert.equal(model.metadata.ephemeris_fingerprint, "mock-th-local-v1");
    assert.equal(model.angles.lagna_deg, model.angles.ascendant_deg);
  });

  it("renders sidereal longitude and Thai zodiac sign in the planet table model", () => {
    createStoredChart({ birthTimeUnknown:false });

    const model = buildChartPreviewModel({ state:getMockMvpState(sessionId), userId });
    const sun = model?.planets.find((planet)=>planet.planet_key === "sun");

    assert.ok(sun);
    assert.equal(sun.planet_name_th, "อาทิตย์");
    assert.equal(typeof sun.sidereal_longitude_deg, "number");
    assert.equal(typeof sun.tropical_longitude_deg, "number");
    assert.match(sun.thai_zodiac_sign, /เมษ|พฤษภ|มิถุน|กรกฎ|สิงห์|กันย์|ตุล|พิจิก|ธนู|มกร|กุมภ์|มีน/);
  });

  it("maps normalized longitude boundaries to canonical Thai zodiac signs", () => {
    const cases = [
      [0, 0, "เมษ", 0],
      [29.999, 0, "เมษ", 29.999],
      [30, 1, "พฤษภ", 0],
      [59.999, 1, "พฤษภ", 29.999],
      [90, 3, "กรกฎ", 0],
      [120, 4, "สิงห์", 0],
      [180, 6, "ตุล", 0],
      [240, 8, "ธนู", 0],
      [270, 9, "มกร", 0],
      [300, 10, "กุมภ์", 0],
      [330, 11, "มีน", 0],
      [359.999, 11, "มีน", 29.999],
    ] as const;

    for (const [longitude, signIndex, thaiSign, degree] of cases) {
      assert.equal(zodiacSignIndex(longitude), signIndex);
      assert.equal(thaiSignNameFromLongitude(longitude), thaiSign);
      assert.equal(degreeWithinSign(longitude), degree);
    }
  });

  it("uses sidereal longitude rather than stored or tropical sign labels for Thai Nirayana display", () => {
    const chart = createStoredChart({ birthTimeUnknown:false });
    chart.planets.sun = {
      ...chart.planets.sun!,
      tropical_longitude_deg:30,
      sidereal_longitude_deg:0,
      longitude_deg:0,
      sign_index:1,
      sign_name_th:"พฤษภ",
      degree_in_sign:0,
    };

    const model = buildChartPreviewModel({ state:getMockMvpState(sessionId), userId });
    const sun = model?.planets.find((planet)=>planet.planet_key === "sun");

    assert.ok(sun);
    assert.equal(sun.tropical_longitude_deg, 30);
    assert.equal(sun.sidereal_longitude_deg, 0);
    assert.equal(sun.thai_zodiac_sign, "เมษ");
    assert.equal(sun.degree_within_sign, 0);
  });

  it("renders the canonical visual zodiac layout counterclockwise without reversing signs", () => {
    createStoredChart({ birthTimeUnknown:false });

    const model = buildChartPreviewModel({ state:getMockMvpState(sessionId), userId });
    const layout = model?.zodiacLayout ?? buildCounterclockwiseZodiacLayout();

    assert.deepEqual(layout.map((sign)=>sign.th), ["เมษ","พฤษภ","มิถุน","กรกฎ","สิงห์","กันย์","ตุล","พิจิก","ธนู","มกร","กุมภ์","มีน"]);
    assert.deepEqual(layout.map((sign)=>sign.counterclockwise_order), [0,1,2,3,4,5,6,7,8,9,10,11]);
    assert.deepEqual(layout.map((sign)=>sign.math_angle_deg), [0,30,60,90,120,150,180,210,240,270,300,330]);
    assert.equal(layout[1]!.screen_y < layout[0]!.screen_y, true);
    assert.equal(layout[3]!.screen_y < layout[0]!.screen_y, true);
    assert.equal(layout[6]!.screen_x < layout[0]!.screen_x, true);
  });

  it("renders unknown birth time warnings and withholds reliable house assignments", () => {
    createStoredChart({ birthTimeUnknown:true });

    const model = buildChartPreviewModel({ state:getMockMvpState(sessionId), userId });

    assert.ok(model);
    assert.equal(model.housesReliable, false);
    assert.equal(model.metadata.warnings.includes("UNKNOWN_BIRTH_TIME"), true);
    assert.equal(model.metadata.warnings.includes("UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE"), true);
    assert.equal(model.planets.every((planet)=>planet.house_number === null), true);
  });

  it("keeps raw JSON validation output free of provider secrets and raw channel identifiers", () => {
    createStoredChart({ birthTimeUnknown:false });

    const model = buildChartPreviewModel({ state:getMockMvpState(sessionId), userId });

    assert.ok(model);
    assert.doesNotThrow(() => assertChartPreviewSafe(model));
    const serialized = JSON.stringify({ chart:model.chartSnapshotJson, metadata:model.calculationMetadataJson });
    for (const blocked of ["beta@example.test", "UrawLineUserId123456", "payment_provider_id", "webhook_secret", "api_key", "card"]) {
      assert.equal(serialized.includes(blocked), false);
    }
  });
});

function createStoredChart(input:{ birthTimeUnknown:boolean }) {
  const profile = saveBirthProfile({
    birthDate:"1992-08-15",
    birthTime:input.birthTimeUnknown ? "" : "07:30",
    birthTimeUnknown:input.birthTimeUnknown,
    birthPlaceText:"Bangkok",
    timezone:"Asia/Bangkok",
    consentBirthData:true,
  }, { sessionId, userId });
  return storeChartSnapshot(callMockAstroCalc(profile), sessionId);
}
