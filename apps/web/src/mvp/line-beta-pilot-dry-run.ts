import { buildLineFirstReply, parseLineCommandIntent, type LineCommandIntent, type LineFirstReply } from "./line-first-ux";
import { createLineChannelAccount, SandboxLineProvider } from "./line-gateway";
import { buildLineRichMenuTemplate } from "./line-rich-menu";
import {
  deleteBirthProfile,
  getMockMvpState,
  requestAccountDeletion,
  resetMockMvpState,
  saveBirthProfile,
  setMockUserPlan,
  setNotificationPreference,
  type PeriodType,
} from "./mock-flow";

export interface LineBetaPilotDryRunStep {
  id:string;
  label:string;
  intent?:LineCommandIntent;
  status:"pass"|"fail";
  messageTypes:string[];
  suppressed:boolean;
  reason?:string;
  checks:string[];
}

export interface LineBetaPilotDryRunReport {
  mode:"mock_dry_run";
  userRef:string;
  providerMode:"sandbox";
  richMenuLabels:string[];
  richMenuActions:Array<{ label:string; type:"message"|"uri"; intent:string; routeSafe:boolean }>;
  steps:LineBetaPilotDryRunStep[];
  safety:{
    realLineApiCalls:number;
    containsRawLineIdentifier:boolean;
    containsRawBirthData:boolean;
    containsSecrets:boolean;
  };
  result:"pass"|"fail";
}

const DEFAULT_SESSION_ID = "line_beta_pilot_dry_run";
const DEFAULT_USER_ID = "line_beta_pilot_user";
const RAW_LINE_USER_ID = "UdryRunLineUser1234567890";
const NOW = new Date("2026-05-09T08:00:00.000Z");
const SAFE_BASE_URL = "https://beta.example.test";

export async function runLineBetaPilotDryRun(input:{
  sessionId?:string;
  userId?:string;
  baseUrl?:string;
  env?:Record<string, string|undefined>;
  now?:Date;
} = {}):Promise<LineBetaPilotDryRunReport> {
  const sessionId = input.sessionId ?? DEFAULT_SESSION_ID;
  const userId = input.userId ?? DEFAULT_USER_ID;
  const baseUrl = input.baseUrl ?? SAFE_BASE_URL;
  const env = {
    NEXT_PUBLIC_APP_BASE_URL:baseUrl,
    ASTRO_CALC_SERVICE_URL:"https://astro-calc.example.test",
    LINE_PROVIDER_MODE:"sandbox",
    ENABLE_REAL_LINE_SENDS:"false",
    ...(input.env ?? {}),
  };
  const now = input.now ?? NOW;
  const provider = new SandboxLineProvider();
  resetMockMvpState("free");
  setMockUserPlan(userId, "free", sessionId);
  const lineAccount = createLineChannelAccount({ userId, lineUserId:RAW_LINE_USER_ID, now });
  const steps:LineBetaPilotDryRunStep[] = [];

  const richMenu = buildLineRichMenuTemplate(baseUrl, env);

  steps.push(recordReply("follow", "follow welcome", await buildLineFirstReply({
    intent:"follow",
    state:getMockMvpState(sessionId),
    userId,
    lineAccount,
    baseUrl,
    env,
  }), [/ยินดีต้อนรับ/, /กรอกข้อมูลเกิด/]));

  const onboardingIntent = parseLineCommandIntent({ eventType:"message", messageText:richMenu.actions.find((action)=>action.key === "onboarding")?.text ?? "กรอกข้อมูลเกิด" });
  steps.push(recordReply("rich_menu_onboarding", "rich menu onboarding action", await buildLineFirstReply({
    intent:onboardingIntent,
    state:getMockMvpState(sessionId),
    userId,
    lineAccount,
    baseUrl,
    env,
  }), [/\/line\/onboarding|line_route=%2Fline%2Fonboarding/, /เพื่อความบันเทิง/]));

  steps.push(recordReply("no_birth_profile_today", "today before birth profile prompts onboarding", await buildLineFirstReply({
    intent:"today",
    state:getMockMvpState(sessionId),
    userId,
    lineAccount,
    baseUrl,
    env,
  }), [/ยังไม่มีข้อมูลเกิด/, /\/line\/onboarding|line_route=%2Fline%2Fonboarding/]));

  saveBirthProfile({
    birthDate:"1971-03-11",
    birthTime:"08:17",
    birthTimeUnknown:false,
    birthPlaceText:"Bangkok",
    timezone:"Asia/Bangkok",
    consentBirthData:true,
    latitude:13.759,
    longitude:100.535,
  }, { sessionId, userId }, now);

  steps.push(recordReply("birth_profile_exists_today", "today after birth profile returns safe preview", await buildLineFirstReply({
    intent:"today",
    state:getMockMvpState(sessionId),
    userId,
    lineAccount,
    now,
    baseUrl,
    env,
    fetcher:dryRunAstroFetcher(liveServiceSnapshot()),
  }), [/flex|ดวงวันนี้/, /เพื่อความบันเทิง/]));

  for (const [intent, label] of [
    ["weekly", "weekly entitlement limitation"],
    ["monthly", "monthly entitlement limitation"],
    ["yearly", "yearly entitlement limitation"],
  ] as const) {
    steps.push(recordReply(intent, label, await buildLineFirstReply({
      intent,
      state:getMockMvpState(sessionId),
      userId,
      lineAccount,
      now,
      baseUrl,
      env,
      fetcher:dryRunAstroFetcher(liveServiceSnapshot()),
    }), [/แพ็กเกจปัจจุบัน/, /เพื่อความบันเทิง/]));
  }

  steps.push(recordReply("notification_settings", "notification settings link", await buildLineFirstReply({
    intent:"notification_settings",
    state:getMockMvpState(sessionId),
    userId,
    lineAccount,
    baseUrl,
    env,
  }), [/ตั้งค่า/, /\/line\/settings|line_route=%2Fline%2Fsettings/]));

  steps.push(recordReply("privacy", "privacy link", await buildLineFirstReply({
    intent:"privacy",
    state:getMockMvpState(sessionId),
    userId,
    lineAccount,
    baseUrl,
    env,
  }), [/ความเป็นส่วนตัว|ลบบัญชี|ส่งออกข้อมูล/, /\/line\/settings|line_route=%2Fline%2Fsettings/]));

  steps.push(recordReply("unknown", "unknown command returns help", await buildLineFirstReply({
    intent:parseLineCommandIntent({ eventType:"message", messageText:"ขอคำทำนายลับ" }),
    state:getMockMvpState(sessionId),
    userId,
    lineAccount,
    baseUrl,
    env,
  }), [/ดวงวันนี้/, /เพื่อความบันเทิง/]));

  setNotificationPreference({ sessionId, userId }, "daily_horoscope", false, now);
  steps.push(recordReply("unsubscribed_suppression", "unsubscribed user receives no horoscope content", await buildLineFirstReply({
    intent:"today",
    state:getMockMvpState(sessionId),
    userId,
    lineAccount,
    now,
    baseUrl,
    env,
    fetcher:dryRunAstroFetcher(liveServiceSnapshot()),
  }), [], true));

  const deactivatedUserId = `${userId}_deactivated`;
  setMockUserPlan(deactivatedUserId, "free", sessionId);
  saveBirthProfile({
    birthDate:"1980-01-02",
    birthTime:"06:30",
    birthTimeUnknown:false,
    birthPlaceText:"Chiang Mai",
    timezone:"Asia/Bangkok",
    consentBirthData:true,
  }, { sessionId, userId:deactivatedUserId }, now);
  requestAccountDeletion({ sessionId, userId:deactivatedUserId }, now);
  steps.push(recordReply("deactivated_suppression", "deactivated user receives no horoscope content", await buildLineFirstReply({
    intent:"today",
    state:getMockMvpState(sessionId),
    userId:deactivatedUserId,
    lineAccount:createLineChannelAccount({ userId:deactivatedUserId, lineUserId:"UdryRunDeactivated123456", now }),
    now,
    baseUrl,
    env,
    fetcher:dryRunAstroFetcher(liveServiceSnapshot()),
  }), [], true));

  const deletedProfileUserId = `${userId}_deleted_profile`;
  setMockUserPlan(deletedProfileUserId, "free", sessionId);
  const deletedProfile = saveBirthProfile({
    birthDate:"1984-04-05",
    birthTime:"09:15",
    birthTimeUnknown:false,
    birthPlaceText:"Phuket",
    timezone:"Asia/Bangkok",
    consentBirthData:true,
  }, { sessionId, userId:deletedProfileUserId }, now);
  deleteBirthProfile({ sessionId, userId:deletedProfileUserId }, deletedProfile.id, now);
  steps.push(recordReply("deleted_profile_no_content", "deleted birth profile receives onboarding prompt only", await buildLineFirstReply({
    intent:"today",
    state:getMockMvpState(sessionId),
    userId:deletedProfileUserId,
    lineAccount:createLineChannelAccount({ userId:deletedProfileUserId, lineUserId:"UdryRunDeletedProfile123456", now }),
    now,
    baseUrl,
    env,
    fetcher:dryRunAstroFetcher(liveServiceSnapshot()),
  }), [/ยังไม่มีข้อมูลเกิด/, /\/line\/onboarding|line_route=%2Fline%2Fonboarding/]));

  const serialized = JSON.stringify({ richMenu, steps });
  const safety = {
    realLineApiCalls:provider.networkSendCount,
    containsRawLineIdentifier:containsRawLineIdentifier(serialized),
    containsRawBirthData:/1971-03-11|08:17|Bangkok|Asia\/Bangkok|13\.759|100\.535/i.test(serialized),
    containsSecrets:/secret|token|authorization|bearer|LINE_CHANNEL_ACCESS_TOKEN|LINE_CHANNEL_SECRET/i.test(serialized),
  };

  return {
    mode:"mock_dry_run",
    userRef:"line_beta_pilot_user_ref",
    providerMode:"sandbox",
    richMenuLabels:richMenu.actions.map((action)=>action.label),
    richMenuActions:richMenu.actions.map((action)=>({
      label:action.label,
      type:action.type,
      intent:action.intent,
      routeSafe:action.type === "message" || Boolean(action.uri?.startsWith("https://") || action.uri?.startsWith("http://localhost")),
    })),
    steps,
    safety,
    result:steps.every((step)=>step.status === "pass") && !safety.realLineApiCalls && !safety.containsRawLineIdentifier && !safety.containsRawBirthData && !safety.containsSecrets ? "pass" : "fail",
  };
}

function recordReply(id:string, label:string, reply:LineFirstReply, expectedPatterns:RegExp[], expectSuppressed = false):LineBetaPilotDryRunStep {
  const serialized = JSON.stringify(reply.messages);
  const checks = [
    ...expectedPatterns.map((pattern)=>`${pattern.test(serialized) ? "pass" : "fail"}:${pattern.source}`),
    `${reply.suppressed === expectSuppressed ? "pass" : "fail"}:suppression_state`,
    `${!containsRawLineIdentifier(serialized) ? "pass" : "fail"}:no_raw_line_user_id`,
    `${!/1971-03-11|08:17|Bangkok|Asia\/Bangkok|13\.759|100\.535/i.test(serialized) ? "pass" : "fail"}:no_raw_birth_data`,
    `${!/secret|token|authorization|bearer|LINE_CHANNEL_ACCESS_TOKEN|LINE_CHANNEL_SECRET/i.test(serialized) ? "pass" : "fail"}:no_sensitive_config`,
  ];
  return {
    id,
    label,
    intent:reply.intent,
    status:checks.every((check)=>check.startsWith("pass:")) ? "pass" : "fail",
    messageTypes:reply.messages.map((message)=>message.type),
    suppressed:reply.suppressed,
    reason:reply.reason,
    checks,
  };
}

function dryRunAstroFetcher(snapshot:unknown):typeof fetch {
  return async () => new Response(JSON.stringify(snapshot), { status:200 });
}

function liveServiceSnapshot() {
  return {
    chart_type:"natal",
    calculation_profile_code:"TH_ALMANAC_LAHIRI_MEAN_NODE_SWISSEPH_V1",
    datetime_local:"1971-03-11T08:17:00",
    datetime_utc:"1971-03-11T01:17:00Z",
    datetime:{ local:"1971-03-11T08:17:00", utc:"1971-03-11T01:17:00Z", timezone:"Asia/Bangkok", julian_day_ut:2441021.5534722223 },
    location:{ latitude:13.759, longitude:100.535, elevation_m:0 },
    engine:{ name:"swisseph", version:"dry-run-adapter", ephemeris_fingerprint:"dry-run-fingerprint" },
    zodiac:{ type:"sidereal", ayanamsa_code:"LAHIRI", ayanamsa_deg:23.4546517 },
    calculation_profile:{ code:"TH_ALMANAC_LAHIRI_MEAN_NODE_SWISSEPH_V1", house_system:"whole_sign", node_type:"mean_node" },
    ephemeris_fingerprint:"dry-run-fingerprint",
    calculation_hash:"8a78d428b4a3ddb828f06df56c6bdd0683b37600a0e7d72d6f248ffe7d8bc99f",
    planets:{
      sun:point(326.36536075, false, 12),
      moon:point(134.97763777, false, 6),
      mercury:point(330.35385332, false, 1),
      venus:point(284.65438755, false, 11),
      mars:point(245.7132242, false, 10),
      jupiter:point(222.76113283, false, 9),
      saturn:point(24.6892194, false, 2),
      rahu:point(298.849263, true, 11),
      ketu:point(118.849263, true, 5),
    },
    houses:{ system:"whole_sign", reliable:true, cusps_deg:[330,0,30,60,90,120,150,180,210,240,270,300], ascendant_deg:358.08990736 },
    angles:{ reliable:true, ascendant_deg:358.08990736, lagna_deg:349.59979108, mc_deg:262.99334732, descendant_deg:178.08990736, ic_deg:82.99334732 },
    derived_points:{
      astronomical_ascendant:point(358.08990736, false, 1),
      thai_lagna:point(349.59979108, false, 1),
      mc:point(262.99334732, false, 10),
    },
    warnings:[],
    metadata:{ zodiac_type:"sidereal", ayanamsa_code:"LAHIRI", node_type:"mean_node" },
  };
}

function point(longitude:number, retrograde:boolean, houseNumber:number) {
  return {
    sidereal_longitude_deg:longitude,
    tropical_longitude_deg:longitude + 23.4546517,
    longitude_deg:longitude,
    retrograde,
    speed_longitude_deg_per_day:retrograde ? -0.03 : 1.01,
    house_number:houseNumber,
  };
}

function containsRawLineIdentifier(value:string):boolean {
  return /\bU[A-Za-z0-9]{8,}\b/.test(value);
}
