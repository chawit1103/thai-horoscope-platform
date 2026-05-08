from __future__ import annotations

import json
import os
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.config import AstroRuntimeConfig, read_runtime_environment
from app.core.aspects import calculate_cross_aspects, calculate_transit_to_natal_hits
from app.core.calculators import AstroCoreService
from app.core.math import normalize_deg, sign_index
from app.core.time import local_to_utc, utc_to_iso
from app.engines.mock import MockAstroEngine
from app.engines.swisseph import SwissEphemerisEngine, build_ephemeris_file_manifest, fingerprint_ephemeris_path
from app.main import create_service, health
from app.schemas import (
    ChartRequest,
    ChartSnapshot,
    HourlyTimingRequest,
    PlanetPosition,
    SolarReturnRequest,
    TransitLocation,
    TransitRequest,
    TransitSnapshotRequest,
    WarningMessage,
)


def approved_ephemeris_manifest(manifest: dict[str, object], profiles: list[str] | None = None) -> dict[str, object]:
    return {
        **manifest,
        "license_mode": "professional",
        "approved_by": "astro-ops",
        "approval_date": "2026-05-08",
        "calculation_profiles": profiles or ["TH_NIRAYANA_V1"],
    }


def bangkok_request(profile: str = "TH_NIRAYANA_V1", birth_time_unknown: bool = False) -> ChartRequest:
    return ChartRequest(
        calculation_profile_code=profile,
        datetime_local="1990-05-12T08:30:00",
        timezone="Asia/Bangkok",
        latitude=13.7563,
        longitude=100.5018,
        elevation_m=0,
        time_accuracy_minutes=5,
        birth_time_unknown=birth_time_unknown,
    )


def planet_position(longitude_deg: float, speed_deg_per_day: float) -> PlanetPosition:
    return PlanetPosition(
        tropical_longitude_deg=longitude_deg,
        ayanamsa_deg=0,
        sidereal_longitude_deg=longitude_deg,
        ecliptic_latitude_deg=0,
        longitude_deg=longitude_deg,
        latitude_deg=0,
        speed_longitude_deg_per_day=speed_deg_per_day,
        sign_index=sign_index(longitude_deg),
        sign_name_en="",
        sign_name_th="",
        degree_in_sign=longitude_deg % 30,
        retrograde=speed_deg_per_day < 0,
    )


class FakeMockEngine(MockAstroEngine):
    name = "mock"


class FingerprintMockEngine(MockAstroEngine):
    def __init__(self, fingerprint: str) -> None:
        self.ephemeris_fingerprint = fingerprint


class AstroCoreTests(unittest.TestCase):
    def assert_sanitized_timezone_error(self, error: ValueError, raw_timezone: str, fragments: list[str]) -> None:
        error_message = str(error)
        self.assertEqual(error_message, "INVALID_TIMEZONE")
        self.assertNotIn(raw_timezone, error_message)
        self.assertIsNone(error.__cause__)
        if error.__context__ is not None:
            context_message = str(error.__context__)
            self.assertNotIn(raw_timezone, context_message)
            for fragment in fragments:
                self.assertNotIn(fragment, context_message)

    def assert_sanitized_datetime_error(self, error: ValueError, fragments: list[str]) -> None:
        error_message = str(error)
        self.assertEqual(error_message, "INVALID_DATETIME")
        self.assertIsNone(error.__cause__)
        for fragment in fragments:
            self.assertNotIn(fragment, error_message)
        if error.__context__ is not None:
            context_message = str(error.__context__)
            for fragment in fragments:
                self.assertNotIn(fragment, context_message)

    def test_timezone_conversion_bangkok_and_dst(self) -> None:
        self.assertEqual(utc_to_iso(local_to_utc("1990-05-12T08:30:00", "Asia/Bangkok")), "1990-05-12T01:30:00Z")
        self.assertEqual(utc_to_iso(local_to_utc("2026-07-01T08:30:00", "America/New_York")), "2026-07-01T12:30:00Z")
        self.assertEqual(utc_to_iso(local_to_utc("2026-01-01T08:30:00", "America/New_York")), "2026-01-01T13:30:00Z")
        raw_timezone = "Not/AZone"
        with self.assertRaisesRegex(ValueError, "^INVALID_TIMEZONE$") as raised:
            local_to_utc("2026-01-01T08:30:00", raw_timezone)
        self.assert_sanitized_timezone_error(raised.exception, raw_timezone, ["Not/AZone"])

    def test_invalid_timezone_error_sanitizes_secret_like_values(self) -> None:
        raw_timezone = "Asia/Bangkok?birth=1971-03-11T08:17:00&token=secret-token"
        with self.assertRaisesRegex(ValueError, "^INVALID_TIMEZONE$") as raised:
            local_to_utc("2026-01-01T08:30:00", raw_timezone)
        self.assert_sanitized_timezone_error(raised.exception, raw_timezone, ["1971-03-11", "08:17", "secret-token"])

    def test_invalid_path_like_timezones_are_sanitized(self) -> None:
        raw_timezones = [
            "../1971-03-11T08:17:00-secret",
            "/tmp/1971-03-11T08:17:00-secret",
        ]
        for raw_timezone in raw_timezones:
            with self.subTest(raw_timezone=raw_timezone):
                with self.assertRaisesRegex(ValueError, "^INVALID_TIMEZONE$") as raised:
                    local_to_utc("2026-01-01T08:30:00", raw_timezone)
                self.assert_sanitized_timezone_error(raised.exception, raw_timezone, ["1971-03-11", "08:17", "secret"])

    def test_malformed_datetime_local_error_is_sanitized(self) -> None:
        raw_datetime = "1990-05-12Tbirth-secret"
        with self.assertRaisesRegex(ValueError, "INVALID_DATETIME_LOCAL") as raised:
            AstroCoreService().calculate_natal_chart(replace(bangkok_request(), datetime_local=raw_datetime))
        self.assertNotIn(raw_datetime, str(raised.exception))
        self.assertNotIn("birth-secret", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)

    def test_malformed_datetime_local_without_year_prefix_is_sanitized(self) -> None:
        raw_datetime = "secret-05-12T08:30:00"
        with self.assertRaisesRegex(ValueError, "INVALID_DATETIME_LOCAL") as raised:
            AstroCoreService().calculate_natal_chart(replace(bangkok_request(), datetime_local=raw_datetime))
        self.assertNotIn(raw_datetime, str(raised.exception))
        self.assertNotIn("secr", str(raised.exception))
        self.assertNotIn("secret", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)


    def test_datetime_local_fractional_seconds_are_rejected_without_raw_input(self) -> None:
        raw_datetime = "1971-03-11T08:17:00.500"
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_SUBSECOND_DATETIME") as raised:
            AstroCoreService().calculate_natal_chart(replace(bangkok_request(), datetime_local=raw_datetime))
        self.assertNotIn(raw_datetime, str(raised.exception))
        self.assertNotIn("1971-03-11", str(raised.exception))
        self.assertNotIn("08:17", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)

    def test_datetime_local_fractional_zero_seconds_are_rejected(self) -> None:
        raw_datetime = "1971-03-11T08:17:00.000"
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_SUBSECOND_DATETIME") as raised:
            AstroCoreService().calculate_natal_chart(replace(bangkok_request(), datetime_local=raw_datetime))
        self.assertNotIn(raw_datetime, str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)

    def test_unknown_birth_time_still_rejects_fractional_datetime_local_when_birth_date_is_supplied(self) -> None:
        raw_datetime = "1971-03-11T08:17:00.500"
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_SUBSECOND_DATETIME") as raised:
            AstroCoreService().calculate_natal_chart(
                ChartRequest(
                    calculation_profile_code="TH_NIRAYANA_V1",
                    birth_date="1971-03-11",
                    datetime_local=raw_datetime,
                    birth_time_unknown=True,
                    timezone="Asia/Bangkok",
                    latitude=13.7563,
                    longitude=100.5018,
                )
            )
        self.assertNotIn(raw_datetime, str(raised.exception))
        self.assertNotIn("1971-03-11", str(raised.exception))
        self.assertNotIn("08:17:00.500", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)

    def test_birth_time_fractional_seconds_are_rejected_without_raw_input(self) -> None:
        raw_birth_time = "08:17:00.500"
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_SUBSECOND_DATETIME") as raised:
            AstroCoreService().calculate_natal_chart(
                ChartRequest(
                    calculation_profile_code="TH_NIRAYANA_V1",
                    birth_date="1971-03-11",
                    birth_time=raw_birth_time,
                    timezone="Asia/Bangkok",
                    latitude=13.7563,
                    longitude=100.5018,
                )
            )
        self.assertNotIn(raw_birth_time, str(raised.exception))
        self.assertNotIn("1971-03-11", str(raised.exception))
        self.assertNotIn("08:17", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)

    def test_unknown_birth_time_still_rejects_fractional_birth_time_when_birth_date_is_supplied(self) -> None:
        raw_birth_time = "08:17:00.500"
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_SUBSECOND_DATETIME") as raised:
            AstroCoreService().calculate_natal_chart(
                ChartRequest(
                    calculation_profile_code="TH_NIRAYANA_V1",
                    birth_date="1971-03-11",
                    birth_time=raw_birth_time,
                    birth_time_unknown=True,
                    timezone="Asia/Bangkok",
                    latitude=13.7563,
                    longitude=100.5018,
                )
            )
        self.assertNotIn(raw_birth_time, str(raised.exception))
        self.assertNotIn("1971-03-11", str(raised.exception))
        self.assertNotIn("08:17:00.500", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)

    def test_malformed_birth_date_error_is_sanitized(self) -> None:
        raw_birth_date = "1990-birth-secret-12"
        with self.assertRaisesRegex(ValueError, "INVALID_BIRTH_DATE") as raised:
            AstroCoreService().calculate_natal_chart(
                ChartRequest(
                    calculation_profile_code="TH_NIRAYANA_V1",
                    birth_date=raw_birth_date,
                    birth_time="08:30",
                    timezone="Asia/Bangkok",
                    latitude=13.7563,
                    longitude=100.5018,
                )
            )
        self.assertNotIn(raw_birth_date, str(raised.exception))
        self.assertNotIn("birth-secret", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)

    def test_malformed_birth_time_error_is_sanitized(self) -> None:
        raw_birth_time = "08:birth-secret"
        with self.assertRaisesRegex(ValueError, "INVALID_BIRTH_TIME") as raised:
            AstroCoreService().calculate_natal_chart(
                ChartRequest(
                    calculation_profile_code="TH_NIRAYANA_V1",
                    birth_date="1990-05-12",
                    birth_time=raw_birth_time,
                    timezone="Asia/Bangkok",
                    latitude=13.7563,
                    longitude=100.5018,
                )
            )
        self.assertNotIn(raw_birth_time, str(raised.exception))
        self.assertNotIn("birth-secret", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)

    def test_combined_birth_date_time_parse_does_not_leak_raw_values(self) -> None:
        raw_birth_date = "1990-05-12"
        raw_birth_time = "08:raw-secret"
        with self.assertRaisesRegex(ValueError, "INVALID_BIRTH_TIME") as raised:
            AstroCoreService().calculate_natal_chart(
                ChartRequest(
                    calculation_profile_code="TH_NIRAYANA_V1",
                    birth_date=raw_birth_date,
                    birth_time=raw_birth_time,
                    timezone="Asia/Bangkok",
                    latitude=13.7563,
                    longitude=100.5018,
                )
            )
        self.assertNotIn(raw_birth_date, str(raised.exception))
        self.assertNotIn(raw_birth_time, str(raised.exception))
        self.assertNotIn("raw-secret", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)

    def test_valid_birth_date_and_time_still_parse_correctly(self) -> None:
        snapshot = AstroCoreService().calculate_natal_chart(
            ChartRequest(
                calculation_profile_code="TH_NIRAYANA_V1",
                birth_date="1990-05-12",
                birth_time="08:30:15",
                timezone="Asia/Bangkok",
                latitude=13.7563,
                longitude=100.5018,
            )
        )
        self.assertEqual(snapshot.datetime_local, "1990-05-12T08:30:15")
        self.assertEqual(snapshot.datetime_utc, "1990-05-12T01:30:15Z")

    def test_natal_chart_is_json_serializable_and_has_lagna_houses(self) -> None:
        snapshot = AstroCoreService().calculate_natal_chart(bangkok_request())
        encoded = json.dumps(snapshot.to_json_dict(), sort_keys=True)
        self.assertIn("calculation_hash", encoded)
        self.assertEqual(snapshot.datetime_local, "1990-05-12T08:30:00")
        self.assertEqual(snapshot.calculation_profile.code, "TH_NIRAYANA_V1")
        self.assertEqual(snapshot.ayanamsa_deg, snapshot.ayanamsha.value_deg)
        self.assertIsNotNone(snapshot.houses.ascendant_deg)
        self.assertEqual(len(snapshot.houses.cusps_deg), 12)
        self.assertEqual(snapshot.angles.lagna_deg, snapshot.houses.ascendant_deg)
        assert snapshot.houses.ascendant_deg is not None
        self.assertAlmostEqual(snapshot.angles.descendant_deg or 0, (snapshot.houses.ascendant_deg + 180) % 360, places=8)
        self.assertIn("lagna", snapshot.derived_points)
        self.assertEqual(snapshot.metadata["zodiac_type"], "sidereal")
        self.assertEqual(snapshot.metadata["house_system"], "whole_sign")
        self.assertEqual(snapshot.houses.system, snapshot.calculation_profile.house_system)
        self.assertTrue(all(planet.house_number is not None for planet in snapshot.planets.values()))
        self.assertEqual(snapshot.ayanamsha.name, "lahiri")

    def test_birth_date_input_shape_resolves_datetime_local(self) -> None:
        snapshot = AstroCoreService().calculate_natal_chart(
            ChartRequest(
                calculation_profile_code="TH_NIRAYANA_V1",
                birth_date="1990-05-12",
                birth_time="08:30",
                timezone="Asia/Bangkok",
                latitude=13.7563,
                longitude=100.5018,
                elevation_m=0,
            )
        )
        self.assertEqual(snapshot.datetime_local, "1990-05-12T08:30:00")
        self.assertEqual(snapshot.datetime_utc, "1990-05-12T01:30:00Z")
        self.assertIn("uranus", snapshot.planets)
        self.assertIn("neptune", snapshot.planets)
        self.assertIn("pluto", snapshot.planets)
        self.assertEqual(snapshot.planets["sun"].sidereal_longitude_deg, snapshot.planets["sun"].longitude_deg)
        self.assertEqual(snapshot.planets["sun"].sign_name_th, "สิงห์")
        self.assertIsNotNone(snapshot.planets["sun"].house_number)

    def test_natal_planets_are_present_and_sidereal_longitude_matches_ayanamsa(self) -> None:
        snapshot = AstroCoreService().calculate_natal_chart(bangkok_request())
        expected_planets = {
            "sun",
            "moon",
            "mercury",
            "venus",
            "mars",
            "jupiter",
            "saturn",
            "uranus",
            "neptune",
            "pluto",
            "rahu",
            "ketu",
        }
        self.assertEqual(set(snapshot.planets), expected_planets)
        for planet in snapshot.planets.values():
            self.assertIsNotNone(planet.ayanamsa_deg)
            assert planet.ayanamsa_deg is not None
            self.assertAlmostEqual(
                planet.sidereal_longitude_deg,
                normalize_deg(planet.tropical_longitude_deg - planet.ayanamsa_deg),
                places=6,
            )

    def test_public_chart_snapshot_shape_includes_nested_engine_datetime_location_and_zodiac(self) -> None:
        snapshot = AstroCoreService(config=AstroRuntimeConfig(swisseph_license_mode="professional", ephemeris_path="/ephe")).calculate_natal_chart(
            ChartRequest(
                calculation_profile_code="TH_NIRAYANA_MOCK_V1",
                birth_date="1971-03-11",
                birth_time="08:17",
                timezone="Asia/Bangkok",
                latitude=13.7563,
                longitude=100.5018,
                elevation_m=0,
            )
        )
        public = snapshot.to_json_dict()
        engine = public["engine"]
        datetime_info = public["datetime"]
        location = public["location"]
        zodiac = public["zodiac"]
        assert isinstance(engine, dict)
        assert isinstance(datetime_info, dict)
        assert isinstance(location, dict)
        assert isinstance(zodiac, dict)
        self.assertEqual(public["chart_type"], "natal")
        self.assertEqual(public["calculation_profile_code"], "TH_NIRAYANA_MOCK_V1")
        self.assertEqual(engine["name"], "mock")
        self.assertEqual(engine["license_mode"], "professional")
        self.assertEqual(engine["ephemeris_path_configured"], True)
        self.assertEqual(engine["ephemeris_fingerprint"], snapshot.ephemeris_fingerprint)
        self.assertEqual(public["engine_name"], "mock")
        self.assertEqual(datetime_info["local"], "1971-03-11T08:17:00+07:00")
        self.assertEqual(datetime_info["utc"], "1971-03-11T01:17:00Z")
        self.assertEqual(datetime_info["timezone"], "Asia/Bangkok")
        self.assertEqual(location["latitude"], 13.7563)
        self.assertEqual(location["longitude"], 100.5018)
        self.assertEqual(location["elevation_m"], 0)
        self.assertEqual(zodiac["type"], "sidereal")
        self.assertEqual(zodiac["ayanamsa_code"], "LAHIRI")
        self.assertEqual(zodiac["ayanamsa_deg"], snapshot.ayanamsa_deg)

    def test_unknown_birth_time_warns_and_marks_houses_unreliable(self) -> None:
        snapshot = AstroCoreService().calculate_natal_chart(bangkok_request(birth_time_unknown=True))
        self.assertEqual(snapshot.houses.ascendant_deg, None)
        self.assertEqual(snapshot.houses.reliable, False)
        warning_codes = [warning.code for warning in snapshot.warnings]
        self.assertIn("UNKNOWN_BIRTH_TIME", warning_codes)
        self.assertIn("UNKNOWN_BIRTH_TIME_USED_NOON_FALLBACK", warning_codes)
        self.assertIn("FAST_PLANET_POSITIONS_APPROXIMATE", warning_codes)
        self.assertIn("UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE", warning_codes)
        self.assertEqual(snapshot.angles.reliable, False)
        self.assertEqual(snapshot.derived_points, {})
        self.assertTrue(all(planet.house_number is None for planet in snapshot.planets.values()))


    def test_mock_engine_rejects_swisseph_specific_profile(self) -> None:
        with self.assertRaisesRegex(ValueError, "ASTRO_PROFILE_ENGINE_MISMATCH"):
            AstroCoreService().calculate_natal_chart(bangkok_request("TH_NIRAYANA_SWISSEPH_V1"))

    def test_mock_engine_accepts_mock_specific_profile_without_swisseph_metadata(self) -> None:
        snapshot = AstroCoreService().calculate_natal_chart(bangkok_request("TH_NIRAYANA_MOCK_V1"))
        self.assertEqual(snapshot.engine, "mock")
        self.assertEqual(snapshot.engine_info.name, "mock")
        self.assertEqual(snapshot.ephemeris_source, "deterministic-mock")
        self.assertEqual(snapshot.calculation_profile_code, "TH_NIRAYANA_MOCK_V1")
        self.assertNotEqual(snapshot.engine, "swisseph")
        self.assertNotIn("swiss-ephemeris", snapshot.ephemeris_source)

    def test_swisseph_specific_profile_requires_swisseph_license_and_path_guards(self) -> None:
        with self.assertRaisesRegex(PermissionError, "LICENSE_MODE_NOT_PRODUCTION_READY|EPHEMERIS_FILE_MISSING"):
            create_service(AstroRuntimeConfig(engine="swisseph", runtime_env="test", swisseph_license_mode="none", ephemeris_path=None))

        fake = FakeSwe()
        with tempfile.TemporaryDirectory() as temp_dir:
            (Path(temp_dir) / "sepl_18.se1").write_bytes(b"fixture")
            config = AstroRuntimeConfig(engine="swisseph", runtime_env="test", swisseph_license_mode="free", ephemeris_path=temp_dir)
            engine = SwissEphemerisEngine(config, swe_module=fake)
            snapshot = AstroCoreService(engine=engine, config=config).calculate_natal_chart(bangkok_request("TH_NIRAYANA_SWISSEPH_V1"))
        self.assertEqual(snapshot.engine, "swisseph")
        self.assertEqual(snapshot.engine_info.name, "swisseph")
        self.assertEqual(snapshot.calculation_profile_code, "TH_NIRAYANA_SWISSEPH_V1")

    def test_swisseph_engine_rejects_mock_specific_profile(self) -> None:
        fake = FakeSwe()
        with tempfile.TemporaryDirectory() as temp_dir:
            (Path(temp_dir) / "sepl_18.se1").write_bytes(b"fixture")
            config = AstroRuntimeConfig(engine="swisseph", runtime_env="test", swisseph_license_mode="free", ephemeris_path=temp_dir)
            engine = SwissEphemerisEngine(config, swe_module=fake)
            with self.assertRaisesRegex(ValueError, "ASTRO_PROFILE_ENGINE_MISMATCH"):
                AstroCoreService(engine=engine, config=config).calculate_natal_chart(bangkok_request("TH_NIRAYANA_MOCK_V1"))

    def test_unknown_birth_time_with_datetime_local_uses_noon_not_midnight(self) -> None:
        service = AstroCoreService()
        midnight = service.calculate_natal_chart(replace(bangkok_request(birth_time_unknown=True), datetime_local="1990-05-12T00:00:00"))
        noon = service.calculate_natal_chart(replace(bangkok_request(birth_time_unknown=True), datetime_local="1990-05-12T12:00:00"))
        self.assertEqual(midnight.datetime_local, "1990-05-12T12:00:00")
        self.assertEqual(midnight.datetime_utc, "1990-05-12T05:00:00Z")
        self.assertEqual(midnight.calculation_hash, noon.calculation_hash)
        warning_codes = {warning.code for warning in midnight.warnings}
        self.assertIn("UNKNOWN_BIRTH_TIME", warning_codes)
        self.assertIn("UNKNOWN_BIRTH_TIME_USED_NOON_FALLBACK", warning_codes)
        self.assertIn("FAST_PLANET_POSITIONS_APPROXIMATE", warning_codes)

    def test_unknown_birth_time_with_birth_date_and_no_subsecond_fields_uses_noon_fallback(self) -> None:
        snapshot = AstroCoreService().calculate_natal_chart(
            ChartRequest(
                calculation_profile_code="TH_NIRAYANA_V1",
                birth_date="1971-03-11",
                birth_time_unknown=True,
                timezone="Asia/Bangkok",
                latitude=13.7563,
                longitude=100.5018,
            )
        )
        self.assertEqual(snapshot.datetime_local, "1971-03-11T12:00:00")
        self.assertEqual(snapshot.datetime_utc, "1971-03-11T05:00:00Z")
        warning_codes = {warning.code for warning in snapshot.warnings}
        self.assertIn("UNKNOWN_BIRTH_TIME", warning_codes)
        self.assertIn("UNKNOWN_BIRTH_TIME_USED_NOON_FALLBACK", warning_codes)

    def test_unknown_birth_time_ignores_any_supplied_clock_time_and_hash_is_stable(self) -> None:
        service = AstroCoreService()
        early = service.calculate_natal_chart(replace(bangkok_request(birth_time_unknown=True), datetime_local="1990-05-12T04:15:00"))
        late = service.calculate_natal_chart(replace(bangkok_request(birth_time_unknown=True), datetime_local="1990-05-12T23:45:00"))
        self.assertEqual(early.datetime_local, "1990-05-12T12:00:00")
        self.assertEqual(late.datetime_local, "1990-05-12T12:00:00")
        self.assertEqual(early.calculation_hash, late.calculation_hash)
        self.assertEqual(early.planets["moon"].longitude_deg, late.planets["moon"].longitude_deg)

    def test_known_birth_time_still_uses_exact_datetime_local(self) -> None:
        snapshot = AstroCoreService().calculate_natal_chart(replace(bangkok_request(), datetime_local="1990-05-12T04:15:00", birth_time_unknown=False))
        self.assertEqual(snapshot.datetime_local, "1990-05-12T04:15:00")
        self.assertEqual(snapshot.datetime_utc, "1990-05-11T21:15:00Z")

    def test_valid_datetime_local_still_derives_year_for_supported_range(self) -> None:
        snapshot = AstroCoreService().calculate_natal_chart(replace(bangkok_request(), datetime_local="1900-01-01T00:00:00"))
        self.assertEqual(snapshot.datetime_local, "1900-01-01T00:00:00")
        warning_codes = {warning.code for warning in snapshot.warnings}
        self.assertNotIn("UNSUPPORTED_DATE_RANGE", warning_codes)

    def test_unsupported_date_range_warning_still_works_after_datetime_parse(self) -> None:
        snapshot = AstroCoreService().calculate_natal_chart(replace(bangkok_request(), datetime_local="2101-01-01T00:00:00"))
        warning_codes = {warning.code for warning in snapshot.warnings}
        self.assertIn("UNSUPPORTED_DATE_RANGE", warning_codes)

    def test_changing_birth_time_or_location_changes_ascendant(self) -> None:
        service = AstroCoreService()
        base = service.calculate_natal_chart(bangkok_request())
        later_time = service.calculate_natal_chart(replace(bangkok_request(), datetime_local="1990-05-12T10:30:00"))
        chiang_mai = service.calculate_natal_chart(replace(bangkok_request(), latitude=18.7883, longitude=98.9853))
        self.assertIsNotNone(base.houses.ascendant_deg)
        self.assertNotEqual(base.houses.ascendant_deg, later_time.houses.ascendant_deg)
        self.assertNotEqual(base.houses.ascendant_deg, chiang_mai.houses.ascendant_deg)

    def test_location_and_date_warnings_are_reported(self) -> None:
        snapshot = AstroCoreService().calculate_natal_chart(
            ChartRequest(
                calculation_profile_code="TH_NIRAYANA_V1",
                birth_date="1800-01-01",
                birth_time="08:30",
                timezone="Asia/Bangkok",
                latitude=0,
                longitude=0,
            )
        )
        warning_codes = {warning.code for warning in snapshot.warnings}
        self.assertIn("MISSING_LOCATION", warning_codes)
        self.assertIn("UNSUPPORTED_DATE_RANGE", warning_codes)
        self.assertFalse(snapshot.houses.reliable)
        self.assertIsNone(snapshot.houses.ascendant_deg)
        self.assertEqual(snapshot.houses.cusps_deg, [])
        self.assertTrue(all(planet.house_number is None for planet in snapshot.planets.values()))

    def test_calculation_hash_is_stable_and_profile_sensitive(self) -> None:
        service = AstroCoreService()
        first = service.calculate_natal_chart(bangkok_request())
        second = service.calculate_natal_chart(bangkok_request())
        simple = service.calculate_natal_chart(bangkok_request("TH_SIMPLE_RASI_V1"))
        self.assertEqual(first.calculation_hash, second.calculation_hash)
        self.assertIs(first, second)
        self.assertNotEqual(first.calculation_hash, simple.calculation_hash)

    def test_equivalent_datetime_local_formats_have_same_calculation_hash(self) -> None:
        hashes = {
            AstroCoreService()
            .calculate_natal_chart(replace(bangkok_request(), datetime_local=datetime_local))
            .calculation_hash
            for datetime_local in (
                "1971-03-11T08:17",
                "1971-03-11T08:17:00",
                "1971-03-11 08:17:00",
            )
        }
        self.assertEqual(len(hashes), 1)


    def test_equivalent_second_precision_datetime_formats_are_canonicalized(self) -> None:
        snapshots = [
            AstroCoreService().calculate_natal_chart(replace(bangkok_request(), datetime_local=datetime_local))
            for datetime_local in (
                "1971-03-11T08:17",
                "1971-03-11T08:17:00",
                "1971-03-11 08:17:00",
            )
        ]
        self.assertEqual({snapshot.datetime_local for snapshot in snapshots}, {"1971-03-11T08:17:00"})
        self.assertEqual({snapshot.datetime.local for snapshot in snapshots}, {"1971-03-11T08:17:00+07:00"})
        self.assertEqual(len({snapshot.calculation_hash for snapshot in snapshots}), 1)

    def test_equivalent_datetime_local_formats_have_same_snapshot_positions(self) -> None:
        snapshots = [
            AstroCoreService().calculate_natal_chart(replace(bangkok_request(), datetime_local=datetime_local))
            for datetime_local in (
                "1971-03-11T08:17",
                "1971-03-11T08:17:00",
                "1971-03-11 08:17:00",
            )
        ]

        def position_payload(snapshot: ChartSnapshot) -> dict[str, object]:
            return {
                "julian_day_ut": snapshot.julian_day_ut,
                "planets": {
                    name: (
                        planet.tropical_longitude_deg,
                        planet.sidereal_longitude_deg,
                        planet.longitude_deg,
                        planet.house_number,
                    )
                    for name, planet in sorted(snapshot.planets.items())
                },
                "houses": (snapshot.houses.ascendant_deg, tuple(snapshot.houses.cusps_deg)),
                "angles": (
                    snapshot.angles.lagna_deg,
                    snapshot.angles.descendant_deg,
                    snapshot.angles.mc_deg,
                    snapshot.angles.ic_deg,
                ),
            }

        self.assertEqual(position_payload(snapshots[0]), position_payload(snapshots[1]))
        self.assertEqual(position_payload(snapshots[0]), position_payload(snapshots[2]))

    def test_different_datetime_local_times_have_different_calculation_hashes(self) -> None:
        first = AstroCoreService().calculate_natal_chart(
            replace(bangkok_request(), datetime_local="1971-03-11T08:17:00")
        )
        second = AstroCoreService().calculate_natal_chart(
            replace(bangkok_request(), datetime_local="1971-03-11T08:18:00")
        )
        self.assertNotEqual(first.calculation_hash, second.calculation_hash)

    def test_malformed_datetime_local_hash_normalization_error_is_sanitized(self) -> None:
        raw_datetime = "1971-03-11T08:birth-secret"
        with self.assertRaisesRegex(ValueError, "INVALID_DATETIME_LOCAL") as raised:
            AstroCoreService().calculate_natal_chart(replace(bangkok_request(), datetime_local=raw_datetime))
        self.assertNotIn(raw_datetime, str(raised.exception))
        self.assertNotIn("birth-secret", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)

    def test_sign_boundary_and_retrograde_flags(self) -> None:
        self.assertEqual(sign_index(29.9999), 0)
        self.assertEqual(sign_index(30.0), 1)
        self.assertEqual(sign_index(359.9999), 11)
        snapshot = AstroCoreService().calculate_natal_chart(bangkok_request())
        self.assertEqual(snapshot.planets["rahu"].retrograde, True)
        self.assertAlmostEqual((snapshot.planets["rahu"].sidereal_longitude_deg + 180) % 360, snapshot.planets["ketu"].sidereal_longitude_deg, places=6)
        self.assertAlmostEqual((snapshot.planets["rahu"].tropical_longitude_deg + 180) % 360, snapshot.planets["ketu"].tropical_longitude_deg, places=6)

    def test_transit_to_natal_comparison_is_deterministic(self) -> None:
        service = AstroCoreService()
        comparison = service.calculate_transit_comparison(
            TransitRequest(natal=bangkok_request(), transit_datetime_local="2026-05-06T12:00:00", transit_timezone="Asia/Bangkok")
        )
        second = service.calculate_transit_comparison(
            TransitRequest(natal=bangkok_request(), transit_datetime_local="2026-05-06T12:00:00", transit_timezone="Asia/Bangkok")
        )
        self.assertEqual(comparison.calculation_hash, second.calculation_hash)
        self.assertEqual(comparison.natal.calculation_hash, second.natal.calculation_hash)
        self.assertGreaterEqual(len(comparison.transit_to_natal_aspects), 1)

    def test_snapshot_based_transit_to_natal_is_deterministic_and_structural(self) -> None:
        service = AstroCoreService()
        natal = service.calculate_natal_chart(bangkok_request())
        request = TransitSnapshotRequest(
            natal_chart_snapshot=natal,
            transit_datetime_utc="2026-05-06T05:00:00Z",
            calculation_profile_code="TH_NIRAYANA_V1",
            transit_location=TransitLocation(latitude=13.7563, longitude=100.5018),
            orb_settings={"conjunction": 180, "opposition": 180, "square": 180, "trine": 180, "sextile": 180},
        )
        first = service.calculate_transit_to_natal(request)
        second = service.calculate_transit_to_natal(request)
        encoded = json.dumps(first.to_json_dict(), ensure_ascii=False, sort_keys=True)
        self.assertEqual(first.calculation_hash, second.calculation_hash)
        self.assertEqual(first.transit_chart_snapshot.calculation_hash, second.transit_chart_snapshot.calculation_hash)
        self.assertEqual(first.transit_planets["sun"].longitude_deg, second.transit_planets["sun"].longitude_deg)
        self.assertEqual(first.natal_planets["sun"].longitude_deg, natal.planets["sun"].longitude_deg)
        self.assertGreater(len(first.transit_to_natal_hits), 0)
        self.assertEqual(first.scoring_ready["hit_count"], len(first.transit_to_natal_hits))
        self.assertNotIn("prediction", encoded.lower())
        self.assertNotIn("interpretation_text", encoded)
        self.assertNotIn("prose", encoded.lower())
        self.assertTrue(all(" " not in hit.interpretation_key for hit in first.transit_to_natal_hits))

    def test_transit_datetime_changes_positions_and_hash(self) -> None:
        service = AstroCoreService()
        natal = service.calculate_natal_chart(bangkok_request())
        base = TransitSnapshotRequest(
            natal_chart_snapshot=natal,
            transit_datetime_utc="2026-05-06T05:00:00Z",
            calculation_profile_code="TH_NIRAYANA_V1",
            transit_location=TransitLocation(latitude=13.7563, longitude=100.5018),
        )
        later = replace(base, transit_datetime_utc="2026-05-07T05:00:00Z")
        first = service.calculate_transit_to_natal(base)
        second = service.calculate_transit_to_natal(later)
        self.assertNotEqual(first.transit_chart_snapshot.calculation_hash, second.transit_chart_snapshot.calculation_hash)
        self.assertNotEqual(first.calculation_hash, second.calculation_hash)
        self.assertNotEqual(first.transit_planets["moon"].longitude_deg, second.transit_planets["moon"].longitude_deg)

    def test_transit_datetime_requires_utc_timestamp(self) -> None:
        service = AstroCoreService()
        natal = service.calculate_natal_chart(bangkok_request())
        with self.assertRaisesRegex(ValueError, "UTC"):
            service.calculate_transit_to_natal(
                TransitSnapshotRequest(
                    natal_chart_snapshot=natal,
                    transit_datetime_utc="2026-05-06T12:00:00+07:00",
                    calculation_profile_code="TH_NIRAYANA_V1",
                )
            )

    def test_transit_datetime_utc_fractional_seconds_are_rejected_without_raw_input(self) -> None:
        raw_transit = "2026-05-06T05:00:00.999Z"
        service = AstroCoreService()
        natal = service.calculate_natal_chart(bangkok_request())
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_SUBSECOND_DATETIME") as raised:
            service.calculate_transit_to_natal(
                TransitSnapshotRequest(
                    natal_chart_snapshot=natal,
                    transit_datetime_utc=raw_transit,
                    calculation_profile_code="TH_NIRAYANA_V1",
                    transit_location=TransitLocation(latitude=13.7563, longitude=100.5018),
                )
            )
        self.assertNotIn(raw_transit, str(raised.exception))
        self.assertNotIn("05:00:00.999", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)

    def test_transit_rejects_fractional_snapshot_datetime_before_use_without_raw_input(self) -> None:
        raw_datetime = "1990-05-12T08:30:00.500"
        service = AstroCoreService()
        natal = service.calculate_natal_chart(bangkok_request())
        invalid_snapshot = replace(natal, datetime=replace(natal.datetime, local=f"{raw_datetime}+07:00"))

        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_SUBSECOND_DATETIME") as raised:
            service.calculate_transit_to_natal(
                TransitSnapshotRequest(
                    natal_chart_snapshot=invalid_snapshot,
                    transit_datetime_utc="2026-05-06T05:00:00Z",
                    calculation_profile_code="TH_NIRAYANA_V1",
                    transit_location=TransitLocation(latitude=13.7563, longitude=100.5018),
                )
            )

        self.assertNotIn(raw_datetime, str(raised.exception))
        self.assertNotIn("1990-05-12", str(raised.exception))
        self.assertNotIn("08:30:00.500", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)

    def test_transit_location_invalid_timezones_are_sanitized(self) -> None:
        raw_timezones = [
            "Not/AZone",
            "../1971-03-11T08:17:00-secret",
            "/tmp/1971-03-11T08:17:00-secret",
        ]
        service = AstroCoreService()
        natal = service.calculate_natal_chart(bangkok_request())
        for raw_timezone in raw_timezones:
            with self.subTest(raw_timezone=raw_timezone):
                with self.assertRaisesRegex(ValueError, "^INVALID_TIMEZONE$") as raised:
                    service.calculate_transit_to_natal(
                        TransitSnapshotRequest(
                            natal_chart_snapshot=natal,
                            transit_datetime_utc="2026-05-06T05:00:00Z",
                            calculation_profile_code="TH_NIRAYANA_V1",
                            transit_location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone=raw_timezone),
                        )
                    )
                self.assert_sanitized_timezone_error(raised.exception, raw_timezone, ["1971-03-11", "08:17", "secret"])

    def test_snapshot_datetime_invalid_timezones_are_sanitized(self) -> None:
        raw_timezones = [
            "Not/AZone?token=secret",
            "../1971-03-11T08:17:00-secret",
            "/tmp/1971-03-11T08:17:00-secret",
        ]
        service = AstroCoreService()
        natal = service.calculate_natal_chart(bangkok_request())
        for raw_timezone in raw_timezones:
            invalid_snapshot = replace(natal, datetime=replace(natal.datetime, timezone=raw_timezone))
            with self.subTest(raw_timezone=raw_timezone):
                with self.assertRaisesRegex(ValueError, "^INVALID_TIMEZONE$") as raised:
                    service.calculate_transit_to_natal(
                        TransitSnapshotRequest(
                            natal_chart_snapshot=invalid_snapshot,
                            transit_datetime_utc="2026-05-06T05:00:00Z",
                            calculation_profile_code="TH_NIRAYANA_V1",
                            transit_location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                        )
                    )
                self.assert_sanitized_timezone_error(raised.exception, raw_timezone, ["1971-03-11", "08:17", "token", "secret", "../", "/tmp"])

    def test_snapshot_bangkok_local_and_matching_utc_still_work(self) -> None:
        service = AstroCoreService()
        natal = service.calculate_natal_chart(bangkok_request())

        result = service.calculate_transit_to_natal(
            TransitSnapshotRequest(
                natal_chart_snapshot=natal,
                transit_datetime_utc="2026-05-06T05:00:00Z",
                calculation_profile_code="TH_NIRAYANA_V1",
                transit_location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
            )
        )

        self.assertEqual(result.natal_chart_snapshot.datetime_local, "1990-05-12T08:30:00")
        self.assertEqual(result.natal_chart_snapshot.datetime_utc, "1990-05-12T01:30:00Z")

    def test_snapshot_utc_timezone_local_and_matching_utc_still_work(self) -> None:
        service = AstroCoreService()
        natal = service.calculate_natal_chart(
            ChartRequest(
                calculation_profile_code="TH_NIRAYANA_V1",
                datetime_local="1990-05-12T08:30:00",
                timezone="UTC",
                latitude=13.7563,
                longitude=100.5018,
                elevation_m=0,
                time_accuracy_minutes=5,
            )
        )

        result = service.calculate_transit_to_natal(
            TransitSnapshotRequest(
                natal_chart_snapshot=natal,
                transit_datetime_utc="2026-05-06T05:00:00Z",
                calculation_profile_code="TH_NIRAYANA_V1",
                transit_location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="UTC"),
            )
        )

        self.assertEqual(result.natal_chart_snapshot.datetime_local, "1990-05-12T08:30:00")
        self.assertEqual(result.natal_chart_snapshot.datetime_utc, "1990-05-12T08:30:00Z")

    def test_snapshot_local_timezone_utc_mismatch_is_sanitized(self) -> None:
        service = AstroCoreService()
        natal = service.calculate_natal_chart(bangkok_request())
        invalid_snapshot = replace(natal, datetime_utc="2000-01-01T00:00:00Z", datetime=replace(natal.datetime, utc="2000-01-01T00:00:00Z"))

        with self.assertRaisesRegex(ValueError, "^INVALID_DATETIME$") as raised:
            service.calculate_transit_to_natal(
                TransitSnapshotRequest(
                    natal_chart_snapshot=invalid_snapshot,
                    transit_datetime_utc="2026-05-06T05:00:00Z",
                    calculation_profile_code="TH_NIRAYANA_V1",
                    transit_location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                )
            )

        self.assert_sanitized_datetime_error(raised.exception, ["1990-05-12", "08:30", "2000-01-01", "Asia/Bangkok"])

    def test_snapshot_top_level_local_mismatch_is_sanitized(self) -> None:
        service = AstroCoreService()
        natal = service.calculate_natal_chart(bangkok_request())
        invalid_snapshot = replace(natal, datetime_local="1990-05-12T09:30:00")

        with self.assertRaisesRegex(ValueError, "^INVALID_DATETIME$") as raised:
            service.calculate_transit_to_natal(
                TransitSnapshotRequest(
                    natal_chart_snapshot=invalid_snapshot,
                    transit_datetime_utc="2026-05-06T05:00:00Z",
                    calculation_profile_code="TH_NIRAYANA_V1",
                    transit_location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                )
            )

        self.assert_sanitized_datetime_error(raised.exception, ["1990-05-12", "08:30", "09:30"])

    def test_snapshot_top_level_utc_mismatch_is_sanitized(self) -> None:
        service = AstroCoreService()
        natal = service.calculate_natal_chart(bangkok_request())
        invalid_snapshot = replace(natal, datetime_utc="1990-05-12T02:30:00Z")

        with self.assertRaisesRegex(ValueError, "^INVALID_DATETIME$") as raised:
            service.calculate_transit_to_natal(
                TransitSnapshotRequest(
                    natal_chart_snapshot=invalid_snapshot,
                    transit_datetime_utc="2026-05-06T05:00:00Z",
                    calculation_profile_code="TH_NIRAYANA_V1",
                    transit_location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                )
            )

        self.assert_sanitized_datetime_error(raised.exception, ["1990-05-12", "01:30", "02:30"])

    def test_valid_second_precision_transit_datetime_utc_still_works(self) -> None:
        service = AstroCoreService()
        natal = service.calculate_natal_chart(bangkok_request())
        result = service.calculate_transit_to_natal(
            TransitSnapshotRequest(
                natal_chart_snapshot=natal,
                transit_datetime_utc="2026-05-06T05:00:00Z",
                calculation_profile_code="TH_NIRAYANA_V1",
                transit_location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
            )
        )
        self.assertEqual(result.transit_chart_snapshot.datetime_utc, "2026-05-06T05:00:00Z")
        self.assertGreaterEqual(len(result.transit_planets), 1)

    def test_transit_aspects_respect_configured_orbs(self) -> None:
        service = AstroCoreService()
        natal = service.calculate_natal_chart(bangkok_request())
        wide = TransitSnapshotRequest(
            natal_chart_snapshot=natal,
            transit_datetime_utc="2026-05-06T05:00:00Z",
            calculation_profile_code="TH_NIRAYANA_V1",
            transit_location=TransitLocation(latitude=13.7563, longitude=100.5018),
            orb_settings={"conjunction": 180, "opposition": 180, "square": 180, "trine": 180, "sextile": 180},
        )
        narrow = replace(wide, orb_settings={"conjunction": 0.000001, "opposition": 0.000001, "square": 0.000001, "trine": 0.000001, "sextile": 0.000001})
        wide_result = service.calculate_transit_to_natal(wide)
        narrow_result = service.calculate_transit_to_natal(narrow)
        self.assertGreater(len(wide_result.aspects), 0)
        self.assertGreater(len(wide_result.transit_to_natal_hits), 0)
        self.assertEqual(narrow_result.aspects, [])
        self.assertEqual(narrow_result.transit_to_natal_hits, [])

    def test_solar_return_and_hourly_timing_feature_flags(self) -> None:
        disabled = AstroCoreService(config=AstroRuntimeConfig())
        with self.assertRaises(PermissionError):
            disabled.calculate_solar_return(SolarReturnRequest(natal=bangkok_request(), return_year=2026))
        with self.assertRaises(PermissionError):
            disabled.calculate_hourly_timing(HourlyTimingRequest(natal=bangkok_request(), date_local="2026-05-06", timezone="Asia/Bangkok"))

        enabled = AstroCoreService(config=AstroRuntimeConfig(enable_solar_return=True, enable_hourly_timing=True))
        solar = enabled.calculate_solar_return(SolarReturnRequest(natal=bangkok_request(), return_year=2026))
        hourly = enabled.calculate_hourly_timing(HourlyTimingRequest(natal=bangkok_request(), date_local="2026-05-06", timezone="Asia/Bangkok"))
        self.assertEqual(solar.year, 2026)
        self.assertGreater(len(hourly.windows), 0)
        self.assertTrue(all(1 <= window.score <= 10 for window in hourly.windows))

    def test_hourly_timing_windows_are_generated_for_fixed_date_range(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_hourly_timing=True))
        natal = service.calculate_natal_chart(bangkok_request())
        result = service.calculate_hourly_timing(
            HourlyTimingRequest(
                natal_chart_snapshot=natal,
                start_datetime_local="2026-05-06T09:00:00",
                end_datetime_local="2026-05-06T13:00:00",
                timezone="Asia/Bangkok",
                location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                calculation_profile_code="TH_NIRAYANA_V1",
                enabled_aspect_types=["conjunction", "opposition", "square", "trine", "sextile"],
                orb_thresholds={"conjunction": 180, "opposition": 180, "square": 180, "trine": 180, "sextile": 180},
            )
        )
        encoded = json.dumps(result.to_json_dict(), ensure_ascii=False, sort_keys=True)
        self.assertEqual(result.windows, result.timing_windows)
        self.assertEqual(result.warnings, [])
        self.assertGreater(len(result.timing_windows), 0)
        self.assertTrue(all(window.trigger_type == "transit_to_natal_aspect" for window in result.timing_windows))
        self.assertTrue(all(window.safety_level == "structured_signal_only" for window in result.timing_windows))
        self.assertNotIn("prediction", encoded.lower())
        self.assertNotIn("interpretation_text", encoded)
        self.assertNotIn("prose", encoded.lower())

    def test_hourly_timing_propagates_unknown_time_warnings(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_hourly_timing=True))
        natal = service.calculate_natal_chart(bangkok_request(birth_time_unknown=True))
        result = service.calculate_hourly_timing(
            HourlyTimingRequest(
                natal_chart_snapshot=natal,
                start_datetime_local="2026-05-06T09:00:00",
                end_datetime_local="2026-05-06T13:00:00",
                timezone="Asia/Bangkok",
                location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                calculation_profile_code="TH_NIRAYANA_V1",
                orb_thresholds={"conjunction": 180, "opposition": 180, "square": 180, "trine": 180, "sextile": 180},
            )
        )
        warning_codes = [warning.code for warning in result.warnings]
        self.assertEqual(
            warning_codes,
            [
                "UNKNOWN_BIRTH_TIME",
                "UNKNOWN_BIRTH_TIME_USED_NOON_FALLBACK",
                "FAST_PLANET_POSITIONS_APPROXIMATE",
                "UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE",
            ],
        )
        self.assertGreater(len(result.timing_windows), 0)

    def test_hourly_timing_known_birth_time_has_no_unknown_time_warnings(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_hourly_timing=True))
        natal = service.calculate_natal_chart(bangkok_request())
        result = service.calculate_hourly_timing(
            HourlyTimingRequest(
                natal_chart_snapshot=natal,
                start_datetime_local="2026-05-06T09:00:00",
                end_datetime_local="2026-05-06T13:00:00",
                timezone="Asia/Bangkok",
                location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                calculation_profile_code="TH_NIRAYANA_V1",
                orb_thresholds={"conjunction": 180, "opposition": 180, "square": 180, "trine": 180, "sextile": 180},
            )
        )
        warning_codes = {warning.code for warning in result.warnings}
        self.assertNotIn("UNKNOWN_BIRTH_TIME", warning_codes)
        self.assertNotIn("UNKNOWN_BIRTH_TIME_USED_NOON_FALLBACK", warning_codes)
        self.assertNotIn("FAST_PLANET_POSITIONS_APPROXIMATE", warning_codes)
        self.assertEqual(result.warnings, [])

    def test_hourly_timing_warning_hash_is_deterministic_and_warnings_dedupe(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_hourly_timing=True))
        natal = service.calculate_natal_chart(bangkok_request(birth_time_unknown=True))
        duplicate_warning = WarningMessage(code="UNKNOWN_BIRTH_TIME", message="duplicate should be ignored")
        natal_with_duplicate = replace(natal, warnings=[*natal.warnings, duplicate_warning])
        request = HourlyTimingRequest(
            natal_chart_snapshot=natal_with_duplicate,
            start_datetime_local="2026-05-06T09:00:00",
            end_datetime_local="2026-05-06T13:00:00",
            timezone="Asia/Bangkok",
            location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
            calculation_profile_code="TH_NIRAYANA_V1",
            orb_thresholds={"conjunction": 180, "opposition": 180, "square": 180, "trine": 180, "sextile": 180},
        )
        first = service.calculate_hourly_timing(request)
        second = service.calculate_hourly_timing(request)
        self.assertEqual(first.calculation_hash, second.calculation_hash)
        self.assertEqual([warning.code for warning in first.warnings].count("UNKNOWN_BIRTH_TIME"), 1)
        self.assertEqual(first.to_json_dict(), second.to_json_dict())

    def test_hourly_timing_has_no_duplicate_triggers_and_peak_is_inside_window(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_hourly_timing=True))
        natal = service.calculate_natal_chart(bangkok_request())
        result = service.calculate_hourly_timing(
            HourlyTimingRequest(
                natal_chart_snapshot=natal,
                start_datetime_utc="2026-05-06T00:00:00Z",
                end_datetime_utc="2026-05-06T06:00:00Z",
                timezone="Asia/Bangkok",
                location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                calculation_profile_code="TH_NIRAYANA_V1",
                orb_thresholds={"conjunction": 180, "opposition": 180, "square": 180, "trine": 180, "sextile": 180},
            )
        )
        seen: set[tuple[str, str, str]] = set()
        for window in result.timing_windows:
            key = (window.transit_planet, window.natal_point, window.aspect_type)
            self.assertNotIn(key, seen)
            seen.add(key)
            assert window.peak_datetime_utc is not None
            self.assertLessEqual(window.start_datetime_utc, window.peak_datetime_utc)
            self.assertLessEqual(window.peak_datetime_utc, window.end_datetime_utc)

    def test_hourly_timing_windows_respect_timezone(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_hourly_timing=True))
        natal = service.calculate_natal_chart(bangkok_request())
        result = service.calculate_hourly_timing(
            HourlyTimingRequest(
                natal_chart_snapshot=natal,
                start_datetime_local="2026-05-06T09:00:00",
                end_datetime_local="2026-05-06T10:00:00",
                timezone="Asia/Bangkok",
                location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                calculation_profile_code="TH_NIRAYANA_V1",
                orb_thresholds={"conjunction": 180, "opposition": 180, "square": 180, "trine": 180, "sextile": 180},
            )
        )
        self.assertTrue(all(window.start_datetime_utc == "2026-05-06T02:00:00Z" for window in result.timing_windows))
        self.assertTrue(all(window.local_start == "2026-05-06T09:00:00" for window in result.timing_windows))
        self.assertTrue(all(window.local_end == "2026-05-06T10:00:00" for window in result.timing_windows))

    def test_hourly_timing_unsupported_range_fails_safely(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_hourly_timing=True))
        natal = service.calculate_natal_chart(bangkok_request())
        result = service.calculate_hourly_timing(
            HourlyTimingRequest(
                natal_chart_snapshot=natal,
                start_datetime_utc="2026-05-01T00:00:00Z",
                end_datetime_utc="2026-05-20T00:00:00Z",
                timezone="Asia/Bangkok",
                calculation_profile_code="TH_NIRAYANA_V1",
            )
        )
        self.assertEqual(result.timing_windows, [])
        self.assertEqual(result.windows, [])
        self.assertEqual(result.warnings[0].code, "UNSUPPORTED_TIMING_RANGE")

    def test_hourly_timing_utc_fractional_seconds_are_rejected_without_raw_input(self) -> None:
        raw_start = "2026-05-06T00:00:00.250Z"
        raw_end = "2026-05-06T06:00:00.250Z"
        service = AstroCoreService(config=AstroRuntimeConfig(enable_hourly_timing=True))
        natal = service.calculate_natal_chart(bangkok_request())
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_SUBSECOND_DATETIME") as raised:
            service.calculate_hourly_timing(
                HourlyTimingRequest(
                    natal_chart_snapshot=natal,
                    start_datetime_utc=raw_start,
                    end_datetime_utc=raw_end,
                    timezone="Asia/Bangkok",
                    calculation_profile_code="TH_NIRAYANA_V1",
                )
            )
        self.assertNotIn(raw_start, str(raised.exception))
        self.assertNotIn(raw_end, str(raised.exception))
        self.assertNotIn("00:00:00.250", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)

    def test_hourly_timing_local_range_invalid_timezone_is_sanitized(self) -> None:
        raw_timezone = "../1971-03-11T08:17:00-secret"
        service = AstroCoreService(config=AstroRuntimeConfig(enable_hourly_timing=True))
        natal = service.calculate_natal_chart(bangkok_request())

        with self.assertRaisesRegex(ValueError, "^INVALID_TIMEZONE$") as raised:
            service.calculate_hourly_timing(
                HourlyTimingRequest(
                    natal_chart_snapshot=natal,
                    start_datetime_local="2026-05-06T09:00:00",
                    end_datetime_local="2026-05-06T13:00:00",
                    timezone=raw_timezone,
                    calculation_profile_code="TH_NIRAYANA_V1",
                )
            )

        self.assert_sanitized_timezone_error(raised.exception, raw_timezone, ["1971-03-11", "08:17", "secret"])

    def test_hourly_timing_utc_range_invalid_request_timezone_is_sanitized(self) -> None:
        raw_timezone = "Not/AZone?token=secret"
        service = AstroCoreService(config=AstroRuntimeConfig(enable_hourly_timing=True))
        natal = service.calculate_natal_chart(bangkok_request())

        with self.assertRaisesRegex(ValueError, "^INVALID_TIMEZONE$") as raised:
            service.calculate_hourly_timing(
                HourlyTimingRequest(
                    natal_chart_snapshot=natal,
                    start_datetime_utc="2026-05-06T00:00:00Z",
                    end_datetime_utc="2026-05-06T06:00:00Z",
                    timezone=raw_timezone,
                    location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                    calculation_profile_code="TH_NIRAYANA_V1",
                    enabled_aspect_types=[],
                )
            )

        self.assert_sanitized_timezone_error(raised.exception, raw_timezone, ["Not/AZone", "token", "secret"])

    def test_hourly_timing_utc_range_result_timezone_is_validated_without_hits(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_hourly_timing=True))
        natal = service.calculate_natal_chart(bangkok_request())

        result = service.calculate_hourly_timing(
            HourlyTimingRequest(
                natal_chart_snapshot=natal,
                start_datetime_utc="2026-05-06T00:00:00Z",
                end_datetime_utc="2026-05-06T06:00:00Z",
                timezone="Asia/Bangkok",
                location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                calculation_profile_code="TH_NIRAYANA_V1",
                enabled_aspect_types=[],
            )
        )

        self.assertEqual(result.timezone, "Asia/Bangkok")
        self.assertEqual(result.timing_windows, [])

    def test_hourly_timing_location_invalid_timezone_is_sanitized_for_utc_ranges(self) -> None:
        raw_timezone = "/tmp/1971-03-11T08:17:00-secret"
        service = AstroCoreService(config=AstroRuntimeConfig(enable_hourly_timing=True))
        natal = service.calculate_natal_chart(bangkok_request())

        with self.assertRaisesRegex(ValueError, "^INVALID_TIMEZONE$") as raised:
            service.calculate_hourly_timing(
                HourlyTimingRequest(
                    natal_chart_snapshot=natal,
                    start_datetime_utc="2026-05-06T00:00:00Z",
                    end_datetime_utc="2026-05-06T06:00:00Z",
                    timezone="Asia/Bangkok",
                    location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone=raw_timezone),
                    calculation_profile_code="TH_NIRAYANA_V1",
                )
            )

        self.assert_sanitized_timezone_error(raised.exception, raw_timezone, ["1971-03-11", "08:17", "secret"])

    def test_hourly_timing_rejects_fractional_snapshot_datetime_before_range_handling(self) -> None:
        raw_datetime = "1990-05-12T01:30:00.500Z"
        service = AstroCoreService(config=AstroRuntimeConfig(enable_hourly_timing=True))
        natal = service.calculate_natal_chart(bangkok_request())
        invalid_snapshot = replace(natal, datetime_utc=raw_datetime)

        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_SUBSECOND_DATETIME") as raised:
            service.calculate_hourly_timing(
                HourlyTimingRequest(
                    natal_chart_snapshot=invalid_snapshot,
                    start_datetime_utc="2026-05-01T00:00:00Z",
                    end_datetime_utc="2026-05-20T00:00:00Z",
                    timezone="Asia/Bangkok",
                    calculation_profile_code="TH_NIRAYANA_V1",
                )
            )

        self.assertNotIn(raw_datetime, str(raised.exception))
        self.assertNotIn("1990-05-12", str(raised.exception))
        self.assertNotIn("01:30:00.500", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)

    def test_hourly_timing_rejects_snapshot_local_utc_mismatch(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_hourly_timing=True))
        natal = service.calculate_natal_chart(bangkok_request())
        invalid_snapshot = replace(natal, datetime_utc="2000-01-01T00:00:00Z", datetime=replace(natal.datetime, utc="2000-01-01T00:00:00Z"))

        with self.assertRaisesRegex(ValueError, "^INVALID_DATETIME$") as raised:
            service.calculate_hourly_timing(
                HourlyTimingRequest(
                    natal_chart_snapshot=invalid_snapshot,
                    start_datetime_utc="2026-05-01T00:00:00Z",
                    end_datetime_utc="2026-05-20T00:00:00Z",
                    timezone="Asia/Bangkok",
                    calculation_profile_code="TH_NIRAYANA_V1",
                )
            )

        self.assert_sanitized_datetime_error(raised.exception, ["1990-05-12", "08:30", "2000-01-01", "Asia/Bangkok"])

    def test_hourly_timing_windows_are_deterministic(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_hourly_timing=True))
        natal = service.calculate_natal_chart(bangkok_request())
        request = HourlyTimingRequest(
            natal_chart_snapshot=natal,
            start_datetime_local="2026-05-06T09:00:00",
            end_datetime_local="2026-05-06T13:00:00",
            timezone="Asia/Bangkok",
            location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
            calculation_profile_code="TH_NIRAYANA_V1",
            orb_thresholds={"conjunction": 180, "opposition": 180, "square": 180, "trine": 180, "sextile": 180},
        )
        first = service.calculate_hourly_timing(request)
        second = service.calculate_hourly_timing(request)
        self.assertEqual(first.calculation_hash, second.calculation_hash)
        self.assertEqual(first.to_json_dict(), second.to_json_dict())

    def test_snapshot_based_solar_return_is_deterministic_and_close_to_natal_sun(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_solar_return=True))
        natal = service.calculate_natal_chart(bangkok_request())
        request = SolarReturnRequest(
            natal_chart_snapshot=natal,
            solar_return_year=2026,
            location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
            calculation_profile_code="TH_NIRAYANA_V1",
        )
        first = service.calculate_solar_return(request)
        second = service.calculate_solar_return(request)
        self.assertEqual(first.calculation_hash, second.calculation_hash)
        self.assertEqual(first.solar_return_datetime_utc, second.solar_return_datetime_utc)
        self.assertEqual(first.solar_return_datetime_utc, "2026-05-12T07:15:00Z")
        self.assertEqual(first.solar_return_datetime_local, "2026-05-12T14:15:00")
        self.assertLessEqual(first.delta_arc_seconds, 60)
        self.assertAlmostEqual(first.sun_longitude_at_return, first.natal_sun_longitude_reference, delta=1 / 60)
        self.assertEqual(first.solar_return_chart_snapshot.calculation_hash, first.chart.calculation_hash)
        self.assertEqual(first.warnings, [])

    def test_solar_return_rejects_snapshot_fractional_datetime_local_without_raw_input(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_solar_return=True))
        natal = service.calculate_natal_chart(bangkok_request())
        raw_datetime = "1990-05-12T08:30:00.500"
        invalid_top_level = replace(natal, datetime_local=raw_datetime)
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_SUBSECOND_DATETIME") as raised:
            service.calculate_solar_return(
                SolarReturnRequest(
                    natal_chart_snapshot=invalid_top_level,
                    solar_return_year=2026,
                    location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                    calculation_profile_code="TH_NIRAYANA_V1",
                )
            )
        self.assertNotIn(raw_datetime, str(raised.exception))
        self.assertNotIn("1990-05-12", str(raised.exception))
        self.assertNotIn("08:30:00.500", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)

        invalid_nested = replace(natal, datetime=replace(natal.datetime, local="1990-05-12T08:30:00.500+07:00"))
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_SUBSECOND_DATETIME") as nested_raised:
            service.calculate_solar_return(
                SolarReturnRequest(
                    natal_chart_snapshot=invalid_nested,
                    solar_return_year=2026,
                    location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                    calculation_profile_code="TH_NIRAYANA_V1",
                )
            )
        self.assertNotIn("1990-05-12", str(nested_raised.exception))
        self.assertNotIn("08:30:00.500", str(nested_raised.exception))
        self.assertIsNone(nested_raised.exception.__cause__)

    def test_solar_return_rejects_snapshot_fractional_datetime_utc_without_raw_input(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_solar_return=True))
        natal = service.calculate_natal_chart(bangkok_request())
        raw_datetime = "1990-05-12T01:30:00.500Z"
        invalid_top_level = replace(natal, datetime_utc=raw_datetime)
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_SUBSECOND_DATETIME") as raised:
            service.calculate_solar_return(
                SolarReturnRequest(
                    natal_chart_snapshot=invalid_top_level,
                    solar_return_year=2026,
                    location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                    calculation_profile_code="TH_NIRAYANA_V1",
                )
            )
        self.assertNotIn(raw_datetime, str(raised.exception))
        self.assertNotIn("1990-05-12", str(raised.exception))
        self.assertNotIn("01:30:00.500", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)

        invalid_nested = replace(natal, datetime=replace(natal.datetime, utc=raw_datetime))
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_SUBSECOND_DATETIME") as nested_raised:
            service.calculate_solar_return(
                SolarReturnRequest(
                    natal_chart_snapshot=invalid_nested,
                    solar_return_year=2026,
                    location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                    calculation_profile_code="TH_NIRAYANA_V1",
                )
            )
        self.assertNotIn(raw_datetime, str(nested_raised.exception))
        self.assertNotIn("01:30:00.500", str(nested_raised.exception))
        self.assertIsNone(nested_raised.exception.__cause__)

    def test_solar_return_rejects_snapshot_local_utc_mismatch(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_solar_return=True))
        natal = service.calculate_natal_chart(bangkok_request())
        invalid_snapshot = replace(natal, datetime_utc="2000-01-01T00:00:00Z", datetime=replace(natal.datetime, utc="2000-01-01T00:00:00Z"))

        with self.assertRaisesRegex(ValueError, "^INVALID_DATETIME$") as raised:
            service.calculate_solar_return(
                SolarReturnRequest(
                    natal_chart_snapshot=invalid_snapshot,
                    solar_return_year=2026,
                    location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                    calculation_profile_code="TH_NIRAYANA_V1",
                )
            )

        self.assert_sanitized_datetime_error(raised.exception, ["1990-05-12", "08:30", "2000-01-01", "Asia/Bangkok"])

    def test_solar_return_second_precision_snapshot_datetimes_still_work(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_solar_return=True))
        natal = service.calculate_natal_chart(bangkok_request())
        result = service.calculate_solar_return(
            SolarReturnRequest(
                natal_chart_snapshot=natal,
                solar_return_year=2026,
                location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                calculation_profile_code="TH_NIRAYANA_V1",
            )
        )
        self.assertEqual(result.solar_return_datetime_utc, "2026-05-12T07:15:00Z")
        self.assertLessEqual(result.delta_arc_seconds, 60)
        self.assertEqual(result.warnings, [])

    def test_solar_return_invalid_location_timezone_is_sanitized(self) -> None:
        raw_timezone = "/tmp/1990-05-12T08:30:00-secret"
        service = AstroCoreService(config=AstroRuntimeConfig(enable_solar_return=True))
        natal = service.calculate_natal_chart(bangkok_request())

        with self.assertRaisesRegex(ValueError, "^INVALID_TIMEZONE$") as raised:
            service.calculate_solar_return(
                SolarReturnRequest(
                    natal_chart_snapshot=natal,
                    solar_return_year=2026,
                    location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone=raw_timezone),
                    calculation_profile_code="TH_NIRAYANA_V1",
                )
            )

        self.assert_sanitized_timezone_error(raised.exception, raw_timezone, ["1990-05-12", "08:30", "secret"])

    def test_solar_return_rejects_invalid_snapshot_timezone(self) -> None:
        raw_timezone = "../1990-05-12T08:30:00-secret"
        service = AstroCoreService(config=AstroRuntimeConfig(enable_solar_return=True))
        natal = service.calculate_natal_chart(bangkok_request())
        invalid_snapshot = replace(natal, datetime=replace(natal.datetime, timezone=raw_timezone))

        with self.assertRaisesRegex(ValueError, "^INVALID_TIMEZONE$") as raised:
            service.calculate_solar_return(
                SolarReturnRequest(
                    natal_chart_snapshot=invalid_snapshot,
                    solar_return_year=2026,
                    location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                    calculation_profile_code="TH_NIRAYANA_V1",
                )
            )

        self.assert_sanitized_timezone_error(raised.exception, raw_timezone, ["1990-05-12", "08:30", "secret"])

    def test_solar_return_convergence_failure_is_returned_safely(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_solar_return=True))
        natal = service.calculate_natal_chart(bangkok_request())
        result = service.calculate_solar_return(
            SolarReturnRequest(
                natal_chart_snapshot=natal,
                solar_return_year=2026,
                location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                calculation_profile_code="TH_NIRAYANA_V1",
                max_iterations=0,
            )
        )
        self.assertEqual(result.warnings[0].code, "SOLAR_RETURN_CONVERGENCE_FAILED")
        self.assertNotEqual(result.solar_return_datetime_utc, "")
        self.assertGreaterEqual(result.delta_arc_seconds, 0)

    def test_solar_return_from_unknown_birth_time_keeps_return_houses_location_dependent(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_solar_return=True))
        natal = service.calculate_natal_chart(bangkok_request(birth_time_unknown=True))
        with_location = service.calculate_solar_return(
            SolarReturnRequest(
                natal_chart_snapshot=natal,
                solar_return_year=2026,
                location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                calculation_profile_code="TH_NIRAYANA_V1",
            )
        )
        no_location = service.calculate_solar_return(
            SolarReturnRequest(
                natal_chart_snapshot=natal,
                solar_return_year=2026,
                calculation_profile_code="TH_NIRAYANA_V1",
            )
        )
        self.assertFalse(natal.houses.reliable)
        self.assertLessEqual(with_location.delta_arc_seconds, 60)
        self.assertTrue(with_location.solar_return_chart_snapshot.houses.reliable)
        self.assertTrue(all(planet.house_number is not None for planet in with_location.solar_return_chart_snapshot.planets.values()))
        self.assertFalse(no_location.solar_return_chart_snapshot.houses.reliable)
        self.assertTrue(all(planet.house_number is None for planet in no_location.solar_return_chart_snapshot.planets.values()))
        self.assertEqual(
            [warning.code for warning in with_location.warnings],
            [
                "UNKNOWN_BIRTH_TIME",
                "UNKNOWN_BIRTH_TIME_USED_NOON_FALLBACK",
                "FAST_PLANET_POSITIONS_APPROXIMATE",
                "UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE",
            ],
        )
        repeated = service.calculate_solar_return(
            SolarReturnRequest(
                natal_chart_snapshot=natal,
                solar_return_year=2026,
                location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                calculation_profile_code="TH_NIRAYANA_V1",
            )
        )
        self.assertEqual(with_location.calculation_hash, repeated.calculation_hash)

    def test_solar_return_rejects_snapshot_local_offset_mismatch(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_solar_return=True))
        natal = service.calculate_natal_chart(bangkok_request())
        invalid_snapshot = replace(natal, datetime=replace(natal.datetime, local="1990-05-12T08:30:00+08:00"))

        with self.assertRaisesRegex(ValueError, "INVALID_DATETIME") as raised:
            service.calculate_solar_return(
                SolarReturnRequest(
                    natal_chart_snapshot=invalid_snapshot,
                    solar_return_year=2026,
                    location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                    calculation_profile_code="TH_NIRAYANA_V1",
                )
            )

        self.assertNotIn("1990-05-12", str(raised.exception))
        self.assertNotIn("08:30", str(raised.exception))

    def test_transit_to_natal_applying_uses_transit_motion_toward_exact_aspect(self) -> None:
        hits = calculate_transit_to_natal_hits(
            {"mars": planet_position(88, 1.0)},
            {"sun": planet_position(0, 20.0)},
            {"square": 3},
        )
        self.assertEqual(hits[0].applying_or_separating, "applying")
        aspects = calculate_cross_aspects({"mars": planet_position(88, 1.0)}, {"sun": planet_position(0, 20.0)}, {"square": 3})
        self.assertTrue(aspects[0].applying)

    def test_transit_to_natal_separating_after_exact_aspect(self) -> None:
        hits = calculate_transit_to_natal_hits(
            {"mars": planet_position(92, 1.0)},
            {"sun": planet_position(0, -20.0)},
            {"square": 3},
        )
        self.assertEqual(hits[0].applying_or_separating, "separating")

    def test_transit_to_natal_retrograde_motion_can_be_applying(self) -> None:
        hits = calculate_transit_to_natal_hits(
            {"mars": planet_position(92, -1.0)},
            {"sun": planet_position(0, 20.0)},
            {"square": 3},
        )
        self.assertEqual(hits[0].applying_or_separating, "applying")

    def test_transit_to_natal_stationary_motion_is_unknown_and_ignores_natal_speed(self) -> None:
        hits = calculate_transit_to_natal_hits(
            {"mars": planet_position(88, 0.0)},
            {"sun": planet_position(0, -20.0)},
            {"square": 3},
        )
        self.assertIsNone(hits[0].applying_or_separating)

    def test_production_swisseph_guard_fails_closed(self) -> None:
        with self.assertRaisesRegex(PermissionError, "ASTRO_MOCK_ENGINE_PRODUCTION_FORBIDDEN"):
            AstroRuntimeConfig(engine="mock", runtime_env="production").validate()
        with self.assertRaisesRegex(PermissionError, "LICENSE_MODE_NOT_PRODUCTION_READY"):
            AstroRuntimeConfig(engine="swisseph", runtime_env="production", swisseph_license_mode="free", ephemeris_path="/tmp").validate()
        with self.assertRaisesRegex(PermissionError, "EPHEMERIS_FILE_MISSING"):
            AstroRuntimeConfig(engine="swisseph", runtime_env="production", swisseph_license_mode="professional").validate()
        with self.assertRaisesRegex(PermissionError, "EPHEMERIS_PINNING_REQUIRED"):
            AstroRuntimeConfig(engine="swisseph", runtime_env="production", swisseph_license_mode="professional", ephemeris_path="/tmp").validate()
        with self.assertRaisesRegex(PermissionError, "EPHEMERIS_MANIFEST_REQUIRED"):
            AstroRuntimeConfig(
                engine="swisseph",
                runtime_env="production",
                swisseph_license_mode="professional",
                ephemeris_path="/tmp",
                require_pinned_ephemeris=True,
            ).validate()
        AstroRuntimeConfig(
            engine="swisseph",
            runtime_env="production",
            swisseph_license_mode="professional",
            ephemeris_path="/tmp",
            ephemeris_manifest_path="/tmp/ephemeris-manifest.json",
            require_pinned_ephemeris=True,
        ).validate()

    def test_runtime_environment_reads_deployment_sources_before_node_env(self) -> None:
        names = ["APP_ENV", "DEPLOYMENT_ENV", "VERCEL_ENV", "NODE_ENV", "ENVIRONMENT"]
        previous = {name: os.environ.get(name) for name in names}
        os.environ["APP_ENV"] = "production"
        os.environ["NODE_ENV"] = "development"
        try:
            self.assertEqual(read_runtime_environment(), "production")
            self.assertEqual(AstroRuntimeConfig.from_env().runtime_env, "production")
        finally:
            for name, value in previous.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value

    def test_runtime_environment_fails_closed_when_local_value_conflicts_with_production(self) -> None:
        names = ["APP_ENV", "DEPLOYMENT_ENV", "VERCEL_ENV", "NODE_ENV", "ENVIRONMENT"]
        previous = {name: os.environ.get(name) for name in names}
        os.environ["APP_ENV"] = "development"
        os.environ["NODE_ENV"] = "production"
        try:
            self.assertEqual(read_runtime_environment(), "production")
            self.assertEqual(AstroRuntimeConfig.from_env().runtime_env, "production")
        finally:
            for name, value in previous.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value

    def test_runtime_environment_respects_explicit_staging_over_node_production(self) -> None:
        names = ["APP_ENV", "DEPLOYMENT_ENV", "VERCEL_ENV", "NODE_ENV", "ENVIRONMENT"]
        previous = {name: os.environ.get(name) for name in names}
        os.environ["APP_ENV"] = "staging"
        os.environ["NODE_ENV"] = "production"
        try:
            self.assertEqual(read_runtime_environment(), "staging")
            self.assertEqual(AstroRuntimeConfig.from_env().runtime_env, "staging")
        finally:
            for name, value in previous.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value

    def test_runtime_environment_fails_closed_for_local_and_staging_conflict_with_production(self) -> None:
        names = ["APP_ENV", "DEPLOYMENT_ENV", "VERCEL_ENV", "NODE_ENV", "ENVIRONMENT"]
        previous = {name: os.environ.get(name) for name in names}
        os.environ["APP_ENV"] = "staging"
        os.environ["DEPLOYMENT_ENV"] = "local"
        os.environ["NODE_ENV"] = "production"
        try:
            self.assertEqual(read_runtime_environment(), "production")
            self.assertEqual(AstroRuntimeConfig.from_env().runtime_env, "production")
        finally:
            for name, value in previous.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value

    def test_health_reports_sanitized_config_errors_without_ephemeris_path(self) -> None:
        previous = {name: os.environ.get(name) for name in ["ASTRO_ENGINE", "NODE_ENV", "SWISSEPH_LICENSE_MODE", "ASTRO_EPHEMERIS_PATH"]}
        os.environ["ASTRO_ENGINE"] = "swisseph"
        os.environ["NODE_ENV"] = "production"
        os.environ["SWISSEPH_LICENSE_MODE"] = "free"
        os.environ["ASTRO_EPHEMERIS_PATH"] = "/private/ephemeris/path"
        try:
            report = health()
        finally:
            for name, value in previous.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value

        self.assertEqual(report["status"], "error")
        self.assertEqual(report["error_code"], "LICENSE_MODE_NOT_PRODUCTION_READY")
        self.assertEqual(report["ephemeris_path_configured"], "true")
        self.assertNotIn("/private/ephemeris/path", str(report))

    def test_health_rejects_mock_engine_in_production_from_app_env(self) -> None:
        names = ["APP_ENV", "ASTRO_ENGINE", "NODE_ENV", "SWISSEPH_LICENSE_MODE", "ASTRO_EPHEMERIS_PATH"]
        previous = {name: os.environ.get(name) for name in names}
        os.environ["APP_ENV"] = "production"
        os.environ["ASTRO_ENGINE"] = "mock"
        os.environ["NODE_ENV"] = "development"
        try:
            report = health()
        finally:
            for name, value in previous.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value

        self.assertEqual(report["status"], "error")
        self.assertEqual(report["error_code"], "ASTRO_MOCK_ENGINE_PRODUCTION_FORBIDDEN")
        self.assertNotIn("development", str(report))

    def test_health_rejects_mock_engine_when_local_app_env_conflicts_with_production(self) -> None:
        names = ["APP_ENV", "ASTRO_ENGINE", "NODE_ENV", "SWISSEPH_LICENSE_MODE", "ASTRO_EPHEMERIS_PATH"]
        previous = {name: os.environ.get(name) for name in names}
        os.environ["APP_ENV"] = "development"
        os.environ["ASTRO_ENGINE"] = "mock"
        os.environ["NODE_ENV"] = "production"
        try:
            report = health()
        finally:
            for name, value in previous.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value

        self.assertEqual(report["status"], "error")
        self.assertEqual(report["error_code"], "ASTRO_MOCK_ENGINE_PRODUCTION_FORBIDDEN")

    def test_health_sanitizes_invalid_config_values_without_echoing_them(self) -> None:
        names = ["ASTRO_ENGINE", "ASTRO_CALCULATION_PROFILE", "SWISSEPH_LICENSE_MODE", "ASTRO_EPHEMERIS_PATH"]
        previous = {name: os.environ.get(name) for name in names}
        os.environ["ASTRO_ENGINE"] = "secret-engine-token"
        os.environ["ASTRO_CALCULATION_PROFILE"] = "private-profile-token"
        os.environ["SWISSEPH_LICENSE_MODE"] = "secret-license-token"
        os.environ["ASTRO_EPHEMERIS_PATH"] = "/private/ephemeris/path"
        try:
            report = health()
        finally:
            for name, value in previous.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value

        serialized = str(report)
        self.assertEqual(report["status"], "error")
        self.assertEqual(report["engine"], "invalid")
        self.assertEqual(report["profile"], "invalid")
        self.assertEqual(report["license_mode"], "invalid")
        self.assertNotIn("secret-engine-token", serialized)
        self.assertNotIn("private-profile-token", serialized)
        self.assertNotIn("secret-license-token", serialized)
        self.assertNotIn("/private/ephemeris/path", serialized)

    def test_health_keeps_staging_mock_engine_when_node_env_is_production(self) -> None:
        names = ["APP_ENV", "ASTRO_ENGINE", "NODE_ENV", "SWISSEPH_LICENSE_MODE", "ASTRO_EPHEMERIS_PATH"]
        previous = {name: os.environ.get(name) for name in names}
        os.environ["APP_ENV"] = "staging"
        os.environ["ASTRO_ENGINE"] = "mock"
        os.environ["NODE_ENV"] = "production"
        try:
            report = health()
        finally:
            for name, value in previous.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value

        self.assertEqual(report["status"], "ok")
        self.assertEqual(report["engine"], "mock")

    def test_health_rejects_mock_engine_when_local_and_staging_conflict_with_production(self) -> None:
        names = ["APP_ENV", "DEPLOYMENT_ENV", "ASTRO_ENGINE", "NODE_ENV", "SWISSEPH_LICENSE_MODE", "ASTRO_EPHEMERIS_PATH"]
        previous = {name: os.environ.get(name) for name in names}
        os.environ["APP_ENV"] = "staging"
        os.environ["DEPLOYMENT_ENV"] = "local"
        os.environ["ASTRO_ENGINE"] = "mock"
        os.environ["NODE_ENV"] = "production"
        try:
            report = health()
        finally:
            for name, value in previous.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value

        self.assertEqual(report["status"], "error")
        self.assertEqual(report["error_code"], "ASTRO_MOCK_ENGINE_PRODUCTION_FORBIDDEN")

    def test_health_verifies_swisseph_ephemeris_path_exists_without_exposing_it(self) -> None:
        previous = {
            name: os.environ.get(name)
            for name in [
                "ASTRO_ENGINE",
                "NODE_ENV",
                "SWISSEPH_LICENSE_MODE",
                "ASTRO_EPHEMERIS_PATH",
                "ASTRO_EPHEMERIS_MANIFEST_PATH",
                "ASTRO_REQUIRE_PINNED_EPHEMERIS",
            ]
        }
        os.environ["ASTRO_ENGINE"] = "swisseph"
        os.environ["NODE_ENV"] = "production"
        os.environ["SWISSEPH_LICENSE_MODE"] = "professional"
        os.environ["ASTRO_EPHEMERIS_PATH"] = "/private/missing/ephemeris/path"
        os.environ["ASTRO_EPHEMERIS_MANIFEST_PATH"] = "/private/missing/ephemeris/ephemeris-manifest.json"
        os.environ["ASTRO_REQUIRE_PINNED_EPHEMERIS"] = "true"
        try:
            report = health()
        finally:
            for name, value in previous.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value

        self.assertEqual(report["status"], "error")
        self.assertEqual(report["error_code"], "EPHEMERIS_FILE_MISSING")
        self.assertNotIn("/private/missing/ephemeris/path", str(report))

    def test_health_fails_closed_when_production_swisseph_adapter_cannot_load(self) -> None:
        names = [
            "APP_ENV",
            "ASTRO_ENGINE",
            "SWISSEPH_LICENSE_MODE",
            "ASTRO_EPHEMERIS_PATH",
            "ASTRO_EPHEMERIS_MANIFEST_PATH",
            "ASTRO_REQUIRE_PINNED_EPHEMERIS",
        ]
        previous = {name: os.environ.get(name) for name in names}
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "sepl_18.se1").write_bytes(b"fixture")
            manifest = build_ephemeris_file_manifest(temp_dir)
            manifest_path = root / "ephemeris-manifest.json"
            manifest_path.write_text(json.dumps(approved_ephemeris_manifest(manifest), sort_keys=True), encoding="utf-8")
            os.environ["APP_ENV"] = "production"
            os.environ["ASTRO_ENGINE"] = "swisseph"
            os.environ["SWISSEPH_LICENSE_MODE"] = "professional"
            os.environ["ASTRO_EPHEMERIS_PATH"] = temp_dir
            os.environ["ASTRO_EPHEMERIS_MANIFEST_PATH"] = str(manifest_path)
            os.environ["ASTRO_REQUIRE_PINNED_EPHEMERIS"] = "true"
            try:
                with patch("app.engines.swisseph.importlib.import_module", side_effect=ModuleNotFoundError("swisseph")):
                    report = health()
            finally:
                for name, value in previous.items():
                    if value is None:
                        os.environ.pop(name, None)
                    else:
                        os.environ[name] = value

        self.assertEqual(report["status"], "error")
        self.assertEqual(report["error_code"], "SWISSEPH_ADAPTER_UNAVAILABLE")
        self.assertNotIn(temp_dir, str(report))

    def test_health_loads_production_swisseph_adapter_before_reporting_ok(self) -> None:
        names = [
            "APP_ENV",
            "ASTRO_ENGINE",
            "SWISSEPH_LICENSE_MODE",
            "ASTRO_EPHEMERIS_PATH",
            "ASTRO_EPHEMERIS_MANIFEST_PATH",
            "ASTRO_REQUIRE_PINNED_EPHEMERIS",
        ]
        previous = {name: os.environ.get(name) for name in names}
        fake_swe = FakeSwe()
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "sepl_18.se1").write_bytes(b"fixture")
            manifest = build_ephemeris_file_manifest(temp_dir)
            manifest_path = root / "ephemeris-manifest.json"
            manifest_path.write_text(json.dumps(approved_ephemeris_manifest(manifest), sort_keys=True), encoding="utf-8")
            os.environ["APP_ENV"] = "production"
            os.environ["ASTRO_ENGINE"] = "swisseph"
            os.environ["SWISSEPH_LICENSE_MODE"] = "professional"
            os.environ["ASTRO_EPHEMERIS_PATH"] = temp_dir
            os.environ["ASTRO_EPHEMERIS_MANIFEST_PATH"] = str(manifest_path)
            os.environ["ASTRO_REQUIRE_PINNED_EPHEMERIS"] = "true"
            try:
                with patch("app.engines.swisseph.importlib.import_module", return_value=fake_swe):
                    report = health()
            finally:
                for name, value in previous.items():
                    if value is None:
                        os.environ.pop(name, None)
                    else:
                        os.environ[name] = value

        self.assertEqual(report["status"], "ok")
        self.assertTrue(fake_swe.sid_mode_set)
        self.assertEqual(fake_swe.calc_body_ids, [FakeSwe.SUN, FakeSwe.SUN, FakeSwe.MOON, FakeSwe.MOON])
        self.assertTrue(fake_swe.houses_called)

    def test_health_runs_pinned_staging_swisseph_adapter_probe(self) -> None:
        names = [
            "APP_ENV",
            "ASTRO_ENGINE",
            "SWISSEPH_LICENSE_MODE",
            "ASTRO_EPHEMERIS_PATH",
            "ASTRO_EPHEMERIS_MANIFEST_PATH",
            "ASTRO_REQUIRE_PINNED_EPHEMERIS",
        ]
        previous = {name: os.environ.get(name) for name in names}
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "sepl_18.se1").write_bytes(b"fixture")
            manifest = build_ephemeris_file_manifest(temp_dir)
            manifest_path = root / "ephemeris-manifest.json"
            manifest_path.write_text(json.dumps(approved_ephemeris_manifest(manifest), sort_keys=True), encoding="utf-8")
            os.environ["APP_ENV"] = "staging"
            os.environ["ASTRO_ENGINE"] = "swisseph"
            os.environ["SWISSEPH_LICENSE_MODE"] = "professional"
            os.environ["ASTRO_EPHEMERIS_PATH"] = temp_dir
            os.environ["ASTRO_EPHEMERIS_MANIFEST_PATH"] = str(manifest_path)
            os.environ["ASTRO_REQUIRE_PINNED_EPHEMERIS"] = "true"
            try:
                with patch("app.engines.swisseph.importlib.import_module", side_effect=ModuleNotFoundError("swisseph")):
                    report = health()
            finally:
                for name, value in previous.items():
                    if value is None:
                        os.environ.pop(name, None)
                    else:
                        os.environ[name] = value

        self.assertEqual(report["status"], "error")
        self.assertEqual(report["error_code"], "SWISSEPH_ADAPTER_UNAVAILABLE")

    def test_health_rejects_pinned_manifest_without_active_profile_approval(self) -> None:
        names = [
            "APP_ENV",
            "ASTRO_ENGINE",
            "ASTRO_CALCULATION_PROFILE",
            "SWISSEPH_LICENSE_MODE",
            "ASTRO_EPHEMERIS_PATH",
            "ASTRO_EPHEMERIS_MANIFEST_PATH",
            "ASTRO_REQUIRE_PINNED_EPHEMERIS",
        ]
        previous = {name: os.environ.get(name) for name in names}
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "sepl_18.se1").write_bytes(b"fixture")
            manifest = approved_ephemeris_manifest(build_ephemeris_file_manifest(temp_dir), profiles=["TH_NIRAYANA_V1"])
            manifest_path = root / "ephemeris-manifest.json"
            manifest_path.write_text(json.dumps(manifest, sort_keys=True), encoding="utf-8")
            os.environ["APP_ENV"] = "production"
            os.environ["ASTRO_ENGINE"] = "swisseph"
            os.environ["ASTRO_CALCULATION_PROFILE"] = "TH_SIMPLE_RASI_V1"
            os.environ["SWISSEPH_LICENSE_MODE"] = "professional"
            os.environ["ASTRO_EPHEMERIS_PATH"] = temp_dir
            os.environ["ASTRO_EPHEMERIS_MANIFEST_PATH"] = str(manifest_path)
            os.environ["ASTRO_REQUIRE_PINNED_EPHEMERIS"] = "true"
            try:
                report = health()
            finally:
                for name, value in previous.items():
                    if value is None:
                        os.environ.pop(name, None)
                    else:
                        os.environ[name] = value

        self.assertEqual(report["status"], "error")
        self.assertEqual(report["error_code"], "EPHEMERIS_PROFILE_NOT_APPROVED")

    def test_health_rejects_swisseph_fallback_return_flags(self) -> None:
        names = [
            "APP_ENV",
            "ASTRO_ENGINE",
            "SWISSEPH_LICENSE_MODE",
            "ASTRO_EPHEMERIS_PATH",
            "ASTRO_EPHEMERIS_MANIFEST_PATH",
            "ASTRO_REQUIRE_PINNED_EPHEMERIS",
        ]
        previous = {name: os.environ.get(name) for name in names}
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "sepl_18.se1").write_bytes(b"fixture")
            manifest = approved_ephemeris_manifest(build_ephemeris_file_manifest(temp_dir))
            manifest_path = root / "ephemeris-manifest.json"
            manifest_path.write_text(json.dumps(manifest, sort_keys=True), encoding="utf-8")
            os.environ["APP_ENV"] = "production"
            os.environ["ASTRO_ENGINE"] = "swisseph"
            os.environ["SWISSEPH_LICENSE_MODE"] = "professional"
            os.environ["ASTRO_EPHEMERIS_PATH"] = temp_dir
            os.environ["ASTRO_EPHEMERIS_MANIFEST_PATH"] = str(manifest_path)
            os.environ["ASTRO_REQUIRE_PINNED_EPHEMERIS"] = "true"
            try:
                with patch("app.engines.swisseph.importlib.import_module", return_value=FallbackSwe()):
                    report = health()
            finally:
                for name, value in previous.items():
                    if value is None:
                        os.environ.pop(name, None)
                    else:
                        os.environ[name] = value

        self.assertEqual(report["status"], "error")
        self.assertEqual(report["error_code"], "SWISSEPH_FALLBACK_FORBIDDEN")

    def test_swisseph_adapter_fails_closed_when_ephemeris_path_is_missing(self) -> None:
        config = AstroRuntimeConfig(
            engine="swisseph",
            runtime_env="test",
            swisseph_license_mode="free",
            ephemeris_path="/tmp/thai-horoscope-missing-ephemeris",
        )
        with self.assertRaisesRegex(FileNotFoundError, "EPHEMERIS_FILE_MISSING"):
            SwissEphemerisEngine(config)

    def test_swisseph_adapter_fails_closed_when_ephemeris_directory_is_empty(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            config = AstroRuntimeConfig(
                engine="swisseph",
                runtime_env="test",
                swisseph_license_mode="free",
                ephemeris_path=temp_dir,
            )
            with self.assertRaisesRegex(FileNotFoundError, "EPHEMERIS_FILES_EMPTY"):
                SwissEphemerisEngine(config, swe_module=FakeSwe())
            with self.assertRaisesRegex(FileNotFoundError, "EPHEMERIS_FILES_EMPTY"):
                fingerprint_ephemeris_path(temp_dir)

    def test_swisseph_adapter_fails_closed_with_only_unrelated_ephemeris_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "download.tmp").write_bytes(b"not ephemeris")
            (root / "swisseph.log").write_bytes(b"log")
            config = AstroRuntimeConfig(
                engine="swisseph",
                runtime_env="test",
                swisseph_license_mode="free",
                ephemeris_path=temp_dir,
            )
            with self.assertRaisesRegex(FileNotFoundError, "EPHEMERIS_FILES_EMPTY"):
                SwissEphemerisEngine(config, swe_module=FakeSwe())
            with self.assertRaisesRegex(FileNotFoundError, "EPHEMERIS_FILES_EMPTY"):
                fingerprint_ephemeris_path(temp_dir)

    def test_swisseph_adapter_starts_with_supported_ephemeris_files_and_ignores_unrelated_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            supported = root / "sepl_18.se1"
            supported.write_bytes(b"supported-v1")
            unrelated = root / "runtime.log"
            unrelated.write_bytes(b"ignored-v1")
            config = AstroRuntimeConfig(
                engine="swisseph",
                runtime_env="test",
                swisseph_license_mode="free",
                ephemeris_path=temp_dir,
            )
            first = fingerprint_ephemeris_path(temp_dir)
            engine = SwissEphemerisEngine(config, swe_module=FakeSwe())
            unrelated.write_bytes(b"ignored-v2")
            self.assertEqual(first, fingerprint_ephemeris_path(temp_dir))
            supported.write_bytes(b"supported-v2")
            self.assertNotEqual(first, fingerprint_ephemeris_path(temp_dir))
            self.assertEqual(engine.ephemeris_fingerprint, first)

    def test_swisseph_production_fails_without_professional_license_mode(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            (Path(temp_dir) / "sepl_18.se1").write_bytes(b"fixture")
            config = AstroRuntimeConfig(
                engine="swisseph",
                runtime_env="production",
                swisseph_license_mode="free",
                ephemeris_path=temp_dir,
                require_pinned_ephemeris=True,
            )
            with self.assertRaisesRegex(PermissionError, "LICENSE_MODE_NOT_PRODUCTION_READY"):
                SwissEphemerisEngine(config, swe_module=FakeSwe())

    def test_swisseph_production_fails_without_ephemeris_path(self) -> None:
        config = AstroRuntimeConfig(
            engine="swisseph",
            runtime_env="production",
            swisseph_license_mode="professional",
            ephemeris_path=None,
            require_pinned_ephemeris=True,
        )
        with self.assertRaisesRegex(PermissionError, "EPHEMERIS_FILE_MISSING"):
            SwissEphemerisEngine(config, swe_module=FakeSwe())

    def test_swisseph_production_fails_for_missing_ephemeris_path(self) -> None:
        config = AstroRuntimeConfig(
            engine="swisseph",
            runtime_env="production",
            swisseph_license_mode="professional",
            ephemeris_path="/tmp/thai-horoscope-missing-production-ephemeris",
            ephemeris_manifest_path="/tmp/thai-horoscope-missing-production-ephemeris/ephemeris-manifest.json",
            require_pinned_ephemeris=True,
        )
        with self.assertRaisesRegex(FileNotFoundError, "EPHEMERIS_FILE_MISSING"):
            SwissEphemerisEngine(config, swe_module=FakeSwe())

    def test_swisseph_production_fails_for_empty_or_unrelated_ephemeris_directory(self) -> None:
        with tempfile.TemporaryDirectory() as empty_dir, tempfile.TemporaryDirectory() as unrelated_dir:
            unrelated = Path(unrelated_dir)
            (unrelated / "runtime.log").write_bytes(b"not ephemeris")
            for ephemeris_path, error_code in [(empty_dir, "EPHEMERIS_FILES_EMPTY"), (unrelated_dir, "EPHEMERIS_FILES_EMPTY")]:
                config = AstroRuntimeConfig(
                    engine="swisseph",
                    runtime_env="production",
                    swisseph_license_mode="professional",
                    ephemeris_path=ephemeris_path,
                    ephemeris_manifest_path=str(Path(ephemeris_path) / "ephemeris-manifest.json"),
                    require_pinned_ephemeris=True,
                )
                with self.assertRaisesRegex(FileNotFoundError, error_code):
                    SwissEphemerisEngine(config, swe_module=FakeSwe())

    def test_swisseph_production_requires_pinned_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            (Path(temp_dir) / "sepl_18.se1").write_bytes(b"fixture")
            config = AstroRuntimeConfig(
                engine="swisseph",
                runtime_env="production",
                swisseph_license_mode="professional",
                ephemeris_path=temp_dir,
                require_pinned_ephemeris=True,
            )
            with self.assertRaisesRegex(PermissionError, "EPHEMERIS_MANIFEST_REQUIRED"):
                SwissEphemerisEngine(config, swe_module=FakeSwe())

    def test_swisseph_production_requires_explicit_pinning_flag(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "sepl_18.se1").write_bytes(b"fixture")
            manifest = build_ephemeris_file_manifest(temp_dir)
            manifest_path = root / "ephemeris-manifest.json"
            manifest_path.write_text(json.dumps(approved_ephemeris_manifest(manifest), sort_keys=True), encoding="utf-8")
            config = AstroRuntimeConfig(
                engine="swisseph",
                runtime_env="production",
                swisseph_license_mode="professional",
                ephemeris_path=temp_dir,
                ephemeris_manifest_path=str(manifest_path),
                require_pinned_ephemeris=False,
            )
            with self.assertRaisesRegex(PermissionError, "EPHEMERIS_PINNING_REQUIRED"):
                SwissEphemerisEngine(config, swe_module=FakeSwe())

    def test_swisseph_production_passes_with_supported_fixture_and_matching_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "sepl_18.se1").write_bytes(b"fixture")
            manifest = build_ephemeris_file_manifest(temp_dir)
            manifest_path = root / "ephemeris-manifest.json"
            manifest_path.write_text(json.dumps(approved_ephemeris_manifest(manifest), sort_keys=True), encoding="utf-8")
            config = AstroRuntimeConfig(
                engine="swisseph",
                runtime_env="production",
                swisseph_license_mode="professional",
                ephemeris_path=temp_dir,
                ephemeris_manifest_path=str(manifest_path),
                require_pinned_ephemeris=True,
            )
            engine = SwissEphemerisEngine(config, swe_module=FakeSwe())
            self.assertEqual(engine.ephemeris_fingerprint, manifest["fingerprint"])

    def test_ephemeris_manifest_mismatch_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            supported = root / "sepl_18.se1"
            supported.write_bytes(b"fixture-v1")
            manifest = build_ephemeris_file_manifest(temp_dir)
            supported.write_bytes(b"fixture-v2")
            manifest_path = root / "ephemeris-manifest.json"
            manifest_path.write_text(json.dumps(approved_ephemeris_manifest(manifest), sort_keys=True), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "EPHEMERIS_MANIFEST_MISMATCH"):
                fingerprint_ephemeris_path(temp_dir, manifest_path=str(manifest_path), require_pinned=True)

    def test_pinned_ephemeris_manifest_requires_file_entries(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "sepl_18.se1").write_bytes(b"fixture")
            manifest = build_ephemeris_file_manifest(temp_dir)
            manifest_path = root / "ephemeris-manifest.json"
            manifest_path.write_text(json.dumps({"fingerprint": manifest["fingerprint"]}, sort_keys=True), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "EPHEMERIS_MANIFEST_INVALID"):
                fingerprint_ephemeris_path(temp_dir, manifest_path=str(manifest_path), require_pinned=True)

    def test_pinned_ephemeris_manifest_requires_approval_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "sepl_18.se1").write_bytes(b"fixture")
            manifest = build_ephemeris_file_manifest(temp_dir)
            manifest_path = root / "ephemeris-manifest.json"
            manifest_path.write_text(json.dumps(manifest, sort_keys=True), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "EPHEMERIS_MANIFEST_INVALID"):
                fingerprint_ephemeris_path(temp_dir, manifest_path=str(manifest_path), require_pinned=True)

    def test_pinned_ephemeris_manifest_requires_active_profile_approval(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "sepl_18.se1").write_bytes(b"fixture")
            manifest = build_ephemeris_file_manifest(temp_dir)
            manifest_path = root / "ephemeris-manifest.json"
            manifest_path.write_text(json.dumps(approved_ephemeris_manifest(manifest), sort_keys=True), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "EPHEMERIS_PROFILE_NOT_APPROVED"):
                fingerprint_ephemeris_path(
                    temp_dir,
                    manifest_path=str(manifest_path),
                    require_pinned=True,
                    active_profile="TH_SIMPLE_RASI_V1",
                )
            self.assertEqual(
                fingerprint_ephemeris_path(
                    temp_dir,
                    manifest_path=str(manifest_path),
                    require_pinned=True,
                    active_profile="TH_NIRAYANA_V1",
                ),
                manifest["fingerprint"],
            )

    def test_ephemeris_manifest_accepts_operator_runbook_file_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "sepl_18.se1").write_bytes(b"fixture")
            manifest = build_ephemeris_file_manifest(temp_dir)
            files = manifest["files"]
            assert isinstance(files, list)
            runbook_manifest = {
                "fingerprint": manifest["fingerprint"],
                "license_mode": "professional",
                "approved_by": "astro-ops",
                "approval_date": "2026-05-08",
                "calculation_profile_code": "TH_NIRAYANA_V1",
                "file_manifest": [
                    {"relative_path": entry["name"], "size_bytes": entry["size"], "sha256": entry["sha256"]}
                    for entry in files
                ],
            }
            manifest_path = root / "ephemeris-manifest.json"
            manifest_path.write_text(json.dumps(runbook_manifest, sort_keys=True), encoding="utf-8")
            self.assertEqual(
                fingerprint_ephemeris_path(temp_dir, manifest_path=str(manifest_path), require_pinned=True),
                manifest["fingerprint"],
            )

    def test_ephemeris_manifest_must_be_json_object(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "sepl_18.se1").write_bytes(b"fixture")
            manifest_path = root / "ephemeris-manifest.json"
            manifest_path.write_text("[]", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "EPHEMERIS_MANIFEST_INVALID"):
                fingerprint_ephemeris_path(temp_dir, manifest_path=str(manifest_path), require_pinned=True)

    def test_supported_ephemeris_files_must_be_non_empty(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "sepl_18.se1").write_bytes(b"")
            with self.assertRaisesRegex(ValueError, "EPHEMERIS_FILE_EMPTY"):
                fingerprint_ephemeris_path(temp_dir)

    def test_mock_engine_works_without_license_or_ephemeris_path(self) -> None:
        config = AstroRuntimeConfig(engine="mock", swisseph_license_mode="none", ephemeris_path=None)
        config.validate()
        snapshot = AstroCoreService(config=config).calculate_natal_chart(bangkok_request())
        public = snapshot.to_json_dict()
        engine = public["engine"]
        assert isinstance(engine, dict)
        self.assertEqual(snapshot.engine, "mock")
        self.assertEqual(engine["license_mode"], "none")
        self.assertFalse(engine["ephemeris_path_configured"])
        self.assertIn("sun", snapshot.planets)

    def test_direct_swisseph_service_requires_explicit_engine(self) -> None:
        config = AstroRuntimeConfig(engine="swisseph", runtime_env="test", swisseph_license_mode="free", ephemeris_path="/tmp/ephe")
        with self.assertRaisesRegex(ValueError, "ASTRO_ENGINE_CONFIG_REQUIRES_EXPLICIT_ENGINE"):
            AstroCoreService(config=config)

    def test_create_service_swisseph_uses_factory_license_and_path_guards(self) -> None:
        config = AstroRuntimeConfig(engine="swisseph", runtime_env="test", swisseph_license_mode="free", ephemeris_path="/tmp/missing-ephe")
        with self.assertRaisesRegex(FileNotFoundError, "EPHEMERIS_FILE_MISSING"):
            create_service(config)

    def test_config_engine_metadata_cannot_claim_swiss_while_using_mock(self) -> None:
        config = AstroRuntimeConfig(engine="swisseph", runtime_env="test", swisseph_license_mode="free", ephemeris_path="/tmp/ephe")
        with self.assertRaisesRegex(ValueError, "ASTRO_ENGINE_CONFIG_MISMATCH"):
            AstroCoreService(engine=FakeMockEngine(), config=config)

    def test_ephemeris_fingerprint_hashes_expected_file_contents(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            first = root / "sepl_18.se1"
            first.write_bytes(b"same name original")
            ignored = root / "temporary-download.tmp"
            ignored.write_bytes(b"ignored")
            original = fingerprint_ephemeris_path(str(root))
            first.write_bytes(b"same name changed")
            changed_content = fingerprint_ephemeris_path(str(root))
            self.assertNotEqual(original, changed_content)
            first.write_bytes(b"same name changed plus size")
            changed_size = fingerprint_ephemeris_path(str(root))
            self.assertNotEqual(changed_content, changed_size)

    def test_ephemeris_fingerprint_is_order_independent_and_supports_file_path(self) -> None:
        with tempfile.TemporaryDirectory() as left_dir, tempfile.TemporaryDirectory() as right_dir:
            left = Path(left_dir)
            right = Path(right_dir)
            (left / "semo_18.se1").write_bytes(b"moon")
            (left / "sepl_18.se1").write_bytes(b"planet")
            (right / "sepl_18.se1").write_bytes(b"planet")
            (right / "semo_18.se1").write_bytes(b"moon")
            self.assertEqual(fingerprint_ephemeris_path(str(left)), fingerprint_ephemeris_path(str(right)))
            single = left / "single.se2"
            single.write_bytes(b"content-v1")
            first = fingerprint_ephemeris_path(str(single))
            single.write_bytes(b"content-v2")
            self.assertNotEqual(first, fingerprint_ephemeris_path(str(single)))
            unsupported = left / "single.custom"
            unsupported.write_bytes(b"unsupported")
            with self.assertRaisesRegex(FileNotFoundError, "EPHEMERIS_FILE_MISSING"):
                fingerprint_ephemeris_path(str(unsupported))

    def test_calculation_hash_changes_when_ephemeris_fingerprint_changes(self) -> None:
        request = bangkok_request()
        first = AstroCoreService(engine=FingerprintMockEngine("ephe-a"), config=AstroRuntimeConfig()).calculate_natal_chart(request)
        second = AstroCoreService(engine=FingerprintMockEngine("ephe-b"), config=AstroRuntimeConfig()).calculate_natal_chart(request)
        self.assertNotEqual(first.ephemeris_fingerprint, second.ephemeris_fingerprint)
        self.assertNotEqual(first.calculation_hash, second.calculation_hash)

    def test_no_ephemeris_binary_files_are_committed(self) -> None:
        root = Path(__file__).resolve().parents[3]
        forbidden_suffixes = {".se1", ".se2", ".sef", ".bsp", ".ephe", ".eph"}
        search_roots = [
            root / "services" / "astro-calc",
            root / "packages" / "contracts",
            root / "apps" / "web" / "src" / "astro",
            root / "docs",
        ]
        committed_ephemeris_like_files = [
            str(path.relative_to(root))
            for search_root in search_roots
            if search_root.exists()
            for path in search_root.rglob("*")
            if path.is_file() and path.suffix.lower() in forbidden_suffixes
        ]
        self.assertEqual(committed_ephemeris_like_files, [])

    def test_calculations_do_not_attempt_network_downloads(self) -> None:
        def fail_network(*_args: object, **_kwargs: object) -> None:
            raise AssertionError("network download attempted")

        with (
            patch("urllib.request.urlopen", side_effect=fail_network),
            patch("urllib.request.urlretrieve", side_effect=fail_network),
        ):
            service = AstroCoreService()
            natal = service.calculate_natal_chart(bangkok_request())
            transit = service.calculate_transit_to_natal(
                TransitSnapshotRequest(
                    natal_chart_snapshot=natal,
                    transit_datetime_utc="2026-05-06T05:00:00Z",
                    calculation_profile_code="TH_NIRAYANA_V1",
                    transit_location=TransitLocation(latitude=13.7563, longitude=100.5018),
                )
            )
        self.assertIn("sun", natal.planets)
        self.assertIn("sun", transit.transit_planets)

    def test_swisseph_adapter_uses_injected_module_without_runtime_downloads(self) -> None:
        fake = FakeSwe()
        with tempfile.TemporaryDirectory() as temp_dir:
            (Path(temp_dir) / "sepl_18.se1").write_bytes(b"fixture")
            config = AstroRuntimeConfig(engine="swisseph", runtime_env="test", swisseph_license_mode="free", ephemeris_path=temp_dir)
            engine = SwissEphemerisEngine(config, swe_module=fake)
            positions = engine.planet_positions(2451545.0, ["sun", "rahu", "ketu"], "lahiri")
            houses = engine.houses(2451545.0, 13.7563, 100.5018, "whole_sign", True)
            self.assertEqual(fake.ephe_path, temp_dir)
        self.assertEqual(fake.sid_mode_set, True)
        self.assertEqual(positions["sun"].sign_index, 0)
        self.assertAlmostEqual((positions["rahu"].longitude_deg + 180) % 360, positions["ketu"].longitude_deg, places=6)
        self.assertEqual(len(houses.cusps_deg), 12)

    def test_swisseph_adapter_honors_mean_node_profile_for_rahu_and_ketu(self) -> None:
        fake = FakeSwe()
        with tempfile.TemporaryDirectory() as temp_dir:
            (Path(temp_dir) / "sepl_18.se1").write_bytes(b"fixture")
            config = AstroRuntimeConfig(engine="swisseph", runtime_env="test", swisseph_license_mode="free", ephemeris_path=temp_dir)
            engine = SwissEphemerisEngine(config, swe_module=fake)
            positions = engine.planet_positions(2451545.0, ["rahu", "ketu"], "lahiri", "mean_node")
        self.assertIn(fake.MEAN_NODE, fake.calc_body_ids)
        self.assertNotIn(fake.TRUE_NODE, fake.calc_body_ids)
        self.assertAlmostEqual((positions["rahu"].longitude_deg + 180) % 360, positions["ketu"].longitude_deg, places=6)

    def test_swisseph_adapter_honors_true_node_profile_for_rahu_and_ketu(self) -> None:
        fake = FakeSwe()
        with tempfile.TemporaryDirectory() as temp_dir:
            (Path(temp_dir) / "sepl_18.se1").write_bytes(b"fixture")
            config = AstroRuntimeConfig(engine="swisseph", runtime_env="test", swisseph_license_mode="free", ephemeris_path=temp_dir)
            engine = SwissEphemerisEngine(config, swe_module=fake)
            positions = engine.planet_positions(2451545.0, ["rahu", "ketu"], "lahiri", "true_node")
        self.assertIn(fake.TRUE_NODE, fake.calc_body_ids)
        self.assertNotIn(fake.MEAN_NODE, fake.calc_body_ids)
        self.assertAlmostEqual((positions["rahu"].longitude_deg + 180) % 360, positions["ketu"].longitude_deg, places=6)

    def test_snapshot_metadata_node_type_agrees_with_swisseph_body_selection(self) -> None:
        fake = FakeSwe()
        with tempfile.TemporaryDirectory() as temp_dir:
            (Path(temp_dir) / "sepl_18.se1").write_bytes(b"fixture")
            config = AstroRuntimeConfig(engine="swisseph", runtime_env="test", swisseph_license_mode="free", ephemeris_path=temp_dir)
            engine = SwissEphemerisEngine(config, swe_module=fake)
            snapshot = AstroCoreService(engine=engine, config=config).calculate_natal_chart(bangkok_request("TH_SIMPLE_RASI_V1"))
        self.assertEqual(snapshot.metadata["node_type"], "mean_node")
        self.assertEqual(snapshot.calculation_profile.node_type, "mean_node")
        self.assertIn(fake.MEAN_NODE, fake.calc_body_ids)
        self.assertNotIn(fake.TRUE_NODE, fake.calc_body_ids)

    def test_calculation_errors_and_logs_do_not_include_raw_birth_data(self) -> None:
        request = ChartRequest(
            calculation_profile_code="TH_NIRAYANA_V1",
            birth_date="1971-03-11",
            birth_time="08:17",
            timezone="Not/AZone",
            latitude=13.7563,
            longitude=100.5018,
            elevation_m=0,
        )
        with patch("logging.Logger._log") as log_call:
            with self.assertRaisesRegex(ValueError, "INVALID_TIMEZONE") as raised:
                AstroCoreService().calculate_natal_chart(request)
        self.assertEqual(log_call.call_count, 0)
        error_message = str(raised.exception)
        self.assertNotIn("1971-03-11", error_message)
        self.assertNotIn("08:17", error_message)
        self.assertNotIn("13.7563", error_message)
        self.assertNotIn("100.5018", error_message)
        self.assertNotIn("Not/AZone", error_message)
        self.assert_sanitized_timezone_error(raised.exception, "Not/AZone", ["1971-03-11", "08:17", "13.7563", "100.5018"])

    def test_engine_outputs_structured_data_without_prediction_prose(self) -> None:
        service = AstroCoreService(config=AstroRuntimeConfig(enable_solar_return=True, enable_hourly_timing=True))
        natal = service.calculate_natal_chart(bangkok_request())
        transit = service.calculate_transit_to_natal(
            TransitSnapshotRequest(
                natal_chart_snapshot=natal,
                transit_datetime_utc="2026-05-06T05:00:00Z",
                calculation_profile_code="TH_NIRAYANA_V1",
                transit_location=TransitLocation(latitude=13.7563, longitude=100.5018),
                orb_settings={"conjunction": 180, "opposition": 180, "square": 180, "trine": 180, "sextile": 180},
            )
        )
        solar = service.calculate_solar_return(
            SolarReturnRequest(
                natal_chart_snapshot=natal,
                solar_return_year=2026,
                location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                calculation_profile_code="TH_NIRAYANA_V1",
            )
        )
        hourly = service.calculate_hourly_timing(
            HourlyTimingRequest(
                natal_chart_snapshot=natal,
                start_datetime_local="2026-05-06T09:00:00",
                end_datetime_local="2026-05-06T13:00:00",
                timezone="Asia/Bangkok",
                location=TransitLocation(latitude=13.7563, longitude=100.5018, timezone="Asia/Bangkok"),
                calculation_profile_code="TH_NIRAYANA_V1",
            )
        )
        encoded = json.dumps(
            {
                "natal": natal.to_json_dict(),
                "transit": transit.to_json_dict(),
                "solar": solar.to_json_dict(),
                "hourly": hourly.to_json_dict(),
            },
            ensure_ascii=False,
            sort_keys=True,
        ).lower()
        forbidden_terms = [
            "prediction",
            "interpretation_text",
            "prose",
            "guaranteed",
            "diagnosis",
            "lottery",
            "death",
            "serious illness",
            "unavoidable harm",
        ]
        for term in forbidden_terms:
            self.assertNotIn(term, encoded)


class FakeSwe(SimpleNamespace):
    SUN = 0
    MOON = 1
    MERCURY = 2
    VENUS = 3
    MARS = 4
    JUPITER = 5
    SATURN = 6
    URANUS = 8
    NEPTUNE = 9
    PLUTO = 10
    TRUE_NODE = 7
    MEAN_NODE = 11
    FLG_SWIEPH = 1
    FLG_SIDEREAL = 2
    FLG_SPEED = 4
    SIDM_LAHIRI = 1

    def __init__(self) -> None:
        super().__init__()
        self.ephe_path = ""
        self.sid_mode_set = False
        self.calc_body_ids: list[int] = []
        self.houses_called = False

    def set_ephe_path(self, path: str) -> None:
        self.ephe_path = path

    def set_sid_mode(self, mode: int, _t0: int, _ayan_t0: int) -> None:
        self.sid_mode_set = mode == self.SIDM_LAHIRI

    def get_ayanamsa_ut(self, _jd_ut: float) -> float:
        return 24.1

    def calc_ut(self, _jd_ut: float, body_id: int, _flags: int) -> tuple[list[float], int]:
        self.calc_body_ids.append(body_id)
        longitude = 10.0 + body_id * 20.0
        speed = -0.05 if body_id in {self.TRUE_NODE, self.MEAN_NODE} else 1.0
        return [longitude, 0.0, 0.0, speed], _flags

    def houses_ex(self, _jd_ut: float, _lat: float, _lon: float, _house_code: bytes, _flags: int) -> tuple[list[float], list[float]]:
        self.houses_called = True
        return [float(index * 30) for index in range(12)], [15.0, 105.0]


class FallbackSwe(FakeSwe):
    def calc_ut(self, _jd_ut: float, body_id: int, _flags: int) -> tuple[list[float], int]:
        raw, _return_flag = super().calc_ut(_jd_ut, body_id, _flags)
        return raw, 0


if __name__ == "__main__":
    unittest.main()
