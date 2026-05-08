from app.config import AstroRuntimeConfig
from app.core.calculators import AstroCoreService
from app.core.profiles import PROFILES
from app.engines.factory import create_engine
from app.engines.swisseph import fingerprint_ephemeris_path

HEALTH_ENGINES = {"mock", "swisseph"}
HEALTH_LICENSE_MODES = {"none", "free", "professional"}


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
        return {**base, "status": "error", "error_code": str(error).split(":", 1)[0]}
    return {**base, "status": "ok"}


def validate_swisseph_health(config: AstroRuntimeConfig) -> None:
    fingerprint_ephemeris_path(
        config.ephemeris_path,
        manifest_path=config.ephemeris_manifest_path,
        require_pinned=config.require_pinned_ephemeris,
    )
    if config.runtime_env != "production" and not config.require_pinned_ephemeris:
        return
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
