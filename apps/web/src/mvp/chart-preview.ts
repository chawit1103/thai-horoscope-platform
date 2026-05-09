import { type BirthProfile, type ChartSnapshot, type MockMvpState } from "./mock-flow";
import {
  buildCounterclockwiseZodiacLayout,
  degreeWithinSign,
  normalizeLongitudeDeg,
  thaiSignNameFromLongitude,
  zodiacSignIndex,
  type ZodiacLayoutSign,
} from "./zodiac";

export type ChartPreviewDataSource = "golden_fixture_reference" | "live_swisseph_service" | "mock_mvp_snapshot";
export type ChartPreviewMode = "golden" | "live" | "mock" | "user";

export interface LiveChartPreviewRequest {
  calculation_profile_code:string;
  datetime_local:string;
  timezone:string;
  latitude:number;
  longitude:number;
  birth_time_unknown:boolean;
}

export interface ExpectedLiveChartPreviewRequest extends LiveChartPreviewRequest {
  expected_datetime_utc?:string;
}

export interface ChartPreviewModeStatus {
  mode:ChartPreviewMode;
  label:string;
  selected:boolean;
  available:boolean;
  status:string;
  href:string;
}

export interface LiveChartPreviewLoadResult {
  model:ChartPreviewModel|undefined;
  unavailableReason:string|null;
}

export interface LiveChartPreviewStatus {
  available:boolean;
  status:string;
}

export interface ChartPreviewMetadata {
  birth_datetime_local:string;
  birth_datetime_utc:string;
  timezone:string;
  latitude:number;
  longitude:number;
  calculation_profile_code:string;
  engine:string;
  engine_version:string;
  zodiac_type:string;
  ayanamsa_code:string;
  ayanamsa_deg:number;
  house_system:string;
  node_type:string;
  ketu_method:string;
  thai_ketu_9_method:string;
  lagna_method:string;
  lagna_source:string;
  local_time_correction_minutes:number|null;
  sunrise_local_time:string|null;
  astronomical_ascendant_deg:number|null;
  thai_lagna_deg:number|null;
  ephemeris_source:string;
  ephemeris_fingerprint:string;
  calculation_hash:string;
  warnings:string[];
}

export interface ChartPreviewPlanet {
  planet_key:string;
  planet_name_th:string;
  planet_code:string;
  tropical_longitude_deg:number;
  ayanamsa_deg:number;
  sidereal_longitude_deg:number;
  thai_zodiac_sign:string;
  degree_within_sign:number;
  retrograde:boolean;
  speed_longitude_deg_per_day:number|null;
  house_number:number|null;
  source_note?:string;
}

export interface ChartPreviewModel {
  profile:BirthProfile|null;
  chart:unknown;
  dataSource:ChartPreviewDataSource;
  warningBanner:string|null;
  referenceNotice:string|null;
  metadata:ChartPreviewMetadata;
  planets:ChartPreviewPlanet[];
  zodiacLayout:ZodiacLayoutSign[];
  housesReliable:boolean;
  angles:{ ascendant_deg:number|null; lagna_deg:number|null; mc_deg:number|null; descendant_deg:number|null; ic_deg:number|null };
  houseCusps:{ house:number; cusp_deg:number }[];
  chartSnapshotJson:unknown;
  calculationMetadataJson:ChartPreviewMetadata;
}

const AYANAMSA_DEG = 23.4546517;
export const LIVE_CHART_PREVIEW_PROFILE = "TH_ALMANAC_LAHIRI_MEAN_NODE_SWISSEPH_V1";
export const LIVE_SWISSEPH_UNAVAILABLE_REASON = "Live Swisseph Calculation is unavailable because ASTRO_CALC_SERVICE_URL is not configured. Golden Fixture Reference remains the default validation reference; live mode never falls back to Mock MVP data.";
export const USER_CHART_PREVIEW_UNAVAILABLE_REASON = "User Birth Profile live chart preview is unavailable because ASTRO_CALC_SERVICE_URL is not configured. The page does not fall back to Mock MVP data for user chart validation.";
const LIVE_CHART_PREVIEW_EXPECTED_UTC = "1971-03-11T01:17:00Z";
export const LIVE_CHART_PREVIEW_REQUEST:LiveChartPreviewRequest = {
  calculation_profile_code:LIVE_CHART_PREVIEW_PROFILE,
  datetime_local:"1971-03-11T08:17:00",
  timezone:"Asia/Bangkok",
  latitude:13.759,
  longitude:100.535,
  birth_time_unknown:false,
};

const PLANET_LABELS:Record<string,{th:string;code:string}> = {
  sun:{ th:"อาทิตย์", code:"SU" },
  moon:{ th:"จันทร์", code:"MO" },
  mercury:{ th:"พุธ", code:"ME" },
  venus:{ th:"ศุกร์", code:"VE" },
  mars:{ th:"อังคาร", code:"MA" },
  jupiter:{ th:"พฤหัสบดี", code:"JU" },
  saturn:{ th:"เสาร์", code:"SA" },
  uranus:{ th:"ยูเรนัส", code:"UR" },
  neptune:{ th:"เนปจูน", code:"NE" },
  pluto:{ th:"พลูโต", code:"PL" },
  rahu:{ th:"ราหู", code:"RA" },
  ketu:{ th:"South Node / โหนดใต้", code:"SN" },
  thai_ketu_9:{ th:"Thai Ketu ๙ / เกตุ ๙", code:"K9" },
  astronomical_ascendant:{ th:"Astronomical Ascendant", code:"ASC" },
  thai_lagna:{ th:"Thai Lagna / ลัคนาไทย", code:"LAG" },
  mc:{ th:"MC", code:"MC" },
};

export function buildChartPreviewModel(input?:{ state:MockMvpState; userId:string }):ChartPreviewModel|undefined {
  if (!input) return buildThaiAlmanacGoldenChartPreviewModel();
  return buildMockChartPreviewModel(input);
}

export function normalizeChartPreviewMode(value:unknown):ChartPreviewMode {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "live" || raw === "mock" || raw === "golden" || raw === "user") return raw;
  return "golden";
}

export function buildChartPreviewModeStatuses(
  selectedMode:ChartPreviewMode,
  mockAvailable:boolean,
  liveStatus:LiveChartPreviewStatus = { available:false, status:LIVE_SWISSEPH_UNAVAILABLE_REASON },
  userStatus:LiveChartPreviewStatus = { available:false, status:USER_CHART_PREVIEW_UNAVAILABLE_REASON },
):ChartPreviewModeStatus[] {
  return [
    {
      mode:"golden",
      label:"Golden Fixture Reference",
      selected:selectedMode === "golden",
      available:true,
      status:"Default validation reference",
      href:"/chart-preview?mode=golden",
    },
    {
      mode:"live",
      label:"Live Swisseph Calculation",
      selected:selectedMode === "live",
      available:liveStatus.available,
      status:liveStatus.status,
      href:"/chart-preview?mode=live",
    },
    {
      mode:"user",
      label:"User Birth Profile",
      selected:selectedMode === "user",
      available:userStatus.available,
      status:userStatus.status,
      href:"/chart-preview?mode=user",
    },
    {
      mode:"mock",
      label:"Mock MVP",
      selected:selectedMode === "mock",
      available:mockAvailable,
      status:mockAvailable
        ? "Mock MVP diagnostic only; not valid for Thai astrology calculation verification"
        : "Mock MVP diagnostic unavailable: no local mock chart snapshot exists for this session",
      href:"/chart-preview?mode=mock",
    },
  ];
}

export async function fetchLiveChartPreviewModel(input?:{
  env?:Record<string, string|undefined>;
  fetcher?:typeof fetch;
  timeoutMs?:number;
  request?:ExpectedLiveChartPreviewRequest;
  referenceNotice?:string;
  profile?:BirthProfile|null;
}):Promise<LiveChartPreviewLoadResult> {
  const env = input?.env ?? process.env;
  const fetcher = input?.fetcher ?? fetch;
  const timeoutMs = input?.timeoutMs ?? 5000;
  const request = input?.request ?? {
    ...LIVE_CHART_PREVIEW_REQUEST,
    expected_datetime_utc:LIVE_CHART_PREVIEW_EXPECTED_UTC,
  };
  const serviceUrl = normalizeServiceUrl(env.ASTRO_CALC_SERVICE_URL);

  if (!serviceUrl) {
    return liveUnavailable(input?.request ? USER_CHART_PREVIEW_UNAVAILABLE_REASON : LIVE_SWISSEPH_UNAVAILABLE_REASON);
  }

  try {
    const endpoint = liveChartPreviewEndpoint(serviceUrl);
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), timeoutMs);
    const response = await fetcher(endpoint, {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body:JSON.stringify(requestBodyFromExpectedRequest(request)),
        cache:"no-store",
        signal:controller.signal,
      })
      .finally(()=>clearTimeout(timeout));

    if (!response.ok) {
      return liveUnavailable(`Live Swisseph Calculation unavailable: astro-calc service returned HTTP ${response.status}. Golden Fixture Reference remains available and no mock fallback was used.`);
    }

    const snapshot = await response.json();
    const model = buildLiveSwissephChartPreviewModel(snapshot, {
      expectedRequest:request,
      referenceNotice:input?.referenceNotice,
      profile:input?.profile ?? null,
    });
    assertChartPreviewSafe(model);
    return { model, unavailableReason:null };
  } catch {
    return liveUnavailable("Live Swisseph Calculation unavailable: astro-calc service could not return a sanitized Thai almanac chart snapshot. Golden Fixture Reference remains available and no mock fallback was used.");
  }
}

export async function fetchUserChartPreviewModel(input:{
  profile?:BirthProfile;
  env?:Record<string, string|undefined>;
  fetcher?:typeof fetch;
  timeoutMs?:number;
}):Promise<LiveChartPreviewLoadResult> {
  if (!input.profile) {
    return liveUnavailable("User Birth Profile live chart preview unavailable: no active birth profile exists for the current session. Create or update onboarding first; no Mock MVP fallback was used.");
  }

  try {
    const request = buildLiveChartPreviewRequestFromBirthProfile(input.profile);
    return await fetchLiveChartPreviewModel({
      env:input.env,
      fetcher:input.fetcher,
      timeoutMs:input.timeoutMs,
      request,
      profile:input.profile,
      referenceNotice:"User Birth Profile live service mode: values are returned by the configured astro-calc service for the current user's birth profile. This mode never falls back to Mock MVP data.",
    });
  } catch {
    return liveUnavailable("User Birth Profile live chart preview unavailable: birth profile data could not be converted into a sanitized astro-calc request. No Mock MVP fallback was used.");
  }
}

export function selectUserBirthProfileForChartPreview(input:{
  state:MockMvpState;
  userId:string;
  birthProfileId?:string;
}):BirthProfile|undefined {
  const profiles = input.state.birthProfiles.filter((profile)=>profile.userId === input.userId);
  if (input.birthProfileId) return profiles.find((profile)=>profile.id === input.birthProfileId);
  return [...profiles].reverse()[0];
}

export function buildLiveChartPreviewRequestFromBirthProfile(profile:BirthProfile):ExpectedLiveChartPreviewRequest {
  const localTime = profile.birthTimeUnknown ? "12:00" : profile.birthTime;
  if (!localTime || !/^\d{2}:\d{2}$/.test(localTime)) throw new Error("USER_CHART_PREVIEW_INVALID_BIRTH_TIME");
  const datetimeLocal = `${profile.birthDate}T${localTime}:00`;
  const location = localValidationCoordinatesForBirthPlace(profile.birthPlaceText);
  return {
    calculation_profile_code:LIVE_CHART_PREVIEW_PROFILE,
    datetime_local:datetimeLocal,
    timezone:profile.timezone,
    latitude:location.latitude,
    longitude:location.longitude,
    birth_time_unknown:profile.birthTimeUnknown,
    expected_datetime_utc:localDateTimeToUtcIso(datetimeLocal, profile.timezone),
  };
}

export function buildLiveSwissephChartPreviewModel(snapshot:unknown, input?:{
  expectedRequest?:ExpectedLiveChartPreviewRequest;
  referenceNotice?:string;
  profile?:BirthProfile|null;
}):ChartPreviewModel {
  const root = asRecord(snapshot);
  if (!root) throw new Error("LIVE_CHART_PREVIEW_INVALID_PAYLOAD");

  const expectedRequest = input?.expectedRequest ?? {
    ...LIVE_CHART_PREVIEW_REQUEST,
    expected_datetime_utc:LIVE_CHART_PREVIEW_EXPECTED_UTC,
  };
  const metadata = liveMetadataFromSnapshot(root);
  validateLiveChartMetadata(metadata, expectedRequest);
  const displayMetadata = metadataWithForcedUnknownBirthTimeWarnings(
    sanitizeLiveChartPreviewMetadata(metadata),
    expectedRequest,
  );
  const houses = asRecord(root.houses);
  const angles = asRecord(root.angles);
  const housesReliableFromService = booleanValue(houses?.reliable) ?? booleanValue(angles?.reliable) ?? true;
  const housesReliable = expectedRequest.birth_time_unknown ? false : housesReliableFromService;
  const houseCusps = housesReliable ? numberArray(houses?.cusps_deg).map((cusp, index)=>({ house:index+1, cusp_deg:cusp })) : [];
  const planets = planetsFromLiveSnapshot(root, displayMetadata, housesReliable);
  if (!planets.length) throw new Error("LIVE_CHART_PREVIEW_EMPTY_PLANET_TABLE");
  const chart = sanitizeLiveChartPreviewValue(root);

  const model:ChartPreviewModel = {
    profile:input?.profile ?? null,
    chart,
    dataSource:"live_swisseph_service",
    warningBanner:null,
    referenceNotice:input?.referenceNotice ?? "Live Swisseph service mode: values are returned by the configured astro-calc service for the Thai almanac golden validation input. This mode never falls back to Mock MVP data.",
    metadata:displayMetadata,
    planets,
    zodiacLayout:buildCounterclockwiseZodiacLayout(),
    housesReliable,
    angles:{
      ascendant_deg:displayMetadata.astronomical_ascendant_deg,
      lagna_deg:displayMetadata.thai_lagna_deg,
      mc_deg:numberValue(angles?.mc_deg),
      descendant_deg:numberValue(angles?.descendant_deg),
      ic_deg:numberValue(angles?.ic_deg),
    },
    houseCusps,
    chartSnapshotJson:chart,
    calculationMetadataJson:displayMetadata,
  };

  assertChartPreviewSafe(model);
  return model;
}

export function buildThaiAlmanacGoldenChartPreviewModel():ChartPreviewModel {
  const metadata:ChartPreviewMetadata = {
    birth_datetime_local:"1971-03-11T08:17:00",
    birth_datetime_utc:"1971-03-11T01:17:00Z",
    timezone:"Asia/Bangkok",
    latitude:13.759,
    longitude:100.535,
    calculation_profile_code:"TH_ALMANAC_LAHIRI_MEAN_NODE_SWISSEPH_V1",
    engine:"golden_fixture_reference",
    engine_version:"swisseph-moshier-reference",
    zodiac_type:"sidereal",
    ayanamsa_code:"LAHIRI",
    ayanamsa_deg:AYANAMSA_DEG,
    house_system:"whole_sign",
    node_type:"mean_node",
    ketu_method:"south_node",
    thai_ketu_9_method:"thai_ketu_9_fixture_unsupported_formula",
    lagna_method:"thai_antonathi_saman_local_time_sunrise",
    lagna_source:"local_mean_time_plus_sunrise_sun",
    local_time_correction_minutes:-17.86,
    sunrise_local_time:"06:29",
    astronomical_ascendant_deg:358.08990736,
    thai_lagna_deg:349.59979108,
    ephemeris_source:"golden-fixture-from-swisseph-moshier",
    ephemeris_fingerprint:"swisseph-moshier-built-in",
    calculation_hash:"8a78d428b4a3ddb828f06df56c6bdd0683b37600a0e7d72d6f248ffe7d8bc99f",
    warnings:["GOLDEN_FIXTURE_REFERENCE_MODE","THAI_KETU_9_FORMULA_UNSUPPORTED"],
  };
  const planets = [
    point("sun", 349.82001245, 326.36536075, false, 0.99840182, 12),
    point("moon", 158.43228947, 134.97763777, false, 11.81559666, 6),
    point("mercury", 353.80850502, 330.35385332, false, 1.95975361, 1),
    point("venus", 308.10903925, 284.65438755, false, 1.17097417, 11),
    point("mars", 269.1678759, 245.7132242, false, 0.60748118, 10),
    point("jupiter", 246.21578453, 222.76113283, false, 0.03849892, 9),
    point("saturn", 48.1438711, 24.6892194, false, 0.08730855, 2),
    point("rahu", 322.3039147, 298.849263, true, -0.05298888, 11),
    point("ketu", 142.3039147, 118.849263, true, -0.05298888, 5),
    point("thai_ketu_9", 199.83798503, 176.38333333, false, null, 7, "Thai Ketu ๙ shown from golden fixture/reference; traditional formula not implemented yet."),
    point("uranus", 192.44476534, 168.99011364, true, -0.03866419, 7),
    point("neptune", 243.06535933, 219.61070763, true, -0.00299675, 9),
    point("pluto", 178.60395694, 155.14930524, true, -0.02690374, 7),
    point("astronomical_ascendant", 21.54455906, 358.08990736, false, null, 1),
    point("thai_lagna", 13.05444278, 349.59979108, false, null, 1),
    point("mc", 286.44799902, 262.99334732, false, null, 10),
  ];
  const chart = {
    chart_type:"natal",
    data_source:"golden_fixture_reference",
    metadata,
    planets:Object.fromEntries(planets.map((planet)=>[planet.planet_key, planet])),
    houses:{ system:"whole_sign", ascendant_deg:metadata.astronomical_ascendant_deg, lagna_deg:metadata.thai_lagna_deg, mc_deg:262.99334732, cusps_deg:wholeSignCuspsFromLagna(metadata.thai_lagna_deg), reliable:true },
    angles:{ ascendant_deg:metadata.astronomical_ascendant_deg, lagna_deg:metadata.thai_lagna_deg, mc_deg:262.99334732, descendant_deg:178.08990736, ic_deg:82.99334732, reliable:true },
    note:"Golden fixture/reference chart for local Thai almanac validation; no horoscope interpretation text.",
  };
  return {
    profile:null,
    chart,
    dataSource:"golden_fixture_reference",
    warningBanner:null,
    referenceNotice:"Golden fixture/reference mode: values are the local Thai almanac validation reference for 1971-03-11 08:17 Asia/Bangkok. Thai Ketu ๙ is fixture-backed; the traditional formula is not implemented yet.",
    metadata,
    planets,
    zodiacLayout:buildCounterclockwiseZodiacLayout(),
    housesReliable:true,
    angles:{
      ascendant_deg:metadata.astronomical_ascendant_deg,
      lagna_deg:metadata.thai_lagna_deg,
      mc_deg:262.99334732,
      descendant_deg:178.08990736,
      ic_deg:82.99334732,
    },
    houseCusps:wholeSignCuspsFromLagna(metadata.thai_lagna_deg).map((cusp, index)=>({ house:index+1, cusp_deg:cusp })),
    chartSnapshotJson:chart,
    calculationMetadataJson:metadata,
  };
}

function buildMockChartPreviewModel(input:{ state:MockMvpState; userId:string }):ChartPreviewModel|undefined {
  const profile = [...input.state.birthProfiles].reverse().find((item)=>item.userId===input.userId);
  if (!profile) return undefined;
  const chart = [...input.state.chartSnapshots].reverse().find((item)=>item.userId===input.userId && item.birthProfileId===profile.id);
  if (!chart) return undefined;
  const metadata = metadataFromMockChart(chart);
  const redactedChart = redactedMockChartSnapshot(chart);
  const redactedMetadata = redactedMockMetadata(metadata);
  return {
    profile:null,
    chart:redactedChart,
    dataSource:"mock_mvp_snapshot",
    warningBanner:"MOCK DATA - not valid for Thai astrology calculation verification",
    referenceNotice:null,
    metadata:redactedMetadata,
    planets:planetsFromMockChart(chart),
    zodiacLayout:buildCounterclockwiseZodiacLayout(),
    housesReliable:chart.houses.reliable && chart.angles.reliable,
    angles:{
      ascendant_deg:chart.angles.ascendant_deg,
      lagna_deg:chart.angles.lagna_deg,
      mc_deg:chart.angles.mc_deg,
      descendant_deg:chart.angles.descendant_deg,
      ic_deg:chart.angles.ic_deg,
    },
    houseCusps:chart.houses.cusps_deg.map((cusp, index)=>({ house:index+1, cusp_deg:cusp })),
    chartSnapshotJson:redactedChart,
    calculationMetadataJson:redactedMetadata,
  };
}

function metadataFromMockChart(chart:ChartSnapshot):ChartPreviewMetadata {
  return {
    birth_datetime_local:chart.datetime_local,
    birth_datetime_utc:chart.datetime_utc,
    timezone:chart.timezone,
    latitude:chart.latitude,
    longitude:chart.longitude,
    calculation_profile_code:chart.calculation_profile_code,
    engine:chart.engine,
    engine_version:chart.engine_version,
    zodiac_type:chart.zodiac_type,
    ayanamsa_code:chart.ayanamsa_code,
    ayanamsa_deg:chart.ayanamsa_deg,
    house_system:chart.house_system,
    node_type:chart.node_type,
    ketu_method:chart.ketu_method,
    thai_ketu_9_method:chart.thai_ketu_9_method,
    lagna_method:chart.lagna_method,
    lagna_source:chart.lagna_source,
    local_time_correction_minutes:chart.local_time_correction_minutes,
    sunrise_local_time:chart.sunrise_local_time,
    astronomical_ascendant_deg:chart.astronomical_ascendant_deg,
    thai_lagna_deg:chart.thai_lagna_deg,
    ephemeris_source:chart.ephemeris_source,
    ephemeris_fingerprint:chart.ephemeris_fingerprint,
    calculation_hash:chart.calculation_hash,
    warnings:["MOCK_DATA_NOT_VALID_FOR_THAI_ASTROLOGY_VERIFICATION", ...chart.warnings],
  };
}

function redactedMockChartSnapshot(chart:ChartSnapshot):unknown {
  return {
    ...chart,
    id:"[redacted-mock-chart-id]",
    userId:"[redacted-mock-user-id]",
    birthProfileId:"[redacted-mock-birth-profile-id]",
    datetime_local:"[redacted-mock-birth-datetime-local]",
    datetime_utc:"[redacted-mock-birth-datetime-utc]",
    timezone:"[redacted-mock-timezone]",
    latitude:"[redacted-mock-latitude]",
    longitude:"[redacted-mock-longitude]",
    julian_day_ut:"[redacted-mock-julian-day]",
    calculation_hash:"[redacted-mock-calculation-hash]",
  };
}

function redactedMockMetadata(metadata:ChartPreviewMetadata):ChartPreviewMetadata {
  return {
    ...metadata,
    birth_datetime_local:"[redacted-mock-birth-datetime-local]",
    birth_datetime_utc:"[redacted-mock-birth-datetime-utc]",
    timezone:"[redacted-mock-timezone]",
    latitude:Number.NaN,
    longitude:Number.NaN,
    calculation_hash:"[redacted-mock-calculation-hash]",
  };
}

function planetsFromMockChart(chart:ChartSnapshot):ChartPreviewPlanet[] {
  return Object.entries(chart.planets).map(([planetKey, planet])=>{
    const displayLongitude = chart.zodiac_type === "sidereal" ? planet.sidereal_longitude_deg : planet.tropical_longitude_deg;
    return {
      planet_key:planetKey,
      planet_name_th:PLANET_LABELS[planetKey]?.th ?? planetKey,
      planet_code:PLANET_LABELS[planetKey]?.code ?? planetKey.toUpperCase().slice(0, 2),
      tropical_longitude_deg:planet.tropical_longitude_deg,
      ayanamsa_deg:planet.ayanamsa_deg,
      sidereal_longitude_deg:planet.sidereal_longitude_deg,
      thai_zodiac_sign:thaiSignNameFromLongitude(displayLongitude),
      degree_within_sign:degreeWithinSign(displayLongitude),
      retrograde:planet.retrograde,
      speed_longitude_deg_per_day:planet.speed_longitude_deg_per_day ?? null,
      house_number:chart.houses.reliable ? planet.house_number ?? null : null,
    };
  });
}

function liveMetadataFromSnapshot(root:Record<string, unknown>):ChartPreviewMetadata {
  const engine = asRecord(root.engine);
  const datetime = asRecord(root.datetime);
  const location = asRecord(root.location);
  const zodiac = asRecord(root.zodiac);
  const ayanamsha = asRecord(root.ayanamsha);
  const calculationProfile = asRecord(root.calculation_profile);
  const metadata = asRecord(root.metadata) ?? {};
  const angles = asRecord(root.angles);

  return {
    birth_datetime_local:stringValue(root.datetime_local) ?? stringValue(datetime?.local) ?? "",
    birth_datetime_utc:stringValue(root.datetime_utc) ?? stringValue(datetime?.utc) ?? "",
    timezone:stringValue(datetime?.timezone) ?? stringValue(root.timezone) ?? "",
    latitude:numberValue(location?.latitude) ?? numberValue(root.latitude) ?? Number.NaN,
    longitude:numberValue(location?.longitude) ?? numberValue(root.longitude) ?? Number.NaN,
    calculation_profile_code:stringValue(root.calculation_profile_code) ?? stringValue(calculationProfile?.code) ?? "",
    engine:stringValue(root.engine_name) ?? stringValue(engine?.name) ?? "",
    engine_version:stringValue(root.engine_version) ?? stringValue(engine?.version) ?? "",
    zodiac_type:stringValue(zodiac?.type) ?? stringValue(metadata.zodiac_type) ?? "",
    ayanamsa_code:stringValue(zodiac?.ayanamsa_code) ?? stringValue(ayanamsha?.name) ?? stringValue(metadata.ayanamsa_code) ?? "",
    ayanamsa_deg:numberValue(root.ayanamsa_deg) ?? numberValue(zodiac?.ayanamsa_deg) ?? numberValue(ayanamsha?.value_deg) ?? Number.NaN,
    house_system:stringValue(calculationProfile?.house_system) ?? stringValue(metadata.house_system) ?? stringValue(asRecord(root.houses)?.system) ?? "",
    node_type:stringValue(calculationProfile?.node_type) ?? stringValue(metadata.node_type) ?? "",
    ketu_method:stringValue(metadata.ketu_method) ?? "south_node",
    thai_ketu_9_method:stringValue(metadata.thai_ketu_9_method) ?? "not_enabled",
    lagna_method:stringValue(metadata.lagna_method) ?? "astronomical_ascendant",
    lagna_source:stringValue(metadata.lagna_source) ?? "astro_calc_service",
    local_time_correction_minutes:numberValue(metadata.local_time_correction_minutes),
    sunrise_local_time:stringValue(metadata.sunrise_local_time),
    astronomical_ascendant_deg:numberValue(angles?.ascendant_deg),
    thai_lagna_deg:numberValue(angles?.lagna_deg),
    ephemeris_source:stringValue(root.ephemeris_source) ?? stringValue(metadata.ephemeris_source) ?? "",
    ephemeris_fingerprint:stringValue(root.ephemeris_fingerprint) ?? stringValue(engine?.ephemeris_fingerprint) ?? "",
    calculation_hash:stringValue(root.calculation_hash) ?? "",
    warnings:warningsFromLiveSnapshot(root),
  };
}

function validateLiveChartMetadata(metadata:ChartPreviewMetadata, expectedRequest:ExpectedLiveChartPreviewRequest):void {
  if (metadata.engine !== "swisseph") throw new Error("LIVE_CHART_PREVIEW_UNSUPPORTED_ENGINE");
  if (metadata.calculation_profile_code !== LIVE_CHART_PREVIEW_PROFILE) throw new Error("LIVE_CHART_PREVIEW_UNSUPPORTED_PROFILE");
  if (metadata.zodiac_type !== "sidereal") throw new Error("LIVE_CHART_PREVIEW_UNSUPPORTED_ZODIAC");
  if (metadata.ayanamsa_code.toUpperCase() !== "LAHIRI") throw new Error("LIVE_CHART_PREVIEW_UNSUPPORTED_AYANAMSA");
  if (metadata.node_type !== "mean_node") throw new Error("LIVE_CHART_PREVIEW_UNSUPPORTED_NODE_TYPE");
  if (!metadata.ephemeris_fingerprint.trim()) throw new Error("LIVE_CHART_PREVIEW_MISSING_EPHEMERIS_FINGERPRINT");
  validateLiveChartRequestEcho(metadata, expectedRequest);
}

function validateLiveChartRequestEcho(metadata:ChartPreviewMetadata, expectedRequest:ExpectedLiveChartPreviewRequest):void {
  if (metadata.birth_datetime_local !== expectedRequest.datetime_local) {
    throw new Error("LIVE_CHART_PREVIEW_UNEXPECTED_LOCAL_DATETIME");
  }
  if (metadata.timezone !== expectedRequest.timezone) {
    throw new Error("LIVE_CHART_PREVIEW_UNEXPECTED_TIMEZONE");
  }
  if (expectedRequest.expected_datetime_utc && utcMillis(metadata.birth_datetime_utc) !== utcMillis(expectedRequest.expected_datetime_utc)) {
    throw new Error("LIVE_CHART_PREVIEW_UNEXPECTED_UTC_DATETIME");
  }
  if (!numbersNearlyEqual(metadata.latitude, expectedRequest.latitude, 0.000001)) {
    throw new Error("LIVE_CHART_PREVIEW_UNEXPECTED_LATITUDE");
  }
  if (!numbersNearlyEqual(metadata.longitude, expectedRequest.longitude, 0.000001)) {
    throw new Error("LIVE_CHART_PREVIEW_UNEXPECTED_LONGITUDE");
  }
}

function planetsFromLiveSnapshot(root:Record<string, unknown>, metadata:ChartPreviewMetadata, housesReliable:boolean):ChartPreviewPlanet[] {
  const planetSource = asRecord(root.planets) ?? {};
  const derivedPoints = asRecord(root.derived_points) ?? {};
  const angles = asRecord(root.angles) ?? {};
  const planets:ChartPreviewPlanet[] = [];
  const planetOrder = ["sun","moon","mercury","venus","mars","jupiter","saturn","rahu","ketu","thai_ketu_9","uranus","neptune","pluto"];

  for (const key of planetOrder) {
    const rawPoint = planetSource[key] ?? derivedPoints[key];
    if (rawPoint) planets.push(livePointFromRaw(key, rawPoint, metadata, housesReliable));
  }

  const ascendant = derivedPoints.astronomical_ascendant ?? derivedPoints.ascendant;
  if (ascendant) {
    planets.push(livePointFromRaw("astronomical_ascendant", ascendant, metadata, housesReliable));
  } else if (typeof metadata.astronomical_ascendant_deg === "number") {
    planets.push(anglePoint("astronomical_ascendant", metadata.astronomical_ascendant_deg, metadata, housesReliable ? 1 : null));
  }

  const thaiLagna = derivedPoints.thai_lagna ?? derivedPoints.lagna;
  if (thaiLagna) {
    planets.push(livePointFromRaw("thai_lagna", thaiLagna, metadata, housesReliable));
  } else if (typeof metadata.thai_lagna_deg === "number") {
    planets.push(anglePoint("thai_lagna", metadata.thai_lagna_deg, metadata, housesReliable ? 1 : null));
  }

  const mc = derivedPoints.mc;
  const mcDeg = numberValue(angles.mc_deg);
  if (mc) {
    planets.push(livePointFromRaw("mc", mc, metadata, housesReliable));
  } else if (typeof mcDeg === "number") {
    planets.push(anglePoint("mc", mcDeg, metadata, housesReliable ? 10 : null));
  }

  return planets;
}

function livePointFromRaw(
  planetKey:string,
  rawPoint:unknown,
  metadata:ChartPreviewMetadata,
  housesReliable:boolean,
):ChartPreviewPlanet {
  const pointRecord = asRecord(rawPoint);
  if (!pointRecord) throw new Error("LIVE_CHART_PREVIEW_INVALID_POINT");
  const sidereal = numberValue(pointRecord.sidereal_longitude_deg) ?? numberValue(pointRecord.longitude_deg);
  if (typeof sidereal !== "number") throw new Error("LIVE_CHART_PREVIEW_POINT_MISSING_SIDEREAL_LONGITUDE");
  const tropical = numberValue(pointRecord.tropical_longitude_deg) ?? normalizeLongitudeDeg(sidereal + metadata.ayanamsa_deg);
  return {
    planet_key:planetKey,
    planet_name_th:PLANET_LABELS[planetKey]?.th ?? planetKey,
    planet_code:PLANET_LABELS[planetKey]?.code ?? planetKey.toUpperCase().slice(0, 2),
    tropical_longitude_deg:normalizeLongitudeDeg(tropical),
    ayanamsa_deg:metadata.ayanamsa_deg,
    sidereal_longitude_deg:normalizeLongitudeDeg(sidereal),
    thai_zodiac_sign:thaiSignNameFromLongitude(sidereal),
    degree_within_sign:degreeWithinSign(sidereal),
    retrograde:booleanValue(pointRecord.retrograde) ?? false,
    speed_longitude_deg_per_day:numberValue(pointRecord.speed_longitude_deg_per_day),
    house_number:housesReliable ? numberValue(pointRecord.house_number) : null,
    source_note:stringValue(pointRecord.source_note) ?? undefined,
  };
}

function anglePoint(planetKey:string, siderealLongitudeDeg:number, metadata:ChartPreviewMetadata, houseNumber:number|null):ChartPreviewPlanet {
  const sidereal = normalizeLongitudeDeg(siderealLongitudeDeg);
  return {
    planet_key:planetKey,
    planet_name_th:PLANET_LABELS[planetKey]?.th ?? planetKey,
    planet_code:PLANET_LABELS[planetKey]?.code ?? planetKey.toUpperCase().slice(0, 2),
    tropical_longitude_deg:normalizeLongitudeDeg(sidereal + metadata.ayanamsa_deg),
    ayanamsa_deg:metadata.ayanamsa_deg,
    sidereal_longitude_deg:sidereal,
    thai_zodiac_sign:thaiSignNameFromLongitude(sidereal),
    degree_within_sign:degreeWithinSign(sidereal),
    retrograde:false,
    speed_longitude_deg_per_day:null,
    house_number:houseNumber,
  };
}

function warningsFromLiveSnapshot(root:Record<string, unknown>):string[] {
  const warnings = Array.isArray(root.warnings) ? root.warnings : [];
  return warnings.map((warning)=>{
    if (typeof warning === "string") return warning;
    const record = asRecord(warning);
    return stringValue(record?.code) ?? stringValue(record?.message) ?? "";
  }).filter(Boolean);
}

function sanitizeLiveChartPreviewMetadata(metadata:ChartPreviewMetadata):ChartPreviewMetadata {
  return {
    ...metadata,
    engine_version:sanitizeLiveChartPreviewString(metadata.engine_version),
    house_system:sanitizeLiveChartPreviewString(metadata.house_system),
    ketu_method:sanitizeLiveChartPreviewString(metadata.ketu_method),
    thai_ketu_9_method:sanitizeLiveChartPreviewString(metadata.thai_ketu_9_method),
    lagna_method:sanitizeLiveChartPreviewString(metadata.lagna_method),
    lagna_source:sanitizeLiveChartPreviewString(metadata.lagna_source),
    sunrise_local_time:metadata.sunrise_local_time === null ? null : sanitizeLiveChartPreviewString(metadata.sunrise_local_time),
    ephemeris_source:sanitizeLiveChartPreviewString(metadata.ephemeris_source),
    ephemeris_fingerprint:sanitizeLiveChartPreviewString(metadata.ephemeris_fingerprint),
    calculation_hash:sanitizeLiveChartPreviewString(metadata.calculation_hash),
    warnings:metadata.warnings.map(sanitizeLiveChartPreviewString),
  };
}

function metadataWithForcedUnknownBirthTimeWarnings(
  metadata:ChartPreviewMetadata,
  expectedRequest:ExpectedLiveChartPreviewRequest,
):ChartPreviewMetadata {
  if (!expectedRequest.birth_time_unknown) return metadata;
  const warnings = new Set(metadata.warnings);
  warnings.add("UNKNOWN_BIRTH_TIME");
  warnings.add("UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE");
  return { ...metadata, warnings:[...warnings] };
}

function sanitizeLiveChartPreviewValue(value:unknown):unknown {
  if (Array.isArray(value)) return value.map(sanitizeLiveChartPreviewValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nestedValue])=>{
      const sanitizedKey = sanitizeLiveChartPreviewKey(key);
      return [
        sanitizedKey,
        sanitizedKey === key ? sanitizeLiveChartPreviewValue(nestedValue) : "[redacted-sensitive-value]",
      ];
    }));
  }
  if (typeof value !== "string") return value;
  return sanitizeLiveChartPreviewString(value);
}

function sanitizeLiveChartPreviewString(value:string):string {
  if (/@[a-z0-9.-]+/i.test(value)) return "[redacted-email]";
  if (/\bU[a-z0-9]{8,}\b/i.test(value)) return "[redacted-line-id]";
  if (/secret|token|api[_-]?key|credential|private[_-]?key|license[_-]?(key|secret|data|file|path|payload)|password|passphrase|authorization|auth[_-]?(header|value|key|secret)|session[_-]?(id|key|secret|token)|basic\s+[a-z0-9+/=:_-]+|bearer\s+|sk_(live|test)_/i.test(value)) return "[redacted-secret]";
  if (/(^|\s)\/[A-Za-z0-9._/-]+|[A-Za-z]:\\/i.test(value)) return "[redacted-path]";
  return value;
}

function sanitizeLiveChartPreviewKey(key:string):string {
  if (/secret|token|api[_-]?key|webhook|payment|provider|line_user|credential|private[_-]?key|license[_-]?(key|secret|data|file|path|payload)|password|passphrase|authorization|auth[_-]?(header|value|key|secret)|session[_-]?(id|key|secret|token)/i.test(key)) return "[redacted-key]";
  if (key === "ephemeris_path") return "[redacted-key]";
  return key;
}

function normalizeServiceUrl(value:string|undefined):URL|null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function liveChartPreviewEndpoint(serviceUrl:URL):string {
  return `${serviceUrl.toString().replace(/\/+$/, "")}/v1/charts/natal`;
}

function requestBodyFromExpectedRequest(request:ExpectedLiveChartPreviewRequest):LiveChartPreviewRequest {
  return {
    calculation_profile_code:request.calculation_profile_code,
    datetime_local:request.datetime_local,
    timezone:request.timezone,
    latitude:request.latitude,
    longitude:request.longitude,
    birth_time_unknown:request.birth_time_unknown,
  };
}

function localValidationCoordinatesForBirthPlace(birthPlaceText:string):{ latitude:number; longitude:number } {
  const place = birthPlaceText.trim().toLowerCase();
  if (place.includes("chiang mai")) return { latitude:18.7883, longitude:98.9853 };
  if (place.includes("phuket")) return { latitude:7.8804, longitude:98.3923 };
  return { latitude:13.759, longitude:100.535 };
}

function localDateTimeToUtcIso(datetimeLocal:string, timezone:string):string {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(datetimeLocal);
  if (!parsed) throw new Error("USER_CHART_PREVIEW_INVALID_LOCAL_DATETIME");
  const [, year, month, day, hour, minute, second] = parsed;
  const assumedUtcMs = Date.UTC(Number(year), Number(month)-1, Number(day), Number(hour), Number(minute), Number(second));
  const offsetMinutes = timeZoneOffsetMinutes(new Date(assumedUtcMs), timezone);
  return new Date(assumedUtcMs - offsetMinutes * 60_000).toISOString().replace(".000Z", "Z");
}

function timeZoneOffsetMinutes(date:Date, timezone:string):number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone:timezone,
    year:"numeric",
    month:"2-digit",
    day:"2-digit",
    hour:"2-digit",
    minute:"2-digit",
    second:"2-digit",
    hourCycle:"h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part)=>[part.type, part.value]));
  const asUtcMs = Date.UTC(
    Number(values.year),
    Number(values.month)-1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return (asUtcMs - date.getTime()) / 60_000;
}

function numbersNearlyEqual(left:number, right:number, tolerance:number):boolean {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
}

function utcMillis(value:string):number {
  return Date.parse(value);
}

function liveUnavailable(reason:string):LiveChartPreviewLoadResult {
  return { model:undefined, unavailableReason:reason };
}

function asRecord(value:unknown):Record<string, unknown>|null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value:unknown):string|null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value:unknown):number|null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function booleanValue(value:unknown):boolean|null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function numberArray(value:unknown):number[] {
  if (!Array.isArray(value)) return [];
  return value.map(numberValue).filter((item):item is number=>typeof item === "number");
}

function point(
  planetKey:string,
  tropicalLongitudeDeg:number,
  siderealLongitudeDeg:number,
  retrograde:boolean,
  speedLongitudeDegPerDay:number|null,
  houseNumber:number|null,
  sourceNote?:string,
):ChartPreviewPlanet {
  const sidereal = normalizeLongitudeDeg(siderealLongitudeDeg);
  return {
    planet_key:planetKey,
    planet_name_th:PLANET_LABELS[planetKey]?.th ?? planetKey,
    planet_code:PLANET_LABELS[planetKey]?.code ?? planetKey.toUpperCase().slice(0, 2),
    tropical_longitude_deg:normalizeLongitudeDeg(tropicalLongitudeDeg),
    ayanamsa_deg:AYANAMSA_DEG,
    sidereal_longitude_deg:sidereal,
    thai_zodiac_sign:thaiSignNameFromLongitude(sidereal),
    degree_within_sign:degreeWithinSign(sidereal),
    retrograde,
    speed_longitude_deg_per_day:speedLongitudeDegPerDay,
    house_number:houseNumber,
    source_note:sourceNote,
  };
}

function wholeSignCuspsFromLagna(lagnaDeg:number|null):number[] {
  if (lagnaDeg === null) return [];
  const lagnaSign = zodiacSignIndex(lagnaDeg);
  return Array.from({ length:12 }, (_, index)=>((lagnaSign + index) % 12) * 30);
}

export function assertChartPreviewSafe(model:ChartPreviewModel):void {
  const serialized = JSON.stringify(model);
  const blocked = [
    /@[a-z0-9.-]+/i,
    /\bU[a-z0-9]{8,}\b/i,
    /payment_provider/i,
    /webhook_secret/i,
    /api[_-]?key/i,
    /credential/i,
    /private[_-]?key/i,
    /license[_-]?(key|secret|data|file|path|payload)/i,
    /password/i,
    /passphrase/i,
    /authorization/i,
    /auth[_-]?(header|value|key|secret)/i,
    /session[_-]?(id|key|secret|token)/i,
    /basic\s+[a-z0-9+/=:_-]+/i,
    /bearer\s+/i,
    /sk_(live|test)_/i,
    /card/i,
    /(^|\s)\/[A-Za-z0-9._/-]+|[A-Za-z]:\\/i,
    /ASTRO_EPHEMERIS_PATH/i,
  ];
  if (blocked.some((pattern)=>pattern.test(serialized))) throw new Error("Chart preview must not expose secrets or provider identifiers.");
}
