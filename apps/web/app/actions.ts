"use server";

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

export async function approveAndQueueAction(formData: FormData): Promise<void> {
  const resultId = String(formData.get("resultId") ?? "");
  const approved = approveDraft(resultId);
  const message = queueMockOutboundMessage(approved.id);
  recordMockDeliveryAttempt(message.id);
  redirect("/admin");
}
