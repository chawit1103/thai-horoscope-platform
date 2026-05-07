import { createHash } from "node:crypto";
import type { ComponentHealth, EnvironmentValidationReport } from "./environment-validation";

export type MonitoringSeverity = "info"|"warning"|"error"|"critical";
export type MonitoringSource = "web"|"payment"|"email"|"line"|"notification_scheduler"|"astro_calc"|"admin_auth"|"privacy"|"subscription"|"environment";
export type MonitoringEventType =
  "payment_webhook_signature_failed"|
  "payment_webhook_idempotency_duplicate"|
  "payment_webhook_processing_failed"|
  "email_delivery_failed"|
  "email_bounce_spike_detected"|
  "line_webhook_signature_failed"|
  "line_delivery_failed"|
  "notification_scheduler_failed"|
  "duplicate_send_prevented"|
  "privacy_export_requested"|
  "account_deletion_requested"|
  "astro_calc_health_failed"|
  "astro_ephemeris_config_invalid"|
  "environment_validation_failed"|
  "admin_auth_denied"|
  "subscription_webhook_anomaly";
export type RedactedJson = null|boolean|number|string|RedactedJson[]|{[key:string]:RedactedJson};

export interface MonitoringEvent {
  type:MonitoringEventType;
  severity:MonitoringSeverity;
  source:MonitoringSource;
  createdAt:string;
  subjectRef?:string;
  dedupeKey?:string;
  metadata:Record<string, RedactedJson>;
}

export interface StructuredLogEntry {
  level:"info"|"warn"|"error";
  event:MonitoringEvent;
}

export interface StructuredLogger {
  log(entry:StructuredLogEntry):void;
}

export interface AlertProvider {
  notify(event:MonitoringEvent):Promise<void>;
}

export interface OperationalComponentStatus {
  component:string;
  status:"ok"|"warning"|"error";
  mode:string;
  errors:string[];
  warnings:string[];
}

export interface OperationalStatus {
  status:"ok"|"warning"|"error";
  service:string;
  environment:string;
  components:OperationalComponentStatus[];
}

const SENSITIVE_KEY_PARTS = [
  "email",
  "lineuserid",
  "line_user_id",
  "birth",
  "birthdate",
  "birthtime",
  "birthplace",
  "place",
  "location",
  "address",
  "card",
  "pan",
  "cvc",
  "cvv",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "credential",
  "password",
  "payload",
  "raw",
  "body",
  "html",
  "text",
  "ephemeris",
  "license",
] as const;
const SAFE_KEY_ALLOWLIST = new Set(["eventType", "status", "reason", "errorCode", "component", "mode", "provider", "topicCode", "periodType", "periodKey", "queueStatus", "retryable", "idempotencyStatus"]);
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const LINE_USER_ID_PATTERN = /\bU[0-9A-Za-z]{8,}\b/g;
const CARD_PATTERN = /\b(?:\d[ -]?){12,19}\b/g;
const API_KEY_PATTERN = /\b(?:sk|pk|rk|whsec|key|token|secret)[_-][A-Za-z0-9_-]{8,}\b/gi;
const KEY_VALUE_SECRET_PATTERN = /\b(?:authorization|bearer|api[_-]?key|webhook[_-]?secret|secret|token)\s*[:=]\s*[A-Za-z0-9._~+/=-]{8,}\b/gi;
const AUTH_TOKEN_PATTERN = /\b(?:authorization|bearer)\s+[A-Za-z0-9._~+/=-]{8,}\b/gi;
const ISO_DATE_PATTERN = /(?<!\d)(?:19|20)\d{2}-\d{2}-\d{2}(?!\d)/g;
const TIME_PATTERN = /(?<!\d)(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:\.\d+)?(?!\d)/g;
const SECRET_WORD_PATTERN = /\b(?:bearer|secret|token|api[_-]?key|webhook[_-]?secret|authorization)\b/gi;

export class InMemoryStructuredLogger implements StructuredLogger {
  readonly entries:StructuredLogEntry[] = [];
  log(entry:StructuredLogEntry):void {
    this.entries.push(structuredClone({ level:entry.level, event:sanitizeMonitoringEvent(entry.event) }));
  }
}

export class MockAlertProvider implements AlertProvider {
  readonly alerts:MonitoringEvent[] = [];
  networkSendCount = 0;
  private readonly lastSentByDedupeKey = new Map<string, number>();

  constructor(private readonly config:{ suppressWindowMs?:number; now?:()=>Date } = {}) {}

  async notify(event:MonitoringEvent):Promise<void> {
    const sanitized = sanitizeMonitoringEvent(event);
    const nowMs = (this.config.now?.() ?? new Date()).getTime();
    if (sanitized.dedupeKey) {
      const previous = this.lastSentByDedupeKey.get(sanitized.dedupeKey);
      const suppressWindowMs = this.config.suppressWindowMs ?? 5 * 60 * 1000;
      if (previous !== undefined && nowMs - previous < suppressWindowMs) return;
      this.lastSentByDedupeKey.set(sanitized.dedupeKey, nowMs);
    }
    this.alerts.push(sanitized);
  }
}

export function createMonitoringEvent(input:{
  type:MonitoringEventType;
  severity:MonitoringSeverity;
  source:MonitoringSource;
  metadata?:Record<string, unknown>;
  subjectRef?:string;
  dedupeKey?:string;
  now?:Date;
}):MonitoringEvent {
  return sanitizeMonitoringEvent({
    type:input.type,
    severity:input.severity,
    source:input.source,
    createdAt:(input.now ?? new Date()).toISOString(),
    subjectRef:input.subjectRef ? safeReference(input.subjectRef) : undefined,
    dedupeKey:input.dedupeKey ? safeReference(input.dedupeKey) : undefined,
    metadata:redactRecord(input.metadata ?? {}),
  });
}

export async function emitMonitoringEvent(input:{ event:MonitoringEvent; logger?:StructuredLogger; alertProvider?:AlertProvider }):Promise<MonitoringEvent> {
  const event = sanitizeMonitoringEvent(input.event);
  input.logger?.log({ level:logLevelForSeverity(event.severity), event });
  if (input.alertProvider && (event.severity === "error" || event.severity === "critical")) await input.alertProvider.notify(event);
  return event;
}

export function redactForObservability(value:unknown):RedactedJson {
  return redactValue(value);
}

export function sanitizeMonitoringEvent(event:MonitoringEvent):MonitoringEvent {
  return {
    type:event.type,
    severity:event.severity,
    source:event.source,
    createdAt:event.createdAt,
    subjectRef:event.subjectRef ? safeReference(event.subjectRef) : undefined,
    dedupeKey:event.dedupeKey ? safeReference(event.dedupeKey) : undefined,
    metadata:redactRecord(event.metadata),
  };
}

export function paymentWebhookFailureEvent(input:{ reason:"invalid_signature"|"invalid_payload"|"processing_failed"; provider:string; rawPayload?:unknown; providerEventId?:string; now?:Date }):MonitoringEvent {
  const type = input.reason === "invalid_signature" ? "payment_webhook_signature_failed" : "payment_webhook_processing_failed";
  return createMonitoringEvent({
    type,
    severity:input.reason === "processing_failed" ? "critical" : "error",
    source:"payment",
    subjectRef:input.providerEventId,
    dedupeKey:`payment:${input.reason}:${input.provider}`,
    now:input.now,
    metadata:{ provider:input.provider, reason:input.reason, providerEventRef:input.providerEventId ? safeReference(input.providerEventId) : "", rawPayload:input.rawPayload },
  });
}

export function emailDeliveryFailureEvent(input:{ reason:string; email?:string; providerMessageId?:string; topicCode?:string; now?:Date }):MonitoringEvent {
  return createMonitoringEvent({
    type:"email_delivery_failed",
    severity:"error",
    source:"email",
    subjectRef:input.email,
    dedupeKey:`email_delivery_failed:${input.reason}:${input.topicCode ?? "unknown"}`,
    now:input.now,
    metadata:input,
  });
}

export function lineDeliveryFailureEvent(input:{ reason:string; lineUserId?:string; providerMessageId?:string; topicCode?:string; now?:Date }):MonitoringEvent {
  return createMonitoringEvent({
    type:"line_delivery_failed",
    severity:"error",
    source:"line",
    subjectRef:input.lineUserId,
    dedupeKey:`line_delivery_failed:${input.reason}:${input.topicCode ?? "unknown"}`,
    now:input.now,
    metadata:input,
  });
}

export function astroCalcFailureEvent(input:{ reason:string; errorCode?:string; birthDate?:string; birthTime?:string; birthPlace?:string; rawError?:unknown; now?:Date }):MonitoringEvent {
  return createMonitoringEvent({
    type:input.reason === "ephemeris_config_invalid" ? "astro_ephemeris_config_invalid" : "astro_calc_health_failed",
    severity:"critical",
    source:"astro_calc",
    dedupeKey:`astro:${input.reason}:${input.errorCode ?? "unknown"}`,
    now:input.now,
    metadata:input,
  });
}

export function environmentValidationFailureEvents(report:EnvironmentValidationReport, now=new Date()):MonitoringEvent[] {
  return report.components.flatMap((component)=>component.errors.map((error)=>createMonitoringEvent({
    type:"environment_validation_failed",
    severity:component.component === "astro_calc" || component.component === "payment_provider" ? "critical" : "error",
    source:"environment",
    dedupeKey:`environment:${component.component}:${error.code}`,
    now,
    metadata:{ component:component.component, mode:component.mode, errorCode:error.code, variables:error.variables },
  })));
}

export function operationalStatusFromEnvironmentReport(report:EnvironmentValidationReport):OperationalStatus {
  return {
    status:report.status === "error" ? "error" : report.components.some((component)=>component.status === "warning") ? "warning" : "ok",
    service:report.service,
    environment:report.environment,
    components:report.components.map(publicComponentStatus),
  };
}

function publicComponentStatus(component:ComponentHealth):OperationalComponentStatus {
  return {
    component:component.component,
    status:component.status,
    mode:component.mode,
    errors:component.errors.map((error)=>error.code),
    warnings:component.warnings.map((warning)=>warning.code),
  };
}

function redactRecord(metadata:Record<string, unknown>):Record<string, RedactedJson> {
  return Object.fromEntries(Object.entries(metadata).map(([key, value])=>[key, redactValue(value, key)]));
}

function redactValue(value:unknown, key?:string):RedactedJson {
  if (isSensitiveKey(key)) return "[REDACTED]";
  if (value === null || value === undefined) return value === undefined ? "[REDACTED]" : null;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item)=>redactValue(item, key));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue])=>[nestedKey, redactValue(nestedValue, nestedKey)]));
  }
  return "[REDACTED]";
}

function redactString(value:string):string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const redacted = trimmed
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(LINE_USER_ID_PATTERN, "[REDACTED_LINE_USER]")
    .replace(CARD_PATTERN, "[REDACTED_CARD]")
    .replace(API_KEY_PATTERN, "[REDACTED_SECRET]")
    .replace(KEY_VALUE_SECRET_PATTERN, "[REDACTED_SECRET]")
    .replace(AUTH_TOKEN_PATTERN, "[REDACTED_SECRET]")
    .replace(ISO_DATE_PATTERN, "[REDACTED_DATE]")
    .replace(TIME_PATTERN, "[REDACTED_TIME]")
    .replace(SECRET_WORD_PATTERN, "[REDACTED_SECRET]");
  return redacted;
}

function isSensitiveKey(key:string|undefined):boolean {
  if (!key) return false;
  if (SAFE_KEY_ALLOWLIST.has(key)) return false;
  const normalized = key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part)=>normalized.includes(part.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()));
}

function safeReference(value:string):string {
  if (/^ref_[A-Za-z0-9_-]{16}$/.test(value)) return value;
  return `ref_${createHash("sha256").update(value).digest("base64url").slice(0, 16)}`;
}

function logLevelForSeverity(severity:MonitoringSeverity):StructuredLogEntry["level"] {
  if (severity === "critical" || severity === "error") return "error";
  if (severity === "warning") return "warn";
  return "info";
}
