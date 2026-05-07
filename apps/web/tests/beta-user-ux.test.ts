import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { buildBetaMockSubscriptionWindow, buildBirthProfileSummary, buildChannelStatusSummary, buildNotificationPreferenceSummary, buildSafeHoroscopeView, buildSubscriptionSummary, containsUnsafeUserFacingLeak, ENTERTAINMENT_DISCLAIMER, getLatestUserSubscription, maskEmail, validateOnboardingFields } from "../src/mvp/beta-user-ux";
import { EmailGateway, SandboxEmailProvider, createEmailChannelAccount, type EmailAuditLogEntry } from "../src/mvp/email-gateway";
import { createLineChannelAccount, SandboxLineProvider } from "../src/mvp/line-gateway";
import { approveDraft, callMockAstroCalc, deleteBirthProfile, exportUserData, generateHoroscopeResult, getMockMvpState, getMockPeriodKey, requestAccountDeletion, resetMockMvpState, saveBirthProfile, setMockUserPlan, setNotificationPreference, storeChartSnapshot, type PeriodType } from "../src/mvp/mock-flow";
import { processMockSubscriptionWebhook, resetMockSubscriptionState, type MockSubscriptionWebhookEvent } from "../src/mvp/subscription-lifecycle";

const sessionId = "beta_user_ux_test";
const userId = "beta_user";
const now = new Date("2026-05-03T00:00:00.000Z");

function createHoroscopes(input:{ planCode?:"free"|"basic"|"premium"; birthTimeUnknown?:boolean } = {}) {
  setMockUserPlan(userId, input.planCode ?? "free", sessionId);
  const profile = saveBirthProfile({
    birthDate:"1992-08-15",
    birthTime:input.birthTimeUnknown ? "" : "07:30",
    birthTimeUnknown:input.birthTimeUnknown ?? false,
    birthPlaceText:"Bangkok",
    timezone:"Asia/Bangkok",
    consentBirthData:true,
  }, { sessionId, userId });
  const chart = storeChartSnapshot(callMockAstroCalc(profile), sessionId);
  for (const periodType of ["daily", "weekly", "monthly", "yearly"] as PeriodType[]) {
    const result = generateHoroscopeResult({ chartSnapshot:chart, periodType, periodKey:getMockPeriodKey(periodType), sessionId });
    approveDraft(result.id, "beta_ux_admin", sessionId);
  }
  return profile;
}

async function activateSubscription(planCode:"basic"|"premium", status:"trialing"|"active" = "active") {
  const event:MockSubscriptionWebhookEvent = {
    id:`evt_beta_ux_${planCode}_${status}`,
    type:"subscription.created",
    subscriptionId:`sub_beta_ux_${planCode}_${status}`,
    userId,
    planCode,
    status,
    currentPeriodStart:"2026-05-01T00:00:00.000Z",
    currentPeriodEnd:"2026-06-01T00:00:00.000Z",
    occurredAt:"2026-05-01T00:00:00.000Z",
  };
  const result = await processMockSubscriptionWebhook(event);
  assert.equal(result.status, "applied");
  assert.ok(result.subscription);
  return result.subscription;
}

describe("beta user onboarding and subscription UX", () => {
  beforeEach(() => {
    resetMockMvpState("free");
    resetMockSubscriptionState();
  });

  it("validates onboarding required fields", () => {
    const invalid = validateOnboardingFields({ birthDate:"", birthTime:"", birthPlaceText:"", timezone:"", consentBirthData:"" });

    assert.equal(invalid.ok, false);
    assert.deepEqual(invalid.errors.map((error)=>error.field).sort(), ["birthDate", "birthPlaceText", "birthTime", "consentBirthData", "timezone"].sort());
  });

  it("allows unknown birth time without exact time and shows confidence warning", () => {
    const valid = validateOnboardingFields({ birthDate:"1992-08-15", birthTime:"", birthTimeUnknown:"on", birthPlaceText:"Bangkok", timezone:"Asia/Bangkok", consentBirthData:"on" });
    const profile = createHoroscopes({ birthTimeUnknown:true });
    const summary = buildBirthProfileSummary(profile);

    assert.equal(valid.ok, true);
    assert.equal(valid.normalized.birthTime, "");
    assert.equal(summary.confidenceLabel, "ประมาณบางส่วน");
    assert.match(summary.warnings.join("\n"), /ไม่ทราบเวลาเกิด/);
  });

  it("renders subscription status and period access correctly", async () => {
    createHoroscopes({ planCode:"premium" });
    const subscription = await activateSubscription("premium", "trialing");
    const summary = buildSubscriptionSummary({ state:getMockMvpState(sessionId), userId, subscription, now });

    assert.equal(summary.planCode, "premium");
    assert.equal(summary.status, "trialing");
    assert.equal(summary.periodAccess.monthly, true);
    assert.equal(summary.periodAccess.yearly, true);
  });

  it("blocks premium pages for free users", () => {
    createHoroscopes({ planCode:"free" });
    const view = buildSafeHoroscopeView({ state:getMockMvpState(sessionId), userId, periodType:"monthly", now });

    assert.equal(view.allowed, false);
    assert.match(view.summary, /แผน free/);
  });

  it("keeps a user-selected free plan from inheriting stale paid entitlement", async () => {
    createHoroscopes({ planCode:"premium" });
    const subscription = await activateSubscription("premium");
    setMockUserPlan(userId, "free", sessionId);
    const state = getMockMvpState(sessionId);
    const summary = buildSubscriptionSummary({ state, userId, subscription, now });
    const view = buildSafeHoroscopeView({ state, userId, periodType:"yearly", subscription, now });

    assert.equal(summary.planCode, "free");
    assert.equal(summary.status, "free");
    assert.equal(summary.periodAccess.yearly, false);
    assert.equal(view.allowed, false);
  });

  it("allows active premium users to view monthly and yearly mock content", async () => {
    createHoroscopes({ planCode:"premium" });
    const subscription = await activateSubscription("premium");
    const state = getMockMvpState(sessionId);

    assert.equal(buildSafeHoroscopeView({ state, userId, periodType:"monthly", subscription, now }).allowed, true);
    assert.equal(buildSafeHoroscopeView({ state, userId, periodType:"yearly", subscription, now }).allowed, true);
  });

  it("notification settings can suppress topics and channels in mock UX", () => {
    createHoroscopes();
    setNotificationPreference({ sessionId, userId }, "daily_horoscope", false, now);
    const preferences = buildNotificationPreferenceSummary(getMockMvpState(sessionId), userId);
    const daily = preferences.find((preference)=>preference.topicCode==="daily_horoscope");

    assert.equal(daily?.lineEnabled, false);
    assert.equal(daily?.emailEnabled, false);
  });

  it("privacy settings expose export delete and account deletion data paths", () => {
    const profile = createHoroscopes();
    const exported = exportUserData({ sessionId, userId }, now);
    deleteBirthProfile({ sessionId, userId }, profile.id, now);
    requestAccountDeletion({ sessionId, userId }, now);
    const state = getMockMvpState(sessionId);

    assert.equal(exported.birthProfiles.length, 1);
    assert.equal(state.birthProfiles.length, 0);
    assert.equal(state.accountDeletionRequests.some((request)=>request.userId===userId), true);
  });

  it("user-facing summaries do not render raw LINE IDs email secrets payment IDs or birth hashes", async () => {
    createHoroscopes({ planCode:"premium" });
    const subscription = await activateSubscription("premium");
    const state = getMockMvpState(sessionId);
    const ui = {
      channels:buildChannelStatusSummary({ maskedEmail:maskEmail("beta@example.test"), emailVerified:true, lineConnected:true, lineFollowed:true }),
      subscription:buildSubscriptionSummary({ state, userId, subscription, now }),
      horoscope:buildSafeHoroscopeView({ state, userId, periodType:"daily", subscription, now }),
      lineAccount:createLineChannelAccount({ userId, lineUserId:"UrawLineUserIdShouldNeverRender000", now }),
    };

    assert.equal(containsUnsafeUserFacingLeak({ channels:ui.channels, subscription:ui.subscription, horoscope:ui.horoscope }), false);
    assert.equal(JSON.stringify(ui.channels).includes("UrawLineUserIdShouldNeverRender000"), false);
  });

  it("disclaimer appears on horoscope views", () => {
    createHoroscopes();
    const view = buildSafeHoroscopeView({ state:getMockMvpState(sessionId), userId, periodType:"daily", now });

    assert.equal(view.disclaimer, ENTERTAINMENT_DISCLAIMER);
  });

  it("does not call real providers in UX tests", async () => {
    const emailProvider = new SandboxEmailProvider();
    const lineProvider = new SandboxLineProvider();
    const auditLogs:EmailAuditLogEntry[] = [];
    const emailGateway = new EmailGateway({ provider:emailProvider, fromEmail:"noreply@example.test", sandboxMode:true, auditHashSecret:"ux-test-secret", auditLogs });
    const emailAccount = { ...createEmailChannelAccount({ userId, email:"beta@example.test", now }), verified:true };

    await emailGateway.send(emailAccount, { topicCode:"account_security", subject:"Mock", text:"Mock", html:"<p>Mock</p>", transactional:true });

    assert.equal(emailProvider.networkSendCount, 0);
    assert.equal(lineProvider.networkSendCount, 0);
  });

  it("finds latest user subscription for display", async () => {
    createHoroscopes({ planCode:"premium" });
    await activateSubscription("basic");
    const premium = await activateSubscription("premium");

    assert.equal(getLatestUserSubscription(userId)?.id, premium.id);
  });

  it("derives beta mock subscription periods from signup time", () => {
    const signupAt = new Date("2026-08-10T12:00:00.000Z");
    const window = buildBetaMockSubscriptionWindow(signupAt);

    assert.equal(window.currentPeriodStart, signupAt.toISOString());
    assert.equal(window.currentPeriodEnd, "2026-09-09T12:00:00.000Z");
    assert.equal(Date.parse(window.currentPeriodEnd) > Date.parse(window.currentPeriodStart), true);
  });
});
