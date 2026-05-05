import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { approveAndQueueWithAdminCookie, authorizeAdminRoute, createAdminSessionCookie, getAdminAuditPartition, rejectDraftWithAdminCookie, startDevMockAdminSessionForToken, UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID, validateAdminSession } from "../src/mvp/admin-auth";
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

    assert.throws(() => approveAndQueueWithAdminCookie({ sessionId: "s1", resultId: draft.id, sessionSecret: "session-secret" }), /Unauthorized/);
    const readerCookie = createAdminSessionCookie({ actorId: "reader", role: "reader", sessionSecret: "session-secret" });
    assert.throws(() => approveAndQueueWithAdminCookie({ sessionId: "s1", resultId: draft.id, sessionCookie: readerCookie, sessionSecret: "session-secret" }), /Unauthorized/);

    const before = getMockMvpState("s1");
    assert.equal(before.outboundMessages.length, 0);
    assert.equal(before.deliveryAttempts.length, 0);
    assert.equal(before.auditLogs.filter((entry) => entry.action === "draft_approved").length, 0);

    try {
      approveAndQueueWithAdminCookie({ sessionId: "s1", resultId: draft.id, sessionSecret: "session-secret" });
    } catch {}
    const afterUnauthorized = getMockMvpState("s1");
    assert.equal(afterUnauthorized.horoscopeResults.find((r) => r.id === draft.id)?.status, "draft");
    assert.equal(afterUnauthorized.outboundMessages.length, 0);
    assert.equal(afterUnauthorized.deliveryAttempts.length, 0);
    assert.equal(afterUnauthorized.auditLogs.filter((entry) => entry.action === "draft_approved").length, 0);
    assert.equal(afterUnauthorized.auditLogs.filter((entry) => entry.action === "admin_access_denied").length, 0);
    assert.equal(getMockMvpState(UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID).auditLogs.filter((entry) => entry.action === "admin_access_denied").length, 3);

    const adminCookie = createAdminSessionCookie({ actorId: "admin_actor", role: "admin", sessionSecret: "session-secret" });
    approveAndQueueWithAdminCookie({ sessionId: "s1", resultId: draft.id, sessionCookie: adminCookie, sessionSecret: "session-secret" });
    const after = getMockMvpState("s1");
    const adminAuditState = getMockMvpState(getAdminAuditPartition({ actorId: "admin_actor", sessionCookie: adminCookie }));
    assert.equal(after.outboundMessages.length, 1);
    assert.equal(after.deliveryAttempts.length, 1);
    assert.equal(after.auditLogs.filter((entry) => entry.action === "admin_content_approved").length, 0);
    assert.equal(after.auditLogs.filter((entry) => entry.action === "admin_outbound_queued").length, 0);
    assert.equal(adminAuditState.auditLogs.filter((entry) => entry.action === "admin_content_approved").length, 1);
    assert.equal(adminAuditState.auditLogs.filter((entry) => entry.action === "admin_outbound_queued").length, 1);
  });

  it("blocks unauthenticated admin page access", () => {
    const access = authorizeAdminRoute({ path: "/admin", sessionSecret: "session-secret" });
    assert.equal(access.ok, false);
    if (!access.ok) {
      assert.equal(access.reason, "missing_admin_session");
      assert.equal(access.redirectTo, "/admin/sign-in");
    }
  });

  it("blocks non-admin users from admin pages", () => {
    const userCookie = createAdminSessionCookie({ actorId: "user_actor", role: "user", sessionSecret: "session-secret" });
    const access = authorizeAdminRoute({ path: "/admin", sessionCookie: userCookie, sessionSecret: "session-secret" });
    assert.equal(access.ok, false);
    if (!access.ok) assert.equal(access.reason, "missing_admin_role");
  });

  it("validates signed admin session cookie with an admin role", () => {
    const token = "dev-secret-token";
    const sessionCookie = startDevMockAdminSessionForToken({ token, expectedToken: token, sessionSecret: "session-secret", isProduction: false });
    assert.ok(sessionCookie);
    const auth = validateAdminSession({ sessionCookie, sessionSecret: "session-secret" });
    assert.equal(auth.ok, true);
    if (auth.ok) {
      assert.equal(auth.role, "admin");
      assert.match(auth.actorId, /^admin_/);
    }
    assert.equal(validateAdminSession({ sessionCookie: "forged", sessionSecret: "session-secret" }).ok, false);
    assert.equal(validateAdminSession({ sessionCookie, sessionSecret: "wrong-secret" }).ok, false);
    assert.equal(startDevMockAdminSessionForToken({ token: "wrong", expectedToken: token, sessionSecret: "session-secret", isProduction: false }), undefined);
    assert.equal(startDevMockAdminSessionForToken({ token, expectedToken: token, isProduction: false }), undefined);
  });

  it("blocks non-admin users from admin server actions", () => {
    const profile = saveBirthProfile(birthInput, { sessionId: "s1", userId: "user_a" });
    const chart = storeChartSnapshot(callMockAstroCalc(profile), "s1");
    const draft = generateHoroscopeResult({ chartSnapshot: chart, periodType: "daily", periodKey: "2026-05-03", sessionId: "s1" });

    const userCookie = createAdminSessionCookie({ actorId: "user_actor", role: "user", sessionSecret: "session-secret" });
    assert.throws(() => approveAndQueueWithAdminCookie({ sessionId: "s1", resultId: draft.id, sessionCookie: userCookie, sessionSecret: "session-secret" }), /Unauthorized/);
    assert.throws(() => rejectDraftWithAdminCookie({ sessionId: "s1", resultId: draft.id, sessionCookie: userCookie, sessionSecret: "session-secret" }), /Unauthorized/);

    const state = getMockMvpState("s1");
    assert.equal(state.horoscopeResults.find((result) => result.id === draft.id)?.status, "draft");
    assert.equal(state.outboundMessages.length, 0);
    assert.equal(state.deliveryAttempts.length, 0);
    assert.equal(state.auditLogs.filter((entry) => entry.action === "admin_access_denied").length, 0);
    assert.equal(getMockMvpState(UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID).auditLogs.filter((entry) => entry.action === "admin_access_denied").length, 2);
  });

  it("ignores forged caller-provided adminSession values for admin mutations", () => {
    const profile = saveBirthProfile(birthInput, { sessionId: "victim-session", userId: "user_a" });
    const chart = storeChartSnapshot(callMockAstroCalc(profile), "victim-session");
    const draft = generateHoroscopeResult({ chartSnapshot: chart, periodType: "daily", periodKey: "2026-05-03", sessionId: "victim-session" });

    assert.throws(
      () => approveAndQueueWithAdminCookie({ sessionId: "victim-session", resultId: draft.id, sessionSecret: "session-secret", adminSession: { actorId: "attacker", role: "admin" } } as Parameters<typeof approveAndQueueWithAdminCookie>[0]),
      /Unauthorized/,
    );
    assert.throws(
      () => rejectDraftWithAdminCookie({ sessionId: "victim-session", resultId: draft.id, sessionSecret: "session-secret", adminSession: { actorId: "attacker", role: "admin" } } as Parameters<typeof rejectDraftWithAdminCookie>[0]),
      /Unauthorized/,
    );

    const state = getMockMvpState("victim-session");
    assert.equal(state.horoscopeResults.find((result) => result.id === draft.id)?.status, "draft");
    assert.equal(state.outboundMessages.length, 0);
    assert.equal(state.deliveryAttempts.length, 0);
  });

  it("records audit logs for admin approve, reject, and queue actions", () => {
    const profile = saveBirthProfile(birthInput, { sessionId: "s1", userId: "user_a" });
    const chart = storeChartSnapshot(callMockAstroCalc(profile), "s1");
    const approvedDraft = generateHoroscopeResult({ chartSnapshot: chart, periodType: "daily", periodKey: "2026-05-03", sessionId: "s1" });
    const rejectedDraft = generateHoroscopeResult({ chartSnapshot: chart, periodType: "weekly", periodKey: "2026-W18", sessionId: "s1" });

    const adminCookie = createAdminSessionCookie({ actorId: "admin_actor", role: "admin", sessionSecret: "session-secret" });
    approveAndQueueWithAdminCookie({ sessionId: "s1", resultId: approvedDraft.id, sessionCookie: adminCookie, sessionSecret: "session-secret" });
    rejectDraftWithAdminCookie({ sessionId: "s1", resultId: rejectedDraft.id, sessionCookie: adminCookie, sessionSecret: "session-secret" });

    const state = getMockMvpState("s1");
    const adminAuditState = getMockMvpState(getAdminAuditPartition({ actorId: "admin_actor", sessionCookie: adminCookie }));
    assert.equal(state.auditLogs.filter((entry) => entry.action === "admin_content_approved").length, 0);
    assert.equal(state.auditLogs.filter((entry) => entry.action === "admin_outbound_queued").length, 0);
    assert.equal(state.auditLogs.filter((entry) => entry.action === "admin_content_rejected").length, 0);
    assert.equal(adminAuditState.auditLogs.filter((entry) => entry.action === "admin_content_approved").length, 1);
    assert.equal(adminAuditState.auditLogs.filter((entry) => entry.action === "admin_outbound_queued").length, 1);
    assert.equal(adminAuditState.auditLogs.filter((entry) => entry.action === "admin_content_rejected").length, 1);
  });

  it("keeps privileged admin audits in a trusted admin partition when mock session id is forged", () => {
    const victimProfile = saveBirthProfile(birthInput, { sessionId: "victim-session", userId: "victim_user" });
    storeChartSnapshot(callMockAstroCalc(victimProfile), "victim-session");
    const targetProfile = saveBirthProfile({ ...birthInput, birthPlaceText: "Chiang Rai" }, { sessionId: "target-session", userId: "target_user" });
    const targetChart = storeChartSnapshot(callMockAstroCalc(targetProfile), "target-session");
    const approvedDraft = generateHoroscopeResult({ chartSnapshot: targetChart, periodType: "daily", periodKey: "2026-05-03", sessionId: "target-session" });
    const rejectedDraft = generateHoroscopeResult({ chartSnapshot: targetChart, periodType: "weekly", periodKey: "2026-W18", sessionId: "target-session" });
    const adminCookie = createAdminSessionCookie({ actorId: "admin_actor", role: "admin", sessionSecret: "session-secret" });
    const adminAuditPartition = getAdminAuditPartition({ actorId: "admin_actor", sessionCookie: adminCookie });

    approveAndQueueWithAdminCookie({ sessionId: "target-session", resultId: approvedDraft.id, sessionCookie: adminCookie, sessionSecret: "session-secret" });
    rejectDraftWithAdminCookie({ sessionId: "target-session", resultId: rejectedDraft.id, sessionCookie: adminCookie, sessionSecret: "session-secret" });

    const targetState = getMockMvpState("target-session");
    const victimState = getMockMvpState("victim-session");
    const adminAuditState = getMockMvpState(adminAuditPartition);

    assert.equal(targetState.outboundMessages.length, 1);
    assert.equal(targetState.deliveryAttempts.length, 1);
    assert.equal(victimState.auditLogs.filter((entry) => entry.action.startsWith("admin_")).length, 0);
    assert.equal(targetState.auditLogs.filter((entry) => entry.action === "admin_content_approved").length, 0);
    assert.equal(targetState.auditLogs.filter((entry) => entry.action === "admin_outbound_queued").length, 0);
    assert.equal(targetState.auditLogs.filter((entry) => entry.action === "admin_content_rejected").length, 0);
    assert.equal(adminAuditState.auditLogs.filter((entry) => entry.action === "admin_content_approved").length, 1);
    assert.equal(adminAuditState.auditLogs.filter((entry) => entry.action === "admin_outbound_queued").length, 1);
    assert.equal(adminAuditState.auditLogs.filter((entry) => entry.action === "admin_content_rejected").length, 1);
  });

  it("disables the development-only mock guard in production", () => {
    const sessionCookie = startDevMockAdminSessionForToken({
      token: "dev-secret-token",
      expectedToken: "dev-secret-token",
      sessionSecret: "session-secret",
      isProduction: true,
    });
    assert.equal(sessionCookie, undefined);
  });

  it("keeps denied-admin audits out of forged user session partitions", () => {
    saveBirthProfile(birthInput, { sessionId: "victim-session", userId: "user_a" });
    assert.throws(
      () => approveAndQueueWithAdminCookie({ sessionId: "victim-session", resultId: "forged_result", sessionSecret: "session-secret" }),
      /Unauthorized/,
    );

    const victimState = getMockMvpState("victim-session");
    const securityState = getMockMvpState(UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID);
    assert.equal(victimState.auditLogs.filter((entry) => entry.action === "admin_access_denied").length, 0);
    assert.equal(securityState.auditLogs.filter((entry) => entry.action === "admin_access_denied").length, 1);
  });

  it("keeps admin audit metadata free of PII and derived birth hashes", () => {
    const profile = saveBirthProfile(birthInput, { sessionId: "s1", userId: "user_a" });
    storeChartSnapshot(callMockAstroCalc(profile), "s1");
    const state = getMockMvpState("s1");
    const serializedAudit = JSON.stringify(state.auditLogs);

    assert.equal(serializedAudit.includes(birthInput.birthDate), false);
    assert.equal(serializedAudit.includes(birthInput.birthTime), false);
    assert.equal(serializedAudit.includes(birthInput.birthPlaceText), false);
    assert.equal(serializedAudit.includes(birthInput.timezone), false);
    assert.equal(state.auditLogs.some((entry) => "calculationHash" in entry.metadata), false);
  });

  it("isolates state by session", () => {
    saveBirthProfile({ ...birthInput, birthPlaceText: "Chiang Mai" }, { sessionId: "sA", userId: "user_a" });
    saveBirthProfile({ ...birthInput, birthPlaceText: "Phuket" }, { sessionId: "sB", userId: "user_b" });
    assert.equal(getMockMvpState("sA").birthProfiles.length, 1);
    assert.equal(getMockMvpState("sB").birthProfiles.length, 1);
    assert.equal(getMockMvpState("sA").birthProfiles[0]?.birthPlaceText, "Chiang Mai");
  });
});
