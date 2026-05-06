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
