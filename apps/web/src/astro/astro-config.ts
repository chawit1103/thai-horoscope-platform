export type AstroEngineMode = "mock" | "swisseph";
export type SwissEphLicenseMode = "none" | "free" | "professional";

export interface AstroRuntimeConfig {
  engine: AstroEngineMode;
  ephemerisPath?: string;
  calculationProfile: string;
  defaultAyanamsha: string;
  swissephLicenseMode: SwissEphLicenseMode;
  enableSolarReturn: boolean;
  enableHourlyTiming: boolean;
  nodeEnv: string;
}

export function readAstroRuntimeConfig(env:NodeJS.ProcessEnv = process.env):AstroRuntimeConfig {
  const engine = parseEngine(env.ASTRO_ENGINE ?? "mock");
  const config:AstroRuntimeConfig = {
    engine,
    ephemerisPath: env.ASTRO_EPHEMERIS_PATH?.trim() || undefined,
    calculationProfile: env.ASTRO_CALCULATION_PROFILE?.trim() || "TH_NIRAYANA_V1",
    defaultAyanamsha: env.ASTRO_DEFAULT_AYANAMSA?.trim() || "lahiri",
    swissephLicenseMode: parseLicense(env.SWISSEPH_LICENSE_MODE ?? "none"),
    enableSolarReturn: env.ASTRO_ENABLE_SOLAR_RETURN === "true",
    enableHourlyTiming: env.ASTRO_ENABLE_HOURLY_TIMING === "true",
    nodeEnv: env.NODE_ENV ?? "development",
  };
  validateAstroRuntimeConfig(config);
  return config;
}

export function validateAstroRuntimeConfig(config:AstroRuntimeConfig):void {
  if (config.engine === "swisseph" && config.nodeEnv === "production") {
    if (config.swissephLicenseMode !== "professional") throw new Error("Swiss Ephemeris production use requires SWISSEPH_LICENSE_MODE=professional.");
    if (!config.ephemerisPath) throw new Error("Swiss Ephemeris production use requires ASTRO_EPHEMERIS_PATH.");
  }
}

function parseEngine(value:string):AstroEngineMode {
  if (value === "mock" || value === "swisseph") return value;
  throw new Error("ASTRO_ENGINE must be mock or swisseph.");
}

function parseLicense(value:string):SwissEphLicenseMode {
  if (value === "none" || value === "free" || value === "professional") return value;
  throw new Error("SWISSEPH_LICENSE_MODE must be none, free, or professional.");
}
