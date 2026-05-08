import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { EmailGateway, SandboxEmailProvider, createEmailChannelAccount, type EmailAuditLogEntry, type EmailProviderRequest } from "../src/mvp/email-gateway";
import { LineGateway, SandboxLineProvider, createLineChannelAccount, type LineAuditLogEntry } from "../src/mvp/line-gateway";
import { approveDraft, callMockAstroCalc, deleteBirthProfile, generateHoroscopeResult, getMockMvpState, requestAccountDeletion, resetMockMvpState, saveBirthProfile, setMockUserPlan, storeChartSnapshot, type PeriodType } from "../src/mvp/mock-flow";
import { getNotificationPeriodKey, getNotificationSchedulerState, resetNotificationSchedulerState, runNotificationSchedulerJob, dispatchQueuedNotifications, type NotificationSchedulerUser, type NotificationTopic } from "../src/mvp/notification-scheduler";
import { processMockSubscriptionWebhook, resetMockSubscriptionState, type MockSubscriptionWebhookEvent, type SubscriptionRecord } from "../src/mvp/subscription-lifecycle";

const sessionId = "scheduler_test";
const now = new Date("2026-05-03T00:30:00.000Z");
const periodStart = "2026-05-01T00:00:00.000Z";
const periodEnd = "2026-06-01T00:00:00.000Z";
const topics:NotificationTopic[] = ["daily_horoscope","weekly_horoscope","monthly_horoscope","yearly_horoscope"];
const dryRunLineActivationEnv = {
  APP_ENV:"staging",
  ADMIN_SESSION_SECRET:"admin-session-secret",
  EMAIL_PROVIDER_MODE:"sandbox",
  EMAIL_AUDIT_HASH_SECRET:"test-email-audit-secret",
  LINE_PROVIDER_MODE:"http",
  LINE_CHANNEL_SECRET:"test-line-channel-secret",
  LINE_CHANNEL_ACCESS_TOKEN:"test-line-access-token",
  LINE_AUDIT_HASH_SECRET:"test-line-audit-secret",
  PAYMENT_PROVIDER_MODE:"mock",
  NOTIFICATION_SCHEDULER_MODE:"dry_run",
  ASTRO_ENGINE:"mock",
  SWISSEPH_LICENSE_MODE:"none",
  ENABLE_PROVIDER_DRY_RUN:"true",
  ENABLE_REAL_LINE_SENDS:"false",
  REQUIRE_PROVIDER_ACTIVATION_APPROVAL:"false",
};
const dryRunEmailActivationEnv = {
  APP_ENV:"staging",
  ADMIN_SESSION_SECRET:"admin-session-secret",
  EMAIL_PROVIDER_MODE:"http",
  EMAIL_FROM_ADDRESS:"noreply@example.test",
  EMAIL_PROVIDER_ENDPOINT:"https://email-provider.example.test/send",
  EMAIL_PROVIDER_API_KEY:"test-email-api-key",
  EMAIL_WEBHOOK_SECRET:"test-email-webhook-secret",
  EMAIL_AUDIT_HASH_SECRET:"test-email-audit-secret",
  EMAIL_VERIFIED_SENDER_DOMAIN:"example.test",
  LINE_PROVIDER_MODE:"sandbox",
  LINE_AUDIT_HASH_SECRET:"test-line-audit-secret",
  PAYMENT_PROVIDER_MODE:"mock",
  NOTIFICATION_SCHEDULER_MODE:"dry_run",
  ASTRO_ENGINE:"mock",
  SWISSEPH_LICENSE_MODE:"none",
  ENABLE_PROVIDER_DRY_RUN:"true",
  ENABLE_REAL_EMAIL_SENDS:"false",
  REQUIRE_PROVIDER_ACTIVATION_APPROVAL:"false",
};

async function activeSubscription(userId:string, planCode:"free"|"basic"|"premium" = "premium"):Promise<SubscriptionRecord> {
  const event:MockSubscriptionWebhookEvent = { id:`evt_sub_${userId}`, type:"subscription.created", subscriptionId:`sub_${userId}`, userId, planCode, status:"active", currentPeriodStart:periodStart, currentPeriodEnd:periodEnd, occurredAt:"2026-05-01T00:00:00.000Z" };
  const result = await processMockSubscriptionWebhook(event);
  assert.equal(result.status, "applied");
  assert.ok(result.subscription);
  return result.subscription;
}

function approveHoroscopes(userId:string, selectedTopics:NotificationTopic[] = topics, periodNow:Date = now):string {
  const context = { sessionId, userId };
  setMockUserPlan(userId, "premium", sessionId);
  const profile = saveBirthProfile({ birthDate:"1992-08-15", birthTime:"07:30", birthTimeUnknown:false, birthPlaceText:"Bangkok", timezone:"Asia/Bangkok", consentBirthData:true }, context, new Date("2026-05-01T00:00:00.000Z"));
  const chart = storeChartSnapshot(callMockAstroCalc(profile), sessionId, new Date("2026-05-01T00:01:00.000Z"));
  for (const topic of selectedTopics) {
    const periodType = topic.replace("_horoscope", "") as PeriodType;
    const result = generateHoroscopeResult({ chartSnapshot:chart, periodType, periodKey:getNotificationPeriodKey(topic, periodNow, "Asia/Bangkok"), sessionId, now:new Date("2026-05-01T00:02:00.000Z") });
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

async function withProcessEnv<T>(env:Record<string,string>, callback:()=>Promise<T>):Promise<T> {
  const previous = new Map<string, string|undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
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

  it("queues and defers retryable messages during quiet hours inside the preferred window", async () => {
    approveHoroscopes("quiet_user", ["daily_horoscope"]);
    const quietUser = user({ userId:"quiet_user", quietHours:{ start:"22:00", end:"08:00" }, subscription:await activeSubscription("quiet_user") });

    const result = runNotificationSchedulerJob({ sessionId, users:[quietUser], topics:["daily_horoscope"], now });

    assert.equal(result.queued.length, 1);
    assert.equal(result.deferred, 1);
    assert.equal(getNotificationSchedulerState().outboundMessages[0]?.status, "queued");
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.status, "deferred");
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.errorCode, "quiet_hours");
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

  it("does not create duplicate queued records on repeated scheduler runs during quiet hours", async () => {
    approveHoroscopes("quiet_duplicate_user", ["daily_horoscope"]);
    const quietUser = user({ userId:"quiet_duplicate_user", quietHours:{ start:"22:00", end:"08:00" }, subscription:await activeSubscription("quiet_duplicate_user") });

    const first = runNotificationSchedulerJob({ sessionId, users:[quietUser], topics:["daily_horoscope"], now });
    const second = runNotificationSchedulerJob({ sessionId, users:[quietUser], topics:["daily_horoscope"], now });

    assert.equal(first.queued.length, 1);
    assert.equal(second.queued.length, 0);
    assert.equal(second.duplicates, 1);
    assert.equal(getNotificationSchedulerState().outboundMessages.length, 1);
    assert.equal(getNotificationSchedulerState().deliveryAttempts.filter((attempt)=>attempt.errorCode==="quiet_hours").length, 1);
  });

  it("dispatches the same quiet-hour queued message after quiet hours even outside the original preferred window", async () => {
    approveHoroscopes("quiet_after_window_user", ["daily_horoscope"]);
    const quietUser = user({ userId:"quiet_after_window_user", quietHours:{ start:"22:00", end:"08:00" }, subscription:await activeSubscription("quiet_after_window_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[quietUser], topics:["daily_horoscope"], now });

    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[quietUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now:new Date("2026-05-03T01:00:00.000Z") });

    assert.equal(dispatch.sent, 1);
    assert.equal(getNotificationSchedulerState().outboundMessages.length, 1);
    assert.deepEqual(getNotificationSchedulerState().deliveryAttempts.map((attempt)=>attempt.status), ["deferred", "sent"]);
    assert.equal(g.lineAuditLogs.length, 1);
  });

  it("does not queue deactivated unsubscribed or unentitled users during quiet hours", async () => {
    approveHoroscopes("quiet_deactivated_user", ["daily_horoscope"]);
    approveHoroscopes("quiet_unsubscribed_user", ["daily_horoscope"]);
    approveHoroscopes("quiet_unentitled_user", ["monthly_horoscope"]);
    const deactivated = user({ userId:"quiet_deactivated_user", active:false, quietHours:{ start:"22:00", end:"08:00" }, subscription:await activeSubscription("quiet_deactivated_user") });
    const unsubscribed = user({ userId:"quiet_unsubscribed_user", primaryChannel:"email", quietHours:{ start:"22:00", end:"08:00" }, emailAccount:{ ...createEmailChannelAccount({ userId:"quiet_unsubscribed_user", email:"quiet-unsubscribed@example.test", now }), verified:true, unsubscribed:true }, subscription:await activeSubscription("quiet_unsubscribed_user") });
    const unentitled = user({ userId:"quiet_unentitled_user", quietHours:{ start:"22:00", end:"08:00" }, planCode:"free", subscription:undefined });

    const result = runNotificationSchedulerJob({ sessionId, users:[deactivated, unsubscribed, unentitled], topics:["daily_horoscope", "monthly_horoscope"], now });

    assert.equal(result.queued.length, 0);
    assert.equal(getNotificationSchedulerState().outboundMessages.length, 0);
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



  it("dedupes queued horoscope periods independently of selected primary channel", async () => {
    approveHoroscopes("channel_dedupe_user", ["daily_horoscope"]);
    const lineSnapshot = user({ userId:"channel_dedupe_user", subscription:await activeSubscription("channel_dedupe_user") });
    const emailSnapshot = user({ ...lineSnapshot, primaryChannel:"email", fallbackChannel:"line" });

    const first = runNotificationSchedulerJob({ sessionId, users:[lineSnapshot], topics:["daily_horoscope"], now });
    const second = runNotificationSchedulerJob({ sessionId, users:[emailSnapshot], topics:["daily_horoscope"], now });
    const queued = getNotificationSchedulerState().outboundMessages;

    assert.equal(first.queued.length, 1);
    assert.equal(second.duplicates, 1);
    assert.equal(queued.length, 1);
    assert.equal(queued[0]?.queueKey, "channel_dedupe_user:daily_horoscope:2026-05-03");
    assert.equal(queued[0]?.channel, "email");
    assert.equal(queued[0]?.fallbackChannel, "line");
  });

  it("prevents two scheduler preference snapshots from queuing duplicate outbound messages", async () => {
    approveHoroscopes("worker_snapshot_user", ["daily_horoscope"]);
    const lineSnapshot = user({ userId:"worker_snapshot_user", subscription:await activeSubscription("worker_snapshot_user") });
    const emailSnapshot = user({ ...lineSnapshot, primaryChannel:"email", fallbackChannel:"line" });

    runNotificationSchedulerJob({ sessionId, users:[lineSnapshot], topics:["daily_horoscope"], now });
    runNotificationSchedulerJob({ sessionId, users:[emailSnapshot], topics:["daily_horoscope"], now });

    assert.equal(getNotificationSchedulerState().outboundMessages.length, 1);
    assert.deepEqual(getNotificationSchedulerState().outboundMessages.map((message)=>message.topicCode), ["daily_horoscope"]);
  });

  it("keeps fallback preferences modeled on the same queued message while allowing different periods", async () => {
    const nextDay = new Date("2026-05-04T00:30:00.000Z");
    approveHoroscopes("period_split_user", ["daily_horoscope"], now);
    approveHoroscopes("period_split_user", ["daily_horoscope"], nextDay);
    const dispatchUser = user({ userId:"period_split_user", subscription:await activeSubscription("period_split_user") });

    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now });
    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now:nextDay });
    const queued = getNotificationSchedulerState().outboundMessages;

    assert.equal(queued.length, 2);
    assert.deepEqual(queued.map((message)=>message.periodKey).sort(), ["2026-05-03", "2026-05-04"]);
    assert.deepEqual(queued.map((message)=>message.fallbackChannel), ["email", "email"]);
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

  it("does not let scheduler dispatch bypass provider activation dry-run guardrails", async () => {
    approveHoroscopes("scheduler_activation_guard_user", ["daily_horoscope"]);
    const dispatchUser = user({ userId:"scheduler_activation_guard_user", subscription:await activeSubscription("scheduler_activation_guard_user") });
    let lineSendCalls = 0;
    const lineGateway = { send:async () => { lineSendCalls += 1; return { status:"sent" as const, providerMessageId:"line_should_not_send" }; } } as unknown as LineGateway;
    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now });

    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[dispatchUser], lineGateway, now, providerActivationEnv:dryRunLineActivationEnv });

    assert.equal(lineSendCalls, 0);
    assert.equal(dispatch.sent, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.status, "failed");
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.errorCode, "line_provider_activation_blocked");
    assert.equal(getNotificationSchedulerState().outboundMessages[0]?.status, "queued");
  });

  it("defaults scheduler provider activation guardrails to process env", async () => {
    approveHoroscopes("scheduler_process_env_guard_user", ["daily_horoscope"]);
    const dispatchUser = user({ userId:"scheduler_process_env_guard_user", subscription:await activeSubscription("scheduler_process_env_guard_user") });
    let lineSendCalls = 0;
    const lineGateway = { send:async () => { lineSendCalls += 1; return { status:"sent" as const, providerMessageId:"line_should_not_send" }; } } as unknown as LineGateway;
    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now });

    const dispatch = await withProcessEnv(dryRunLineActivationEnv, () =>
      dispatchQueuedNotifications({ sessionId, users:[dispatchUser], lineGateway, now }),
    );

    assert.equal(lineSendCalls, 0);
    assert.equal(dispatch.sent, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.status, "failed");
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.errorCode, "line_provider_activation_blocked");
  });

  it("does not let scheduler email fallback bypass provider activation dry-run guardrails", async () => {
    approveHoroscopes("scheduler_email_activation_guard_user", ["daily_horoscope"]);
    const dispatchUser = user({ userId:"scheduler_email_activation_guard_user", primaryChannel:"email", fallbackChannel:undefined, subscription:await activeSubscription("scheduler_email_activation_guard_user") });
    let emailSendCalls = 0;
    const emailGateway = { send:async () => { emailSendCalls += 1; return { status:"sent" as const, providerMessageId:"email_should_not_send" }; } } as unknown as EmailGateway;
    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now });

    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[dispatchUser], emailGateway, now, providerActivationEnv:dryRunEmailActivationEnv });

    assert.equal(emailSendCalls, 0);
    assert.equal(dispatch.sent, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.status, "failed");
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.errorCode, "email_provider_activation_blocked");
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
    assert.equal(getNotificationSchedulerState().outboundMessages[0]?.status, "queued");
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


  it("falls back from bounced email primary to LINE only for terminal suppression states", async () => {
    approveHoroscopes("bounced_fallback_user", ["daily_horoscope"]);
    const queuedUser = user({ userId:"bounced_fallback_user", primaryChannel:"email", fallbackChannel:"line", subscription:await activeSubscription("bounced_fallback_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[queuedUser], topics:["daily_horoscope"], now });

    const bouncedPrimary = user({ ...queuedUser, emailAccount:{ ...queuedUser.emailAccount!, bounced:true } });
    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[bouncedPrimary], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(dispatch.fallbackSent, 1);
    assert.deepEqual(getNotificationSchedulerState().deliveryAttempts.map((attempt)=>[attempt.channel, attempt.status, attempt.errorCode]), [["email", "suppressed", "email_bounced"], ["line", "sent", undefined]]);
  });

  it("falls back from unsubscribed email primary when current fallback preference allows", async () => {
    approveHoroscopes("unsubscribed_fallback_user", ["daily_horoscope"]);
    const queuedUser = user({ userId:"unsubscribed_fallback_user", primaryChannel:"email", fallbackChannel:"line", subscription:await activeSubscription("unsubscribed_fallback_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[queuedUser], topics:["daily_horoscope"], now });

    const unsubscribedPrimary = user({ ...queuedUser, emailAccount:{ ...queuedUser.emailAccount!, unsubscribed:true } });
    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[unsubscribedPrimary], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(dispatch.fallbackSent, 1);
    assert.deepEqual(getNotificationSchedulerState().deliveryAttempts.map((attempt)=>[attempt.channel, attempt.status, attempt.errorCode]), [["email", "suppressed", "email_unsubscribed"], ["line", "sent", undefined]]);
  });


  it("includes a stable idempotency key on retryable scheduled email sends", async () => {
    approveHoroscopes("email_idempotency_user", ["daily_horoscope"]);
    const dispatchUser = user({ userId:"email_idempotency_user", primaryChannel:"email", fallbackChannel:undefined, subscription:await activeSubscription("email_idempotency_user") });
    const requests:EmailProviderRequest[] = [];
    const provider = new SandboxEmailProvider();
    provider.send = async (request:EmailProviderRequest) => { requests.push(structuredClone(request)); throw new Error("timeout after accept"); };
    const emailGateway = new EmailGateway({ provider, fromEmail:"noreply@example.test", sandboxMode:false, auditHashSecret:"test-email-audit-secret", auditLogs:[] });
    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now });

    await dispatchQueuedNotifications({ sessionId, users:[dispatchUser], emailGateway, now });
    await dispatchQueuedNotifications({ sessionId, users:[dispatchUser], emailGateway, now });

    assert.equal(requests.length, 2);
    assert.ok(requests[0]?.idempotencyKey);
    assert.equal(requests[0]?.idempotencyKey, requests[1]?.idempotencyKey);
    assert.equal(requests[0]?.headers["x-idempotency-key"], requests[0]?.idempotencyKey);
    assert.equal(requests[0]?.metadata?.idempotencyKey, requests[0]?.idempotencyKey);
    assert.equal(provider.networkSendCount, 0);
    assert.equal(getNotificationSchedulerState().outboundMessages[0]?.status, "queued");
  });

  it("uses different email idempotency keys for different user topic periods", async () => {
    approveHoroscopes("email_idempotency_a", ["daily_horoscope"], now);
    approveHoroscopes("email_idempotency_b", ["daily_horoscope"], now);
    approveHoroscopes("email_idempotency_a", ["daily_horoscope"], new Date("2026-05-04T00:30:00.000Z"));
    const requests:EmailProviderRequest[] = [];
    const provider = new SandboxEmailProvider();
    provider.send = async (request:EmailProviderRequest) => { requests.push(structuredClone(request)); return { providerMessageId:`sent_${requests.length}` }; };
    const emailGateway = new EmailGateway({ provider, fromEmail:"noreply@example.test", sandboxMode:false, auditHashSecret:"test-email-audit-secret", auditLogs:[] });
    const userA = user({ userId:"email_idempotency_a", primaryChannel:"email", fallbackChannel:undefined, subscription:await activeSubscription("email_idempotency_a") });
    const userB = user({ userId:"email_idempotency_b", primaryChannel:"email", fallbackChannel:undefined, subscription:await activeSubscription("email_idempotency_b") });
    runNotificationSchedulerJob({ sessionId, users:[userA, userB], topics:["daily_horoscope"], now });
    runNotificationSchedulerJob({ sessionId, users:[userA], topics:["daily_horoscope"], now:new Date("2026-05-04T00:30:00.000Z") });

    await dispatchQueuedNotifications({ sessionId, users:[userA, userB], emailGateway, now });

    const keys = requests.map((request)=>request.idempotencyKey);
    assert.equal(new Set(keys).size, 3);
    assert.ok(keys.every((key)=>typeof key === "string" && key.startsWith("notification_email_")));
    assert.equal(provider.networkSendCount, 0);
  });

  it("includes an email idempotency key on fallback email delivery", async () => {
    approveHoroscopes("fallback_email_idempotency_user", ["daily_horoscope"]);
    const dispatchUser = user({ userId:"fallback_email_idempotency_user", subscription:await activeSubscription("fallback_email_idempotency_user") });
    dispatchUser.lineAccount!.blocked = true;
    const provider = new SandboxEmailProvider();
    const emailGateway = new EmailGateway({ provider, fromEmail:"noreply@example.test", sandboxMode:false, auditHashSecret:"test-email-audit-secret", auditLogs:[] });
    const lineGateway = gateways().lineGateway;
    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now });

    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[dispatchUser], lineGateway, emailGateway, now });

    assert.equal(dispatch.fallbackSent, 1);
    assert.equal(provider.sent.length, 1);
    assert.ok(provider.sent[0]?.idempotencyKey);
    assert.equal(provider.sent[0]?.headers["x-idempotency-key"], provider.sent[0]?.idempotencyKey);
    assert.equal(provider.networkSendCount, 0);
  });

  it("does not fallback after an ambiguous primary provider failure and keeps the message retryable", async () => {
    approveHoroscopes("provider_failure_retry_user", ["daily_horoscope"]);
    const dispatchUser = user({ userId:"provider_failure_retry_user", subscription:await activeSubscription("provider_failure_retry_user") });
    let lineCalls = 0;
    const failingLineGateway = { send:async () => { lineCalls += 1; return { status:"failed" as const, errorCode:"line_provider_failed" }; } } as unknown as LineGateway;
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now });

    const failed = await dispatchQueuedNotifications({ sessionId, users:[dispatchUser], lineGateway:failingLineGateway, emailGateway:g.emailGateway, now });
    const retried = await dispatchQueuedNotifications({ sessionId, users:[dispatchUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(lineCalls, 1);
    assert.equal(failed.fallbackSent, 0);
    assert.equal(g.emailAuditLogs.length, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.status, "failed");
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.errorCode, "line_provider_failed");
    assert.equal(retried.sent, 1);
    assert.equal(getNotificationSchedulerState().outboundMessages[0]?.status, "sent");
  });

  it("does not use fallback after a provider exception on the primary channel", async () => {
    approveHoroscopes("provider_exception_user", ["daily_horoscope"]);
    const dispatchUser = user({ userId:"provider_exception_user", subscription:await activeSubscription("provider_exception_user") });
    const throwingLineGateway = { send:async () => { throw new Error("timeout"); } } as unknown as LineGateway;
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now });

    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[dispatchUser], lineGateway:throwingLineGateway, emailGateway:g.emailGateway, now });

    assert.equal(dispatch.fallbackSent, 0);
    assert.equal(g.emailAuditLogs.length, 0);
    assert.equal(getNotificationSchedulerState().outboundMessages[0]?.status, "queued");
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.errorCode, "provider_exception");
  });

  it("does not retry terminal suppressed messages", async () => {
    approveHoroscopes("terminal_suppressed_user", ["daily_horoscope"]);
    const blockedUser = user({ userId:"terminal_suppressed_user", fallbackChannel:undefined, subscription:await activeSubscription("terminal_suppressed_user") });
    blockedUser.lineAccount!.blocked = true;
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[blockedUser], topics:["daily_horoscope"], now });

    await dispatchQueuedNotifications({ sessionId, users:[blockedUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });
    blockedUser.lineAccount!.blocked = false;
    await dispatchQueuedNotifications({ sessionId, users:[blockedUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(getNotificationSchedulerState().outboundMessages[0]?.status, "suppressed");
    assert.equal(getNotificationSchedulerState().deliveryAttempts.length, 1);
    assert.equal(g.lineAuditLogs.length, 1);
  });


  it("does not fallback to email when the primary LINE gateway is missing", async () => {
    approveHoroscopes("missing_line_gateway_user", ["daily_horoscope"]);
    const dispatchUser = user({ userId:"missing_line_gateway_user", subscription:await activeSubscription("missing_line_gateway_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now });

    const missingGateway = await dispatchQueuedNotifications({ sessionId, users:[dispatchUser], emailGateway:g.emailGateway, now });
    const retried = await dispatchQueuedNotifications({ sessionId, users:[dispatchUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(missingGateway.fallbackSent, 0);
    assert.equal(g.emailAuditLogs.length, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.status, "failed");
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.errorCode, "line_gateway_unavailable");
    assert.equal(getNotificationSchedulerState().outboundMessages[0]?.status, "sent");
    assert.equal(retried.sent, 1);
  });

  it("does not fallback to LINE when the primary email gateway is missing", async () => {
    approveHoroscopes("missing_email_gateway_user", ["daily_horoscope"]);
    const dispatchUser = user({ userId:"missing_email_gateway_user", primaryChannel:"email", fallbackChannel:"line", preferences:[{ topicCode:"all", channel:"email", enabled:true, allowFallback:true }, { topicCode:"all", channel:"line", enabled:true, allowFallback:true }], subscription:await activeSubscription("missing_email_gateway_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now });

    const missingGateway = await dispatchQueuedNotifications({ sessionId, users:[dispatchUser], lineGateway:g.lineGateway, now });
    const retried = await dispatchQueuedNotifications({ sessionId, users:[dispatchUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(missingGateway.fallbackSent, 0);
    assert.equal(g.lineAuditLogs.length, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.status, "failed");
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.errorCode, "email_gateway_unavailable");
    assert.equal(getNotificationSchedulerState().outboundMessages[0]?.status, "sent");
    assert.equal(retried.sent, 1);
  });

  it("does not fallback to email when primary LINE account data is missing from the dispatch snapshot", async () => {
    approveHoroscopes("missing_line_account_user", ["daily_horoscope"]);
    const queuedUser = user({ userId:"missing_line_account_user", subscription:await activeSubscription("missing_line_account_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[queuedUser], topics:["daily_horoscope"], now });

    const missingAccountUser = user({ ...queuedUser, lineAccount:undefined });
    const missingAccount = await dispatchQueuedNotifications({ sessionId, users:[missingAccountUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });
    const retried = await dispatchQueuedNotifications({ sessionId, users:[queuedUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(missingAccount.fallbackSent, 0);
    assert.equal(missingAccount.sent, 0);
    assert.equal(g.emailAuditLogs.length, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.status, "failed");
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.errorCode, "line_account_unavailable");
    assert.equal(retried.sent, 1);
    assert.equal(getNotificationSchedulerState().outboundMessages[0]?.status, "sent");
  });

  it("does not fallback to LINE when primary email account data is missing from the dispatch snapshot", async () => {
    approveHoroscopes("missing_email_account_user", ["daily_horoscope"]);
    const queuedUser = user({ userId:"missing_email_account_user", primaryChannel:"email", fallbackChannel:"line", preferences:[{ topicCode:"all", channel:"email", enabled:true, allowFallback:true }, { topicCode:"all", channel:"line", enabled:true, allowFallback:true }], subscription:await activeSubscription("missing_email_account_user") });
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[queuedUser], topics:["daily_horoscope"], now });

    const missingAccountUser = user({ ...queuedUser, emailAccount:undefined });
    const missingAccount = await dispatchQueuedNotifications({ sessionId, users:[missingAccountUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });
    const retried = await dispatchQueuedNotifications({ sessionId, users:[queuedUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(missingAccount.fallbackSent, 0);
    assert.equal(missingAccount.sent, 0);
    assert.equal(g.lineAuditLogs.length, 0);
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.status, "failed");
    assert.equal(getNotificationSchedulerState().deliveryAttempts[0]?.errorCode, "email_account_unavailable");
    assert.equal(retried.sent, 1);
    assert.equal(getNotificationSchedulerState().outboundMessages[0]?.status, "sent");
  });

  it("still falls back from explicitly inactive LINE primary when current preferences allow", async () => {
    approveHoroscopes("inactive_line_fallback_user", ["daily_horoscope"]);
    const dispatchUser = user({ userId:"inactive_line_fallback_user", subscription:await activeSubscription("inactive_line_fallback_user") });
    dispatchUser.lineAccount!.active = false;
    const g = gateways();
    runNotificationSchedulerJob({ sessionId, users:[dispatchUser], topics:["daily_horoscope"], now });

    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[dispatchUser], lineGateway:g.lineGateway, emailGateway:g.emailGateway, now });

    assert.equal(dispatch.fallbackSent, 1);
    assert.deepEqual(getNotificationSchedulerState().deliveryAttempts.map((attempt)=>[attempt.channel, attempt.status, attempt.errorCode]), [["line", "suppressed", "line_account_inactive"], ["email", "sent", undefined]]);
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
