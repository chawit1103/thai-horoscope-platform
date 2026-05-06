from __future__ import annotations

import hashlib
import json


def normalize_deg(value: float) -> float:
    return round(value % 360.0, 8)


def sign_index(longitude_deg: float) -> int:
    return int(normalize_deg(longitude_deg) // 30)


def angular_distance(a: float, b: float) -> float:
    diff = abs(normalize_deg(a) - normalize_deg(b)) % 360
    return min(diff, 360 - diff)


def stable_hash(payload: object) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
