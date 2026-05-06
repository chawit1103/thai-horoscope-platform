from __future__ import annotations

import hashlib
import importlib
from pathlib import Path
from typing import Any

from app.config import AstroRuntimeConfig
from app.core.math import normalize_deg, sign_index
from app.core.zodiac import degree_in_sign, sign_name_en, sign_name_th
from app.engines.base import AstroEngine
from app.schemas import Houses, PlanetPosition

SWISSEPH_BODIES = {
    "sun": "SUN",
    "moon": "MOON",
    "mercury": "MERCURY",
    "venus": "VENUS",
    "mars": "MARS",
    "jupiter": "JUPITER",
    "saturn": "SATURN",
    "uranus": "URANUS",
    "neptune": "NEPTUNE",
    "pluto": "PLUTO",
    "rahu": "TRUE_NODE",
}


class SwissEphemerisEngine(AstroEngine):
    name = "swisseph"
    version = "adapter-0.1.0"
    ephemeris_source = "swiss-ephemeris"

    def __init__(self, config: AstroRuntimeConfig, swe_module: Any | None = None) -> None:
        config.validate()
        self._config = config
        if swe_module is None and config.ephemeris_path and not Path(config.ephemeris_path).exists():
            raise FileNotFoundError("EPHEMERIS_FILE_MISSING: ASTRO_EPHEMERIS_PATH does not exist; runtime downloads are disabled.")
        self._swe = swe_module or importlib.import_module("swisseph")
        self.ephemeris_fingerprint = fingerprint_ephemeris_path(config.ephemeris_path)
        self._swe.set_ephe_path(config.ephemeris_path)
        self._set_ayanamsha(config.default_ayanamsha)

    def ayanamsha_deg(self, jd_ut: float, ayanamsha: str) -> float:
        self._set_ayanamsha(ayanamsha)
        return round(float(self._swe.get_ayanamsa_ut(jd_ut)), 8)

    def planet_positions(self, jd_ut: float, planet_names: list[str], ayanamsha: str) -> dict[str, PlanetPosition]:
        self._set_ayanamsha(ayanamsha)
        tropical_flags = self._swe.FLG_SWIEPH | self._swe.FLG_SPEED
        sidereal_flags = self._swe.FLG_SWIEPH | self._swe.FLG_SIDEREAL | self._swe.FLG_SPEED
        ayanamsha_deg = self.ayanamsha_deg(jd_ut, ayanamsha)
        positions: dict[str, PlanetPosition] = {}
        for name in planet_names:
            if name == "ketu":
                if "rahu" not in positions:
                    positions.update(self.planet_positions(jd_ut, ["rahu"], ayanamsha))
                rahu = positions["rahu"]
                tropical = normalize_deg(rahu.tropical_longitude_deg + 180)
                sidereal = normalize_deg(rahu.sidereal_longitude_deg + 180)
                positions[name] = PlanetPosition(
                    tropical_longitude_deg=tropical,
                    ayanamsa_deg=ayanamsha_deg,
                    sidereal_longitude_deg=sidereal,
                    ecliptic_latitude_deg=round(-rahu.ecliptic_latitude_deg, 8),
                    longitude_deg=sidereal,
                    latitude_deg=round(-rahu.latitude_deg, 8),
                    speed_longitude_deg_per_day=rahu.speed_longitude_deg_per_day,
                    sign_index=sign_index(sidereal),
                    sign_name_en=sign_name_en(sidereal),
                    sign_name_th=sign_name_th(sidereal),
                    degree_in_sign=degree_in_sign(sidereal),
                    retrograde=rahu.retrograde,
                )
                continue
            body_id = getattr(self._swe, SWISSEPH_BODIES[name])
            tropical_raw, _return_flag = self._swe.calc_ut(jd_ut, body_id, tropical_flags)
            sidereal_raw, _return_flag = self._swe.calc_ut(jd_ut, body_id, sidereal_flags)
            tropical = normalize_deg(float(tropical_raw[0]))
            sidereal = normalize_deg(float(sidereal_raw[0]))
            speed = float(sidereal_raw[3])
            positions[name] = PlanetPosition(
                tropical_longitude_deg=tropical,
                ayanamsa_deg=ayanamsha_deg,
                sidereal_longitude_deg=sidereal,
                ecliptic_latitude_deg=round(float(sidereal_raw[1]), 8),
                longitude_deg=sidereal,
                latitude_deg=round(float(sidereal_raw[1]), 8),
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
        house_code = b"W" if house_system == "whole_sign" else house_system[:1].upper().encode("ascii")
        cusps, ascmc = self._swe.houses_ex(jd_ut, latitude, longitude, house_code, self._swe.FLG_SIDEREAL)
        return Houses(
            system=house_system,
            ascendant_deg=normalize_deg(float(ascmc[0])),
            mc_deg=normalize_deg(float(ascmc[1])),
            cusps_deg=[normalize_deg(float(cusp)) for cusp in list(cusps)[:12]],
            reliable=True,
        )

    def _set_ayanamsha(self, ayanamsha: str) -> None:
        if ayanamsha != "lahiri":
            raise ValueError(f"Unsupported Swiss Ephemeris ayanamsha: {ayanamsha}")
        self._swe.set_sid_mode(self._swe.SIDM_LAHIRI, 0, 0)


def fingerprint_ephemeris_path(path: str | None) -> str:
    if not path:
        return "swisseph-unset"
    root = Path(path)
    names = sorted(item.name for item in root.glob("*") if item.is_file()) if root.exists() else [path]
    digest = hashlib.sha256("|".join(names).encode("utf-8")).hexdigest()[:16]
    return f"swisseph-path-{digest}"
