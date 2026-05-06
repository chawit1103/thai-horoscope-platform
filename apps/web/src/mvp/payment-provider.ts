import { createHmac, timingSafeEqual } from "node:crypto";
import { EmailGateway, renderTransactionalEmailTemplate, type EmailChannelAccount, type EmailDeliveryResult } from "./email-gateway";
import { processMockSubscriptionWebhook, type MockSubscriptionWebhookEvent, type PlanCode, type SubscriptionWebhookResult } from "./subscription-lifecycle";

export type PaymentProviderCode = "mock"|"http";
export type PaymentWebhookEventType = "checkout.session.created"|"checkout.session.completed"|"payment.succeeded"|"payment.failed"|"subscription.created"|"subscription.renewed"|"subscription.renewal_failed"|"subscription.canceled"|"subscription.expired"|"refund.created"|"refund.succeeded";
export type PaymentWebhookProcessStatus = "processed"|"duplicate"|"rejected"|"ignored_retryable";

export interface CreateCheckoutInput { userId:string; planCode:PlanCode; successUrl:string; cancelUrl:string; currentPeriodStart:string; currentPeriodEnd:string; providerCustomerId?:string; providerSubscriptionId?:string; amount?:number; currency?:string; }
export interface CheckoutSession { id:string; provider:PaymentProviderCode; checkoutUrl:string; userId:string; planCode:PlanCode; providerCustomerId?:string; providerSubscriptionId?:string; amount?:number; currency?:string; createdAt:string; status:"created"; }
export type StoredCheckoutSession = Omit<CheckoutSession, "status"> & { status:"created"|"completed"; consumed:boolean; completedAt?:string; consumedAt?:string; };
export interface PaymentWebhookEvent { id:string; type:PaymentWebhookEventType; userId:string; planCode?:PlanCode; providerCustomerId?:string; providerSubscriptionId?:string; providerPaymentId?:string; providerCheckoutSessionId?:string; currentPeriodStart?:string; currentPeriodEnd?:string; cancelAtPeriodEnd?:boolean; occurredAt:string; receiptId?:string; }
export interface PaymentProvider { provider:PaymentProviderCode; createCheckoutSession(input:CreateCheckoutInput):Promise<CheckoutSession>; verifyWebhook(headers:Headers, rawBody:string):Promise<boolean>; parseWebhook(headers:Headers, rawBody:string):Promise<PaymentWebhookEvent>; }
export interface PaymentAuditLogEntry { action:"payment_checkout_session_created"|"payment_webhook_processed"|"payment_webhook_duplicate"|"payment_webhook_rejected"|"payment_webhook_ignored"|"payment_client_return_ignored"; targetId:string; createdAt:string; metadata:Record<string,string>; }
export interface PaymentProviderState { checkoutSessions:StoredCheckoutSession[]; processedWebhookEventIds:string[]; auditLogs:PaymentAuditLogEntry[]; receiptNotifications:EmailDeliveryResult[]; providerReferences:PaymentProviderReference[]; webhookIdempotencyRecords:WebhookIdempotencyRecord[]; }
export interface PaymentProviderReference { userId:string; providerCustomerId?:string; providerSubscriptionId?:string; providerPaymentId?:string; updatedAt:string; }
export interface PaymentWebhookProcessResult { status:PaymentWebhookProcessStatus; reason?:string; event?:PaymentWebhookEvent; subscriptionResult?:SubscriptionWebhookResult; receiptNotification?:EmailDeliveryResult; }
export interface PaymentReceiptHook { emailGateway:EmailGateway; emailAccount:EmailChannelAccount; }
export type WebhookIdempotencyClaimResult = "claimed"|"duplicate";
export interface WebhookIdempotencyRecord { provider:PaymentProviderCode; eventId:string; status:"claimed"|"processed"; result?:PaymentWebhookProcessStatus; claimedAt:string; processedAt?:string; }
export interface WebhookIdempotencyStore { claim(provider:PaymentProviderCode, eventId:string):WebhookIdempotencyClaimResult; markProcessed(provider:PaymentProviderCode, eventId:string, result:PaymentWebhookProcessStatus):void; release?(provider:PaymentProviderCode, eventId:string):void; list?():WebhookIdempotencyRecord[]; }

const PAYMENT_WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
let state:PaymentProviderState = { checkoutSessions:[], processedWebhookEventIds:[], auditLogs:[], receiptNotifications:[], providerReferences:[], webhookIdempotencyRecords:[] };

/** Mock/test-only idempotency store. Production must use durable DB storage with a unique provider + event id constraint and a transaction around claim + side effects. */
export class InMemoryWebhookIdempotencyStore implements WebhookIdempotencyStore {
  constructor(private readonly records:WebhookIdempotencyRecord[] = []) {}
  claim(provider:PaymentProviderCode, eventId:string):WebhookIdempotencyClaimResult {
    if (this.records.some((record)=>record.provider===provider && record.eventId===eventId)) return "duplicate";
    this.records.push({ provider, eventId, status:"claimed", claimedAt:new Date().toISOString() });
    return "claimed";
  }
  markProcessed(provider:PaymentProviderCode, eventId:string, result:PaymentWebhookProcessStatus):void {
    const record = this.records.find((item)=>item.provider===provider && item.eventId===eventId);
    if (!record) return;
    record.status = "processed";
    record.result = result;
    record.processedAt = new Date().toISOString();
  }
  release(provider:PaymentProviderCode, eventId:string):void {
    const index = this.records.findIndex((record)=>record.provider===provider && record.eventId===eventId && record.status==="claimed");
    if (index >= 0) this.records.splice(index, 1);
  }
  list():WebhookIdempotencyRecord[] { return structuredClone(this.records); }
}

let webhookIdempotencyStore:WebhookIdempotencyStore = new InMemoryWebhookIdempotencyStore(state.webhookIdempotencyRecords);

export class MockPaymentProvider implements PaymentProvider {
  readonly provider = "mock" as const;
  readonly checkoutRequests:CreateCheckoutInput[] = [];
  networkCallCount = 0;
  private nextSessionNumber = 1;

  constructor(private readonly config:{ webhookSecret:string; now?:()=>Date }) {}

  async createCheckoutSession(input:CreateCheckoutInput):Promise<CheckoutSession> {
    this.checkoutRequests.push(structuredClone(input));
    const id = `mock_checkout_${this.nextSessionNumber++}`;
    return { id, provider:this.provider, checkoutUrl:`https://payments.example.test/checkout/${id}`, userId:input.userId, planCode:input.planCode, providerCustomerId:input.providerCustomerId, providerSubscriptionId:input.providerSubscriptionId, amount:input.amount, currency:input.currency, createdAt:(this.config.now?.() ?? new Date()).toISOString(), status:"created" };
  }

  async verifyWebhook(headers:Headers, rawBody:string):Promise<boolean> {
    return verifySignedPaymentWebhook(headers, rawBody, this.config.webhookSecret);
  }

  async parseWebhook(_headers:Headers, rawBody:string):Promise<PaymentWebhookEvent> {
    return parsePaymentWebhookBody(rawBody);
  }
}

export class HttpPaymentProvider implements PaymentProvider {
  readonly provider = "http" as const;

  constructor(private readonly config:{ checkoutEndpoint?:string; apiKey?:string; webhookSecret?:string; fetcher?:typeof fetch } = {}) {}

  async createCheckoutSession(input:CreateCheckoutInput):Promise<CheckoutSession> {
    const checkoutEndpoint = this.config.checkoutEndpoint ?? process.env.PAYMENT_PROVIDER_CHECKOUT_ENDPOINT;
    const apiKey = this.config.apiKey ?? process.env.PAYMENT_PROVIDER_API_KEY;
    if (!checkoutEndpoint?.trim() || !apiKey?.trim()) throw new Error("PAYMENT_PROVIDER_CHECKOUT_ENDPOINT and PAYMENT_PROVIDER_API_KEY are required.");
    const fetcher = this.config.fetcher ?? fetch;
    const response = await fetcher(checkoutEndpoint, {
      method:"POST",
      headers:{ authorization:`Bearer ${apiKey}`, "content-type":"application/json" },
      body:JSON.stringify({ userId:input.userId, planCode:input.planCode, successUrl:input.successUrl, cancelUrl:input.cancelUrl, currentPeriodStart:input.currentPeriodStart, currentPeriodEnd:input.currentPeriodEnd, providerCustomerId:input.providerCustomerId, providerSubscriptionId:input.providerSubscriptionId, amount:input.amount, currency:input.currency }),
    });
    if (!response.ok) throw new Error(`Payment provider checkout failed with status ${response.status}.`);
    const body = await response.json() as { id?:unknown; checkoutUrl?:unknown; providerCustomerId?:unknown; providerSubscriptionId?:unknown };
    if (typeof body.id !== "string" || typeof body.checkoutUrl !== "string") throw new Error("Payment provider checkout response is invalid.");
    return { id:body.id, provider:this.provider, checkoutUrl:body.checkoutUrl, userId:input.userId, planCode:input.planCode, providerCustomerId:typeof body.providerCustomerId==="string"?body.providerCustomerId:input.providerCustomerId, providerSubscriptionId:typeof body.providerSubscriptionId==="string"?body.providerSubscriptionId:input.providerSubscriptionId, amount:input.amount, currency:input.currency, createdAt:new Date().toISOString(), status:"created" };
  }

  async verifyWebhook(headers:Headers, rawBody:string):Promise<boolean> {
    const secret = this.config.webhookSecret ?? process.env.PAYMENT_WEBHOOK_SECRET;
    return verifySignedPaymentWebhook(headers, rawBody, secret);
  }

  async parseWebhook(_headers:Headers, rawBody:string):Promise<PaymentWebhookEvent> {
    return parsePaymentWebhookBody(rawBody);
  }
}

export function resetMockPaymentProviderState():void { state = { checkoutSessions:[], processedWebhookEventIds:[], auditLogs:[], receiptNotifications:[], providerReferences:[], webhookIdempotencyRecords:[] }; webhookIdempotencyStore = new InMemoryWebhookIdempotencyStore(state.webhookIdempotencyRecords); }
export function getMockPaymentProviderState():PaymentProviderState { return structuredClone(state); }

export async function createPaymentCheckoutSession(provider:PaymentProvider, input:CreateCheckoutInput):Promise<CheckoutSession> {
  const checkout = await provider.createCheckoutSession(input);
  state.checkoutSessions.push({ ...structuredClone(checkout), consumed:false });
  upsertProviderReference({ userId:input.userId, providerCustomerId:checkout.providerCustomerId, providerSubscriptionId:checkout.providerSubscriptionId, updatedAt:checkout.createdAt });
  writePaymentAudit("payment_checkout_session_created", checkout.id, new Date(checkout.createdAt), { provider:checkout.provider, planCode:checkout.planCode, providerCustomerId:checkout.providerCustomerId ?? "", providerSubscriptionId:checkout.providerSubscriptionId ?? "", amount:checkout.amount === undefined ? "" : String(checkout.amount), currency:checkout.currency ?? "" });
  return checkout;
}

export function recordClientCheckoutReturn(input:{ checkoutSessionId:string; status:string; now?:Date }):{ status:"ignored" } {
  writePaymentAudit("payment_client_return_ignored", input.checkoutSessionId, input.now ?? new Date(), { status:input.status });
  return { status:"ignored" };
}

export async function processPaymentWebhook(input:{ provider:PaymentProvider; headers:Headers; rawBody:string; receiptHook?:PaymentReceiptHook; idempotencyStore?:WebhookIdempotencyStore }):Promise<PaymentWebhookProcessResult> {
  const verified = await input.provider.verifyWebhook(input.headers, input.rawBody);
  if (!verified) {
    writePaymentAudit("payment_webhook_rejected", "payment_webhook", new Date(), { reason:"invalid_signature", provider:input.provider.provider });
    return { status:"rejected", reason:"invalid_signature" };
  }

  let event:PaymentWebhookEvent;
  try {
    event = await input.provider.parseWebhook(input.headers, input.rawBody);
  } catch {
    writePaymentAudit("payment_webhook_rejected", "payment_webhook", new Date(), { reason:"invalid_payload", provider:input.provider.provider });
    return { status:"rejected", reason:"invalid_payload" };
  }

  const idempotency = input.idempotencyStore ?? webhookIdempotencyStore;
  if (idempotency.claim(input.provider.provider, event.id) === "duplicate") {
    writePaymentAudit("payment_webhook_duplicate", event.id, parsePaymentEventDate(event.occurredAt) ?? new Date(), { eventType:event.type, provider:input.provider.provider });
    return { status:"duplicate", event:structuredClone(event) };
  }

  const now = parsePaymentEventDate(event.occurredAt) ?? new Date();
  const verifiedCheckout = verifyCheckoutCompletion(input.provider.provider, event, now);
  if (verifiedCheckout.status === "rejected") {
    idempotency.markProcessed(input.provider.provider, event.id, "rejected");
    rememberProcessedWebhook(input.provider.provider, event.id);
    writePaymentAudit("payment_webhook_rejected", event.id, now, { eventType:event.type, provider:input.provider.provider, reason:verifiedCheckout.reason });
    return { status:"rejected", reason:verifiedCheckout.reason, event:structuredClone(event) };
  }
  if (verifiedCheckout.status === "duplicate") {
    idempotency.markProcessed(input.provider.provider, event.id, "duplicate");
    rememberProcessedWebhook(input.provider.provider, event.id);
    writePaymentAudit("payment_webhook_duplicate", event.id, now, { eventType:event.type, provider:input.provider.provider, reason:verifiedCheckout.reason });
    return { status:"duplicate", reason:verifiedCheckout.reason, event:structuredClone(event) };
  }
  if (verifiedCheckout.event) event = verifiedCheckout.event;

  const subscriptionEvent = toSubscriptionLifecycleEvent(event);
  const subscriptionResult = subscriptionEvent ? await processMockSubscriptionWebhook(subscriptionEvent) : undefined;
  if (subscriptionResult?.status === "ignored_retryable") {
    idempotency.release?.(input.provider.provider, event.id);
    writePaymentAudit("payment_webhook_ignored", event.id, now, { eventType:event.type, provider:input.provider.provider, reason:subscriptionResult.reason ?? "ignored_retryable" });
    return { status:"ignored_retryable", reason:subscriptionResult.reason, event:structuredClone(event), subscriptionResult };
  }
  const receiptNotification = shouldSendReceipt(event) && input.receiptHook ? await sendPaymentReceipt(input.receiptHook, event) : undefined;
  if (receiptNotification) state.receiptNotifications.push(receiptNotification);
  upsertProviderReference({ userId:event.userId, providerCustomerId:event.providerCustomerId, providerSubscriptionId:event.providerSubscriptionId, providerPaymentId:event.providerPaymentId, updatedAt:now.toISOString() });
  idempotency.markProcessed(input.provider.provider, event.id, "processed");
  rememberProcessedWebhook(input.provider.provider, event.id);
  writePaymentAudit("payment_webhook_processed", event.id, now, { eventType:event.type, provider:input.provider.provider, providerCustomerId:event.providerCustomerId ?? "", providerSubscriptionId:event.providerSubscriptionId ?? "", providerPaymentId:event.providerPaymentId ?? "", subscriptionResult:subscriptionResult?.status ?? "" });
  return { status:"processed", event:structuredClone(event), subscriptionResult, receiptNotification };
}

export function createPaymentWebhookSignature(input:{ timestamp:number; body:string; secret:string }):string {
  return hmac(`${input.timestamp}.${input.body}`, input.secret);
}

function rememberProcessedWebhook(provider:PaymentProviderCode, eventId:string):void {
  const idempotencyKey = `${provider}:${eventId}`;
  if (!state.processedWebhookEventIds.includes(idempotencyKey)) state.processedWebhookEventIds.push(idempotencyKey);
}

function verifyCheckoutCompletion(provider:PaymentProviderCode, event:PaymentWebhookEvent, now:Date):{ status:"ok"; event?:PaymentWebhookEvent }|{ status:"duplicate"; reason:string }|{ status:"rejected"; reason:string } {
  if (event.type !== "checkout.session.completed") return { status:"ok" };
  if (!event.providerCheckoutSessionId) return { status:"rejected", reason:"missing_checkout_session" };
  const checkout = state.checkoutSessions.find((item)=>item.provider===provider && item.id===event.providerCheckoutSessionId);
  if (!checkout) {
    const checkoutWithSameId = state.checkoutSessions.find((item)=>item.id===event.providerCheckoutSessionId);
    return { status:"rejected", reason:checkoutWithSameId ? "provider_mismatch" : "unknown_checkout_session" };
  }
  if (event.userId !== checkout.userId) return { status:"rejected", reason:"checkout_user_mismatch" };
  if (event.planCode && event.planCode !== checkout.planCode) return { status:"rejected", reason:"checkout_plan_mismatch" };
  if (checkout.consumed) return { status:"duplicate", reason:"checkout_already_completed" };
  checkout.status = "completed";
  checkout.consumed = true;
  checkout.completedAt = now.toISOString();
  checkout.consumedAt = now.toISOString();
  return { status:"ok", event:{ ...event, userId:checkout.userId, planCode:checkout.planCode, providerCustomerId:event.providerCustomerId ?? checkout.providerCustomerId, providerSubscriptionId:event.providerSubscriptionId ?? checkout.providerSubscriptionId, currentPeriodStart:event.currentPeriodStart, currentPeriodEnd:event.currentPeriodEnd } };
}

function toSubscriptionLifecycleEvent(event:PaymentWebhookEvent):MockSubscriptionWebhookEvent|undefined {
  const subscriptionId = event.providerSubscriptionId;
  if (!subscriptionId) return undefined;
  if (event.type === "checkout.session.completed" || event.type === "subscription.created") return lifecycleEvent(event, "subscription.created", { status:"active" });
  if (event.type === "subscription.renewed") return lifecycleEvent(event, "subscription.renewed");
  if (event.type === "payment.failed" || event.type === "subscription.renewal_failed") return lifecycleEvent(event, "subscription.renewal_failed");
  if (event.type === "subscription.canceled") return lifecycleEvent(event, "subscription.canceled", { cancelAtPeriodEnd:event.cancelAtPeriodEnd ?? false });
  if (event.type === "subscription.expired") return lifecycleEvent(event, "subscription.expired");
  return undefined;
}

function lifecycleEvent(event:PaymentWebhookEvent, type:MockSubscriptionWebhookEvent["type"], overrides:Partial<MockSubscriptionWebhookEvent> = {}):MockSubscriptionWebhookEvent {
  return { id:`payment:${event.id}`, type, subscriptionId:event.providerSubscriptionId ?? "", userId:event.userId, planCode:event.planCode, currentPeriodStart:event.currentPeriodStart, currentPeriodEnd:event.currentPeriodEnd, occurredAt:event.occurredAt, ...overrides };
}

function shouldSendReceipt(event:PaymentWebhookEvent):boolean { return event.type === "payment.succeeded" || event.type === "checkout.session.completed"; }
async function sendPaymentReceipt(hook:PaymentReceiptHook, event:PaymentWebhookEvent):Promise<EmailDeliveryResult> {
  return hook.emailGateway.send(hook.emailAccount, renderTransactionalEmailTemplate("payment_receipt", { receiptId:event.receiptId ?? event.providerPaymentId ?? event.id }));
}

function parsePaymentWebhookBody(rawBody:string):PaymentWebhookEvent {
  const body = JSON.parse(rawBody) as Record<string, unknown>;
  if (!isPaymentWebhookEventType(body.type) || typeof body.id !== "string" || typeof body.userId !== "string" || typeof body.occurredAt !== "string") throw new Error("Invalid payment webhook event.");
  const event:PaymentWebhookEvent = { id:body.id, type:body.type, userId:body.userId, occurredAt:body.occurredAt };
  if (isPlanCode(body.planCode)) event.planCode = body.planCode;
  if (typeof body.providerCustomerId === "string") event.providerCustomerId = body.providerCustomerId;
  if (typeof body.providerSubscriptionId === "string") event.providerSubscriptionId = body.providerSubscriptionId;
  if (typeof body.providerPaymentId === "string") event.providerPaymentId = body.providerPaymentId;
  if (typeof body.providerCheckoutSessionId === "string") event.providerCheckoutSessionId = body.providerCheckoutSessionId;
  if (typeof body.currentPeriodStart === "string") event.currentPeriodStart = body.currentPeriodStart;
  if (typeof body.currentPeriodEnd === "string") event.currentPeriodEnd = body.currentPeriodEnd;
  if (typeof body.cancelAtPeriodEnd === "boolean") event.cancelAtPeriodEnd = body.cancelAtPeriodEnd;
  if (typeof body.receiptId === "string") event.receiptId = body.receiptId;
  return event;
}

function verifySignedPaymentWebhook(headers:Headers, rawBody:string, secret:string|undefined):boolean {
  if (!secret?.trim()) return false;
  const timestamp = headers.get("x-payment-timestamp");
  const signature = headers.get("x-payment-signature");
  if (!timestamp || !signature) return false;
  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs)) return false;
  if (Math.abs(Date.now() - timestampMs) > PAYMENT_WEBHOOK_TIMESTAMP_TOLERANCE_MS) return false;
  return constantTimeEqual(signature, hmac(`${timestamp}.${rawBody}`, secret));
}

function upsertProviderReference(reference:PaymentProviderReference):void {
  const index = state.providerReferences.findIndex((item)=>item.userId===reference.userId);
  if (index >= 0) state.providerReferences[index] = { ...state.providerReferences[index], ...removeEmptyProviderRefs(reference) };
  else state.providerReferences.push(removeEmptyProviderRefs(reference));
}

function removeEmptyProviderRefs(reference:PaymentProviderReference):PaymentProviderReference {
  return Object.fromEntries(Object.entries(reference).filter(([,value])=>value !== undefined && value !== "")) as PaymentProviderReference;
}

function writePaymentAudit(action:PaymentAuditLogEntry["action"], targetId:string, now:Date, metadata:Record<string,string>):void {
  state.auditLogs.push({ action, targetId, createdAt:now.toISOString(), metadata:sanitizePaymentAuditMetadata(metadata) });
}

function sanitizePaymentAuditMetadata(metadata:Record<string,string>):Record<string,string> {
  return Object.fromEntries(Object.entries(metadata).filter(([key,value])=>!isSensitivePaymentLogKey(key)&&!isSensitivePaymentLogValue(value)));
}

function isSensitivePaymentLogKey(key:string):boolean {
  const normalized = key.toLowerCase();
  return ["card","pan","cvc","cvv","secret","token","authorization","raw","payload","body","email","name","phone"].some((blocked)=>normalized.includes(blocked));
}

function isSensitivePaymentLogValue(value:string):boolean {
  const normalized = value.toLowerCase();
  return value.includes("@") || normalized.includes("secret") || normalized.includes("bearer ") || /\b\d{12,19}\b/.test(value);
}

function isPaymentWebhookEventType(value:unknown):value is PaymentWebhookEventType {
  return value === "checkout.session.created" || value === "checkout.session.completed" || value === "payment.succeeded" || value === "payment.failed" || value === "subscription.created" || value === "subscription.renewed" || value === "subscription.renewal_failed" || value === "subscription.canceled" || value === "subscription.expired" || value === "refund.created" || value === "refund.succeeded";
}

function isPlanCode(value:unknown):value is PlanCode { return value === "free" || value === "basic" || value === "premium"; }
function parsePaymentEventDate(value:string):Date|undefined { const ms=Date.parse(value); return Number.isFinite(ms) ? new Date(ms) : undefined; }
function hmac(value:string, secret:string):string { return createHmac("sha256", secret).update(value).digest("base64url"); }
function constantTimeEqual(a:string,b:string):boolean { const left=Buffer.from(a); const right=Buffer.from(b); return left.length===right.length && timingSafeEqual(left,right); }
