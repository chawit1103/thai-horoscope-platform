from __future__ import annotations

import json
import unittest
from pathlib import Path
from typing import Any, cast

from app.core.calculators import AstroCoreService
from app.schemas import ChartRequest


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


if __name__ == "__main__":
    unittest.main()
