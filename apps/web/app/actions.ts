"use server";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID, approveAndQueueWithAdminCookie, authorizeAdminRoute, rejectDraftWithAdminCookie, startDevMockAdminSessionForToken, validateAdminSession } from "../src/mvp/admin-auth";
import { callMockAstroCalc, generateHoroscopeResult, getMockPeriodKey, recordAdminAudit, saveBirthProfile, storeChartSnapshot, type PeriodType } from "../src/mvp/mock-flow";

type AdminRole = "admin";

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
  if (!cookieValue) {
    recordAdminAudit(UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID, "anonymous", "admin_access_denied", `admin_sign_in_${crypto.randomUUID()}`, { reason: "invalid_admin_token", path: "/admin/sign-in" });
    throw new Error("Unauthorized admin sign-in.");
  }

  const adminSession = validateAdminSession({ sessionCookie: cookieValue, sessionSecret: process.env.ADMIN_SESSION_SECRET });
  if (adminSession.ok) {
    const sessionId = c.get("mock-session-id")?.value ?? "admin-security";
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

export async function requireAdminSession(path = "/admin"): Promise<{ actorId: string; role: AdminRole; sessionId: string }> {
  const c = await cookies();
  const auth = authorizeAdminRoute({
    path,
    sessionCookie: c.get(ADMIN_COOKIE_NAME)?.value,
    sessionSecret: process.env.ADMIN_SESSION_SECRET,
  });
  if (!auth.ok) {
    recordAdminAudit(UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID, "anonymous", "admin_access_denied", `admin_route_${crypto.randomUUID()}`, { reason: auth.reason, path });
    redirect(auth.redirectTo);
  }
  const sessionId = c.get("mock-session-id")?.value ?? "admin-security";
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

export async function approveAndQueueAction(formData: FormData): Promise<void> {
  const c = await cookies();
  const { sessionId } = await requireSessionContext();
  approveAndQueueWithAdminCookie({
    sessionId,
    resultId: String(formData.get("resultId") ?? ""),
    sessionCookie: c.get(ADMIN_COOKIE_NAME)?.value,
    sessionSecret: process.env.ADMIN_SESSION_SECRET,
  });
  redirect("/admin");
}

export async function rejectDraftAction(formData: FormData): Promise<void> {
  const c = await cookies();
  const { sessionId } = await requireSessionContext();
  rejectDraftWithAdminCookie({
    sessionId,
    resultId: String(formData.get("resultId") ?? ""),
    sessionCookie: c.get(ADMIN_COOKIE_NAME)?.value,
    sessionSecret: process.env.ADMIN_SESSION_SECRET,
  });
  redirect("/admin");
}
