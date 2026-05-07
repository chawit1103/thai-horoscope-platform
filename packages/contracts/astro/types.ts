export type AstroWarningCode =
  | "UNKNOWN_BIRTH_TIME"
  | "UNKNOWN_BIRTH_TIME_USED_NOON_FALLBACK"
  | "UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE"
  | "FAST_PLANET_POSITIONS_APPROXIMATE"
  | "MISSING_LOCATION"
  | "INVALID_TIMEZONE"
  | "UNSUPPORTED_DATE_RANGE"
  | "UNSUPPORTED_TIMING_RANGE"
  | "SOLAR_RETURN_CONVERGENCE_FAILED"
  | "EPHEMERIS_FILE_MISSING"
  | "LICENSE_MODE_NOT_PRODUCTION_READY";

export interface AstroWarning {
  code: AstroWarningCode;
  message: string;
}

export interface AstroCalculationProfile {
  code: string;
  zodiac_type: "sidereal" | "tropical";
  ayanamsha: string;
  house_system: string;
  node_type: string;
  planets: string[];
  aspect_orbs_deg: Record<string, number>;
}

export interface AstroPlanetPosition {
  tropical_longitude_deg: number;
  ayanamsa_deg: number | null;
  sidereal_longitude_deg: number;
  ecliptic_latitude_deg: number;
  longitude_deg: number;
  latitude_deg: number;
  speed_longitude_deg_per_day: number;
  sign_index: number;
  sign_name_en: string;
  sign_name_th: string;
  degree_in_sign: number;
  retrograde: boolean;
  nakshatra: string | null;
  house_number: number | null;
  warnings: AstroWarning[];
}

export interface AstroAspect {
  body_a: string;
  body_b: string;
  type: string;
  orb_deg: number;
  applying: boolean | null;
}

export interface AstroEngineInfo {
  name: string;
  version: string;
  license_mode: "none" | "free" | "professional" | string;
  ephemeris_path_configured: boolean;
  ephemeris_fingerprint: string;
}

export interface AstroDateTimeInfo {
  local: string;
  utc: string;
  timezone: string;
  julian_day_ut: number;
}

export interface AstroLocationInfo {
  latitude: number;
  longitude: number;
  elevation_m: number;
}

export interface AstroZodiacInfo {
  type: "sidereal" | "tropical" | string;
  ayanamsa_code: string;
  ayanamsa_deg: number | null;
}

export interface AstroChartSnapshot {
  chart_type: "natal" | string;
  engine: AstroEngineInfo;
  engine_name: string;
  engine_version: string;
  ephemeris_source: string;
  ephemeris_fingerprint: string;
  calculation_profile_code: string;
  calculation_profile: AstroCalculationProfile;
  datetime: AstroDateTimeInfo;
  datetime_local: string;
  datetime_utc: string;
  julian_day_ut: number;
  location: AstroLocationInfo;
  calculation_hash: string;
  zodiac: AstroZodiacInfo;
  ayanamsa_deg: number | null;
  ayanamsha: { name: string; value_deg: number | null };
  planets: Record<string, AstroPlanetPosition>;
  houses: {
    system: string;
    ascendant_deg: number | null;
    mc_deg: number | null;
    cusps_deg: number[];
    reliable: boolean;
  };
  angles: {
    ascendant_deg: number | null;
    lagna_deg: number | null;
    mc_deg: number | null;
    ic_deg: number | null;
    descendant_deg: number | null;
    reliable: boolean;
  };
  derived_points: Record<string, AstroPlanetPosition>;
  aspects: AstroAspect[];
  warnings: AstroWarning[];
  metadata: Record<string, string>;
}

export interface AstroTransitLocation {
  latitude: number;
  longitude: number;
  timezone?: string;
  elevation_m?: number;
}

export interface AstroTransitSnapshotRequest {
  natal_chart_snapshot: AstroChartSnapshot;
  transit_datetime_utc: string;
  calculation_profile_code: string;
  transit_location?: AstroTransitLocation | null;
  orb_settings?: Partial<Record<"conjunction" | "opposition" | "square" | "trine" | "sextile", number>> | null;
}

export interface AstroTransitToNatalHit {
  transit_planet: string;
  natal_point: string;
  aspect_type: "conjunction" | "opposition" | "square" | "trine" | "sextile" | string;
  exact_orb_deg: number;
  applying_or_separating: "applying" | "separating" | null;
  category_hint: string | null;
  weight_hint: number | null;
  interpretation_key: string;
}

export interface AstroTransitComparison {
  natal: AstroChartSnapshot;
  transit: AstroChartSnapshot;
  natal_chart_snapshot: AstroChartSnapshot;
  transit_chart_snapshot: AstroChartSnapshot;
  transit_planets: Record<string, AstroPlanetPosition>;
  natal_planets: Record<string, AstroPlanetPosition>;
  aspects: AstroAspect[];
  transit_to_natal_aspects: AstroAspect[];
  transit_to_natal_hits: AstroTransitToNatalHit[];
  scoring_ready: {
    hit_count: number;
    hits_by_transit_planet: Record<string, string[]>;
    hits_by_natal_point: Record<string, string[]>;
    weighted_hits: Array<{
      interpretation_key: string;
      weight_hint: number | null;
      category_hint: string | null;
    }>;
  };
  calculation_hash: string;
}

export interface AstroSolarReturnRequest {
  natal_chart_snapshot: AstroChartSnapshot;
  solar_return_year: number;
  location: AstroTransitLocation;
  calculation_profile_code: string;
  accuracy_arc_minutes?: number;
  max_iterations?: number;
}

export interface AstroSolarReturn {
  year: number;
  solar_return_utc: string;
  target_sun_longitude_deg: number;
  chart: AstroChartSnapshot;
  solar_return_datetime_utc: string;
  solar_return_datetime_local: string;
  sun_longitude_at_return: number;
  natal_sun_longitude_reference: number;
  delta_arc_seconds: number;
  solar_return_chart_snapshot: AstroChartSnapshot;
  warnings: AstroWarning[];
  calculation_hash: string;
}

export interface AstroHourlyTimingRequest {
  natal_chart_snapshot: AstroChartSnapshot;
  start_datetime_utc?: string | null;
  end_datetime_utc?: string | null;
  start_datetime_local?: string | null;
  end_datetime_local?: string | null;
  date_local?: string | null;
  timezone: string;
  location?: AstroTransitLocation | null;
  calculation_profile_code: string;
  period_granularity: "hourly";
  enabled_aspect_types?: Array<"conjunction" | "opposition" | "square" | "trine" | "sextile">;
  orb_thresholds?: Partial<Record<"conjunction" | "opposition" | "square" | "trine" | "sextile", number>> | null;
}

export interface AstroHourlyTimingWindow {
  start_datetime_utc: string;
  end_datetime_utc: string;
  local_start: string;
  local_end: string;
  trigger_type: "transit_to_natal_aspect";
  transit_planet: string;
  natal_point: string;
  aspect_type: "conjunction" | "opposition" | "square" | "trine" | "sextile" | string;
  peak_datetime_utc: string | null;
  orb_min_deg: number;
  weight_hint: number | null;
  category_hint: string | null;
  safety_level: "structured_signal_only";
  starts_at_utc: string;
  ends_at_utc: string;
  local_label: string;
  score: number;
  dominant_body: string;
  notes: string[];
}

export interface AstroHourlyTimingResult {
  date_local: string | null;
  timezone: string;
  timing_windows: AstroHourlyTimingWindow[];
  windows: AstroHourlyTimingWindow[];
  warnings: AstroWarning[];
  calculation_hash: string;
}
