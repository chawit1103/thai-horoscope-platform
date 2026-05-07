from app.config import AstroRuntimeConfig
from app.core.calculators import AstroCoreService
from app.engines.factory import create_engine
from app.engines.swisseph import fingerprint_ephemeris_path


def create_service(config: AstroRuntimeConfig | None = None) -> AstroCoreService:
    runtime_config = config or AstroRuntimeConfig.from_env()
    return AstroCoreService(engine=create_engine(runtime_config), config=runtime_config)


def health() -> dict[str, str]:
    config = AstroRuntimeConfig.from_env()
    base = {
        "engine": config.engine,
        "profile": config.calculation_profile,
        "license_mode": config.swisseph_license_mode,
        "ephemeris_path_configured": str(bool(config.ephemeris_path)).lower(),
    }
    try:
        config.validate()
        if config.engine == "swisseph":
            fingerprint_ephemeris_path(config.ephemeris_path)
    except (PermissionError, ValueError, FileNotFoundError) as error:
        return {**base, "status": "error", "error_code": str(error).split(":", 1)[0]}
    return {**base, "status": "ok"}
