from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def local_to_utc(datetime_local: str, timezone: str) -> datetime:
    try:
        tz = ZoneInfo(timezone)
    except ZoneInfoNotFoundError as error:
        raise ValueError(f"INVALID_TIMEZONE: {timezone}") from error
    local = datetime.fromisoformat(datetime_local)
    if local.tzinfo is not None:
        raise ValueError("datetime_local must not include an offset; timezone is provided separately.")
    return local.replace(tzinfo=tz).astimezone(UTC)


def utc_to_iso(value: datetime) -> str:
    return value.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def julian_day_ut(value: datetime) -> float:
    utc = value.astimezone(UTC)
    year = utc.year
    month = utc.month
    day_fraction = utc.day + (utc.hour + (utc.minute + (utc.second + utc.microsecond / 1_000_000) / 60) / 60) / 24
    if month <= 2:
        year -= 1
        month += 12
    a = year // 100
    b = 2 - a + a // 4
    return int(365.25 * (year + 4716)) + int(30.6001 * (month + 1)) + day_fraction + b - 1524.5


def each_hour_utc(date_local: str, timezone: str) -> list[tuple[datetime, datetime, str]]:
    tz = ZoneInfo(timezone)
    start_local = datetime.fromisoformat(f"{date_local}T00:00:00").replace(tzinfo=tz)
    windows: list[tuple[datetime, datetime, str]] = []
    for hour in range(24):
        local_start = start_local + timedelta(hours=hour)
        local_end = local_start + timedelta(hours=1)
        windows.append((local_start.astimezone(UTC), local_end.astimezone(UTC), local_start.strftime("%H:%M")))
    return windows
