"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  approveDraft,
  callMockAstroCalc,
  generateHoroscopeResult,
  getMockPeriodKey,
  queueMockOutboundMessage,
  recordMockDeliveryAttempt,
  saveBirthProfile,
  storeChartSnapshot,
  type PeriodType,
} from "../src/mvp/mock-flow";

export async function saveOnboardingAction(formData: FormData): Promise<void> {
  const birthTimeUnknown = formData.get("birthTimeUnknown") === "on";
  const profile = saveBirthProfile({
    birthDate: String(formData.get("birthDate") ?? ""),
    birthTime: String(formData.get("birthTime") ?? ""),
    birthTimeUnknown,
    birthPlaceText: String(formData.get("birthPlaceText") ?? ""),
    timezone: String(formData.get("timezone") ?? ""),
    consentBirthData: formData.get("consentBirthData") === "on",
  });
  const chartSnapshot = storeChartSnapshot(callMockAstroCalc(profile));

  for (const periodType of ["daily", "weekly", "monthly", "yearly"] as PeriodType[]) {
    generateHoroscopeResult({
      chartSnapshot,
      periodType,
      periodKey: getMockPeriodKey(periodType),
    });
  }

  redirect("/today");
}


async function requireDevAdminAuthorization(formData: FormData): Promise<string> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development admin guard is disabled in production. Production auth is reserved for PR11.");
  }

  const actorId = String(formData.get("actorId") ?? "dev_admin_mock").trim();
  const suppliedToken = String(formData.get("adminToken") ?? "").trim();
  const expectedToken = process.env.MOCK_ADMIN_TOKEN ?? "";
  const cookieStore = await cookies();
  const sessionRole = cookieStore.get("mock-admin-role")?.value;

  if (!expectedToken || suppliedToken !== expectedToken || sessionRole !== "admin") {
    throw new Error("Unauthorized: admin approval requires development admin session.");
  }

  return actorId || "dev_admin_mock";
}

export async function approveAndQueueAction(formData: FormData): Promise<void> {
  const actorId = await requireDevAdminAuthorization(formData);
  const resultId = String(formData.get("resultId") ?? "");
  const approved = approveDraft(resultId, actorId);
  const message = queueMockOutboundMessage(approved.id);
  recordMockDeliveryAttempt(message.id);
  redirect("/admin");
}
