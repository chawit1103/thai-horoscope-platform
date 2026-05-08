from __future__ import annotations

import json
import unittest
from dataclasses import dataclass
from importlib.util import find_spec
from pathlib import Path
from typing import Any, cast

from app.config import AstroRuntimeConfig
from app.core.calculators import AstroCoreService
from app.core.math import normalize_deg, sign_index
from app.engines.swisseph import SwissEphemerisEngine
from app.schemas import ChartRequest


@dataclass(frozen=True)
class ExpectedPosition:
    longitude_deg: float
    sign_index: int
    degree_in_sign: float


def dms(sign_index_value: int, degree: int, minute: int, second: int) -> ExpectedPosition:
    degree_value = degree + minute / 60 + second / 3600
    return ExpectedPosition(
        longitude_deg=sign_index_value * 30 + degree_value,
        sign_index=sign_index_value,
        degree_in_sign=degree_value,
    )


def angular_delta(a: float, b: float) -> float:
    diff = abs(normalize_deg(a) - normalize_deg(b)) % 360
    return min(diff, 360 - diff)


def swisseph_moshier_service(profile: str = "TH_NIRAYANA_LAHIRI_MEAN_NODE_SWISSEPH_V1") -> AstroCoreService:
    config = AstroRuntimeConfig(
        engine="swisseph",
        runtime_env="test",
        swisseph_license_mode="free",
        ephemeris_path=None,
        allow_moshier_ephemeris=True,
        calculation_profile=profile,
    )
    return AstroCoreService(engine=SwissEphemerisEngine(config), config=config)


def load_gc002_thai_almanac_fixture() -> dict[str, Any]:
    fixture_path = Path(__file__).resolve().parent / "golden" / "gc002_thai_almanac_reference.json"
    return cast(dict[str, Any], json.loads(fixture_path.read_text()))


class GoldenTests(unittest.TestCase):
    def test_gc001_natal_bangkok_known_time(self) -> None:
        fixture_path = Path(__file__).resolve().parent / "golden" / "gc001_natal_bangkok_known_time.json"
        fixture = cast(dict[str, Any], json.loads(fixture_path.read_text()))
        snapshot = AstroCoreService().calculate_natal_chart(
            ChartRequest(
                calculation_profile_code="TH_NIRAYANA_V1",
                datetime_local="1990-05-12T08:30:00",
                timezone="Asia/Bangkok",
                latitude=13.7563,
                longitude=100.5018,
                elevation_m=0,
                time_accuracy_minutes=5,
            )
        )
        actual = snapshot.to_json_dict()
        actual_planets = cast(dict[str, Any], actual["planets"])
        fixture_planets = cast(dict[str, Any], fixture["planets"])
        actual_houses = cast(dict[str, Any], actual["houses"])
        fixture_houses = cast(dict[str, Any], fixture["houses"])
        actual_angles = cast(dict[str, Any], actual["angles"])
        fixture_angles = cast(dict[str, Any], fixture["angles"])
        self.assertEqual(actual["engine"], fixture["engine"])
        self.assertEqual(actual["engine_name"], fixture["engine_name"])
        self.assertEqual(actual["chart_type"], fixture["chart_type"])
        self.assertEqual(actual["calculation_profile_code"], fixture["calculation_profile_code"])
        self.assertEqual(actual["datetime"], fixture["datetime"])
        self.assertEqual(actual["location"], fixture["location"])
        self.assertEqual(actual["zodiac"], fixture["zodiac"])
        self.assertEqual(actual["datetime_local"], fixture["datetime_local"])
        self.assertEqual(actual["datetime_utc"], fixture["datetime_utc"])
        self.assertEqual(actual["calculation_hash"], fixture["calculation_hash"])
        self.assertEqual(actual["ayanamsa_deg"], fixture["ayanamsa_deg"])
        self.assertEqual(actual_planets["sun"], fixture_planets["sun"])
        self.assertEqual(actual_houses["ascendant_deg"], fixture_houses["ascendant_deg"])
        self.assertEqual(actual_angles, fixture_angles)
        self.assertEqual(actual["warnings"], fixture["warnings"])

    @unittest.skipUnless(find_spec("swisseph"), "pyswisseph is required for Swiss/Moshier golden validation")
    def test_gc002_thai_nirayana_lahiri_mean_node_reference_chart(self) -> None:
        snapshot = swisseph_moshier_service().calculate_natal_chart(
            ChartRequest(
                calculation_profile_code="TH_NIRAYANA_LAHIRI_MEAN_NODE_SWISSEPH_V1",
                datetime_local="1971-03-11T08:17:00",
                timezone="Asia/Bangkok",
                latitude=13.759,
                longitude=100.535,
                elevation_m=0,
                time_accuracy_minutes=1,
            )
        )
        expected = {
            "sun": dms(10, 26, 21, 44),
            "moon": dms(4, 14, 58, 28),
            "mars": dms(8, 5, 42, 36),
            "mercury": dms(11, 0, 21, 2),
            "jupiter": dms(7, 12, 45, 28),
            "venus": dms(9, 14, 39, 4),
            "saturn": dms(0, 24, 41, 10),
            "rahu": dms(9, 28, 50, 46),
            "uranus": dms(5, 18, 59, 13),
            "neptune": dms(7, 9, 36, 27),
            "pluto": dms(5, 5, 8, 46),
        }

        self.assertEqual(snapshot.engine, "swisseph")
        self.assertNotEqual(snapshot.engine, "mock")
        self.assertEqual(snapshot.ephemeris_source, "swiss-ephemeris-moshier")
        self.assertEqual(snapshot.datetime_local, "1971-03-11T08:17:00")
        self.assertEqual(snapshot.datetime_utc, "1971-03-11T01:17:00Z")
        self.assertEqual(snapshot.datetime.timezone, "Asia/Bangkok")
        self.assertEqual(snapshot.calculation_profile_code, "TH_NIRAYANA_LAHIRI_MEAN_NODE_SWISSEPH_V1")
        self.assertEqual(snapshot.zodiac.type, "sidereal")
        self.assertEqual(snapshot.zodiac.ayanamsa_code, "LAHIRI")
        self.assertAlmostEqual(snapshot.ayanamsa_deg or 0, dms(0, 23, 27, 16).degree_in_sign, delta=0.01)
        self.assertEqual(snapshot.calculation_profile.node_type, "mean_node")
        self.assertEqual(snapshot.metadata["node_type"], "mean_node")
        self.assertEqual(snapshot.metadata["house_system"], "whole_sign")

        for name, position in expected.items():
            planet = snapshot.planets[name]
            with self.subTest(planet=name):
                self.assertLessEqual(angular_delta(planet.sidereal_longitude_deg, position.longitude_deg), 0.1)
                self.assertEqual(planet.sign_index, position.sign_index)
                self.assertAlmostEqual(planet.degree_in_sign, position.degree_in_sign, delta=0.1)
                self.assertAlmostEqual(
                    planet.sidereal_longitude_deg,
                    normalize_deg(planet.tropical_longitude_deg - (planet.ayanamsa_deg or 0)),
                    places=6,
                )
                self.assertEqual(planet.longitude_deg, planet.sidereal_longitude_deg)

        self.assertAlmostEqual(snapshot.angles.mc_deg or 0, dms(8, 22, 59, 36).longitude_deg, delta=0.1)
        self.assertAlmostEqual(snapshot.houses.mc_deg or 0, dms(8, 22, 59, 36).longitude_deg, delta=0.1)
        self.assertAlmostEqual(
            snapshot.planets["ketu"].sidereal_longitude_deg,
            normalize_deg(snapshot.planets["rahu"].sidereal_longitude_deg + 180),
            places=6,
        )

    @unittest.skipUnless(find_spec("swisseph"), "pyswisseph is required for Swiss/Moshier golden validation")
    def test_gc002_thai_almanac_lagna_matches_reference_without_changing_astro_ascendant(self) -> None:
        fixture = load_gc002_thai_almanac_fixture()
        snapshot = swisseph_moshier_service("TH_ALMANAC_LAHIRI_MEAN_NODE_SWISSEPH_V1").calculate_natal_chart(
            ChartRequest(
                calculation_profile_code=str(fixture["calculation_profile_code"]),
                datetime_local=str(fixture["datetime_local"]),
                timezone=str(fixture["timezone"]),
                latitude=float(fixture["latitude"]),
                longitude=float(fixture["longitude"]),
            )
        )

        expected = cast(dict[str, float], fixture["expected"])
        expected_thai_lagna = ExpectedPosition(longitude_deg=expected["thai_lagna_deg"], sign_index=11, degree_in_sign=19.6)
        self.assertEqual(snapshot.metadata["lagna_method"], "thai_antonathi_saman_local_time_sunrise")
        self.assertEqual(snapshot.metadata["lagna_source"], "local_mean_time_plus_sunrise_sun")
        self.assertEqual(snapshot.metadata["sunrise_local_time"], "06:29")
        self.assertAlmostEqual(float(snapshot.metadata["local_time_correction_minutes"]), -17.86, delta=0.01)
        self.assertGreater(angular_delta(snapshot.angles.ascendant_deg or 0, expected_thai_lagna.longitude_deg), 1)
        self.assertLessEqual(angular_delta(snapshot.angles.lagna_deg or 0, expected_thai_lagna.longitude_deg), 0.1)
        self.assertLessEqual(angular_delta(snapshot.angles.mc_deg or 0, expected["mc_deg"]), 0.1)
        self.assertEqual(snapshot.metadata["astronomical_ascendant"], str(round(snapshot.angles.ascendant_deg or 0, 8)))
        self.assertIn("astronomical_ascendant", snapshot.derived_points)
        self.assertIn("lagna", snapshot.derived_points)

    @unittest.skipUnless(find_spec("swisseph"), "pyswisseph is required for Swiss/Moshier golden validation")
    def test_gc002_separates_south_node_from_traditional_thai_ketu_9_fixture(self) -> None:
        fixture = load_gc002_thai_almanac_fixture()
        snapshot = swisseph_moshier_service("TH_ALMANAC_LAHIRI_MEAN_NODE_SWISSEPH_V1").calculate_natal_chart(
            ChartRequest(
                calculation_profile_code=str(fixture["calculation_profile_code"]),
                datetime_local=str(fixture["datetime_local"]),
                timezone=str(fixture["timezone"]),
                latitude=float(fixture["latitude"]),
                longitude=float(fixture["longitude"]),
            )
        )

        expected = cast(dict[str, float], fixture["expected"])
        thai_ketu_9_fixture = ExpectedPosition(
            longitude_deg=expected["thai_ketu_9_deg"],
            sign_index=5,
            degree_in_sign=26 + 23 / 60,
        )
        self.assertEqual(snapshot.metadata["node_type"], "mean_node")
        self.assertEqual(snapshot.metadata["ketu_method"], "south_node")
        self.assertEqual(snapshot.metadata["thai_ketu_9_method"], "thai_ketu_9_unsupported")
        self.assertAlmostEqual(
            snapshot.planets["ketu"].sidereal_longitude_deg,
            normalize_deg(snapshot.planets["rahu"].sidereal_longitude_deg + 180),
            places=6,
        )
        self.assertEqual(sign_index(snapshot.planets["ketu"].sidereal_longitude_deg), 3)
        self.assertEqual(thai_ketu_9_fixture.sign_index, 5)
        self.assertGreater(angular_delta(snapshot.planets["ketu"].sidereal_longitude_deg, thai_ketu_9_fixture.longitude_deg), 1)

    @unittest.skipUnless(find_spec("swisseph"), "pyswisseph is required for Swiss/Moshier golden validation")
    def test_gc002_non_almanac_profile_labels_lagna_as_astronomical_ascendant(self) -> None:
        snapshot = swisseph_moshier_service().calculate_natal_chart(
            ChartRequest(
                calculation_profile_code="TH_NIRAYANA_LAHIRI_MEAN_NODE_SWISSEPH_V1",
                datetime_local="1971-03-11T08:17:00",
                timezone="Asia/Bangkok",
                latitude=13.759,
                longitude=100.535,
            )
        )

        self.assertEqual(snapshot.metadata["lagna_method"], "astronomical_ascendant")
        self.assertEqual(snapshot.metadata["lagna_source"], "astronomical_ascendant")
        self.assertEqual(snapshot.angles.lagna_deg, snapshot.angles.ascendant_deg)
        self.assertEqual(snapshot.metadata["sunrise_local_time"], "")


if __name__ == "__main__":
    unittest.main()
