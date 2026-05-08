from __future__ import annotations

from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from app.config import AstroRuntimeConfig
from app.core.aspects import calculate_aspects, calculate_cross_aspects, calculate_transit_to_natal_hits
from app.core.math import angular_distance, sign_index, stable_hash
from app.core.profiles import get_profile, lagna_method_for_profile, thai_ketu_method_for_profile, validate_profile_engine_compatibility
from app.core.storage import ChartSnapshotStore
from app.core.thai_lagna import ThaiLagnaResult, calculate_thai_antonathi_saman_lagna, reference_sunrise_local_datetime
from app.core.time import (
    birth_datetime_local,
    date_from_datetime_local,
    julian_day_ut,
    local_to_utc,
    normalize_birth_time,
    parse_birth_date,
    parse_datetime_local,
    parse_datetime_snapshot_local,
    parse_datetime_utc,
    parse_timezone,
    utc_to_iso,
    validate_timezone,
)
from app.core.zodiac import degree_in_sign, sign_name_en, sign_name_th, whole_sign_house_number
from app.engines.base import AstroEngine
from app.engines.mock import MockAstroEngine
from app.schemas import (
    Angles,
    Ayanamsha,
    ChartRequest,
    ChartSnapshot,
    Houses,
    HourlyTimingRequest,
    HourlyTimingResult,
    HourlyTimingWindow,
    DateTimeInfo,
    EngineInfo,
    LocationInfo,
    PlanetPosition,
    SolarReturn,
    SolarReturnRequest,
    TransitComparison,
    TransitLocation,
    TransitRequest,
    TransitSnapshotRequest,
    TransitToNatalHit,
    WarningMessage,
    ZodiacInfo,
)


class SolarReturnSearchResult:
    def __init__(self, datetime_utc: datetime, warnings: list[WarningMessage]) -> None:
        self.datetime_utc = datetime_utc
        self.warnings = warnings


class TimingRangeResult:
    def __init__(self, start_utc: datetime, end_utc: datetime, warning: WarningMessage | None = None) -> None:
        self.start_utc = start_utc
        self.end_utc = end_utc
        self.warning = warning


class SnapshotDateTimeValidation:
    def __init__(self, local: datetime, utc: datetime) -> None:
        self.local = local
        self.utc = utc


class AstroCoreService:
    def __init__(
        self,
        engine: AstroEngine | None = None,
        config: AstroRuntimeConfig | None = None,
        store: ChartSnapshotStore | None = None,
    ) -> None:
        self.config = config or AstroRuntimeConfig()
        if engine is None:
            if self.config.engine != "mock":
                raise ValueError(
                    "ASTRO_ENGINE_CONFIG_REQUIRES_EXPLICIT_ENGINE: "
                    "direct AstroCoreService construction with non-mock config.engine requires an injected engine; use create_service()."
                )
            engine = MockAstroEngine()
        if engine.name != self.config.engine:
            raise ValueError(
                "ASTRO_ENGINE_CONFIG_MISMATCH: "
                f"config.engine={self.config.engine!r} cannot use injected engine {engine.name!r}."
            )
        self.engine = engine
        self.store = store or ChartSnapshotStore()

    def calculate_natal_chart(self, request: ChartRequest) -> ChartSnapshot:
        return self.store.store(self._calculate_chart(request))

    def calculate_transit_comparison(self, request: TransitRequest) -> TransitComparison:
        natal = self.calculate_natal_chart(request.natal)
        transit_timezone = validate_timezone(request.transit_timezone)
        transit_utc = utc_to_iso(local_to_utc(request.transit_datetime_local, transit_timezone))
        return self.calculate_transit_to_natal(
            TransitSnapshotRequest(
                natal_chart_snapshot=natal,
                transit_datetime_utc=transit_utc,
                calculation_profile_code=request.natal.calculation_profile_code,
                transit_location=TransitLocation(
                    latitude=request.natal.latitude,
                    longitude=request.natal.longitude,
                    timezone=transit_timezone,
                    elevation_m=request.natal.elevation_m,
                ),
            )
        )

    def calculate_transit_to_natal(self, request: TransitSnapshotRequest) -> TransitComparison:
        natal = request.natal_chart_snapshot
        validated_natal_datetime = validate_chart_snapshot_datetimes(natal)
        profile = get_profile(request.calculation_profile_code)
        transit_utc = parse_transit_datetime_utc(request.transit_datetime_utc)
        transit_location = validated_transit_location(request.transit_location)
        transit_request = ChartRequest(
            calculation_profile_code=request.calculation_profile_code,
            datetime_local=transit_utc.replace(tzinfo=None).isoformat(timespec="seconds"),
            timezone="UTC",
            latitude=transit_location.latitude if transit_location else 0,
            longitude=transit_location.longitude if transit_location else 0,
            elevation_m=transit_location.elevation_m if transit_location else 0,
            time_accuracy_minutes=None,
            birth_time_unknown=False,
        )
        transit = self.store.store(self._calculate_chart(transit_request))
        aspect_orbs = request.orb_settings or profile.aspect_orbs_deg
        natal_points = {**natal.planets, **natal.derived_points}
        cross_aspects = calculate_cross_aspects(transit.planets, natal_points, aspect_orbs)
        hits = calculate_transit_to_natal_hits(transit.planets, natal_points, aspect_orbs)
        scoring_ready = build_transit_scoring_ready(hits)
        calculation_hash = stable_hash(
            {
                "kind": "transit_to_natal",
                "natal": natal.calculation_hash,
                "natal_datetime_local": validated_natal_datetime.local.isoformat(timespec="seconds"),
                "natal_datetime_utc": utc_to_iso(validated_natal_datetime.utc),
                "transit": transit.calculation_hash,
                "aspect_orbs": aspect_orbs,
                "aspects": [asdict(a) for a in cross_aspects],
                "hits": [asdict(hit) for hit in hits],
            }
        )
        return TransitComparison(
            natal=natal,
            transit=transit,
            natal_chart_snapshot=natal,
            transit_chart_snapshot=transit,
            transit_planets=transit.planets,
            natal_planets=natal.planets,
            aspects=cross_aspects,
            transit_to_natal_aspects=cross_aspects,
            transit_to_natal_hits=hits,
            scoring_ready=scoring_ready,
            calculation_hash=calculation_hash,
        )

    def calculate_solar_return(self, request: SolarReturnRequest) -> SolarReturn:
        if not self.config.enable_solar_return:
            raise PermissionError("Solar return calculation is disabled by ASTRO_ENABLE_SOLAR_RETURN.")
        natal = request.natal_chart_snapshot
        if natal is None:
            if request.natal is None:
                raise ValueError("Solar return requires natal_chart_snapshot or natal chart input.")
            natal = self.calculate_natal_chart(request.natal)
        year = request.solar_return_year or request.return_year
        if year is None:
            raise ValueError("Solar return requires solar_return_year.")
        validated_natal_datetime = validate_chart_snapshot_datetimes(natal)
        propagated_warnings = timing_warnings_from_natal(natal)
        profile_code = request.calculation_profile_code or natal.calculation_profile_code
        profile = get_profile(profile_code)
        target = sun_reference_longitude(natal, profile.zodiac_type)
        location = validated_transit_location(request.location) or location_from_natal_request(request.natal)
        bracket_center = solar_return_search_center(validated_natal_datetime.local, year, location)
        search = self._find_solar_return(
            target=target,
            profile_code=profile_code,
            zodiac_type=profile.zodiac_type,
            center_utc=bracket_center,
            location=location,
            accuracy_arc_minutes=request.accuracy_arc_minutes,
            max_iterations=request.max_iterations,
        )
        warnings = dedupe_warnings([*propagated_warnings, *search.warnings])
        return_chart = self.store.store(self._calculate_chart(chart_request_for_utc(profile_code, search.datetime_utc, location)))
        sun_at_return = sun_reference_longitude(return_chart, profile.zodiac_type)
        delta_arc_seconds = round(angular_distance(sun_at_return, target) * 3600, 6)
        calculation_hash = stable_hash(
            {
                "kind": "solar_return",
                "year": year,
                "natal": natal.calculation_hash,
                "natal_datetime_local": validated_natal_datetime.local.isoformat(timespec="seconds"),
                "natal_datetime_utc": utc_to_iso(validated_natal_datetime.utc),
                "return": return_chart.calculation_hash,
                "target": target,
                "sun_at_return": sun_at_return,
                "delta_arc_seconds": delta_arc_seconds,
                "warnings": [asdict(warning) for warning in warnings],
            }
        )
        datetime_utc = utc_to_iso(search.datetime_utc)
        datetime_local = utc_to_local_iso(search.datetime_utc, location.timezone if location else "UTC")
        return SolarReturn(
            year=year,
            solar_return_utc=datetime_utc,
            target_sun_longitude_deg=target,
            chart=return_chart,
            solar_return_datetime_utc=datetime_utc,
            solar_return_datetime_local=datetime_local,
            sun_longitude_at_return=sun_at_return,
            natal_sun_longitude_reference=target,
            delta_arc_seconds=delta_arc_seconds,
            solar_return_chart_snapshot=return_chart,
            warnings=warnings,
            calculation_hash=calculation_hash,
        )

    def calculate_hourly_timing(self, request: HourlyTimingRequest) -> HourlyTimingResult:
        if not self.config.enable_hourly_timing:
            raise PermissionError("Hourly timing calculation is disabled by ASTRO_ENABLE_HOURLY_TIMING.")
        natal = request.natal_chart_snapshot
        if natal is None:
            if request.natal is None:
                raise ValueError("Hourly timing requires natal_chart_snapshot or natal chart input.")
            natal = self.calculate_natal_chart(request.natal)
        validated_natal_datetime = validate_chart_snapshot_datetimes(natal)
        profile_code = request.calculation_profile_code or natal.calculation_profile_code
        profile = get_profile(profile_code)
        aspect_orbs = request.orb_thresholds or profile.aspect_orbs_deg
        enabled_aspects = set(request.enabled_aspect_types)
        propagated_warnings = timing_warnings_from_natal(natal)
        timezone = validate_timezone(request.timezone)
        location = validated_transit_location(request.location)
        range_result = resolve_timing_range(request, timezone)
        if range_result.warning:
            warnings = dedupe_warnings([range_result.warning, *propagated_warnings])
            calculation_hash = stable_hash(
                {
                    "kind": "hourly_timing",
                    "natal": natal.calculation_hash,
                    "natal_datetime_local": validated_natal_datetime.local.isoformat(timespec="seconds"),
                    "natal_datetime_utc": utc_to_iso(validated_natal_datetime.utc),
                    "range_warning": asdict(range_result.warning),
                    "profile": profile_code,
                    "timezone": timezone,
                    "warnings": [asdict(warning) for warning in warnings],
                }
            )
            return HourlyTimingResult(
                date_local=request.date_local,
                timezone=timezone,
                timing_windows=[],
                windows=[],
                warnings=warnings,
                calculation_hash=calculation_hash,
            )
        timing_windows = self._calculate_timing_windows(
            natal=natal,
            profile_code=profile_code,
            timezone=timezone,
            location=location,
            start_utc=range_result.start_utc,
            end_utc=range_result.end_utc,
            aspect_orbs=aspect_orbs,
            enabled_aspects=enabled_aspects,
        )
        calculation_hash = stable_hash(
            {
                "kind": "hourly_timing",
                "natal": natal.calculation_hash,
                "natal_datetime_local": validated_natal_datetime.local.isoformat(timespec="seconds"),
                "natal_datetime_utc": utc_to_iso(validated_natal_datetime.utc),
                "start": utc_to_iso(range_result.start_utc),
                "end": utc_to_iso(range_result.end_utc),
                "timezone": timezone,
                "location": asdict(location) if location else None,
                "profile": profile_code,
                "enabled_aspects": sorted(enabled_aspects),
                "aspect_orbs": aspect_orbs,
                "windows": [asdict(window) for window in timing_windows],
                "warnings": [asdict(warning) for warning in propagated_warnings],
            }
        )
        return HourlyTimingResult(
            date_local=request.date_local,
            timezone=timezone,
            timing_windows=timing_windows,
            windows=timing_windows,
            warnings=propagated_warnings,
            calculation_hash=calculation_hash,
        )

    def _calculate_timing_windows(
        self,
        *,
        natal: ChartSnapshot,
        profile_code: str,
        timezone: str,
        location: TransitLocation | None,
        start_utc: datetime,
        end_utc: datetime,
        aspect_orbs: dict[str, float],
        enabled_aspects: set[str],
    ) -> list[HourlyTimingWindow]:
        natal_points = {**natal.planets, **natal.derived_points}
        candidates: dict[tuple[str, str, str], tuple[HourlyTimingWindow, float]] = {}
        current = start_utc
        while current < end_utc:
            window_end = min(current + timedelta(hours=1), end_utc)
            samples = [current, current + (window_end - current) / 2, window_end]
            for sample in samples:
                chart = self._calculate_chart(chart_request_for_utc(profile_code, sample, location))
                hits = calculate_transit_to_natal_hits(chart.planets, natal_points, aspect_orbs)
                for hit in hits:
                    if hit.aspect_type not in enabled_aspects:
                        continue
                    key = (hit.transit_planet, hit.natal_point, hit.aspect_type)
                    existing = candidates.get(key)
                    if existing is not None and existing[1] <= hit.exact_orb_deg:
                        continue
                    window = build_hourly_timing_window(
                        start_utc=current,
                        end_utc=window_end,
                        peak_utc=sample,
                        timezone=timezone,
                        hit=hit,
                    )
                    candidates[key] = (window, hit.exact_orb_deg)
            current = window_end
        return [window for window, _orb in sorted(candidates.values(), key=lambda item: (item[0].start_datetime_utc, item[0].transit_planet, item[0].natal_point, item[0].aspect_type))]

    def _find_solar_return(
        self,
        *,
        target: float,
        profile_code: str,
        zodiac_type: str,
        center_utc: datetime,
        location: TransitLocation | None,
        accuracy_arc_minutes: float,
        max_iterations: int,
    ) -> SolarReturnSearchResult:
        warnings: list[WarningMessage] = []
        bracket = self._bracket_solar_return(target, profile_code, zodiac_type, center_utc, location)
        if bracket is None:
            best = self._best_solar_return_candidate(target, profile_code, zodiac_type, center_utc, location)
            warnings.append(WarningMessage(code="SOLAR_RETURN_CONVERGENCE_FAILED", message="Could not bracket the solar return within the configured search window."))
            return SolarReturnSearchResult(best, warnings)
        low, high = bracket
        low_delta = signed_solar_delta(self._sun_at(profile_code, zodiac_type, low, location), target)
        high_delta = signed_solar_delta(self._sun_at(profile_code, zodiac_type, high, location), target)
        best = low if abs(low_delta) <= abs(high_delta) else high
        best_delta = min(abs(low_delta), abs(high_delta))
        tolerance_deg = max(0.0, accuracy_arc_minutes) / 60
        for _iteration in range(max(0, max_iterations)):
            midpoint = low + (high - low) / 2
            midpoint_delta = signed_solar_delta(self._sun_at(profile_code, zodiac_type, midpoint, location), target)
            if abs(midpoint_delta) < best_delta:
                best = midpoint
                best_delta = abs(midpoint_delta)
            if abs(midpoint_delta) <= tolerance_deg:
                return SolarReturnSearchResult(midpoint, warnings)
            if low_delta == 0:
                return SolarReturnSearchResult(low, warnings)
            if high_delta == 0:
                return SolarReturnSearchResult(high, warnings)
            if low_delta * midpoint_delta <= 0:
                high = midpoint
                high_delta = midpoint_delta
            else:
                low = midpoint
                low_delta = midpoint_delta
        warnings.append(WarningMessage(code="SOLAR_RETURN_CONVERGENCE_FAILED", message="Solar return search did not converge within the configured iteration limit."))
        return SolarReturnSearchResult(best, warnings)

    def _bracket_solar_return(
        self,
        target: float,
        profile_code: str,
        zodiac_type: str,
        center_utc: datetime,
        location: TransitLocation | None,
    ) -> tuple[datetime, datetime] | None:
        previous = center_utc - timedelta(days=8)
        previous_delta = signed_solar_delta(self._sun_at(profile_code, zodiac_type, previous, location), target)
        step = timedelta(hours=6)
        for step_index in range(1, 65):
            candidate = center_utc - timedelta(days=8) + step * step_index
            candidate_delta = signed_solar_delta(self._sun_at(profile_code, zodiac_type, candidate, location), target)
            if previous_delta == 0:
                return (previous, previous)
            if previous_delta * candidate_delta <= 0:
                return (previous, candidate)
            previous = candidate
            previous_delta = candidate_delta
        return None

    def _best_solar_return_candidate(
        self,
        target: float,
        profile_code: str,
        zodiac_type: str,
        center_utc: datetime,
        location: TransitLocation | None,
    ) -> datetime:
        best = center_utc
        best_distance = 360.0
        for hour_offset in range(-192, 193, 6):
            candidate = center_utc + timedelta(hours=hour_offset)
            distance = angular_distance(self._sun_at(profile_code, zodiac_type, candidate, location), target)
            if distance < best_distance:
                best = candidate
                best_distance = distance
        return best

    def _sun_at(self, profile_code: str, zodiac_type: str, value_utc: datetime, location: TransitLocation | None) -> float:
        chart = self._calculate_chart(chart_request_for_utc(profile_code, value_utc, location))
        return sun_reference_longitude(chart, zodiac_type)

    def _calculate_chart(self, request: ChartRequest) -> ChartSnapshot:
        profile = get_profile(request.calculation_profile_code)
        validate_profile_engine_compatibility(profile, self.engine.name)
        timezone = validate_timezone(request.timezone)
        datetime_local = resolve_datetime_local(request)
        parsed_datetime_local = parse_datetime_local(datetime_local)
        canonical_datetime_local = parsed_datetime_local.isoformat(timespec="seconds")
        warnings = validate_request_warnings(request, parsed_datetime_local)
        utc_dt = local_to_utc(canonical_datetime_local, timezone)
        jd_ut = round(julian_day_ut(utc_dt), 8)
        ayanamsha_value = self.engine.ayanamsha_deg(jd_ut, profile.ayanamsha)
        planets = self.engine.planet_positions(jd_ut, profile.planets, profile.ayanamsha, profile.node_type)
        houses_reliable = can_calculate_reliable_houses(request)
        houses = self.engine.houses(jd_ut, request.latitude, request.longitude, profile.house_system, houses_reliable)
        if request.birth_time_unknown:
            warnings.append(WarningMessage(code="UNKNOWN_BIRTH_TIME", message="Birth time is unknown; time-sensitive calculations are reduced."))
            warnings.append(
                WarningMessage(
                    code="UNKNOWN_BIRTH_TIME_USED_NOON_FALLBACK",
                    message="Supplied or missing clock time was ignored because birth time is unknown; local noon fallback was used.",
                )
            )
            warnings.append(
                WarningMessage(
                    code="FAST_PLANET_POSITIONS_APPROXIMATE",
                    message="Moon and other fast-moving planet positions are approximate for unknown-time births.",
                )
            )
            warnings.append(WarningMessage(code="UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE", message="Ascendant and houses are not reliable because birth time is unknown."))
        lagna_method = lagna_method_for_profile(profile.code)
        thai_lagna_result = self._calculate_thai_lagna(
            lagna_method=lagna_method,
            profile_ayanamsha=profile.ayanamsha,
            profile_node_type=profile.node_type,
            local_datetime=parsed_datetime_local,
            timezone=timezone,
            latitude=request.latitude,
            longitude=request.longitude,
            houses_reliable=houses_reliable,
        )
        lagna_deg = thai_lagna_result.lagna_deg if thai_lagna_result else None
        angles = build_angles(houses, lagna_deg=lagna_deg)
        house_snapshot = rebase_whole_sign_houses(houses, lagna_deg)
        planets = assign_planet_houses(planets, house_snapshot)
        derived_points = build_derived_points(
            house_snapshot,
            ayanamsha_value,
            lagna_deg=lagna_deg,
            astronomical_ascendant_deg=houses.ascendant_deg,
        )
        aspects = calculate_aspects(planets, profile.aspect_orbs_deg)
        hash_payload = {
            "datetime_local": canonical_datetime_local,
            "datetime_utc": utc_to_iso(utc_dt),
            "latitude": round(request.latitude, 6),
            "longitude": round(request.longitude, 6),
            "elevation_m": round(request.elevation_m, 2),
            "profile": asdict(profile),
            "engine": self.engine.name,
            "engine_version": self.engine.version,
            "ephemeris_fingerprint": self.engine.ephemeris_fingerprint,
            "birth_time_unknown": request.birth_time_unknown,
        }
        calculation_hash = stable_hash(hash_payload)
        return ChartSnapshot(
            chart_type="natal",
            engine=self.engine.name,
            engine_info=EngineInfo(
                name=self.engine.name,
                version=self.engine.version,
                license_mode=self.config.swisseph_license_mode,
                ephemeris_path_configured=bool(self.config.ephemeris_path),
                ephemeris_fingerprint=self.engine.ephemeris_fingerprint,
            ),
            engine_version=self.engine.version,
            ephemeris_source=self.engine.ephemeris_source,
            ephemeris_fingerprint=self.engine.ephemeris_fingerprint,
            calculation_profile_code=profile.code,
            calculation_profile=profile,
            datetime=DateTimeInfo(
                local=local_with_offset_iso(canonical_datetime_local, timezone),
                utc=utc_to_iso(utc_dt),
                timezone=timezone,
                julian_day_ut=jd_ut,
            ),
            datetime_local=canonical_datetime_local,
            datetime_utc=utc_to_iso(utc_dt),
            julian_day_ut=jd_ut,
            location=LocationInfo(
                latitude=request.latitude,
                longitude=request.longitude,
                elevation_m=request.elevation_m,
            ),
            calculation_hash=calculation_hash,
            zodiac=ZodiacInfo(
                type=profile.zodiac_type,
                ayanamsa_code=profile.ayanamsha.upper(),
                ayanamsa_deg=ayanamsha_value,
            ),
            ayanamsa_deg=ayanamsha_value,
            ayanamsha=Ayanamsha(name=profile.ayanamsha, value_deg=ayanamsha_value),
            planets=planets,
            houses=house_snapshot,
            angles=angles,
            derived_points=derived_points,
            aspects=aspects,
            warnings=warnings,
            metadata={
                "zodiac_type": profile.zodiac_type,
                "node_type": profile.node_type,
                "ketu_method": "south_node",
                "thai_ketu_9_method": thai_ketu_method_for_profile(profile.code),
                "house_system": profile.house_system,
                "lagna_method": lagna_method,
                "lagna_source": thai_lagna_result.lagna_source if thai_lagna_result else "astronomical_ascendant",
                "astronomical_ascendant": "" if houses.ascendant_deg is None else str(round(houses.ascendant_deg, 8)),
                "local_time_correction_minutes": ""
                if thai_lagna_result is None
                else str(thai_lagna_result.local_time_correction_minutes),
                "sunrise_local_time": "" if thai_lagna_result is None else thai_lagna_result.sunrise_local_time,
                "calculation_profile_version": profile.code,
            },
        )

    def _calculate_thai_lagna(
        self,
        *,
        lagna_method: str,
        profile_ayanamsha: str,
        profile_node_type: str,
        local_datetime: datetime,
        timezone: str,
        latitude: float,
        longitude: float,
        houses_reliable: bool,
    ) -> ThaiLagnaResult | None:
        if lagna_method != "thai_antonathi_saman_local_time_sunrise" or not houses_reliable:
            return None
        sunrise = reference_sunrise_local_datetime(
            local_datetime=local_datetime,
            timezone=timezone,
            latitude=latitude,
            longitude=longitude,
        )
        sunrise_local = sunrise.isoformat(timespec="seconds")
        sunrise_utc = local_to_utc(sunrise_local, timezone)
        sunrise_jd_ut = round(julian_day_ut(sunrise_utc), 8)
        sunrise_sun = self.engine.planet_positions(sunrise_jd_ut, ["sun"], profile_ayanamsha, profile_node_type)["sun"]
        return calculate_thai_antonathi_saman_lagna(
            local_datetime=local_datetime,
            timezone=timezone,
            latitude=latitude,
            longitude=longitude,
            sunrise_sun_sidereal_longitude_deg=sunrise_sun.sidereal_longitude_deg,
        )


TIMING_NATAL_WARNING_CODES = {
    "UNKNOWN_BIRTH_TIME",
    "UNKNOWN_BIRTH_TIME_USED_NOON_FALLBACK",
    "FAST_PLANET_POSITIONS_APPROXIMATE",
    "UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE",
}


def timing_warnings_from_natal(natal: ChartSnapshot) -> list[WarningMessage]:
    return dedupe_warnings([warning for warning in natal.warnings if warning.code in TIMING_NATAL_WARNING_CODES])


def dedupe_warnings(warnings: list[WarningMessage]) -> list[WarningMessage]:
    seen: set[str] = set()
    deduped: list[WarningMessage] = []
    for warning in warnings:
        if warning.code in seen:
            continue
        seen.add(warning.code)
        deduped.append(warning)
    return deduped


def parse_transit_datetime_utc(value: str) -> datetime:
    return parse_datetime_utc(value, "INVALID_TRANSIT_DATETIME_UTC")


def chart_request_for_utc(profile_code: str, value_utc: datetime, location: TransitLocation | None) -> ChartRequest:
    return ChartRequest(
        calculation_profile_code=profile_code,
        datetime_local=value_utc.astimezone(UTC).replace(tzinfo=None).isoformat(timespec="seconds"),
        timezone="UTC",
        latitude=location.latitude if location else 0,
        longitude=location.longitude if location else 0,
        elevation_m=location.elevation_m if location else 0,
        birth_time_unknown=False,
    )


def validated_transit_location(location: TransitLocation | None) -> TransitLocation | None:
    if location is None:
        return None
    timezone = validate_timezone(location.timezone)
    return TransitLocation(
        latitude=location.latitude,
        longitude=location.longitude,
        timezone=timezone,
        elevation_m=location.elevation_m,
    )


def resolve_timing_range(request: HourlyTimingRequest, timezone: str) -> TimingRangeResult:
    fallback = datetime(1970, 1, 1, tzinfo=UTC)
    if request.period_granularity != "hourly":
        return TimingRangeResult(
            fallback,
            fallback,
            WarningMessage(code="UNSUPPORTED_TIMING_RANGE", message="Only hourly timing granularity is currently supported."),
        )
    if request.start_datetime_utc and request.end_datetime_utc:
        start = parse_transit_datetime_utc(request.start_datetime_utc)
        end = parse_transit_datetime_utc(request.end_datetime_utc)
    elif request.start_datetime_local and request.end_datetime_local:
        start = local_to_utc(request.start_datetime_local, timezone)
        end = local_to_utc(request.end_datetime_local, timezone)
    elif request.date_local:
        start = local_to_utc(f"{request.date_local}T00:00:00", timezone)
        end = local_to_utc(f"{request.date_local}T23:59:59", timezone) + timedelta(seconds=1)
    else:
        return TimingRangeResult(
            fallback,
            fallback,
            WarningMessage(code="UNSUPPORTED_TIMING_RANGE", message="Hourly timing requires a date or start/end range."),
        )
    if end <= start:
        return TimingRangeResult(
            start,
            end,
            WarningMessage(code="UNSUPPORTED_TIMING_RANGE", message="Hourly timing end must be after start."),
        )
    if end - start > timedelta(days=7):
        return TimingRangeResult(
            start,
            end,
            WarningMessage(code="UNSUPPORTED_TIMING_RANGE", message="Hourly timing prototype supports ranges up to 7 days."),
        )
    return TimingRangeResult(start, end)


def build_hourly_timing_window(
    *,
    start_utc: datetime,
    end_utc: datetime,
    peak_utc: datetime,
    timezone: str,
    hit: TransitToNatalHit,
) -> HourlyTimingWindow:
    score = max(1, min(10, int(round((hit.weight_hint or 0) * 10)) or 1))
    return HourlyTimingWindow(
        start_datetime_utc=utc_to_iso(start_utc),
        end_datetime_utc=utc_to_iso(end_utc),
        local_start=utc_to_local_iso(start_utc, timezone),
        local_end=utc_to_local_iso(end_utc, timezone),
        trigger_type="transit_to_natal_aspect",
        transit_planet=hit.transit_planet,
        natal_point=hit.natal_point,
        aspect_type=hit.aspect_type,
        peak_datetime_utc=utc_to_iso(peak_utc),
        orb_min_deg=hit.exact_orb_deg,
        weight_hint=hit.weight_hint,
        category_hint=hit.category_hint,
        safety_level="structured_signal_only",
        starts_at_utc=utc_to_iso(start_utc),
        ends_at_utc=utc_to_iso(end_utc),
        local_label=utc_to_local_iso(start_utc, timezone)[11:16],
        score=score,
        dominant_body=hit.transit_planet,
        notes=[],
    )


def validate_chart_snapshot_datetimes(natal: ChartSnapshot) -> SnapshotDateTimeValidation:
    timezone = validate_timezone(natal.datetime.timezone)
    parsed_local = parse_datetime_local(natal.datetime_local, "INVALID_DATETIME")
    parsed_utc = parse_datetime_utc(natal.datetime_utc, "INVALID_DATETIME")
    nested_local = parse_datetime_snapshot_local(natal.datetime.local, "INVALID_DATETIME")
    nested_utc = parse_datetime_utc(natal.datetime.utc, "INVALID_DATETIME")
    if nested_local.replace(tzinfo=None).isoformat(timespec="seconds") != parsed_local.isoformat(timespec="seconds"):
        raise ValueError("INVALID_DATETIME")
    if utc_to_iso(nested_utc) != utc_to_iso(parsed_utc):
        raise ValueError("INVALID_DATETIME")
    if nested_local.tzinfo is not None and utc_to_iso(nested_local) != utc_to_iso(parsed_utc):
        raise ValueError("INVALID_DATETIME")
    converted_local_utc = parsed_local.replace(tzinfo=parse_timezone(timezone)).astimezone(UTC)
    if utc_to_iso(converted_local_utc) != utc_to_iso(parsed_utc):
        raise ValueError("INVALID_DATETIME")
    return SnapshotDateTimeValidation(local=parsed_local, utc=parsed_utc)


def location_from_natal_request(request: ChartRequest | None) -> TransitLocation | None:
    if request is None:
        return None
    timezone = validate_timezone(request.timezone)
    return TransitLocation(
        latitude=request.latitude,
        longitude=request.longitude,
        timezone=timezone,
        elevation_m=request.elevation_m,
    )


def solar_return_search_center(natal_datetime_local: datetime, year: int, location: TransitLocation | None) -> datetime:
    month = natal_datetime_local.month
    day = natal_datetime_local.day
    timezone = location.timezone if location else "UTC"
    try:
        local = datetime(year, month, day, 12)
    except ValueError:
        local = datetime(year, month, 28, 12)
    return local_to_utc(local.isoformat(timespec="seconds"), timezone)


def utc_to_local_iso(value_utc: datetime, timezone: str) -> str:
    return value_utc.astimezone(parse_timezone(timezone)).replace(tzinfo=None, microsecond=0).isoformat(timespec="seconds")


def local_with_offset_iso(datetime_local: str, timezone: str) -> str:
    local = parse_datetime_local(datetime_local)
    return local.replace(tzinfo=parse_timezone(timezone)).isoformat(timespec="seconds")


def sun_reference_longitude(chart: ChartSnapshot, zodiac_type: str) -> float:
    sun = chart.planets["sun"]
    if zodiac_type == "tropical":
        return sun.tropical_longitude_deg
    return sun.sidereal_longitude_deg


def signed_solar_delta(current: float, target: float) -> float:
    return ((current - target + 180) % 360) - 180


def build_transit_scoring_ready(hits: list[TransitToNatalHit]) -> dict[str, object]:
    return {
        "hit_count": len(hits),
        "hits_by_transit_planet": group_hit_keys(hits, "transit_planet"),
        "hits_by_natal_point": group_hit_keys(hits, "natal_point"),
        "weighted_hits": [
            {
                "interpretation_key": hit.interpretation_key,
                "weight_hint": hit.weight_hint,
                "category_hint": hit.category_hint,
            }
            for hit in hits
        ],
    }


def group_hit_keys(hits: list[TransitToNatalHit], field: str) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for hit in hits:
        key = hit.transit_planet if field == "transit_planet" else hit.natal_point
        grouped.setdefault(key, []).append(hit.interpretation_key)
    return grouped


def resolve_datetime_local(request: ChartRequest) -> str:
    if request.birth_time_unknown:
        if request.datetime_local:
            parse_datetime_local(request.datetime_local)
        if request.birth_time:
            normalize_birth_time(request.birth_time)
        birth_date = request.birth_date or date_from_datetime_local(request.datetime_local)
        if not birth_date:
            raise ValueError("Either datetime_local or birth_date is required.")
        return f"{parse_birth_date(birth_date).isoformat()}T12:00:00"
    if request.datetime_local:
        return request.datetime_local
    if not request.birth_date:
        raise ValueError("Either datetime_local or birth_date is required.")
    birth_time = request.birth_time
    if not birth_time:
        raise ValueError("birth_time is required unless birth_time_unknown is true.")
    return birth_datetime_local(request.birth_date, birth_time)


def validate_request_warnings(request: ChartRequest, datetime_local: datetime) -> list[WarningMessage]:
    warnings: list[WarningMessage] = []
    if request.latitude == 0 and request.longitude == 0:
        warnings.append(WarningMessage(code="MISSING_LOCATION", message="Latitude/longitude are missing or set to 0,0."))
    year = datetime_local.year
    if year < 1900 or year > 2100:
        warnings.append(WarningMessage(code="UNSUPPORTED_DATE_RANGE", message="Date is outside the currently validated 1900-2100 range."))
    return warnings


def can_calculate_reliable_houses(request: ChartRequest) -> bool:
    return not request.birth_time_unknown and has_location(request)


def has_location(request: ChartRequest) -> bool:
    return request.latitude != 0 or request.longitude != 0


def build_angles(houses: Houses, lagna_deg: float | None = None) -> Angles:
    asc = houses.ascendant_deg
    mc = houses.mc_deg
    return Angles(
        ascendant_deg=asc,
        lagna_deg=lagna_deg if lagna_deg is not None else asc,
        mc_deg=mc,
        ic_deg=None if mc is None else round((mc + 180) % 360, 8),
        descendant_deg=None if asc is None else round((asc + 180) % 360, 8),
        reliable=houses.reliable,
    )


def rebase_whole_sign_houses(houses: Houses, house_reference_deg: float | None) -> Houses:
    if house_reference_deg is None or not houses.reliable or houses.system != "whole_sign":
        return houses
    reference = round(house_reference_deg % 360, 8)
    reference_sign = sign_index(reference)
    return Houses(
        system=houses.system,
        ascendant_deg=reference,
        mc_deg=houses.mc_deg,
        cusps_deg=[float((reference_sign + house) % 12 * 30) for house in range(12)],
        reliable=houses.reliable,
    )


def assign_planet_houses(
    planets: dict[str, PlanetPosition], houses: Houses, house_reference_deg: float | None = None
) -> dict[str, PlanetPosition]:
    assigned: dict[str, PlanetPosition] = {}
    for name, planet in planets.items():
        assigned[name] = PlanetPosition(
            tropical_longitude_deg=planet.tropical_longitude_deg,
            ayanamsa_deg=planet.ayanamsa_deg,
            sidereal_longitude_deg=planet.sidereal_longitude_deg,
            ecliptic_latitude_deg=planet.ecliptic_latitude_deg,
            longitude_deg=planet.longitude_deg,
            latitude_deg=planet.latitude_deg,
            speed_longitude_deg_per_day=planet.speed_longitude_deg_per_day,
            sign_index=planet.sign_index,
            sign_name_en=planet.sign_name_en,
            sign_name_th=planet.sign_name_th,
            degree_in_sign=planet.degree_in_sign,
            retrograde=planet.retrograde,
            nakshatra=planet.nakshatra,
            house_number=planet_house_number(planet.sidereal_longitude_deg, houses, house_reference_deg)
            if houses.reliable
            else None,
            warnings=planet.warnings,
        )
    return assigned


def planet_house_number(sidereal_longitude_deg: float, houses: Houses, house_reference_deg: float | None = None) -> int | None:
    if not houses.reliable:
        return None
    if houses.system == "whole_sign":
        return whole_sign_house_number(sidereal_longitude_deg, house_reference_deg if house_reference_deg is not None else houses.ascendant_deg)
    if len(houses.cusps_deg) < 12:
        raise ValueError(f"House system {houses.system} did not return 12 cusps.")
    return cusp_house_number(sidereal_longitude_deg, houses.cusps_deg)


def cusp_house_number(longitude_deg: float, cusps_deg: list[float]) -> int:
    longitude = longitude_deg % 360
    for index, cusp in enumerate(cusps_deg):
        next_cusp = cusps_deg[(index + 1) % 12]
        if _arc_contains(longitude, cusp, next_cusp):
            return index + 1
    return 12


def _arc_contains(longitude: float, start: float, end: float) -> bool:
    start = start % 360
    end = end % 360
    if start <= end:
        return start <= longitude < end
    return longitude >= start or longitude < end


def build_derived_points(
    houses: Houses,
    ayanamsha_deg: float | None,
    lagna_deg: float | None = None,
    astronomical_ascendant_deg: float | None = None,
) -> dict[str, PlanetPosition]:
    if not houses.reliable or houses.ascendant_deg is None:
        return {}
    asc = houses.ascendant_deg
    lagna = lagna_deg if lagna_deg is not None else asc
    house_reference = houses.ascendant_deg
    points = {
        "lagna": _derived_point(lagna, ayanamsha_deg, houses, house_reference),
        "descendant": _derived_point((asc + 180) % 360, ayanamsha_deg, houses, houses.ascendant_deg),
    }
    if lagna_deg is not None and astronomical_ascendant_deg is not None:
        points["astronomical_ascendant"] = _derived_point(
            astronomical_ascendant_deg, ayanamsha_deg, houses, houses.ascendant_deg
        )
    return points


def _derived_point(
    sidereal_longitude_deg: float, ayanamsha_deg: float | None, houses: Houses, house_reference_deg: float | None
) -> PlanetPosition:
    sidereal = round(sidereal_longitude_deg % 360, 8)
    tropical = sidereal if ayanamsha_deg is None else round((sidereal + ayanamsha_deg) % 360, 8)
    return PlanetPosition(
        tropical_longitude_deg=tropical,
        ayanamsa_deg=ayanamsha_deg,
        sidereal_longitude_deg=sidereal,
        ecliptic_latitude_deg=0,
        longitude_deg=sidereal,
        latitude_deg=0,
        speed_longitude_deg_per_day=0,
        sign_index=sign_index(sidereal),
        sign_name_en=sign_name_en(sidereal),
        sign_name_th=sign_name_th(sidereal),
        degree_in_sign=degree_in_sign(sidereal),
        retrograde=False,
        nakshatra=None,
        house_number=whole_sign_house_number(sidereal, house_reference_deg),
    )
