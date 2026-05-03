"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { approveDraft, callMockAstroCalc, generateHoroscopeResult, getMockPeriodKey, queueMockOutboundMessage, recordMockDeliveryAttempt, saveBirthProfile, storeChartSnapshot, type PeriodType } from "../src/mvp/mock-flow";

async function getSessionId(): Promise<string> {
  const c = await cookies();
  let id = c.get("mock-session-id")?.value;
  if (!id) {
    id = `sess_${crypto.randomUUID()}`;
    c.set("mock-session-id", id, { httpOnly: true, sameSite: "lax", path: "/" });
  }
  return id;
}

export async function startMockAdminSessionAction(formData: FormData): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("Production auth is reserved for PR11.");
  const token = String(formData.get("adminToken") ?? "").trim();
  if (!process.env.MOCK_ADMIN_TOKEN || token !== process.env.MOCK_ADMIN_TOKEN) throw new Error("Invalid admin token.");
  const c = await cookies();
  c.set("mock-admin-role", "admin", { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/admin");
}

export async function saveOnboardingAction(formData: FormData): Promise<void> {
  const sessionId = await getSessionId();
  const userId = String(formData.get("userId") ?? "user_mock_001").trim();
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
  const sessionId = await getSessionId();
  approveAndQueueAuthorized({
    sessionId,
    resultId: String(formData.get("resultId") ?? ""),
    actorId: String(formData.get("actorId") ?? "dev_admin_mock"),
    isProduction: process.env.NODE_ENV === "production",
    sessionRole: c.get("mock-admin-role")?.value,
  });
  redirect("/admin");
}
