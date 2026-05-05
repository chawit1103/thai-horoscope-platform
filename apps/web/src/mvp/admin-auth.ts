import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { approveDraft, queueMockOutboundMessage, recordAdminAudit, recordMockDeliveryAttempt, rejectDraft } from "./mock-flow";

export const ADMIN_COOKIE_NAME = "admin-session";
export const UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID = "__admin_security__";

const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

type AdminRole = "admin";
type AdminSession = { actorId: string; role: string; issuedAt: number; expiresAt: number };
export type AdminAuthResult = { ok: true; actorId: string; role: AdminRole } | { ok: false; reason: string };
export type AdminRouteAccess = { ok: true; actorId: string; role: AdminRole } | { ok: false; reason: string; redirectTo: string };

export function isDevMockAdminLoginEnabled(input: { isProduction: boolean }): boolean {
  return !input.isProduction;
}

export function startDevMockAdminSessionForToken(input: { token: string; expectedToken?: string; sessionSecret?: string; isProduction: boolean; now?: Date }): string | undefined {
  if (!isDevMockAdminLoginEnabled({ isProduction: input.isProduction })) return undefined;
  if (!input.expectedToken || !input.sessionSecret) return undefined;
  if (input.token !== input.expectedToken) return undefined;
  const actorId = `admin_${createHash("sha256").update(`admin-actor:${input.expectedToken}`).digest("hex").slice(0, 12)}`;
  return createAdminSessionCookie({ actorId, role: "admin", sessionSecret: input.sessionSecret, now: input.now });
}

export function createAdminSessionCookie(input: { actorId: string; role: string; sessionSecret: string; now?: Date; ttlMs?: number }): string {
  const issuedAt = input.now?.getTime() ?? Date.now();
  return signAdminSession({
    actorId: input.actorId,
    role: input.role,
    issuedAt,
    expiresAt: issuedAt + (input.ttlMs ?? ADMIN_SESSION_TTL_MS),
  }, input.sessionSecret);
}

export function validateAdminSession(input: { sessionCookie?: string; sessionSecret?: string; now?: Date }): AdminAuthResult {
  if (!input.sessionCookie || !input.sessionSecret) return { ok: false, reason: "missing_admin_session" };
  const [encodedPayload, signature] = input.sessionCookie.split(".");
  if (!encodedPayload || !signature) return { ok: false, reason: "malformed_admin_session" };

  const expectedSignature = hmac(encodedPayload, input.sessionSecret);
  if (!constantTimeEqual(signature, expectedSignature)) return { ok: false, reason: "invalid_admin_session_signature" };

  let session: AdminSession;
  try {
    session = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as AdminSession;
  } catch {
    return { ok: false, reason: "malformed_admin_session_payload" };
  }

  if (session.role !== "admin") return { ok: false, reason: "missing_admin_role" };
  if (!session.actorId || !session.expiresAt) return { ok: false, reason: "incomplete_admin_session" };
  if (session.expiresAt <= (input.now?.getTime() ?? Date.now())) return { ok: false, reason: "expired_admin_session" };
  return { ok: true, actorId: session.actorId, role: session.role };
}

export function getAdminAuditPartition(input: { actorId: string; sessionCookie: string }): string {
  const sessionHash = createHash("sha256").update(input.sessionCookie).digest("hex").slice(0, 16);
  return `admin:${input.actorId}:${sessionHash}`;
}

export function authorizeAdminRoute(input: { path: string; sessionCookie?: string; sessionSecret?: string; now?: Date }): AdminRouteAccess {
  const auth = validateAdminSession({
    sessionCookie: input.sessionCookie,
    sessionSecret: input.sessionSecret,
    now: input.now,
  });
  if (!auth.ok) return { ok: false, reason: auth.reason, redirectTo: "/admin/sign-in" };
  return auth;
}

export function approveAndQueueWithAdminCookie(input: { sessionId: string; resultId: string; sessionCookie?: string; sessionSecret?: string }): void {
  const auth = validateAdminSession({ sessionCookie: input.sessionCookie, sessionSecret: input.sessionSecret });
  if (!auth.ok) {
    recordAdminAudit(UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID, "anonymous", "admin_access_denied", input.resultId || "missing_result", { reason: auth.reason, path: "/admin/approve" });
    throw new Error("Unauthorized: admin role is required.");
  }

  const adminAuditPartition = getAdminAuditPartition({ actorId: auth.actorId, sessionCookie: input.sessionCookie! });
  const approved = approveDraft(input.resultId, auth.actorId, input.sessionId);
  recordAdminAudit(adminAuditPartition, auth.actorId, "admin_content_approved", approved.id, { role: auth.role, periodType: approved.periodType });
  const message = queueMockOutboundMessage(approved.id, input.sessionId);
  recordAdminAudit(adminAuditPartition, auth.actorId, "admin_outbound_queued", message.id, { role: auth.role, resultId: approved.id });
  recordMockDeliveryAttempt(message.id, input.sessionId);
}

export function rejectDraftWithAdminCookie(input: { sessionId: string; resultId: string; sessionCookie?: string; sessionSecret?: string }): void {
  const auth = validateAdminSession({ sessionCookie: input.sessionCookie, sessionSecret: input.sessionSecret });
  if (!auth.ok) {
    recordAdminAudit(UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID, "anonymous", "admin_access_denied", input.resultId || "missing_result", { reason: auth.reason, path: "/admin/reject" });
    throw new Error("Unauthorized: admin role is required.");
  }

  const adminAuditPartition = getAdminAuditPartition({ actorId: auth.actorId, sessionCookie: input.sessionCookie! });
  const rejected = rejectDraft(input.resultId, auth.actorId, input.sessionId);
  recordAdminAudit(adminAuditPartition, auth.actorId, "admin_content_rejected", rejected.id, { role: auth.role, periodType: rejected.periodType });
}

function signAdminSession(session: AdminSession, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${encodedPayload}.${hmac(encodedPayload, secret)}`;
}

function hmac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}
