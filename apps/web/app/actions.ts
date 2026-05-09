"use server";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID, approveAndQueueWithAdminCookie, approveContentBatchWithAdminCookie, authorizeAdminRoute, createBetaInviteWithAdminCookie, recordAdminSessionStartedWithAdminCookie, rejectContentBatchWithAdminCookie, rejectDraftWithAdminCookie, revokeBetaInviteWithAdminCookie, startDevMockAdminSessionForToken } from "../src/mvp/admin-auth";
import { BETA_INVITE_SCOPE_ID, canAccessBetaOnlyFlow, enrollBetaUser, ensureLocalMockBetaInvite } from "../src/mvp/beta-launch";
import { buildBetaMockSubscriptionWindow, validateOnboardingFields } from "../src/mvp/beta-user-ux";
import { CONTENT_PREVIEW_APPROVAL_SESSION_ID } from "../src/mvp/content-preview-approval";
import { readDeploymentEnvironment } from "../src/mvp/environment-validation";
import { callMockAstroCalc, deleteBirthProfile, exportUserData, generateHoroscopeResult, getMockMvpState, getMockPeriodKey, recordAdminAudit, requestAccountDeletion, saveBirthProfile, setMockUserPlan, setNotificationPreference, storeChartSnapshot, unsubscribeNotifications, type PeriodType, type PlanCode } from "../src/mvp/mock-flow";
import { processMockSubscriptionWebhook } from "../src/mvp/subscription-lifecycle";

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
    deploymentEnvironment: readDeploymentEnvironment(),
  });
  const c = await cookies();
  if (!cookieValue) {
    recordAdminAudit(UNAUTHENTICATED_ADMIN_AUDIT_SESSION_ID, "anonymous", "admin_access_denied", `admin_sign_in_${crypto.randomUUID()}`, { reason: "invalid_admin_token", path: "/admin/sign-in" });
    throw new Error("Unauthorized admin sign-in.");
  }

  recordAdminSessionStartedWithAdminCookie({
    sessionCookie: cookieValue,
    sessionSecret: process.env.ADMIN_SESSION_SECRET,
  });

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
  const state = getMockMvpState(sessionId);
  if (!canAccessBetaOnlyFlow({ state, sessionId, userId })) throw new Error("Beta invite is required before onboarding.");
  if (!state.userPlans[userId]) setMockUserPlan(userId, "free", sessionId);
  const validation = validateOnboardingFields({
    birthDate:formData.get("birthDate"),
    birthTime:formData.get("birthTime"),
    birthTimeUnknown:formData.get("birthTimeUnknown"),
    birthPlaceText:formData.get("birthPlaceText"),
    timezone:formData.get("timezone"),
    consentBirthData:formData.get("consentBirthData"),
  });
  if (!validation.ok) throw new Error(validation.errors.map((error)=>error.message).join(", "));
  for (const existingProfile of state.birthProfiles.filter((profile)=>profile.userId === userId)) {
    deleteBirthProfile({ sessionId, userId }, existingProfile.id);
  }
  const profile = saveBirthProfile(validation.normalized, { sessionId, userId });
  const chartSnapshot = storeChartSnapshot(callMockAstroCalc(profile), sessionId);
  for (const periodType of ["daily", "weekly", "monthly", "yearly"] as PeriodType[]) {
    generateHoroscopeResult({ chartSnapshot, periodType, periodKey: getMockPeriodKey(periodType), sessionId });
  }
  redirect("/chart-preview?mode=user");
}

export async function selectMockPlanAction(formData: FormData): Promise<void> {
  const { sessionId, userId } = await requireSessionContext();
  const planCode = String(formData.get("planCode") ?? "free") as PlanCode;
  if (!["free", "basic", "premium"].includes(planCode)) throw new Error("Invalid plan.");
  setMockUserPlan(userId, planCode, sessionId);
  if (planCode !== "free") {
    const window = buildBetaMockSubscriptionWindow();
    await processMockSubscriptionWebhook({
      id:`evt_beta_plan_${crypto.randomUUID()}`,
      type:"subscription.created",
      subscriptionId:`sub_beta_${crypto.randomUUID()}`,
      userId,
      planCode,
      status:"active",
      currentPeriodStart:window.currentPeriodStart,
      currentPeriodEnd:window.currentPeriodEnd,
      occurredAt:window.currentPeriodStart,
    });
  }
  redirect("/account");
}

export async function enrollBetaUserAction(formData: FormData): Promise<void> {
  const { sessionId, userId } = await getOrCreateSessionContext();
  ensureLocalMockBetaInvite({ deploymentEnvironment:readDeploymentEnvironment() });
  const inviteCode = String(formData.get("inviteCode") ?? "").trim();
  try {
    enrollBetaUser({ sessionId, userId, inviteCode:inviteCode || undefined });
  } catch {
    throw new Error("Invalid beta invite.");
  }
  redirect("/beta");
}

export async function saveNotificationPreferenceAction(formData: FormData): Promise<void> {
  const { sessionId, userId } = await requireSessionContext();
  const topicCode = String(formData.get("topicCode") ?? "all");
  const enabled = String(formData.get("enabled") ?? "false") === "true";
  setNotificationPreference({ sessionId, userId }, topicCode, enabled);
  redirect("/settings/notifications");
}

export async function unsubscribeNotificationsAction(formData: FormData): Promise<void> {
  const { sessionId, userId } = await requireSessionContext();
  unsubscribeNotifications({ sessionId, userId }, String(formData.get("topicCode") ?? "all"));
  redirect("/settings/notifications");
}

export async function deleteBirthProfileAction(birthProfileId: string): Promise<void> {
  const { sessionId, userId } = await requireSessionContext();
  const state = getMockMvpState(sessionId);
  const profile = state.birthProfiles.find((item)=>item.userId === userId && item.id === birthProfileId);
  if (profile) deleteBirthProfile({ sessionId, userId }, profile.id);
  redirect("/settings/privacy");
}

export async function requestAccountDeletionAction(): Promise<void> {
  const { sessionId, userId } = await requireSessionContext();
  requestAccountDeletion({ sessionId, userId });
  redirect("/settings/privacy");
}

export async function exportMyDataAction(): Promise<void> {
  const { sessionId, userId } = await requireSessionContext();
  exportUserData({ sessionId, userId });
  redirect("/settings/privacy");
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

export async function approveContentBatchAction(formData: FormData): Promise<void> {
  const c = await cookies();
  await requireAdminSession("/admin/content-preview");
  approveContentBatchWithAdminCookie({
    sessionId: CONTENT_PREVIEW_APPROVAL_SESSION_ID,
    batchId: String(formData.get("batchId") ?? ""),
    sessionCookie: c.get(ADMIN_COOKIE_NAME)?.value,
    sessionSecret: process.env.ADMIN_SESSION_SECRET,
  });
  redirect("/admin/content-preview");
}

export async function rejectContentBatchAction(formData: FormData): Promise<void> {
  const c = await cookies();
  await requireAdminSession("/admin/content-preview");
  rejectContentBatchWithAdminCookie({
    sessionId: CONTENT_PREVIEW_APPROVAL_SESSION_ID,
    batchId: String(formData.get("batchId") ?? ""),
    sessionCookie: c.get(ADMIN_COOKIE_NAME)?.value,
    sessionSecret: process.env.ADMIN_SESSION_SECRET,
  });
  redirect("/admin/content-preview");
}

export async function createBetaInviteAction(formData: FormData): Promise<void> {
  const c = await cookies();
  const adminSession = await requireAdminSession("/admin/beta");
  createBetaInviteWithAdminCookie({
    sessionId: BETA_INVITE_SCOPE_ID,
    inviteCode: String(formData.get("inviteCode") ?? "").trim() || undefined,
    email: String(formData.get("email") ?? "").trim() || undefined,
    userId: String(formData.get("userId") ?? "").trim() || undefined,
    sessionCookie: c.get(ADMIN_COOKIE_NAME)?.value,
    sessionSecret: process.env.ADMIN_SESSION_SECRET,
  });
  redirect("/admin/beta");
}

export async function revokeBetaInviteAction(formData: FormData): Promise<void> {
  const c = await cookies();
  const adminSession = await requireAdminSession("/admin/beta");
  revokeBetaInviteWithAdminCookie({
    sessionId: BETA_INVITE_SCOPE_ID,
    inviteId: String(formData.get("inviteId") ?? ""),
    sessionCookie: c.get(ADMIN_COOKIE_NAME)?.value,
    sessionSecret: process.env.ADMIN_SESSION_SECRET,
  });
  redirect("/admin/beta");
}
