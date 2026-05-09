import { ENTERTAINMENT_DISCLAIMER } from "./beta-user-ux";
import { renderLineHoroscopePreviewFlex, type LineChannelAccount, type LineInboundEventType, type LineMessage, type LinePushMessage, type LineTextMessage } from "./line-gateway";
import { type MockMvpState, type PeriodType } from "./mock-flow";
import { buildPeriodHoroscopeView, type HoroscopeSourceMode, type PeriodHoroscopeView } from "./period-horoscope-view";
import { type SubscriptionRecord } from "./subscription-lifecycle";

export type LineCommandIntent =
  | "follow"
  | "help"
  | "today"
  | "weekly"
  | "monthly"
  | "yearly"
  | "onboarding"
  | "profile"
  | "subscription"
  | "notification_settings"
  | "privacy"
  | "unknown";

export interface LineFirstReply {
  intent:LineCommandIntent;
  suppressed:boolean;
  reason?:string;
  messages:LinePushMessage[];
  metadata?:{
    periodType?:PeriodType;
    periodKey?:string;
    sourceMode?:HoroscopeSourceMode;
    contentProfileCode?:string;
  };
}

export interface LineRichMenuTemplate {
  name:string;
  chatBarText:string;
  actions:Array<{ label:string; type:"message"|"uri"; text?:string; uri?:string }>;
}

const LINE_FIRST_DISCLAIMER = "เพื่อความบันเทิงและการสะท้อนตนเอง โปรดใช้วิจารณญาณ ไม่ใช่คำแนะนำทางการแพทย์ การเงิน หรือกฎหมาย";

const periodByIntent:Partial<Record<LineCommandIntent, PeriodType>> = {
  today:"daily",
  weekly:"weekly",
  monthly:"monthly",
  yearly:"yearly",
};

const periodText:Record<PeriodType, { label:string; topicCode:string; path:string }> = {
  daily:{ label:"วันนี้", topicCode:"daily_horoscope", path:"/today" },
  weekly:{ label:"สัปดาห์", topicCode:"weekly_horoscope", path:"/weekly" },
  monthly:{ label:"เดือน", topicCode:"monthly_horoscope", path:"/monthly" },
  yearly:{ label:"ปี", topicCode:"yearly_horoscope", path:"/yearly" },
};

export function parseLineCommandIntent(input:{ eventType?:LineInboundEventType; messageText?:string; postbackData?:string }):LineCommandIntent {
  if (input.eventType === "follow") return "follow";
  const postbackIntent = intentFromPostback(input.postbackData);
  if (postbackIntent) return postbackIntent;
  const text = normalizeThaiCommand(input.messageText ?? "");
  if (!text) return input.eventType === "message" ? "unknown" : "help";
  if (["help", "ช่วยเหลือ", "เมนู", "menu"].includes(text)) return "help";
  if (["ดวงวันนี้", "ดูดวงวันนี้", "วันนี้"].includes(text)) return "today";
  if (["ดวงสัปดาห์", "ดูดวงสัปดาห์", "สัปดาห์"].includes(text)) return "weekly";
  if (["ดวงเดือน", "ดูดวงเดือน", "เดือน"].includes(text)) return "monthly";
  if (["ดวงปี", "ดูดวงปี", "ปี"].includes(text)) return "yearly";
  if (["กรอกข้อมูลเกิด", "เริ่มต้น", "เริ่มใช้งาน"].includes(text)) return "onboarding";
  if (["แก้ข้อมูลเกิด", "โปรไฟล์", "ข้อมูลเกิด"].includes(text)) return "profile";
  if (["สมัครสมาชิก", "แพ็กเกจของฉัน", "แพ็กเกจ", "subscription"].includes(text)) return "subscription";
  if (["ตั้งค่า", "ตั้งค่าการแจ้งเตือน", "แจ้งเตือน"].includes(text)) return "notification_settings";
  if (["ข้อมูลส่วนตัว", "ความเป็นส่วนตัว", "privacy"].includes(text)) return "privacy";
  return "unknown";
}

export async function buildLineFirstReply(input:{
  intent:LineCommandIntent;
  state:MockMvpState;
  userId:string;
  lineAccount?:LineChannelAccount;
  subscription?:SubscriptionRecord;
  now?:Date;
  env?:Record<string, string|undefined>;
  fetcher?:typeof fetch;
  baseUrl?:string;
}):Promise<LineFirstReply> {
  const baseUrl = safeBaseUrl(input.baseUrl);
  const now = input.now ?? new Date();
  if (isLineAccountSuppressed(input.lineAccount)) return suppressedReply(input.intent, "line_account_inactive");
  if (isUserDeactivated(input.state, input.userId)) return suppressedReply(input.intent, "user_deactivated");
  if (input.intent === "follow") return textReply(input.intent, welcomeText(baseUrl));
  if (input.intent === "help" || input.intent === "unknown") return textReply(input.intent, helpText(baseUrl));
  if (input.intent === "onboarding") return textReply(input.intent, onboardingText(baseUrl));
  if (input.intent === "profile") return textReply(input.intent, profileText(baseUrl));
  if (input.intent === "subscription") return textReply(input.intent, subscriptionText(baseUrl));
  if (input.intent === "notification_settings") return textReply(input.intent, notificationSettingsText(baseUrl));
  if (input.intent === "privacy") return textReply(input.intent, privacyText(baseUrl));

  const periodType = periodByIntent[input.intent];
  if (!periodType) return textReply("unknown", helpText(baseUrl));
  if (isNotificationSuppressed(input.state, input.userId, periodText[periodType].topicCode)) {
    return suppressedReply(input.intent, "notification_unsubscribed", { periodType });
  }
  if (!hasActiveBirthProfile(input.state, input.userId)) {
    return textReply(input.intent, `ยังไม่มีข้อมูลเกิดสำหรับอ่านดวง${periodText[periodType].label}แบบปรับตามโปรไฟล์\n\nกรอกข้อมูลเกิดได้ที่ ${urlFor(baseUrl, "/onboarding")}\n${LINE_FIRST_DISCLAIMER}`, {
      metadata:{ periodType },
    });
  }

  const view = await buildPeriodHoroscopeView({
    state:input.state,
    userId:input.userId,
    periodType,
    subscription:input.subscription,
    now,
    env:input.env,
    fetcher:input.fetcher,
  });

  if (!view.allowed) {
    return textReply(input.intent, `แพ็กเกจปัจจุบันยังไม่เปิดอ่านดวง${periodText[periodType].label}\n\nดูสถานะแพ็กเกจหรือสมัครสมาชิกได้ที่ ${urlFor(baseUrl, "/subscribe")}\n${LINE_FIRST_DISCLAIMER}`, {
      metadata:{ periodType, periodKey:view.periodKey, sourceMode:view.sourceMode, contentProfileCode:view.contentProfileCode },
    });
  }

  if (view.sourceMode === "mock_rules") {
    return textReply(input.intent, `ตอนนี้ยังไม่พร้อมสร้างดวง${periodText[periodType].label}จากผังดวงจริงใน LINE\n\nเปิดดูรายละเอียดบนเว็บได้ที่ ${urlFor(baseUrl, periodText[periodType].path)}\n${LINE_FIRST_DISCLAIMER}`, {
      metadata:{ periodType, periodKey:view.periodKey, sourceMode:view.sourceMode, contentProfileCode:view.contentProfileCode },
    });
  }

  return {
    intent:input.intent,
    suppressed:false,
    messages:[renderLineHoroscopePreviewFlex(lineMessageFromView(view, baseUrl))],
    metadata:{
      periodType,
      periodKey:view.periodKey,
      sourceMode:view.sourceMode,
      contentProfileCode:view.contentProfileCode,
    },
  };
}

export function buildLineRichMenuTemplate(baseUrl = "https://example.test"):LineRichMenuTemplate {
  const root = safeBaseUrl(baseUrl);
  return {
    name:"Thai Horoscope Beta LINE Rich Menu",
    chatBarText:"เมนูดูดวง",
    actions:[
      { label:"วันนี้", type:"message", text:"ดวงวันนี้" },
      { label:"สัปดาห์", type:"message", text:"ดวงสัปดาห์" },
      { label:"เดือน", type:"message", text:"ดวงเดือน" },
      { label:"ปี", type:"message", text:"ดวงปี" },
      { label:"กรอกข้อมูลเกิด", type:"uri", uri:urlFor(root, "/onboarding") },
      { label:"ตั้งค่า", type:"uri", uri:urlFor(root, "/settings/notifications") },
    ],
  };
}

function lineMessageFromView(view:PeriodHoroscopeView, baseUrl:string):LineMessage {
  const period = periodText[view.periodType];
  return {
    topicCode:period.topicCode,
    title:view.title,
    body:summaryWithoutDebug(view.summary),
    periodKey:view.periodKey,
    ctaUrl:urlFor(baseUrl, period.path),
    sections:[
      ...view.sections
        .filter((section)=>["ภาพรวม", "งาน/การเรียน", "การเงิน", "ความสัมพันธ์", "สุขภาวะ", "คำแนะนำ", "ข้อควรระวัง"].includes(section.heading))
        .slice(0, 7)
        .map((section)=>({ label:section.heading, text:section.body })),
      ...(view.warnings.length ? [{ label:"หมายเหตุ", text:warningSummary(view.warnings) }] : []),
    ],
    actions:[
      { label:"ดูรายละเอียด", uri:urlFor(baseUrl, period.path), style:"primary" },
      { label:"แก้ข้อมูลเกิด", uri:urlFor(baseUrl, "/onboarding"), style:"secondary" },
      { label:"ตั้งค่าแจ้งเตือน", uri:urlFor(baseUrl, "/settings/notifications"), style:"secondary" },
    ],
    disclaimer:view.disclaimer || ENTERTAINMENT_DISCLAIMER || LINE_FIRST_DISCLAIMER,
    metadata:{
      sourceMode:view.sourceMode,
      contentProfileCode:view.contentProfileCode,
    },
  };
}

function textReply(intent:LineCommandIntent, text:string, options:{ suppressed?:boolean; reason?:string; metadata?:LineFirstReply["metadata"] } = {}):LineFirstReply {
  return {
    intent,
    suppressed:options.suppressed ?? false,
    reason:options.reason,
    messages:[{ type:"text", text:sanitizeUserLineText(text) } satisfies LineTextMessage],
    metadata:options.metadata,
  };
}

function suppressedReply(intent:LineCommandIntent, reason:string, metadata?:LineFirstReply["metadata"]):LineFirstReply {
  return {
    intent,
    suppressed:true,
    reason,
    messages:[],
    metadata,
  };
}

function welcomeText(baseUrl:string):string {
  return [
    "ยินดีต้อนรับสู่ Thai Horoscope Beta",
    "เลือกเมนูได้เลย: ดูดวงวันนี้, ดวงสัปดาห์, ดวงเดือน, ดวงปี, กรอกข้อมูลเกิด, แพ็กเกจของฉัน, ตั้งค่าการแจ้งเตือน, ความเป็นส่วนตัว",
    `เริ่มกรอกข้อมูลเกิด: ${urlFor(baseUrl, "/onboarding")}`,
    LINE_FIRST_DISCLAIMER,
  ].join("\n\n");
}

function helpText(baseUrl:string):string {
  return [
    "พิมพ์คำสั่งได้ เช่น ดวงวันนี้, ดวงสัปดาห์, ดวงเดือน, ดวงปี, สมัครสมาชิก, ตั้งค่า, แก้ข้อมูลเกิด, ข้อมูลส่วนตัว",
    `กรอกหรือแก้ข้อมูลเกิด: ${urlFor(baseUrl, "/onboarding")}`,
    LINE_FIRST_DISCLAIMER,
  ].join("\n\n");
}

function onboardingText(baseUrl:string):string {
  return `กรอกข้อมูลเกิดเพื่อให้ระบบสร้างผังดวงสำหรับ beta ได้ที่ ${urlFor(baseUrl, "/onboarding")}\n\nหากไม่ทราบเวลาเกิด ผลบางส่วนจะเป็นค่าประมาณ\n${LINE_FIRST_DISCLAIMER}`;
}

function profileText(baseUrl:string):string {
  return `แก้ข้อมูลเกิดหรือเปิดดูผังดวงได้ที่ ${urlFor(baseUrl, "/account")}\n\nข้อมูลนี้ใช้เพื่อคำนวณดวงตามโปรไฟล์เท่านั้น`;
}

function subscriptionText(baseUrl:string):string {
  return `ดูแพ็กเกจ สิทธิ์การอ่าน และสถานะสมาชิกได้ที่ ${urlFor(baseUrl, "/subscribe")}\n\nระบบ beta ยังไม่รับประกันผลลัพธ์ใด ๆ และไม่ใช่คำแนะนำทางการเงิน`;
}

function notificationSettingsText(baseUrl:string):string {
  return `ตั้งค่าหัวข้อและช่องทางแจ้งเตือนได้ที่ ${urlFor(baseUrl, "/settings/notifications")}`;
}

function privacyText(baseUrl:string):string {
  return `จัดการความเป็นส่วนตัว ส่งออกข้อมูล ลบข้อมูลเกิด หรือขอลบบัญชีได้ที่ ${urlFor(baseUrl, "/settings/privacy")}`;
}

function intentFromPostback(data:string|undefined):LineCommandIntent|undefined {
  if (!data?.trim()) return undefined;
  const params = new URLSearchParams(data);
  const intent = params.get("intent");
  if (intent && isLineCommandIntent(intent)) return intent;
  const period = params.get("period");
  if (period === "daily") return "today";
  if (period === "weekly" || period === "monthly" || period === "yearly") return period;
  return undefined;
}

function normalizeThaiCommand(value:string):string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function isLineCommandIntent(value:string):value is LineCommandIntent {
  return ["follow", "help", "today", "weekly", "monthly", "yearly", "onboarding", "profile", "subscription", "notification_settings", "privacy", "unknown"].includes(value);
}

function isLineAccountSuppressed(account:LineChannelAccount|undefined):boolean {
  return Boolean(account && (!account.active || account.blocked || !account.followed));
}

function isUserDeactivated(state:MockMvpState, userId:string):boolean {
  return Boolean(state.deactivatedUserIds[userId] || state.accountDeletionRequests.some((request)=>request.userId === userId && request.status === "requested"));
}

function hasActiveBirthProfile(state:MockMvpState, userId:string):boolean {
  return state.birthProfiles.some((profile)=>profile.userId === userId && !state.deletedBirthProfileIds[profile.id]);
}

function isNotificationSuppressed(state:MockMvpState, userId:string, topicCode:string):boolean {
  return state.notificationPreferences.some((preference)=>
    preference.userId === userId &&
    !preference.enabled &&
    (preference.topicCode === "all" || preference.topicCode === topicCode),
  );
}

function summaryWithoutDebug(value:string):string {
  return value
    .replace(/\bmock diagnostic only\b/gi, "เนื้อหา beta ยังอยู่ระหว่างตรวจสอบ")
    .replace(/\bprototype rules\b/gi, "กฎเนื้อหา beta")
    .replace(/\bLive chart snapshot\b/gi, "ผังดวงของคุณ");
}

function warningSummary(warnings:string[]):string {
  const unknownTime = warnings.some((warning)=>/UNKNOWN_BIRTH_TIME|เวลาเกิด/i.test(warning));
  if (unknownTime) return "ไม่ทราบเวลาเกิด จึงควรอ่านเรื่องลัคนาและเรือนชะตาแบบประมาณ";
  return "ระบบมีหมายเหตุประกอบผลลัพธ์ กรุณาอ่านอย่างใช้วิจารณญาณ";
}

function sanitizeUserLineText(value:string):string {
  return value
    .replace(/\bU[A-Za-z0-9]{8,}\b/g, "[line-id-hidden]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email-hidden]")
    .replace(/\bpayment_[A-Za-z0-9_]+\b/gi, "[payment-hidden]")
    .replace(/(?:secret|token|webhook|authorization|bearer)\S*/gi, "[hidden]");
}

function safeBaseUrl(value:string|undefined):string {
  if (!value?.trim()) return "https://example.test";
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
  } catch {
    // Invalid operator-provided base URLs use the test-safe placeholder.
  }
  return "https://example.test";
}

function urlFor(baseUrl:string, path:string):string {
  return new URL(path, baseUrl).toString();
}
