import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { EmailGateway, SandboxEmailProvider, createEmailChannelAccount, type EmailProviderRequest } from "../src/mvp/email-gateway";
import { assertSafeHoroscopeDeliveryContent, horoscopeContentToEmailMessage } from "../src/mvp/horoscope-delivery-integration";
import { type LineMessage } from "../src/mvp/line-gateway";
import { approveDraft, callMockAstroCalc, deleteBirthProfile, generateHoroscopeResult, requestAccountDeletion, resetMockMvpState, saveBirthProfile, setMockUserPlan, storeChartSnapshot, type BirthProfileInput, type PeriodType } from "../src/mvp/mock-flow";
import { dispatchQueuedNotifications, getNotificationPeriodKey, getNotificationSchedulerState, resetNotificationSchedulerState, runNotificationSchedulerJob, type NotificationSchedulerUser, type NotificationTopic } from "../src/mvp/notification-scheduler";
import { processMockSubscriptionWebhook, resetMockSubscriptionState, type MockSubscriptionWebhookEvent, type SubscriptionRecord } from "../src/mvp/subscription-lifecycle";

const sessionId = "horoscope_delivery_integration_test";
const now = new Date("2026-05-03T00:30:00.000Z");
const periodStart = "2026-05-01T00:00:00.000Z";
const periodEnd = "2026-06-01T00:00:00.000Z";
const rawEmail = "delivery@example.test";
const rawLineUserId = "Udeliveryintegration00000000";
const birthDate = "1992-08-15";
const birthTime = "07:30";
const birthPlaceText = "Bangkok";

describe("horoscope delivery integration", () => {
  beforeEach(() => {
    resetMockMvpState();
    resetMockSubscriptionState();
    resetNotificationSchedulerState();
  });

  it("queues daily horoscope content and converts it to a safe email payload", async () => {
    approveHoroscopes("email_delivery_user", ["daily_horoscope"]);
    const provider = new SandboxEmailProvider();
    const requests:EmailProviderRequest[] = [];
    provider.send = async (request:EmailProviderRequest) => { requests.push(structuredClone(request)); return { providerMessageId:"email_delivery_1" }; };
    const emailGateway = new EmailGateway({ provider, fromEmail:"noreply@example.test", sandboxMode:false, auditHashSecret:"test-email-audit-secret", auditLogs:[] });
    const deliveryUser = user({ userId:"email_delivery_user", primaryChannel:"email", fallbackChannel:undefined, subscription:await activeSubscription("email_delivery_user") });

    const queued = runNotificationSchedulerJob({ sessionId, users:[deliveryUser], topics:["daily_horoscope"], now });
    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[deliveryUser], emailGateway, now });

    assert.equal(queued.queued.length, 1);
    assert.equal(dispatch.sent, 1);
    assert.ok(queued.queued[0]?.horoscopeContent);
    assertRequiredContentShape(queued.queued[0]!.horoscopeContent!);
    assert.equal(requests.length, 1);
    assert.match(requests[0]!.text, /ภาพรวม|งาน|การเงิน|ความสัมพันธ์|สุขภาวะ|คำแนะนำ|ข้อควรระวัง/u);
    assert.match(requests[0]!.html, /<h1>ดวงวันนี้ของคุณ<\/h1>/u);
    assertNoRawPrivateData(JSON.stringify({ text:requests[0]!.text, html:requests[0]!.html, metadata:requests[0]!.metadata }));
    assert.equal(requests[0]!.metadata?.topicCode, "daily_horoscope");
    assert.equal(requests[0]!.metadata?.periodKey, "2026-05-03");
    assert.ok(requests[0]!.metadata?.contentProfileCode);
    assert.ok(requests[0]!.metadata?.calculationHash);
    assert.ok(requests[0]!.metadata?.ruleHitIds);
    assert.equal(provider.networkSendCount, 0);
  });

  it("queues weekly monthly and yearly delivery content according to premium entitlement", async () => {
    const topics:NotificationTopic[] = ["weekly_horoscope", "monthly_horoscope", "yearly_horoscope"];
    approveHoroscopes("premium_period_user", topics);
    const premiumUser = user({ userId:"premium_period_user", subscription:await activeSubscription("premium_period_user", "premium") });

    const queued = runNotificationSchedulerJob({ sessionId, users:[premiumUser], topics, now });

    assert.equal(queued.queued.length, 3);
    assert.deepEqual(queued.queued.map((message)=>message.periodType).sort(), ["monthly", "weekly", "yearly"]);
    assert.equal(queued.queued.every((message)=>message.horoscopeContent?.rule_hits.length), true);
    assert.equal(queued.queued.every((message)=>message.deliveryMetadata?.contentProfileCode), true);
  });

  it("does not queue monthly or yearly delivery content without entitlement", () => {
    approveHoroscopes("free_period_user", ["monthly_horoscope", "yearly_horoscope"]);
    const freeUser = user({ userId:"free_period_user", planCode:"free" });

    const queued = runNotificationSchedulerJob({ sessionId, users:[freeUser], topics:["monthly_horoscope", "yearly_horoscope"], now });

    assert.equal(queued.queued.length, 0);
    assert.equal(queued.skipped, 2);
    assert.equal(getNotificationSchedulerState().outboundMessages.length, 0);
  });

  it("converts queued horoscope content to a safe LINE Flex-style preview payload", async () => {
    approveHoroscopes("line_delivery_user", ["daily_horoscope"]);
    const sentMessages:LineMessage[] = [];
    const lineGateway = { send:async (_account:unknown, message:LineMessage) => { sentMessages.push(structuredClone(message)); return { status:"sent" as const, providerMessageId:"line_delivery_1" }; } };
    const deliveryUser = user({ userId:"line_delivery_user", subscription:await activeSubscription("line_delivery_user") });

    runNotificationSchedulerJob({ sessionId, users:[deliveryUser], topics:["daily_horoscope"], now });
    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[deliveryUser], lineGateway:lineGateway as never, now });

    assert.equal(dispatch.sent, 1);
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0]!.title, "ดวงวันนี้ของคุณ");
    assert.match(sentMessages[0]!.body, /เพื่อความบันเทิงและการทบทวนตนเอง/u);
    assert.equal(sentMessages[0]!.metadata?.topicCode, "daily_horoscope");
    assert.ok(sentMessages[0]!.metadata?.contentProfileCode);
    assertNoRawPrivateData(JSON.stringify(sentMessages[0]));
  });

  it("softens unknown birth time delivery content and avoids house-specific claims", async () => {
    approveHoroscopes("unknown_time_user", ["daily_horoscope"], { birthTimeUnknown:true, birthTime:undefined });
    const deliveryUser = user({ userId:"unknown_time_user", primaryChannel:"email", fallbackChannel:undefined, subscription:await activeSubscription("unknown_time_user") });

    const queued = runNotificationSchedulerJob({ sessionId, users:[deliveryUser], topics:["daily_horoscope"], now });
    const content = queued.queued[0]!.horoscopeContent!;

    assert.ok(content.warnings.some((warning)=>warning.code === "CONTENT_CONFIDENCE_LOWERED_UNKNOWN_BIRTH_TIME"));
    assert.equal(content.rule_hits.some((hit)=>hit.trigger.includes("house_")), false);
    assert.match([content.overview, content.advice, content.caution].join("\n"), /แนวโน้มกว้าง|เวลาเกิดไม่ชัดเจน/u);
  });

  it("blocks unsafe content before building delivery payloads", () => {
    const queuedContent = queueSingleContent("unsafe_content_user");
    const unsafeContent = { ...queuedContent, overview:"วันนี้ต้องซื้อหุ้นตัวนี้แล้วรวยแน่นอน" };

    assert.throws(() => assertSafeHoroscopeDeliveryContent(unsafeContent), /Unsafe horoscope delivery content/);
    assert.throws(() => horoscopeContentToEmailMessage({ topicCode:"daily_horoscope", content:unsafeContent, idempotencyKey:"test_key" }), /Unsafe horoscope delivery content/);
  });

  it("does not deliver after birth profile deletion account deletion unsubscribe or duplicate dispatch", async () => {
    const birthProfileId = approveHoroscopes("suppressed_delivery_user", ["daily_horoscope"]);
    const deliveryUser = user({ userId:"suppressed_delivery_user", subscription:await activeSubscription("suppressed_delivery_user") });
    const lineGateway = { send:async () => ({ status:"sent" as const, providerMessageId:"line_should_not_send" }) };
    runNotificationSchedulerJob({ sessionId, users:[deliveryUser], topics:["daily_horoscope"], now });

    deleteBirthProfile({ sessionId, userId:"suppressed_delivery_user" }, birthProfileId, new Date("2026-05-02T00:00:00.000Z"));
    const deletedDispatch = await dispatchQueuedNotifications({ sessionId, users:[deliveryUser], lineGateway:lineGateway as never, now });

    assert.equal(deletedDispatch.sent, 0);
    assert.equal(deletedDispatch.suppressed, 1);

    resetNotificationSchedulerState();
    approveHoroscopes("account_deleted_delivery_user", ["daily_horoscope"]);
    requestAccountDeletion({ sessionId, userId:"account_deleted_delivery_user" }, new Date("2026-05-02T00:00:00.000Z"));
    const deletedUserResult = runNotificationSchedulerJob({ sessionId, users:[user({ userId:"account_deleted_delivery_user", subscription:await activeSubscription("account_deleted_delivery_user") })], topics:["daily_horoscope"], now });
    assert.equal(deletedUserResult.queued.length, 0);

    approveHoroscopes("unsubscribed_delivery_user", ["daily_horoscope"]);
    const unsubscribed = user({ userId:"unsubscribed_delivery_user", primaryChannel:"email", emailAccount:{ ...createEmailChannelAccount({ userId:"unsubscribed_delivery_user", email:"unsubscribed@example.test", now }), verified:true, unsubscribed:true }, subscription:await activeSubscription("unsubscribed_delivery_user") });
    const unsubscribedResult = runNotificationSchedulerJob({ sessionId, users:[unsubscribed], topics:["daily_horoscope"], now });
    assert.equal(unsubscribedResult.queued.length, 0);
  });

  it("does not duplicate integrated delivery on repeated scheduler and dispatch runs", async () => {
    approveHoroscopes("duplicate_delivery_user", ["daily_horoscope"]);
    const deliveryUser = user({ userId:"duplicate_delivery_user", subscription:await activeSubscription("duplicate_delivery_user") });
    let sendCalls = 0;
    const lineGateway = { send:async () => { sendCalls += 1; return { status:"sent" as const, providerMessageId:`line_${sendCalls}` }; } };

    const firstQueue = runNotificationSchedulerJob({ sessionId, users:[deliveryUser], topics:["daily_horoscope"], now });
    const secondQueue = runNotificationSchedulerJob({ sessionId, users:[deliveryUser], topics:["daily_horoscope"], now });
    await dispatchQueuedNotifications({ sessionId, users:[deliveryUser], lineGateway:lineGateway as never, now });
    await dispatchQueuedNotifications({ sessionId, users:[deliveryUser], lineGateway:lineGateway as never, now });

    assert.equal(firstQueue.queued.length, 1);
    assert.equal(secondQueue.duplicates, 1);
    assert.equal(getNotificationSchedulerState().outboundMessages.length, 1);
    assert.equal(sendCalls, 1);
  });

  it("does not call LLMs or network APIs while generating and dispatching with mock gateways", async () => {
    approveHoroscopes("network_guard_delivery_user", ["daily_horoscope"]);
    const deliveryUser = user({ userId:"network_guard_delivery_user", subscription:await activeSubscription("network_guard_delivery_user") });
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (() => {
      fetchCalls += 1;
      throw new Error("network calls are forbidden in delivery integration tests");
    }) as typeof fetch;

    try {
      runNotificationSchedulerJob({ sessionId, users:[deliveryUser], topics:["daily_horoscope"], now });
      await dispatchQueuedNotifications({ sessionId, users:[deliveryUser], lineGateway:{ send:async () => ({ status:"sent" as const }) } as never, now });
      assert.equal(fetchCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

async function activeSubscription(userId:string, planCode:"free"|"basic"|"premium" = "premium"):Promise<SubscriptionRecord> {
  const event:MockSubscriptionWebhookEvent = { id:`evt_delivery_sub_${userId}`, type:"subscription.created", subscriptionId:`sub_${userId}`, userId, planCode, status:"active", currentPeriodStart:periodStart, currentPeriodEnd:periodEnd, occurredAt:"2026-05-01T00:00:00.000Z" };
  const result = await processMockSubscriptionWebhook(event);
  assert.equal(result.status, "applied");
  assert.ok(result.subscription);
  return result.subscription;
}

function approveHoroscopes(userId:string, selectedTopics:NotificationTopic[], profileOverrides:Partial<BirthProfileInput> = {}):string {
  const context = { sessionId, userId };
  setMockUserPlan(userId, "premium", sessionId);
  const profile = saveBirthProfile({
    birthDate,
    birthTime,
    birthTimeUnknown:false,
    birthPlaceText,
    timezone:"Asia/Bangkok",
    consentBirthData:true,
    ...profileOverrides,
  }, context, new Date("2026-05-01T00:00:00.000Z"));
  const chart = storeChartSnapshot(callMockAstroCalc(profile), sessionId, new Date("2026-05-01T00:01:00.000Z"));
  for (const topic of selectedTopics) {
    const periodType = topic.replace("_horoscope", "") as PeriodType;
    const result = generateHoroscopeResult({ chartSnapshot:chart, periodType, periodKey:getNotificationPeriodKey(topic, now, "Asia/Bangkok"), sessionId, now:new Date("2026-05-01T00:02:00.000Z") });
    approveDraft(result.id, "delivery_admin", sessionId, new Date("2026-05-01T00:03:00.000Z"));
  }
  return profile.id;
}

function queueSingleContent(userId:string) {
  approveHoroscopes(userId, ["daily_horoscope"]);
  const deliveryUser = user({ userId, planCode:"free" });
  const queued = runNotificationSchedulerJob({ sessionId, users:[deliveryUser], topics:["daily_horoscope"], now });
  return queued.queued[0]!.horoscopeContent!;
}

function user(input:Partial<NotificationSchedulerUser> & Pick<NotificationSchedulerUser, "userId">):NotificationSchedulerUser {
  const emailAccount = { ...createEmailChannelAccount({ userId:input.userId, email:rawEmail, now }), verified:true };
  return {
    timezone:"Asia/Bangkok",
    preferredNotificationTime:"07:30",
    primaryChannel:"line",
    fallbackChannel:"email",
    preferences:[
      { topicCode:"all", channel:"line", enabled:true, allowFallback:true },
      { topicCode:"all", channel:"email", enabled:true, allowFallback:true },
    ],
    emailAccount,
    lineAccount:{ userId:input.userId, lineUserId:rawLineUserId, active:true, blocked:false, followed:true, updatedAt:now.toISOString() },
    ...input,
  };
}

function assertRequiredContentShape(content:NonNullable<ReturnType<typeof getNotificationSchedulerState>["outboundMessages"][number]["horoscopeContent"]>):void {
  assert.ok(content.overview);
  assert.ok(content.work);
  assert.ok(content.money);
  assert.ok(content.relationship);
  assert.ok(content.wellness);
  assert.ok(content.advice);
  assert.ok(content.caution);
  assert.ok(content.rule_hits.length > 0);
  assert.ok(Array.isArray(content.safety_flags));
  assert.ok(content.content_profile_code);
  assert.ok(content.calculation_hash);
  assert.ok(content.source_chart_snapshot_id);
}

function assertNoRawPrivateData(serialized:string):void {
  assert.equal(serialized.includes(rawEmail), false);
  assert.equal(serialized.includes(rawLineUserId), false);
  assert.equal(serialized.includes(birthDate), false);
  assert.equal(serialized.includes(birthTime), false);
  assert.equal(serialized.includes(birthPlaceText), false);
  assert.equal(serialized.toLowerCase().includes("secret"), false);
  assert.equal(serialized.toLowerCase().includes("token"), false);
}
