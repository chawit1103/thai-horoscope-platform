from __future__ import annotations

import os
from dataclasses import dataclass

from app.core.profiles import PROFILES

LOCAL_ENVIRONMENTS = {"local", "development", "test"}
STAGING_ENVIRONMENTS = {"staging", "preview"}
PRODUCTION_ENVIRONMENTS = {"production"}
ENVIRONMENT_SOURCES = ("APP_ENV", "DEPLOYMENT_ENV", "VERCEL_ENV", "NODE_ENV", "ENVIRONMENT")
DEPLOYMENT_ENVIRONMENT_SOURCES = ("APP_ENV", "DEPLOYMENT_ENV", "VERCEL_ENV")
RUNTIME_ENVIRONMENT_SOURCES = ("NODE_ENV", "ENVIRONMENT")


@dataclass(frozen=True)
class AstroRuntimeConfig:
    engine: str = "mock"
    ephemeris_path: str | None = None
    calculation_profile: str = "TH_NIRAYANA_V1"
    default_ayanamsha: str = "lahiri"
    swisseph_license_mode: str = "none"
    enable_solar_return: bool = False
    enable_hourly_timing: bool = False
    runtime_env: str = "development"

    @classmethod
    def from_env(cls) -> "AstroRuntimeConfig":
        return cls(
            engine=os.getenv("ASTRO_ENGINE", "mock").strip() or "mock",
            ephemeris_path=(os.getenv("ASTRO_EPHEMERIS_PATH") or "").strip() or None,
            calculation_profile=os.getenv("ASTRO_CALCULATION_PROFILE", "TH_NIRAYANA_V1").strip()
            or "TH_NIRAYANA_V1",
            default_ayanamsha=os.getenv("ASTRO_DEFAULT_AYANAMSA", "lahiri").strip() or "lahiri",
            swisseph_license_mode=os.getenv("SWISSEPH_LICENSE_MODE", "none").strip() or "none",
            enable_solar_return=os.getenv("ASTRO_ENABLE_SOLAR_RETURN", "false").lower() == "true",
            enable_hourly_timing=os.getenv("ASTRO_ENABLE_HOURLY_TIMING", "false").lower() == "true",
            runtime_env=read_runtime_environment(),
        )

    def validate(self) -> None:
        if self.engine not in {"mock", "swisseph"}:
            raise ValueError("ASTRO_ENGINE must be mock or swisseph.")
        if self.calculation_profile not in PROFILES:
            raise ValueError("ASTRO_CALCULATION_PROFILE_INVALID: ASTRO_CALCULATION_PROFILE is not supported.")
        if self.swisseph_license_mode not in {"none", "free", "professional"}:
            raise ValueError("SWISSEPH_LICENSE_MODE must be none, free, or professional.")
        if self.engine == "mock" and self.runtime_env == "production":
            raise PermissionError("ASTRO_MOCK_ENGINE_PRODUCTION_FORBIDDEN: Mock astro engine is not production-ready.")
        if self.engine == "swisseph" and self.runtime_env == "production":
            if self.swisseph_license_mode != "professional":
                raise PermissionError("LICENSE_MODE_NOT_PRODUCTION_READY: Swiss Ephemeris production use requires SWISSEPH_LICENSE_MODE=professional.")
            if not self.ephemeris_path:
                raise PermissionError("EPHEMERIS_FILE_MISSING: Swiss Ephemeris production use requires ASTRO_EPHEMERIS_PATH.")
        if self.engine == "swisseph" and self.runtime_env != "production":
            if self.swisseph_license_mode == "none":
                raise PermissionError("LICENSE_MODE_NOT_PRODUCTION_READY: Swiss Ephemeris local/test use requires an explicit license mode.")
            if not self.ephemeris_path:
                raise PermissionError("EPHEMERIS_FILE_MISSING: Swiss Ephemeris use requires ASTRO_EPHEMERIS_PATH; runtime downloads are disabled.")


def read_runtime_environment() -> str:
    deployment_values = read_environment_values(DEPLOYMENT_ENVIRONMENT_SOURCES)
    if any(raw in PRODUCTION_ENVIRONMENTS for raw in deployment_values):
        return "production"
    if any(raw in LOCAL_ENVIRONMENTS for raw in deployment_values) and any(
        raw in PRODUCTION_ENVIRONMENTS for raw in read_environment_values(RUNTIME_ENVIRONMENT_SOURCES)
    ):
        return "production"
    if any(raw in STAGING_ENVIRONMENTS for raw in deployment_values):
        return "staging"
    if any(raw in LOCAL_ENVIRONMENTS for raw in deployment_values):
        return "development"

    runtime_values = read_environment_values(RUNTIME_ENVIRONMENT_SOURCES)
    if any(raw in PRODUCTION_ENVIRONMENTS for raw in runtime_values):
        return "production"
    if any(raw in STAGING_ENVIRONMENTS for raw in runtime_values):
        return "staging"
    if any(raw in LOCAL_ENVIRONMENTS for raw in runtime_values):
        return "development"
    return "development"


def read_environment_values(sources: tuple[str, ...]) -> list[str]:
    values: list[str] = []
    for source in sources:
        raw = (os.getenv(source) or "").strip().lower()
        if raw:
            values.append(raw)
    return values
