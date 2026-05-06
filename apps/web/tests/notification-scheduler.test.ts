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


  it("suppresses queued monthly and yearly premium messages after subscription expiration", async () => {
    approveHoroscopes("expired_dispatch_user", ["monthly_horoscope","yearly_horoscope"]);
    const premium = user({ userId:"expired_dispatch_user", subscription:await activeSubscription("expired_dispatch_user", "premium") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[premium], topics:["monthly_horoscope","yearly_horoscope"], now });

    const expiredSubscription = { ...premium.subscription!, status:"expired" as const, expiredAt:"2026-06-01T00:00:00.000Z", updatedAt:"2026-06-01T00:00:00.000Z" };
    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[{ ...premium, subscription:expiredSubscription }], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now:new Date("2026-06-01T00:00:00.000Z") });

    assert.equal(dispatch.sent, 0);
    assert.equal(dispatch.suppressed, 2);
    assert.equal(g.lineAuditLogs.length, 0);
    assert.deepEqual(getNotificationSchedulerState().deliveryAttempts.map((attempt)=>attempt.errorCode), ["entitlement_lost","entitlement_lost"]);
  });

  it("suppresses queued premium messages after downgrade to basic", async () => {
    approveHoroscopes("downgraded_dispatch_user", ["monthly_horoscope"]);
    const premium = user({ userId:"downgraded_dispatch_user", subscription:await activeSubscription("downgraded_dispatch_user", "premium") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[premium], topics:["monthly_horoscope"], now });

    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[{ ...premium, subscription:undefined, planCode:"basic" }], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(dispatch.sent, 0);
    assert.equal(dispatch.suppressed, 1);
    assert.equal(g.lineAuditLogs.length, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.errorCode, "entitlement_lost");
  });

  it("dispatches allowed daily free messages when entitlement remains valid", async () => {
    approveHoroscopes("free_daily_dispatch_user", ["daily_horoscope"]);
    const freeDaily = user({ userId:"free_daily_dispatch_user", planCode:"free", subscription:undefined });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[freeDaily], topics:["daily_horoscope"], now });

    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[freeDaily], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(dispatch.sent, 1);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.status, "sent");
    assert.equal(g.lineAuditLogs.length, 1);
  });

  it("suppresses queued LINE primary messages when LINE preference is disabled before dispatch", async () => {
    approveHoroscopes("line_disabled_dispatch_user", ["daily_horoscope"]);
    const queuedUser = user({ userId:"line_disabled_dispatch_user", subscription:await activeSubscription("line_disabled_dispatch_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[queuedUser], topics:["daily_horoscope"], now });

    const disabledUser = user({ ...queuedUser, preferences:[{ topicCode:"daily_horoscope", channel:"line", enabled:false, allowFallback:true }, { topicCode:"all", channel:"email", enabled:true, allowFallback:true }] });
    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[disabledUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(dispatch.sent, 0);
    assert.equal(dispatch.fallbackSent, 0);
    assert.equal(dispatch.suppressed, 1);
    assert.equal(g.lineAuditLogs.length, 0);
    assert.equal(g.emailAuditLogs.length, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.errorCode, "primary_channel_preference_disabled");
  });

  it("suppresses queued email primary messages when email preference is disabled before dispatch", async () => {
    approveHoroscopes("email_disabled_dispatch_user", ["daily_horoscope"]);
    const queuedUser = user({ userId:"email_disabled_dispatch_user", primaryChannel:"email", fallbackChannel:"line", subscription:await activeSubscription("email_disabled_dispatch_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[queuedUser], topics:["daily_horoscope"], now });

    const disabledUser = user({ ...queuedUser, preferences:[{ topicCode:"daily_horoscope", channel:"email", enabled:false, allowFallback:true }, { topicCode:"all", channel:"line", enabled:true, allowFallback:true }] });
    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[disabledUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(dispatch.sent, 0);
    assert.equal(dispatch.fallbackSent, 0);
    assert.equal(dispatch.suppressed, 1);
    assert.equal(g.emailAuditLogs.length, 0);
    assert.equal(g.lineAuditLogs.length, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.errorCode, "primary_channel_preference_disabled");
  });

  it("defers queued messages when dispatch falls inside current quiet hours", async () => {
    approveHoroscopes("quiet_dispatch_user", ["daily_horoscope"]);
    const quietDispatch = user({ userId:"quiet_dispatch_user", quietHours:{ start:"08:00", end:"09:00" }, subscription:await activeSubscription("quiet_dispatch_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[quietDispatch], topics:["daily_horoscope"], now });

    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[quietDispatch], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now:new Date("2026-05-03T01:30:00.000Z") });

    assert.equal(dispatch.sent, 0);
    assert.equal(g.lineAuditLogs.length, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.status, "deferred");
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.errorCode, "quiet_hours");
  });

  it("dispatches queued messages outside quiet hours", async () => {
    approveHoroscopes("outside_quiet_dispatch_user", ["daily_horoscope"]);
    const quietDispatch = user({ userId:"outside_quiet_dispatch_user", quietHours:{ start:"08:00", end:"09:00" }, subscription:await activeSubscription("outside_quiet_dispatch_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[quietDispatch], topics:["daily_horoscope"], now });

    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[quietDispatch], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(dispatch.sent, 1);
    assert.equal(g.lineAuditLogs.length, 1);
  });

  it("uses the user's timezone when re-checking quiet hours at dispatch", async () => {
    approveHoroscopes("utc_quiet_dispatch_user", ["daily_horoscope"]);
    const utcQuiet = user({ userId:"utc_quiet_dispatch_user", timezone:"UTC", preferredNotificationTime:"00:30", quietHours:{ start:"00:40", end:"01:00" }, subscription:await activeSubscription("utc_quiet_dispatch_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[utcQuiet], topics:["daily_horoscope"], now });

    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[utcQuiet], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now:new Date("2026-05-03T00:45:00.000Z") });

    assert.equal(dispatch.sent, 0);
    assert.equal(g.lineAuditLogs.length, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.status, "deferred");
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.errorCode, "quiet_hours");
  });

  it("does not treat 23:55 as inside a same-date 00:05 preferred window", async () => {
    approveHoroscopes("midnight_late_user", ["daily_horoscope"]);
    const midnightLate = user({ userId:"midnight_late_user", preferredNotificationTime:"00:05", subscription:await activeSubscription("midnight_late_user") });

    const result = runNotificationSchedulerJob({ sessionId, users:[midnightLate], topics:["daily_horoscope"], now:new Date("2026-05-03T16:55:00.000Z"), dispatchWindowMinutes:15 });

    assert.equal(result.queued.length, 0);
    assert.equal(result.deferred, 1);
    assert.equal(getNotificationSchedulerState().outboundMessages.length, 0);
  });

  it("does not wrap a prior-date 23:55 preferred window into 00:05 next day", async () => {
    approveHoroscopes("midnight_next_day_user", ["daily_horoscope"]);
    const nextDay = user({ userId:"midnight_next_day_user", preferredNotificationTime:"23:55", subscription:await activeSubscription("midnight_next_day_user") });

    const result = runNotificationSchedulerJob({ sessionId, users:[nextDay], topics:["daily_horoscope"], now:new Date("2026-05-03T17:05:00.000Z"), dispatchWindowMinutes:15 });

    assert.equal(result.queued.length, 0);
    assert.equal(result.deferred, 1);
  });

  it("queues 00:10 inside the same local date 00:05 preferred window", async () => {
    approveHoroscopes("midnight_inside_user", ["daily_horoscope"]);
    const inside = user({ userId:"midnight_inside_user", preferredNotificationTime:"00:05", subscription:await activeSubscription("midnight_inside_user") });

    const result = runNotificationSchedulerJob({ sessionId, users:[inside], topics:["daily_horoscope"], now:new Date("2026-05-02T17:10:00.000Z"), dispatchWindowMinutes:15 });

    assert.equal(result.queued.length, 1);
    assert.equal(result.queued[0]?.periodKey, "2026-05-03");
  });

  it("does not queue the current period almost 24 hours late because of circular preferred-time comparison", async () => {
    approveHoroscopes("midnight_period_key_user", ["daily_horoscope"]);
    const periodKeyUser = user({ userId:"midnight_period_key_user", preferredNotificationTime:"00:05", subscription:await activeSubscription("midnight_period_key_user") });

    runNotificationSchedulerJob({ sessionId, users:[periodKeyUser], topics:["daily_horoscope"], now:new Date("2026-05-03T16:55:00.000Z"), dispatchWindowMinutes:15 });

    assert.equal(getNotificationSchedulerState().outboundMessages.some((message)=>message.periodKey==="2026-05-03"), false);
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

  it("claims an overlapping queued email dispatch before provider delivery", async () => {
    approveHoroscopes("overlap_email_user", ["daily_horoscope"]);
    const dispatchUser = user({ userId:"overlap_email_user", primaryChannel:"email", fallbackChannel:undefined, subscription:await activeSubscription("overlap_email_user") });
    let sendCalls = 0;
    let release!:()=>void;
    const providerWait = new Promise<void>((resolve)=>{ release = resolve; });
    const emailGateway = { send:async () => { sendCalls += 1; await providerWait; return { status:"sent" as const, providerMessageId:"email_once" }; } } as unknown as EmailGateway;
    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now });

    const first = dispatchQueuedNotifications({ sessionId, users:[dispatchUser], emailGateway, now });
    const second = dispatchQueuedNotifications({ sessionId, users:[dispatchUser], emailGateway, now });
    await Promise.resolve();
    release();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    assert.equal(sendCalls, 1);
    assert.equal(firstResult.sent + secondResult.sent, 1);
    assert.equal(firstResult.duplicates + secondResult.duplicates, 1);
    assert.deepEqual(getNotificationSchedulerState().deliveryAttempts.map((attempt)=>attempt.status), ["sent", "duplicate"]);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[1]?.errorCode, "already_in_progress");
  });

  it("claims an overlapping queued LINE dispatch before provider delivery", async () => {
    approveHoroscopes("overlap_line_user", ["daily_horoscope"]);
    const dispatchUser = user({ userId:"overlap_line_user", subscription:await activeSubscription("overlap_line_user") });
    let sendCalls = 0;
    let release!:()=>void;
    const providerWait = new Promise<void>((resolve)=>{ release = resolve; });
    const lineGateway = { send:async () => { sendCalls += 1; await providerWait; return { status:"sent" as const, providerMessageId:"line_once" }; } } as unknown as LineGateway;
    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now });

    const first = dispatchQueuedNotifications({ sessionId, users:[dispatchUser], lineGateway, now });
    const second = dispatchQueuedNotifications({ sessionId, users:[dispatchUser], lineGateway, now });
    await Promise.resolve();
    release();
    await Promise.all([first, second]);

    assert.equal(sendCalls, 1);
    assert.deepEqual(getNotificationSchedulerState().deliveryAttempts.map((attempt)=>attempt.status), ["sent", "duplicate"]);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[1]?.errorCode, "already_in_progress");
  });

  it("updates a failed provider claim without allowing duplicate sends", async () => {
    approveHoroscopes("overlap_failed_email_user", ["daily_horoscope"]);
    const dispatchUser = user({ userId:"overlap_failed_email_user", primaryChannel:"email", fallbackChannel:undefined, subscription:await activeSubscription("overlap_failed_email_user") });
    let sendCalls = 0;
    let release!:()=>void;
    const providerWait = new Promise<void>((resolve)=>{ release = resolve; });
    const emailGateway = { send:async () => { sendCalls += 1; await providerWait; return { status:"failed" as const, errorCode:"provider_failed" }; } } as unknown as EmailGateway;
    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now });

    const first = dispatchQueuedNotifications({ sessionId, users:[dispatchUser], emailGateway, now });
    const second = dispatchQueuedNotifications({ sessionId, users:[dispatchUser], emailGateway, now });
    await Promise.resolve();
    release();
    await Promise.all([first, second]);

    assert.equal(sendCalls, 1);
    assert.deepEqual(getNotificationSchedulerState().deliveryAttempts.map((attempt)=>attempt.status), ["failed", "duplicate"]);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.errorCode, "provider_failed");
    assert.equal(getNotificationSchedulerState().outboundMessages[0]?.status, "failed");
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


  it("suppresses a queued message when its exact source birth profile is deleted", async () => {
    const birthProfileId = approveHoroscopes("deleted_source_dispatch_user", ["daily_horoscope"]);
    const dispatchUser = user({ userId:"deleted_source_dispatch_user", subscription:await activeSubscription("deleted_source_dispatch_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now });

    deleteBirthProfile({ sessionId, userId:"deleted_source_dispatch_user" }, birthProfileId, new Date("2026-05-02T00:00:00.000Z"));
    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[dispatchUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(dispatch.sent, 0);
    assert.equal(dispatch.suppressed, 1);
    assert.equal(g.lineAuditLogs.length, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.errorCode, "user_or_source_artifact_inactive");
  });

  it("does not accept another approved horoscope for the same period as the queued source", async () => {
    const oldBirthProfileId = approveHoroscopes("replaced_source_dispatch_user", ["daily_horoscope"]);
    const dispatchUser = user({ userId:"replaced_source_dispatch_user", subscription:await activeSubscription("replaced_source_dispatch_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now });

    deleteBirthProfile({ sessionId, userId:"replaced_source_dispatch_user" }, oldBirthProfileId, new Date("2026-05-02T00:00:00.000Z"));
    approveHoroscopes("replaced_source_dispatch_user", ["daily_horoscope"]);
    const activeResults = getMockMvpState(sessionId).horoscopeResults.filter((result)=>result.userId==="replaced_source_dispatch_user"&&result.periodType==="daily"&&result.periodKey===getNotificationPeriodKey("daily_horoscope", now, "Asia/Bangkok")&&result.status==="approved");

    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[dispatchUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(activeResults.length, 1);
    assert.equal(dispatch.sent, 0);
    assert.equal(dispatch.suppressed, 1);
    assert.equal(g.lineAuditLogs.length, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.errorCode, "user_or_source_artifact_inactive");
  });

  it("dispatches a queued message when horoscope result chart snapshot and birth profile still match", async () => {
    approveHoroscopes("matching_source_dispatch_user", ["daily_horoscope"]);
    const dispatchUser = user({ userId:"matching_source_dispatch_user", subscription:await activeSubscription("matching_source_dispatch_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now });

    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[dispatchUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(dispatch.sent, 1);
    assert.equal(g.lineAuditLogs.length, 1);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.status, "sent");
  });

  it("does not use stale fallback consent after fallback permission is revoked", async () => {
    approveHoroscopes("fallback_revoked_dispatch_user", ["daily_horoscope"]);
    const queuedUser = user({ userId:"fallback_revoked_dispatch_user", subscription:await activeSubscription("fallback_revoked_dispatch_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[queuedUser], topics:["daily_horoscope"], now });

    const revokedFallbackUser = user({ ...queuedUser, preferences:[{ topicCode:"all", channel:"line", enabled:true }, { topicCode:"all", channel:"email", enabled:true }] });
    revokedFallbackUser.lineAccount!.blocked = true;
    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[revokedFallbackUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(dispatch.fallbackSent, 0);
    assert.equal(g.emailAuditLogs.length, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts.map((attempt)=>attempt.channel).join(","), "line");
  });

  it("does not use fallback when the current fallback channel preference is disabled", async () => {
    approveHoroscopes("fallback_disabled_dispatch_user", ["daily_horoscope"]);
    const queuedUser = user({ userId:"fallback_disabled_dispatch_user", subscription:await activeSubscription("fallback_disabled_dispatch_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[queuedUser], topics:["daily_horoscope"], now });

    const disabledFallbackUser = user({ ...queuedUser, preferences:[{ topicCode:"all", channel:"line", enabled:true, allowFallback:true }, { topicCode:"all", channel:"email", enabled:false, allowFallback:true }] });
    disabledFallbackUser.lineAccount!.blocked = true;
    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[disabledFallbackUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(dispatch.fallbackSent, 0);
    assert.equal(g.emailAuditLogs.length, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts.map((attempt)=>attempt.channel).join(","), "line");
  });

  it("does not use fallback when the current fallback email is unsubscribed or bounced", async () => {
    approveHoroscopes("fallback_unsubscribed_dispatch_user", ["daily_horoscope"]);
    const queuedUser = user({ userId:"fallback_unsubscribed_dispatch_user", subscription:await activeSubscription("fallback_unsubscribed_dispatch_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[queuedUser], topics:["daily_horoscope"], now });

    const blockedFallbackUser = user({ ...queuedUser });
    blockedFallbackUser.lineAccount!.blocked = true;
    blockedFallbackUser.emailAccount = { ...blockedFallbackUser.emailAccount!, unsubscribed:true, bounced:true };
    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[blockedFallbackUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(dispatch.fallbackSent, 0);
    assert.equal(g.emailAuditLogs.length, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts.map((attempt)=>attempt.channel).join(","), "line");
  });

  it("retries and sends a quiet-hour-deferred message after quiet hours end", async () => {
    approveHoroscopes("quiet_retry_dispatch_user", ["daily_horoscope"]);
    const quietDispatch = user({ userId:"quiet_retry_dispatch_user", quietHours:{ start:"08:00", end:"09:00" }, subscription:await activeSubscription("quiet_retry_dispatch_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[quietDispatch], topics:["daily_horoscope"], now });

    const deferred = await dispatchQueuedNotifications({ sessionId, users:[quietDispatch], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now:new Date("2026-05-03T01:30:00.000Z") });
    const retried = await dispatchQueuedNotifications({ sessionId, users:[quietDispatch], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(deferred.sent, 0);
    assert.equal(deferred.attempts[0]?.status, "deferred");
    assert.equal(getNotificationSchedulerState().deliveryAttempts.some((attempt)=>attempt.status==="in_progress"), false);
    assert.equal(retried.sent, 1);
    assert.equal(g.lineAuditLogs.length, 1);
    assert.deepEqual(getNotificationSchedulerState().deliveryAttempts.map((attempt)=>attempt.status), ["deferred", "sent"]);
    assert.equal(getNotificationSchedulerState().outboundMessages[0]?.status, "sent");
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
