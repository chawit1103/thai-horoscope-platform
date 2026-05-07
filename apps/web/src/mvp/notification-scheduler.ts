import { createHash } from "node:crypto";
import { CONTENT_PREVIEW_APPROVAL_SESSION_ID, ensureContentPreviewBatch, getContentPreviewApprovalForResult } from "./content-preview-approval";
import { EmailGateway, type EmailChannelAccount, type EmailDeliveryResult, type EmailMessage } from "./email-gateway";
import { generateHoroscopeDeliveryPayload, horoscopeContentToEmailMessage, horoscopeContentToLineMessage, type HoroscopeDeliveryPayload } from "./horoscope-delivery-integration";
import { type HoroscopeContentOutput } from "./horoscope-content-engine";
import { LineGateway, type LineChannelAccount, type LineDeliveryResult, type LineMessage } from "./line-gateway";
import { canAccessPeriod, type PeriodType as SubscriptionPeriodType, type PlanCode, type SubscriptionRecord } from "./subscription-lifecycle";
import { getMockMvpState, type HoroscopeResult, type PeriodType } from "./mock-flow";

export type NotificationTopic = "daily_horoscope"|"weekly_horoscope"|"monthly_horoscope"|"yearly_horoscope";
export type NotificationChannel = "line"|"email";
export type NotificationQueueStatus = "queued"|"skipped"|"in_progress"|"sent"|"failed"|"suppressed"|"duplicate"|"fallback_sent"|"deferred";
export interface NotificationPreference { topicCode:NotificationTopic|"all"; channel:NotificationChannel; enabled:boolean; allowFallback?:boolean; }
export interface QuietHours { start:string; end:string; }
export interface NotificationSchedulerUser {
  userId:string;
  timezone:string;
  preferredNotificationTime:string;
  quietHours?:QuietHours;
  active?:boolean;
  accountDeleted?:boolean;
  planCode?:PlanCode;
  subscription?:SubscriptionRecord;
  primaryChannel:NotificationChannel;
  fallbackChannel?:NotificationChannel;
  preferences?:NotificationPreference[];
  lineAccount?:LineChannelAccount;
  emailAccount?:EmailChannelAccount;
}
export interface ScheduledNotificationMessage {
  id:string;
  userId:string;
  topicCode:NotificationTopic;
  periodType:PeriodType;
  periodKey:string;
  queueKey:string;
  horoscopeResultId:string;
  birthProfileId:string;
  chartSnapshotId:string;
  channel:NotificationChannel;
  fallbackChannel?:NotificationChannel;
  allowFallback:boolean;
  title:string;
  body:string;
  horoscopeContent?:HoroscopeContentOutput;
  deliveryMetadata?:Record<string,string>;
  status:NotificationQueueStatus;
  createdAt:string;
}
export interface NotificationDeliveryAttempt { id:string; outboundMessageId:string; channel:NotificationChannel; status:NotificationQueueStatus; attemptedAt:string; providerMessageId?:string; errorCode?:string; fallback:boolean; }
export interface NotificationSchedulerAuditLogEntry { action:"notification_queued"|"notification_skipped"|"notification_deferred"|"notification_delivery_attempted"|"notification_duplicate"; targetId:string; createdAt:string; metadata:Record<string,string>; }
export interface NotificationSchedulerState { outboundMessages:ScheduledNotificationMessage[]; deliveryAttempts:NotificationDeliveryAttempt[]; auditLogs:NotificationSchedulerAuditLogEntry[]; nextOutboundSeq:number; nextAttemptSeq:number; }
export interface SchedulerRunResult { queued:ScheduledNotificationMessage[]; skipped:number; deferred:number; duplicates:number; }
export interface DispatchResult { attempts:NotificationDeliveryAttempt[]; sent:number; suppressed:number; duplicates:number; fallbackSent:number; }

const topicPeriodTypes:Record<NotificationTopic,PeriodType> = { daily_horoscope:"daily", weekly_horoscope:"weekly", monthly_horoscope:"monthly", yearly_horoscope:"yearly" };
const allTopics:NotificationTopic[] = ["daily_horoscope","weekly_horoscope","monthly_horoscope","yearly_horoscope"];
let state:NotificationSchedulerState = { outboundMessages:[], deliveryAttempts:[], auditLogs:[], nextOutboundSeq:1, nextAttemptSeq:1 };

export function resetNotificationSchedulerState():void { state = { outboundMessages:[], deliveryAttempts:[], auditLogs:[], nextOutboundSeq:1, nextAttemptSeq:1 }; }
export function getNotificationSchedulerState():NotificationSchedulerState { return structuredClone(state); }

export function runNotificationSchedulerJob(input:{ sessionId?:string; users:NotificationSchedulerUser[]; topics?:NotificationTopic[]; now?:Date; dispatchWindowMinutes?:number; betaApprovalMode?:boolean }):SchedulerRunResult {
  const sessionId = input.sessionId ?? "dev-default";
  const now = input.now ?? new Date();
  const topics = input.topics ?? allTopics;
  const dispatchWindowMinutes = input.dispatchWindowMinutes ?? 15;
  const queued:ScheduledNotificationMessage[] = [];
  let skipped = 0;
  let deferred = 0;
  let duplicates = 0;
  const mockState = getMockMvpState(sessionId);

  for (const user of input.users) {
    for (const topicCode of topics) {
      const periodType = topicPeriodTypes[topicCode];
      const periodKey = getNotificationPeriodKey(topicCode, now, user.timezone);
      const eligibility = getQueueEligibility({ user, topicCode, periodType, periodKey, now, dispatchWindowMinutes, sessionId });
      if (eligibility.status === "deferred") {
        deferred += 1;
        writeAudit("notification_deferred", auditTarget(user.userId, topicCode, periodKey), now, { topicCode, periodKey, reason:eligibility.reason });
        continue;
      }
      if (eligibility.status === "skipped") {
        skipped += 1;
        writeAudit("notification_skipped", auditTarget(user.userId, topicCode, periodKey), now, { topicCode, periodKey, reason:eligibility.reason });
        continue;
      }

      const result = findApprovedHoroscope(mockState, user.userId, periodType, periodKey);
      if (!result) {
        skipped += 1;
        writeAudit("notification_skipped", auditTarget(user.userId, topicCode, periodKey), now, { topicCode, periodKey, reason:"missing_active_horoscope_artifact" });
        continue;
      }
      const chartSnapshot = mockState.chartSnapshots.find((snapshot)=>snapshot.id===result.chartSnapshotId&&snapshot.userId===user.userId&&snapshot.birthProfileId===result.birthProfileId);
      if (!chartSnapshot) {
        skipped += 1;
        writeAudit("notification_skipped", auditTarget(user.userId, topicCode, periodKey), now, { topicCode, periodKey, reason:"missing_chart_snapshot" });
        continue;
      }
      const deliveryPayload = buildDeliveryPayload(result, topicCode, chartSnapshot);
      if (!deliveryPayload) {
        skipped += 1;
        writeAudit("notification_skipped", auditTarget(user.userId, topicCode, periodKey), now, { topicCode, periodKey, reason:"unsafe_horoscope_content" });
        continue;
      }

      const channel = user.primaryChannel;
      if (!isChannelPreferenceEnabled(user, topicCode, channel) || isChannelUnsubscribed(user, channel)) {
        skipped += 1;
        writeAudit("notification_skipped", auditTarget(user.userId, topicCode, periodKey), now, { topicCode, periodKey, reason:"channel_preference_disabled" });
        continue;
      }

      const approval = input.betaApprovalMode ? ensureContentPreviewBatch({
        sessionId:CONTENT_PREVIEW_APPROVAL_SESSION_ID,
        horoscopeResult:result,
        topicCode,
        deliveryPayload,
        deliveryChannels:getPreparedDeliveryChannels(user, topicCode),
        now,
      }) : undefined;
      const approvalDeferredReason = input.betaApprovalMode && approval?.approvalStatus !== "approved" ? "content_pending_approval" : undefined;

      const queueKey = makeQueueKey(user.userId, topicCode, periodKey);
      const existing = state.outboundMessages.find((message)=>message.queueKey===queueKey);
      if (input.betaApprovalMode && approval?.approvalStatus === "rejected") {
        if (existing) applyApprovalMetadata(existing, approval);
        skipped += 1;
        writeAudit("notification_skipped", auditTarget(user.userId, topicCode, periodKey), now, {
          topicCode,
          periodKey,
          reason:"content_rejected",
          previewBatchId:approval.batchId,
        });
        continue;
      }
      if (existing) {
        duplicates += 1;
        if (input.betaApprovalMode && isApprovalSuppressedMessage(existing)) {
          existing.status = "queued";
          writeAudit("notification_duplicate", existing.id, now, { topicCode, periodKey, queuePolicy:"reopened_beta_approval_hold" });
        }
        refreshQueuedDeliveryPreferences(existing, user, topicCode, now);
        if (input.betaApprovalMode) refreshQueuedHoroscopeContent(existing, result, deliveryPayload, now);
        if (approval) applyApprovalMetadata(existing, approval);
        if (approvalDeferredReason && !hasPendingApprovalAttempt(existing.id)) {
          deferred += 1;
          const attempt = recordAttempt(existing, existing.channel, "deferred", now, false, approvalDeferredReason);
          writeAudit("notification_deferred", existing.id, now, { topicCode, periodKey, reason:approvalDeferredReason, attemptId:attempt.id, previewBatchId:approval?.batchId ?? "" });
        }
        writeAudit("notification_duplicate", existing.id, now, { topicCode, periodKey, channel, queuePolicy:"user_topic_period" });
        continue;
      }

      const message:ScheduledNotificationMessage = {
        id:`notif_${state.nextOutboundSeq++}`,
        userId:user.userId,
        topicCode,
        periodType,
        periodKey,
        queueKey,
        horoscopeResultId:result.id,
        birthProfileId:result.birthProfileId,
        chartSnapshotId:result.chartSnapshotId,
        channel,
        fallbackChannel:user.fallbackChannel,
        allowFallback:isFallbackAllowed(user, topicCode),
        title:deliveryPayload.title,
        body:deliveryPayload.previewText,
        horoscopeContent:deliveryPayload.content,
        deliveryMetadata:{ ...deliveryPayload.metadata },
        status:"queued",
        createdAt:now.toISOString(),
      };
      if (approval) applyApprovalMetadata(message, approval);
      state.outboundMessages.push(message);
      queued.push(structuredClone(message));
      writeAudit("notification_queued", message.id, now, { topicCode, periodKey, channel, fallbackChannel:message.fallbackChannel ?? "" });
      if (approvalDeferredReason) {
        deferred += 1;
        const attempt = recordAttempt(message, channel, "deferred", now, false, approvalDeferredReason);
        writeAudit("notification_deferred", message.id, now, { topicCode, periodKey, reason:approvalDeferredReason, attemptId:attempt.id, previewBatchId:approval?.batchId ?? "" });
      }
      if ("deferredReason" in eligibility && eligibility.deferredReason) {
        deferred += 1;
        const attempt = recordAttempt(message, channel, "deferred", now, false, eligibility.deferredReason);
        writeAudit("notification_deferred", message.id, now, { topicCode, periodKey, reason:eligibility.deferredReason, attemptId:attempt.id });
      }
    }
  }

  return { queued, skipped, deferred, duplicates };
}

export async function dispatchQueuedNotifications(input:{ sessionId?:string; users:NotificationSchedulerUser[]; emailGateway?:EmailGateway; lineGateway?:LineGateway; now?:Date; betaApprovalMode?:boolean }):Promise<DispatchResult> {
  const sessionId = input.sessionId ?? "dev-default";
  const now = input.now ?? new Date();
  const attempts:NotificationDeliveryAttempt[] = [];
  let sent = 0;
  let suppressed = 0;
  let duplicates = 0;
  let fallbackSent = 0;

  for (const message of state.outboundMessages.filter((item)=>item.status==="queued")) {
    const user = input.users.find((item)=>item.userId===message.userId);
    if (!user || isUserInactive(getMockMvpState(sessionId), user) || !findActiveQueuedSourceArtifact(getMockMvpState(sessionId), message)) {
      const attempt = recordAttempt(message, message.channel, "suppressed", now, true, "user_or_source_artifact_inactive");
      attempts.push(attempt);
      message.status = "suppressed";
      suppressed += 1;
      continue;
    }

    if (hasSentAttempt(message.id)) {
      duplicates += 1;
      writeAudit("notification_duplicate", message.id, now, { topicCode:message.topicCode, periodKey:message.periodKey, channel:message.channel });
      continue;
    }

    if (input.betaApprovalMode || messageRequiresContentApproval(message)) {
      const approval = getContentPreviewApprovalForResult(CONTENT_PREVIEW_APPROVAL_SESSION_ID, message.horoscopeResultId);
      if (!approval || approval.approvalStatus === "rejected") {
        const attempt = recordAttempt(message, message.channel, "deferred", now, false, approval ? "content_rejected" : "content_approval_missing");
        attempts.push(attempt);
        continue;
      }
      if (approval.approvalStatus !== "approved") {
        const attempt = recordAttempt(message, message.channel, "deferred", now, false, "content_pending_approval");
        attempts.push(attempt);
        continue;
      }
      applyApprovalMetadata(message, approval);
    }

    const guard = getDispatchGuard(message, user, now);
    if (guard.status !== "allowed") {
      const attempt = recordAttempt(message, message.channel, guard.status, now, false, guard.reason);
      attempts.push(attempt);
      if (guard.status === "suppressed") {
        message.status = "suppressed";
        suppressed += 1;
      }
      continue;
    }

    const primary = await dispatchToChannel(message, message.channel, user, input.emailGateway, input.lineGateway, false, now);
    attempts.push(primary);
    if (primary.status === "duplicate") {
      duplicates += 1;
      continue;
    }
    if (primary.status === "sent") {
      message.status = "sent";
      sent += 1;
      continue;
    }

    const currentFallbackChannel = getCurrentFallbackChannel(user, message);
    let retryableFallbackFailure = false;
    if (currentFallbackChannel && isFallbackTrigger(primary)) {
      const fallback = await dispatchToChannel(message, currentFallbackChannel, user, input.emailGateway, input.lineGateway, true, now);
      attempts.push(fallback);
      if (fallback.status === "duplicate") {
        duplicates += 1;
        continue;
      }
      if (fallback.status === "sent") {
        message.status = "fallback_sent";
        fallbackSent += 1;
        continue;
      }
      if (fallback.status === "failed") retryableFallbackFailure = true;
    }

    if (primary.status === "failed" || retryableFallbackFailure) continue;
    message.status = "suppressed";
    suppressed += 1;
  }

  return { attempts, sent, suppressed, duplicates, fallbackSent };
}

export function getNotificationPeriodKey(topicCode:NotificationTopic, now:Date, timezone:string):string {
  const parts = getLocalDateTimeParts(now, timezone);
  if (topicCode === "daily_horoscope") return `${parts.year}-${parts.month}-${parts.day}`;
  if (topicCode === "weekly_horoscope") return isoWeekKey(parts.year, parts.month, parts.day);
  if (topicCode === "monthly_horoscope") return `${parts.year}-${parts.month}`;
  return parts.year;
}

function getQueueEligibility(input:{ user:NotificationSchedulerUser; topicCode:NotificationTopic; periodType:PeriodType; periodKey:string; now:Date; dispatchWindowMinutes:number; sessionId:string }):{status:"eligible"; deferredReason?:string}|{status:"skipped"|"deferred"; reason:string} {
  const mockState = getMockMvpState(input.sessionId);
  if (isUserInactive(mockState, input.user)) return { status:"skipped", reason:"user_inactive" };
  if (!canAccessPeriod({ subscription:input.user.subscription, planCode:input.user.planCode ?? "free", periodType:input.periodType as SubscriptionPeriodType, now:input.now })) return { status:"skipped", reason:"missing_entitlement" };
  const local = getLocalDateTimeParts(input.now, input.user.timezone);
  const localMinute = Number(local.hour) * 60 + Number(local.minute);
  if (!isWithinSameDatePreferredWindow(localMinute, parseTimeToMinutes(input.user.preferredNotificationTime), input.dispatchWindowMinutes)) return { status:"deferred", reason:"outside_preferred_time_window" };
  if (input.user.quietHours && isWithinQuietHours(localMinute, input.user.quietHours)) return { status:"eligible", deferredReason:"quiet_hours" };
  return { status:"eligible" };
}


function getDispatchGuard(message:ScheduledNotificationMessage, user:NotificationSchedulerUser, now:Date):{status:"allowed"}|{status:"suppressed"|"deferred"; reason:string} {
  if (!canAccessPeriod({ subscription:user.subscription, planCode:user.planCode ?? "free", periodType:message.periodType as SubscriptionPeriodType, now })) return { status:"suppressed", reason:"entitlement_lost" };
  if (!isChannelPreferenceEnabled(user, message.topicCode, message.channel)) return { status:"suppressed", reason:"primary_channel_preference_disabled" };
  const local = getLocalDateTimeParts(now, user.timezone);
  const localMinute = Number(local.hour) * 60 + Number(local.minute);
  if (user.quietHours && isWithinQuietHours(localMinute, user.quietHours)) return { status:"deferred", reason:"quiet_hours" };
  return { status:"allowed" };
}

async function dispatchToChannel(message:ScheduledNotificationMessage, channel:NotificationChannel, user:NotificationSchedulerUser, emailGateway:EmailGateway|undefined, lineGateway:LineGateway|undefined, fallback:boolean, now:Date):Promise<NotificationDeliveryAttempt> {
  const claim = claimDeliveryAttempt(message, channel, now, fallback);
  if (claim.status === "duplicate") return claim.attempt;
  if (channel === "email") {
    if (!emailGateway) return updateAttempt(claim.attempt, "failed", now, "email_gateway_unavailable");
    if (!user.emailAccount) return updateAttempt(claim.attempt, "failed", now, "email_account_unavailable");
    try {
      const result = await emailGateway.send(user.emailAccount, toEmailMessage(message));
      return updateAttempt(claim.attempt, mapEmailStatus(result.status), now, result.errorCode, result.providerMessageId);
    } catch {
      return updateAttempt(claim.attempt, "failed", now, "provider_exception");
    }
  }
  if (!lineGateway) return updateAttempt(claim.attempt, "failed", now, "line_gateway_unavailable");
  if (!user.lineAccount) return updateAttempt(claim.attempt, "failed", now, "line_account_unavailable");
  try {
    const result = await lineGateway.send(user.lineAccount, toLineMessage(message));
    return updateAttempt(claim.attempt, mapLineStatus(result.status), now, result.errorCode, result.providerMessageId);
  } catch {
    return updateAttempt(claim.attempt, "failed", now, "provider_exception");
  }
}

function toEmailMessage(message:ScheduledNotificationMessage):EmailMessage {
  const idempotencyKey = makeEmailIdempotencyKey(message);
  if (message.horoscopeContent) {
    return horoscopeContentToEmailMessage({ topicCode:message.topicCode, content:message.horoscopeContent, idempotencyKey, metadata:{ ...(message.deliveryMetadata ?? {}), periodKey:message.periodKey } });
  }
  return { topicCode:message.topicCode, subject:message.title, text:message.body, html:`<p>${escapeHtml(message.body)}</p>`, transactional:false, idempotencyKey, metadata:{ periodKey:message.periodKey, idempotencyKey } };
}

function toLineMessage(message:ScheduledNotificationMessage):LineMessage {
  if (message.horoscopeContent) {
    return horoscopeContentToLineMessage({ topicCode:message.topicCode, content:message.horoscopeContent, metadata:{ ...(message.deliveryMetadata ?? {}), periodKey:message.periodKey } });
  }
  return { topicCode:message.topicCode, title:message.title, body:message.body, periodKey:message.periodKey, ctaUrl:"https://example.test/horoscope" };
}

function recordAttempt(message:ScheduledNotificationMessage, channel:NotificationChannel, status:NotificationQueueStatus, now:Date, fallback:boolean, errorCode?:string, providerMessageId?:string):NotificationDeliveryAttempt {
  const attempt:NotificationDeliveryAttempt = { id:`notif_attempt_${state.nextAttemptSeq++}`, outboundMessageId:message.id, channel, status, attemptedAt:now.toISOString(), providerMessageId, errorCode, fallback };
  state.deliveryAttempts.push(attempt);
  writeAudit("notification_delivery_attempted", attempt.id, now, { topicCode:message.topicCode, periodKey:message.periodKey, channel, status, errorCode:errorCode ?? "", fallback:String(fallback) });
  return structuredClone(attempt);
}

function claimDeliveryAttempt(message:ScheduledNotificationMessage, channel:NotificationChannel, now:Date, fallback:boolean):{status:"claimed"; attempt:NotificationDeliveryAttempt}|{status:"duplicate"; attempt:NotificationDeliveryAttempt} {
  if (hasActiveOrSentDeliveryAttempt(message.id, channel)) return { status:"duplicate", attempt:recordAttempt(message, channel, "duplicate", now, fallback, "already_in_progress") };
  const attempt:NotificationDeliveryAttempt = { id:`notif_attempt_${state.nextAttemptSeq++}`, outboundMessageId:message.id, channel, status:"in_progress", attemptedAt:now.toISOString(), fallback };
  state.deliveryAttempts.push(attempt);
  writeAudit("notification_delivery_attempted", attempt.id, now, { topicCode:message.topicCode, periodKey:message.periodKey, channel, status:"in_progress", errorCode:"", fallback:String(fallback) });
  return { status:"claimed", attempt };
}

function updateAttempt(attempt:NotificationDeliveryAttempt, status:NotificationQueueStatus, now:Date, errorCode?:string, providerMessageId?:string):NotificationDeliveryAttempt {
  attempt.status = status;
  attempt.attemptedAt = now.toISOString();
  attempt.errorCode = errorCode;
  attempt.providerMessageId = providerMessageId;
  const message = state.outboundMessages.find((item)=>item.id===attempt.outboundMessageId);
  writeAudit("notification_delivery_attempted", attempt.id, now, { topicCode:message?.topicCode ?? "unknown", periodKey:message?.periodKey ?? "", channel:attempt.channel, status, errorCode:errorCode ?? "", fallback:String(attempt.fallback) });
  return structuredClone(attempt);
}

function findApprovedHoroscope(mockState:ReturnType<typeof getMockMvpState>, userId:string, periodType:PeriodType, periodKey:string):HoroscopeResult|undefined {
  const activeBirthProfileIds = new Set(mockState.birthProfiles.filter((profile)=>profile.userId===userId).map((profile)=>profile.id));
  const activeChartIds = new Set(mockState.chartSnapshots.filter((snapshot)=>snapshot.userId===userId&&activeBirthProfileIds.has(snapshot.birthProfileId)).map((snapshot)=>snapshot.id));
  return mockState.horoscopeResults.find((result)=>result.userId===userId&&result.periodType===periodType&&result.periodKey===periodKey&&result.status==="approved"&&activeBirthProfileIds.has(result.birthProfileId)&&activeChartIds.has(result.chartSnapshotId));
}

function buildDeliveryPayload(result:HoroscopeResult, topicCode:NotificationTopic, chartSnapshot:ReturnType<typeof getMockMvpState>["chartSnapshots"][number]):HoroscopeDeliveryPayload|undefined {
  try {
    return generateHoroscopeDeliveryPayload({ topicCode, periodType:result.periodType, periodKey:result.periodKey, chartSnapshot });
  } catch {
    return undefined;
  }
}

function findActiveQueuedSourceArtifact(mockState:ReturnType<typeof getMockMvpState>, message:ScheduledNotificationMessage):HoroscopeResult|undefined {
  const result = mockState.horoscopeResults.find((item)=>item.id===message.horoscopeResultId);
  if (!result || result.status!=="approved" || result.userId!==message.userId || result.periodType!==message.periodType || result.periodKey!==message.periodKey || result.birthProfileId!==message.birthProfileId || result.chartSnapshotId!==message.chartSnapshotId) return undefined;
  const chart = mockState.chartSnapshots.find((snapshot)=>snapshot.id===message.chartSnapshotId);
  if (!chart || chart.userId!==message.userId || chart.birthProfileId!==message.birthProfileId) return undefined;
  const birthProfile = mockState.birthProfiles.find((profile)=>profile.id===message.birthProfileId);
  if (!birthProfile || birthProfile.userId!==message.userId || mockState.deletedBirthProfileIds[message.birthProfileId]) return undefined;
  return result;
}

function isUserInactive(mockState:ReturnType<typeof getMockMvpState>, user:NotificationSchedulerUser):boolean {
  return user.active === false || user.accountDeleted === true || Boolean(mockState.deactivatedUserIds[user.userId]) || mockState.accountDeletionRequests.some((request)=>request.userId===user.userId&&request.status==="requested");
}

function refreshQueuedDeliveryPreferences(message:ScheduledNotificationMessage, user:NotificationSchedulerUser, topicCode:NotificationTopic, now:Date):void {
  // Horoscope queue idempotency is user/topic/period. If a duplicate scheduler snapshot chooses
  // a different channel before dispatch starts, keep the exact horoscope source/content but refresh
  // the delivery preference snapshot to the latest eligible primary/fallback channels on this message.
  // Once a real provider attempt exists, retain the original queued delivery fields to avoid changing an
  // in-flight provider claim or retry target. Approval holds happen before provider dispatch, so they can
  // still follow the user's latest eligible channel preferences.
  if (message.status !== "queued" || hasProviderDeliveryAttempt(message.id)) return;
  message.channel = user.primaryChannel;
  message.fallbackChannel = user.fallbackChannel;
  message.allowFallback = isFallbackAllowed(user, topicCode);
  writeAudit("notification_duplicate", message.id, now, { topicCode, periodKey:message.periodKey, channel:user.primaryChannel, queuePolicy:"refreshed_pending_delivery_preferences" });
}

function refreshQueuedHoroscopeContent(message:ScheduledNotificationMessage, result:HoroscopeResult, deliveryPayload:HoroscopeDeliveryPayload, now:Date):void {
  if (message.status !== "queued") return;
  const contentChanged = message.horoscopeContent?.content_hash !== deliveryPayload.content.content_hash;
  const sourceChanged = message.horoscopeResultId !== result.id || message.birthProfileId !== result.birthProfileId || message.chartSnapshotId !== result.chartSnapshotId;
  if (!contentChanged && !sourceChanged) return;
  message.horoscopeResultId = result.id;
  message.birthProfileId = result.birthProfileId;
  message.chartSnapshotId = result.chartSnapshotId;
  if (contentChanged) {
    message.title = deliveryPayload.title;
    message.body = deliveryPayload.previewText;
    message.horoscopeContent = deliveryPayload.content;
    message.deliveryMetadata = {
      ...deliveryPayload.metadata,
      ...(message.deliveryMetadata?.previewBatchId ? { previewBatchId:message.deliveryMetadata.previewBatchId } : {}),
      ...(message.deliveryMetadata?.approvalStatus ? { approvalStatus:message.deliveryMetadata.approvalStatus } : {}),
    };
  }
  writeAudit("notification_duplicate", message.id, now, { topicCode:message.topicCode, periodKey:message.periodKey, queuePolicy:contentChanged ? "refreshed_changed_horoscope_content" : "refreshed_source_artifact" });
}

function getPreparedDeliveryChannels(user:NotificationSchedulerUser, topicCode:NotificationTopic):NotificationChannel[] {
  const channels = new Set<NotificationChannel>();
  if (isChannelPreferenceEnabled(user, topicCode, user.primaryChannel) && !isChannelUnsubscribed(user, user.primaryChannel)) channels.add(user.primaryChannel);
  if (user.fallbackChannel && user.fallbackChannel !== user.primaryChannel && isFallbackAllowed(user, topicCode) && isChannelPreferenceEnabled(user, topicCode, user.fallbackChannel) && !isChannelUnsubscribed(user, user.fallbackChannel) && !isChannelBlockedOrBounced(user, user.fallbackChannel)) channels.add(user.fallbackChannel);
  return [...channels].sort();
}

function messageRequiresContentApproval(message:ScheduledNotificationMessage):boolean {
  return Boolean(message.deliveryMetadata?.previewBatchId || message.deliveryMetadata?.approvalStatus);
}

function applyApprovalMetadata(message:ScheduledNotificationMessage, approval:{ batchId:string; approvalStatus:string }):void {
  message.deliveryMetadata = { ...(message.deliveryMetadata ?? {}), previewBatchId:approval.batchId, approvalStatus:approval.approvalStatus };
}

function hasPendingApprovalAttempt(outboundMessageId:string):boolean {
  return state.deliveryAttempts.some((attempt)=>attempt.outboundMessageId===outboundMessageId&&attempt.status==="deferred"&&attempt.errorCode==="content_pending_approval");
}

function hasProviderDeliveryAttempt(outboundMessageId:string):boolean {
  return state.deliveryAttempts.some((attempt)=>attempt.outboundMessageId===outboundMessageId&&!isApprovalHoldAttempt(attempt));
}

function isApprovalHoldAttempt(attempt:NotificationDeliveryAttempt):boolean {
  return attempt.status === "deferred" && (attempt.errorCode === "content_pending_approval" || attempt.errorCode === "content_approval_missing" || attempt.errorCode === "content_rejected");
}

function isApprovalSuppressedMessage(message:ScheduledNotificationMessage):boolean {
  return message.status === "suppressed" && state.deliveryAttempts.some((attempt)=>attempt.outboundMessageId===message.id&&attempt.status==="suppressed"&&(attempt.errorCode==="content_approval_missing"||attempt.errorCode==="content_rejected"));
}

function isFallbackAllowed(user:NotificationSchedulerUser, topicCode:NotificationTopic):boolean {
  return Boolean(user.fallbackChannel) && user.preferences?.some((preference)=>(preference.topicCode==="all"||preference.topicCode===topicCode)&&preference.allowFallback) === true;
}

function getCurrentFallbackChannel(user:NotificationSchedulerUser, message:ScheduledNotificationMessage):NotificationChannel|undefined {
  if (!isFallbackAllowed(user, message.topicCode) || !user.fallbackChannel || user.fallbackChannel===message.channel) return undefined;
  if (!isChannelPreferenceEnabled(user, message.topicCode, user.fallbackChannel) || isChannelUnsubscribed(user, user.fallbackChannel) || isChannelBlockedOrBounced(user, user.fallbackChannel)) return undefined;
  return user.fallbackChannel;
}

function isChannelPreferenceEnabled(user:NotificationSchedulerUser, topicCode:NotificationTopic, channel:NotificationChannel):boolean {
  const matching = user.preferences?.filter((preference)=>(preference.topicCode==="all"||preference.topicCode===topicCode)&&preference.channel===channel);
  if (!matching?.length) return true;
  return matching.every((preference)=>preference.enabled);
}

function isChannelUnsubscribed(user:NotificationSchedulerUser, channel:NotificationChannel):boolean {
  if (channel === "email") return Boolean(user.emailAccount?.unsubscribed);
  return false;
}

function isChannelBlockedOrBounced(user:NotificationSchedulerUser, channel:NotificationChannel):boolean {
  if (channel === "email") {
    const account = user.emailAccount;
    return !account?.verified || Boolean(account.bounced) || Boolean(account.complained);
  }
  const account = user.lineAccount;
  return !account?.active || Boolean(account.blocked) || !account.followed;
}

function isFallbackTrigger(attempt:NotificationDeliveryAttempt):boolean { return attempt.status === "suppressed" && isTerminalFallbackErrorCode(attempt.errorCode); }
function isTerminalFallbackErrorCode(errorCode:string|undefined):boolean { return new Set(["email_not_verified", "email_bounced", "email_complained", "email_unsubscribed", "line_account_inactive"]).has(errorCode ?? ""); }
function makeEmailIdempotencyKey(message:ScheduledNotificationMessage):string { return `notification_email_${sha256(`${message.queueKey}:email`).slice(0,32)}`; }
function hasSentAttempt(outboundMessageId:string):boolean { return state.deliveryAttempts.some((attempt)=>attempt.outboundMessageId===outboundMessageId&&(attempt.status==="sent"||attempt.status==="fallback_sent")); }
function hasActiveOrSentDeliveryAttempt(outboundMessageId:string, channel:NotificationChannel):boolean { return state.deliveryAttempts.some((attempt)=>attempt.outboundMessageId===outboundMessageId&&attempt.channel===channel&&(attempt.status==="in_progress"||attempt.status==="sent"||attempt.status==="fallback_sent")); }
function mapEmailStatus(status:EmailDeliveryResult["status"]):NotificationQueueStatus { return status === "sent" ? "sent" : status === "failed" ? "failed" : "suppressed"; }
function mapLineStatus(status:LineDeliveryResult["status"]):NotificationQueueStatus { return status === "sent" ? "sent" : status === "failed" ? "failed" : "suppressed"; }
function makeQueueKey(userId:string, topicCode:NotificationTopic, periodKey:string):string { return [userId, topicCode, periodKey].join(":"); }
function auditTarget(userId:string, topicCode:string, periodKey:string):string { return `notif_${sha256(`${userId}:${topicCode}:${periodKey}`).slice(0,16)}`; }
function writeAudit(action:NotificationSchedulerAuditLogEntry["action"], targetId:string, now:Date, metadata:Record<string,string>):void { state.auditLogs.push({ action, targetId, createdAt:now.toISOString(), metadata:sanitizeNotificationMetadata(metadata) }); }
function sanitizeNotificationMetadata(metadata:Record<string,string>):Record<string,string> { return Object.fromEntries(Object.entries(metadata).filter(([key,value])=>!isSensitiveMetadataKey(key)&&!isSensitiveMetadataValue(value))); }
function isSensitiveMetadataKey(key:string):boolean { const normalized=key.toLowerCase(); return ["email","lineuserid","userid","birth","timezone","body","summary","secret","token","authorization","raw","payload"].some((blocked)=>normalized.includes(blocked)); }
function isSensitiveMetadataValue(value:string):boolean { const normalized=value.toLowerCase(); return value.includes("@") || /\bU[A-Za-z0-9]{8,}\b/.test(value) || normalized.includes("secret") || normalized.includes("bearer ") || normalized.includes("token"); }
function getLocalDateTimeParts(now:Date, timezone:string):{ year:string; month:string; day:string; hour:string; minute:string } {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone:timezone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23" });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part)=>[part.type, part.value]));
  return { year:parts.year!, month:parts.month!, day:parts.day!, hour:parts.hour!, minute:parts.minute! };
}
function parseTimeToMinutes(value:string):number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("preferredNotificationTime must use HH:mm.");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("preferredNotificationTime must use HH:mm.");
  return hour * 60 + minute;
}
function isWithinSameDatePreferredWindow(localMinute:number, preferredMinute:number, dispatchWindowMinutes:number):boolean {
  // Preferred windows are anchored to the current local calendar date and never wrap across midnight.
  // If preferredMinute + dispatchWindowMinutes exceeds 23:59, the post-midnight portion is intentionally excluded;
  // the next scheduler run must derive the next local date's period key before considering that next-day time.
  return localMinute >= preferredMinute && localMinute <= preferredMinute + dispatchWindowMinutes;
}
function isWithinQuietHours(localMinute:number, quietHours:QuietHours):boolean {
  const start = parseTimeToMinutes(quietHours.start);
  const end = parseTimeToMinutes(quietHours.end);
  if (start === end) return false;
  if (start < end) return localMinute >= start && localMinute < end;
  return localMinute >= start || localMinute < end;
}
function isoWeekKey(year:string, month:string, day:string):string {
  const date = new Date(Date.UTC(Number(year), Number(month)-1, Number(day)));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2,"0")}`;
}
function escapeHtml(value:string):string { return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }
function sha256(value:string):string { return createHash("sha256").update(value).digest("hex"); }
