from __future__ import annotations

from dataclasses import asdict, dataclass, field, fields, is_dataclass
from typing import Literal, cast

PeriodType = Literal["daily", "weekly", "monthly", "yearly"]


@dataclass(frozen=True)
class ChartRequest:
    calculation_profile_code: str
    timezone: str
    latitude: float
    longitude: float
    datetime_local: str | None = None
    birth_date: str | None = None
    birth_time: str | None = None
    birth_time_unknown: bool = False
    elevation_m: float = 0
    time_accuracy_minutes: int | None = None


@dataclass(frozen=True)
class TransitRequest:
    natal: ChartRequest
    transit_datetime_local: str
    transit_timezone: str


@dataclass(frozen=True)
class TransitLocation:
    latitude: float
    longitude: float
    timezone: str = "UTC"
    elevation_m: float = 0


@dataclass(frozen=True)
class TransitSnapshotRequest:
    natal_chart_snapshot: ChartSnapshot
    transit_datetime_utc: str
    calculation_profile_code: str
    transit_location: TransitLocation | None = None
    orb_settings: dict[str, float] | None = None


@dataclass(frozen=True)
class SolarReturnRequest:
    natal: ChartRequest | None = None
    return_year: int | None = None
    natal_chart_snapshot: ChartSnapshot | None = None
    solar_return_year: int | None = None
    location: TransitLocation | None = None
    calculation_profile_code: str | None = None
    accuracy_arc_minutes: float = 1
    max_iterations: int = 64


@dataclass(frozen=True)
class HourlyTimingRequest:
    natal: ChartRequest | None = None
    date_local: str | None = None
    timezone: str = "UTC"
    natal_chart_snapshot: ChartSnapshot | None = None
    start_datetime_utc: str | None = None
    end_datetime_utc: str | None = None
    start_datetime_local: str | None = None
    end_datetime_local: str | None = None
    location: TransitLocation | None = None
    calculation_profile_code: str | None = None
    period_granularity: str = "hourly"
    enabled_aspect_types: list[str] = field(default_factory=lambda: ["conjunction", "opposition", "square", "trine", "sextile"])
    orb_thresholds: dict[str, float] | None = None


@dataclass(frozen=True)
class Ayanamsha:
    name: str
    value_deg: float | None


@dataclass(frozen=True)
class PlanetPosition:
    tropical_longitude_deg: float
    ayanamsa_deg: float | None
    sidereal_longitude_deg: float
    ecliptic_latitude_deg: float
    longitude_deg: float
    latitude_deg: float
    speed_longitude_deg_per_day: float
    sign_index: int
    sign_name_en: str
    sign_name_th: str
    degree_in_sign: float
    retrograde: bool
    nakshatra: str | None = None
    house_number: int | None = None
    warnings: list[WarningMessage] = field(default_factory=list)


@dataclass(frozen=True)
class Houses:
    system: str
    ascendant_deg: float | None
    mc_deg: float | None
    cusps_deg: list[float]
    reliable: bool = True


@dataclass(frozen=True)
class Angles:
    ascendant_deg: float | None
    lagna_deg: float | None
    mc_deg: float | None
    ic_deg: float | None
    descendant_deg: float | None
    reliable: bool


@dataclass(frozen=True)
class Aspect:
    body_a: str
    body_b: str
    type: str
    orb_deg: float
    applying: bool | None = None


@dataclass(frozen=True)
class TransitToNatalHit:
    transit_planet: str
    natal_point: str
    aspect_type: str
    exact_orb_deg: float
    applying_or_separating: str | None
    category_hint: str | None
    weight_hint: float | None
    interpretation_key: str


@dataclass(frozen=True)
class WarningMessage:
    code: str
    message: str


@dataclass(frozen=True)
class CalculationProfile:
    code: str
    zodiac_type: Literal["sidereal", "tropical"]
    ayanamsha: str
    house_system: str
    node_type: str
    planets: list[str]
    aspect_orbs_deg: dict[str, float]


@dataclass(frozen=True)
class EngineInfo:
    name: str
    version: str
    license_mode: str
    ephemeris_path_configured: bool
    ephemeris_fingerprint: str


@dataclass(frozen=True)
class DateTimeInfo:
    local: str
    utc: str
    timezone: str
    julian_day_ut: float


@dataclass(frozen=True)
class LocationInfo:
    latitude: float
    longitude: float
    elevation_m: float


@dataclass(frozen=True)
class ZodiacInfo:
    type: str
    ayanamsa_code: str
    ayanamsa_deg: float | None


@dataclass(frozen=True)
class ChartSnapshot:
    chart_type: str
    engine: str
    engine_info: EngineInfo
    engine_version: str
    ephemeris_source: str
    ephemeris_fingerprint: str
    calculation_profile_code: str
    calculation_profile: CalculationProfile
    datetime: DateTimeInfo
    datetime_local: str
    datetime_utc: str
    julian_day_ut: float
    location: LocationInfo
    calculation_hash: str
    zodiac: ZodiacInfo
    ayanamsa_deg: float | None
    ayanamsha: Ayanamsha
    planets: dict[str, PlanetPosition]
    houses: Houses
    angles: Angles
    derived_points: dict[str, PlanetPosition]
    aspects: list[Aspect]
    warnings: list[WarningMessage]
    metadata: dict[str, str] = field(default_factory=dict)

    def to_json_dict(self) -> dict[str, object]:
        data = asdict(self)
        data["engine_name"] = data["engine"]
        data["engine"] = data.pop("engine_info")
        return data


@dataclass(frozen=True)
class TransitComparison:
    natal: ChartSnapshot
    transit: ChartSnapshot
    natal_chart_snapshot: ChartSnapshot
    transit_chart_snapshot: ChartSnapshot
    transit_planets: dict[str, PlanetPosition]
    natal_planets: dict[str, PlanetPosition]
    aspects: list[Aspect]
    transit_to_natal_aspects: list[Aspect]
    transit_to_natal_hits: list[TransitToNatalHit]
    scoring_ready: dict[str, object]
    calculation_hash: str

    def to_json_dict(self) -> dict[str, object]:
        return cast(dict[str, object], public_serialize(self))


@dataclass(frozen=True)
class SolarReturn:
    year: int
    solar_return_utc: str
    target_sun_longitude_deg: float
    chart: ChartSnapshot
    solar_return_datetime_utc: str
    solar_return_datetime_local: str
    sun_longitude_at_return: float
    natal_sun_longitude_reference: float
    delta_arc_seconds: float
    solar_return_chart_snapshot: ChartSnapshot
    warnings: list[WarningMessage]
    calculation_hash: str

    def to_json_dict(self) -> dict[str, object]:
        return cast(dict[str, object], public_serialize(self))


@dataclass(frozen=True)
class HourlyTimingWindow:
    start_datetime_utc: str
    end_datetime_utc: str
    local_start: str
    local_end: str
    trigger_type: str
    transit_planet: str
    natal_point: str
    aspect_type: str
    peak_datetime_utc: str | None
    orb_min_deg: float
    weight_hint: float | None
    category_hint: str | None
    safety_level: str
    starts_at_utc: str
    ends_at_utc: str
    local_label: str
    score: int
    dominant_body: str
    notes: list[str]


@dataclass(frozen=True)
class HourlyTimingResult:
    date_local: str | None
    timezone: str
    timing_windows: list[HourlyTimingWindow]
    windows: list[HourlyTimingWindow]
    warnings: list[WarningMessage]
    calculation_hash: str

    def to_json_dict(self) -> dict[str, object]:
        return cast(dict[str, object], public_serialize(self))


def public_serialize(value: object) -> object:
    if isinstance(value, ChartSnapshot):
        return value.to_json_dict()
    if is_dataclass(value) and not isinstance(value, type):
        return {item.name: public_serialize(getattr(value, item.name)) for item in fields(value)}
    if isinstance(value, dict):
        return {key: public_serialize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [public_serialize(item) for item in value]
    return value
