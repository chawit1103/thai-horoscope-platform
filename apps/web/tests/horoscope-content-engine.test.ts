import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateHoroscopeContentSafety, generateHoroscopeContent, validateHoroscopeContentOutput, type HoroscopeContentOutput, type HoroscopeContentPeriod, type StructuredChartSnapshot } from "../src/mvp/horoscope-content-engine";

const calculationHash = "a".repeat(64);
const baseChart:StructuredChartSnapshot = {
  id: "chart_safe_001",
  calculation_hash: calculationHash,
  calculation_profile_code: "TH_NIRAYANA_V1",
  planets: {
    moon: { sign_index: 3, longitude_deg: 93.2, retrograde: false, house_number: 4 },
    venus: { sign_index: 9, longitude_deg: 274.1, retrograde: false, house_number: 7 },
    mercury: { sign_index: 1, longitude_deg: 38.4, retrograde: true, house_number: 10 },
    mars: { sign_index: 4, longitude_deg: 124.5, retrograde: false, house_number: 3 },
    jupiter: { sign_index: 6, longitude_deg: 190.7, retrograde: false, house_number: 2 },
    sun: { sign_index: 0, longitude_deg: 9.1, retrograde: false, house_number: 10 },
  },
  houses: { reliable: true, ascendant_deg: 123.4, cusps_deg: Array.from({ length: 12 }, (_, index) => index * 30) },
  angles: { reliable: true },
  aspects: [
    { body_a: "moon", body_b: "venus", type: "trine", orb_deg: 2.5, applying: true },
    { body_a: "mars", body_b: "mercury", type: "square", orb_deg: 3.1, applying: false },
  ],
  warnings: [],
};

const periodKeys:Record<HoroscopeContentPeriod, string> = {
  daily: "2026-05-03",
  weekly: "2026-W18",
  monthly: "2026-05",
  yearly: "2026",
};

describe("horoscope content engine", () => {
  it("same structured input produces the same deterministic content", () => {
    const first = generateHoroscopeContent({ periodType: "daily", periodKey: periodKeys.daily, chartSnapshot: baseChart, contentProfileCode: "TH_SAFE_REFLECTION_V1" });
    const second = generateHoroscopeContent({ periodType: "daily", periodKey: periodKeys.daily, chartSnapshot: baseChart, contentProfileCode: "TH_SAFE_REFLECTION_V1" });

    assert.deepEqual(first, second);
    assert.equal(first.safety_flags.length, 0);
    assert.equal(validateHoroscopeContentOutput(first).ok, true);
  });

  it("different content profile codes change the profile and content hash", () => {
    const beta = generateHoroscopeContent({ periodType: "weekly", periodKey: periodKeys.weekly, chartSnapshot: baseChart, contentProfileCode: "TH_SAFE_BETA_V1" });
    const gentle = generateHoroscopeContent({ periodType: "weekly", periodKey: periodKeys.weekly, chartSnapshot: baseChart, contentProfileCode: "TH_GENTLE_DIGEST_V1" });

    assert.equal(beta.content_profile_code, "TH_SAFE_BETA_V1");
    assert.equal(gentle.content_profile_code, "TH_GENTLE_DIGEST_V1");
    assert.notEqual(beta.content_hash, gentle.content_hash);
  });

  it("unknown birth time lowers confidence and avoids house-specific rule hits", () => {
    const unknownTimeChart:StructuredChartSnapshot = {
      ...baseChart,
      id: "chart_unknown_time",
      houses: { reliable: false, ascendant_deg: null, cusps_deg: [] },
      angles: { reliable: false },
      warnings: ["UNKNOWN_BIRTH_TIME", { code: "UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE", message: "raw upstream detail should not be copied" }],
    };

    const output = generateHoroscopeContent({ periodType: "monthly", periodKey: periodKeys.monthly, chartSnapshot: unknownTimeChart });
    const renderedText = contentText(output);

    assert.ok(output.warnings.some((warning) => warning.code === "CONTENT_CONFIDENCE_LOWERED_UNKNOWN_BIRTH_TIME"));
    assert.equal(output.rule_hits.some((hit) => hit.trigger.includes("house_")), false);
    assert.equal(/เรือนที่|ภพที่|house_/u.test(renderedText), false);
    assert.match(output.caution, /เวลาเกิดไม่ชัดเจน/u);
    assert.equal(validateHoroscopeContentOutput(output).ok, true);
  });

  it("blocks unsafe content phrases and unsafe category hints", () => {
    const safety = evaluateHoroscopeContentSafety([
      "เดือนนี้คุณจะป่วยหนักแน่นอน",
      "วันนี้ต้องซื้อหุ้นตัวนี้แล้วรวย",
      "ถ้าไม่ทำพิธีแก้ดวงจะเกิดอุบัติเหตุ",
      "ติดต่อ user@example.com หรือ U1234567890abcdef1234567890abcdef",
    ]);
    assert.deepEqual(
      safety.flags,
      ["death_or_accident_prediction", "fear_based_language", "financial_advice", "guaranteed_outcome", "medical_claim", "pii_or_secret_leak", "ritual_upsell"].sort(),
    );

    const output = generateHoroscopeContent({
      periodType: "daily",
      periodKey: periodKeys.daily,
      chartSnapshot: baseChart,
      transit: {
        transit_to_natal_hits: [
          {
            transit_planet: "saturn",
            natal_point: "moon",
            aspect_type: "square",
            category_hint: "medical_claim",
            weight_hint: 3,
            interpretation_key: "unsafe_hint_should_be_sanitized",
          },
        ],
      },
    });
    assert.equal(output.rule_hits.some((hit) => hit.category === ("medical_claim" as never)), false);
    assert.equal(output.safety_flags.length, 0);
  });

  it("does not produce medical legal financial death accident or guaranteed outcome content", () => {
    const output = generateHoroscopeContent({ periodType: "yearly", periodKey: periodKeys.yearly, chartSnapshot: baseChart });
    const renderedText = contentText(output);

    assert.equal(/ป่วยหนัก|วินิจฉัย|ฟ้อง|คดี|ซื้อหุ้น|หวย|อุบัติเหตุ|ตาย|แน่นอน|100%|รับประกัน/u.test(renderedText), false);
    assert.deepEqual(evaluateHoroscopeContentSafety(renderedText).flags, []);
  });

  it("daily weekly monthly and yearly output schemas are valid", () => {
    for (const period of Object.keys(periodKeys) as HoroscopeContentPeriod[]) {
      const output = generateHoroscopeContent({ periodType: period, periodKey: periodKeys[period], chartSnapshot: baseChart });
      assert.equal(validateHoroscopeContentOutput(output).ok, true, period);
      assert.equal(output.period_type, period);
      assert.ok(output.overview);
      assert.ok(output.work);
      assert.ok(output.money);
      assert.ok(output.relationship);
      assert.ok(output.wellness);
      assert.ok(output.advice);
      assert.ok(output.caution);
      assert.ok(output.rule_hits.length > 0);
    }

    const weekly = generateHoroscopeContent({ periodType: "weekly", periodKey: periodKeys.weekly, chartSnapshot: baseChart });
    assert.equal(weekly.generated_at, "2026-04-27T00:00:00.000Z");
  });

  it("rule hits are included and explainable", () => {
    const output = generateHoroscopeContent({ periodType: "daily", periodKey: periodKeys.daily, chartSnapshot: baseChart });

    assert.ok(output.rule_hits.length >= 5);
    for (const hit of output.rule_hits) {
      assert.match(hit.rule_id, /^[A-Z0-9_]+$/);
      assert.ok(hit.trigger);
      assert.ok(["overview", "work", "money", "relationship", "wellness", "advice", "caution"].includes(hit.category));
      assert.ok(hit.weight >= 1 && hit.weight <= 3);
      assert.ok(hit.source_points.length > 0);
    }
  });

  it("does not include raw birth date time location or secrets in generated content", () => {
    const chartWithIgnoredPrivateFields = {
      ...baseChart,
      metadata: {
        birthDate: "1992-08-15",
        birthTime: "07:30",
        birthPlaceText: "Bangkok",
        apiKey: "secret-api-key",
      },
    } as StructuredChartSnapshot & { metadata:Record<string, string> };

    const output = generateHoroscopeContent({ periodType: "daily", periodKey: periodKeys.daily, chartSnapshot: chartWithIgnoredPrivateFields });
    const serialized = JSON.stringify(output);

    assert.doesNotMatch(serialized, /1992-08-15|07:30|Bangkok|secret-api-key/u);
  });

  it("does not call LLMs or the network", () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (() => {
      fetchCalls += 1;
      throw new Error("network calls are forbidden in content engine tests");
    }) as typeof fetch;

    try {
      const output = generateHoroscopeContent({ periodType: "daily", periodKey: periodKeys.daily, chartSnapshot: baseChart });
      assert.equal(output.content_profile_code, "TH_SAFE_REFLECTION_V1");
      assert.equal(fetchCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function contentText(output:HoroscopeContentOutput):string {
  return [
    output.overview,
    output.work,
    output.money,
    output.relationship,
    output.wellness,
    output.advice,
    output.caution,
    output.lucky_window ?? "",
    output.reflection_question ?? "",
  ].join("\n");
}
