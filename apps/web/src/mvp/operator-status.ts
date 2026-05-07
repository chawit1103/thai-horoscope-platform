import { toPublicHealthReport, validateDeploymentEnvironment, type EnvironmentInput, type EnvironmentValidationReport } from "./environment-validation";
import { operationalStatusFromEnvironmentReport } from "./observability";

export type OperatorCardStatus = "ok"|"warning"|"error";
export type OperatorCardId =
  "environment_validation"|
  "admin_auth"|
  "privacy_controls"|
  "email_gateway"|
  "line_gateway"|
  "subscription_lifecycle"|
  "payment_provider"|
  "notification_scheduler"|
  "astro_calc"|
  "monitoring_alerting"|
  "release_readiness"|
  "known_blockers";

export interface OperatorDocLink {
  label:string;
  href:string;
}

export interface OperatorStatusCard {
  id:OperatorCardId;
  title:string;
  status:OperatorCardStatus;
  mode:string;
  summary:string;
  details:string[];
  blockers:string[];
  links:OperatorDocLink[];
}

export interface OperatorConsoleStatus {
  generatedAt:string;
  environment:string;
  overallStatus:OperatorCardStatus;
  cards:OperatorStatusCard[];
  docLinks:OperatorDocLink[];
}

const DOC_BASE = "https://github.com/chawit1103/thai-horoscope-platform/blob/main/docs";
const DOC_LINKS = {
  releaseReadiness:doc("Release readiness", "RELEASE_READINESS_CHECKLIST.md"),
  betaSmokeTests:doc("Beta smoke tests", "BETA_SMOKE_TESTS.md"),
  smokeChecklist:doc("Smoke checklist", "SMOKE_TEST_CHECKLIST.md"),
  rollback:doc("Rollback checklist", "ROLLBACK_CHECKLIST.md"),
  operations:doc("Operations runbook", "OPERATIONS_RUNBOOK.md"),
  stagingRunbook:doc("Staging runbook", "STAGING_DEPLOYMENT_RUNBOOK.md"),
  monitoring:doc("Monitoring and alerting", "MONITORING_ALERTING.md"),
  environment:doc("Environment validation", "ENVIRONMENT_VALIDATION.md"),
  securityPrivacy:doc("Security and privacy", "SECURITY_PRIVACY.md"),
  payment:doc("Subscription and payment", "SUBSCRIPTION_PAYMENT.md"),
  notification:doc("Notification gateway", "NOTIFICATION_GATEWAY.md"),
  astroReadiness:doc("Astro release readiness", "ASTRO_RELEASE_READINESS_CHECKLIST.md"),
} as const;

const SAFE_MODES = new Set(["local", "staging", "production", "sandbox", "mock", "http", "disabled", "dry_run", "enabled", "swisseph", "signed_cookie"]);

export function buildOperatorConsoleStatus(input:{ env?:EnvironmentInput; now?:Date } = {}):OperatorConsoleStatus {
  const report = toPublicHealthReport(validateDeploymentEnvironment(input.env));
  const operational = operationalStatusFromEnvironmentReport(report);
  const cards = [
    componentCard(report, "deployment_environment", "environment_validation", "Environment validation", "Deployment environment and fail-closed config status.", [DOC_LINKS.environment, DOC_LINKS.stagingRunbook]),
    componentCard(report, "admin_auth", "admin_auth", "Admin auth", "Signed admin session readiness for protected operator/admin access.", [DOC_LINKS.securityPrivacy]),
    staticCard("privacy_controls", "Privacy controls", "ok", "documented", "Export, birth-profile deletion, account deletion, unsubscribe, and deactivation suppression are part of the beta readiness surface.", ["Smoke privacy export/delete paths before beta invite."], [DOC_LINKS.securityPrivacy, DOC_LINKS.betaSmokeTests]),
    componentCard(report, "email_gateway", "email_gateway", "Email gateway", "Email provider mode and audit-hash readiness.", [DOC_LINKS.smokeChecklist, DOC_LINKS.notification]),
    componentCard(report, "line_gateway", "line_gateway", "LINE gateway", "LINE provider mode and audit-hash readiness.", [DOC_LINKS.smokeChecklist, DOC_LINKS.notification]),
    staticCard("subscription_lifecycle", "Subscription lifecycle", "ok", "mock_foundation", "Lifecycle state mapping and entitlement behavior are available for beta validation.", ["Production payment durability remains a separate human gate."], [DOC_LINKS.payment, DOC_LINKS.releaseReadiness]),
    componentCard(report, "payment_provider", "payment_provider", "Payment provider foundation", "Payment provider mode, webhook secret, and production mock-mode blockers.", [DOC_LINKS.payment, DOC_LINKS.releaseReadiness]),
    componentCard(report, "notification_scheduler", "notification_scheduler", "Notification scheduler", "Scheduler mode and dry-run/enabled token readiness.", [DOC_LINKS.smokeChecklist, DOC_LINKS.operations]),
    componentCard(report, "astro_calc", "astro_calc", "Astro-calc engine/config", "Astro engine mode, Swiss Ephemeris license/path guard, and production blockers.", [DOC_LINKS.astroReadiness, DOC_LINKS.operations]),
    staticCard("monitoring_alerting", "Monitoring/alerting", "ok", "mock_alert_provider", "Structured event and mock alert foundations are available; real alert vendors remain optional and approval-gated.", ["Use mock alert provider in tests; do not configure vendor secrets in the repository."], [DOC_LINKS.monitoring, DOC_LINKS.operations]),
    releaseReadinessCard(report),
    blockersCard(report),
  ];
  return {
    generatedAt:(input.now ?? new Date()).toISOString(),
    environment:operational.environment,
    overallStatus:cards.some((card)=>card.status === "error") ? "error" : cards.some((card)=>card.status === "warning") ? "warning" : "ok",
    cards,
    docLinks:[DOC_LINKS.releaseReadiness, DOC_LINKS.betaSmokeTests, DOC_LINKS.smokeChecklist, DOC_LINKS.rollback, DOC_LINKS.operations, DOC_LINKS.stagingRunbook],
  };
}

export function findOperatorCard(status:OperatorConsoleStatus, id:OperatorCardId):OperatorStatusCard {
  const card = status.cards.find((item)=>item.id === id);
  if (!card) throw new Error(`Missing operator card ${id}.`);
  return card;
}

function componentCard(report:EnvironmentValidationReport, componentName:EnvironmentValidationReport["components"][number]["component"], id:OperatorCardId, title:string, summary:string, links:OperatorDocLink[]):OperatorStatusCard {
  const component = report.components.find((item)=>item.component === componentName);
  if (!component) return staticCard(id, title, "error", "missing", "Component status is missing from environment validation.", ["ENVIRONMENT_COMPONENT_MISSING"], links);
  const blockers = component.errors.map((error)=>error.code);
  const details = [
    ...component.warnings.map((warning)=>`warning:${warning.code}`),
    ...component.errors.map((error)=>`error:${error.code}`),
  ];
  return {
    id,
    title,
    status:component.status,
    mode:safeMode(component.mode),
    summary,
    details:details.length > 0 ? details : ["No active config errors."],
    blockers,
    links,
  };
}

function releaseReadinessCard(report:EnvironmentValidationReport):OperatorStatusCard {
  const productionHardBlocks = report.environment === "production"
    ? report.components.flatMap((component)=>component.errors.map((error)=>error.code))
    : [];
  const blockers = [
    ...productionHardBlocks,
    "HUMAN_APPROVAL_REQUIRED_FOR_PRODUCTION_DEPLOY",
    "HUMAN_APPROVAL_REQUIRED_FOR_REAL_PAYMENT_ACTIVATION",
    "HUMAN_APPROVAL_REQUIRED_FOR_REAL_LINE_EMAIL_SENDS",
    "HUMAN_APPROVAL_REQUIRED_FOR_SWISSEPH_LICENSE_AND_FILE_MANIFEST",
  ];
  return {
    id:"release_readiness",
    title:"Release readiness",
    status:productionHardBlocks.length > 0 ? "error" : "warning",
    mode:report.environment,
    summary:"Beta readiness is tracked separately from production approval.",
    details:["Run beta smoke tests, dry run, and go/no-go checklist before inviting beta users."],
    blockers,
    links:[DOC_LINKS.releaseReadiness, DOC_LINKS.betaSmokeTests, DOC_LINKS.rollback],
  };
}

function blockersCard(report:EnvironmentValidationReport):OperatorStatusCard {
  const blockers = report.components.flatMap((component)=>component.errors.map((error)=>`${component.component}:${error.code}`));
  const warnings = report.components.flatMap((component)=>component.warnings.map((warning)=>`${component.component}:${warning.code}`));
  const betaWarnings = warnings.length > 0 ? warnings : ["No active staging warnings."];
  return {
    id:"known_blockers",
    title:"Known blockers",
    status:blockers.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ok",
    mode:report.environment,
    summary:blockers.length > 0 ? "Configuration blockers must be resolved or explicitly accepted where appropriate." : "No config errors are active.",
    details:betaWarnings,
    blockers,
    links:[DOC_LINKS.releaseReadiness, DOC_LINKS.operations, DOC_LINKS.rollback],
  };
}

function staticCard(id:OperatorCardId, title:string, status:OperatorCardStatus, mode:string, summary:string, details:string[], links:OperatorDocLink[]):OperatorStatusCard {
  return { id, title, status, mode:safeMode(mode), summary, details, blockers:status === "error" ? details : [], links };
}

function safeMode(mode:string):string {
  const normalized = mode.trim().toLowerCase();
  return SAFE_MODES.has(normalized) ? normalized : "unknown";
}

function doc(label:string, filename:string):OperatorDocLink {
  return { label, href:`${DOC_BASE}/${filename}` };
}
