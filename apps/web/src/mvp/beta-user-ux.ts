import { getMockSubscriptionState, canAccessPeriod, type PlanCode, type SubscriptionRecord, type SubscriptionStatus } from "./subscription-lifecycle";
import { type BirthProfile, type MockMvpState, type PeriodType } from "./mock-flow";

export const ENTERTAINMENT_DISCLAIMER = "เนื้อหานี้จัดทำเพื่อความบันเทิงและการทบทวนตนเองเท่านั้น ไม่ใช่คำแนะนำทางการแพทย์ การเงิน กฎหมาย หรือการตัดสินใจที่มีความเสี่ยงสูง";
export const UNKNOWN_BIRTH_TIME_WARNING = "กรณีไม่ทราบเวลาเกิด ผลบางส่วนอาจเป็นค่าประมาณ และจะหลีกเลี่ยงการตีความที่ต้องใช้ลัคนาหรือเรือนอย่างมั่นใจ";

export type NotificationTopicCode = "daily_horoscope"|"weekly_horoscope"|"monthly_horoscope"|"yearly_horoscope";
export type UserFacingChannel = "line"|"email";
export type OnboardingField = "birthDate"|"birthTime"|"birthPlaceText"|"timezone"|"consentBirthData";
export type PlanDisplayStatus = SubscriptionStatus|"free";

export interface OnboardingValidationResult {
  ok:boolean;
  errors:Array<{ field:OnboardingField; message:string }>;
  normalized:{
    birthDate:string;
    birthTime:string;
    birthTimeUnknown:boolean;
    birthPlaceText:string;
    timezone:string;
    consentBirthData:boolean;
  };
}

export interface UserSubscriptionSummary {
  planCode:PlanCode;
  status:PlanDisplayStatus;
  statusLabel:string;
  periodAccess:Record<PeriodType, boolean>;
}

export interface SafeBirthProfileSummary {
  hasProfile:boolean;
  birthDateLabel:string;
  birthTimeLabel:string;
  birthPlaceLabel:string;
  timezoneLabel:string;
  confidenceLabel:string;
  warnings:string[];
}

export interface ChannelStatusSummary {
  channel:UserFacingChannel;
  label:string;
  status:"connected"|"pending"|"blocked"|"not_connected";
  detail:string;
}

export interface NotificationPreferenceSummary {
  topicCode:NotificationTopicCode;
  label:string;
  lineEnabled:boolean;
  emailEnabled:boolean;
}

export interface SafeHoroscopeView {
  periodType:PeriodType;
  periodLabel:string;
  allowed:boolean;
  planCode:PlanCode;
  title:string;
  summary:string;
  sections:Array<{ heading:string; body:string }>;
  warnings:string[];
  disclaimer:string;
}

export interface BetaMockSubscriptionWindow {
  currentPeriodStart:string;
  currentPeriodEnd:string;
}

const periodLabels:Record<PeriodType,string> = {
  daily:"วันนี้",
  weekly:"สัปดาห์นี้",
  monthly:"เดือนนี้",
  yearly:"ปีนี้",
};

const topicLabels:Record<NotificationTopicCode,string> = {
  daily_horoscope:"ดวงรายวัน",
  weekly_horoscope:"ดวงรายสัปดาห์",
  monthly_horoscope:"ดวงรายเดือน",
  yearly_horoscope:"ดวงรายปี",
};

export function validateOnboardingFields(input:Record<string, unknown>):OnboardingValidationResult {
  const birthTimeUnknown = input.birthTimeUnknown === "on" || input.birthTimeUnknown === "true" || input.birthTimeUnknown === true;
  const normalized = {
    birthDate:String(input.birthDate ?? "").trim(),
    birthTime:birthTimeUnknown ? "" : String(input.birthTime ?? "").trim(),
    birthTimeUnknown,
    birthPlaceText:String(input.birthPlaceText ?? "").trim(),
    timezone:String(input.timezone ?? "").trim(),
    consentBirthData:input.consentBirthData === "on" || input.consentBirthData === "true" || input.consentBirthData === true,
  };
  const errors:OnboardingValidationResult["errors"] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.birthDate)) errors.push({ field:"birthDate", message:"กรุณาระบุวันเกิดให้ถูกต้อง" });
  if (!normalized.birthTimeUnknown && !/^\d{2}:\d{2}$/.test(normalized.birthTime)) errors.push({ field:"birthTime", message:"กรุณาระบุเวลาเกิด หรือเลือกไม่ทราบเวลาเกิด" });
  if (!normalized.birthPlaceText) errors.push({ field:"birthPlaceText", message:"กรุณาระบุสถานที่เกิด" });
  if (!normalized.timezone) errors.push({ field:"timezone", message:"กรุณาระบุ timezone" });
  if (!normalized.consentBirthData) errors.push({ field:"consentBirthData", message:"ต้องยินยอมให้ใช้ข้อมูลเกิดเพื่อคำนวณดวง" });
  return { ok:errors.length === 0, errors, normalized };
}

export function getLatestUserSubscription(userId:string):SubscriptionRecord|undefined {
  return getMockSubscriptionState().subscriptions
    .map((subscription,index)=>({ subscription, index }))
    .filter((item)=>item.subscription.userId === userId)
    .sort((a,b)=>Date.parse(b.subscription.updatedAt)-Date.parse(a.subscription.updatedAt) || b.index-a.index)[0]?.subscription;
}

export function buildSubscriptionSummary(input:{ state:MockMvpState; userId:string; subscription?:SubscriptionRecord; now?:Date }):UserSubscriptionSummary {
  const selectedPlanCode = input.state.userPlans[input.userId];
  const subscription = selectedPlanCode === "free" ? undefined : input.subscription;
  const planCode = subscription?.planCode ?? selectedPlanCode ?? "free";
  const status = subscription?.status ?? "free";
  return {
    planCode,
    status,
    statusLabel:statusLabel(status),
    periodAccess:{
      daily:canAccessPeriod({ subscription, planCode, periodType:"daily", now:input.now }),
      weekly:canAccessPeriod({ subscription, planCode, periodType:"weekly", now:input.now }),
      monthly:canAccessPeriod({ subscription, planCode, periodType:"monthly", now:input.now }),
      yearly:canAccessPeriod({ subscription, planCode, periodType:"yearly", now:input.now }),
    },
  };
}

export function buildBirthProfileSummary(profile:BirthProfile|undefined):SafeBirthProfileSummary {
  if (!profile) {
    return { hasProfile:false, birthDateLabel:"ยังไม่มีข้อมูล", birthTimeLabel:"ยังไม่มีข้อมูล", birthPlaceLabel:"ยังไม่มีข้อมูล", timezoneLabel:"ยังไม่มีข้อมูล", confidenceLabel:"ยังไม่พร้อมคำนวณ", warnings:["กรุณาเพิ่มข้อมูลเกิดก่อนอ่านดวงแบบปรับตามโปรไฟล์"] };
  }
  const warnings = profile.birthTimeUnknown ? [UNKNOWN_BIRTH_TIME_WARNING] : [];
  return {
    hasProfile:true,
    birthDateLabel:profile.birthDate,
    birthTimeLabel:profile.birthTimeUnknown ? "ไม่ทราบเวลาเกิด" : profile.birthTime ?? "ไม่ระบุ",
    birthPlaceLabel:profile.birthPlaceText,
    timezoneLabel:profile.timezone,
    confidenceLabel:profile.birthTimeUnknown ? "ประมาณบางส่วน" : "พร้อมคำนวณแบบเต็มขึ้น",
    warnings,
  };
}

export function buildNotificationPreferenceSummary(state:MockMvpState, userId:string):NotificationPreferenceSummary[] {
  return (Object.keys(topicLabels) as NotificationTopicCode[]).map((topicCode)=> {
    const disabled = state.notificationPreferences.some((preference)=>preference.userId===userId && !preference.enabled && (preference.topicCode==="all" || preference.topicCode===topicCode));
    return { topicCode, label:topicLabels[topicCode], lineEnabled:!disabled, emailEnabled:!disabled };
  });
}

export function buildChannelStatusSummary(input:{ maskedEmail?:string; emailVerified?:boolean; emailUnsubscribed?:boolean; lineConnected?:boolean; lineFollowed?:boolean; lineBlocked?:boolean }):ChannelStatusSummary[] {
  const emailStatus = input.maskedEmail ? input.emailVerified ? input.emailUnsubscribed ? "blocked" : "connected" : "pending" : "not_connected";
  const lineStatus = input.lineConnected ? input.lineBlocked ? "blocked" : input.lineFollowed === false ? "pending" : "connected" : "not_connected";
  return [
    { channel:"email", label:"Email", status:emailStatus, detail:input.maskedEmail ? `${input.maskedEmail} · ${emailStatusText(emailStatus)}` : "ยังไม่ได้เชื่อมต่อ email" },
    { channel:"line", label:"LINE", status:lineStatus, detail:lineStatusText(lineStatus) },
  ];
}

export function maskEmail(email:string):string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "email ถูกซ่อน";
  return `${local.slice(0,2)}***@${domain}`;
}

export function buildSafeHoroscopeView(input:{ state:MockMvpState; userId:string; periodType:PeriodType; subscription?:SubscriptionRecord; now?:Date }):SafeHoroscopeView {
  const subscription = buildSubscriptionSummary(input);
  const result = input.state.horoscopeResults.find((item)=>item.userId===input.userId && item.periodType===input.periodType);
  const profile = result ? input.state.birthProfiles.find((item)=>item.id===result.birthProfileId && item.userId===input.userId) : input.state.birthProfiles.find((item)=>item.userId===input.userId);
  const warnings = buildBirthProfileSummary(profile).warnings;
  if (!subscription.periodAccess[input.periodType]) {
    return {
      periodType:input.periodType,
      periodLabel:periodLabels[input.periodType],
      allowed:false,
      planCode:subscription.planCode,
      title:"แพ็กเกจปัจจุบันยังไม่เปิดอ่านหน้านี้",
      summary:`แผน ${subscription.planCode} เปิดอ่านตามสิทธิ์ปัจจุบัน โปรดดูหน้า subscription เพื่อเปรียบเทียบแพ็กเกจ`,
      sections:[],
      warnings,
      disclaimer:ENTERTAINMENT_DISCLAIMER,
    };
  }
  return {
    periodType:input.periodType,
    periodLabel:periodLabels[input.periodType],
    allowed:true,
    planCode:subscription.planCode,
    title:result?.content_json.title ?? `ดวง${periodLabels[input.periodType]}ยังไม่พร้อม`,
    summary:result?.content_json.summary ?? "ยังไม่มีผลลัพธ์ mock สำหรับช่วงนี้ กรุณาเริ่ม onboarding หรือกลับมาตรวจอีกครั้ง",
    sections:result?.content_json.sections ?? [],
    warnings,
    disclaimer:result?.content_json.disclaimer ?? ENTERTAINMENT_DISCLAIMER,
  };
}

export function buildBetaMockSubscriptionWindow(now=new Date()):BetaMockSubscriptionWindow {
  return {
    currentPeriodStart:now.toISOString(),
    currentPeriodEnd:new Date(now.getTime()+30*24*60*60*1000).toISOString(),
  };
}

export function containsUnsafeUserFacingLeak(value:unknown):boolean {
  const text = JSON.stringify(value);
  return /\bU[A-Za-z0-9]{8,}\b/.test(text) || /provider(Customer|Subscription|Payment|Checkout)|payment_[A-Za-z0-9_]+|calculation_hash|[a-f0-9]{32,}/i.test(text) || /secret|token|webhook/i.test(text);
}

function statusLabel(status:PlanDisplayStatus):string {
  const labels:Record<PlanDisplayStatus,string> = {
    free:"Free",
    trialing:"ทดลองใช้งาน",
    active:"ใช้งานอยู่",
    past_due:"รอชำระเงิน",
    canceled:"ยกเลิกแล้ว",
    expired:"หมดอายุ",
  };
  return labels[status];
}

function emailStatusText(status:ChannelStatusSummary["status"]):string {
  if (status === "connected") return "ยืนยันแล้ว";
  if (status === "pending") return "รอยืนยัน";
  if (status === "blocked") return "ปิดรับหรือมีปัญหาการส่ง";
  return "ยังไม่ได้เชื่อมต่อ";
}

function lineStatusText(status:ChannelStatusSummary["status"]):string {
  if (status === "connected") return "เชื่อมต่อและติดตามอยู่";
  if (status === "pending") return "เชื่อมต่อแล้วแต่ยังไม่พร้อมรับข้อความ";
  if (status === "blocked") return "ผู้ใช้ block หรือช่องทางไม่พร้อม";
  return "ยังไม่ได้เชื่อมต่อ LINE";
}
