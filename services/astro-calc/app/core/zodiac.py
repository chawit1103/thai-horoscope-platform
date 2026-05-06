from __future__ import annotations

from app.core.math import normalize_deg, sign_index

SIGN_NAMES_EN = [
    "Aries",
    "Taurus",
    "Gemini",
    "Cancer",
    "Leo",
    "Virgo",
    "Libra",
    "Scorpio",
    "Sagittarius",
    "Capricorn",
    "Aquarius",
    "Pisces",
]

SIGN_NAMES_TH = [
    "เมษ",
    "พฤษภ",
    "มิถุน",
    "กรกฎ",
    "สิงห์",
    "กันย์",
    "ตุล",
    "พิจิก",
    "ธนู",
    "มังกร",
    "กุมภ์",
    "มีน",
]


def sign_name_en(longitude_deg: float) -> str:
    return SIGN_NAMES_EN[sign_index(longitude_deg)]


def sign_name_th(longitude_deg: float) -> str:
    return SIGN_NAMES_TH[sign_index(longitude_deg)]


def degree_in_sign(longitude_deg: float) -> float:
    return round(normalize_deg(longitude_deg) % 30, 8)


def whole_sign_house_number(sidereal_longitude_deg: float, ascendant_deg: float | None) -> int | None:
    if ascendant_deg is None:
        return None
    asc_sign = sign_index(ascendant_deg)
    body_sign = sign_index(sidereal_longitude_deg)
    return ((body_sign - asc_sign) % 12) + 1
