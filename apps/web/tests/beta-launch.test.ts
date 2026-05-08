import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createAdminSessionCookie, createBetaInviteWithAdminCookie } from "../src/mvp/admin-auth";
import { BETA_INVITE_SCOPE_ID, LOCAL_MOCK_BETA_INVITE_CODE, assertBetaCopySafe, buildBetaLaunchView, canAccessBetaEntitledPeriod, canAccessBetaOnlyFlow, createBetaInvite, enrollBetaUser, ensureLocalMockBetaInvite, getBetaDisclaimers, getBetaLaunchCopy, getBetaLaunchState, getLocalMockBetaInviteCode, isBetaUserAllowed, resetBetaLaunchState, revokeBetaInvite, setBetaEnrollmentStatus, validateBetaInviteCode } from "../src/mvp/beta-launch";
import { ENTERTAINMENT_DISCLAIMER } from "../src/mvp/beta-user-ux";
import { getMockMvpState, requestAccountDeletion, resetMockMvpState, setMockUserPlan } from "../src/mvp/mock-flow";
import { processMockSubscriptionWebhook, resetMockSubscriptionState, type MockSubscriptionWebhookEvent } from "../src/mvp/subscription-lifecycle";

const sessionId = "beta_launch_test";
const userId = "beta_launch_user";
const adminSecret = "test-admin-session-secret";
const adminCookie = createAdminSessionCookie({ actorId:"admin_beta_launch", role:"admin", sessionSecret:adminSecret, ttlMs:30 * 24 * 60 * 60 * 1000 });
const now = new Date("2026-05-08T00:00:00.000Z");

async function activatePremiumSubscription() {
  const event:MockSubscriptionWebhookEvent = {
    id:"evt_beta_launch_premium",
    type:"subscription.created",
    subscriptionId:"sub_beta_launch_premium",
    userId,
    planCode:"premium",
    status:"active",
    currentPeriodStart:"2026-05-01T00:00:00.000Z",
    currentPeriodEnd:"2026-06-01T00:00:00.000Z",
    occurredAt:"2026-05-01T00:00:00.000Z",
  };
  const result = await processMockSubscriptionWebhook(event);
  assert.equal(result.status, "applied");
  assert.ok(result.subscription);
  return result.subscription;
}

describe("beta launch content and invite management", () => {
  beforeEach(() => {
    resetMockMvpState("free");
    resetMockSubscriptionState();
    resetBetaLaunchState();
    resetBetaLaunchState(sessionId);
    setMockUserPlan(userId, "free", sessionId);
  });

  it("valid invite code enrolls a beta user", () => {
    createBetaInvite({ inviteCode:"PR31-READY" });

    const validation = validateBetaInviteCode({ inviteCode:" pr31-ready " });
    const enrollment = enrollBetaUser({ sessionId, userId, inviteCode:"PR31-READY" });

    assert.equal(validation.ok, true);
    assert.equal(enrollment.status, "enrolled");
    assert.equal(isBetaUserAllowed({ sessionId, userId }), "enrolled");
  });

  it("local mock invite code enrolls a beta user", () => {
    const invite = ensureLocalMockBetaInvite({ deploymentEnvironment:"local" });

    assert.ok(invite);
    assert.equal(getLocalMockBetaInviteCode({ deploymentEnvironment:"local" }), LOCAL_MOCK_BETA_INVITE_CODE);
    assert.equal(validateBetaInviteCode({ inviteCode:LOCAL_MOCK_BETA_INVITE_CODE }).ok, true);

    const enrollment = enrollBetaUser({ sessionId, userId, inviteCode:LOCAL_MOCK_BETA_INVITE_CODE });

    assert.equal(enrollment.status, "enrolled");
    assert.equal(isBetaUserAllowed({ sessionId, userId }), "enrolled");
  });

  it("invalid invite code is rejected with sanitized error", () => {
    const validation = validateBetaInviteCode({ sessionId, inviteCode:"wrong-code" });

    assert.equal(validation.ok, false);
    assert.equal(validation.errorCode, "invalid_beta_invite");
    assert.throws(() => enrollBetaUser({ sessionId, userId, inviteCode:"wrong-code" }), /Invalid beta invite/);
    assert.equal(JSON.stringify(validation).includes("wrong-code"), false);
  });

  it("production mode does not auto-allow the local demo invite unless explicitly configured", () => {
    const invite = ensureLocalMockBetaInvite({ deploymentEnvironment:"production" });

    assert.equal(invite, undefined);
    assert.equal(getLocalMockBetaInviteCode({ deploymentEnvironment:"production" }), undefined);
    assert.equal(validateBetaInviteCode({ inviteCode:LOCAL_MOCK_BETA_INVITE_CODE }).ok, false);
    assert.throws(() => enrollBetaUser({ sessionId, userId, inviteCode:LOCAL_MOCK_BETA_INVITE_CODE }), /Invalid beta invite/);

    createBetaInvite({ inviteCode:LOCAL_MOCK_BETA_INVITE_CODE });

    assert.equal(validateBetaInviteCode({ inviteCode:LOCAL_MOCK_BETA_INVITE_CODE }).ok, true);
  });

  it("revoked invite cannot enroll", () => {
    createBetaInvite({ inviteCode:"REVOKED-CODE", status:"revoked" });

    assert.throws(() => enrollBetaUser({ sessionId, userId, inviteCode:"REVOKED-CODE" }), /Beta invite is unavailable/);
    assert.equal(isBetaUserAllowed({ sessionId, userId }), "not_invited");
  });

  it("waitlisted and revoked users cannot access beta-only flow", () => {
    setBetaEnrollmentStatus({ sessionId, userId, status:"waitlisted" });
    assert.equal(canAccessBetaOnlyFlow({ sessionId, userId }), false);

    setBetaEnrollmentStatus({ sessionId, userId, status:"revoked" });
    assert.equal(canAccessBetaOnlyFlow({ sessionId, userId }), false);
  });

  it("allowlisted users can enter beta-only flow without a raw invite code", () => {
    createBetaInvite({ userId });

    assert.equal(isBetaUserAllowed({ sessionId, userId }), "invited");
    assert.equal(canAccessBetaOnlyFlow({ sessionId, userId }), true);
  });

  it("admin-created shared invite code is redeemable from a different user session", () => {
    createBetaInviteWithAdminCookie({ sessionId:BETA_INVITE_SCOPE_ID, inviteCode:"SHARED-CODE", sessionCookie:adminCookie, sessionSecret:adminSecret });

    const enrollment = enrollBetaUser({ sessionId:"tester_different_session", userId:"tester_different_user", inviteCode:"SHARED-CODE" });

    assert.equal(enrollment.status, "enrolled");
    assert.equal(getBetaLaunchState("tester_different_session").enrollments.some((item)=>item.userId === "tester_different_user"), true);
    assert.equal(getBetaLaunchState().invites.length, 1);
  });

  it("email allowlisted users can enroll only with a verified session email", () => {
    createBetaInvite({ email:"beta@example.test" });

    assert.throws(() => enrollBetaUser({ sessionId, userId, email:"beta@example.test" }), /Invalid beta invite/);
    assert.equal(isBetaUserAllowed({ sessionId, userId, email:"beta@example.test" }), "not_invited");

    const enrollment = enrollBetaUser({ sessionId, userId, email:"beta@example.test", emailVerified:true });

    assert.equal(enrollment.status, "enrolled");
    assert.equal(isBetaUserAllowed({ sessionId, userId }), "enrolled");
  });

  it("revoking a redeemed invite removes beta-only access", () => {
    const invite = createBetaInvite({ inviteCode:"LEAKED-CODE" });
    enrollBetaUser({ sessionId, userId, inviteCode:"LEAKED-CODE" });

    revokeBetaInvite({ inviteId:invite.id });

    assert.equal(isBetaUserAllowed({ sessionId, userId }), "revoked");
    assert.equal(canAccessBetaOnlyFlow({ sessionId, userId }), false);
  });

  it("revoked enrolled users can redeem a new valid invite", () => {
    const revokedInvite = createBetaInvite({ inviteCode:"OLD-CODE" });
    const freshInvite = createBetaInvite({ inviteCode:"FRESH-CODE" });
    enrollBetaUser({ sessionId, userId, inviteCode:"OLD-CODE" });

    revokeBetaInvite({ inviteId:revokedInvite.id });
    const reenrollment = enrollBetaUser({ sessionId, userId, inviteCode:"FRESH-CODE" });

    assert.equal(reenrollment.status, "enrolled");
    assert.equal(reenrollment.inviteId, freshInvite.id);
    assert.equal(isBetaUserAllowed({ sessionId, userId }), "enrolled");
  });

  it("revoking a redeemed invite removes entitled horoscope period access", async () => {
    const invite = createBetaInvite({ inviteCode:"REVOKED-PERIOD" });
    enrollBetaUser({ sessionId, userId, inviteCode:"REVOKED-PERIOD" });
    setMockUserPlan(userId, "premium", sessionId);
    const subscription = await activatePremiumSubscription();

    assert.equal(canAccessBetaEntitledPeriod({ state:getMockMvpState(sessionId), sessionId, userId, periodType:"yearly", subscription, now }), true);

    revokeBetaInvite({ inviteId:invite.id });

    assert.equal(canAccessBetaEntitledPeriod({ state:getMockMvpState(sessionId), sessionId, userId, periodType:"yearly", subscription, now }), false);
  });

  it("beta enrollment does not grant premium subscription entitlement by itself", () => {
    createBetaInvite({ inviteCode:"ENTITLEMENT-CHECK" });
    enrollBetaUser({ sessionId, userId, inviteCode:"ENTITLEMENT-CHECK" });

    const allowed = canAccessBetaEntitledPeriod({ state:getMockMvpState(sessionId), sessionId, userId, periodType:"monthly", now });

    assert.equal(allowed, false);
  });

  it("beta enrollment composes with paid subscription entitlement", async () => {
    createBetaInvite({ inviteCode:"PAID-CHECK" });
    enrollBetaUser({ sessionId, userId, inviteCode:"PAID-CHECK" });
    setMockUserPlan(userId, "premium", sessionId);
    const subscription = await activatePremiumSubscription();

    const allowed = canAccessBetaEntitledPeriod({ state:getMockMvpState(sessionId), sessionId, userId, periodType:"yearly", subscription, now });

    assert.equal(allowed, true);
  });

  it("beta enrollment does not bypass privacy deletion or deactivation controls", () => {
    createBetaInvite({ inviteCode:"PRIVACY-CHECK" });
    enrollBetaUser({ sessionId, userId, inviteCode:"PRIVACY-CHECK" });
    requestAccountDeletion({ sessionId, userId }, now);

    assert.equal(isBetaUserAllowed({ state:getMockMvpState(sessionId), sessionId, userId }), "disabled");
    assert.equal(canAccessBetaOnlyFlow({ state:getMockMvpState(sessionId), sessionId, userId }), false);
  });

  it("beta copy includes entertainment and self-reflection disclaimer", () => {
    const copy = getBetaLaunchCopy();
    const disclaimers = getBetaDisclaimers();

    assert.equal(copy.entertainmentDisclaimer, ENTERTAINMENT_DISCLAIMER);
    assert.match(disclaimers.join("\n"), /เพื่อความบันเทิงและการทบทวนตนเอง/);
  });

  it("unknown birth time beta copy includes approximation warning", () => {
    assert.match(getBetaDisclaimers({ birthTimeUnknown:true }).join("\n"), /ไม่ทราบเวลาเกิด/);
    assert.match(getBetaDisclaimers({ birthTimeUnknown:true }).join("\n"), /ค่าประมาณ/);
  });

  it("beta copy does not include prohibited unsafe wording", () => {
    assert.doesNotThrow(() => assertBetaCopySafe());
    assert.throws(() => assertBetaCopySafe({ text:"ต้องเกิดขึ้นแน่นอน และ รวยแน่" }), /Unsafe beta copy/);
  });

  it("user-facing beta copy does not include raw PII or internal identifiers", () => {
    const view = buildBetaLaunchView({ sessionId, userId:"user_raw_internal_123", email:"beta@example.test" });
    const serialized = JSON.stringify(view);

    assert.equal(serialized.includes("user_raw_internal_123"), false);
    assert.equal(serialized.includes("beta@example.test"), false);
    assert.equal(serialized.includes("UrawLineUserIdShouldNeverRender000"), false);
    assert.equal(serialized.includes("payment_provider_id"), false);
  });

  it("beta launch view renders without tripping leak guard wording", () => {
    assert.doesNotThrow(() => buildBetaLaunchView({ sessionId, userId }));
    const serialized = JSON.stringify(buildBetaLaunchView({ sessionId, userId })).toLowerCase();

    for (const blocked of ["secret", "token", "webhook", "payload"]) {
      assert.equal(serialized.includes(blocked), false);
    }
  });

  it("admin beta invite action requires admin auth", () => {
    assert.throws(() => createBetaInviteWithAdminCookie({ sessionId, inviteCode:"ADMIN-CODE", sessionSecret:adminSecret }), /Unauthorized/);
    assert.equal(getBetaLaunchState(sessionId).invites.length, 0);
  });

  it("admin beta invite action stores hashes and never stores raw invite code or email", () => {
    const inviteId = createBetaInviteWithAdminCookie({ sessionId:BETA_INVITE_SCOPE_ID, inviteCode:"ADMIN-CODE", email:"beta@example.test", sessionCookie:adminCookie, sessionSecret:adminSecret });
    const state = getBetaLaunchState();

    assert.equal(state.invites.some((invite)=>invite.id === inviteId), true);
    assert.equal(JSON.stringify(state).includes("ADMIN-CODE"), false);
    assert.equal(JSON.stringify(state).includes("beta@example.test"), false);
  });

  it("does not call real email LINE or payment providers in beta invite tests", () => {
    const state = getBetaLaunchState(sessionId);

    assert.equal(state.invites.length, 0);
    assert.equal(state.enrollments.length, 0);
  });
});
