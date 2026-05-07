from __future__ import annotations

from datetime import datetime, timezone

from app.core.observability import (
    astro_health_operational_status,
    create_astro_monitoring_event,
    redact_for_observability,
    sanitize_astro_error,
)


def test_redacts_birth_data_and_secret_like_values() -> None:
    redacted = redact_for_observability(
        {
            "birth_date": "1971-03-11",
            "birth_time": "08:17",
            "birth_place": "Bangkok",
            "message": "invalid 1971-03-11T08:17 with token secret-token",
            "card": "4242424242424242",
        }
    )
    serialized = str(redacted)

    assert "1971-03-11" not in serialized
    assert "08:17" not in serialized
    assert "Bangkok" not in serialized
    assert "secret-token" not in serialized
    assert "4242424242424242" not in serialized


def test_astro_monitoring_event_is_sanitized() -> None:
    event = create_astro_monitoring_event(
        event_type="astro_calc_health_failed",
        subject_ref="profile-user-123",
        dedupe_key="astro:INVALID_DATETIME",
        now=datetime(2026, 5, 7, 9, 0, tzinfo=timezone.utc),
        metadata={
            "reason": "calculation_failed",
            "error_code": "INVALID_DATETIME",
            "birth_date": "1992-08-15",
            "birth_time": "07:30",
            "birth_place": "Bangkok",
            "raw_error": "Invalid 1992-08-15T07:30 Bangkok",
        },
    )
    payload = event.as_dict()
    serialized = str(payload)

    assert payload["type"] == "astro_calc_health_failed"
    assert payload["severity"] == "critical"
    assert payload["subject_ref"].startswith("ref_")
    assert payload["dedupe_key"].startswith("ref_")
    assert "1992-08-15" not in serialized
    assert "07:30" not in serialized
    assert "Bangkok" not in serialized


def test_sanitize_astro_error_returns_code_only() -> None:
    error_code = sanitize_astro_error("INVALID_DATETIME: 1971-03-11T08:17 Bangkok secret-token")

    assert error_code == "INVALID_DATETIME"
    assert "1971-03-11" not in error_code
    assert "secret-token" not in error_code


def test_sanitize_astro_error_rejects_path_like_exception_text() -> None:
    error_code = sanitize_astro_error("FileNotFoundError /private/ephemeris/path")

    assert error_code == "ASTRO_ERROR"
    assert "/private/ephemeris/path" not in error_code


def test_astro_health_operational_status_never_exposes_path() -> None:
    status = astro_health_operational_status(
        {
            "status": "error",
            "engine": "swisseph",
            "profile": "TH_NIRAYANA_V1",
            "license_mode": "professional",
            "ephemeris_path_configured": "true",
            "error_code": "EPHEMERIS_FILE_MISSING: /private/ephemeris/path",
        }
    )
    serialized = str(status)

    assert status["service"] == "astro_calc"
    assert status["status"] == "error"
    assert "/private/ephemeris/path" not in serialized
    assert "professional" not in serialized


def test_astro_health_operational_status_uses_generic_code_for_unsafe_error_text() -> None:
    status = astro_health_operational_status(
        {
            "status": "error",
            "engine": "swisseph",
            "profile": "TH_NIRAYANA_V1",
            "ephemeris_path_configured": "true",
            "error_code": "FileNotFoundError /private/ephemeris/path",
        }
    )

    assert status["error_code"] == "ASTRO_ERROR"
    assert "/private/ephemeris/path" not in str(status)
