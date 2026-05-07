from __future__ import annotations

from app.core.math import angular_distance, normalize_deg
from app.schemas import Aspect, PlanetPosition, TransitToNatalHit

ASPECT_ANGLES = {
    "conjunction": 0,
    "sextile": 60,
    "square": 90,
    "trine": 120,
    "opposition": 180,
}


def calculate_aspects(
    positions: dict[str, PlanetPosition],
    aspect_orbs_deg: dict[str, float],
    *,
    prefix_a: str = "",
    prefix_b: str = "",
) -> list[Aspect]:
    bodies = sorted(positions)
    aspects: list[Aspect] = []
    for index, body_a in enumerate(bodies):
        for body_b in bodies[index + 1 :]:
            aspect = match_aspect(positions[body_a].longitude_deg, positions[body_b].longitude_deg, aspect_orbs_deg)
            if aspect:
                aspect_type, orb = aspect
                aspects.append(Aspect(body_a=f"{prefix_a}{body_a}", body_b=f"{prefix_b}{body_b}", type=aspect_type, orb_deg=orb))
    return aspects


def calculate_cross_aspects(
    left: dict[str, PlanetPosition],
    right: dict[str, PlanetPosition],
    aspect_orbs_deg: dict[str, float],
) -> list[Aspect]:
    aspects: list[Aspect] = []
    for body_a, pos_a in sorted(left.items()):
        for body_b, pos_b in sorted(right.items()):
            aspect = match_aspect(pos_a.longitude_deg, pos_b.longitude_deg, aspect_orbs_deg)
            if aspect:
                aspect_type, orb = aspect
                applying = transit_aspect_applying(
                    pos_a.longitude_deg, pos_b.longitude_deg, aspect_type, pos_a.speed_longitude_deg_per_day
                )
                aspects.append(
                    Aspect(
                        body_a=f"transit_{body_a}",
                        body_b=f"natal_{body_b}",
                        type=aspect_type,
                        orb_deg=orb,
                        applying=applying,
                    )
                )
    return aspects


def calculate_transit_to_natal_hits(
    transit_planets: dict[str, PlanetPosition],
    natal_points: dict[str, PlanetPosition],
    aspect_orbs_deg: dict[str, float],
) -> list[TransitToNatalHit]:
    hits: list[TransitToNatalHit] = []
    for transit_planet, transit_position in sorted(transit_planets.items()):
        for natal_point, natal_position in sorted(natal_points.items()):
            aspect = match_aspect(transit_position.longitude_deg, natal_position.longitude_deg, aspect_orbs_deg)
            if not aspect:
                continue
            aspect_type, orb = aspect
            applying = transit_aspect_applying(
                transit_position.longitude_deg,
                natal_position.longitude_deg,
                aspect_type,
                transit_position.speed_longitude_deg_per_day,
            )
            hits.append(
                TransitToNatalHit(
                    transit_planet=transit_planet,
                    natal_point=natal_point,
                    aspect_type=aspect_type,
                    exact_orb_deg=orb,
                    applying_or_separating=None if applying is None else "applying" if applying else "separating",
                    category_hint=category_hint(aspect_type),
                    weight_hint=weight_hint(aspect_type, orb, aspect_orbs_deg),
                    interpretation_key=f"transit.{transit_planet}.{aspect_type}.natal.{natal_point}",
                )
            )
    return hits


def transit_aspect_applying(
    transit_longitude_deg: float,
    natal_longitude_deg: float,
    aspect_type: str,
    transit_speed_deg_per_day: float | None,
) -> bool | None:
    if transit_speed_deg_per_day is None or abs(transit_speed_deg_per_day) <= 1e-9:
        return None
    aspect_angle = ASPECT_ANGLES[aspect_type]
    signed_separation = signed_angular_delta(transit_longitude_deg, natal_longitude_deg)
    residual = min(
        (signed_angular_delta(signed_separation, aspect_angle), signed_separation - aspect_angle),
        (signed_angular_delta(signed_separation, -aspect_angle), signed_separation + aspect_angle),
        key=lambda candidate: abs(candidate[0]),
    )[0]
    return residual * transit_speed_deg_per_day < 0


def signed_angular_delta(a: float, b: float) -> float:
    return normalize_deg(a - b + 180) - 180


def category_hint(aspect_type: str) -> str:
    if aspect_type in {"conjunction", "opposition", "square", "trine", "sextile"}:
        return "major"
    return "minor"


def weight_hint(aspect_type: str, orb: float, aspect_orbs_deg: dict[str, float]) -> float:
    configured_orb = aspect_orbs_deg.get(aspect_type, 0)
    if configured_orb <= 0:
        return 0
    base = {
        "conjunction": 1.0,
        "opposition": 0.9,
        "square": 0.85,
        "trine": 0.75,
        "sextile": 0.65,
    }.get(aspect_type, 0.5)
    closeness = max(0.0, 1 - orb / configured_orb)
    return round(base * closeness, 6)


def match_aspect(a: float, b: float, aspect_orbs_deg: dict[str, float]) -> tuple[str, float] | None:
    distance = angular_distance(a, b)
    best: tuple[str, float] | None = None
    for aspect_type, angle in ASPECT_ANGLES.items():
        orb = round(abs(distance - angle), 6)
        if orb <= aspect_orbs_deg.get(aspect_type, 0):
            if best is None or orb < best[1]:
                best = (aspect_type, orb)
    return best
