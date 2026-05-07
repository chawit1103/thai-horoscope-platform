from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

MonitoringSeverity = Literal["info", "warning", "error", "critical"]
MonitoringEventType = Literal["astro_calc_health_failed", "astro_ephemeris_config_invalid"]

SENSITIVE_KEY_PARTS = (
    "birth",
    "place",
    "location",
    "timezone",
    "raw",
    "payload",
    "body",
    "secret",
    "token",
    "api",
    "license",
    "ephemeris",
)
SAFE_KEY_ALLOWLIST = {"reason", "error_code", "engine", "profile", "status"}
EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
LINE_USER_ID_PATTERN = re.compile(r"\bU[0-9A-Za-z]{8,}\b")
CARD_PATTERN = re.compile(r"\b(?:\d[ -]?){12,19}\b")
PREFIXED_SECRET_PATTERN = re.compile(r"\b(?:sk|pk|rk|whsec|key|token|secret)[_-][A-Za-z0-9_-]{8,}\b", re.IGNORECASE)
KEY_VALUE_SECRET_PATTERN = re.compile(
    r"\b(?:authorization|bearer|api[_-]?key|webhook[_-]?secret|secret|token)\s*[:=]\s*[\"']?(?:(?:basic|bearer|digest|token)\s+)?[A-Za-z0-9._~+/=-]{4,}[\"']?",
    re.IGNORECASE,
)
AUTH_TOKEN_PATTERN = re.compile(r"\b(?:authorization|bearer)\s+[A-Za-z0-9._~+/=-]{8,}\b", re.IGNORECASE)
ISO_DATE_PATTERN = re.compile(r"(?<!\d)(?:19|20)\d{2}-\d{2}-\d{2}(?!\d)")
TIME_PATTERN = re.compile(r"(?<!\d)(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:\.\d+)?(?!\d)")
SECRET_WORD_PATTERN = re.compile(r"\b(?:bearer|secret|token|api[_-]?key|webhook[_-]?secret|authorization)\b", re.IGNORECASE)


@dataclass(frozen=True)
class AstroMonitoringEvent:
    type: MonitoringEventType
    severity: MonitoringSeverity
    source: str
    created_at: str
    subject_ref: str | None
    dedupe_key: str | None
    metadata: dict[str, Any]

    def as_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "severity": self.severity,
            "source": self.source,
            "created_at": self.created_at,
            "subject_ref": self.subject_ref,
            "dedupe_key": self.dedupe_key,
            "metadata": self.metadata,
        }


def create_astro_monitoring_event(
    *,
    event_type: MonitoringEventType,
    severity: MonitoringSeverity = "critical",
    metadata: dict[str, Any] | None = None,
    subject_ref: str | None = None,
    dedupe_key: str | None = None,
    now: datetime | None = None,
) -> AstroMonitoringEvent:
    return AstroMonitoringEvent(
        type=event_type,
        severity=severity,
        source="astro_calc",
        created_at=(now or datetime.now(timezone.utc)).isoformat().replace("+00:00", "Z"),
        subject_ref=safe_reference(subject_ref) if subject_ref else None,
        dedupe_key=safe_reference(dedupe_key) if dedupe_key else None,
        metadata=redact_mapping(metadata or {}),
    )


def sanitize_astro_error(error: BaseException | str) -> str:
    raw = str(error)
    code = raw.split(":", 1)[0].strip()
    if not re.fullmatch(r"[A-Z][A-Z0-9_]{2,80}", code):
        return "ASTRO_ERROR"
    return redact_string(code).replace(" ", "_").upper()


def redact_for_observability(value: Any) -> Any:
    return redact_value(value)


def astro_health_operational_status(health_report: dict[str, str]) -> dict[str, Any]:
    return {
        "service": "astro_calc",
        "status": "ok" if health_report.get("status") == "ok" else "error",
        "engine": redact_value(health_report.get("engine", "invalid"), "engine"),
        "profile": redact_value(health_report.get("profile", "invalid"), "profile"),
        "ephemeris_path_configured": str(health_report.get("ephemeris_path_configured") == "true").lower(),
        "error_code": sanitize_astro_error(health_report.get("error_code", "")) if health_report.get("error_code") else "",
    }


def redact_mapping(metadata: dict[str, Any]) -> dict[str, Any]:
    return {key: redact_value(value, key) for key, value in metadata.items()}


def redact_value(value: Any, key: str | None = None) -> Any:
    if is_sensitive_key(key):
        return "[REDACTED]"
    if value is None or isinstance(value, bool | int | float):
        return value
    if isinstance(value, str):
        if key == "reason":
            return sanitize_reason_code(value)
        return redact_string(value)
    if isinstance(value, list | tuple):
        return [redact_value(item, key) for item in value]
    if isinstance(value, dict):
        return {str(nested_key): redact_value(nested_value, str(nested_key)) for nested_key, nested_value in value.items()}
    return "[REDACTED]"


def redact_string(value: str) -> str:
    redacted = EMAIL_PATTERN.sub("[REDACTED_EMAIL]", value.strip())
    redacted = LINE_USER_ID_PATTERN.sub("[REDACTED_LINE_USER]", redacted)
    redacted = CARD_PATTERN.sub("[REDACTED_CARD]", redacted)
    redacted = PREFIXED_SECRET_PATTERN.sub("[REDACTED_SECRET]", redacted)
    redacted = KEY_VALUE_SECRET_PATTERN.sub("[REDACTED_SECRET]", redacted)
    redacted = AUTH_TOKEN_PATTERN.sub("[REDACTED_SECRET]", redacted)
    redacted = ISO_DATE_PATTERN.sub("[REDACTED_DATE]", redacted)
    redacted = TIME_PATTERN.sub("[REDACTED_TIME]", redacted)
    redacted = SECRET_WORD_PATTERN.sub("[REDACTED_SECRET]", redacted)
    return redacted


def is_sensitive_key(key: str | None) -> bool:
    if not key or key in SAFE_KEY_ALLOWLIST:
        return False
    normalized = re.sub(r"[^a-zA-Z0-9]", "", key).lower()
    return any(part in normalized for part in SENSITIVE_KEY_PARTS)


def safe_reference(value: str) -> str:
    if re.fullmatch(r"ref_[A-Za-z0-9_-]{16}", value):
        return value
    return f"ref_{hashlib.sha256(value.encode()).hexdigest()[:16]}"


def sanitize_reason_code(value: str) -> str:
    trimmed = value.strip()
    if re.fullmatch(r"(?:[a-z][a-z0-9_]{2,80}|[A-Z][A-Z0-9_]{2,80})", trimmed):
        return redact_string(trimmed)
    return "astro_error"
