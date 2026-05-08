from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.math import normalize_deg

THAI_STANDARD_MERIDIAN_DEG = 105.0
THAI_SUNRISE_ZENITH_DEG = 90.833
THAI_ANTONATHI_SAMAN_MINUTES_PER_DEG = 3.885


@dataclass(frozen=True)
class ThaiLagnaResult:
    lagna_deg: float
    local_time_correction_minutes: float
    sunrise_local_time: str
    lagna_source: str


def calculate_thai_antonathi_saman_lagna(
    *,
    local_datetime: datetime,
    timezone: str,
    latitude: float,
    longitude: float,
    sunrise_sun_sidereal_longitude_deg: float,
) -> ThaiLagnaResult:
    correction_minutes = local_time_correction_minutes(longitude)
    sunrise = approximate_sunrise_local_datetime(local_datetime, timezone, latitude, longitude)
    local_mean_datetime = local_datetime + timedelta(minutes=correction_minutes)
    elapsed_minutes = (local_mean_datetime - sunrise).total_seconds() / 60
    if elapsed_minutes < 0:
        elapsed_minutes += 24 * 60
    lagna = normalize_deg(
        sunrise_sun_sidereal_longitude_deg + elapsed_minutes / THAI_ANTONATHI_SAMAN_MINUTES_PER_DEG
    )
    return ThaiLagnaResult(
        lagna_deg=round(lagna, 8),
        local_time_correction_minutes=round(correction_minutes, 6),
        sunrise_local_time=_round_time_to_minute(sunrise),
        lagna_source="local_mean_time_plus_sunrise_sun",
    )


def local_time_correction_minutes(longitude: float) -> float:
    return (longitude - THAI_STANDARD_MERIDIAN_DEG) * 4


def approximate_sunrise_local_datetime(local_datetime: datetime, timezone: str, latitude: float, longitude: float) -> datetime:
    tz = ZoneInfo(timezone)
    offset_hours = local_datetime.replace(tzinfo=tz).utcoffset()
    timezone_hours = 0.0 if offset_hours is None else offset_hours.total_seconds() / 3600
    date_value = local_datetime.date()
    day_of_year = date_value.timetuple().tm_yday
    longitude_hour = longitude / 15
    approx_time = day_of_year + ((6 - longitude_hour) / 24)
    mean_anomaly = (0.9856 * approx_time) - 3.289
    true_longitude = (
        mean_anomaly
        + (1.916 * math.sin(math.radians(mean_anomaly)))
        + (0.020 * math.sin(math.radians(2 * mean_anomaly)))
        + 282.634
    ) % 360
    right_ascension = math.degrees(math.atan(0.91764 * math.tan(math.radians(true_longitude)))) % 360
    right_ascension += math.floor(true_longitude / 90) * 90 - math.floor(right_ascension / 90) * 90
    right_ascension_hours = right_ascension / 15
    sin_declination = 0.39782 * math.sin(math.radians(true_longitude))
    cos_declination = math.cos(math.asin(sin_declination))
    cos_hour_angle = (
        math.cos(math.radians(THAI_SUNRISE_ZENITH_DEG)) - (sin_declination * math.sin(math.radians(latitude)))
    ) / (cos_declination * math.cos(math.radians(latitude)))
    bounded_cos_hour_angle = min(1.0, max(-1.0, cos_hour_angle))
    hour_angle = (360 - math.degrees(math.acos(bounded_cos_hour_angle))) / 15
    local_mean_time = hour_angle + right_ascension_hours - (0.06571 * approx_time) - 6.622
    utc_hours = (local_mean_time - longitude_hour) % 24
    local_hours = (utc_hours + timezone_hours) % 24
    seconds = int(round(local_hours * 3600))
    return datetime.combine(date_value, datetime.min.time()) + timedelta(seconds=seconds)


def _round_time_to_minute(value: datetime) -> str:
    rounded = value + timedelta(seconds=30)
    return rounded.strftime("%H:%M")
