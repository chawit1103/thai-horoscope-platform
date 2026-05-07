import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createBetaInvite, revokeBetaInvite } from "./beta-launch";
import { approveContentPreviewBatch, rejectContentPreviewBatch } from "./content-preview-approval";
import { approveDraft, queueMockOutboundMessage, recordAdminAudit, recordMockDeliveryAttempt, rejectDraft } from "./mock-flow";

export const ADMIN_COOKIE_NAME = "admin-session";
export const UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID = "__admin_security__";
export const DENIED_ADMIN_ACTION_AUDIT_TARGET_ID = "denied_admin_action";

const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

type AdminRole = "admin";
type AdminSession = { actorId: string; role: string; issuedAt: number; expiresAt: number };
type ParsedAdminCookie = { encodedPayload: string; signature: string; canonicalCookie: string };
export type AdminAuthResult = { ok: true; actorId: string; role: AdminRole; issuedAt: number; expiresAt: number; signature: string; canonicalCookie: string } | { ok: false; reason: string };
export type AdminRouteAccess = { ok: true; actorId: string; role: AdminRole } | { ok: false; reason: string; redirectTo: string };

export function isDevMockAdminLoginEnabled(input: { isProduction: boolean; deploymentEnvironment?: "local"|"staging"|"production" }): boolean {
  if (input.deploymentEnvironment) return input.deploymentEnvironment !== "production";
  return !input.isProduction;
}

export function startDevMockAdminSessionForToken(input: { token: string; expectedToken?: string; sessionSecret?: string; isProduction: boolean; deploymentEnvironment?: "local"|"staging"|"production"; now?: Date }): string | undefined {
  if (!isDevMockAdminLoginEnabled({ isProduction: input.isProduction, deploymentEnvironment: input.deploymentEnvironment })) return undefined;
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
  const parsedCookie = parseAdminSessionCookie(input.sessionCookie);
  if (!parsedCookie) return { ok: false, reason: "malformed_admin_session" };

  const expectedSignature = hmac(parsedCookie.encodedPayload, input.sessionSecret);
  if (!constantTimeEqual(parsedCookie.signature, expectedSignature)) return { ok: false, reason: "invalid_admin_session_signature" };

  let session: AdminSession;
  try {
    session = JSON.parse(Buffer.from(parsedCookie.encodedPayload, "base64url").toString("utf8")) as AdminSession;
  } catch {
    return { ok: false, reason: "malformed_admin_session_payload" };
  }

  if (session.role !== "admin") return { ok: false, reason: "missing_admin_role" };
  if (!session.actorId || !session.expiresAt) return { ok: false, reason: "incomplete_admin_session" };
  if (session.expiresAt <= (input.now?.getTime() ?? Date.now())) return { ok: false, reason: "expired_admin_session" };
  return { ok: true, actorId: session.actorId, role: session.role, issuedAt: session.issuedAt, expiresAt: session.expiresAt, signature: parsedCookie.signature, canonicalCookie: parsedCookie.canonicalCookie };
}

export function getAdminAuditPartition(input: { actorId: string; role: string; issuedAt: number; signature: string; canonicalCookie: string }): string {
  const canonicalSession = [input.actorId, input.role, String(input.issuedAt), input.signature, input.canonicalCookie].join("|");
  const sessionHash = createHash("sha256").update(canonicalSession).digest("hex").slice(0, 16);
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
    recordAdminAudit(UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID, "anonymous", "admin_access_denied", DENIED_ADMIN_ACTION_AUDIT_TARGET_ID, { reason: auth.reason, path: "/admin/approve" });
    throw new Error("Unauthorized: admin role is required.");
  }

  const adminAuditPartition = getAdminAuditPartition(auth);
  const approved = approveDraft(input.resultId, auth.actorId, input.sessionId);
  recordAdminAudit(adminAuditPartition, auth.actorId, "admin_content_approved", approved.id, { role: auth.role, periodType: approved.periodType });
  const message = queueMockOutboundMessage(approved.id, input.sessionId);
  recordAdminAudit(adminAuditPartition, auth.actorId, "admin_outbound_queued", message.id, { role: auth.role, resultId: approved.id });
  recordMockDeliveryAttempt(message.id, input.sessionId);
}

export function recordAdminSessionStartedWithAdminCookie(input: { sessionCookie?: string; sessionSecret?: string }): void {
  const auth = validateAdminSession({ sessionCookie: input.sessionCookie, sessionSecret: input.sessionSecret });
  if (!auth.ok) {
    recordAdminAudit(UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID, "anonymous", "admin_access_denied", "admin_session", { reason: auth.reason, path: "/admin/sign-in" });
    throw new Error("Unauthorized: admin role is required.");
  }

  const adminAuditPartition = getAdminAuditPartition(auth);
  recordAdminAudit(adminAuditPartition, auth.actorId, "admin_session_started", "admin_session", { role: auth.role });
}

export function rejectDraftWithAdminCookie(input: { sessionId: string; resultId: string; sessionCookie?: string; sessionSecret?: string }): void {
  const auth = validateAdminSession({ sessionCookie: input.sessionCookie, sessionSecret: input.sessionSecret });
  if (!auth.ok) {
    recordAdminAudit(UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID, "anonymous", "admin_access_denied", DENIED_ADMIN_ACTION_AUDIT_TARGET_ID, { reason: auth.reason, path: "/admin/reject" });
    throw new Error("Unauthorized: admin role is required.");
  }

  const adminAuditPartition = getAdminAuditPartition(auth);
  const rejected = rejectDraft(input.resultId, auth.actorId, input.sessionId);
  recordAdminAudit(adminAuditPartition, auth.actorId, "admin_content_rejected", rejected.id, { role: auth.role, periodType: rejected.periodType });
}

export function approveContentBatchWithAdminCookie(input: { sessionId: string; batchId: string; sessionCookie?: string; sessionSecret?: string }): void {
  const auth = validateAdminSession({ sessionCookie: input.sessionCookie, sessionSecret: input.sessionSecret });
  if (!auth.ok) {
    recordAdminAudit(UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID, "anonymous", "admin_access_denied", DENIED_ADMIN_ACTION_AUDIT_TARGET_ID, { reason: auth.reason, path: "/admin/content-preview/approve" });
    throw new Error("Unauthorized: admin role is required.");
  }

  const approved = approveContentPreviewBatch({ sessionId: input.sessionId, batchId: input.batchId, actorId: auth.actorId });
  const adminAuditPartition = getAdminAuditPartition(auth);
  recordAdminAudit(adminAuditPartition, auth.actorId, "admin_content_batch_approved", approved.batchId, { role: auth.role, approvalStatus: approved.approvalStatus, itemCount: String(approved.items.length) });
}

export function rejectContentBatchWithAdminCookie(input: { sessionId: string; batchId: string; sessionCookie?: string; sessionSecret?: string }): void {
  const auth = validateAdminSession({ sessionCookie: input.sessionCookie, sessionSecret: input.sessionSecret });
  if (!auth.ok) {
    recordAdminAudit(UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID, "anonymous", "admin_access_denied", DENIED_ADMIN_ACTION_AUDIT_TARGET_ID, { reason: auth.reason, path: "/admin/content-preview/reject" });
    throw new Error("Unauthorized: admin role is required.");
  }

  const rejected = rejectContentPreviewBatch({ sessionId: input.sessionId, batchId: input.batchId, actorId: auth.actorId });
  const adminAuditPartition = getAdminAuditPartition(auth);
  recordAdminAudit(adminAuditPartition, auth.actorId, "admin_content_batch_rejected", rejected.batchId, { role: auth.role, approvalStatus: rejected.approvalStatus, itemCount: String(rejected.items.length) });
}

export function createBetaInviteWithAdminCookie(input: { sessionId: string; inviteCode?: string; email?: string; userId?: string; sessionCookie?: string; sessionSecret?: string }): string {
  const auth = validateAdminSession({ sessionCookie: input.sessionCookie, sessionSecret: input.sessionSecret });
  if (!auth.ok) {
    recordAdminAudit(UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID, "anonymous", "admin_access_denied", DENIED_ADMIN_ACTION_AUDIT_TARGET_ID, { reason: auth.reason, path: "/admin/beta/invites/create" });
    throw new Error("Unauthorized: admin role is required.");
  }

  if (!input.inviteCode && !input.email && !input.userId) throw new Error("Beta invite requires a code, email allowlist, or user allowlist.");
  const invite = createBetaInvite({ sessionId: input.sessionId, inviteCode: input.inviteCode, email: input.email, userId: input.userId });
  const adminAuditPartition = getAdminAuditPartition(auth);
  recordAdminAudit(adminAuditPartition, auth.actorId, "admin_beta_invite_created", invite.id, { role: auth.role, inviteKind: invite.kind, inviteStatus: invite.status });
  return invite.id;
}

export function revokeBetaInviteWithAdminCookie(input: { sessionId: string; inviteId: string; sessionCookie?: string; sessionSecret?: string }): void {
  const auth = validateAdminSession({ sessionCookie: input.sessionCookie, sessionSecret: input.sessionSecret });
  if (!auth.ok) {
    recordAdminAudit(UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID, "anonymous", "admin_access_denied", DENIED_ADMIN_ACTION_AUDIT_TARGET_ID, { reason: auth.reason, path: "/admin/beta/invites/revoke" });
    throw new Error("Unauthorized: admin role is required.");
  }

  const invite = revokeBetaInvite({ sessionId: input.sessionId, inviteId: input.inviteId });
  const adminAuditPartition = getAdminAuditPartition(auth);
  recordAdminAudit(adminAuditPartition, auth.actorId, "admin_beta_invite_revoked", invite.id, { role: auth.role, inviteKind: invite.kind, inviteStatus: invite.status });
}

function signAdminSession(session: AdminSession, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${encodedPayload}.${hmac(encodedPayload, secret)}`;
}

function parseAdminSessionCookie(sessionCookie: string): ParsedAdminCookie | undefined {
  const parts = sessionCookie.split(".");
  if (parts.length !== 2) return undefined;
  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return undefined;
  return { encodedPayload, signature, canonicalCookie: `${encodedPayload}.${signature}` };
}

function hmac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}
