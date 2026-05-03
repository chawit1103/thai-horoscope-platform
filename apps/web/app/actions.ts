"use server";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { approveDraft, callMockAstroCalc, generateHoroscopeResult, getMockPeriodKey, queueMockOutboundMessage, recordMockDeliveryAttempt, saveBirthProfile, storeChartSnapshot, type PeriodType } from "../src/mvp/mock-flow";

const MOCK_ADMIN_COOKIE_NAME = "mock-admin-session";

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

export async function startMockAdminSessionAction(formData: FormData): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("Production auth is reserved for PR11.");
  const token = String(formData.get("adminToken") ?? "").trim();
  const cookieValue = startMockAdminSessionForToken(token, process.env.MOCK_ADMIN_TOKEN);
  if (!cookieValue) throw new Error("Invalid admin token.");
  const c = await cookies();
  c.set(MOCK_ADMIN_COOKIE_NAME, cookieValue, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/admin");
}

export function startMockAdminSessionForToken(token: string, expectedToken?: string): string | undefined {
  if (!expectedToken) return undefined;
  if (token !== expectedToken) return undefined;
  return createHash("sha256").update(`mock-admin:${expectedToken}`).digest("hex");
}

export function validateMockAdminSession(input: { sessionCookie?: string; expectedToken?: string; isProduction: boolean }): boolean {
  if (input.isProduction) return false;
  const expected = input.expectedToken ? createHash("sha256").update(`mock-admin:${input.expectedToken}`).digest("hex") : "";
  return Boolean(expected && input.sessionCookie && input.sessionCookie === expected);
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

export function approveAndQueueAuthorized(input: {sessionId:string; resultId:string; actorId?:string; isProduction:boolean; sessionRole?:string;}): void {
  if (input.isProduction) throw new Error("Development admin guard is disabled in production. Production auth is reserved for PR11.");
  if (input.sessionRole !== "admin") throw new Error("Unauthorized: missing admin session cookie.");
  const approved = approveDraft(input.resultId, input.actorId ?? "dev_admin_mock", input.sessionId);
  const message = queueMockOutboundMessage(approved.id, input.sessionId);
  recordMockDeliveryAttempt(message.id, input.sessionId);
}

export async function approveAndQueueAction(formData: FormData): Promise<void> {
  const c = await cookies();
  const { sessionId } = await requireSessionContext();
  const isAuthorizedAdmin = validateMockAdminSession({
    isProduction: process.env.NODE_ENV === "production",
    sessionCookie: c.get(MOCK_ADMIN_COOKIE_NAME)?.value,
    expectedToken: process.env.MOCK_ADMIN_TOKEN,
  });
  approveAndQueueAuthorized({
    sessionId,
    resultId: String(formData.get("resultId") ?? ""),
    actorId: String(formData.get("actorId") ?? "dev_admin_mock"),
    isProduction: process.env.NODE_ENV === "production",
    sessionRole: isAuthorizedAdmin ? "admin" : undefined,
  });
  redirect("/admin");
}
