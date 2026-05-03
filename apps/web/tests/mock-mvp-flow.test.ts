import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  approveDraft,
  callMockAstroCalc,
  canViewPeriod,
  generateHoroscopeResult,
  getEntitledHoroscope,
  getMockMvpState,
  queueMockOutboundMessage,
  recordMockDeliveryAttempt,
  resetMockMvpState,
  runMockEndToEndFlow,
  saveBirthProfile,
  storeChartSnapshot,
} from "../src/mvp/mock-flow";

const birthInput = {
  birthDate: "1992-08-15",
  birthTime: "07:30",
  birthTimeUnknown: false,
  birthPlaceText: "Bangkok",
  timezone: "Asia/Bangkok",
  consentBirthData: true,
};

describe("mock end-to-end MVP flow", () => {
  beforeEach(() => {
    resetMockMvpState("premium");
  });

  it("runs the critical user journey from onboarding to mock delivery", () => {
    const result = runMockEndToEndFlow(birthInput);
    const state = getMockMvpState();

    assert.equal(result.birthProfile.birthPlaceText, "Bangkok");
    assert.equal(result.chartSnapshot.engine, "mock");
    assert.equal(state.chartSnapshots.length, 1);
    assert.equal(result.generatedResults.length, 4);
    assert.equal(result.approvedDraft.status, "approved");
    assert.equal(result.outboundMessage.status, "sent");
    assert.equal(result.deliveryAttempt.status, "sent");
    assert.deepEqual(
      state.auditLogs.map((entry) => entry.action),
      [
        "birth_profile_saved",
        "chart_snapshot_stored",
        "horoscope_generated",
        "horoscope_generated",
        "horoscope_generated",
        "horoscope_generated",
        "draft_approved",
        "outbound_queued",
        "delivery_attempt_recorded",
      ],
    );
  });

  it("stores a deterministic mock chart snapshot without real ephemeris", () => {
    const profile = saveBirthProfile(birthInput);
    const firstSnapshot = callMockAstroCalc(profile);
    const secondSnapshot = callMockAstroCalc(profile);

    assert.equal(firstSnapshot.calculation_hash, secondSnapshot.calculation_hash);
    assert.equal(firstSnapshot.ephemeris_source, "mock");
    assert.equal(firstSnapshot.engine, "mock");

    storeChartSnapshot(firstSnapshot);
    storeChartSnapshot(secondSnapshot);
    assert.equal(getMockMvpState().chartSnapshots.length, 1);
  });

  it("gates horoscope pages according to entitlement", () => {
    assert.equal(canViewPeriod("free", "daily"), true);
    assert.equal(canViewPeriod("free", "weekly"), false);
    assert.equal(canViewPeriod("basic", "weekly"), true);
    assert.equal(canViewPeriod("basic", "monthly"), false);
    assert.equal(canViewPeriod("premium", "yearly"), true);

    resetMockMvpState("basic");
    const { generatedResults } = runMockEndToEndFlow(birthInput);

    assert.equal(generatedResults.length, 4);
    assert.ok(getEntitledHoroscope("weekly"));
    assert.equal(getEntitledHoroscope("monthly"), undefined);
  });

  it("requires admin approval before queueing a mock outbound message", () => {
    const profile = saveBirthProfile(birthInput);
    const chartSnapshot = storeChartSnapshot(callMockAstroCalc(profile));
    const draft = generateHoroscopeResult({ chartSnapshot, periodType: "daily", periodKey: "2026-05-03" });

    assert.throws(() => queueMockOutboundMessage(draft.id), /Only approved/);

    approveDraft(draft.id);
    const message = queueMockOutboundMessage(draft.id);
    const attempt = recordMockDeliveryAttempt(message.id);

    assert.equal(message.channel, "mock");
    assert.equal(attempt.gateway, "mock");
  });

  it("does not produce forbidden production side effects", () => {
    runMockEndToEndFlow(birthInput);
    const serialized = JSON.stringify(getMockMvpState());

    assert.equal(serialized.includes("LINE_CHANNEL"), false);
    assert.equal(serialized.includes("sk-"), false);
    assert.equal(serialized.includes("swisseph"), false);
    assert.equal(serialized.includes("@"), false);
  });
});
