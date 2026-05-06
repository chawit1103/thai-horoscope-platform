from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime

from app.schemas import Houses, PlanetPosition


class AstroEngine(ABC):
    name: str
    version: str
    ephemeris_source: str
    ephemeris_fingerprint: str

    @abstractmethod
    def ayanamsha_deg(self, jd_ut: float, ayanamsha: str) -> float | None:
        raise NotImplementedError

    @abstractmethod
    def planet_positions(
        self, jd_ut: float, planet_names: list[str], ayanamsha: str, node_type: str = "true_node"
    ) -> dict[str, PlanetPosition]:
        raise NotImplementedError

    @abstractmethod
    def houses(self, jd_ut: float, latitude: float, longitude: float, house_system: str, ascendant_required: bool) -> Houses:
        raise NotImplementedError

    def local_sidereal_seed(self, when_utc: datetime, latitude: float, longitude: float) -> float:
        return (when_utc.timestamp() / 86400 + latitude * 0.17 + longitude * 0.33) % 360
