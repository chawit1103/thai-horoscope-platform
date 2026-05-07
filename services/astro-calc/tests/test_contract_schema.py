from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any, cast

from app.core.calculators import AstroCoreService
from app.schemas import ChartRequest


REPO_ROOT = Path(__file__).resolve().parents[3]
CHART_SCHEMA_PATH = REPO_ROOT / "packages" / "contracts" / "astro" / "chart-snapshot.schema.json"
ASTRO_APP_PATH = REPO_ROOT / "services" / "astro-calc" / "app"


class ChartSnapshotSchemaTests(unittest.TestCase):
    def test_schema_warning_enum_includes_all_emitted_warning_codes(self) -> None:
        schema = _load_chart_schema()
        schema_codes = _warning_enum(schema)
        emitted_codes = _emitted_warning_codes()

        self.assertGreater(len(emitted_codes), 0)
        self.assertEqual(set(), emitted_codes - schema_codes)

    def test_unknown_birth_time_snapshot_warning_codes_validate_against_schema(self) -> None:
        schema = _load_chart_schema()
        schema_codes = _warning_enum(schema)
        snapshot = AstroCoreService().calculate_natal_chart(
            ChartRequest(
                calculation_profile_code="TH_NIRAYANA_V1",
                datetime_local="1990-05-12T00:00:00",
                timezone="Asia/Bangkok",
                latitude=13.7563,
                longitude=100.5018,
                elevation_m=0,
                birth_time_unknown=True,
            )
        )

        warnings = cast(list[dict[str, str]], snapshot.to_json_dict()["warnings"])
        warning_codes = {warning["code"] for warning in warnings}

        self.assertIn("UNKNOWN_BIRTH_TIME", warning_codes)
        self.assertIn("UNKNOWN_BIRTH_TIME_USED_NOON_FALLBACK", warning_codes)
        self.assertIn("FAST_PLANET_POSITIONS_APPROXIMATE", warning_codes)
        self.assertIn("UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE", warning_codes)
        for warning in warnings:
            _validate_warning_against_schema(warning, schema_codes)


def _load_chart_schema() -> dict[str, Any]:
    return cast(dict[str, Any], json.loads(CHART_SCHEMA_PATH.read_text()))


def _warning_enum(schema: dict[str, Any]) -> set[str]:
    warning_def = cast(dict[str, Any], cast(dict[str, Any], schema["$defs"])["warning"])
    properties = cast(dict[str, Any], warning_def["properties"])
    code = cast(dict[str, Any], properties["code"])
    return set(cast(list[str], code["enum"]))


def _emitted_warning_codes() -> set[str]:
    emitted_codes: set[str] = set()
    code_pattern = re.compile(r'WarningMessage\(\s*code="([A-Z0-9_]+)"')
    for path in sorted(ASTRO_APP_PATH.rglob("*.py")):
        for match in code_pattern.finditer(path.read_text()):
            emitted_codes.add(match.group(1))
    return emitted_codes


def _validate_warning_against_schema(warning: dict[str, str], schema_codes: set[str]) -> None:
    required_keys = {"code", "message"}
    actual_keys = set(warning)
    if actual_keys != required_keys:
        raise AssertionError(f"warning keys {actual_keys} do not match schema keys {required_keys}")
    if not isinstance(warning["code"], str):
        raise AssertionError("warning code must be a string")
    if warning["code"] not in schema_codes:
        raise AssertionError(f"warning code {warning['code']} is not in schema enum")
    if not isinstance(warning["message"], str):
        raise AssertionError("warning message must be a string")


if __name__ == "__main__":
    unittest.main()
