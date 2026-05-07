import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toPublicHealthReport, validateDeploymentEnvironment, type EnvironmentInput, type EnvironmentValidationReport } from "./environment-validation";

export type DryRunStatus = "pass"|"fail";

export interface DryRunCheck {
  id:string;
  status:DryRunStatus;
  summary:string;
}

export interface AstroHealthProbeResult {
  ok:boolean;
  summary:string;
}

export interface BetaDryRunReport {
  status:DryRunStatus;
  generatedAt:string;
  environmentReport:EnvironmentValidationReport;
  checks:DryRunCheck[];
}

export interface BetaDryRunOptions {
  projectRoot?:string;
  env?:EnvironmentInput;
  now?:Date;
  astroHealthProbe?:(projectRoot:string, env:EnvironmentInput)=>AstroHealthProbeResult;
}

export const REQUIRED_RELEASE_READINESS_DOCS = [
  "docs/BETA_RELEASE_CANDIDATE.md",
  "docs/E2E_BETA_SMOKE_TEST_MATRIX.md",
  "docs/BETA_RELEASE_NOTES_TEMPLATE.md",
  "docs/FINAL_GO_NO_GO_CHECKLIST.md",
  "docs/BETA_LAUNCH_PLAN.md",
  "docs/BETA_SMOKE_TESTS.md",
  "docs/GO_NO_GO_CRITERIA.md",
  "docs/LAUNCH_RISK_REGISTER.md",
  "docs/ROLLBACK_CHECKLIST.md",
  "docs/BETA_DRY_RUN_REPORT.md",
] as const;

const MOCK_SAFE_PROVIDER_MODES = {
  email_gateway:"sandbox",
  line_gateway:"sandbox",
  payment_provider:"mock",
} as const;

const REAL_PROVIDER_SECRET_VARS = [
  "EMAIL_PROVIDER_API_KEY",
  "EMAIL_PROVIDER_ENDPOINT",
  "EMAIL_WEBHOOK_SECRET",
  "LINE_CHANNEL_SECRET",
  "LINE_CHANNEL_ACCESS_TOKEN",
  "PAYMENT_PROVIDER_CHECKOUT_ENDPOINT",
  "PAYMENT_PROVIDER_API_KEY",
  "PAYMENT_WEBHOOK_SECRET",
  "NOTIFICATION_SCHEDULER_TOKEN",
  "ASTRO_EPHEMERIS_PATH",
] as const;

export function stagingBetaDryRunEnv(overrides:EnvironmentInput = {}):EnvironmentInput {
  return {
    APP_ENV:"staging",
    ADMIN_SESSION_SECRET:"dry-run-admin-session-secret",
    EMAIL_PROVIDER_MODE:"sandbox",
    EMAIL_AUDIT_HASH_SECRET:"dry-run-email-audit-secret",
    LINE_PROVIDER_MODE:"sandbox",
    LINE_AUDIT_HASH_SECRET:"dry-run-line-audit-secret",
    PAYMENT_PROVIDER_MODE:"mock",
    NOTIFICATION_SCHEDULER_MODE:"dry_run",
    ASTRO_ENGINE:"mock",
    SWISSEPH_LICENSE_MODE:"none",
    ...overrides,
  };
}

export function runBetaDryRun(options:BetaDryRunOptions = {}):BetaDryRunReport {
  const projectRoot = options.projectRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const env = stagingBetaDryRunEnv(options.env);
  const environmentReport = toPublicHealthReport(validateDeploymentEnvironment(env));
  const checks = [
    environmentValidationCheck(environmentReport),
    noProductionSecretsRequiredCheck(env),
    providerModesMockSafeCheck(environmentReport),
    notificationSchedulerDryRunCheck(environmentReport),
    astroHealthCheck(projectRoot, env, options.astroHealthProbe ?? runAstroHealthProbe),
    releaseDocsCheck(projectRoot),
    rollbackChecklistExistsCheck(projectRoot),
  ];
  return {
    status:checks.every((check)=>check.status === "pass") ? "pass" : "fail",
    generatedAt:(options.now ?? new Date()).toISOString(),
    environmentReport,
    checks,
  };
}

export function formatBetaDryRunReport(report:BetaDryRunReport):string {
  const lines = [
    "# Beta Dry Run Result",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    "",
    "## Environment",
    "",
    `- environment: ${report.environmentReport.environment}`,
    `- service: ${report.environmentReport.service}`,
    `- status: ${report.environmentReport.status}`,
    "",
    "## Checks",
    "",
    ...report.checks.map((check)=>`- [${check.status === "pass" ? "x" : " "}] ${check.id}: ${check.summary}`),
  ];
  return `${lines.join("\n")}\n`;
}

function environmentValidationCheck(report:EnvironmentValidationReport):DryRunCheck {
  const warnings = report.components.flatMap((component)=>component.warnings.map((warning)=>warning.code));
  return check(
    "environment_validation_staging_mock_safe",
    report.status === "ok" && report.environment === "staging",
    warnings.length > 0 ? `staging environment passes with accepted mock/sandbox warnings: ${warnings.join(", ")}` : "staging environment passes",
  );
}

function noProductionSecretsRequiredCheck(env:EnvironmentInput):DryRunCheck {
  const configuredSecrets = REAL_PROVIDER_SECRET_VARS.filter((name)=>Boolean(env[name]?.trim()));
  return check(
    "no_production_secrets_required",
    configuredSecrets.length === 0,
    configuredSecrets.length === 0 ? "real provider secrets are not required for the dry run" : `unexpected real provider variables configured: ${configuredSecrets.join(", ")}`,
  );
}

function providerModesMockSafeCheck(report:EnvironmentValidationReport):DryRunCheck {
  const unsafeModes = Object.entries(MOCK_SAFE_PROVIDER_MODES).filter(([componentName, expectedMode])=>{
    const component = report.components.find((item)=>item.component === componentName);
    return component?.mode !== expectedMode;
  });
  return check(
    "providers_remain_mock_safe",
    unsafeModes.length === 0,
    unsafeModes.length === 0 ? "email and LINE are sandbox; payment is mock" : `unsafe provider modes: ${unsafeModes.map(([name])=>name).join(", ")}`,
  );
}

function notificationSchedulerDryRunCheck(report:EnvironmentValidationReport):DryRunCheck {
  const scheduler = report.components.find((component)=>component.component === "notification_scheduler");
  return check(
    "notification_scheduler_dry_run",
    scheduler?.mode === "dry_run" && scheduler.status === "ok",
    scheduler ? `scheduler mode is ${scheduler.mode} with status ${scheduler.status}` : "notification scheduler component missing",
  );
}

function astroHealthCheck(projectRoot:string, env:EnvironmentInput, probe:(projectRoot:string, env:EnvironmentInput)=>AstroHealthProbeResult):DryRunCheck {
  const result = probe(projectRoot, env);
  return check("astro_calc_health", result.ok, result.summary);
}

function releaseDocsCheck(projectRoot:string):DryRunCheck {
  const missing = REQUIRED_RELEASE_READINESS_DOCS.filter((doc)=>!existsSync(join(projectRoot, doc)));
  const releaseChecklistPath = join(projectRoot, "docs/RELEASE_READINESS_CHECKLIST.md");
  const releaseChecklist = existsSync(releaseChecklistPath) ? readFileSync(releaseChecklistPath, "utf8") : "";
  const missingLinks = REQUIRED_RELEASE_READINESS_DOCS.filter((doc)=>!releaseChecklist.includes(`](${relative("docs", doc)})`));
  return check(
    "release_readiness_links_complete",
    missing.length === 0 && missingLinks.length === 0,
    missing.length === 0 && missingLinks.length === 0 ? "release readiness checklist links to all beta dry-run docs" : `missing docs: ${missing.join(", ") || "none"}; missing links: ${missingLinks.join(", ") || "none"}`,
  );
}

function rollbackChecklistExistsCheck(projectRoot:string):DryRunCheck {
  const rollbackPath = join(projectRoot, "docs/ROLLBACK_CHECKLIST.md");
  const exists = existsSync(rollbackPath);
  return check("rollback_checklist_exists", exists, exists ? "rollback checklist exists" : "docs/ROLLBACK_CHECKLIST.md is missing");
}

function runAstroHealthProbe(projectRoot:string, env:EnvironmentInput):AstroHealthProbeResult {
  const result = spawnSync(
    "python3",
    ["-c", "import json; from app.main import health; print(json.dumps(health(), sort_keys=True))"],
    { cwd:join(projectRoot, "services/astro-calc"), env:{ ...process.env, ...env }, encoding:"utf8" },
  );
  if (result.status !== 0) return { ok:false, summary:"astro-calc health command failed" };
  try {
    const payload = JSON.parse(result.stdout.trim()) as Record<string, string>;
    const ok = payload.status === "ok" && payload.engine === "mock" && payload.ephemeris_path_configured === "false";
    return { ok, summary:ok ? "astro-calc mock health passes without ephemeris path" : `astro-calc health returned ${payload.status ?? "unknown"}` };
  } catch {
    return { ok:false, summary:"astro-calc health output was not valid JSON" };
  }
}

function check(id:string, passed:boolean, summary:string):DryRunCheck {
  return { id, status:passed ? "pass" : "fail", summary };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = runBetaDryRun();
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else process.stdout.write(formatBetaDryRunReport(report));
  if (report.status !== "pass") process.exitCode = 1;
}
