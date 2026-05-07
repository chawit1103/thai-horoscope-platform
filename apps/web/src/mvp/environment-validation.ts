export type DeploymentEnvironment = "local"|"staging"|"production";
export type ConfigStatus = "ok"|"error";
export type ComponentStatus = "ok"|"error"|"warning";
export type ProviderMode = "sandbox"|"mock"|"http"|"disabled";

export interface ConfigIssue {
  code:string;
  message:string;
  variables:string[];
}

export interface ComponentHealth {
  component:"deployment_environment"|"admin_auth"|"email_gateway"|"line_gateway"|"payment_provider"|"notification_scheduler"|"astro_calc";
  status:ComponentStatus;
  mode:string;
  errors:ConfigIssue[];
  warnings:ConfigIssue[];
}

export interface EnvironmentValidationReport {
  status:ConfigStatus;
  environment:DeploymentEnvironment;
  service:"web";
  components:ComponentHealth[];
}

export type EnvironmentInput = Record<string, string|undefined>;

const LOCAL_ENVIRONMENTS = new Set(["local", "development", "test"]);
const STAGING_ENVIRONMENTS = new Set(["staging", "preview"]);
const PRODUCTION_ENVIRONMENTS = new Set(["production"]);
const DEPLOYMENT_ENVIRONMENT_SOURCES = ["APP_ENV", "DEPLOYMENT_ENV", "VERCEL_ENV"] as const;
const RUNTIME_ENVIRONMENT_SOURCES = ["NODE_ENV"] as const;
const ENVIRONMENT_SOURCES = [...DEPLOYMENT_ENVIRONMENT_SOURCES, ...RUNTIME_ENVIRONMENT_SOURCES] as const;

export function validateDeploymentEnvironment(env:EnvironmentInput = process.env):EnvironmentValidationReport {
  const environment = readDeploymentEnvironment(env);
  const components = [
    validateDeploymentEnvironmentSource(env),
    validateAdminAuth(env, environment),
    validateEmailGateway(env, environment),
    validateLineGateway(env, environment),
    validatePaymentProvider(env, environment),
    validateNotificationScheduler(env, environment),
    validateAstroCalc(env, environment),
  ];
  return {
    status:components.some((component)=>component.status==="error") ? "error" : "ok",
    environment,
    service:"web",
    components,
  };
}

export function readDeploymentEnvironment(env:EnvironmentInput = process.env):DeploymentEnvironment {
  const deploymentValues = readDeploymentEnvironmentValues(env, DEPLOYMENT_ENVIRONMENT_SOURCES);
  if (deploymentValues.some(({ raw })=>PRODUCTION_ENVIRONMENTS.has(raw))) return "production";
  if (deploymentValues.some(({ raw })=>LOCAL_ENVIRONMENTS.has(raw)) && hasRuntimeProductionSignal(env)) return "production";
  if (deploymentValues.some(({ raw })=>STAGING_ENVIRONMENTS.has(raw))) return "staging";
  if (deploymentValues.some(({ raw })=>LOCAL_ENVIRONMENTS.has(raw))) return "local";

  const runtimeValues = readDeploymentEnvironmentValues(env, RUNTIME_ENVIRONMENT_SOURCES);
  if (runtimeValues.some(({ raw })=>PRODUCTION_ENVIRONMENTS.has(raw))) return "production";
  if (runtimeValues.some(({ raw })=>STAGING_ENVIRONMENTS.has(raw))) return "staging";
  if (runtimeValues.some(({ raw })=>LOCAL_ENVIRONMENTS.has(raw))) return "local";
  return "local";
}

function readDeploymentEnvironmentValues<T extends readonly (typeof ENVIRONMENT_SOURCES[number])[]>(env:EnvironmentInput, sources:T):{ source:T[number]; raw:string }[] {
  const values:{ source:T[number]; raw:string }[] = [];
  for (const source of sources) {
    const raw = normalize(env[source] ?? "");
    if (!raw) continue;
    values.push({ source, raw });
  }
  return values;
}

export function assertDeploymentEnvironmentReady(env:EnvironmentInput = process.env):EnvironmentValidationReport {
  const report = validateDeploymentEnvironment(env);
  if (report.status !== "ok") {
    const codes = report.components.flatMap((component)=>component.errors.map((error)=>`${component.component}:${error.code}`));
    throw new Error(`ENVIRONMENT_CONFIGURATION_INVALID: ${codes.join(", ")}`);
  }
  return report;
}

export function toPublicHealthReport(report:EnvironmentValidationReport):EnvironmentValidationReport {
  return {
    status:report.status,
    environment:report.environment,
    service:report.service,
    components:report.components.map((component)=>({
      component:component.component,
      status:component.status,
      mode:component.mode,
      errors:component.errors.map(sanitizeIssue),
      warnings:component.warnings.map(sanitizeIssue),
    })),
  };
}

function validateAdminAuth(env:EnvironmentInput, environment:DeploymentEnvironment):ComponentHealth {
  const errors:ConfigIssue[] = [];
  const warnings:ConfigIssue[] = [];
  if (environment !== "local") requireVars(env, ["ADMIN_SESSION_SECRET"], errors, "ADMIN_AUTH_CONFIG_MISSING", "Admin sessions require a configured signing secret outside local development.");
  if (environment === "production" && hasValue(env.MOCK_ADMIN_TOKEN)) {
    errors.push(issue("MOCK_ADMIN_TOKEN_PRODUCTION_FORBIDDEN", "Mock admin token must not be configured in production.", ["MOCK_ADMIN_TOKEN"]));
  }
  if (environment === "staging" && !hasValue(env.MOCK_ADMIN_TOKEN)) {
    warnings.push(issue("MOCK_ADMIN_TOKEN_NOT_CONFIGURED", "Staging mock admin sign-in is unavailable unless explicitly configured.", ["MOCK_ADMIN_TOKEN"]));
  }
  return component("admin_auth", environment === "local" ? "local" : "signed_cookie", errors, warnings);
}

function validateDeploymentEnvironmentSource(env:EnvironmentInput):ComponentHealth {
  const errors:ConfigIssue[] = [];
  const deploymentValues = readDeploymentEnvironmentValues(env, DEPLOYMENT_ENVIRONMENT_SOURCES);
  const runtimeValues = readDeploymentEnvironmentValues(env, RUNTIME_ENVIRONMENT_SOURCES);
  const values = [...deploymentValues, ...runtimeValues];
  const hasDeploymentProductionSignal = deploymentValues.some(({ raw })=>PRODUCTION_ENVIRONMENTS.has(raw));
  const hasRuntimeProductionSignalOnly = deploymentValues.length === 0 || deploymentValues.some(({ raw })=>LOCAL_ENVIRONMENTS.has(raw));
  const hasProductionSignal = hasDeploymentProductionSignal || (hasRuntimeProductionSignalOnly && runtimeValues.some(({ raw })=>PRODUCTION_ENVIRONMENTS.has(raw)));
  for (const { source, raw } of values) {
    if (!PRODUCTION_ENVIRONMENTS.has(raw) && !STAGING_ENVIRONMENTS.has(raw) && !LOCAL_ENVIRONMENTS.has(raw)) {
      errors.push(issue("DEPLOYMENT_ENVIRONMENT_INVALID", `${source} must be local, development, test, staging, preview, or production.`, [source]));
    }
    if (hasProductionSignal && !PRODUCTION_ENVIRONMENTS.has(raw)) {
      errors.push(issue("DEPLOYMENT_ENVIRONMENT_CONFLICT", "Production environment signals must not be mixed with local or staging values.", [source]));
    }
  }
  return component("deployment_environment", readDeploymentEnvironment(env), errors, []);
}

function hasRuntimeProductionSignal(env:EnvironmentInput):boolean {
  return readDeploymentEnvironmentValues(env, RUNTIME_ENVIRONMENT_SOURCES).some(({ raw })=>PRODUCTION_ENVIRONMENTS.has(raw));
}

function validateEmailGateway(env:EnvironmentInput, environment:DeploymentEnvironment):ComponentHealth {
  const mode = readMode(env.EMAIL_PROVIDER_MODE, "sandbox", ["sandbox", "http"]);
  const errors:ConfigIssue[] = [];
  const warnings:ConfigIssue[] = [];
  if (mode === "invalid") errors.push(issue("EMAIL_PROVIDER_MODE_INVALID", "EMAIL_PROVIDER_MODE must be sandbox or http.", ["EMAIL_PROVIDER_MODE"]));
  if (mode === "http") {
    requireVars(env, ["EMAIL_FROM_ADDRESS", "EMAIL_PROVIDER_ENDPOINT", "EMAIL_PROVIDER_API_KEY", "EMAIL_WEBHOOK_SECRET", "EMAIL_AUDIT_HASH_SECRET", "EMAIL_VERIFIED_SENDER_DOMAIN"], errors, "EMAIL_REAL_PROVIDER_CONFIG_MISSING", "Real email provider mode requires provider endpoint, API key, webhook secret, sender, verified sender/domain, and audit hash secret.");
    validateProviderActivationFlags(env, environment, errors, warnings, "EMAIL", "ENABLE_REAL_EMAIL_SENDS");
  }
  if (environment === "production" && mode === "sandbox") errors.push(issue("EMAIL_SANDBOX_MODE_PRODUCTION_FORBIDDEN", "Email sandbox mode is not production-ready.", ["EMAIL_PROVIDER_MODE"]));
  else if (environment === "staging" && mode === "sandbox") warnings.push(issue("EMAIL_SANDBOX_MODE", "Email gateway is in sandbox mode.", ["EMAIL_PROVIDER_MODE"]));
  if (environment !== "local" && mode !== "invalid") requireVars(env, ["EMAIL_AUDIT_HASH_SECRET"], errors, "EMAIL_AUDIT_CONFIG_MISSING", "Email audit hashing requires a secret outside local development.");
  return component("email_gateway", mode, errors, warnings);
}

function validateLineGateway(env:EnvironmentInput, environment:DeploymentEnvironment):ComponentHealth {
  const mode = readMode(env.LINE_PROVIDER_MODE, "sandbox", ["sandbox", "http", "disabled"]);
  const errors:ConfigIssue[] = [];
  const warnings:ConfigIssue[] = [];
  if (mode === "invalid") errors.push(issue("LINE_PROVIDER_MODE_INVALID", "LINE_PROVIDER_MODE must be sandbox, http, or disabled.", ["LINE_PROVIDER_MODE"]));
  if (mode === "http") {
    requireVars(env, ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN", "LINE_AUDIT_HASH_SECRET"], errors, "LINE_REAL_PROVIDER_CONFIG_MISSING", "Real LINE provider mode requires channel secret, access token, and audit hash secret.");
    validateProviderActivationFlags(env, environment, errors, warnings, "LINE", "ENABLE_REAL_LINE_SENDS");
  }
  if (environment === "production" && mode === "sandbox") errors.push(issue("LINE_SANDBOX_MODE_PRODUCTION_FORBIDDEN", "LINE sandbox mode is not production-ready.", ["LINE_PROVIDER_MODE"]));
  else if (environment === "staging" && mode === "sandbox") warnings.push(issue("LINE_SANDBOX_MODE", "LINE gateway is in sandbox mode.", ["LINE_PROVIDER_MODE"]));
  if (environment === "production" && mode === "disabled") errors.push(issue("LINE_PROVIDER_DISABLED_IN_PRODUCTION", "LINE provider cannot be disabled for production readiness.", ["LINE_PROVIDER_MODE"]));
  if (environment !== "local" && mode !== "disabled" && mode !== "invalid") requireVars(env, ["LINE_AUDIT_HASH_SECRET"], errors, "LINE_AUDIT_CONFIG_MISSING", "LINE audit hashing requires a secret outside local development.");
  return component("line_gateway", mode, errors, warnings);
}

function validatePaymentProvider(env:EnvironmentInput, environment:DeploymentEnvironment):ComponentHealth {
  const mode = readMode(env.PAYMENT_PROVIDER_MODE, "mock", ["mock", "http"]);
  const errors:ConfigIssue[] = [];
  const warnings:ConfigIssue[] = [];
  if (mode === "invalid") errors.push(issue("PAYMENT_PROVIDER_MODE_INVALID", "PAYMENT_PROVIDER_MODE must be mock or http.", ["PAYMENT_PROVIDER_MODE"]));
  if (mode === "http") {
    requireVars(env, ["PAYMENT_PROVIDER_CHECKOUT_ENDPOINT", "PAYMENT_PROVIDER_API_KEY", "PAYMENT_WEBHOOK_SECRET"], errors, "PAYMENT_REAL_PROVIDER_CONFIG_MISSING", "Real payment provider mode requires checkout endpoint, API key, and webhook secret.");
    validateProviderActivationFlags(env, environment, errors, warnings, "PAYMENT", "ENABLE_REAL_PAYMENT_PROVIDER");
  }
  if (environment === "production" && mode === "mock") errors.push(issue("PAYMENT_MOCK_MODE_PRODUCTION_FORBIDDEN", "Mock payment provider is not production-ready.", ["PAYMENT_PROVIDER_MODE"]));
  if (environment === "staging" && mode === "mock") warnings.push(issue("PAYMENT_MOCK_MODE_STAGING", "Staging payment provider is still mock.", ["PAYMENT_PROVIDER_MODE"]));
  return component("payment_provider", mode, errors, warnings);
}

function validateNotificationScheduler(env:EnvironmentInput, environment:DeploymentEnvironment):ComponentHealth {
  const mode = readMode(env.NOTIFICATION_SCHEDULER_MODE, "disabled", ["disabled", "dry_run", "enabled"]);
  const errors:ConfigIssue[] = [];
  const warnings:ConfigIssue[] = [];
  if (mode === "invalid") errors.push(issue("NOTIFICATION_SCHEDULER_MODE_INVALID", "NOTIFICATION_SCHEDULER_MODE must be disabled, dry_run, or enabled.", ["NOTIFICATION_SCHEDULER_MODE"]));
  if (environment !== "local" && mode === "enabled") {
    requireVars(env, ["NOTIFICATION_SCHEDULER_TOKEN"], errors, "NOTIFICATION_SCHEDULER_CONFIG_MISSING", "Enabled staging or production scheduler requires an internal trigger token.");
  }
  if (environment !== "local" && mode === "disabled") warnings.push(issue("NOTIFICATION_SCHEDULER_DISABLED", "Notification scheduler is disabled.", ["NOTIFICATION_SCHEDULER_MODE"]));
  return component("notification_scheduler", mode, errors, warnings);
}

function validateAstroCalc(env:EnvironmentInput, environment:DeploymentEnvironment):ComponentHealth {
  const engine = readMode(env.ASTRO_ENGINE, "mock", ["mock", "swisseph"]);
  const errors:ConfigIssue[] = [];
  const warnings:ConfigIssue[] = [];
  if (engine === "invalid") errors.push(issue("ASTRO_ENGINE_INVALID", "ASTRO_ENGINE must be mock or swisseph.", ["ASTRO_ENGINE"]));
  if (engine === "swisseph") {
    const license = normalize(env.SWISSEPH_LICENSE_MODE ?? "none");
    if (!["none", "free", "professional"].includes(license)) errors.push(issue("SWISSEPH_LICENSE_MODE_INVALID", "SWISSEPH_LICENSE_MODE must be none, free, or professional.", ["SWISSEPH_LICENSE_MODE"]));
    if (environment === "production" && license !== "professional") errors.push(issue("SWISSEPH_PROFESSIONAL_LICENSE_REQUIRED", "Swiss Ephemeris production mode requires professional license mode.", ["SWISSEPH_LICENSE_MODE"]));
    if (environment !== "production" && license === "none") errors.push(issue("SWISSEPH_EXPLICIT_LICENSE_REQUIRED", "Swiss Ephemeris mode requires an explicit non-none license mode.", ["SWISSEPH_LICENSE_MODE"]));
    requireVars(env, ["ASTRO_EPHEMERIS_PATH"], errors, "SWISSEPH_EPHEMERIS_PATH_REQUIRED", "Swiss Ephemeris mode requires an ephemeris path; runtime downloads are disabled.");
  }
  if (environment === "production" && engine === "mock") errors.push(issue("ASTRO_MOCK_ENGINE_PRODUCTION_FORBIDDEN", "Mock astro engine is not production-ready.", ["ASTRO_ENGINE"]));
  if (environment === "staging" && engine === "mock") warnings.push(issue("ASTRO_MOCK_ENGINE_STAGING", "Staging astro engine is mock.", ["ASTRO_ENGINE"]));
  return component("astro_calc", engine, errors, warnings);
}

function requireVars(env:EnvironmentInput, names:string[], errors:ConfigIssue[], code:string, message:string):void {
  const missing = names.filter((name)=>!hasValue(env[name]));
  if (missing.length > 0) errors.push(issue(code, message, missing));
}

function validateProviderActivationFlags(env:EnvironmentInput, environment:DeploymentEnvironment, errors:ConfigIssue[], warnings:ConfigIssue[], prefix:"EMAIL"|"LINE"|"PAYMENT", realEnableFlag:"ENABLE_REAL_EMAIL_SENDS"|"ENABLE_REAL_LINE_SENDS"|"ENABLE_REAL_PAYMENT_PROVIDER"):void {
  if (isTrue(env.ENABLE_PROVIDER_DRY_RUN)) {
    warnings.push(issue(`${prefix}_PROVIDER_DRY_RUN`, "Provider dry-run validates real provider readiness without allowing network calls.", ["ENABLE_PROVIDER_DRY_RUN"]));
    if (environment === "production") errors.push(issue(`${prefix}_PROVIDER_DRY_RUN_PRODUCTION_FORBIDDEN`, "Production real provider mode cannot run with provider dry-run enabled.", ["ENABLE_PROVIDER_DRY_RUN"]));
    return;
  }
  if (!isTrue(env[realEnableFlag])) errors.push(issue(`${prefix}_REAL_PROVIDER_FLAG_REQUIRED`, "Real provider mode requires an explicit real-provider enable flag.", [realEnableFlag]));
  if (!isTrue(env.REQUIRE_PROVIDER_ACTIVATION_APPROVAL)) errors.push(issue(`${prefix}_PROVIDER_APPROVAL_REQUIRED`, "Real provider activation requires an explicit human approval gate flag.", ["REQUIRE_PROVIDER_ACTIVATION_APPROVAL"]));
}

function component(componentName:ComponentHealth["component"], mode:string, errors:ConfigIssue[], warnings:ConfigIssue[]):ComponentHealth {
  return { component:componentName, status:errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ok", mode, errors, warnings };
}

function issue(code:string, message:string, variables:string[]):ConfigIssue {
  return { code, message, variables:[...variables].sort() };
}

function sanitizeIssue(configIssue:ConfigIssue):ConfigIssue {
  return issue(configIssue.code, configIssue.message, configIssue.variables);
}

function readMode<T extends string>(value:string|undefined, fallback:T, allowed:readonly T[]):T|"invalid" {
  const normalized = normalize(value ?? fallback);
  return (allowed as readonly string[]).includes(normalized) ? normalized as T : "invalid";
}

function normalize(value:string):string {
  return value.trim().toLowerCase();
}

function hasValue(value:string|undefined):boolean {
  return Boolean(value?.trim());
}

function isTrue(value:string|undefined):boolean {
  return normalize(value ?? "false") === "true";
}
