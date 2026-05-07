import { createHash, timingSafeEqual } from "node:crypto";
import { ENTERTAINMENT_DISCLAIMER, UNKNOWN_BIRTH_TIME_WARNING, buildSubscriptionSummary, containsUnsafeUserFacingLeak, type SafeHoroscopeView } from "./beta-user-ux";
import { type MockMvpState, type PeriodType } from "./mock-flow";
import { canAccessPeriod, type SubscriptionRecord } from "./subscription-lifecycle";

export type BetaAccessStatus = "not_invited"|"invited"|"enrolled"|"waitlisted"|"revoked"|"disabled";
export type BetaInviteKind = "invite_code"|"allowlisted_email"|"allowlisted_user";
export interface BetaInvite {
  id:string;
  kind:BetaInviteKind;
  status:Exclude<BetaAccessStatus, "not_invited"|"enrolled">;
  codeHash?:string;
  emailHash?:string;
  userId?:string;
  createdAt:string;
  updatedAt:string;
}
export interface BetaEnrollment {
  userId:string;
  status:BetaAccessStatus;
  inviteId?:string;
  enrolledAt?:string;
  updatedAt:string;
}
export interface BetaInviteValidationResult {
  ok:boolean;
  status:BetaAccessStatus;
  inviteId?:string;
  errorCode?:string;
}
export interface BetaLaunchCopy {
  landingWelcome:string;
  onboardingExplanation:string;
  entertainmentDisclaimer:string;
  unknownBirthTimeLimitation:string;
  subscriptionBetaLimitation:string;
  privacyExportDeleteExplanation:string;
  notificationPreferenceExplanation:string;
  lineEmailConnectionExplanation:string;
  feedbackRequest:string;
  supportContactPlaceholder:string;
}
export interface BetaLaunchView {
  accessStatus:BetaAccessStatus;
  allowed:boolean;
  title:string;
  summary:string;
  bullets:string[];
  disclaimers:string[];
}
export interface BetaLaunchState {
  invites:BetaInvite[];
  enrollments:BetaEnrollment[];
  nextInviteSeq:number;
}

export const BETA_INVITE_SCOPE_ID = "__beta_invites__";

const MOCK_INVITE_HASH_NAMESPACE = "mock-beta-invite-v1";
const MOCK_EMAIL_HASH_NAMESPACE = "mock-beta-email-v1";
const betaStates = new Map<string, BetaLaunchState>();

const betaLaunchCopy:BetaLaunchCopy = {
  landingWelcome:"ยินดีต้อนรับสู่ beta ของบริการอ่านดวงแบบสมาชิก พื้นที่นี้เปิดให้ผู้ทดสอบกลุ่มเล็กลองใช้งานและช่วยสะท้อนประสบการณ์ก่อนเปิดวงกว้าง",
  onboardingExplanation:"เริ่มจากข้อมูลเกิดเท่าที่คุณสะดวกให้ ระบบจะใช้เพื่อสร้างผลอ่านในโหมดทดลอง และคุณสามารถกลับมาแก้ไขหรือลบข้อมูลได้",
  entertainmentDisclaimer:ENTERTAINMENT_DISCLAIMER,
  unknownBirthTimeLimitation:UNKNOWN_BIRTH_TIME_WARNING,
  subscriptionBetaLimitation:"ผลลัพธ์บางส่วนเป็นระบบทดลอง และสิทธิ์ beta ไม่ได้แทนสิทธิ์ subscription รายเดือน รายปี หรือสิทธิ์ premium อื่น ๆ",
  privacyExportDeleteExplanation:"คุณสามารถขอ export ข้อมูล ลบข้อมูลเกิด หรือส่งคำขอลบบัญชีได้จากหน้า privacy controls โดย beta enrollment ไม่ปิดกั้นสิทธิ์เหล่านี้",
  notificationPreferenceExplanation:"ตั้งค่าการแจ้งเตือนได้ตามหัวข้อที่ต้องการ หากปิดรับ ระบบ mock จะไม่คิวข้อความในหัวข้อนั้น",
  lineEmailConnectionExplanation:"LINE และ Email เป็นช่องทางรับข้อมูลที่แยกจากกัน ใน beta นี้ใช้ mock หรือ sandbox ตามการตั้งค่าเท่านั้น และไม่ส่งแคมเปญจริงโดยไม่มีการอนุมัติ",
  feedbackRequest:"หลังทดลองใช้งาน ช่วยบอกเราว่าส่วนใดอ่านเข้าใจง่าย ส่วนใดควรปรับ และข้อจำกัด beta ชัดเจนพอหรือไม่",
  supportContactPlaceholder:"ช่องทางติดต่อทีม beta: โปรดใช้ช่องทางที่ทีมกำหนด และอย่าส่งรหัส invite ข้อมูลเกิดเต็ม หรือข้อมูลดิบจากผู้ให้บริการในพื้นที่สาธารณะ",
};

const prohibitedUnsafeCopyPatterns = [
  /ต้องเกิดขึ้นแน่นอน/u,
  /รวยแน่/u,
  /ตาย/u,
  /อุบัติเหตุแน่นอน/u,
  /โรคร้ายแน่นอน/u,
  /หวย/u,
  /แม่น\s*100%/u,
  /ลงทุน.+(ต้อง|ควรซื้อ|รวย)/u,
  /คำแนะนำทางกฎหมาย/u,
  /วินิจฉัย/u,
];

export function resetBetaLaunchState(sessionId = BETA_INVITE_SCOPE_ID):void {
  betaStates.set(sessionId, { invites:[], enrollments:[], nextInviteSeq:1 });
}

export function getBetaLaunchState(sessionId = BETA_INVITE_SCOPE_ID):BetaLaunchState {
  return structuredClone(getState(sessionId));
}

export function getBetaLaunchCopy():BetaLaunchCopy {
  return structuredClone(betaLaunchCopy);
}

export function getBetaDisclaimers(input:{ birthTimeUnknown?:boolean } = {}):string[] {
  return [
    betaLaunchCopy.entertainmentDisclaimer,
    betaLaunchCopy.subscriptionBetaLimitation,
    ...(input.birthTimeUnknown ? [betaLaunchCopy.unknownBirthTimeLimitation] : []),
  ];
}

export function assertBetaCopySafe(copy:unknown = betaLaunchCopy):void {
  const text = JSON.stringify(copy);
  for (const pattern of prohibitedUnsafeCopyPatterns) {
    if (pattern.test(text)) throw new Error("Unsafe beta copy is not allowed.");
  }
  if (containsUnsafeUserFacingLeak(copy)) throw new Error("Beta copy must not expose PII, secrets, or internal identifiers.");
}

export function createBetaInvite(input:{ sessionId?:string; inviteCode?:string; email?:string; userId?:string; status?:BetaInvite["status"]; now?:Date }):BetaInvite {
  const state = getState(input.sessionId ?? BETA_INVITE_SCOPE_ID);
  const nowIso = (input.now ?? new Date("2026-05-08T09:00:00.000Z")).toISOString();
  const inviteCode = input.inviteCode ? normalizeInviteCode(input.inviteCode) : undefined;
  const email = input.email?.trim() || undefined;
  const userId = input.userId?.trim() || undefined;
  if (!inviteCode && !email && !userId) throw new Error("Beta invite requires a code, email allowlist, or user allowlist.");
  const invite:BetaInvite = {
    id:`beta_invite_${state.nextInviteSeq++}`,
    kind:inviteCode ? "invite_code" : email ? "allowlisted_email" : "allowlisted_user",
    status:input.status ?? "invited",
    codeHash:inviteCode ? hashInviteCode(inviteCode) : undefined,
    emailHash:email ? hashEmail(email) : undefined,
    userId,
    createdAt:nowIso,
    updatedAt:nowIso,
  };
  state.invites.push(invite);
  return structuredClone(invite);
}

export function revokeBetaInvite(input:{ sessionId?:string; inviteId:string; now?:Date }):BetaInvite {
  return updateBetaInviteStatus({ ...input, status:"revoked" });
}

export function updateBetaInviteStatus(input:{ sessionId?:string; inviteId:string; status:BetaInvite["status"]; now?:Date }):BetaInvite {
  const invite = getState(input.sessionId ?? BETA_INVITE_SCOPE_ID).invites.find((item)=>item.id === input.inviteId);
  if (!invite) throw new Error("Beta invite not found.");
  invite.status = input.status;
  invite.updatedAt = (input.now ?? new Date("2026-05-08T09:01:00.000Z")).toISOString();
  return structuredClone(invite);
}

export function validateBetaInviteCode(input:{ sessionId?:string; inviteCode:string }):BetaInviteValidationResult {
  const normalized = normalizeInviteCode(input.inviteCode);
  if (!normalized) return { ok:false, status:"not_invited", errorCode:"invalid_beta_invite" };
  const codeHash = hashInviteCode(normalized);
  const invite = getState(input.sessionId ?? BETA_INVITE_SCOPE_ID).invites.find((item)=>item.kind === "invite_code" && item.codeHash && constantTimeEqual(item.codeHash, codeHash));
  if (!invite) return { ok:false, status:"not_invited", errorCode:"invalid_beta_invite" };
  if (invite.status !== "invited") return { ok:false, status:invite.status, inviteId:invite.id, errorCode:"beta_invite_unavailable" };
  return { ok:true, status:"invited", inviteId:invite.id };
}

export function enrollBetaUser(input:{ sessionId?:string; inviteSessionId?:string; userId:string; inviteCode?:string; email?:string; emailVerified?:boolean; now?:Date }):BetaEnrollment {
  const state = getState(input.sessionId);
  const existing = state.enrollments.find((item)=>item.userId === input.userId);
  if (existing?.status === "enrolled") return structuredClone(existing);
  const invite = resolveInviteForEnrollment(getState(input.inviteSessionId ?? BETA_INVITE_SCOPE_ID), input);
  if (!invite) throw new Error("Invalid beta invite.");
  if (invite.status !== "invited") throw new Error("Beta invite is unavailable.");
  const nowIso = (input.now ?? new Date("2026-05-08T09:02:00.000Z")).toISOString();
  const enrollment:BetaEnrollment = { userId:input.userId, status:"enrolled", inviteId:invite.id, enrolledAt:nowIso, updatedAt:nowIso };
  if (existing) Object.assign(existing, enrollment);
  else state.enrollments.push(enrollment);
  return structuredClone(enrollment);
}

export function setBetaEnrollmentStatus(input:{ sessionId?:string; userId:string; status:BetaAccessStatus; inviteId?:string; now?:Date }):BetaEnrollment {
  const state = getState(input.sessionId);
  const nowIso = (input.now ?? new Date("2026-05-08T09:03:00.000Z")).toISOString();
  const existing = state.enrollments.find((item)=>item.userId === input.userId);
  const enrollment:BetaEnrollment = { userId:input.userId, status:input.status, inviteId:input.inviteId ?? existing?.inviteId, enrolledAt:input.status === "enrolled" ? existing?.enrolledAt ?? nowIso : existing?.enrolledAt, updatedAt:nowIso };
  if (existing) Object.assign(existing, enrollment);
  else state.enrollments.push(enrollment);
  return structuredClone(enrollment);
}

export function isBetaUserAllowed(input:{ state?:MockMvpState; sessionId?:string; inviteSessionId?:string; userId:string; email?:string; emailVerified?:boolean }):BetaAccessStatus {
  if (input.state?.deactivatedUserIds[input.userId]) return "disabled";
  const state = getState(input.sessionId);
  const enrollment = state.enrollments.find((item)=>item.userId === input.userId);
  const inviteState = getState(input.inviteSessionId ?? BETA_INVITE_SCOPE_ID);
  if (enrollment) return statusFromEnrollment(enrollment, inviteState);
  const userInvite = inviteState.invites.find((item)=>item.kind === "allowlisted_user" && item.userId === input.userId);
  if (userInvite) return userInvite.status;
  if (input.email && input.emailVerified) {
    const emailHash = hashEmail(input.email);
    const emailInvite = inviteState.invites.find((item)=>item.kind === "allowlisted_email" && item.emailHash && constantTimeEqual(item.emailHash, emailHash));
    if (emailInvite) return emailInvite.status;
  }
  return "not_invited";
}

function statusFromEnrollment(enrollment:BetaEnrollment, inviteState:BetaLaunchState):BetaAccessStatus {
  if (enrollment.status !== "enrolled" || !enrollment.inviteId) return enrollment.status;
  const invite = inviteState.invites.find((item)=>item.id === enrollment.inviteId);
  if (!invite) return "revoked";
  return invite.status === "invited" ? "enrolled" : invite.status;
}

export function canAccessBetaOnlyFlow(input:{ state?:MockMvpState; sessionId?:string; inviteSessionId?:string; userId:string; email?:string; emailVerified?:boolean }):boolean {
  const status = isBetaUserAllowed(input);
  return status === "enrolled" || status === "invited";
}

export function canAccessBetaEntitledPeriod(input:{ state:MockMvpState; sessionId?:string; inviteSessionId?:string; userId:string; periodType:PeriodType; subscription?:SubscriptionRecord; now?:Date }):boolean {
  if (!canAccessBetaOnlyFlow(input)) return false;
  const summary = buildSubscriptionSummary({ state:input.state, userId:input.userId, subscription:input.subscription, now:input.now });
  return canAccessPeriod({ subscription:input.subscription, planCode:summary.planCode, periodType:input.periodType, now:input.now });
}

export function buildBetaLaunchView(input:{ state?:MockMvpState; sessionId?:string; inviteSessionId?:string; userId?:string; email?:string; emailVerified?:boolean; horoscope?:SafeHoroscopeView; birthTimeUnknown?:boolean } = {}):BetaLaunchView {
  const accessStatus = input.userId ? isBetaUserAllowed({ state:input.state, sessionId:input.sessionId, inviteSessionId:input.inviteSessionId, userId:input.userId, email:input.email, emailVerified:input.emailVerified }) : "not_invited";
  const allowed = accessStatus === "invited" || accessStatus === "enrolled";
  const copy = getBetaLaunchCopy();
  const view:BetaLaunchView = {
    accessStatus,
    allowed,
    title:"Beta launch",
    summary:copy.landingWelcome,
    bullets:[
      copy.onboardingExplanation,
      copy.subscriptionBetaLimitation,
      copy.privacyExportDeleteExplanation,
      copy.notificationPreferenceExplanation,
      copy.lineEmailConnectionExplanation,
      copy.feedbackRequest,
      copy.supportContactPlaceholder,
    ],
    disclaimers:getBetaDisclaimers({ birthTimeUnknown:input.birthTimeUnknown }),
  };
  assertBetaCopySafe(view);
  return view;
}

export function safeBetaInviteForAdmin(invite:BetaInvite):Omit<BetaInvite, "codeHash"|"emailHash"|"userId"> & { identifier:string } {
  return {
    id:invite.id,
    kind:invite.kind,
    status:invite.status,
    createdAt:invite.createdAt,
    updatedAt:invite.updatedAt,
    identifier:invite.kind,
  };
}

function resolveInviteForEnrollment(state:BetaLaunchState, input:{ inviteCode?:string; email?:string; emailVerified?:boolean; userId:string }):BetaInvite|undefined {
  if (input.inviteCode) {
    const codeHash = hashInviteCode(input.inviteCode);
    return state.invites.find((item)=>item.kind === "invite_code" && item.codeHash && constantTimeEqual(item.codeHash, codeHash));
  }
  if (input.email && input.emailVerified) {
    const emailHash = hashEmail(input.email);
    const emailInvite = state.invites.find((item)=>item.kind === "allowlisted_email" && item.emailHash && constantTimeEqual(item.emailHash, emailHash));
    if (emailInvite) return emailInvite;
  }
  return state.invites.find((item)=>item.kind === "allowlisted_user" && item.userId === input.userId);
}

function getState(sessionId = "dev-default"):BetaLaunchState {
  const key = sessionId.trim() || "dev-default";
  if (!betaStates.has(key)) resetBetaLaunchState(key);
  return betaStates.get(key)!;
}

function normalizeInviteCode(inviteCode:string):string {
  return inviteCode.trim().toUpperCase().replace(/\s+/g, "");
}

function hashInviteCode(inviteCode:string):string {
  return createHash("sha256").update(`${MOCK_INVITE_HASH_NAMESPACE}:${normalizeInviteCode(inviteCode)}`).digest("hex");
}

function hashEmail(email:string):string {
  return createHash("sha256").update(`${MOCK_EMAIL_HASH_NAMESPACE}:${email.trim().toLowerCase()}`).digest("hex");
}

function constantTimeEqual(a:string, b:string):boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
