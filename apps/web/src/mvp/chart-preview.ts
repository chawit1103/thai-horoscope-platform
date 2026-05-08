import { type BirthProfile, type ChartSnapshot, type MockMvpState } from "./mock-flow";
import { buildCounterclockwiseZodiacLayout, degreeWithinSign, thaiSignNameFromLongitude, type ZodiacLayoutSign } from "./zodiac";

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
}

export interface ChartPreviewModel {
  profile:BirthProfile;
  chart:ChartSnapshot;
  metadata:ChartPreviewMetadata;
  planets:ChartPreviewPlanet[];
  zodiacLayout:ZodiacLayoutSign[];
  housesReliable:boolean;
  angles:{ ascendant_deg:number|null; lagna_deg:number|null; mc_deg:number|null; descendant_deg:number|null; ic_deg:number|null };
  houseCusps:{ house:number; cusp_deg:number }[];
  chartSnapshotJson:unknown;
  calculationMetadataJson:ChartPreviewMetadata;
}

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
  ketu:{ th:"เกตุ", code:"KE" },
};

export function buildChartPreviewModel(input:{ state:MockMvpState; userId:string }):ChartPreviewModel|undefined {
  const profile = [...input.state.birthProfiles].reverse().find((item)=>item.userId===input.userId);
  if (!profile) return undefined;
  const chart = [...input.state.chartSnapshots].reverse().find((item)=>item.userId===input.userId && item.birthProfileId===profile.id);
  if (!chart) return undefined;
  const metadata:ChartPreviewMetadata = {
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
    warnings:chart.warnings,
  };
  return {
    profile,
    chart,
    metadata,
    planets:Object.entries(chart.planets).map(([planetKey, planet])=>{
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
    }),
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
    chartSnapshotJson:chart,
    calculationMetadataJson:metadata,
  };
}

export function assertChartPreviewSafe(model:ChartPreviewModel):void {
  const serialized = JSON.stringify(model);
  const blocked = [
    /@[a-z0-9.-]+/i,
    /\bU[a-z0-9]{8,}\b/i,
    /payment_provider/i,
    /webhook_secret/i,
    /api[_-]?key/i,
    /bearer\s+/i,
    /card/i,
  ];
  if (blocked.some((pattern)=>pattern.test(serialized))) throw new Error("Chart preview must not expose secrets or provider identifiers.");
}
