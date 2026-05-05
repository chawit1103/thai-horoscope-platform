import { EmailGateway, type EmailChannelAccount, type EmailDeliveryResult, type EmailMessage } from "./email-gateway";

export type PlanCode = "free"|"basic"|"premium";
export type PeriodType = "daily"|"weekly"|"monthly"|"yearly";
export type SubscriptionStatus = "trialing"|"active"|"past_due"|"canceled"|"expired";
export type MockSubscriptionWebhookEventType = "subscription.created"|"subscription.renewed"|"subscription.renewal_failed"|"subscription.canceled"|"subscription.expired"|"subscription.reactivated";
export interface SubscriptionRecord { id:string; userId:string; planCode:PlanCode; status:SubscriptionStatus; currentPeriodStart:string; currentPeriodEnd:string; cancelAtPeriodEnd:boolean; canceledAt?:string; expiredAt?:string; updatedAt:string; }
export interface SubscriptionAuditLogEntry { action:"subscription_status_changed"|"subscription_webhook_ignored"; targetId:string; createdAt:string; metadata:Record<string,string>; }
export interface MockSubscriptionWebhookEvent { id:string; type:MockSubscriptionWebhookEventType; subscriptionId:string; userId:string; planCode?:PlanCode; status?:Extract<SubscriptionStatus,"trialing"|"active">; currentPeriodStart?:string; currentPeriodEnd?:string; cancelAtPeriodEnd?:boolean; occurredAt?:string; }
export interface SubscriptionWebhookResult { status:"applied"|"duplicate"|"ignored_retryable"|"rejected_terminal"; reason?:string; subscription?:SubscriptionRecord; notification?:EmailDeliveryResult; }
export interface MockSubscriptionState { subscriptions:SubscriptionRecord[]; processedWebhookEventIds:string[]; auditLogs:SubscriptionAuditLogEntry[]; notificationResults:EmailDeliveryResult[]; }
export interface SubscriptionNotificationHook { emailGateway:EmailGateway; emailAccount:EmailChannelAccount; }

const planEntitlements: Record<PlanCode, PeriodType[]> = { free:["daily"], basic:["daily","weekly"], premium:["daily","weekly","monthly","yearly"] };
let state: MockSubscriptionState = { subscriptions:[], processedWebhookEventIds:[], auditLogs:[], notificationResults:[] };

export function resetMockSubscriptionState():void { state = { subscriptions:[], processedWebhookEventIds:[], auditLogs:[], notificationResults:[] }; }
export function getMockSubscriptionState():MockSubscriptionState { return structuredClone(state); }

export function canAccessPeriod(input:{ subscription?:SubscriptionRecord; planCode?:PlanCode; periodType:PeriodType; now?:Date }):boolean {
  const planCode = input.subscription?.planCode ?? input.planCode ?? "free";
  if (!planEntitlements[planCode].includes(input.periodType)) return false;
  if (!input.subscription) return planCode === "free";
  return subscriptionGrantsEntitlement(input.subscription, input.now ?? new Date());
}

export function subscriptionGrantsEntitlement(subscription:SubscriptionRecord, now=new Date()):boolean {
  const periodStart = Date.parse(subscription.currentPeriodStart);
  const periodEnd = Date.parse(subscription.currentPeriodEnd);
  const nowMs = now.getTime();
  if (!Number.isFinite(periodStart) || !Number.isFinite(periodEnd) || nowMs < periodStart || nowMs >= periodEnd) return false;
  if (subscription.status === "active" || subscription.status === "trialing") return true;
  if (subscription.status === "canceled") return subscription.cancelAtPeriodEnd;
  return false;
}

export async function processMockSubscriptionWebhook(event:MockSubscriptionWebhookEvent, notificationHook?:SubscriptionNotificationHook):Promise<SubscriptionWebhookResult> {
  if (state.processedWebhookEventIds.includes(event.id)) return { status:"duplicate", subscription:findSubscription(event.subscriptionId) };
  const now = parseEventDate(event.occurredAt) ?? new Date();
  const existing = findSubscription(event.subscriptionId);
  const next = buildNextSubscription(existing, event, now);
  if (!next.subscription) {
    if (next.status === "rejected_terminal") state.processedWebhookEventIds.push(event.id);
    writeSubscriptionAudit("subscription_webhook_ignored", event.subscriptionId, now, { eventType:event.type, reason:next.reason });
    return { status:next.status, reason:next.reason, subscription:existing ? structuredClone(existing) : undefined };
  }
  upsertSubscription(next.subscription);
  state.processedWebhookEventIds.push(event.id);
  writeSubscriptionAudit("subscription_status_changed", next.subscription.id, now, { eventType:event.type, status:next.subscription.status, planCode:next.subscription.planCode });
  const notification = notificationHook ? await sendSubscriptionNotification(notificationHook, next.subscription, event) : undefined;
  if (notification) state.notificationResults.push(notification);
  return { status:"applied", subscription:structuredClone(next.subscription), notification };
}

function buildNextSubscription(existing:SubscriptionRecord|undefined, event:MockSubscriptionWebhookEvent, now:Date):{status:"applied"; subscription:SubscriptionRecord}|{status:"ignored_retryable"|"rejected_terminal"; reason:string; subscription?:undefined} {
  const start = event.currentPeriodStart ?? existing?.currentPeriodStart;
  const end = event.currentPeriodEnd ?? existing?.currentPeriodEnd;
  if (!start || !end || !validPeriod(start, end)) return { status:"rejected_terminal", reason:"invalid_period" };
  if (event.type !== "subscription.created" && !existing) return { status:"ignored_retryable", reason:"missing_prerequisite_subscription" };
  if (event.type === "subscription.created") {
    if (existing) return { status:"rejected_terminal", reason:"already_exists" };
    const status = event.status ?? "active";
    return { status:"applied", subscription:baseSubscription(event, status, start, end, now) };
  }
  if (!existing || existing.userId !== event.userId || existing.status === "expired" && event.type !== "subscription.reactivated") return { status:"rejected_terminal", reason:"invalid_transition" };
  if (isStaleSubscriptionEvent(existing, event, now)) return { status:"ignored_retryable", reason:"ignored_stale" };
  if (event.type === "subscription.renewed") {
    if (existing.status === "canceled" && !existing.cancelAtPeriodEnd) return { status:"rejected_terminal", reason:"invalid_transition" };
    if (Date.parse(end) <= Date.parse(existing.currentPeriodEnd)) return { status:"rejected_terminal", reason:"stale_period" };
    return { status:"applied", subscription:{ ...existing, status:"active", currentPeriodStart:start, currentPeriodEnd:end, cancelAtPeriodEnd:false, canceledAt:undefined, expiredAt:undefined, updatedAt:now.toISOString() } };
  }
  if (event.type === "subscription.renewal_failed") {
    if (existing.status !== "active" && existing.status !== "trialing") return { status:"rejected_terminal", reason:"invalid_transition" };
    if (isStaleRenewalFailedEvent(existing, event)) return { status:"ignored_retryable", reason:"ignored_stale" };
    return { status:"applied", subscription:{ ...existing, status:"past_due", cancelAtPeriodEnd:false, updatedAt:now.toISOString() } };
  }
  if (event.type === "subscription.canceled") {
    const cancelAtPeriodEnd = event.cancelAtPeriodEnd ?? false;
    return { status:"applied", subscription:{ ...existing, status:"canceled", cancelAtPeriodEnd, canceledAt:now.toISOString(), updatedAt:now.toISOString() } };
  }
  if (event.type === "subscription.expired") return { status:"applied", subscription:{ ...existing, status:"expired", cancelAtPeriodEnd:false, expiredAt:now.toISOString(), updatedAt:now.toISOString() } };
  if (event.type === "subscription.reactivated") {
    if (!event.currentPeriodStart || !event.currentPeriodEnd) return { status:"rejected_terminal", reason:"invalid_period" };
    if (existing.status !== "canceled" && existing.status !== "expired") return { status:"rejected_terminal", reason:"invalid_transition" };
    return { status:"applied", subscription:{ ...existing, status:"active", planCode:existing.planCode, currentPeriodStart:start, currentPeriodEnd:end, cancelAtPeriodEnd:false, canceledAt:undefined, expiredAt:undefined, updatedAt:now.toISOString() } };
  }
  return { status:"rejected_terminal", reason:"invalid_transition" };
}

function baseSubscription(event:MockSubscriptionWebhookEvent, status:Extract<SubscriptionStatus,"trialing"|"active">, start:string, end:string, now:Date):SubscriptionRecord {
  return { id:event.subscriptionId, userId:event.userId, planCode:event.planCode ?? "free", status, currentPeriodStart:start, currentPeriodEnd:end, cancelAtPeriodEnd:false, updatedAt:now.toISOString() };
}

async function sendSubscriptionNotification(hook:SubscriptionNotificationHook, subscription:SubscriptionRecord, event:MockSubscriptionWebhookEvent):Promise<EmailDeliveryResult> {
  const message:EmailMessage = { topicCode:"account_security", subject:"Subscription status updated", text:`Subscription status changed to ${subscription.status}.`, html:`<p>Subscription status changed to ${subscription.status}.</p>`, transactional:true, metadata:{ eventType:event.type } };
  return hook.emailGateway.send(hook.emailAccount, message);
}

function findSubscription(subscriptionId:string):SubscriptionRecord|undefined { return state.subscriptions.find((subscription)=>subscription.id===subscriptionId); }
function upsertSubscription(subscription:SubscriptionRecord):void { const index=state.subscriptions.findIndex((existing)=>existing.id===subscription.id); if(index>=0) state.subscriptions[index]=subscription; else state.subscriptions.push(subscription); }
function validPeriod(start:string,end:string):boolean { const startMs=Date.parse(start); const endMs=Date.parse(end); return Number.isFinite(startMs)&&Number.isFinite(endMs)&&endMs>startMs; }
function parseEventDate(value:string|undefined):Date|undefined { if(!value) return undefined; const ms=Date.parse(value); return Number.isFinite(ms) ? new Date(ms) : undefined; }
function isStaleSubscriptionEvent(existing:SubscriptionRecord, event:MockSubscriptionWebhookEvent, now:Date):boolean {
  const eventMs = (parseEventDate(event.occurredAt) ?? now).getTime();
  const updatedMs = Date.parse(existing.updatedAt);
  if (Number.isFinite(updatedMs) && eventMs < updatedMs) return true;
  if (event.type === "subscription.canceled" || event.type === "subscription.expired") {
    const currentPeriodStartMs = Date.parse(existing.currentPeriodStart);
    if (Number.isFinite(currentPeriodStartMs) && eventMs < currentPeriodStartMs) return true;
  }
  return false;
}
function isStaleRenewalFailedEvent(existing:SubscriptionRecord, event:MockSubscriptionWebhookEvent):boolean {
  const failedStart = event.currentPeriodStart ? Date.parse(event.currentPeriodStart) : Number.NaN;
  const failedEnd = event.currentPeriodEnd ? Date.parse(event.currentPeriodEnd) : Number.NaN;
  const currentStart = Date.parse(existing.currentPeriodStart);
  const currentEnd = Date.parse(existing.currentPeriodEnd);
  if (Number.isFinite(failedStart) && Number.isFinite(currentStart) && failedStart < currentStart) return true;
  if (Number.isFinite(failedEnd) && Number.isFinite(currentEnd) && failedEnd < currentEnd) return true;
  return false;
}
function writeSubscriptionAudit(action:SubscriptionAuditLogEntry["action"], targetId:string, now:Date, metadata:Record<string,string>):void { state.auditLogs.push({ action, targetId, createdAt:now.toISOString(), metadata:sanitizeSubscriptionAuditMetadata(metadata) }); }
function sanitizeSubscriptionAuditMetadata(metadata:Record<string,string>):Record<string,string> { const blocked=new Set(["email","name","phone","card","lineUserId","userId","rawPayload","body"]); return Object.fromEntries(Object.entries(metadata).filter(([key,value])=>!blocked.has(key)&&!value.includes("@")&&!value.toLowerCase().includes("secret"))); }
