import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { buildLineRichMenuTemplate, assertRichMenuHasNoSecrets, LINE_RICH_MENU_ACTIONS } from "../src/mvp/line-rich-menu";

const baseUrl = "https://beta.example.test";

describe("LINE rich menu config", () => {
  it("contains the expected Thai labels and action mappings", () => {
    const menu = buildLineRichMenuTemplate(baseUrl);

    assert.deepEqual(menu.actions.map((action)=>action.label), [
      "ดวงวันนี้",
      "ดวงสัปดาห์",
      "ดวงเดือน",
      "กรอกข้อมูลเกิด",
      "ตั้งค่าแจ้งเตือน",
      "บัญชี / แพ็กเกจ",
    ]);
    assert.deepEqual(menu.actions.map((action)=>action.intent), [
      "today",
      "weekly",
      "monthly",
      "onboarding",
      "notification_settings",
      "subscription",
    ]);
    assert.deepEqual(menu.lineApiConfig.areas.map((area)=>area.action.type), ["message", "message", "message", "uri", "uri", "message"]);
  });

  it("builds onboarding and notification settings URLs from the safe web base", () => {
    const menu = buildLineRichMenuTemplate(baseUrl);
    const onboarding = menu.actions.find((action)=>action.key === "onboarding");
    const settings = menu.actions.find((action)=>action.key === "notification_settings");

    assert.equal(onboarding?.uri, "https://beta.example.test/line/onboarding");
    assert.equal(settings?.uri, "https://beta.example.test/line/settings");
    assertRichMenuHasNoSecrets(menu);
  });

  it("uses HTTPS LIFF URLs with allowlisted line_route values when configured", () => {
    const menu = buildLineRichMenuTemplate(baseUrl, {
      LINE_LIFF_URL:"https://liff.line.me/1234567890-AbCdEfGh?ignore=true#hash",
      NEXT_PUBLIC_APP_BASE_URL:"https://app.example.test",
    });
    const serialized = JSON.stringify(menu);

    assert.match(serialized, /https:\/\/liff\.line\.me\/1234567890-AbCdEfGh\?line_route=%2Fline%2Fonboarding/);
    assert.match(serialized, /https:\/\/liff\.line\.me\/1234567890-AbCdEfGh\?line_route=%2Fline%2Fsettings/);
    assert.doesNotMatch(serialized, /ignore=true|#hash|lineUserId|U1234567890|secret|token|payment_/i);
    assertRichMenuHasNoSecrets(menu);
  });

  it("fails closed to safe placeholder URLs for unsafe non-local HTTP bases", () => {
    const menu = buildLineRichMenuTemplate("http://beta.example.test");
    const serialized = JSON.stringify(menu);

    assert.match(serialized, /https:\/\/example\.test\/line\/onboarding/);
    assert.doesNotMatch(serialized, /http:\/\/beta\.example\.test/);
    assertRichMenuHasNoSecrets(menu);
  });

  it("keeps the local JSON template free of LINE credentials and raw identifiers", () => {
    const config = readFileSync(new URL("../../../config/line/rich-menu.beta.json", import.meta.url), "utf8");
    const parsed = JSON.parse(config) as { actions:Array<{ key:string; label:string; intent:string }> };

    assert.deepEqual(parsed.actions.map((action)=>action.label), LINE_RICH_MENU_ACTIONS.map((action)=>action.label));
    assert.doesNotMatch(config, /LINE_CHANNEL_ACCESS_TOKEN|LINE_CHANNEL_SECRET|channelAccessToken|channelSecret|Bearer|lineUserId|U1234567890|payment_|birthProfileId|secret|token/i);
  });
});
