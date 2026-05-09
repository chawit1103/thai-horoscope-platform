import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { buildLineFirstReply, buildLineRichMenuTemplate, parseLineCommandIntent } from "../src/mvp/line-first-ux";
import { createLineChannelAccount, SandboxLineProvider } from "../src/mvp/line-gateway";
import { deleteBirthProfile, getMockMvpState, requestAccountDeletion, resetMockMvpState, saveBirthProfile, setMockUserPlan, setNotificationPreference, type PeriodType } from "../src/mvp/mock-flow";
import { resetMockSubscriptionState, type SubscriptionRecord } from "../src/mvp/subscription-lifecycle";

const sessionId = "line_first_ux_test";
const userId = "line_first_user";
const now = new Date("2026-05-09T04:00:00.000Z");
const baseUrl = "https://beta.example.test";
const liveCalculationHash = "8a78d428b4a3ddb828f06df56c6bdd0683b37600a0e7d72d6f248ffe7d8bc99f";

describe("LINE-first UX", () => {
  beforeEach(() => {
    resetMockMvpState("free");
    resetMockSubscriptionState();
  });

  it("maps supported Thai LINE messages to intents", () => {
    assert.equal(parseLineCommandIntent({ eventType:"message", messageText:"ดวงวันนี้" }), "today");
    assert.equal(parseLineCommandIntent({ eventType:"message", messageText:"ดูดวงวันนี้" }), "today");
    assert.equal(parseLineCommandIntent({ eventType:"message", messageText:"ดวงสัปดาห์" }), "weekly");
    assert.equal(parseLineCommandIntent({ eventType:"message", messageText:"ดวงเดือน" }), "monthly");
    assert.equal(parseLineCommandIntent({ eventType:"message", messageText:"ดวงปี" }), "yearly");
    assert.equal(parseLineCommandIntent({ eventType:"message", messageText:"สมัครสมาชิก" }), "subscription");
    assert.equal(parseLineCommandIntent({ eventType:"message", messageText:"ตั้งค่า" }), "notification_settings");
    assert.equal(parseLineCommandIntent({ eventType:"message", messageText:"แก้ข้อมูลเกิด" }), "profile");
    assert.equal(parseLineCommandIntent({ eventType:"message", messageText:"ข้อมูลส่วนตัว" }), "privacy");
    assert.equal(parseLineCommandIntent({ eventType:"postback", postbackData:"period=daily" }), "today");
  });

  it("returns a safe help message for unknown commands", async () => {
    const reply = await buildLineFirstReply({
      intent:parseLineCommandIntent({ eventType:"message", messageText:"อะไรดี" }),
      state:getMockMvpState(sessionId),
      userId,
      baseUrl,
    });

    assert.equal(reply.intent, "unknown");
    assert.equal(reply.messages[0]?.type, "text");
    assert.match(JSON.stringify(reply.messages), /ดวงวันนี้|ช่วยเหลือ/);
    assert.match(JSON.stringify(reply.messages), /เพื่อความบันเทิง/);
  });

  it("returns an onboarding link when the user has no birth profile", async () => {
    const reply = await buildLineFirstReply({
      intent:"today",
      state:getMockMvpState(sessionId),
      userId,
      lineAccount:lineAccount(),
      baseUrl,
    });

    assert.equal(reply.suppressed, false);
    assert.equal(reply.messages[0]?.type, "text");
    assert.match(JSON.stringify(reply.messages), /\/line\/onboarding/);
    assert.doesNotMatch(JSON.stringify(reply.messages), /flex/i);
  });

  it("uses optional LIFF web form links for onboarding profile and settings commands", async () => {
    const env = { LINE_LIFF_URL:"https://liff.line.me/1234567890-AbCdEfGh", NEXT_PUBLIC_APP_BASE_URL:"https://app.example.test" };
    const onboarding = await buildLineFirstReply({ intent:"onboarding", state:getMockMvpState(sessionId), userId, baseUrl, env });
    const profile = await buildLineFirstReply({ intent:"profile", state:getMockMvpState(sessionId), userId, baseUrl, env });
    const settings = await buildLineFirstReply({ intent:"notification_settings", state:getMockMvpState(sessionId), userId, baseUrl, env });

    assert.match(JSON.stringify(onboarding.messages), /https:\/\/liff\.line\.me\/1234567890-AbCdEfGh\?line_route=%2Fline%2Fonboarding/);
    assert.match(JSON.stringify(profile.messages), /https:\/\/liff\.line\.me\/1234567890-AbCdEfGh\?line_route=%2Fline%2Fprofile/);
    assert.match(JSON.stringify(settings.messages), /https:\/\/liff\.line\.me\/1234567890-AbCdEfGh\?line_route=%2Fline%2Fsettings/);
    assert.doesNotMatch(JSON.stringify({ onboarding, profile, settings }), /U1234567890abcdef|secret|token|payment_/i);
  });

  it("routes privacy and rich menu links through allowlisted LIFF web form paths", async () => {
    const env = { LINE_LIFF_URL:"https://liff.line.me/1234567890-AbCdEfGh", NEXT_PUBLIC_APP_BASE_URL:"https://app.example.test" };
    const privacy = await buildLineFirstReply({ intent:"privacy", state:getMockMvpState(sessionId), userId, baseUrl, env });
    const menu = buildLineRichMenuTemplate(baseUrl, env);
    const serialized = JSON.stringify({ privacy, menu });

    assert.match(serialized, /https:\/\/liff\.line\.me\/1234567890-AbCdEfGh\?line_route=%2Fline%2Fsettings/);
    assert.doesNotMatch(serialized, /line_route=%2Fsettings%2Fprivacy/);
    assert.doesNotMatch(serialized, /https:\/\/beta\.example\.test\/line\/settings/);
  });

  it("sends an entitled user's live chart horoscope as a safe Flex payload", async () => {
    createBirthProfile({ planCode:"premium" });
    const reply = await buildLineFirstReply({
      intent:"monthly",
      state:getMockMvpState(sessionId),
      userId,
      lineAccount:lineAccount(),
      subscription:activePremiumSubscription(),
      now,
      baseUrl,
      env:{ ASTRO_CALC_SERVICE_URL:"https://astro-calc.example.test" },
      fetcher:mockLiveFetcher(liveServiceSnapshot()),
    });
    const payload = JSON.stringify(reply.messages);

    assert.equal(reply.messages[0]?.type, "flex");
    assert.equal(reply.metadata?.sourceMode, "live_chart_based");
    assert.match(payload, /ดูรายละเอียด/);
    assert.match(payload, /แก้ข้อมูลเกิด/);
    assert.match(payload, /ตั้งค่าแจ้งเตือน/);
    assert.match(payload, /เพื่อความบันเทิง/);
    assert.doesNotMatch(payload, /1971-03-11|08:17|Bangkok|Asia\/Bangkok|U1234567890abcdef|payment_|secret|token/i);
    assert.doesNotMatch(payload, new RegExp(liveCalculationHash));
  });

  it("returns a plan limitation message for non-entitled periods", async () => {
    createBirthProfile({ planCode:"free" });
    const reply = await buildLineFirstReply({
      intent:"yearly",
      state:getMockMvpState(sessionId),
      userId,
      lineAccount:lineAccount(),
      now,
      baseUrl,
      env:{ ASTRO_CALC_SERVICE_URL:"https://astro-calc.example.test" },
      fetcher:mockLiveFetcher(liveServiceSnapshot()),
    });

    assert.equal(reply.messages[0]?.type, "text");
    assert.match(JSON.stringify(reply.messages), /แพ็กเกจปัจจุบัน/);
    assert.doesNotMatch(JSON.stringify(reply.messages), /flex/i);
  });

  it("does not send horoscope content for unsubscribed deactivated or deleted users", async () => {
    createBirthProfile({ planCode:"free" });
    setNotificationPreference({ sessionId, userId }, "daily_horoscope", false, now);
    const unsubscribed = await buildLineFirstReply({
      intent:"today",
      state:getMockMvpState(sessionId),
      userId,
      lineAccount:lineAccount(),
      now,
      baseUrl,
      env:{ ASTRO_CALC_SERVICE_URL:"https://astro-calc.example.test" },
      fetcher:mockLiveFetcher(liveServiceSnapshot()),
    });
    assert.equal(unsubscribed.reason, "notification_unsubscribed");
    assert.equal(unsubscribed.messages.length, 0);

    resetMockMvpState("free");
    createBirthProfile({ planCode:"free" });
    requestAccountDeletion({ sessionId, userId }, now);
    const deactivated = await buildLineFirstReply({
      intent:"today",
      state:getMockMvpState(sessionId),
      userId,
      lineAccount:lineAccount(),
      now,
      baseUrl,
    });
    assert.equal(deactivated.suppressed, true);
    assert.equal(deactivated.messages.length, 0);

    const deactivatedHelp = await buildLineFirstReply({
      intent:"help",
      state:getMockMvpState(sessionId),
      userId,
      lineAccount:lineAccount(),
      now,
      baseUrl,
    });
    assert.equal(deactivatedHelp.reason, "user_deactivated");
    assert.equal(deactivatedHelp.messages.length, 0);

    resetMockMvpState("free");
    setMockUserPlan(userId, "free", sessionId);
    const replacementProfile = saveBirthProfile({
      birthDate:"1971-03-11",
      birthTime:"08:17",
      birthTimeUnknown:false,
      birthPlaceText:"Bangkok",
      timezone:"Asia/Bangkok",
      consentBirthData:true,
    }, { sessionId, userId });
    deleteBirthProfile({ sessionId, userId }, replacementProfile.id, now);
    const deleted = await buildLineFirstReply({
      intent:"today",
      state:getMockMvpState(sessionId),
      userId,
      lineAccount:lineAccount(),
      now,
      baseUrl,
    });
    assert.equal(deleted.messages[0]?.type, "text");
    assert.match(JSON.stringify(deleted.messages), /onboarding/);
  });

  it("surfaces unknown birth time cautiously without raw birth data", async () => {
    createBirthProfile({ planCode:"free", birthTimeUnknown:true });
    const reply = await buildLineFirstReply({
      intent:"today",
      state:getMockMvpState(sessionId),
      userId,
      lineAccount:lineAccount(),
      now,
      baseUrl,
      env:{ ASTRO_CALC_SERVICE_URL:"https://astro-calc.example.test" },
      fetcher:mockLiveFetcher(liveServiceSnapshot({
        datetime_local:"1971-03-11T12:00:00",
        datetime_utc:"1971-03-11T05:00:00Z",
        warnings:[{ code:"UNKNOWN_BIRTH_TIME" }, { code:"UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE" }],
        houses:{ system:"whole_sign", reliable:false, cusps_deg:[], ascendant_deg:null },
        angles:{ reliable:false, ascendant_deg:null, lagna_deg:null, mc_deg:null, descendant_deg:null, ic_deg:null },
        derived_points:{},
      })),
    });
    const payload = JSON.stringify(reply.messages);

    assert.equal(reply.messages[0]?.type, "flex");
    assert.match(payload, /ไม่ทราบเวลาเกิด/);
    assert.doesNotMatch(payload, /1971-03-11|12:00|Asia\/Bangkok|Bangkok/);
  });

  it("keeps LINE calls mock-safe in command tests", async () => {
    const provider = new SandboxLineProvider();
    createBirthProfile({ planCode:"free" });

    await buildLineFirstReply({
      intent:"today",
      state:getMockMvpState(sessionId),
      userId,
      lineAccount:lineAccount(),
      now,
      baseUrl,
      env:{ ASTRO_CALC_SERVICE_URL:"https://astro-calc.example.test" },
      fetcher:mockLiveFetcher(liveServiceSnapshot()),
    });

    assert.equal(provider.networkSendCount, 0);
    assert.equal(provider.sent.length, 0);
  });

  it("builds the recommended LINE rich menu template", () => {
    const menu = buildLineRichMenuTemplate(baseUrl);
    assert.deepEqual(menu.actions.map((action)=>action.label), ["วันนี้", "สัปดาห์", "เดือน", "ปี", "กรอกข้อมูลเกิด", "ตั้งค่า"]);
    assert.equal(menu.actions.some((action)=>action.type === "uri" && action.uri?.includes("/onboarding")), true);
    assert.equal(menu.actions.some((action)=>action.type === "uri" && action.uri?.includes("/line/onboarding")), true);
    assert.equal(menu.actions.some((action)=>action.type === "uri" && action.uri?.includes("/line/settings")), true);
  });
});

function createBirthProfile(input:{ planCode:"free"|"basic"|"premium"; birthTimeUnknown?:boolean }) {
  setMockUserPlan(userId, input.planCode, sessionId);
  return saveBirthProfile({
    birthDate:"1971-03-11",
    birthTime:input.birthTimeUnknown ? "" : "08:17",
    birthTimeUnknown:input.birthTimeUnknown ?? false,
    birthPlaceText:"Bangkok",
    timezone:"Asia/Bangkok",
    consentBirthData:true,
  }, { sessionId, userId });
}

function lineAccount() {
  return createLineChannelAccount({ userId, lineUserId:"U1234567890abcdef", now });
}

function activePremiumSubscription():SubscriptionRecord {
  return {
    id:"sub_line_first_premium",
    userId,
    planCode:"premium",
    status:"active",
    currentPeriodStart:"2026-05-01T00:00:00.000Z",
    currentPeriodEnd:"2026-06-01T00:00:00.000Z",
    cancelAtPeriodEnd:false,
    updatedAt:"2026-05-01T00:00:00.000Z",
  };
}

function mockLiveFetcher(snapshot:unknown):typeof fetch {
  return async () => new Response(JSON.stringify(snapshot), { status:200 });
}

function liveServiceSnapshot(override:Record<string, unknown> = {}) {
  const datetimeLocal = String(override.datetime_local ?? "1971-03-11T08:17:00");
  const datetimeUtc = String(override.datetime_utc ?? "1971-03-11T01:17:00Z");
  return {
    chart_type:"natal",
    calculation_profile_code:"TH_ALMANAC_LAHIRI_MEAN_NODE_SWISSEPH_V1",
    datetime_local:datetimeLocal,
    datetime_utc:datetimeUtc,
    datetime:{ local:datetimeLocal, utc:datetimeUtc, timezone:"Asia/Bangkok", julian_day_ut:2441021.5534722223 },
    location:{ latitude:13.759, longitude:100.535, elevation_m:0 },
    engine:{ name:"swisseph", version:"adapter-0.1.0", ephemeris_fingerprint:"swisseph-test-fingerprint" },
    zodiac:{ type:"sidereal", ayanamsa_code:"LAHIRI", ayanamsa_deg:23.4546517 },
    calculation_profile:{ code:"TH_ALMANAC_LAHIRI_MEAN_NODE_SWISSEPH_V1", house_system:"whole_sign", node_type:"mean_node" },
    ephemeris_fingerprint:"swisseph-test-fingerprint",
    calculation_hash:liveCalculationHash,
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
    metadata:{
      zodiac_type:"sidereal",
      ayanamsa_code:"LAHIRI",
      node_type:"mean_node",
      ketu_method:"south_node",
      thai_ketu_9_method:"not_enabled",
      lagna_method:"thai_antonathi_saman_local_time_sunrise",
      lagna_source:"local_mean_time_plus_sunrise_sun",
      local_time_correction_minutes:-17.86,
      sunrise_local_time:"06:29",
    },
    ...override,
  };
}

function point(sidereal_longitude_deg:number, retrograde:boolean, house_number:number|null) {
  return {
    sidereal_longitude_deg,
    tropical_longitude_deg:(sidereal_longitude_deg + 23.4546517) % 360,
    retrograde,
    speed_longitude_deg_per_day:1,
    house_number,
  };
}
