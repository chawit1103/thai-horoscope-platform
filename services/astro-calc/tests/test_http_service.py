from __future__ import annotations

import json
from pathlib import Path
from typing import cast

from fastapi.testclient import TestClient
from httpx import Response
from pytest import MonkeyPatch

from app.engines.swisseph import build_ephemeris_file_manifest
from app.main import app

client = TestClient(app)


def test_health_returns_sanitized_status(monkeypatch: MonkeyPatch) -> None:
    configure_mock_env(monkeypatch)
    monkeypatch.setenv("ASTRO_EPHEMERIS_PATH", "/Users/chawit/private/ephemeris")
    monkeypatch.setenv("ASTRO_EPHEMERIS_MANIFEST_PATH", "/Users/chawit/private/manifest.json")

    response = client.get("/health")
    payload = response_json(response)
    serialized = json.dumps(payload, sort_keys=True)

    assert response.status_code == 200
    assert payload["status"] == "ok"
    assert payload["engine"] == "mock"
    assert payload["ephemeris_path_configured"] == "true"
    assert "/Users/chawit" not in serialized
    assert "private/ephemeris" not in serialized
    assert "manifest.json" not in serialized


def test_unhealthy_health_check_returns_non_2xx_status(monkeypatch: MonkeyPatch) -> None:
    configure_mock_env(monkeypatch)
    monkeypatch.setenv("APP_ENV", "production")

    response = client.get("/health")
    payload = response_json(response)
    serialized = json.dumps(payload, sort_keys=True)

    assert response.status_code == 503
    assert payload["status"] == "error"
    assert payload["error_code"] == "ASTRO_MOCK_ENGINE_PRODUCTION_FORBIDDEN"
    assert "production" not in serialized


def test_calculate_natal_works_in_mock_mode(monkeypatch: MonkeyPatch) -> None:
    configure_mock_env(monkeypatch)

    response = client.post("/calculate/natal", json=mock_natal_request())
    payload = response_json(response)

    assert response.status_code == 200
    assert payload["chart_type"] == "natal"
    assert payload["engine_name"] == "mock"
    assert payload["calculation_profile_code"] == "TH_NIRAYANA_V1"
    assert payload["datetime_local"] == "1971-03-11T08:17:00"
    assert payload["datetime_utc"] == "1971-03-11T01:17:00Z"
    assert "planets" in payload
    assert "interpretation" not in payload


def test_v1_chart_preview_alias_uses_same_natal_contract(monkeypatch: MonkeyPatch) -> None:
    configure_mock_env(monkeypatch)

    response = client.post("/v1/charts/natal", json=mock_natal_request())
    payload = response_json(response)

    assert response.status_code == 200
    assert payload["chart_type"] == "natal"
    assert payload["engine_name"] == "mock"


def test_calculate_natal_rejects_invalid_input_safely(monkeypatch: MonkeyPatch) -> None:
    configure_mock_env(monkeypatch)
    raw_payload = {
        "calculation_profile_code": "TH_NIRAYANA_V1",
        "datetime_local": "1971-03-11T08:17:00",
        "timezone": "Asia/Bangkok",
        "latitude": 13.759,
    }

    response = client.post("/calculate/natal", json=raw_payload)
    payload = response_json(response)
    serialized = json.dumps(payload, sort_keys=True)

    assert response.status_code == 422
    assert payload == {"status": "error", "error_code": "INVALID_NATAL_CHART_REQUEST"}
    assert "1971-03-11" not in serialized
    assert "08:17" not in serialized
    assert "Asia/Bangkok" not in serialized
    assert "13.759" not in serialized


def test_calculate_natal_errors_do_not_leak_raw_request_or_secrets(monkeypatch: MonkeyPatch) -> None:
    configure_mock_env(monkeypatch)
    raw_payload = {
        **mock_natal_request(),
        "datetime_local": "1971-03-11T08:17:00",
        "timezone": "Asia/Bangkok/secret-/Users/chawit/private/ephemeris",
    }

    response = client.post("/calculate/natal", json=raw_payload)
    payload = response_json(response)
    serialized = json.dumps(payload, sort_keys=True)

    assert response.status_code == 400
    assert payload["status"] == "error"
    assert payload["error_code"] == "INVALID_TIMEZONE"
    for blocked in [
        "1971-03-11",
        "08:17",
        "Asia/Bangkok",
        "/Users/chawit",
        "private/ephemeris",
        "secret",
    ]:
        assert blocked not in serialized


def test_calculate_natal_validates_requested_profile_against_pinned_manifest(
    monkeypatch: MonkeyPatch, tmp_path: Path
) -> None:
    configure_pinned_swisseph_env(monkeypatch, tmp_path, approved_profiles=["TH_NIRAYANA_SWISSEPH_V1"])
    raw_payload = {
        **mock_natal_request(),
        "calculation_profile_code": "TH_NIRAYANA_LAHIRI_MEAN_NODE_SWISSEPH_V1",
    }

    response = client.post("/calculate/natal", json=raw_payload)
    payload = response_json(response)
    serialized = json.dumps(payload, sort_keys=True)

    assert response.status_code == 400
    assert payload == {"status": "error", "error_code": "EPHEMERIS_PROFILE_NOT_APPROVED"}
    assert str(tmp_path) not in serialized
    assert "sepl_18.se1" not in serialized
    assert "1971-03-11" not in serialized


def configure_mock_env(monkeypatch: MonkeyPatch) -> None:
    for key in [
        "ASTRO_EPHEMERIS_PATH",
        "ASTRO_EPHEMERIS_MANIFEST_PATH",
        "ASTRO_REQUIRE_PINNED_EPHEMERIS",
        "ASTRO_ALLOW_MOSHIER_EPHEMERIS",
        "SWISSEPH_LICENSE_MODE",
        "ASTRO_CALCULATION_PROFILE",
    ]:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("ASTRO_ENGINE", "mock")


def configure_pinned_swisseph_env(monkeypatch: MonkeyPatch, tmp_path: Path, *, approved_profiles: list[str]) -> None:
    configure_mock_env(monkeypatch)
    ephemeris_file = tmp_path / "sepl_18.se1"
    ephemeris_file.write_bytes(b"fixture")
    manifest = {
        **build_ephemeris_file_manifest(str(tmp_path)),
        "license_mode": "professional",
        "approved_by": "astro-ops",
        "approval_date": "2026-05-09",
        "calculation_profiles": approved_profiles,
    }
    manifest_path = tmp_path / "ephemeris-manifest.json"
    manifest_path.write_text(json.dumps(manifest, sort_keys=True), encoding="utf-8")
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ASTRO_ENGINE", "swisseph")
    monkeypatch.setenv("ASTRO_CALCULATION_PROFILE", approved_profiles[0])
    monkeypatch.setenv("SWISSEPH_LICENSE_MODE", "professional")
    monkeypatch.setenv("ASTRO_EPHEMERIS_PATH", str(tmp_path))
    monkeypatch.setenv("ASTRO_EPHEMERIS_MANIFEST_PATH", str(manifest_path))
    monkeypatch.setenv("ASTRO_REQUIRE_PINNED_EPHEMERIS", "true")


def mock_natal_request() -> dict[str, object]:
    return {
        "calculation_profile_code": "TH_NIRAYANA_V1",
        "datetime_local": "1971-03-11T08:17:00",
        "timezone": "Asia/Bangkok",
        "latitude": 13.759,
        "longitude": 100.535,
        "birth_time_unknown": False,
    }


def response_json(response: Response) -> dict[str, object]:
    return cast(dict[str, object], response.json())
