from __future__ import annotations

import re

from app.config import AstroRuntimeConfig
from app.core.calculators import AstroCoreService
from app.core.profiles import PROFILES
from app.engines.factory import create_engine
from app.engines.swisseph import fingerprint_ephemeris_path
from app.schemas import ChartRequest
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

HEALTH_ENGINES = {"mock", "swisseph"}
HEALTH_LICENSE_MODES = {"none", "free", "professional"}
SAFE_ERROR_CODE = re.compile(r"^[A-Z][A-Z0-9_]{1,79}$")

app = FastAPI(
    title="Thai Horoscope Astro Calculation Service",
    version="0.1.0",
    description="Local/staging-safe HTTP wrapper for deterministic astrology chart snapshots.",
)


class NatalCalculationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    calculation_profile_code: str = Field(min_length=1, max_length=120)
    timezone: str = Field(min_length=1, max_length=80)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    datetime_local: str | None = Field(default=None, min_length=1, max_length=32)
    birth_date: str | None = Field(default=None, min_length=1, max_length=16)
    birth_time: str | None = Field(default=None, min_length=0, max_length=16)
    birth_time_unknown: bool = False
    elevation_m: float = Field(default=0, ge=-500, le=9000)
    time_accuracy_minutes: int | None = Field(default=None, ge=0, le=1440)

    def to_chart_request(self) -> ChartRequest:
        return ChartRequest(
            calculation_profile_code=self.calculation_profile_code,
            timezone=self.timezone,
            latitude=self.latitude,
            longitude=self.longitude,
            datetime_local=self.datetime_local,
            birth_date=self.birth_date,
            birth_time=self.birth_time,
            birth_time_unknown=self.birth_time_unknown,
            elevation_m=self.elevation_m,
            time_accuracy_minutes=self.time_accuracy_minutes,
        )


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(_request: Request, _exc: RequestValidationError) -> JSONResponse:
    return sanitized_error_response("INVALID_NATAL_CHART_REQUEST", status_code=422)


@app.get("/health", response_model=None)
async def get_health() -> dict[str, str] | JSONResponse:
    report = health()
    if report.get("status") == "error":
        return JSONResponse(status_code=503, content=report)
    return report


@app.post("/calculate/natal", response_model=None)
@app.post("/v1/charts/natal", response_model=None)
async def calculate_natal(request: NatalCalculationRequest) -> dict[str, object] | JSONResponse:
    try:
        chart_request = request.to_chart_request()
        validate_requested_profile_for_runtime(chart_request.calculation_profile_code)
        snapshot = create_service().calculate_natal_chart(chart_request)
    except (PermissionError, ValueError, FileNotFoundError, RuntimeError) as error:
        return sanitized_error_response(safe_error_code(error), status_code=400)
    return snapshot.to_json_dict()


def create_service(config: AstroRuntimeConfig | None = None) -> AstroCoreService:
    runtime_config = config or AstroRuntimeConfig.from_env()
    return AstroCoreService(engine=create_engine(runtime_config), config=runtime_config)


def health() -> dict[str, str]:
    config = AstroRuntimeConfig.from_env()
    base = {
        "engine": health_value(config.engine, HEALTH_ENGINES),
        "profile": health_value(config.calculation_profile, set(PROFILES)),
        "license_mode": health_value(config.swisseph_license_mode, HEALTH_LICENSE_MODES),
        "ephemeris_path_configured": str(bool(config.ephemeris_path)).lower(),
    }
    try:
        config.validate()
        if config.engine == "swisseph":
            validate_swisseph_health(config)
    except (PermissionError, ValueError, FileNotFoundError, RuntimeError) as error:
        return {**base, "status": "error", "error_code": safe_error_code(error)}
    return {**base, "status": "ok"}


def validate_swisseph_health(config: AstroRuntimeConfig) -> None:
    fingerprint_ephemeris_path(
        config.ephemeris_path,
        manifest_path=config.ephemeris_manifest_path,
        require_pinned=config.require_pinned_ephemeris,
        active_profile=config.calculation_profile,
    )
    try:
        engine = create_engine(config)
        engine.ayanamsha_deg(2451545.0, config.default_ayanamsha)
        engine.planet_positions(2451545.0, ["sun", "moon"], config.default_ayanamsha)
        engine.houses(2451545.0, 13.7563, 100.5018, "whole_sign", ascendant_required=True)
    except ImportError as error:
        raise RuntimeError("SWISSEPH_ADAPTER_UNAVAILABLE: Swiss Ephemeris adapter cannot be loaded.") from error
    except (PermissionError, ValueError, FileNotFoundError):
        raise
    except Exception as error:
        raise RuntimeError("SWISSEPH_HEALTH_CHECK_FAILED: Swiss Ephemeris adapter probe failed.") from error


def health_value(value: str, allowed: set[str]) -> str:
    return value if value in allowed else "invalid"


def validate_requested_profile_for_runtime(profile_code: str) -> None:
    config = AstroRuntimeConfig.from_env()
    config.validate()
    if config.engine == "swisseph" and config.require_pinned_ephemeris:
        fingerprint_ephemeris_path(
            config.ephemeris_path,
            manifest_path=config.ephemeris_manifest_path,
            require_pinned=True,
            active_profile=profile_code,
        )


def safe_error_code(error: BaseException, fallback: str = "ASTRO_CALCULATION_FAILED") -> str:
    candidate = str(error).split(":", 1)[0].strip()
    return candidate if SAFE_ERROR_CODE.fullmatch(candidate) else fallback


def sanitized_error_response(error_code: str, status_code: int) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"status": "error", "error_code": error_code})
