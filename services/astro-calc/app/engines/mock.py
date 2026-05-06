from __future__ import annotations

from app.core.math import normalize_deg, sign_index
from app.core.zodiac import degree_in_sign, sign_name_en, sign_name_th
from app.engines.base import AstroEngine
from app.schemas import Houses, PlanetPosition

PLANET_OFFSETS = {
    "sun": 0,
    "moon": 75.2,
    "mercury": 18.4,
    "venus": 42.1,
    "mars": 102.8,
    "jupiter": 188.3,
    "saturn": 241.9,
    "uranus": 15.7,
    "neptune": 288.2,
    "pluto": 333.6,
    "rahu": 305.4,
    "ketu": 125.4,
}


class MockAstroEngine(AstroEngine):
    name = "mock"
    version = "0.1.0"
    ephemeris_source = "deterministic-mock"
    ephemeris_fingerprint = "mock-th-nirayana-v1"

    def ayanamsha_deg(self, jd_ut: float, ayanamsha: str) -> float:
        base = 24.0 if ayanamsha == "lahiri" else 0.0
        return round(base + ((jd_ut - 2451545.0) / 36525.0) * 1.396, 8)

    def planet_positions(self, jd_ut: float, planet_names: list[str], ayanamsha: str) -> dict[str, PlanetPosition]:
        ayanamsha_deg = self.ayanamsha_deg(jd_ut, ayanamsha)
        positions: dict[str, PlanetPosition] = {}
        for index, name in enumerate(planet_names):
            speed = _speed_for(name, index)
            tropical = normalize_deg(PLANET_OFFSETS.get(name, index * 37.7) + jd_ut * speed)
            sidereal = normalize_deg(tropical - ayanamsha_deg)
            if name == "ketu" and "rahu" in positions:
                tropical = normalize_deg(positions["rahu"].tropical_longitude_deg + 180)
                sidereal = normalize_deg(positions["rahu"].sidereal_longitude_deg + 180)
            positions[name] = PlanetPosition(
                tropical_longitude_deg=tropical,
                ayanamsa_deg=ayanamsha_deg,
                sidereal_longitude_deg=sidereal,
                ecliptic_latitude_deg=round(((index * 1.73) % 10) - 5, 6),
                longitude_deg=sidereal,
                latitude_deg=round(((index * 1.73) % 10) - 5, 6),
                speed_longitude_deg_per_day=round(speed, 8),
                sign_index=sign_index(sidereal),
                sign_name_en=sign_name_en(sidereal),
                sign_name_th=sign_name_th(sidereal),
                degree_in_sign=degree_in_sign(sidereal),
                retrograde=speed < 0,
            )
        return positions

    def houses(self, jd_ut: float, latitude: float, longitude: float, house_system: str, ascendant_required: bool) -> Houses:
        if not ascendant_required:
            return Houses(system=house_system, ascendant_deg=None, mc_deg=None, cusps_deg=[], reliable=False)
        ascendant = normalize_deg(jd_ut * 0.985647 + longitude + latitude * 0.15)
        cusp0 = int(ascendant // 30) * 30.0
        return Houses(
            system=house_system,
            ascendant_deg=ascendant,
            mc_deg=normalize_deg(ascendant + 90),
            cusps_deg=[normalize_deg(cusp0 + house * 30) for house in range(12)],
            reliable=True,
        )


def _speed_for(name: str, index: int) -> float:
    if name == "moon":
        return 13.176358
    if name == "rahu" or name == "ketu":
        return -0.0529539
    speeds = [0.985647, 13.176358, 1.2, 0.615, 0.524, 0.083, 0.033, 0.0117, 0.006, 0.004]
    return speeds[index % len(speeds)]
