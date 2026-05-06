from app.config import AstroRuntimeConfig
from app.core.calculators import AstroCoreService
from app.engines.factory import create_engine


def create_service(config: AstroRuntimeConfig | None = None) -> AstroCoreService:
    runtime_config = config or AstroRuntimeConfig.from_env()
    return AstroCoreService(engine=create_engine(runtime_config), config=runtime_config)


def health() -> dict[str, str]:
    config = AstroRuntimeConfig.from_env()
    return {"status": "ok", "engine": config.engine, "profile": config.calculation_profile}
