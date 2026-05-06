import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { EmailGateway, SandboxEmailProvider, createEmailChannelAccount, type EmailAuditLogEntry } from "../src/mvp/email-gateway";
import { canAccessPeriod, getMockSubscriptionState, resetMockSubscriptionState } from "../src/mvp/subscription-lifecycle";
import { HttpPaymentProvider, InMemoryWebhookIdempotencyStore, MockPaymentProvider, createPaymentCheckoutSession, createPaymentWebhookSignature, getMockPaymentProviderState, processPaymentWebhook, recordClientCheckoutReturn, resetMockPaymentProviderState, type CreateCheckoutInput, type PaymentWebhookEvent, type WebhookIdempotencyStore } from "../src/mvp/payment-provider";

const webhookSecret = "test-payment-webhook-secret";
const periodStart = "2026-05-01T00:00:00.000Z";
const periodEnd = "2026-06-01T00:00:00.000Z";
const renewedPeriodEnd = "2026-07-01T00:00:00.000Z";
const insidePeriod = new Date("2026-05-15T00:00:00.000Z");

const checkoutInput = (overrides:Partial<CreateCheckoutInput> = {}):CreateCheckoutInput => ({
  userId:"user_a",
  planCode:"premium",
  successUrl:"https://app.example.test/payment/success",
  cancelUrl:"https://app.example.test/payment/cancel",
  currentPeriodStart:periodStart,
  currentPeriodEnd:periodEnd,
  providerCustomerId:"cus_test_a",
  providerSubscriptionId:"sub_test_a",
  ...overrides,
});

const paymentEvent = (overrides:Partial<PaymentWebhookEvent> = {}):PaymentWebhookEvent => ({
  id:"evt_payment_1",
  type:"checkout.session.completed",
  userId:"user_a",
  planCode:"premium",
  providerCustomerId:"cus_test_a",
  providerSubscriptionId:"sub_test_a",
  providerPaymentId:"pay_test_a",
  providerCheckoutSessionId:"mock_checkout_1",
  currentPeriodStart:periodStart,
  currentPeriodEnd:periodEnd,
  occurredAt:"2026-05-01T00:00:01.000Z",
  receiptId:"receipt_test_a",
  ...overrides,
});

const signedRequest = (event:PaymentWebhookEvent, secret=webhookSecret) => {
  const rawBody = JSON.stringify(event);
  const timestamp = Date.now();
  return { rawBody, headers:new Headers({ "x-payment-timestamp":String(timestamp), "x-payment-signature":createPaymentWebhookSignature({ timestamp, body:rawBody, secret }) }) };
};

const createStoredSubscription = async (provider:MockPaymentProvider, eventId = "evt_create_bound") => {
  const checkout = await createPaymentCheckoutSession(provider, checkoutInput());
  return processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:eventId, type:"subscription.created", providerCheckoutSessionId:checkout.id })) });
};

describe("payment provider foundation", () => {
  beforeEach(() => {
    resetMockPaymentProviderState();
    resetMockSubscriptionState();
  });

  it("creates checkout sessions without activating a subscription", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    const checkout = await createPaymentCheckoutSession(provider, checkoutInput());

    assert.equal(checkout.status, "created");
    assert.equal(checkout.checkoutUrl.includes(checkout.id), true);
    assert.equal(getMockSubscriptionState().subscriptions.length, 0);
    assert.equal(getMockPaymentProviderState().checkoutSessions.length, 1);
    assert.equal(provider.networkCallCount, 0);
  });

  it("activates subscription only from a verified checkout completed webhook", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    await createPaymentCheckoutSession(provider, checkoutInput());

    const result = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent()) });
    const subscription = getMockSubscriptionState().subscriptions[0];

    assert.equal(result.status, "processed");
    assert.equal(result.subscriptionResult?.status, "applied");
    assert.equal(subscription?.status, "active");
    assert.equal(subscription?.id, "sub_test_a");
    assert.equal(canAccessPeriod({ subscription, periodType:"monthly", now:insidePeriod }), true);
  });

  it("known checkout session completes and activates the stored user and plan", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    const checkout = await createPaymentCheckoutSession(provider, checkoutInput({ userId:"stored_user", planCode:"basic", providerSubscriptionId:"sub_stored" }));

    const result = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ providerCheckoutSessionId:checkout.id, userId:"stored_user", planCode:"basic", providerSubscriptionId:"sub_stored" })) });
    const checkoutState = getMockPaymentProviderState().checkoutSessions[0];
    const subscription = getMockSubscriptionState().subscriptions[0];

    assert.equal(result.status, "processed");
    assert.equal(checkoutState?.status, "completed");
    assert.equal(checkoutState?.consumed, true);
    assert.equal(subscription?.userId, "stored_user");
    assert.equal(subscription?.planCode, "basic");
  });

  it("rejects unknown checkout session completions without granting entitlement", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });

    const result = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_unknown_checkout", providerCheckoutSessionId:"unknown_checkout" })) });

    assert.equal(result.status, "rejected");
    assert.equal(result.reason, "unknown_checkout_session");
    assert.equal(getMockSubscriptionState().subscriptions.length, 0);
  });

  it("rejects checkout payload plan upgrades beyond the stored checkout plan", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    const checkout = await createPaymentCheckoutSession(provider, checkoutInput({ planCode:"basic" }));

    const result = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_plan_upgrade", providerCheckoutSessionId:checkout.id, planCode:"premium" })) });

    assert.equal(result.status, "rejected");
    assert.equal(result.reason, "checkout_plan_mismatch");
    assert.equal(getMockSubscriptionState().subscriptions.length, 0);
  });

  it("rejects checkout payload attempts to redirect entitlement to another user", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    const checkout = await createPaymentCheckoutSession(provider, checkoutInput({ userId:"stored_user" }));

    const result = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_user_redirect", providerCheckoutSessionId:checkout.id, userId:"attacker_user" })) });

    assert.equal(result.status, "rejected");
    assert.equal(result.reason, "checkout_user_mismatch");
    assert.equal(getMockSubscriptionState().subscriptions.length, 0);
  });

  it("rejects checkout completion provider mismatches", async () => {
    const httpProvider = new HttpPaymentProvider({ checkoutEndpoint:"https://payments.example.test/checkout", apiKey:"test_api_key", webhookSecret, fetcher:async () => new Response(JSON.stringify({ id:"shared_checkout", checkoutUrl:"https://payments.example.test/checkout/shared_checkout" }), { status:200, headers:{ "content-type":"application/json" } }) });
    await createPaymentCheckoutSession(httpProvider, checkoutInput());
    const mockProvider = new MockPaymentProvider({ webhookSecret });

    const result = await processPaymentWebhook({ provider:mockProvider, ...signedRequest(paymentEvent({ id:"evt_provider_mismatch", providerCheckoutSessionId:"shared_checkout" })) });

    assert.equal(result.status, "rejected");
    assert.equal(result.reason, "provider_mismatch");
    assert.equal(getMockSubscriptionState().subscriptions.length, 0);
  });

  it("duplicate checkout completed webhook is idempotent", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    const checkout = await createPaymentCheckoutSession(provider, checkoutInput());
    const request = signedRequest(paymentEvent({ id:"evt_checkout_duplicate", providerCheckoutSessionId:checkout.id }));

    const first = await processPaymentWebhook({ provider, ...request });
    const duplicate = await processPaymentWebhook({ provider, ...request });

    assert.equal(first.status, "processed");
    assert.equal(duplicate.status, "duplicate");
    assert.equal(getMockSubscriptionState().subscriptions.length, 1);
    assert.equal(getMockPaymentProviderState().checkoutSessions[0]?.consumed, true);
  });

  it("verified checkout session created webhook does not activate subscription", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });

    const result = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_checkout_created", type:"checkout.session.created" })) });

    assert.equal(result.status, "processed");
    assert.equal(result.subscriptionResult, undefined);
    assert.equal(getMockSubscriptionState().subscriptions.length, 0);
  });

  it("rejects subscription.created without a stored checkout binding", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });

    const result = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_unbound_subscription_create", type:"subscription.created", providerCheckoutSessionId:undefined })) });

    assert.equal(result.status, "rejected");
    assert.equal(result.reason, "unknown_subscription_binding");
    assert.equal(getMockSubscriptionState().subscriptions.length, 0);
  });

  it("rejects subscription.created with an unknown checkout binding", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });

    const result = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_unknown_subscription_checkout", type:"subscription.created", providerCheckoutSessionId:"unknown_checkout" })) });

    assert.equal(result.status, "rejected");
    assert.equal(result.reason, "unknown_checkout_session");
    assert.equal(getMockSubscriptionState().subscriptions.length, 0);
  });

  it("rejects subscription.created payload attempts to override stored user or plan", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    const checkout = await createPaymentCheckoutSession(provider, checkoutInput({ userId:"stored_user", planCode:"basic", providerSubscriptionId:"sub_stored" }));

    const userOverride = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_subscription_user_override", type:"subscription.created", providerCheckoutSessionId:checkout.id, providerSubscriptionId:"sub_stored", userId:"attacker_user", planCode:"basic" })) });
    const planOverride = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_subscription_plan_override", type:"subscription.created", providerCheckoutSessionId:checkout.id, providerSubscriptionId:"sub_stored", userId:"stored_user", planCode:"premium" })) });

    assert.equal(userOverride.status, "rejected");
    assert.equal(userOverride.reason, "checkout_user_mismatch");
    assert.equal(planOverride.status, "rejected");
    assert.equal(planOverride.reason, "checkout_plan_mismatch");
    assert.equal(getMockSubscriptionState().subscriptions.length, 0);
  });

  it("processes subscription.created after checkout completion idempotently without duplicating subscription", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    const checkout = await createPaymentCheckoutSession(provider, checkoutInput());

    const checkoutCompleted = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_checkout_then_subscription", providerCheckoutSessionId:checkout.id })) });
    const subscriptionCreated = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_subscription_after_checkout", type:"subscription.created", providerCheckoutSessionId:checkout.id })) });

    assert.equal(checkoutCompleted.status, "processed");
    assert.equal(subscriptionCreated.status, "processed");
    assert.equal(subscriptionCreated.subscriptionResult?.reason, "already_exists");
    assert.equal(getMockSubscriptionState().subscriptions.length, 1);
  });

  it("rejects subscription.created provider mismatches", async () => {
    const httpProvider = new HttpPaymentProvider({ checkoutEndpoint:"https://payments.example.test/checkout", apiKey:"test_api_key", webhookSecret, fetcher:async () => new Response(JSON.stringify({ id:"shared_subscription_checkout", checkoutUrl:"https://payments.example.test/checkout/shared_subscription_checkout" }), { status:200, headers:{ "content-type":"application/json" } }) });
    await createPaymentCheckoutSession(httpProvider, checkoutInput({ providerSubscriptionId:"sub_shared_provider" }));
    const mockProvider = new MockPaymentProvider({ webhookSecret });

    const result = await processPaymentWebhook({ provider:mockProvider, ...signedRequest(paymentEvent({ id:"evt_subscription_provider_mismatch", type:"subscription.created", providerCheckoutSessionId:"shared_subscription_checkout", providerSubscriptionId:"sub_shared_provider" })) });

    assert.equal(result.status, "rejected");
    assert.equal(result.reason, "provider_mismatch");
    assert.equal(getMockSubscriptionState().subscriptions.length, 0);
  });

  it("rejects invalid webhook signatures before mutating subscriptions", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    const request = signedRequest(paymentEvent(), "wrong-secret");

    const result = await processPaymentWebhook({ provider, ...request });

    assert.equal(result.status, "rejected");
    assert.equal(result.reason, "invalid_signature");
    assert.equal(getMockSubscriptionState().subscriptions.length, 0);
    assert.equal(getMockPaymentProviderState().processedWebhookEventIds.length, 0);
  });

  it("deduplicates verified payment webhook event IDs", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    const checkout = await createPaymentCheckoutSession(provider, checkoutInput());
    const request = signedRequest(paymentEvent({ id:"evt_idem", providerCheckoutSessionId:checkout.id }));

    const first = await processPaymentWebhook({ provider, ...request });
    const duplicate = await processPaymentWebhook({ provider, ...request });

    assert.equal(first.status, "processed");
    assert.equal(duplicate.status, "duplicate");
    assert.equal(getMockSubscriptionState().subscriptions.length, 1);
    assert.equal(getMockSubscriptionState().auditLogs.filter((log) => log.action === "subscription_status_changed").length, 1);
    assert.equal(getMockPaymentProviderState().processedWebhookEventIds.length, 1);
  });

  it("claims webhook idempotency before checkout side effects", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    const checkout = await createPaymentCheckoutSession(provider, checkoutInput());
    const claimObservations:{ subscriptions:number; checkoutConsumed:boolean|undefined }[] = [];
    const store:WebhookIdempotencyStore = {
      claim:() => {
        claimObservations.push({ subscriptions:getMockSubscriptionState().subscriptions.length, checkoutConsumed:getMockPaymentProviderState().checkoutSessions[0]?.consumed });
        return "claimed";
      },
      markProcessed:() => undefined,
    };

    await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_claim_first", providerCheckoutSessionId:checkout.id })), idempotencyStore:store });

    assert.deepEqual(claimObservations, [{ subscriptions:0, checkoutConsumed:false }]);
    assert.equal(getMockSubscriptionState().subscriptions.length, 1);
  });

  it("duplicate event IDs do not duplicate subscriptions, receipts, or processed audit entries", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    const emailProvider = new SandboxEmailProvider();
    const emailAuditLogs:EmailAuditLogEntry[] = [];
    const emailGateway = new EmailGateway({ provider:emailProvider, fromEmail:"noreply@example.test", sandboxMode:true, auditHashSecret:"test-email-audit-secret", auditLogs:emailAuditLogs });
    const emailAccount = { ...createEmailChannelAccount({ userId:"user_a", email:"user@example.test", now:new Date(periodStart) }), verified:true };
    const request = signedRequest(paymentEvent({ id:"evt_receipt_duplicate", type:"payment.succeeded" }));

    const first = await processPaymentWebhook({ provider, ...request, receiptHook:{ emailGateway, emailAccount } });
    const duplicate = await processPaymentWebhook({ provider, ...request, receiptHook:{ emailGateway, emailAccount } });
    const paymentState = getMockPaymentProviderState();

    assert.equal(first.status, "processed");
    assert.equal(duplicate.status, "duplicate");
    assert.equal(getMockSubscriptionState().subscriptions.length, 0);
    assert.equal(paymentState.receiptNotifications.length, 1);
    assert.equal(paymentState.auditLogs.filter((log) => log.action === "payment_webhook_processed" && log.targetId === "evt_receipt_duplicate").length, 1);
  });

  it("idempotency key includes provider and event id", () => {
    const store = new InMemoryWebhookIdempotencyStore();

    const mockClaim = store.claim("mock", "evt_same_provider_id");
    const httpClaim = store.claim("http", "evt_same_provider_id");
    const duplicateMockClaim = store.claim("mock", "evt_same_provider_id");

    assert.equal(mockClaim, "claimed");
    assert.equal(httpClaim, "claimed");
    assert.equal(duplicateMockClaim, "duplicate");
  });

  it("keeps out-of-order lifecycle prerequisites replayable instead of idempotently burned", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    const renewal = paymentEvent({ id:"evt_out_of_order_renew", type:"subscription.renewed", currentPeriodStart:periodEnd, currentPeriodEnd:renewedPeriodEnd, occurredAt:"2026-06-01T00:00:01.000Z" });

    const beforeCreate = await processPaymentWebhook({ provider, ...signedRequest(renewal) });
    assert.equal(beforeCreate.status, "ignored_retryable");
    assert.equal(getMockPaymentProviderState().processedWebhookEventIds.length, 0);

    await createStoredSubscription(provider, "evt_create_before_replay");
    const replay = await processPaymentWebhook({ provider, ...signedRequest(renewal) });

    assert.equal(replay.status, "processed");
    assert.equal(replay.subscriptionResult?.status, "applied");
    assert.equal(getMockPaymentProviderState().processedWebhookEventIds.includes("mock:evt_out_of_order_renew"), true);
  });

  it("sends receipt email through sandbox hook after verified successful payment only", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    const emailProvider = new SandboxEmailProvider();
    const emailAuditLogs:EmailAuditLogEntry[] = [];
    const emailGateway = new EmailGateway({ provider:emailProvider, fromEmail:"noreply@example.test", sandboxMode:true, auditHashSecret:"test-email-audit-secret", auditLogs:emailAuditLogs });
    const emailAccount = { ...createEmailChannelAccount({ userId:"user_a", email:"user@example.test", now:new Date(periodStart) }), verified:true };

    const result = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ type:"payment.succeeded", id:"evt_receipt" })), receiptHook:{ emailGateway, emailAccount } });

    assert.equal(result.status, "processed");
    assert.equal(result.receiptNotification?.status, "sent");
    assert.equal(emailProvider.networkSendCount, 0);
    assert.equal(emailProvider.sent.length, 0);
    assert.equal(getMockPaymentProviderState().receiptNotifications.length, 1);
    assert.equal(getMockPaymentProviderState().processedReceiptKeys.length, 1);
    assert.equal(JSON.stringify(emailAuditLogs).includes("user@example.test"), false);
  });

  it("deduplicates checkout completed and payment succeeded receipt hooks by payment id", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    const checkout = await createPaymentCheckoutSession(provider, checkoutInput());
    const emailProvider = new SandboxEmailProvider();
    const emailAuditLogs:EmailAuditLogEntry[] = [];
    const emailGateway = new EmailGateway({ provider:emailProvider, fromEmail:"noreply@example.test", sandboxMode:true, auditHashSecret:"test-email-audit-secret", auditLogs:emailAuditLogs });
    const emailAccount = { ...createEmailChannelAccount({ userId:"user_a", email:"user@example.test", now:new Date(periodStart) }), verified:true };
    const receiptHook = { emailGateway, emailAccount };

    const checkoutCompleted = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_receipt_checkout", providerCheckoutSessionId:checkout.id, providerPaymentId:"pay_same_receipt" })), receiptHook });
    const paymentSucceeded = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_receipt_payment", type:"payment.succeeded", providerPaymentId:"pay_same_receipt" })), receiptHook });

    assert.equal(checkoutCompleted.receiptNotification, undefined);
    assert.equal(paymentSucceeded.receiptNotification?.status, "sent");
    assert.equal(getMockPaymentProviderState().receiptNotifications.length, 1);
    assert.equal(emailAuditLogs.length, 1);
  });

  it("deduplicates distinct payment.succeeded events for the same payment id", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    const emailProvider = new SandboxEmailProvider();
    const emailAuditLogs:EmailAuditLogEntry[] = [];
    const emailGateway = new EmailGateway({ provider:emailProvider, fromEmail:"noreply@example.test", sandboxMode:true, auditHashSecret:"test-email-audit-secret", auditLogs:emailAuditLogs });
    const emailAccount = { ...createEmailChannelAccount({ userId:"user_a", email:"user@example.test", now:new Date(periodStart) }), verified:true };
    const receiptHook = { emailGateway, emailAccount };

    const first = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_payment_receipt_first", type:"payment.succeeded", providerPaymentId:"pay_duplicate_receipt" })), receiptHook });
    const second = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_payment_receipt_second", type:"payment.succeeded", providerPaymentId:"pay_duplicate_receipt" })), receiptHook });

    assert.equal(first.receiptNotification?.status, "sent");
    assert.equal(second.receiptNotification, undefined);
    assert.equal(getMockPaymentProviderState().receiptNotifications.length, 1);
    assert.equal(getMockPaymentProviderState().processedReceiptKeys.length, 1);
    assert.equal(emailAuditLogs.length, 1);
  });

  it("does not send receipt hooks without a stable payment or receipt key", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    const emailProvider = new SandboxEmailProvider();
    const emailAuditLogs:EmailAuditLogEntry[] = [];
    const emailGateway = new EmailGateway({ provider:emailProvider, fromEmail:"noreply@example.test", sandboxMode:true, auditHashSecret:"test-email-audit-secret", auditLogs:emailAuditLogs });
    const emailAccount = { ...createEmailChannelAccount({ userId:"user_a", email:"user@example.test", now:new Date(periodStart) }), verified:true };

    const result = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ type:"payment.succeeded", id:"evt_receipt_missing_key", providerPaymentId:undefined, receiptId:undefined })), receiptHook:{ emailGateway, emailAccount } });

    assert.equal(result.status, "processed");
    assert.equal(result.receiptNotification, undefined);
    assert.equal(getMockPaymentProviderState().receiptNotifications.length, 0);
    assert.equal(emailAuditLogs.length, 0);
  });

  it("maps failed payment to renewal_failed and past_due behavior", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    await createStoredSubscription(provider, "evt_create_before_fail");

    const failed = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_failed", type:"payment.failed", occurredAt:"2026-05-20T00:00:00.000Z" })) });
    const subscription = failed.subscriptionResult?.subscription;

    assert.equal(failed.status, "processed");
    assert.equal(subscription?.status, "past_due");
    assert.equal(canAccessPeriod({ subscription, periodType:"daily", now:insidePeriod }), false);
  });

  it("maps successful subscription renewal to an extended lifecycle period", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    await createStoredSubscription(provider, "evt_create_before_renew");

    const renewed = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_renew", type:"subscription.renewed", currentPeriodStart:periodEnd, currentPeriodEnd:renewedPeriodEnd, occurredAt:"2026-06-01T00:00:01.000Z" })) });

    assert.equal(renewed.subscriptionResult?.status, "applied");
    assert.equal(renewed.subscriptionResult?.subscription?.currentPeriodEnd, renewedPeriodEnd);
    assert.equal(canAccessPeriod({ subscription:renewed.subscriptionResult?.subscription, periodType:"yearly", now:new Date("2026-06-15T00:00:00.000Z") }), true);
  });

  it("maps subscription cancellation webhook to lifecycle cancellation", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    await createStoredSubscription(provider, "evt_create_before_cancel");

    const canceled = await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_cancel", type:"subscription.canceled", cancelAtPeriodEnd:false, occurredAt:"2026-05-10T00:00:00.000Z" })) });

    assert.equal(canceled.subscriptionResult?.status, "applied");
    assert.equal(canceled.subscriptionResult?.subscription?.status, "canceled");
    assert.equal(canAccessPeriod({ subscription:canceled.subscriptionResult?.subscription, periodType:"daily", now:insidePeriod }), false);
  });

  it("client-side success return cannot activate a subscription", () => {
    const result = recordClientCheckoutReturn({ checkoutSessionId:"checkout_from_url", status:"success", now:new Date("2026-05-01T00:00:00.000Z") });

    assert.equal(result.status, "ignored");
    assert.equal(getMockSubscriptionState().subscriptions.length, 0);
    assert.equal(getMockPaymentProviderState().auditLogs[0]?.action, "payment_client_return_ignored");
  });

  it("stores provider references only and never stores card data", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    const eventWithCardLikePayload = { ...paymentEvent({ id:"evt_no_card", type:"payment.succeeded" }), cardNumber:"test-card-sensitive-marker", cvc:"test-cvc-sensitive-marker", rawPayload:{ card:"test-card-sensitive-marker" } };

    await processPaymentWebhook({ provider, ...signedRequest(eventWithCardLikePayload) });
    const serializedState = JSON.stringify(getMockPaymentProviderState());

    assert.equal(serializedState.includes("test-card-sensitive-marker"), false);
    assert.equal(serializedState.includes("cvc"), false);
    assert.equal(getMockPaymentProviderState().providerReferences[0]?.providerCustomerId, "cus_test_a");
    assert.equal(getMockPaymentProviderState().providerReferences[0]?.providerSubscriptionId, "sub_test_a");
  });

  it("audit logs exclude raw payment secrets and card data", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    const rawBody = JSON.stringify({ ...paymentEvent({ id:"evt_audit_clean", type:"payment.succeeded" }), secret:"provider-secret", cardNumber:"test-card-sensitive-marker" });
    const timestamp = Date.now();
    const headers = new Headers({ "x-payment-timestamp":String(timestamp), "x-payment-signature":createPaymentWebhookSignature({ timestamp, body:rawBody, secret:webhookSecret }) });

    await processPaymentWebhook({ provider, headers, rawBody });
    const auditJson = JSON.stringify(getMockPaymentProviderState().auditLogs);

    assert.equal(auditJson.includes("provider-secret"), false);
    assert.equal(auditJson.includes("test-card-sensitive-marker"), false);
    assert.equal(auditJson.includes(rawBody), false);
  });

  it("tests never call a real payment provider network", async () => {
    const provider = new MockPaymentProvider({ webhookSecret });
    await createPaymentCheckoutSession(provider, checkoutInput());
    await processPaymentWebhook({ provider, ...signedRequest(paymentEvent({ id:"evt_no_network", type:"payment.succeeded" })) });

    assert.equal(provider.networkCallCount, 0);
  });

  it("HttpPaymentProvider verifies webhooks with configured secret and fails closed without network", async () => {
    const previousEnvSecret = process.env.PAYMENT_WEBHOOK_SECRET;
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls += 1;
      throw new Error("network must not be called by webhook verification");
    };
    const provider = new HttpPaymentProvider({ webhookSecret, fetcher });
    const request = signedRequest(paymentEvent({ id:"evt_http_verified" }));
    const missingSecretProvider = new HttpPaymentProvider({ fetcher });

    assert.equal(await provider.verifyWebhook(request.headers, request.rawBody), true);
    assert.equal(await missingSecretProvider.verifyWebhook(request.headers, request.rawBody), false);
    assert.equal(fetchCalls, 0);
    if (previousEnvSecret === undefined) delete process.env.PAYMENT_WEBHOOK_SECRET;
    else process.env.PAYMENT_WEBHOOK_SECRET = previousEnvSecret;
  });
});
