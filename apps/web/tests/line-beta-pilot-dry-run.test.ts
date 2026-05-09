import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runLineBetaPilotDryRun } from "../src/mvp/line-beta-pilot-dry-run";

describe("LINE beta pilot dry run", () => {
  it("passes the local mock LINE pilot journey without real LINE calls", async () => {
    const report = await runLineBetaPilotDryRun();

    assert.equal(report.mode, "mock_dry_run");
    assert.equal(report.providerMode, "sandbox");
    assert.equal(report.result, "pass");
    assert.equal(report.safety.realLineApiCalls, 0);
    assert.equal(report.safety.containsRawLineIdentifier, false);
    assert.equal(report.safety.containsRawBirthData, false);
    assert.equal(report.safety.containsSecrets, false);
    assert.equal(report.steps.every((step)=>step.status === "pass"), true);
  });

  it("covers follow onboarding birth profile horoscope entitlement help and suppression scenarios", async () => {
    const report = await runLineBetaPilotDryRun();
    const steps = new Map(report.steps.map((step)=>[step.id, step]));

    assert.equal(steps.get("follow")?.messageTypes.includes("text"), true);
    assert.equal(steps.get("rich_menu_onboarding")?.intent, "onboarding");
    assert.equal(steps.get("no_birth_profile_today")?.messageTypes.includes("text"), true);
    assert.equal(steps.get("birth_profile_exists_today")?.messageTypes.includes("flex"), true);
    assert.equal(steps.get("weekly")?.messageTypes.includes("text"), true);
    assert.equal(steps.get("monthly")?.messageTypes.includes("text"), true);
    assert.equal(steps.get("yearly")?.messageTypes.includes("text"), true);
    assert.equal(steps.get("notification_settings")?.messageTypes.includes("text"), true);
    assert.equal(steps.get("privacy")?.messageTypes.includes("text"), true);
    assert.equal(steps.get("unknown")?.intent, "unknown");
    assert.equal(steps.get("unsubscribed_suppression")?.suppressed, true);
    assert.equal(steps.get("unsubscribed_suppression")?.messageTypes.length, 0);
    assert.equal(steps.get("deactivated_suppression")?.suppressed, true);
    assert.equal(steps.get("deactivated_suppression")?.messageTypes.length, 0);
    assert.equal(steps.get("deleted_profile_no_content")?.suppressed, false);
    assert.equal(steps.get("deleted_profile_no_content")?.messageTypes.includes("text"), true);
  });

  it("keeps rich menu labels and actions aligned with the pilot command router", async () => {
    const report = await runLineBetaPilotDryRun();

    assert.deepEqual(report.richMenuLabels, [
      "ดวงวันนี้",
      "ดวงสัปดาห์",
      "ดวงเดือน",
      "กรอกข้อมูลเกิด",
      "ตั้งค่าแจ้งเตือน",
      "บัญชี / แพ็กเกจ",
    ]);
    assert.deepEqual(report.richMenuActions.map((action)=>action.intent), [
      "today",
      "weekly",
      "monthly",
      "onboarding",
      "notification_settings",
      "subscription",
    ]);
    assert.equal(report.richMenuActions.every((action)=>action.routeSafe), true);
  });

  it("does not expose raw LINE IDs birth data or provider config in the report", async () => {
    const report = await runLineBetaPilotDryRun();
    const serialized = JSON.stringify(report);

    assert.doesNotMatch(serialized, /UdryRunLineUser|lineUserId|1971-03-11|08:17|Bangkok|Asia\/Bangkok|13\.759|100\.535/i);
    assert.doesNotMatch(serialized, /LINE_CHANNEL_ACCESS_TOKEN|LINE_CHANNEL_SECRET|authorization|bearer\s+|payment_|webhook/i);
  });
});
