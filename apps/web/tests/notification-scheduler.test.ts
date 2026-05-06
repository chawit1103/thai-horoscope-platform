import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { EmailGateway, SandboxEmailProvider, createEmailChannelAccount, type EmailAuditLogEntry } from "../src/mvp/email-gateway";
import { LineGateway, SandboxLineProvider, createLineChannelAccount, type LineAuditLogEntry } from "../src/mvp/line-gateway";
import { approveDraft, callMockAstroCalc, deleteBirthProfile, generateHoroscopeResult, getMockMvpState, requestAccountDeletion, resetMockMvpState, saveBirthProfile, setMockUserPlan, storeChartSnapshot, type PeriodType } from "../src/mvp/mock-flow";
import { getNotificationPeriodKey, getNotificationSchedulerState, resetNotificationSchedulerState, runNotificationSchedulerJob, dispatchQueuedNotifications, type NotificationSchedulerUser, type NotificationTopic } from "../src/mvp/notification-scheduler";
import { processMockSubscriptionWebhook, resetMockSubscriptionState, type MockSubscriptionWebhookEvent, type SubscriptionRecord } from "../src/mvp/subscription-lifecycle";

const sessionId = "scheduler_test";
const now = new Date("2026-05-03T00:30:00.000Z");
const periodStart = "2026-05-01T00:00:00.000Z";
const periodEnd = "2026-06-01T00:00:00.000Z";
const topics:NotificationTopic[] = ["daily_horoscope","weekly_horoscope","monthly_horoscope","yearly_horoscope"];

async function activeSubscription(userId:string, planCode:"free"|"basic"|"premium" = "premium"):Promise<SubscriptionRecord> {
  const event:MockSubscriptionWebhookEvent = { id:`evt_sub_${userId}`, type:"subscription.created", subscriptionId:`sub_${userId}`, userId, planCode, status:"active", currentPeriodStart:periodStart, currentPeriodEnd:periodEnd, occurredAt:"2026-05-01T00:00:00.000Z" };
  const result = await processMockSubscriptionWebhook(event);
  assert.equal(result.status, "applied");
  assert.ok(result.subscription);
  return result.subscription;
}

function approveHoroscopes(userId:string, selectedTopics:NotificationTopic[] = topics):string {
  const context = { sessionId, userId };
  setMockUserPlan(userId, "premium", sessionId);
  const profile = saveBirthProfile({ birthDate:"1992-08-15", birthTime:"07:30", birthTimeUnknown:false, birthPlaceText:"Bangkok", timezone:"Asia/Bangkok", consentBirthData:true }, context, new Date("2026-05-01T00:00:00.000Z"));
  const chart = storeChartSnapshot(callMockAstroCalc(profile), sessionId, new Date("2026-05-01T00:01:00.000Z"));
  for (const topic of selectedTopics) {
    const periodType = topic.replace("_horoscope", "") as PeriodType;
    const result = generateHoroscopeResult({ chartSnapshot:chart, periodType, periodKey:getNotificationPeriodKey(topic, now, "Asia/Bangkok"), sessionId, now:new Date("2026-05-01T00:02:00.000Z") });
    approveDraft(result.id, "scheduler_admin", sessionId, new Date("2026-05-01T00:03:00.000Z"));
  }
  return profile.id;
}

function user(input:Partial<NotificationSchedulerUser> & Pick<NotificationSchedulerUser, "userId">):NotificationSchedulerUser {
  const emailAccount = { ...createEmailChannelAccount({ userId:input.userId, email:`${input.userId}@example.test`, now }), verified:true };
  const lineAccount = createLineChannelAccount({ userId:input.userId, lineUserId:`U${input.userId.replace(/[^a-zA-Z0-9]/g, "")}00000000`, now });
  return {
    timezone:"Asia/Bangkok",
    preferredNotificationTime:"07:30",
    primaryChannel:"line",
    fallbackChannel:"email",
    preferences:[
      { topicCode:"all", channel:"line", enabled:true, allowFallback:true },
      { topicCode:"all", channel:"email", enabled:true },
    ],
    emailAccount,
    lineAccount,
    ...input,
  };
}

function gateways() {
  const emailProvider = new SandboxEmailProvider();
  const lineProvider = new SandboxLineProvider();
  const emailAuditLogs:EmailAuditLogEntry[] = [];
  const lineAuditLogs:LineAuditLogEntry[] = [];
  return {
    emailProvider,
    lineProvider,
    emailAuditLogs,
    lineAuditLogs,
    emailGateway:new EmailGateway({ provider:emailProvider, fromEmail:"noreply@example.test", sandboxMode:true, auditHashSecret:"test-email-audit-secret", auditLogs:emailAuditLogs }),
    lineGateway:new LineGateway({ provider:lineProvider, sandboxMode:true, auditHashSecret:"test-line-audit-secret", auditLogs:lineAuditLogs }),
  };
}

describe("notification scheduler", () => {
  beforeEach(() => {
    resetMockMvpState();
    resetMockSubscriptionState();
    resetNotificationSchedulerState();
  });

  it("queues daily weekly monthly and yearly notifications for an active premium user", async () => {
    approveHoroscopes("premium_user");
    const premiumUser = user({ userId:"premium_user", subscription:await activeSubscription("premium_user", "premium") });

    const result = runNotificationSchedulerJob({ sessionId, users:[premiumUser], now });

    assert.equal(result.queued.length, 4);
    assert.deepEqual(result.queued.map((message)=>message.topicCode).sort(), [...topics].sort());
  });

  it("does not queue premium monthly or yearly topics for a free user", () => {
    approveHoroscopes("free_user", ["monthly_horoscope","yearly_horoscope"]);
    const freeUser = user({ userId:"free_user", planCode:"free" });

    const result = runNotificationSchedulerJob({ sessionId, users:[freeUser], topics:["monthly_horoscope","yearly_horoscope"], now });

    assert.equal(result.queued.length, 0);
    assert.equal(result.skipped, 2);
  });

  it("skips inactive deactivated and account-deleted users", async () => {
    approveHoroscopes("inactive_user", ["daily_horoscope"]);
    approveHoroscopes("deleted_user", ["daily_horoscope"]);
    requestAccountDeletion({ sessionId, userId:"deleted_user" }, new Date("2026-05-02T00:00:00.000Z"));

    const inactive = user({ userId:"inactive_user", active:false, subscription:await activeSubscription("inactive_user") });
    const deleted = user({ userId:"deleted_user", subscription:await activeSubscription("deleted_user") });
    const result = runNotificationSchedulerJob({ sessionId, users:[inactive, deleted], topics:["daily_horoscope"], now });

    assert.equal(result.queued.length, 0);
    assert.equal(result.skipped, 2);
  });

  it("skips users unsubscribed from a topic or channel", async () => {
    approveHoroscopes("unsubscribed_user", ["daily_horoscope"]);
    approveHoroscopes("topic_disabled_user", ["daily_horoscope"]);
    const emailAccount = { ...createEmailChannelAccount({ userId:"unsubscribed_user", email:"unsubscribed@example.test", now }), verified:true, unsubscribed:true };
    const unsubscribed = user({ userId:"unsubscribed_user", primaryChannel:"email", emailAccount, subscription:await activeSubscription("unsubscribed_user") });
    const topicDisabled = user({ userId:"topic_disabled_user", subscription:await activeSubscription("topic_disabled_user"), preferences:[{ topicCode:"daily_horoscope", channel:"line", enabled:false }, { topicCode:"all", channel:"email", enabled:true, allowFallback:true }] });

    const result = runNotificationSchedulerJob({ sessionId, users:[unsubscribed, topicDisabled], topics:["daily_horoscope"], now });

    assert.equal(result.queued.length, 0);
    assert.equal(result.skipped, 2);
  });

  it("defers during quiet hours", async () => {
    approveHoroscopes("quiet_user", ["daily_horoscope"]);
    const quietUser = user({ userId:"quiet_user", quietHours:{ start:"22:00", end:"08:00" }, subscription:await activeSubscription("quiet_user") });

    const result = runNotificationSchedulerJob({ sessionId, users:[quietUser], topics:["daily_horoscope"], now });

    assert.equal(result.queued.length, 0);
    assert.equal(result.deferred, 1);
  });

  it("respects timezone and preferred notification time", async () => {
    approveHoroscopes("bangkok_user", ["daily_horoscope"]);
    approveHoroscopes("utc_user", ["daily_horoscope"]);
    const bangkok = user({ userId:"bangkok_user", timezone:"Asia/Bangkok", preferredNotificationTime:"07:30", subscription:await activeSubscription("bangkok_user") });
    const utc = user({ userId:"utc_user", timezone:"UTC", preferredNotificationTime:"07:30", subscription:await activeSubscription("utc_user") });

    const result = runNotificationSchedulerJob({ sessionId, users:[bangkok, utc], topics:["daily_horoscope"], now });

    assert.equal(result.queued.length, 1);
    assert.equal(result.queued[0]?.userId, "bangkok_user");
    assert.equal(result.deferred, 1);
  });

  it("does not create duplicate outbound messages across retry runs", async () => {
    approveHoroscopes("retry_user", ["daily_horoscope"]);
    const retryUser = user({ userId:"retry_user", subscription:await activeSubscription("retry_user") });

    const first = runNotificationSchedulerJob({ sessionId, users:[retryUser], topics:["daily_horoscope"], now });
    const second = runNotificationSchedulerJob({ sessionId, users:[retryUser], topics:["daily_horoscope"], now });

    assert.equal(first.queued.length, 1);
    assert.equal(second.duplicates, 1);
    assert.equal(getNotificationSchedulerState().outboundMessages.length, 1);
  });

  it("does not send duplicates during repeated dispatch", async () => {
    approveHoroscopes("dispatch_retry_user", ["daily_horoscope"]);
    const dispatchUser = user({ userId:"dispatch_retry_user", subscription:await activeSubscription("dispatch_retry_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now });

    await dispatchQueuedNotifications({ sessionId, users:[dispatchUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });
    await dispatchQueuedNotifications({ sessionId, users:[dispatchUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(getNotificationSchedulerState().deliveryAttempts.length, 1);
    assert.equal(g.lineProvider.networkSendCount, 0);
    assert.equal(g.lineProvider.sent.length, 0);
  });

  it("does not use fallback when primary is unavailable but fallback is not allowed", async () => {
    approveHoroscopes("no_fallback_user", ["daily_horoscope"]);
    const noFallback = user({ userId:"no_fallback_user", subscription:await activeSubscription("no_fallback_user"), preferences:[{ topicCode:"all", channel:"line", enabled:true }, { topicCode:"all", channel:"email", enabled:true }] });
    noFallback.lineAccount!.blocked = true;
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[noFallback], topics:["daily_horoscope"], now });

    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[noFallback], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(dispatch.fallbackSent, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts.length, 1);
  });

  it("falls back from blocked LINE primary to verified email when allowed", async () => {
    approveHoroscopes("fallback_user", ["daily_horoscope"]);
    const fallbackUser = user({ userId:"fallback_user", subscription:await activeSubscription("fallback_user") });
    fallbackUser.lineAccount!.blocked = true;
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[fallbackUser], topics:["daily_horoscope"], now });

    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[fallbackUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(dispatch.fallbackSent, 1);
    assert.equal(getNotificationSchedulerState().deliveryAttempts.map((attempt)=>attempt.channel).join(","), "line,email");
    assert.equal(g.emailProvider.networkSendCount, 0);
  });

  it("does not deliver bounced email", async () => {
    approveHoroscopes("bounced_user", ["daily_horoscope"]);
    const bouncedEmail = { ...createEmailChannelAccount({ userId:"bounced_user", email:"bounced@example.test", now }), verified:true, bounced:true };
    const bouncedUser = user({ userId:"bounced_user", primaryChannel:"email", fallbackChannel:undefined, emailAccount:bouncedEmail, subscription:await activeSubscription("bounced_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[bouncedUser], topics:["daily_horoscope"], now });

    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[bouncedUser], emailGateway:g.emailGateway, now });

    assert.equal(dispatch.sent, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.status, "suppressed");
  });

  it("does not queue deleted birth-profile-derived horoscope artifacts", async () => {
    const birthProfileId = approveHoroscopes("deleted_profile_user", ["daily_horoscope"]);
    const deletedProfileUser = user({ userId:"deleted_profile_user", subscription:await activeSubscription("deleted_profile_user") });
    deleteBirthProfile({ sessionId, userId:"deleted_profile_user" }, birthProfileId, new Date("2026-05-02T00:00:00.000Z"));

    const result = runNotificationSchedulerJob({ sessionId, users:[deletedProfileUser], topics:["daily_horoscope"], now });

    assert.equal(result.queued.length, 0);
    assert.equal(result.skipped, 1);
  });

  it("records delivery attempts without PII or secrets", async () => {
    approveHoroscopes("privacy_user", ["daily_horoscope"]);
    const privacyUser = user({ userId:"privacy_user", subscription:await activeSubscription("privacy_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[privacyUser], topics:["daily_horoscope"], now });

    await dispatchQueuedNotifications({ sessionId, users:[privacyUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });
    const stateJson = JSON.stringify(getNotificationSchedulerState());
    const gatewayAuditJson = JSON.stringify([...g.emailAuditLogs, ...g.lineAuditLogs]);

    assert.equal(getNotificationSchedulerState().deliveryAttempts.length, 1);
    assert.equal(stateJson.includes("privacy_user@example.test"), false);
    assert.equal(stateJson.includes(privacyUser.lineAccount!.lineUserId), false);
    assert.equal(stateJson.includes("1992-08-15"), false);
    assert.equal(stateJson.toLowerCase().includes("secret"), false);
    assert.equal(gatewayAuditJson.includes("privacy_user@example.test"), false);
    assert.equal(gatewayAuditJson.includes(privacyUser.lineAccount!.lineUserId), false);
  });

  it("never calls real LINE or email providers in tests", async () => {
    approveHoroscopes("network_user", ["daily_horoscope"]);
    const networkUser = user({ userId:"network_user", subscription:await activeSubscription("network_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[networkUser], topics:["daily_horoscope"], now });

    await dispatchQueuedNotifications({ sessionId, users:[networkUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(g.emailProvider.networkSendCount, 0);
    assert.equal(g.emailProvider.sent.length, 0);
    assert.equal(g.lineProvider.networkSendCount, 0);
    assert.equal(g.lineProvider.sent.length, 0);
  });
});
