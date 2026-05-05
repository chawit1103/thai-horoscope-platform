"use server";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { approveDraft, callMockAstroCalc, generateHoroscopeResult, getMockPeriodKey, queueMockOutboundMessage, recordAdminAudit, recordMockDeliveryAttempt, rejectDraft, saveBirthProfile, storeChartSnapshot, type PeriodType } from "../src/mvp/mock-flow";

export const ADMIN_COOKIE_NAME = "admin-session";
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
type AdminRole = "admin";
type AdminSession = { actorId: string; role: string; issuedAt: number; expiresAt: number };
type AdminAuthResult = { ok: true; actorId: string; role: AdminRole } | { ok: false; reason: string };
type AdminRouteAccess = { ok: true; actorId: string; role: AdminRole } | { ok: false; reason: string; redirectTo: string };

async function getOrCreateSessionContext(): Promise<{ sessionId: string; userId: string }> {
  const c = await cookies();
  let sessionId = c.get("mock-session-id")?.value;
  if (!sessionId) {
    sessionId = `sess_${crypto.randomUUID()}`;
    c.set("mock-session-id", sessionId, { httpOnly: true, sameSite: "lax", path: "/" });
  }

  let userId = c.get("mock-user-id")?.value;
  if (!userId) {
    userId = `user_${createHash("sha256").update(sessionId).digest("hex").slice(0, 12)}`;
    c.set("mock-user-id", userId, { httpOnly: true, sameSite: "lax", path: "/" });
  }

  return { sessionId, userId };
}

async function requireSessionContext(): Promise<{ sessionId: string; userId: string }> {
  const c = await cookies();
  const sessionId = c.get("mock-session-id")?.value;
  const userId = c.get("mock-user-id")?.value;
  if (!sessionId || !userId) {
    throw new Error("Unauthorized: missing mock session context. Start onboarding first.");
  }
  return { sessionId, userId };
}

export async function startDevMockAdminSessionAction(formData: FormData): Promise<void> {
  const token = String(formData.get("adminToken") ?? "").trim();
  const cookieValue = startDevMockAdminSessionForToken({
    token,
    expectedToken: process.env.MOCK_ADMIN_TOKEN,
    sessionSecret: process.env.ADMIN_SESSION_SECRET,
    isProduction: process.env.NODE_ENV === "production",
  });
  const c = await cookies();
  const sessionId = c.get("mock-session-id")?.value ?? "admin-security";
  if (!cookieValue) {
    recordAdminAudit(sessionId, "anonymous", "admin_access_denied", "admin_sign_in", { reason: "invalid_admin_token", path: "/admin/sign-in" });
    throw new Error("Unauthorized admin sign-in.");
  }

  const adminSession = validateAdminSession({ sessionCookie: cookieValue, sessionSecret: process.env.ADMIN_SESSION_SECRET });
  if (adminSession.ok) {
    recordAdminAudit(sessionId, adminSession.actorId, "admin_session_started", "admin_session", { role: adminSession.role });
  }

  c.set(ADMIN_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/admin");
}

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

export function authorizeAdminRoute(input: { path: string; sessionCookie?: string; sessionSecret?: string; now?: Date }): AdminRouteAccess {
  const auth = validateAdminSession({
    sessionCookie: input.sessionCookie,
    sessionSecret: input.sessionSecret,
    now: input.now,
  });
  if (!auth.ok) return { ok: false, reason: auth.reason, redirectTo: "/admin/sign-in" };
  return auth;
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

export async function requireAdminSession(path = "/admin"): Promise<{ actorId: string; role: AdminRole; sessionId: string }> {
  const c = await cookies();
  const sessionId = c.get("mock-session-id")?.value ?? "admin-security";
  const auth = authorizeAdminRoute({
    path,
    sessionCookie: c.get(ADMIN_COOKIE_NAME)?.value,
    sessionSecret: process.env.ADMIN_SESSION_SECRET,
  });
  if (!auth.ok) {
    recordAdminAudit(sessionId, "anonymous", "admin_access_denied", "admin_route", { reason: auth.reason, path });
    redirect(auth.redirectTo);
  }
  return { actorId: auth.actorId, role: auth.role, sessionId };
}

export async function saveOnboardingAction(formData: FormData): Promise<void> {
  const { sessionId, userId } = await getOrCreateSessionContext();
  const birthTimeUnknown = formData.get("birthTimeUnknown") === "on";
  const profile = saveBirthProfile({ birthDate: String(formData.get("birthDate") ?? ""), birthTime: String(formData.get("birthTime") ?? ""), birthTimeUnknown, birthPlaceText: String(formData.get("birthPlaceText") ?? ""), timezone: String(formData.get("timezone") ?? ""), consentBirthData: formData.get("consentBirthData") === "on" }, { sessionId, userId });
  const chartSnapshot = storeChartSnapshot(callMockAstroCalc(profile), sessionId);
  for (const periodType of ["daily", "weekly", "monthly", "yearly"] as PeriodType[]) {
    generateHoroscopeResult({ chartSnapshot, periodType, periodKey: getMockPeriodKey(periodType), sessionId });
  }
  redirect("/today");
}

export function approveAndQueueAuthorized(input: {sessionId:string; resultId:string; adminSession?:{actorId:string;role:string};}): void {
  if (input.adminSession?.role !== "admin") {
    recordAdminAudit(input.sessionId, "anonymous", "admin_access_denied", input.resultId || "missing_result", { reason: "missing_admin_role", path: "/admin/approve" });
    throw new Error("Unauthorized: admin role is required.");
  }
  const approved = approveDraft(input.resultId, input.adminSession.actorId, input.sessionId);
  recordAdminAudit(input.sessionId, input.adminSession.actorId, "admin_content_approved", approved.id, { role: input.adminSession.role, periodType: approved.periodType });
  const message = queueMockOutboundMessage(approved.id, input.sessionId);
  recordAdminAudit(input.sessionId, input.adminSession.actorId, "admin_outbound_queued", message.id, { role: input.adminSession.role, resultId: approved.id });
  recordMockDeliveryAttempt(message.id, input.sessionId);
}

export function rejectDraftAuthorized(input: {sessionId:string; resultId:string; adminSession?:{actorId:string;role:string};}): void {
  if (input.adminSession?.role !== "admin") {
    recordAdminAudit(input.sessionId, "anonymous", "admin_access_denied", input.resultId || "missing_result", { reason: "missing_admin_role", path: "/admin/reject" });
    throw new Error("Unauthorized: admin role is required.");
  }
  const rejected = rejectDraft(input.resultId, input.adminSession.actorId, input.sessionId);
  recordAdminAudit(input.sessionId, input.adminSession.actorId, "admin_content_rejected", rejected.id, { role: input.adminSession.role, periodType: rejected.periodType });
}

export async function approveAndQueueAction(formData: FormData): Promise<void> {
  const { sessionId } = await requireSessionContext();
  const adminSession = await requireAdminSession("/admin/approve");
  approveAndQueueAuthorized({
    sessionId,
    resultId: String(formData.get("resultId") ?? ""),
    adminSession,
  });
  redirect("/admin");
}

export async function rejectDraftAction(formData: FormData): Promise<void> {
  const { sessionId } = await requireSessionContext();
  const adminSession = await requireAdminSession("/admin/reject");
  rejectDraftAuthorized({
    sessionId,
    resultId: String(formData.get("resultId") ?? ""),
    adminSession,
  });
  redirect("/admin");
}
