import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { approveAndQueueAuthorized } from "../app/actions";
import { approveDraft, callMockAstroCalc, generateHoroscopeResult, getMockMvpState, queueMockOutboundMessage, recordMockDeliveryAttempt, resetMockMvpState, saveBirthProfile, storeChartSnapshot } from "../src/mvp/mock-flow";

const birthInput = { birthDate: "1992-08-15", birthTime: "07:30", birthTimeUnknown: false, birthPlaceText: "Bangkok", timezone: "Asia/Bangkok", consentBirthData: true };

describe("mock mvp flow", () => {
  beforeEach(() => resetMockMvpState("premium"));

  it("scopes chart snapshots per user for identical birth input", () => {
    const a = saveBirthProfile(birthInput, { sessionId: "s1", userId: "user_a" });
    const b = saveBirthProfile(birthInput, { sessionId: "s1", userId: "user_b" });
    const aSnap = storeChartSnapshot(callMockAstroCalc(a), "s1");
    const bSnap = storeChartSnapshot(callMockAstroCalc(b), "s1");
    assert.notEqual(aSnap.id, bSnap.id);
    assert.notEqual(aSnap.userId, bSnap.userId);
    assert.notEqual(aSnap.birthProfileId, bSnap.birthProfileId);
  });

  it("is idempotent for repeated queue and delivery", () => {
    const profile = saveBirthProfile(birthInput, { sessionId: "s1", userId: "user_a" });
    const chart = storeChartSnapshot(callMockAstroCalc(profile), "s1");
    const draft = generateHoroscopeResult({ chartSnapshot: chart, periodType: "daily", periodKey: "2026-05-03", sessionId: "s1" });
    approveDraft(draft.id, "admin", "s1");
    const m1 = queueMockOutboundMessage(draft.id, "s1");
    const m2 = queueMockOutboundMessage(draft.id, "s1");
    const d1 = recordMockDeliveryAttempt(m1.id, "s1");
    const d2 = recordMockDeliveryAttempt(m2.id, "s1");
    const state = getMockMvpState("s1");
    assert.equal(m1.id, m2.id);
    assert.equal(d1.id, d2.id);
    assert.equal(state.outboundMessages.length, 1);
    assert.equal(state.deliveryAttempts.length, 1);
  });

  it("blocks unauthorized server-action approvals", () => {
    const profile = saveBirthProfile(birthInput, { sessionId: "s1", userId: "user_a" });
    const chart = storeChartSnapshot(callMockAstroCalc(profile), "s1");
    const draft = generateHoroscopeResult({ chartSnapshot: chart, periodType: "daily", periodKey: "2026-05-03", sessionId: "s1" });

    assert.throws(() => approveAndQueueAuthorized({ sessionId: "s1", resultId: draft.id, isProduction: false }), /Unauthorized/);
    assert.throws(() => approveAndQueueAuthorized({ sessionId: "s1", resultId: draft.id, isProduction: true, sessionRole: "admin" }), /reserved for PR11/);

    const before = getMockMvpState("s1");
    assert.equal(before.outboundMessages.length, 0);
    approveAndQueueAuthorized({ sessionId: "s1", resultId: draft.id, isProduction: false, sessionRole: "admin" });
    const after = getMockMvpState("s1");
    assert.equal(after.outboundMessages.length, 1);
    assert.equal(after.deliveryAttempts.length, 1);
  });

  it("isolates state by session", () => {
    saveBirthProfile({ ...birthInput, birthPlaceText: "Chiang Mai" }, { sessionId: "sA", userId: "user_a" });
    saveBirthProfile({ ...birthInput, birthPlaceText: "Phuket" }, { sessionId: "sB", userId: "user_b" });
    assert.equal(getMockMvpState("sA").birthProfiles.length, 1);
    assert.equal(getMockMvpState("sB").birthProfiles.length, 1);
    assert.equal(getMockMvpState("sA").birthProfiles[0]?.birthPlaceText, "Chiang Mai");
  });
});
