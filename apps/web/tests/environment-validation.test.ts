import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GET as healthGET } from "../app/api/health/route";
import { assertDeploymentEnvironmentReady, toPublicHealthReport, validateDeploymentEnvironment, type ConfigIssue, type EnvironmentValidationReport } from "../src/mvp/environment-validation";

const localEnv = {
  APP_ENV:"local",
  EMAIL_PROVIDER_MODE:"sandbox",
  LINE_PROVIDER_MODE:"sandbox",
  PAYMENT_PROVIDER_MODE:"mock",
  ASTRO_ENGINE:"mock",
  SWISSEPH_LICENSE_MODE:"none",
};

describe("environment validation", () => {
  it("local mock config passes without production secrets", () => {
    const report = validateDeploymentEnvironment(localEnv);

    assert.equal(report.status, "ok");
    assert.equal(report.environment, "local");
    assert.deepEqual(report.components.filter((component)=>component.status === "error"), []);
  });

  it("email real mode requires provider config", () => {
    const report = validateDeploymentEnvironment({ ...localEnv, EMAIL_PROVIDER_MODE:"http" });
    const email = component(report, "email_gateway");

    assert.equal(report.status, "error");
    assert.equal(email.status, "error");
    assertIssueVariables(email.errors, "EMAIL_REAL_PROVIDER_CONFIG_MISSING", ["EMAIL_AUDIT_HASH_SECRET", "EMAIL_FROM_ADDRESS", "EMAIL_PROVIDER_API_KEY", "EMAIL_PROVIDER_ENDPOINT", "EMAIL_WEBHOOK_SECRET"]);
  });

  it("LINE real mode requires channel secret and access token", () => {
    const report = validateDeploymentEnvironment({ ...localEnv, LINE_PROVIDER_MODE:"http" });
    const line = component(report, "line_gateway");

    assert.equal(report.status, "error");
    assertIssueVariables(line.errors, "LINE_REAL_PROVIDER_CONFIG_MISSING", ["LINE_AUDIT_HASH_SECRET", "LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]);
  });

  it("payment real mode requires webhook secret and provider config", () => {
    const report = validateDeploymentEnvironment({ ...localEnv, PAYMENT_PROVIDER_MODE:"http" });
    const payment = component(report, "payment_provider");

    assert.equal(report.status, "error");
    assertIssueVariables(payment.errors, "PAYMENT_REAL_PROVIDER_CONFIG_MISSING", ["PAYMENT_PROVIDER_API_KEY", "PAYMENT_PROVIDER_CHECKOUT_ENDPOINT", "PAYMENT_WEBHOOK_SECRET"]);
  });

  it("astro swisseph production mode requires professional license and ephemeris path", () => {
    const report = validateDeploymentEnvironment({ ...localEnv, APP_ENV:"production", ASTRO_ENGINE:"swisseph", SWISSEPH_LICENSE_MODE:"free", ADMIN_SESSION_SECRET:"admin-secret", EMAIL_AUDIT_HASH_SECRET:"email-audit", LINE_PROVIDER_MODE:"disabled", PAYMENT_PROVIDER_MODE:"http", PAYMENT_PROVIDER_CHECKOUT_ENDPOINT:"https://payments.example.test", PAYMENT_PROVIDER_API_KEY:"payment-api-secret", PAYMENT_WEBHOOK_SECRET:"payment-webhook-secret" });
    const astro = component(report, "astro_calc");

    assert.equal(report.status, "error");
    assertIssueVariables(astro.errors, "SWISSEPH_PROFESSIONAL_LICENSE_REQUIRED", ["SWISSEPH_LICENSE_MODE"]);
    assertIssueVariables(astro.errors, "SWISSEPH_EPHEMERIS_PATH_REQUIRED", ["ASTRO_EPHEMERIS_PATH"]);
  });

  it("staging config fails closed for missing admin session secret", () => {
    const report = validateDeploymentEnvironment({ ...localEnv, APP_ENV:"staging", EMAIL_AUDIT_HASH_SECRET:"email-audit", LINE_AUDIT_HASH_SECRET:"line-audit" });
    const admin = component(report, "admin_auth");

    assert.equal(report.status, "error");
    assertIssueVariables(admin.errors, "ADMIN_AUTH_CONFIG_MISSING", ["ADMIN_SESSION_SECRET"]);
  });

  it("production fails closed for sandbox or mock provider modes", () => {
    const report = validateDeploymentEnvironment({ ...localEnv, APP_ENV:"production", ADMIN_SESSION_SECRET:"admin-secret", EMAIL_AUDIT_HASH_SECRET:"email-audit", LINE_AUDIT_HASH_SECRET:"line-audit" });

    assert.equal(report.status, "error");
    assertIssueVariables(component(report, "email_gateway").errors, "EMAIL_SANDBOX_MODE_PRODUCTION_FORBIDDEN", ["EMAIL_PROVIDER_MODE"]);
    assertIssueVariables(component(report, "line_gateway").errors, "LINE_SANDBOX_MODE_PRODUCTION_FORBIDDEN", ["LINE_PROVIDER_MODE"]);
    assertIssueVariables(component(report, "payment_provider").errors, "PAYMENT_MOCK_MODE_PRODUCTION_FORBIDDEN", ["PAYMENT_PROVIDER_MODE"]);
    assertIssueVariables(component(report, "astro_calc").errors, "ASTRO_MOCK_ENGINE_PRODUCTION_FORBIDDEN", ["ASTRO_ENGINE"]);
  });

  it("health config output never includes raw secrets", () => {
    const report = validateDeploymentEnvironment({
      APP_ENV:"staging",
      ADMIN_SESSION_SECRET:"super-secret-admin-value",
      MOCK_ADMIN_TOKEN:"mock-token-value",
      EMAIL_PROVIDER_MODE:"http",
      EMAIL_FROM_ADDRESS:"noreply@example.test",
      EMAIL_PROVIDER_ENDPOINT:"https://email-provider.example.test/send",
      EMAIL_PROVIDER_API_KEY:"email-api-secret-value",
      EMAIL_WEBHOOK_SECRET:"email-webhook-secret-value",
      EMAIL_AUDIT_HASH_SECRET:"email-audit-secret-value",
      LINE_PROVIDER_MODE:"http",
      LINE_CHANNEL_SECRET:"line-channel-secret-value",
      LINE_CHANNEL_ACCESS_TOKEN:"line-access-token-value",
      LINE_AUDIT_HASH_SECRET:"line-audit-secret-value",
      PAYMENT_PROVIDER_MODE:"http",
      PAYMENT_PROVIDER_CHECKOUT_ENDPOINT:"https://payments.example.test/checkout",
      PAYMENT_PROVIDER_API_KEY:"payment-api-secret-value",
      PAYMENT_WEBHOOK_SECRET:"payment-webhook-secret-value",
      NOTIFICATION_SCHEDULER_MODE:"dry_run",
      NOTIFICATION_SCHEDULER_TOKEN:"scheduler-token-value",
      ASTRO_ENGINE:"swisseph",
      SWISSEPH_LICENSE_MODE:"professional",
      ASTRO_EPHEMERIS_PATH:"/mounted/ephemeris/path",
    });

    const publicReport = toPublicHealthReport(report);
    const serialized = JSON.stringify(publicReport);

    assert.equal(publicReport.status, "ok");
    for (const secret of ["super-secret-admin-value", "mock-token-value", "email-api-secret-value", "email-webhook-secret-value", "line-channel-secret-value", "line-access-token-value", "payment-api-secret-value", "payment-webhook-secret-value", "scheduler-token-value"]) {
      assert.equal(serialized.includes(secret), false, `health report leaked ${secret}`);
    }
  });

  it("missing config errors are sanitized", () => {
    const rawSecret = "actual-secret-value";
    const report = validateDeploymentEnvironment({ ...localEnv, PAYMENT_PROVIDER_MODE:"http", PAYMENT_PROVIDER_API_KEY:rawSecret });
    const serialized = JSON.stringify(report);

    assert.equal(serialized.includes(rawSecret), false);
    assertIssueVariables(component(report, "payment_provider").errors, "PAYMENT_REAL_PROVIDER_CONFIG_MISSING", ["PAYMENT_PROVIDER_CHECKOUT_ENDPOINT", "PAYMENT_WEBHOOK_SECRET"]);
  });

  it("assertDeploymentEnvironmentReady throws sanitized error codes", () => {
    assert.throws(
      () => assertDeploymentEnvironmentReady({ ...localEnv, APP_ENV:"production" }),
      (error) => error instanceof Error && error.message.includes("ENVIRONMENT_CONFIGURATION_INVALID") && !error.message.includes("secret"),
    );
  });

  it("health endpoint returns sanitized JSON and fail-closed status", async () => {
    const previousAppEnv = process.env.APP_ENV;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAdminSecret = process.env.ADMIN_SESSION_SECRET;
    process.env.APP_ENV = "staging";
    restoreEnv("NODE_ENV", undefined);
    restoreEnv("ADMIN_SESSION_SECRET", undefined);
    try {
      const response = healthGET();
      const body = await response.json() as EnvironmentValidationReport;

      assert.equal(response.status, 503);
      assert.equal(body.status, "error");
      assertIssueVariables(component(body, "admin_auth").errors, "ADMIN_AUTH_CONFIG_MISSING", ["ADMIN_SESSION_SECRET"]);
    } finally {
      restoreEnv("APP_ENV", previousAppEnv);
      restoreEnv("NODE_ENV", previousNodeEnv);
      restoreEnv("ADMIN_SESSION_SECRET", previousAdminSecret);
    }
  });
});

function component(report:EnvironmentValidationReport, name:EnvironmentValidationReport["components"][number]["component"]) {
  const found = report.components.find((item)=>item.component === name);
  assert.ok(found, `missing component ${name}`);
  return found;
}

function assertIssueVariables(errors:ConfigIssue[], code:string, variables:string[]):void {
  const found = errors.find((error)=>error.code === code);
  assert.ok(found, `missing issue ${code}`);
  assert.deepEqual(found.variables, [...variables].sort());
}

function restoreEnv(name:string, value:string|undefined):void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
