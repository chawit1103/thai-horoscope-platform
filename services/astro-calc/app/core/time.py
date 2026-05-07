from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


UNKNOWN_BIRTH_TIME_FALLBACK = "12:00:00"
UNSUPPORTED_SUBSECOND_DATETIME = "UNSUPPORTED_SUBSECOND_DATETIME"


def _contains_fractional_time(value: str) -> bool:
    if "T" in value:
        time_part = value.rsplit("T", 1)[1]
    elif " " in value:
        time_part = value.rsplit(" ", 1)[1]
    else:
        time_part = value
    return "." in time_part or "," in time_part


def _reject_subsecond_time(value: str) -> None:
    if _contains_fractional_time(value):
        raise ValueError(UNSUPPORTED_SUBSECOND_DATETIME)


def parse_datetime_local(datetime_local: str, error_code: str = "INVALID_DATETIME_LOCAL") -> datetime:
    _reject_subsecond_time(datetime_local)
    try:
        local = datetime.fromisoformat(datetime_local)
    except ValueError:
        raise ValueError(error_code) from None
    if local.tzinfo is not None:
        raise ValueError("INVALID_DATETIME_LOCAL_OFFSET")
    return local


def parse_birth_date(birth_date: str) -> date:
    try:
        return date.fromisoformat(birth_date)
    except ValueError:
        raise ValueError("INVALID_BIRTH_DATE") from None


def normalize_birth_time(birth_time: str) -> str:
    _reject_subsecond_time(birth_time)
    candidate = f"{birth_time}:00" if len(birth_time) == 5 else birth_time
    try:
        parsed = time.fromisoformat(candidate)
    except ValueError:
        raise ValueError("INVALID_BIRTH_TIME") from None
    if parsed.tzinfo is not None:
        raise ValueError("INVALID_BIRTH_TIME")
    return parsed.isoformat()


def birth_datetime_local(birth_date: str, birth_time: str) -> str:
    parsed_date = parse_birth_date(birth_date)
    normalized_time = normalize_birth_time(birth_time)
    return f"{parsed_date.isoformat()}T{normalized_time}"


def date_from_datetime_local(datetime_local: str | None) -> str | None:
    if not datetime_local:
        return None
    return parse_datetime_local(datetime_local).date().isoformat()


def local_to_utc(datetime_local: str, timezone: str) -> datetime:
    try:
        tz = ZoneInfo(timezone)
    except ZoneInfoNotFoundError as error:
        raise ValueError(f"INVALID_TIMEZONE: {timezone}") from error
    local = parse_datetime_local(datetime_local)
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
    start_local = parse_datetime_local(f"{date_local}T00:00:00", "INVALID_BIRTH_DATE").replace(tzinfo=tz)
    windows: list[tuple[datetime, datetime, str]] = []
    for hour in range(24):
        local_start = start_local + timedelta(hours=hour)
        local_end = local_start + timedelta(hours=1)
        windows.append((local_start.astimezone(UTC), local_end.astimezone(UTC), local_start.strftime("%H:%M")))
    return windows
