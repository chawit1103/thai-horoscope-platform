from __future__ import annotations

from app.schemas import CalculationProfile


PROFILES: dict[str, CalculationProfile] = {
    "TH_NIRAYANA_V1": CalculationProfile(
        code="TH_NIRAYANA_V1",
        zodiac_type="sidereal",
        ayanamsha="lahiri",
        house_system="whole_sign",
        node_type="true_node",
        planets=[
            "sun",
            "moon",
            "mercury",
            "venus",
            "mars",
            "jupiter",
            "saturn",
            "uranus",
            "neptune",
            "pluto",
            "rahu",
            "ketu",
        ],
        aspect_orbs_deg={"conjunction": 8, "opposition": 8, "trine": 6, "square": 6, "sextile": 4},
    ),
    "TH_SIMPLE_RASI_V1": CalculationProfile(
        code="TH_SIMPLE_RASI_V1",
        zodiac_type="sidereal",
        ayanamsha="lahiri",
        house_system="whole_sign",
        node_type="mean_node",
        planets=["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "rahu", "ketu"],
        aspect_orbs_deg={"conjunction": 6, "opposition": 6, "trine": 5, "square": 5},
    ),

    "TH_NIRAYANA_MOCK_V1": CalculationProfile(
        code="TH_NIRAYANA_MOCK_V1",
        zodiac_type="sidereal",
        ayanamsha="lahiri",
        house_system="whole_sign",
        node_type="true_node",
        planets=[
            "sun",
            "moon",
            "mercury",
            "venus",
            "mars",
            "jupiter",
            "saturn",
            "uranus",
            "neptune",
            "pluto",
            "rahu",
            "ketu",
        ],
        aspect_orbs_deg={"conjunction": 8, "opposition": 8, "trine": 6, "square": 6, "sextile": 4},
    ),
    "TH_NIRAYANA_SWISSEPH_V1": CalculationProfile(
        code="TH_NIRAYANA_SWISSEPH_V1",
        zodiac_type="sidereal",
        ayanamsha="lahiri",
        house_system="whole_sign",
        node_type="true_node",
        planets=[
            "sun",
            "moon",
            "mercury",
            "venus",
            "mars",
            "jupiter",
            "saturn",
            "uranus",
            "neptune",
            "pluto",
            "rahu",
            "ketu",
        ],
        aspect_orbs_deg={"conjunction": 8, "opposition": 8, "trine": 6, "square": 6, "sextile": 4},
    ),
}


def get_profile(code: str) -> CalculationProfile:
    try:
        return PROFILES[code]
    except KeyError as error:
        raise ValueError(f"Unknown calculation profile: {code}") from error


PROFILE_ENGINE_COMPATIBILITY: dict[str, set[str]] = {
    "TH_NIRAYANA_SWISSEPH_V1": {"swisseph"},
    "TH_NIRAYANA_MOCK_V1": {"mock"},
}


def validate_profile_engine_compatibility(profile: CalculationProfile, engine_name: str) -> None:
    allowed_engines = PROFILE_ENGINE_COMPATIBILITY.get(profile.code, {"mock", "swisseph"})
    if engine_name not in allowed_engines:
        allowed = ", ".join(sorted(allowed_engines))
        raise ValueError(
            "ASTRO_PROFILE_ENGINE_MISMATCH: "
            f"calculation_profile_code={profile.code!r} requires engine {allowed}; active engine is {engine_name!r}."
        )
