import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { runBetaDryRun, stagingBetaDryRunEnv } from "../src/mvp/beta-dry-run";
import { CONTENT_PREVIEW_APPROVAL_SESSION_ID, approveContentPreviewBatch, getContentPreviewApprovalState, resetContentPreviewApprovalState } from "../src/mvp/content-preview-approval";
import { EmailGateway, SandboxEmailProvider, createEmailChannelAccount, type EmailAuditLogEntry } from "../src/mvp/email-gateway";
import { evaluateHoroscopeContentSafety, generateHoroscopeContent } from "../src/mvp/horoscope-content-engine";
import { LineGateway, SandboxLineProvider, createLineChannelAccount, type LineAuditLogEntry } from "../src/mvp/line-gateway";
import { approveDraft, callMockAstroCalc, deleteBirthProfile, exportUserData, generateHoroscopeResult, getMockMvpState, queueMockOutboundMessage, recordMockDeliveryAttempt, requestAccountDeletion, resetMockMvpState, saveBirthProfile, setNotificationPreference, storeChartSnapshot } from "../src/mvp/mock-flow";
import { dispatchQueuedNotifications, getNotificationSchedulerState, resetNotificationSchedulerState, runNotificationSchedulerJob, type NotificationSchedulerUser } from "../src/mvp/notification-scheduler";
import { buildOperatorConsoleStatus } from "../src/mvp/operator-status";
import { MockPaymentProvider, createPaymentCheckoutSession, createPaymentWebhookSignature, getMockPaymentProviderState, processPaymentWebhook, recordClientCheckoutReturn, resetMockPaymentProviderState } from "../src/mvp/payment-provider";
import { getMockSubscriptionState, resetMockSubscriptionState } from "../src/mvp/subscription-lifecycle";

const projectRoot = resolve(process.cwd(), "../..");
const sessionId = "beta_e2e_smoke";
const userId = "beta_e2e_user";
const now = new Date("2026-05-03T02:00:00.000Z");
const webhookSecret = "beta-e2e-webhook-secret";

describe("beta release candidate E2E smoke", () => {
  beforeEach(() => {
    resetMockMvpState("premium");
    resetMockPaymentProviderState();
    resetMockSubscriptionState();
    resetNotificationSchedulerState();
    resetContentPreviewApprovalState();
  });

  it("validates the beta flow in mock-safe mode without real providers or raw PII leakage", async () => {
    const context = { sessionId, userId };
    const profile = saveBirthProfile({
      birthDate:"1992-08-15",
      birthTime:"",
      birthTimeUnknown:true,
      birthPlaceText:"Bangkok",
      timezone:"Asia/Bangkok",
      consentBirthData:true,
    }, context, now);
    const chart = storeChartSnapshot(callMockAstroCalc(profile), sessionId, now);
    assert.equal(chart.engine, "mock");
    assert.equal(chart.houses.ascendant_deg, null);
    assert.equal(chart.warnings.includes("UNKNOWN_BIRTH_TIME"), true);

    const content = generateHoroscopeContent({
      periodType:"daily",
      periodKey:"2026-05-03",
      chartSnapshot:chart,
      generatedAt:now,
    });
    assert.equal(content.safety_flags.length, 0);
    assert.equal(content.warnings.some((warning)=>warning.code === "CONTENT_CONFIDENCE_LOWERED_UNKNOWN_BIRTH_TIME"), true);
    assert.equal(evaluateHoroscopeContentSafety("เดือนนี้คุณมีเกณฑ์ป่วยหนักแน่นอน").safe, false);

    const horoscope = generateHoroscopeResult({ chartSnapshot:chart, periodType:"daily", periodKey:"2026-05-03", sessionId, now });
    approveDraft(horoscope.id, "beta_e2e_admin", sessionId, now);

    const paymentProvider = new MockPaymentProvider({ webhookSecret, now:()=>now });
    const checkout = await createPaymentCheckoutSession(paymentProvider, {
      userId,
      planCode:"premium",
      successUrl:"https://example.test/success",
      cancelUrl:"https://example.test/cancel",
      currentPeriodStart:"2026-05-01T00:00:00.000Z",
      currentPeriodEnd:"2026-06-01T00:00:00.000Z",
      providerSubscriptionId:"sub_beta_e2e",
    });
    assert.equal(recordClientCheckoutReturn({ checkoutSessionId:checkout.id, status:"success", now }).status, "ignored");

    const invalidPayment = await processPaymentWebhook({
      provider:paymentProvider,
      headers:new Headers({ "x-payment-timestamp":String(Date.now()), "x-payment-signature":"invalid" }),
      rawBody:"{}",
    });
    assert.equal(invalidPayment.status, "rejected");

    const rawBody = JSON.stringify({
      id:"evt_beta_e2e_checkout_completed",
      type:"checkout.session.completed",
      userId,
      planCode:"premium",
      providerCheckoutSessionId:checkout.id,
      providerSubscriptionId:"sub_beta_e2e",
      currentPeriodStart:"2026-05-01T00:00:00.000Z",
      currentPeriodEnd:"2026-06-01T00:00:00.000Z",
      occurredAt:"2026-05-03T02:00:00.000Z",
    });
    const timestamp = Date.now();
    const headers = new Headers({
      "x-payment-timestamp":String(timestamp),
      "x-payment-signature":createPaymentWebhookSignature({ timestamp, body:rawBody, secret:webhookSecret }),
    });
    const processedPayment = await processPaymentWebhook({ provider:paymentProvider, headers, rawBody });
    const duplicatePayment = await processPaymentWebhook({ provider:paymentProvider, headers, rawBody });
    assert.equal(processedPayment.status, "processed");
    assert.equal(processedPayment.subscriptionResult?.status, "applied");
    assert.equal(duplicatePayment.status, "duplicate");
    assert.equal(paymentProvider.networkCallCount, 0);
    assert.equal(getMockPaymentProviderState().auditLogs.some((entry)=>entry.action === "payment_webhook_processed"), true);

    const emailAuditLogs:EmailAuditLogEntry[] = [];
    const lineAuditLogs:LineAuditLogEntry[] = [];
    const emailProvider = new SandboxEmailProvider();
    const lineProvider = new SandboxLineProvider();
    const emailGateway = new EmailGateway({ provider:emailProvider, fromEmail:"noreply@example.test", sandboxMode:true, auditHashSecret:"beta-e2e-email-audit", auditLogs:emailAuditLogs });
    const lineGateway = new LineGateway({ provider:lineProvider, sandboxMode:true, auditHashSecret:"beta-e2e-line-audit", auditLogs:lineAuditLogs });
    const emailAccount = { ...createEmailChannelAccount({ userId, email:"beta@example.test", now }), verified:true };
    const lineAccount = createLineChannelAccount({ userId, lineUserId:"UrawLineUserIdShouldNotLeak000000", now });
    setNotificationPreference(context, "daily_horoscope", true, now);

    const subscription = getMockSubscriptionState().subscriptions.find((item)=>item.userId === userId);
    assert.ok(subscription);
    const schedulerUser:NotificationSchedulerUser = {
      userId,
      timezone:"Asia/Bangkok",
      preferredNotificationTime:"09:00",
      planCode:"premium",
      subscription,
      primaryChannel:"line",
      fallbackChannel:"email",
      preferences:[
        { topicCode:"daily_horoscope", channel:"line", enabled:true },
        { topicCode:"daily_horoscope", channel:"email", enabled:true, allowFallback:true },
      ],
      lineAccount,
      emailAccount,
    };

    const queue = runNotificationSchedulerJob({ sessionId, users:[schedulerUser], topics:["daily_horoscope"], now, betaApprovalMode:true });
    assert.equal(queue.queued.length, 1);
    assert.equal(queue.deferred, 1);
    const approvalState = getContentPreviewApprovalState(CONTENT_PREVIEW_APPROVAL_SESSION_ID);
    const batch = approvalState.batches[0];
    assert.ok(batch);
    assert.equal(batch.approvalStatus, "pending_review");
    assert.equal(batch.items[0]?.safetyFlags.length, 0);
    assert.equal(JSON.stringify(batch).includes(profile.birthDate), false);
    approveContentPreviewBatch({ sessionId:CONTENT_PREVIEW_APPROVAL_SESSION_ID, batchId:batch.batchId, actorId:"beta_e2e_admin", now });

    const dispatch = await dispatchQueuedNotifications({ sessionId, users:[schedulerUser], emailGateway, lineGateway, now, betaApprovalMode:true });
    assert.equal(dispatch.sent, 1);
    assert.equal(lineProvider.networkSendCount, 0);
    assert.equal(emailProvider.networkSendCount, 0);
    assert.equal(lineAuditLogs.some((entry)=>entry.action === "line_delivery_sent"), true);

    await emailGateway.send(emailAccount, { topicCode:"daily_horoscope", subject:"Mock", text:"Mock", html:"<p>Mock</p>", transactional:false });
    assert.equal(emailProvider.networkSendCount, 0);
    assert.equal(emailAuditLogs.some((entry)=>entry.action === "email_delivery_sent"), true);

    const exported = exportUserData(context, now);
    assert.equal(exported.birthProfiles.length, 1);
    deleteBirthProfile(context, profile.id, now);
    assert.throws(() => queueMockOutboundMessage(horoscope.id, sessionId), /not found|approved/);
    requestAccountDeletion(context, now);
    assert.throws(() => recordMockDeliveryAttempt("missing", sessionId), /not found/);

    const status = buildOperatorConsoleStatus({
      env:{
        APP_ENV:"staging",
        ADMIN_SESSION_SECRET:"operator-secret-value",
        EMAIL_PROVIDER_MODE:"sandbox",
        EMAIL_AUDIT_HASH_SECRET:"email-audit-secret",
        LINE_PROVIDER_MODE:"sandbox",
        LINE_AUDIT_HASH_SECRET:"line-audit-secret",
        PAYMENT_PROVIDER_MODE:"mock",
        NOTIFICATION_SCHEDULER_MODE:"dry_run",
        ASTRO_ENGINE:"mock",
        SWISSEPH_LICENSE_MODE:"none",
        BIRTH_DATE:profile.birthDate,
        LINE_USER_ID:lineAccount.lineUserId,
      },
      now,
    });
    const unsafeOutput = JSON.stringify({
      status,
      emailAuditLogs,
      lineAuditLogs,
      paymentAuditLogs:getMockPaymentProviderState().auditLogs,
      notificationAuditLogs:getNotificationSchedulerState().auditLogs,
      mockAuditLogs:getMockMvpState(sessionId).auditLogs,
    });
    for (const unsafe of [profile.birthDate, profile.birthTime, profile.birthPlaceText, "beta@example.test", lineAccount.lineUserId, webhookSecret, "operator-secret-value"]) {
      if (unsafe) assert.equal(unsafeOutput.includes(unsafe), false, `smoke output leaked ${unsafe}`);
    }
  });

  it("keeps the documented E2E matrix and final decision gates complete", () => {
    const matrix = readFileSync(resolve(projectRoot, "docs/E2E_BETA_SMOKE_TEST_MATRIX.md"), "utf8");
    const finalGoNoGo = readFileSync(resolve(projectRoot, "docs/FINAL_GO_NO_GO_CHECKLIST.md"), "utf8");
    const releaseCandidate = readFileSync(resolve(projectRoot, "docs/BETA_RELEASE_CANDIDATE.md"), "utf8");
    const rollback = readFileSync(resolve(projectRoot, "docs/ROLLBACK_CHECKLIST.md"), "utf8");

    for (let index = 1; index <= 20; index += 1) {
      assert.equal(matrix.includes(`E2E-${String(index).padStart(2, "0")}`), true);
    }
    for (const required of ["PR29", "PR31", "mock/sandbox/dry-run", "Any real provider call happens in tests", "Unknown birth time warnings", "Rollback owner"]) {
      assert.equal(`${finalGoNoGo}\n${releaseCandidate}`.includes(required), true);
    }
    assert.equal(rollback.includes("Release candidate rollback evidence"), true);

    const unsafeDryRun = runBetaDryRun({
      projectRoot,
      env:stagingBetaDryRunEnv({ EMAIL_PROVIDER_MODE:"http", EMAIL_PROVIDER_API_KEY:"unexpected-real-provider-key" }),
      astroHealthProbe:()=>({ ok:true, summary:"mock astro health" }),
    });
    assert.equal(unsafeDryRun.status, "fail");
    assert.equal(unsafeDryRun.checks.some((check)=>check.id === "providers_remain_mock_safe" && check.status === "fail"), true);
  });
});
