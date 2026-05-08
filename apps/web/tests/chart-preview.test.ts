import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  LIVE_SWISSEPH_UNAVAILABLE_REASON,
  assertChartPreviewSafe,
  buildChartPreviewModeStatuses,
  buildChartPreviewModel,
  buildLiveSwissephChartPreviewModel,
  buildThaiAlmanacGoldenChartPreviewModel,
  fetchLiveChartPreviewModel,
  LIVE_CHART_PREVIEW_PROFILE,
  LIVE_CHART_PREVIEW_REQUEST,
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

  it("keeps live mode unavailable without ASTRO_CALC_SERVICE_URL and never returns mock data", async () => {
    let fetchCalled = false;
    const result = await fetchLiveChartPreviewModel({
      env:{},
      fetcher:async () => {
        fetchCalled = true;
        return new Response("{}");
      },
    });

    assert.equal(fetchCalled, false);
    assert.equal(result.model, undefined);
    assert.match(result.unavailableReason ?? "", /ASTRO_CALC_SERVICE_URL/);
    assert.match(result.unavailableReason ?? "", /never falls back to Mock MVP/);
  });

  it("sanitizes live astro-calc service errors", async () => {
    const result = await fetchLiveChartPreviewModel({
      env:{ ASTRO_CALC_SERVICE_URL:"http://localhost:8000" },
      fetcher:async () => {
        throw new Error("boom /Users/chawit/ephemeris ASTRO_EPHEMERIS_PATH=/secret api_key=secret-token");
      },
    });

    assert.equal(result.model, undefined);
    assert.match(result.unavailableReason ?? "", /sanitized Thai almanac chart snapshot/);
    assert.doesNotMatch(result.unavailableReason ?? "", /Users|ASTRO_EPHEMERIS_PATH|api_key|secret-token/);
  });

  it("renders live mode from a mocked astro-calc service response", async () => {
    let requestedUrl = "";
    let requestedBody:unknown;
    const result = await fetchLiveChartPreviewModel({
      env:{ ASTRO_CALC_SERVICE_URL:"https://example.test/astro-calc" },
      fetcher:async (url, init) => {
        requestedUrl = String(url);
        requestedBody = JSON.parse(String(init?.body ?? "{}"));
        return new Response(JSON.stringify(liveServiceSnapshot()), { status:200 });
      },
    });

    assert.equal(requestedUrl, "https://example.test/astro-calc/v1/charts/natal");
    assert.deepEqual(requestedBody, LIVE_CHART_PREVIEW_REQUEST);
    assert.ok(result.model);
    assert.equal(result.model.dataSource, "live_swisseph_service");
    assert.equal(result.model.warningBanner, null);
    assert.equal(result.model.metadata.engine, "swisseph");
    assert.equal(result.model.metadata.calculation_profile_code, LIVE_CHART_PREVIEW_PROFILE);
    assert.equal(result.model.metadata.birth_datetime_utc, "1971-03-11T01:17:00Z");
    assert.equal(result.model.metadata.ayanamsa_code, "LAHIRI");
    assert.equal(result.model.metadata.node_type, "mean_node");
    assert.equal(result.model.planets.find((planet)=>planet.planet_key === "sun")?.thai_zodiac_sign, "กุมภ์");
    assert.ok(Math.abs((result.model.planets.find((planet)=>planet.planet_key === "sun")?.sidereal_longitude_deg ?? 0) - 326.36536075) < 0.0000001);
    assert.equal(result.model.planets.find((planet)=>planet.planet_key === "astronomical_ascendant")?.thai_zodiac_sign, "มีน");
    assert.equal(result.model.planets.find((planet)=>planet.planet_key === "thai_lagna")?.thai_zodiac_sign, "มีน");
    assert.equal(result.model.planets.find((planet)=>planet.planet_key === "mc")?.thai_zodiac_sign, "ธนู");
    assert.doesNotThrow(() => assertChartPreviewSafe(result.model!));
  });

  it("redacts sensitive values from live raw JSON output", () => {
    const snapshot = liveServiceSnapshot({
      extra:{
        ephemeris_path:"/Users/chawit/private/ephemeris",
        mounted_file:"/opt/swisseph/sepl_18.se1",
        provider_secret:"sk_live_abc123",
        token:"abc123",
        line_user:"UrawLineUserId123456",
        contact:"beta@example.test",
      },
    });
    const model = buildLiveSwissephChartPreviewModel(snapshot);
    const serialized = JSON.stringify({ chart:model.chartSnapshotJson, metadata:model.calculationMetadataJson });

    assert.doesNotThrow(() => assertChartPreviewSafe(model));
    for (const blocked of ["/Users/chawit", "/opt/swisseph", "sk_live_abc123", "abc123", "UrawLineUserId123456", "beta@example.test"]) {
      assert.equal(serialized.includes(blocked), false);
    }
  });

  it("rejects live service responses without an ephemeris fingerprint", () => {
    const snapshot = liveServiceSnapshot({
      override:{
        ephemeris_fingerprint:"",
        engine:{
          name:"swisseph",
          version:"adapter-0.1.0",
          license_mode:"free",
          ephemeris_path_configured:false,
          ephemeris_fingerprint:"",
        },
      },
    });

    assert.throws(() => buildLiveSwissephChartPreviewModel(snapshot), /LIVE_CHART_PREVIEW_MISSING_EPHEMERIS_FINGERPRINT/);
  });

  it("marks live mode available only after a successful service-backed model exists", () => {
    const model = buildLiveSwissephChartPreviewModel(liveServiceSnapshot());
    const statuses = buildChartPreviewModeStatuses("live", false, {
      available:true,
      status:"Live Swisseph service returned a sanitized Thai almanac chart snapshot.",
    });

    assert.equal(model.dataSource, "live_swisseph_service");
    assert.equal(statuses.find((status)=>status.mode === "live")?.available, true);
    assert.match(statuses.find((status)=>status.mode === "live")?.status ?? "", /sanitized Thai almanac/);
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
    assert.equal(rawChart.houses.ascendant_deg, model.metadata.astronomical_ascendant_deg);
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

function liveServiceSnapshot(input?:{ extra?:Record<string, unknown>; override?:Record<string, unknown> }) {
  const snapshot = {
    chart_type:"natal",
    engine_name:"swisseph",
    engine:{
      name:"swisseph",
      version:"adapter-0.1.0",
      license_mode:"free",
      ephemeris_path_configured:false,
      ephemeris_fingerprint:"swisseph-moshier-built-in",
    },
    engine_version:"adapter-0.1.0",
    ephemeris_source:"swisseph-moshier-local-validation",
    ephemeris_fingerprint:"swisseph-moshier-built-in",
    calculation_profile_code:LIVE_CHART_PREVIEW_PROFILE,
    calculation_profile:{
      code:LIVE_CHART_PREVIEW_PROFILE,
      zodiac_type:"sidereal",
      ayanamsha:"LAHIRI",
      house_system:"whole_sign",
      node_type:"mean_node",
      planets:["sun","moon","mercury","venus","mars","jupiter","saturn","rahu","uranus","neptune","pluto"],
      aspect_orbs_deg:{},
    },
    datetime:{
      local:"1971-03-11T08:17:00",
      utc:"1971-03-11T01:17:00Z",
      timezone:"Asia/Bangkok",
      julian_day_ut:2441021.5534722223,
    },
    datetime_local:"1971-03-11T08:17:00",
    datetime_utc:"1971-03-11T01:17:00Z",
    julian_day_ut:2441021.5534722223,
    location:{ latitude:13.759, longitude:100.535, elevation_m:0 },
    calculation_hash:"live-fixture-calculation-hash",
    zodiac:{ type:"sidereal", ayanamsa_code:"LAHIRI", ayanamsa_deg:23.4546517 },
    ayanamsa_deg:23.4546517,
    ayanamsha:{ name:"LAHIRI", value_deg:23.4546517 },
    planets:{
      sun:livePlanet(349.82001245, 326.36536075, false, 0.99840182, 12),
      moon:livePlanet(158.43228947, 134.97763777, false, 11.81559666, 6),
      mercury:livePlanet(353.80850502, 330.35385332, false, 1.95975361, 1),
      venus:livePlanet(308.10903925, 284.65438755, false, 1.17097417, 11),
      mars:livePlanet(269.1678759, 245.7132242, false, 0.60748118, 10),
      jupiter:livePlanet(246.21578453, 222.76113283, false, 0.03849892, 9),
      saturn:livePlanet(48.1438711, 24.6892194, false, 0.08730855, 2),
      rahu:livePlanet(322.3039147, 298.849263, true, -0.05298888, 11),
      ketu:livePlanet(142.3039147, 118.849263, true, -0.05298888, 5),
      uranus:livePlanet(192.44476534, 168.99011364, true, -0.03866419, 7),
      neptune:livePlanet(243.06535933, 219.61070763, true, -0.00299675, 9),
      pluto:livePlanet(178.60395694, 155.14930524, true, -0.02690374, 7),
    },
    houses:{
      system:"whole_sign",
      ascendant_deg:358.08990736,
      mc_deg:262.99334732,
      cusps_deg:[330,0,30,60,90,120,150,180,210,240,270,300],
      reliable:true,
    },
    angles:{
      ascendant_deg:358.08990736,
      lagna_deg:349.59979108,
      mc_deg:262.99334732,
      ic_deg:82.99334732,
      descendant_deg:178.08990736,
      reliable:true,
    },
    derived_points:{
      thai_lagna:livePlanet(13.05444278, 349.59979108, false, 0, 1),
      mc:livePlanet(286.44799902, 262.99334732, false, 0, 10),
    },
    aspects:[],
    warnings:[{ code:"LIVE_SERVICE_TEST_FIXTURE", message:"mocked service response" }],
    metadata:{
      node_type:"mean_node",
      ketu_method:"south_node",
      thai_ketu_9_method:"not_enabled",
      lagna_method:"thai_antonathi_saman_local_time_sunrise",
      lagna_source:"local_mean_time_plus_sunrise_sun",
      local_time_correction_minutes:"-17.86",
      sunrise_local_time:"06:29",
      ...input?.extra,
    },
  };
  return { ...snapshot, ...input?.override };
}

function livePlanet(
  tropical_longitude_deg:number,
  sidereal_longitude_deg:number,
  retrograde:boolean,
  speed_longitude_deg_per_day:number,
  house_number:number,
) {
  return {
    tropical_longitude_deg,
    ayanamsa_deg:23.4546517,
    sidereal_longitude_deg,
    ecliptic_latitude_deg:0,
    longitude_deg:sidereal_longitude_deg,
    latitude_deg:0,
    speed_longitude_deg_per_day,
    sign_index:zodiacSignIndex(sidereal_longitude_deg),
    sign_name_th:thaiSignNameFromLongitude(sidereal_longitude_deg),
    degree_in_sign:degreeWithinSign(sidereal_longitude_deg),
    retrograde,
    house_number,
  };
}
