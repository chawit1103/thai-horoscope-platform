import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { REQUIRED_RELEASE_READINESS_DOCS, formatBetaDryRunReport, runBetaDryRun, stagingBetaDryRunEnv } from "../src/mvp/beta-dry-run";

const projectRoot = resolve(process.cwd(), "../..");

describe("beta dry run", () => {
  it("passes staging mock-safe validation without production secrets", () => {
    const report = runBetaDryRun({
      projectRoot,
      now:new Date("2026-05-07T12:00:00.000Z"),
      astroHealthProbe:()=>({ ok:true, summary:"astro-calc mock health passes without ephemeris path" }),
    });
    const serialized = JSON.stringify(report);

    assert.equal(report.status, "pass");
    assert.equal(report.environmentReport.environment, "staging");
    assert.equal(report.environmentReport.status, "ok");
    assert.equal(report.checks.every((check)=>check.status === "pass"), true);
    for (const unsafe of ["EMAIL_PROVIDER_API_KEY", "LINE_CHANNEL_ACCESS_TOKEN", "PAYMENT_PROVIDER_API_KEY", "PAYMENT_WEBHOOK_SECRET", "ASTRO_EPHEMERIS_PATH"]) {
      assert.equal(serialized.includes(`${unsafe}:`), false);
    }
  });

  it("keeps providers mock-safe and scheduler dry-run in default dry-run env", () => {
    const env = stagingBetaDryRunEnv();
    const report = runBetaDryRun({ projectRoot, env, astroHealthProbe:()=>({ ok:true, summary:"ok" }) });

    assert.equal(report.checks.find((check)=>check.id === "providers_remain_mock_safe")?.status, "pass");
    assert.equal(report.checks.find((check)=>check.id === "notification_scheduler_dry_run")?.status, "pass");
  });

  it("fails when release readiness links are missing", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "beta-dry-run-"));
    mkdirSync(join(tempRoot, "docs"), { recursive:true });
    for (const doc of REQUIRED_RELEASE_READINESS_DOCS) writeFileSync(join(tempRoot, doc), "# placeholder\n");
    writeFileSync(join(tempRoot, "docs/RELEASE_READINESS_CHECKLIST.md"), "# Release Readiness\n\nNo links yet.\n");

    const report = runBetaDryRun({ projectRoot:tempRoot, astroHealthProbe:()=>({ ok:true, summary:"ok" }) });

    assert.equal(report.status, "fail");
    assert.equal(report.checks.find((check)=>check.id === "release_readiness_links_complete")?.status, "fail");
  });

  it("formats sanitized operator output", () => {
    const report = runBetaDryRun({
      projectRoot,
      env:stagingBetaDryRunEnv({ EMAIL_PROVIDER_API_KEY:"should-not-be-needed" }),
      now:new Date("2026-05-07T12:00:00.000Z"),
      astroHealthProbe:()=>({ ok:true, summary:"ok" }),
    });
    const formatted = formatBetaDryRunReport(report);

    assert.equal(formatted.includes("should-not-be-needed"), false);
    assert.equal(formatted.includes("no_production_secrets_required"), true);
    assert.equal(report.status, "fail");
  });
});
