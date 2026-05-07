from __future__ import annotations

from app.config import AstroRuntimeConfig
from app.engines.base import AstroEngine
from app.engines.mock import MockAstroEngine
from app.engines.swisseph import SwissEphemerisEngine


def create_engine(config: AstroRuntimeConfig) -> AstroEngine:
    config.validate()
    if config.engine == "mock":
        return MockAstroEngine()
    return SwissEphemerisEngine(config)
