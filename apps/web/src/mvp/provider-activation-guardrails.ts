import { toPublicHealthReport, validateDeploymentEnvironment, type ConfigIssue, type DeploymentEnvironment, type EnvironmentInput } from "./environment-validation";

export type ProviderActivationComponentName = "email"|"line"|"payment";
export type ProviderActivationMode = "sandbox"|"mock"|"http"|"disabled"|"invalid";
export type ProviderActivationStatus = "ok"|"dry_run"|"blocked";

export interface ProviderActivationFlags {
  enableRealEmailSends:boolean;
  enableRealLineSends:boolean;
  enableRealPaymentProvider:boolean;
  enableProviderDryRun:boolean;
  providerDryRunExplicitlyDisabled:boolean;
  requireProviderActivationApproval:boolean;
}

export interface ProviderActivationComponent {
  component:ProviderActivationComponentName;
  mode:ProviderActivationMode;
  status:ProviderActivationStatus;
  networkCallsAllowed:boolean;
  requiredVariables:string[];
  errors:ConfigIssue[];
  warnings:ConfigIssue[];
}

export interface ProviderActivationReport {
  status:ProviderActivationStatus;
  environment:DeploymentEnvironment;
  flags:ProviderActivationFlags;
  components:ProviderActivationComponent[];
}

export interface ProviderActivationNetworkTelemetry {
  emailNetworkCalls?:number;
  lineNetworkCalls?:number;
  paymentNetworkCalls?:number;
  fetchCalls?:number;
}

export interface ProviderActivationSafetyHarnessOptions {
  env?:EnvironmentInput;
  networkTelemetry?:ProviderActivationNetworkTelemetry;
}

const EMAIL_REQUIRED_VARS = ["EMAIL_FROM_ADDRESS", "EMAIL_PROVIDER_ENDPOINT", "EMAIL_PROVIDER_API_KEY", "EMAIL_WEBHOOK_SECRET", "EMAIL_AUDIT_HASH_SECRET", "EMAIL_VERIFIED_SENDER_DOMAIN"];
const LINE_REQUIRED_VARS = ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN", "LINE_AUDIT_HASH_SECRET"];
const PAYMENT_REQUIRED_VARS = ["PAYMENT_PROVIDER_CHECKOUT_ENDPOINT", "PAYMENT_PROVIDER_API_KEY", "PAYMENT_WEBHOOK_SECRET"];

export function readProviderActivationFlags(env:EnvironmentInput = process.env):ProviderActivationFlags {
  return {
    enableRealEmailSends:isTrue(env.ENABLE_REAL_EMAIL_SENDS),
    enableRealLineSends:isTrue(env.ENABLE_REAL_LINE_SENDS),
    enableRealPaymentProvider:isTrue(env.ENABLE_REAL_PAYMENT_PROVIDER),
    enableProviderDryRun:isTrue(env.ENABLE_PROVIDER_DRY_RUN),
    providerDryRunExplicitlyDisabled:isExplicitFalse(env.ENABLE_PROVIDER_DRY_RUN),
    requireProviderActivationApproval:isTrue(env.REQUIRE_PROVIDER_ACTIVATION_APPROVAL),
  };
}

export function validateProviderActivationReadiness(env:EnvironmentInput = process.env):ProviderActivationReport {
  const environmentReport = validateDeploymentEnvironment(env);
  const environment = environmentReport.environment;
  const flags = readProviderActivationFlags(env);
  const environmentReady = environmentReport.status === "ok";
  const components = [
    providerComponent({
      component:"email",
      mode:readMode(env.EMAIL_PROVIDER_MODE, "sandbox", ["sandbox", "http"]),
      requiredVariables:EMAIL_REQUIRED_VARS,
      realEnableFlag:"ENABLE_REAL_EMAIL_SENDS",
      realEnabled:flags.enableRealEmailSends,
      env,
      flags,
      environment,
      environmentReady,
    }),
    providerComponent({
      component:"line",
      mode:readMode(env.LINE_PROVIDER_MODE, "sandbox", ["sandbox", "http", "disabled"]),
      requiredVariables:LINE_REQUIRED_VARS,
      realEnableFlag:"ENABLE_REAL_LINE_SENDS",
      realEnabled:flags.enableRealLineSends,
      env,
      flags,
      environment,
      environmentReady,
    }),
    providerComponent({
      component:"payment",
      mode:readMode(env.PAYMENT_PROVIDER_MODE, "mock", ["mock", "http"]),
      requiredVariables:PAYMENT_REQUIRED_VARS,
      realEnableFlag:"ENABLE_REAL_PAYMENT_PROVIDER",
      realEnabled:flags.enableRealPaymentProvider,
      env,
      flags,
      environment,
      environmentReady,
    }),
  ];
  const status:ProviderActivationStatus = components.some((component)=>component.status==="blocked") || environmentReport.status === "error" ? "blocked" : components.some((component)=>component.status==="dry_run") ? "dry_run" : "ok";
  return { status, environment, flags, components };
}

export function toPublicProviderActivationReport(report:ProviderActivationReport):ProviderActivationReport {
  return {
    status:report.status,
    environment:report.environment,
    flags:{ ...report.flags },
    components:report.components.map((component)=>({
      component:component.component,
      mode:component.mode,
      status:component.status,
      networkCallsAllowed:component.networkCallsAllowed,
      requiredVariables:[...component.requiredVariables].sort(),
      errors:component.errors.map(sanitizeIssue),
      warnings:component.warnings.map(sanitizeIssue),
    })),
  };
}

export function assertProviderNetworkAllowed(report:ProviderActivationReport, componentName:ProviderActivationComponentName):void {
  const component = report.components.find((item)=>item.component === componentName);
  if (report.status !== "ok" || !component?.networkCallsAllowed) throw new Error(`PROVIDER_NETWORK_CALL_BLOCKED:${componentName}`);
}

export function runProviderActivationSafetyHarness(input:EnvironmentInput|ProviderActivationSafetyHarnessOptions = process.env):{
  status:ProviderActivationStatus;
  providerActivation:ProviderActivationReport;
  environmentHealth:ReturnType<typeof toPublicHealthReport>;
  networkCallsAttempted:boolean;
} {
  const env = isHarnessOptions(input) ? input.env ?? process.env : input;
  const networkTelemetry = isHarnessOptions(input) ? input.networkTelemetry : undefined;
  const providerActivation = toPublicProviderActivationReport(validateProviderActivationReadiness(env));
  const environmentHealth = toPublicHealthReport(validateDeploymentEnvironment(env));
  const networkCallsDetected = networkCallsAttempted(networkTelemetry);
  return { status:networkCallsDetected ? "blocked" : providerActivation.status, providerActivation, environmentHealth, networkCallsAttempted:networkCallsDetected };
}

function providerComponent(input:{
  component:ProviderActivationComponentName;
  mode:ProviderActivationMode;
  requiredVariables:string[];
  realEnableFlag:"ENABLE_REAL_EMAIL_SENDS"|"ENABLE_REAL_LINE_SENDS"|"ENABLE_REAL_PAYMENT_PROVIDER";
  realEnabled:boolean;
  env:EnvironmentInput;
  flags:ProviderActivationFlags;
  environment:DeploymentEnvironment;
  environmentReady:boolean;
}):ProviderActivationComponent {
  const errors:ConfigIssue[] = [];
  const warnings:ConfigIssue[] = [];
  if (input.mode === "invalid") errors.push(issue(`${input.component.toUpperCase()}_PROVIDER_MODE_INVALID`, "Provider mode is invalid.", [`${input.component.toUpperCase()}_PROVIDER_MODE`]));
  if (input.mode === "http") {
    const missing = input.requiredVariables.filter((name)=>!hasValue(input.env[name]));
    if (missing.length > 0) errors.push(issue(`${input.component.toUpperCase()}_REAL_PROVIDER_CONFIG_MISSING`, "Real provider mode requires all provider activation configuration.", missing));
    if (input.flags.enableProviderDryRun) {
      warnings.push(issue(`${input.component.toUpperCase()}_PROVIDER_DRY_RUN`, "Provider readiness is in dry-run mode; no real provider calls are allowed.", ["ENABLE_PROVIDER_DRY_RUN"]));
    } else {
      if (!input.flags.providerDryRunExplicitlyDisabled) errors.push(issue(`${input.component.toUpperCase()}_PROVIDER_DRY_RUN_FLAG_REQUIRED`, "Real provider activation requires ENABLE_PROVIDER_DRY_RUN=false to be explicit.", ["ENABLE_PROVIDER_DRY_RUN"]));
      if (!input.realEnabled) errors.push(issue(`${input.component.toUpperCase()}_REAL_PROVIDER_FLAG_REQUIRED`, "Real provider activation requires an explicit enable flag.", [input.realEnableFlag]));
      if (!input.flags.requireProviderActivationApproval) errors.push(issue(`${input.component.toUpperCase()}_PROVIDER_APPROVAL_REQUIRED`, "Real provider activation requires explicit human approval configuration.", ["REQUIRE_PROVIDER_ACTIVATION_APPROVAL"]));
    }
    if (input.environment === "production" && input.flags.enableProviderDryRun) errors.push(issue(`${input.component.toUpperCase()}_PROVIDER_DRY_RUN_PRODUCTION_FORBIDDEN`, "Production provider activation cannot run in dry-run mode.", ["ENABLE_PROVIDER_DRY_RUN"]));
  }
  const networkCallsAllowed = input.environmentReady && input.mode === "http" && input.realEnabled && input.flags.providerDryRunExplicitlyDisabled && input.flags.requireProviderActivationApproval && errors.length === 0;
  return {
    component:input.component,
    mode:input.mode,
    status:errors.length > 0 ? "blocked" : input.mode === "http" && input.flags.enableProviderDryRun ? "dry_run" : "ok",
    networkCallsAllowed,
    requiredVariables:input.mode === "http" ? [...input.requiredVariables].sort() : [],
    errors,
    warnings,
  };
}

function readMode<T extends string>(value:string|undefined, fallback:T, allowed:readonly T[]):T|"invalid" {
  const normalized = (value ?? fallback).trim().toLowerCase();
  return (allowed as readonly string[]).includes(normalized) ? normalized as T : "invalid";
}

function isTrue(value:string|undefined):boolean {
  return (value ?? "false").trim().toLowerCase() === "true";
}

function isExplicitFalse(value:string|undefined):boolean {
  return (value ?? "").trim().toLowerCase() === "false";
}

function hasValue(value:string|undefined):boolean {
  return Boolean(value?.trim());
}

function isHarnessOptions(input:EnvironmentInput|ProviderActivationSafetyHarnessOptions):input is ProviderActivationSafetyHarnessOptions {
  return "env" in input || "networkTelemetry" in input;
}

function networkCallsAttempted(telemetry:ProviderActivationNetworkTelemetry|undefined):boolean {
  return Boolean((telemetry?.emailNetworkCalls ?? 0) > 0 || (telemetry?.lineNetworkCalls ?? 0) > 0 || (telemetry?.paymentNetworkCalls ?? 0) > 0 || (telemetry?.fetchCalls ?? 0) > 0);
}

function issue(code:string, message:string, variables:string[]):ConfigIssue {
  return { code, message, variables:[...variables].sort() };
}

function sanitizeIssue(configIssue:ConfigIssue):ConfigIssue {
  return issue(configIssue.code, configIssue.message, configIssue.variables);
}
