import { createHash } from "node:crypto";
import { EmailGateway, type EmailChannelAccount, type EmailDeliveryResult, type EmailMessage } from "./email-gateway";
import { LineGateway, type LineChannelAccount, type LineDeliveryResult, type LineMessage } from "./line-gateway";
import { canAccessPeriod, type PeriodType as SubscriptionPeriodType, type PlanCode, type SubscriptionRecord } from "./subscription-lifecycle";
import { getMockMvpState, type HoroscopeResult, type PeriodType } from "./mock-flow";

export type NotificationTopic = "daily_horoscope"|"weekly_horoscope"|"monthly_horoscope"|"yearly_horoscope";
export type NotificationChannel = "line"|"email";
export type NotificationQueueStatus = "queued"|"skipped"|"sent"|"failed"|"suppressed"|"duplicate"|"fallback_sent"|"deferred";
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

export function runNotificationSchedulerJob(input:{ sessionId?:string; users:NotificationSchedulerUser[]; topics?:NotificationTopic[]; now?:Date; dispatchWindowMinutes?:number }):SchedulerRunResult {
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

      const channel = user.primaryChannel;
      if (!isChannelPreferenceEnabled(user, topicCode, channel) || isChannelUnsubscribed(user, channel)) {
        skipped += 1;
        writeAudit("notification_skipped", auditTarget(user.userId, topicCode, periodKey), now, { topicCode, periodKey, reason:"channel_preference_disabled" });
        continue;
      }

      const queueKey = makeQueueKey(user.userId, topicCode, periodKey, channel);
      const existing = state.outboundMessages.find((message)=>message.queueKey===queueKey);
      if (existing) {
        duplicates += 1;
        writeAudit("notification_duplicate", existing.id, now, { topicCode, periodKey, channel });
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
        title:result.content_json.title,
        body:result.content_json.summary,
        status:"queued",
        createdAt:now.toISOString(),
      };
      state.outboundMessages.push(message);
      queued.push(structuredClone(message));
      writeAudit("notification_queued", message.id, now, { topicCode, periodKey, channel, fallbackChannel:message.fallbackChannel ?? "" });
    }
  }

  return { queued, skipped, deferred, duplicates };
}

export async function dispatchQueuedNotifications(input:{ sessionId?:string; users:NotificationSchedulerUser[]; emailGateway?:EmailGateway; lineGateway?:LineGateway; now?:Date }):Promise<DispatchResult> {
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
    if (primary.status === "sent") {
      message.status = "sent";
      sent += 1;
      continue;
    }

    const currentFallbackChannel = getCurrentFallbackChannel(user, message);
    if (currentFallbackChannel && isFallbackTrigger(primary.status)) {
      const fallback = await dispatchToChannel(message, currentFallbackChannel, user, input.emailGateway, input.lineGateway, true, now);
      attempts.push(fallback);
      if (fallback.status === "sent") {
        message.status = "fallback_sent";
        fallbackSent += 1;
        continue;
      }
    }

    message.status = primary.status === "failed" ? "failed" : "suppressed";
    if (message.status === "suppressed") suppressed += 1;
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

function getQueueEligibility(input:{ user:NotificationSchedulerUser; topicCode:NotificationTopic; periodType:PeriodType; periodKey:string; now:Date; dispatchWindowMinutes:number; sessionId:string }):{status:"eligible"}|{status:"skipped"|"deferred"; reason:string} {
  const mockState = getMockMvpState(input.sessionId);
  if (isUserInactive(mockState, input.user)) return { status:"skipped", reason:"user_inactive" };
  if (!canAccessPeriod({ subscription:input.user.subscription, planCode:input.user.planCode ?? "free", periodType:input.periodType as SubscriptionPeriodType, now:input.now })) return { status:"skipped", reason:"missing_entitlement" };
  const local = getLocalDateTimeParts(input.now, input.user.timezone);
  const localMinute = Number(local.hour) * 60 + Number(local.minute);
  if (input.user.quietHours && isWithinQuietHours(localMinute, input.user.quietHours)) return { status:"deferred", reason:"quiet_hours" };
  if (minutesApart(localMinute, parseTimeToMinutes(input.user.preferredNotificationTime)) > input.dispatchWindowMinutes) return { status:"deferred", reason:"outside_preferred_time_window" };
  return { status:"eligible" };
}


function getDispatchGuard(message:ScheduledNotificationMessage, user:NotificationSchedulerUser, now:Date):{status:"allowed"}|{status:"suppressed"|"deferred"; reason:string} {
  if (!canAccessPeriod({ subscription:user.subscription, planCode:user.planCode ?? "free", periodType:message.periodType as SubscriptionPeriodType, now })) return { status:"suppressed", reason:"entitlement_lost" };
  if (!isChannelPreferenceEnabled(user, message.topicCode, message.channel) || isChannelUnsubscribed(user, message.channel)) return { status:"suppressed", reason:"primary_channel_preference_disabled" };
  const local = getLocalDateTimeParts(now, user.timezone);
  const localMinute = Number(local.hour) * 60 + Number(local.minute);
  if (user.quietHours && isWithinQuietHours(localMinute, user.quietHours)) return { status:"deferred", reason:"quiet_hours" };
  return { status:"allowed" };
}

async function dispatchToChannel(message:ScheduledNotificationMessage, channel:NotificationChannel, user:NotificationSchedulerUser, emailGateway:EmailGateway|undefined, lineGateway:LineGateway|undefined, fallback:boolean, now:Date):Promise<NotificationDeliveryAttempt> {
  if (hasDeliveryAttempt(message.id, channel)) return recordAttempt(message, channel, "duplicate", now, fallback, "duplicate_delivery");
  if (channel === "email") {
    if (!emailGateway || !user.emailAccount) return recordAttempt(message, channel, "suppressed", now, fallback, "email_account_unavailable");
    const result = await emailGateway.send(user.emailAccount, toEmailMessage(message));
    return recordAttempt(message, channel, mapEmailStatus(result.status), now, fallback, result.errorCode, result.providerMessageId);
  }
  if (!lineGateway || !user.lineAccount) return recordAttempt(message, channel, "suppressed", now, fallback, "line_account_unavailable");
  const result = await lineGateway.send(user.lineAccount, toLineMessage(message));
  return recordAttempt(message, channel, mapLineStatus(result.status), now, fallback, result.errorCode, result.providerMessageId);
}

function toEmailMessage(message:ScheduledNotificationMessage):EmailMessage {
  return { topicCode:message.topicCode, subject:message.title, text:message.body, html:`<p>${escapeHtml(message.body)}</p>`, transactional:false, metadata:{ periodKey:message.periodKey } };
}

function toLineMessage(message:ScheduledNotificationMessage):LineMessage {
  return { topicCode:message.topicCode, title:message.title, body:message.body, periodKey:message.periodKey, ctaUrl:"https://example.test/horoscope" };
}

function recordAttempt(message:ScheduledNotificationMessage, channel:NotificationChannel, status:NotificationQueueStatus, now:Date, fallback:boolean, errorCode?:string, providerMessageId?:string):NotificationDeliveryAttempt {
  const attempt:NotificationDeliveryAttempt = { id:`notif_attempt_${state.nextAttemptSeq++}`, outboundMessageId:message.id, channel, status, attemptedAt:now.toISOString(), providerMessageId, errorCode, fallback };
  state.deliveryAttempts.push(attempt);
  writeAudit("notification_delivery_attempted", attempt.id, now, { topicCode:message.topicCode, periodKey:message.periodKey, channel, status, errorCode:errorCode ?? "", fallback:String(fallback) });
  return structuredClone(attempt);
}

function findApprovedHoroscope(mockState:ReturnType<typeof getMockMvpState>, userId:string, periodType:PeriodType, periodKey:string):HoroscopeResult|undefined {
  const activeBirthProfileIds = new Set(mockState.birthProfiles.filter((profile)=>profile.userId===userId).map((profile)=>profile.id));
  const activeChartIds = new Set(mockState.chartSnapshots.filter((snapshot)=>snapshot.userId===userId&&activeBirthProfileIds.has(snapshot.birthProfileId)).map((snapshot)=>snapshot.id));
  return mockState.horoscopeResults.find((result)=>result.userId===userId&&result.periodType===periodType&&result.periodKey===periodKey&&result.status==="approved"&&activeBirthProfileIds.has(result.birthProfileId)&&activeChartIds.has(result.chartSnapshotId));
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

function isFallbackTrigger(status:NotificationQueueStatus):boolean { return status === "suppressed" || status === "failed"; }
function hasSentAttempt(outboundMessageId:string):boolean { return state.deliveryAttempts.some((attempt)=>attempt.outboundMessageId===outboundMessageId&&(attempt.status==="sent"||attempt.status==="fallback_sent")); }
function hasDeliveryAttempt(outboundMessageId:string, channel:NotificationChannel):boolean { return state.deliveryAttempts.some((attempt)=>attempt.outboundMessageId===outboundMessageId&&attempt.channel===channel&&(attempt.status==="sent"||attempt.status==="fallback_sent")); }
function mapEmailStatus(status:EmailDeliveryResult["status"]):NotificationQueueStatus { return status === "sent" ? "sent" : status === "failed" ? "failed" : "suppressed"; }
function mapLineStatus(status:LineDeliveryResult["status"]):NotificationQueueStatus { return status === "sent" ? "sent" : status === "failed" ? "failed" : "suppressed"; }
function makeQueueKey(userId:string, topicCode:NotificationTopic, periodKey:string, channel:NotificationChannel):string { return [userId, topicCode, periodKey, channel].join(":"); }
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
function minutesApart(a:number,b:number):number { const diff=Math.abs(a-b); return Math.min(diff, 1440-diff); }
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
