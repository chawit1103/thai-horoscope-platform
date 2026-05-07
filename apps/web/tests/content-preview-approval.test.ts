import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createAdminSessionCookie, approveContentBatchWithAdminCookie, rejectContentBatchWithAdminCookie } from "../src/mvp/admin-auth";
import { CONTENT_PREVIEW_APPROVAL_SESSION_ID, ensureContentPreviewBatch, getContentPreviewApprovalState, getContentPreviewBatch, resetContentPreviewApprovalState } from "../src/mvp/content-preview-approval";
import { EmailGateway, SandboxEmailProvider, createEmailChannelAccount, type EmailAuditLogEntry } from "../src/mvp/email-gateway";
import { generateHoroscopeDeliveryPayload } from "../src/mvp/horoscope-delivery-integration";
import { LineGateway, SandboxLineProvider, createLineChannelAccount, type LineAuditLogEntry } from "../src/mvp/line-gateway";
import { approveDraft, callMockAstroCalc, deleteBirthProfile, generateHoroscopeResult, getMockMvpState, resetMockMvpState, saveBirthProfile, setMockUserPlan, storeChartSnapshot, type PeriodType } from "../src/mvp/mock-flow";
import { dispatchQueuedNotifications, getNotificationPeriodKey, getNotificationSchedulerState, resetNotificationSchedulerState, runNotificationSchedulerJob, type NotificationSchedulerUser, type NotificationTopic } from "../src/mvp/notification-scheduler";
import { processMockSubscriptionWebhook, resetMockSubscriptionState, type MockSubscriptionWebhookEvent, type SubscriptionRecord } from "../src/mvp/subscription-lifecycle";

const sessionId = "content_preview_test";
const approvalSessionId = CONTENT_PREVIEW_APPROVAL_SESSION_ID;
const adminSecret = "test-admin-session-secret";
const adminCookie = createAdminSessionCookie({ actorId:"admin_preview_test", role:"admin", sessionSecret:adminSecret, ttlMs:30 * 24 * 60 * 60 * 1000 });
const now = new Date("2026-05-03T00:30:00.000Z");

async function activeSubscription(userId:string, planCode:"free"|"basic"|"premium" = "premium"):Promise<SubscriptionRecord> {
  const event:MockSubscriptionWebhookEvent = {
    id:`evt_preview_sub_${userId}`,
    type:"subscription.created",
    subscriptionId:`sub_preview_${userId}`,
    userId,
    planCode,
    status:"active",
    currentPeriodStart:"2026-05-01T00:00:00.000Z",
    currentPeriodEnd:"2026-06-01T00:00:00.000Z",
    occurredAt:"2026-05-01T00:00:00.000Z",
  };
  const result = await processMockSubscriptionWebhook(event);
  assert.match(result.status, /^(applied|duplicate)$/);
  assert.ok(result.subscription);
  return result.subscription;
}

function approveHoroscopeArtifact(input:{ userId:string; topicCode?:NotificationTopic; birthTimeUnknown?:boolean }):string {
  const topicCode = input.topicCode ?? "daily_horoscope";
  const periodType = topicCode.replace("_horoscope", "") as PeriodType;
  const context = { sessionId, userId:input.userId };
  setMockUserPlan(input.userId, "premium", sessionId);
  const profile = saveBirthProfile({
    birthDate:"1992-08-15",
    birthTime:input.birthTimeUnknown ? "" : "07:30",
    birthTimeUnknown:input.birthTimeUnknown ?? false,
    birthPlaceText:"Bangkok",
    timezone:"Asia/Bangkok",
    consentBirthData:true,
  }, context, new Date("2026-05-01T00:00:00.000Z"));
  const chart = storeChartSnapshot(callMockAstroCalc(profile), sessionId, new Date("2026-05-01T00:01:00.000Z"));
  const result = generateHoroscopeResult({
    chartSnapshot:chart,
    periodType,
    periodKey:getNotificationPeriodKey(topicCode, now, "Asia/Bangkok"),
    sessionId,
    now:new Date("2026-05-01T00:02:00.000Z"),
  });
  approveDraft(result.id, "content_preview_setup", sessionId, new Date("2026-05-01T00:03:00.000Z"));
  return profile.id;
}

function user(input:Partial<NotificationSchedulerUser> & Pick<NotificationSchedulerUser, "userId">):NotificationSchedulerUser {
  return {
    timezone:"Asia/Bangkok",
    preferredNotificationTime:"07:30",
    primaryChannel:"line",
    fallbackChannel:"email",
    preferences:[
      { topicCode:"all", channel:"line", enabled:true, allowFallback:true },
      { topicCode:"all", channel:"email", enabled:true },
    ],
    emailAccount:{ ...createEmailChannelAccount({ userId:input.userId, email:`${input.userId}@example.test`, now }), verified:true },
    lineAccount:createLineChannelAccount({ userId:input.userId, lineUserId:`U${input.userId.replace(/[^a-zA-Z0-9]/g, "")}0000000000`, now }),
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
    emailGateway:new EmailGateway({ provider:emailProvider, fromEmail:"noreply@example.test", sandboxMode:true, auditHashSecret:"test-email-audit-secret", auditLogs:emailAuditLogs }),
    lineGateway:new LineGateway({ provider:lineProvider, sandboxMode:true, auditHashSecret:"test-line-audit-secret", auditLogs:lineAuditLogs }),
  };
}

async function createPendingPreviewBatch(userId:string, topicCode:NotificationTopic = "daily_horoscope"):Promise<string> {
  approveHoroscopeArtifact({ userId, topicCode });
  const schedulerUser = user({ userId, subscription:await activeSubscription(userId) });
  const beforeCount = getContentPreviewApprovalState(approvalSessionId).batches.length;
  const result = runNotificationSchedulerJob({ sessionId, users:[schedulerUser], topics:[topicCode], now, betaApprovalMode:true });
  assert.equal(result.queued.length, 1);
  assert.equal(result.deferred, 1);
  const batch = getContentPreviewApprovalState(approvalSessionId).batches[beforeCount];
  assert.ok(batch);
  return batch.batchId;
}

describe("beta content preview approval", () => {
  beforeEach(() => {
    resetMockMvpState();
    resetMockSubscriptionState();
    resetNotificationSchedulerState();
    resetContentPreviewApprovalState();
  });

  it("requires admin auth for approval actions", async () => {
    const batchId = await createPendingPreviewBatch("preview_auth_user");

    assert.throws(() => approveContentBatchWithAdminCookie({ sessionId:approvalSessionId, batchId, sessionCookie:undefined, sessionSecret:adminSecret }), /Unauthorized/);
    assert.equal(getContentPreviewBatch(approvalSessionId, batchId)?.approvalStatus, "pending_review");
  });

  it("allows an admin to approve and reject content batches", async () => {
    const approvedBatchId = await createPendingPreviewBatch("preview_approve_user");
    approveContentBatchWithAdminCookie({ sessionId:approvalSessionId, batchId:approvedBatchId, sessionCookie:adminCookie, sessionSecret:adminSecret });
    assert.equal(getContentPreviewBatch(approvalSessionId, approvedBatchId)?.approvalStatus, "approved");

    resetNotificationSchedulerState();
    const rejectedBatchId = await createPendingPreviewBatch("preview_reject_user");
    rejectContentBatchWithAdminCookie({ sessionId:approvalSessionId, batchId:rejectedBatchId, sessionCookie:adminCookie, sessionSecret:adminSecret });
    assert.equal(getContentPreviewBatch(approvalSessionId, rejectedBatchId)?.approvalStatus, "rejected");
  });

  it("keeps duplicate approval and rejection calls idempotent", async () => {
    const approvedBatchId = await createPendingPreviewBatch("preview_duplicate_approve_user");
    approveContentBatchWithAdminCookie({ sessionId:approvalSessionId, batchId:approvedBatchId, sessionCookie:adminCookie, sessionSecret:adminSecret });
    approveContentBatchWithAdminCookie({ sessionId:approvalSessionId, batchId:approvedBatchId, sessionCookie:adminCookie, sessionSecret:adminSecret });
    assert.equal(getContentPreviewApprovalState(approvalSessionId).auditLogs.filter((log)=>log.action==="admin_content_batch_approved").length, 1);

    resetNotificationSchedulerState();
    const rejectedBatchId = await createPendingPreviewBatch("preview_duplicate_reject_user");
    rejectContentBatchWithAdminCookie({ sessionId:approvalSessionId, batchId:rejectedBatchId, sessionCookie:adminCookie, sessionSecret:adminSecret });
    rejectContentBatchWithAdminCookie({ sessionId:approvalSessionId, batchId:rejectedBatchId, sessionCookie:adminCookie, sessionSecret:adminSecret });
    assert.equal(getContentPreviewApprovalState(approvalSessionId).auditLogs.filter((log)=>log.action==="admin_content_batch_rejected").length, 1);
  });

  it("does not allow approval after rejection without regeneration", async () => {
    const batchId = await createPendingPreviewBatch("preview_reject_then_approve_user");
    rejectContentBatchWithAdminCookie({ sessionId:approvalSessionId, batchId, sessionCookie:adminCookie, sessionSecret:adminSecret });

    assert.throws(() => approveContentBatchWithAdminCookie({ sessionId:approvalSessionId, batchId, sessionCookie:adminCookie, sessionSecret:adminSecret }), /regeneration/);
  });

  it("resets approval when regenerated preview content changes", async () => {
    const userId = "preview_content_change_user";
    const batchId = await createPendingPreviewBatch(userId);
    approveContentBatchWithAdminCookie({ sessionId:approvalSessionId, batchId, sessionCookie:adminCookie, sessionSecret:adminSecret });
    const mockState = getMockMvpState(sessionId);
    const result = mockState.horoscopeResults.find((item)=>item.userId===userId&&item.periodType==="daily");
    assert.ok(result);
    const chart = mockState.chartSnapshots.find((item)=>item.id===result.chartSnapshotId);
    assert.ok(chart);
    const payload = generateHoroscopeDeliveryPayload({ topicCode:"daily_horoscope", periodType:"daily", periodKey:result.periodKey, chartSnapshot:chart });
    const changedPayload = {
      ...payload,
      content:{ ...payload.content, overview:`${payload.content.overview} updated`, content_hash:"b".repeat(64) },
    };

    const refreshed = ensureContentPreviewBatch({ sessionId:approvalSessionId, horoscopeResult:result, topicCode:"daily_horoscope", deliveryPayload:changedPayload, deliveryChannels:["line"], now });

    assert.equal(refreshed.approvalStatus, "pending_review");
    assert.equal(refreshed.approvedAt, undefined);
  });

  it("holds unapproved and rejected beta content without dispatching", async () => {
    const pendingUser = user({ userId:"preview_pending_user", subscription:await activeSubscription("preview_pending_user") });
    approveHoroscopeArtifact({ userId:pendingUser.userId });
    const pending = runNotificationSchedulerJob({ sessionId, users:[pendingUser], topics:["daily_horoscope"], now, betaApprovalMode:true });
    assert.equal(pending.queued.length, 1);
    assert.equal(pending.deferred, 1);
    assert.equal(getNotificationSchedulerState().outboundMessages.length, 1);

    const rejectedBatchId = getContentPreviewApprovalState(approvalSessionId).batches[0]!.batchId;
    rejectContentBatchWithAdminCookie({ sessionId:approvalSessionId, batchId:rejectedBatchId, sessionCookie:adminCookie, sessionSecret:adminSecret });
    const g = gateways();
    const rejected = await dispatchQueuedNotifications({ sessionId, users:[pendingUser], emailGateway:g.emailGateway, lineGateway:g.lineGateway, now, betaApprovalMode:true });
    assert.equal(rejected.sent, 0);
    assert.equal(rejected.suppressed, 0);
    assert.equal(rejected.attempts.at(-1)?.status, "deferred");
    assert.equal(getNotificationSchedulerState().deliveryAttempts.at(-1)?.errorCode, "content_rejected");
    assert.equal(getNotificationSchedulerState().outboundMessages[0]?.status, "queued");
  });

  it("dispatches approved content through mock gateways only", async () => {
    const userId = "preview_dispatch_user";
    const batchId = await createPendingPreviewBatch(userId);
    const schedulerUser = user({ userId, subscription:await activeSubscription(userId) });
    approveContentBatchWithAdminCookie({ sessionId:approvalSessionId, batchId, sessionCookie:adminCookie, sessionSecret:adminSecret });

    const g = gateways();
    const dispatched = await dispatchQueuedNotifications({ sessionId, users:[schedulerUser], emailGateway:g.emailGateway, lineGateway:g.lineGateway, now, betaApprovalMode:true });

    assert.equal(dispatched.sent, 1);
    assert.equal(g.emailProvider.networkSendCount, 0);
    assert.equal(g.lineProvider.networkSendCount, 0);
    assert.equal(g.emailProvider.sent.length, 0);
    assert.equal(g.lineProvider.sent.length, 0);
  });

  it("does not dispatch queued content if approval is missing or rejected", async () => {
    const userId = "preview_dispatch_missing_approval_user";
    const batchId = await createPendingPreviewBatch(userId);
    const schedulerUser = user({ userId, subscription:await activeSubscription(userId) });
    approveContentBatchWithAdminCookie({ sessionId:approvalSessionId, batchId, sessionCookie:adminCookie, sessionSecret:adminSecret });
    runNotificationSchedulerJob({ sessionId, users:[schedulerUser], topics:["daily_horoscope"], now, betaApprovalMode:true });
    resetContentPreviewApprovalState();

    const g = gateways();
    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[schedulerUser], emailGateway:g.emailGateway, lineGateway:g.lineGateway, now, betaApprovalMode:true });

    assert.equal(dispatch.sent, 0);
    assert.equal(dispatch.suppressed, 0);
    assert.equal(dispatch.attempts.at(-1)?.status, "deferred");
    assert.equal(getNotificationSchedulerState().deliveryAttempts.at(-1)?.errorCode, "content_approval_missing");
    assert.equal(getNotificationSchedulerState().outboundMessages[0]?.status, "queued");

    runNotificationSchedulerJob({ sessionId, users:[schedulerUser], topics:["daily_horoscope"], now, betaApprovalMode:true });
    const regeneratedBatchId = getContentPreviewApprovalState(approvalSessionId).batches[0]?.batchId;
    assert.ok(regeneratedBatchId);
    approveContentBatchWithAdminCookie({ sessionId:approvalSessionId, batchId:regeneratedBatchId, sessionCookie:adminCookie, sessionSecret:adminSecret });

    const approvedDispatch = await dispatchQueuedNotifications({ sessionId, users:[schedulerUser], emailGateway:g.emailGateway, lineGateway:g.lineGateway, now, betaApprovalMode:true });
    assert.equal(approvedDispatch.sent, 1);
  });

  it("enforces approval for beta-held messages even when dispatch omits beta mode", async () => {
    const userId = "preview_dispatch_no_flag_user";
    await createPendingPreviewBatch(userId);
    const schedulerUser = user({ userId, subscription:await activeSubscription(userId) });
    const g = gateways();

    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[schedulerUser], emailGateway:g.emailGateway, lineGateway:g.lineGateway, now });

    assert.equal(dispatch.sent, 0);
    assert.equal(dispatch.attempts[0]?.status, "deferred");
    assert.equal(dispatch.attempts[0]?.errorCode, "content_pending_approval");
    assert.equal(g.emailProvider.networkSendCount, 0);
    assert.equal(g.lineProvider.networkSendCount, 0);
  });

  it("marks an existing non-beta queued message as held when beta approval starts", async () => {
    const userId = "preview_existing_queue_user";
    approveHoroscopeArtifact({ userId });
    const schedulerUser = user({ userId, subscription:await activeSubscription(userId) });
    const first = runNotificationSchedulerJob({ sessionId, users:[schedulerUser], topics:["daily_horoscope"], now });
    const beta = runNotificationSchedulerJob({ sessionId, users:[schedulerUser], topics:["daily_horoscope"], now, betaApprovalMode:true });

    assert.equal(first.queued.length, 1);
    assert.equal(beta.duplicates, 1);
    assert.equal(beta.deferred, 1);
    assert.equal(getNotificationSchedulerState().outboundMessages[0]?.deliveryMetadata?.approvalStatus, "pending_review");

    const g = gateways();
    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[schedulerUser], emailGateway:g.emailGateway, lineGateway:g.lineGateway, now });
    assert.equal(dispatch.sent, 0);
    assert.equal(dispatch.attempts.at(-1)?.errorCode, "content_pending_approval");
  });

  it("refreshes existing beta-held queued content when regenerated preview hash changes", async () => {
    const userId = "preview_changed_queue_user";
    const oldBirthProfileId = approveHoroscopeArtifact({ userId });
    const schedulerUser = user({ userId, subscription:await activeSubscription(userId) });
    const first = runNotificationSchedulerJob({ sessionId, users:[schedulerUser], topics:["daily_horoscope"], now, betaApprovalMode:true });
    const queuedMessage = getNotificationSchedulerState().outboundMessages[0];
    const originalHash = queuedMessage?.horoscopeContent?.content_hash;
    assert.equal(first.queued.length, 1);
    assert.ok(originalHash);

    deleteBirthProfile({ sessionId, userId }, oldBirthProfileId, new Date("2026-05-02T00:00:00.000Z"));
    approveHoroscopeArtifact({ userId, birthTimeUnknown:true });

    const rerun = runNotificationSchedulerJob({ sessionId, users:[schedulerUser], topics:["daily_horoscope"], now, betaApprovalMode:true });
    const refreshedMessage = getNotificationSchedulerState().outboundMessages[0];
    const refreshedHash = refreshedMessage?.horoscopeContent?.content_hash;

    assert.equal(rerun.duplicates, 1);
    assert.notEqual(refreshedHash, originalHash);
    assert.equal(refreshedMessage?.deliveryMetadata?.contentHash, refreshedHash);
    assert.notEqual(refreshedMessage?.birthProfileId, oldBirthProfileId);
    assert.equal(getContentPreviewApprovalState(approvalSessionId).batches.at(-1)?.approvalStatus, "pending_review");
  });

  it("redacts PII while keeping rule hits safety flags warnings and source metadata visible", async () => {
    const batchId = await createPendingPreviewBatch("preview_redaction_user");
    const batch = getContentPreviewBatch(approvalSessionId, batchId);
    assert.ok(batch);
    const previewJson = JSON.stringify(batch);

    assert.doesNotMatch(previewJson, /1992-08-15|07:30|Bangkok|preview_redaction_user@example\.test|Upreview_redaction_user/i);
    assert.ok(batch.items[0]?.ruleHits.length);
    assert.ok(Array.isArray(batch.items[0]?.safetyFlags));
    assert.match(batch.items[0]?.source.calculationHash ?? "", /^[a-f0-9]{64}$/);
  });

  it("shows unknown birth time warnings in preview", async () => {
    approveHoroscopeArtifact({ userId:"preview_warning_user", birthTimeUnknown:true });
    const schedulerUser = user({ userId:"preview_warning_user", subscription:await activeSubscription("preview_warning_user") });
    runNotificationSchedulerJob({ sessionId, users:[schedulerUser], topics:["daily_horoscope"], now, betaApprovalMode:true });
    const batch = getContentPreviewApprovalState(approvalSessionId).batches[0];

    assert.ok(batch?.items[0]?.warnings.some((warning)=>warning.code.includes("UNKNOWN_BIRTH_TIME")));
  });

  it("does not send deleted birth profile content", async () => {
    const userId = "preview_deleted_profile_user";
    const birthProfileId = approveHoroscopeArtifact({ userId });
    const schedulerUser = user({ userId, subscription:await activeSubscription(userId) });
    runNotificationSchedulerJob({ sessionId, users:[schedulerUser], topics:["daily_horoscope"], now, betaApprovalMode:true });
    const batchId = getContentPreviewApprovalState(approvalSessionId).batches[0]!.batchId;
    approveContentBatchWithAdminCookie({ sessionId:approvalSessionId, batchId, sessionCookie:adminCookie, sessionSecret:adminSecret });
    deleteBirthProfile({ sessionId, userId }, birthProfileId, new Date("2026-05-02T00:00:00.000Z"));

    const g = gateways();
    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[schedulerUser], emailGateway:g.emailGateway, lineGateway:g.lineGateway, now, betaApprovalMode:true });
    assert.equal(dispatch.sent, 0);
    assert.equal(dispatch.suppressed, 1);
  });

  it("keeps approval audit logs free of raw birth data email line IDs and secrets", async () => {
    const batchId = await createPendingPreviewBatch("preview_audit_user");
    approveContentBatchWithAdminCookie({ sessionId:approvalSessionId, batchId, sessionCookie:adminCookie, sessionSecret:adminSecret });
    const auditJson = JSON.stringify(getContentPreviewApprovalState(approvalSessionId).auditLogs);

    assert.doesNotMatch(auditJson, /1992-08-15|07:30|Bangkok|preview_audit_user@example\.test|Upreview_audit_user|secret|token/i);
  });
});
