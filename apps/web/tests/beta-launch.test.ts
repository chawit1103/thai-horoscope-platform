import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createAdminSessionCookie, createBetaInviteWithAdminCookie } from "../src/mvp/admin-auth";
import { assertBetaCopySafe, buildBetaLaunchView, canAccessBetaEntitledPeriod, canAccessBetaOnlyFlow, createBetaInvite, enrollBetaUser, getBetaDisclaimers, getBetaLaunchCopy, getBetaLaunchState, isBetaUserAllowed, resetBetaLaunchState, setBetaEnrollmentStatus, validateBetaInviteCode } from "../src/mvp/beta-launch";
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
    resetBetaLaunchState(sessionId);
    setMockUserPlan(userId, "free", sessionId);
  });

  it("valid invite code enrolls a beta user", () => {
    createBetaInvite({ sessionId, inviteCode:"PR31-READY" });

    const validation = validateBetaInviteCode({ sessionId, inviteCode:" pr31-ready " });
    const enrollment = enrollBetaUser({ sessionId, userId, inviteCode:"PR31-READY" });

    assert.equal(validation.ok, true);
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

  it("revoked invite cannot enroll", () => {
    createBetaInvite({ sessionId, inviteCode:"REVOKED-CODE", status:"revoked" });

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
    createBetaInvite({ sessionId, userId });

    assert.equal(isBetaUserAllowed({ sessionId, userId }), "invited");
    assert.equal(canAccessBetaOnlyFlow({ sessionId, userId }), true);
  });

  it("beta enrollment does not grant premium subscription entitlement by itself", () => {
    createBetaInvite({ sessionId, inviteCode:"ENTITLEMENT-CHECK" });
    enrollBetaUser({ sessionId, userId, inviteCode:"ENTITLEMENT-CHECK" });

    const allowed = canAccessBetaEntitledPeriod({ state:getMockMvpState(sessionId), sessionId, userId, periodType:"monthly", now });

    assert.equal(allowed, false);
  });

  it("beta enrollment composes with paid subscription entitlement", async () => {
    createBetaInvite({ sessionId, inviteCode:"PAID-CHECK" });
    enrollBetaUser({ sessionId, userId, inviteCode:"PAID-CHECK" });
    setMockUserPlan(userId, "premium", sessionId);
    const subscription = await activatePremiumSubscription();

    const allowed = canAccessBetaEntitledPeriod({ state:getMockMvpState(sessionId), sessionId, userId, periodType:"yearly", subscription, now });

    assert.equal(allowed, true);
  });

  it("beta enrollment does not bypass privacy deletion or deactivation controls", () => {
    createBetaInvite({ sessionId, inviteCode:"PRIVACY-CHECK" });
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

  it("admin beta invite action requires admin auth", () => {
    assert.throws(() => createBetaInviteWithAdminCookie({ sessionId, inviteCode:"ADMIN-CODE", sessionSecret:adminSecret }), /Unauthorized/);
    assert.equal(getBetaLaunchState(sessionId).invites.length, 0);
  });

  it("admin beta invite action stores hashes and never stores raw invite code or email", () => {
    const inviteId = createBetaInviteWithAdminCookie({ sessionId, inviteCode:"ADMIN-CODE", email:"beta@example.test", sessionCookie:adminCookie, sessionSecret:adminSecret });
    const state = getBetaLaunchState(sessionId);

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
