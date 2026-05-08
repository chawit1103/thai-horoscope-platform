import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  LIVE_SWISSEPH_UNAVAILABLE_REASON,
  assertChartPreviewSafe,
  buildChartPreviewModeStatuses,
  buildChartPreviewModel,
  buildThaiAlmanacGoldenChartPreviewModel,
  normalizeChartPreviewMode,
} from "../src/mvp/chart-preview";
import { callMockAstroCalc, getMockMvpState, resetMockMvpState, saveBirthProfile, storeChartSnapshot } from "../src/mvp/mock-flow";
import { buildCounterclockwiseZodiacLayout, degreeWithinSign, thaiSignNameFromLongitude, zodiacSignIndex } from "../src/mvp/zodiac";

const sessionId = "chart_preview_test";
const userId = "chart_preview_user";

describe("chart preview", () => {
  beforeEach(() => {
    resetMockMvpState("premium");
  });

  it("uses the Thai almanac golden validation chart by default", () => {
    const model = buildChartPreviewModel();

    assert.ok(model);
    assert.equal(model.dataSource, "golden_fixture_reference");
    assert.equal(model.warningBanner, null);
    assert.equal(model.metadata.calculation_profile_code, "TH_ALMANAC_LAHIRI_MEAN_NODE_SWISSEPH_V1");
    assert.equal(model.metadata.engine, "golden_fixture_reference");
    assert.equal(model.metadata.birth_datetime_utc, "1971-03-11T01:17:00Z");
    assert.equal(model.metadata.ayanamsa_code, "LAHIRI");
    assert.equal(model.metadata.node_type, "mean_node");
    assert.equal(model.metadata.lagna_method, "thai_antonathi_saman_local_time_sunrise");
    assert.equal(model.metadata.sunrise_local_time, "06:29");
    assert.equal(model.metadata.local_time_correction_minutes, -17.86);
    assert.notEqual(model.metadata.calculation_profile_code as string, "TH_MOCK_MVP_V1");
  });

  it("exposes a clear chart preview mode selector status model", () => {
    assert.equal(normalizeChartPreviewMode(undefined), "golden");
    assert.equal(normalizeChartPreviewMode("live"), "live");
    assert.equal(normalizeChartPreviewMode(["mock"]), "mock");
    assert.equal(normalizeChartPreviewMode("surprise"), "golden");

    const statuses = buildChartPreviewModeStatuses("live", false);

    assert.deepEqual(statuses.map((status)=>status.label), ["Golden Fixture Reference", "Live Swisseph Calculation", "Mock MVP"]);
    assert.equal(statuses.find((status)=>status.mode === "golden")?.available, true);
    assert.equal(statuses.find((status)=>status.mode === "live")?.available, false);
    assert.equal(statuses.find((status)=>status.mode === "live")?.selected, true);
    assert.equal(statuses.find((status)=>status.mode === "live")?.status, LIVE_SWISSEPH_UNAVAILABLE_REASON);
    assert.match(statuses.find((status)=>status.mode === "mock")?.status ?? "", /not valid for Thai astrology calculation verification|diagnostic/);
  });

  it("labels mock MVP chart snapshots as invalid for Thai astrology verification", () => {
    createStoredChart({ birthTimeUnknown:false });

    const model = buildChartPreviewModel({ state:getMockMvpState(sessionId), userId });

    assert.ok(model);
    assert.equal(model.dataSource, "mock_mvp_snapshot");
    assert.equal(model.warningBanner, "MOCK DATA - not valid for Thai astrology calculation verification");
    assert.equal(model.metadata.calculation_profile_code, "TH_MOCK_MVP_V1");
    assert.equal(model.metadata.engine, "mock");
    assert.equal(model.metadata.engine_version, "0.1.0");
    assert.equal(model.metadata.birth_datetime_local, "[redacted-mock-birth-datetime-local]");
    assert.equal(model.metadata.birth_datetime_utc, "[redacted-mock-birth-datetime-utc]");
    assert.equal(model.metadata.timezone, "[redacted-mock-timezone]");
    assert.equal(Number.isNaN(model.metadata.latitude), true);
    assert.equal(Number.isNaN(model.metadata.longitude), true);
    assert.equal(model.metadata.ayanamsa_code, "lahiri_mock");
    assert.equal(model.metadata.house_system, "mock_whole_sign");
    assert.equal(model.metadata.lagna_method, "astronomical_ascendant");
    assert.equal(model.metadata.ketu_method, "south_node");
    assert.equal(model.metadata.thai_ketu_9_method, "not_enabled");
    assert.equal(model.metadata.local_time_correction_minutes, null);
    assert.equal(model.metadata.ephemeris_fingerprint, "mock-th-local-v1");
    assert.equal(model.angles.lagna_deg, model.angles.ascendant_deg);
  });

  it("displays Thai Lagna separately from astronomical Ascendant in the golden model", () => {
    const model = buildThaiAlmanacGoldenChartPreviewModel();
    const rawChart = model.chartSnapshotJson as {
      houses:{ ascendant_deg:number|null; lagna_deg:number|null };
      angles:{ ascendant_deg:number|null; lagna_deg:number|null };
    };

    assert.equal(model.metadata.astronomical_ascendant_deg, 358.08990736);
    assert.equal(model.metadata.thai_lagna_deg, 349.59979108);
    assert.notEqual(model.angles.ascendant_deg, model.angles.lagna_deg);
    assert.equal(rawChart.houses.ascendant_deg, model.metadata.thai_lagna_deg);
    assert.equal(rawChart.houses.lagna_deg, model.metadata.thai_lagna_deg);
    assert.equal(rawChart.angles.ascendant_deg, model.metadata.astronomical_ascendant_deg);
    assert.equal(rawChart.angles.lagna_deg, model.metadata.thai_lagna_deg);
    assert.equal(model.planets.find((planet)=>planet.planet_key === "astronomical_ascendant")?.thai_zodiac_sign, "มีน");
    assert.equal(model.planets.find((planet)=>planet.planet_key === "thai_lagna")?.thai_zodiac_sign, "มีน");
    assert.equal(model.planets.find((planet)=>planet.planet_key === "mc")?.thai_zodiac_sign, "ธนู");
  });

  it("displays South Node separately from Thai Ketu ๙ fixture", () => {
    const model = buildThaiAlmanacGoldenChartPreviewModel();
    const southNode = model.planets.find((planet)=>planet.planet_key === "ketu");
    const thaiKetu9 = model.planets.find((planet)=>planet.planet_key === "thai_ketu_9");

    assert.ok(southNode);
    assert.ok(thaiKetu9);
    assert.equal(southNode.thai_zodiac_sign, "กรกฎ");
    assert.equal(thaiKetu9.thai_zodiac_sign, "กันย์");
    assert.equal(model.metadata.ketu_method, "south_node");
    assert.equal(model.metadata.thai_ketu_9_method, "thai_ketu_9_fixture_unsupported_formula");
    assert.match(thaiKetu9.source_note ?? "", /traditional formula not implemented yet/);
  });

  it("renders sidereal longitude and Thai zodiac sign in the planet table model", () => {
    const model = buildThaiAlmanacGoldenChartPreviewModel();
    const sun = model?.planets.find((planet)=>planet.planet_key === "sun");

    assert.ok(sun);
    assert.equal(sun.planet_name_th, "อาทิตย์");
    assert.equal(typeof sun.sidereal_longitude_deg, "number");
    assert.equal(typeof sun.tropical_longitude_deg, "number");
    assert.match(sun.thai_zodiac_sign, /เมษ|พฤษภ|มิถุน|กรกฎ|สิงห์|กันย์|ตุล|พิจิก|ธนู|มกร|กุมภ์|มีน/);
    assert.equal(sun.thai_zodiac_sign, thaiSignNameFromLongitude(sun.sidereal_longitude_deg));
    assert.deepEqual(model.planets.map((planet)=>planet.planet_key), [
      "sun","moon","mercury","venus","mars","jupiter","saturn","rahu","ketu","thai_ketu_9","uranus","neptune","pluto","astronomical_ascendant","thai_lagna","mc",
    ]);
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
    assert.deepEqual(layout.map((sign)=>sign.math_angle_deg), [-90,-120,-150,-180,-210,-240,-270,-300,-330,-360,-390,-420]);
    assert.equal(layout[0]!.screen_y < -0.99, true);
    assert.equal(Math.abs(layout[0]!.screen_x) < 0.000001, true);
    assert.equal(layout[1]!.screen_x < layout[0]!.screen_x, true);
    assert.equal(layout[11]!.screen_x > layout[0]!.screen_x, true);
    assert.equal(layout[3]!.screen_x < -0.99, true);
    assert.equal(layout[6]!.screen_y > 0.99, true);
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

  it("redacts mock birth data from raw preview JSON", () => {
    createStoredChart({ birthTimeUnknown:false });

    const model = buildChartPreviewModel({ state:getMockMvpState(sessionId), userId });

    assert.ok(model);
    const serialized = JSON.stringify({ chart:model.chartSnapshotJson, metadata:model.calculationMetadataJson });
    for (const blocked of ["1992-08-15", "07:30", "Asia/Bangkok", "13.7563", "100.5018"]) {
      assert.equal(serialized.includes(blocked), false);
    }
    assert.match(serialized, /redacted-mock-birth-datetime-local/);
    assert.match(serialized, /redacted-mock-calculation-hash/);
  });

  it("redacts mock birth data from visible preview metadata", () => {
    createStoredChart({ birthTimeUnknown:false });

    const model = buildChartPreviewModel({ state:getMockMvpState(sessionId), userId });

    assert.ok(model);
    const serialized = JSON.stringify(model.metadata);
    for (const blocked of ["1992-08-15", "07:30", "Asia/Bangkok", "13.7563", "100.5018"]) {
      assert.equal(serialized.includes(blocked), false);
    }
    assert.match(serialized, /redacted-mock-birth-datetime-local/);
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
