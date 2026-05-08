import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpEmailProvider, type EmailProvider, type EmailProviderRequest } from "../src/mvp/email-gateway";
import { HttpLineProvider, type LineProvider, type LineProviderPushRequest } from "../src/mvp/line-gateway";
import { HttpPaymentProvider, type CreateCheckoutInput, type PaymentProvider } from "../src/mvp/payment-provider";
import {
  assertProviderNetworkAllowed,
  readProviderActivationFlags,
  runProviderActivationSafetyHarness,
  toPublicProviderActivationReport,
  validateProviderActivationReadiness,
  type ProviderActivationComponentName,
  type ProviderActivationReport,
} from "../src/mvp/provider-activation-guardrails";

const localMockEnv = {
  APP_ENV:"local",
  EMAIL_PROVIDER_MODE:"sandbox",
  LINE_PROVIDER_MODE:"sandbox",
  PAYMENT_PROVIDER_MODE:"mock",
  ASTRO_ENGINE:"mock",
  SWISSEPH_LICENSE_MODE:"none",
};

const fullRealProviderEnv = {
  APP_ENV:"staging",
  ADMIN_SESSION_SECRET:"admin-session-secret",
  EMAIL_PROVIDER_MODE:"http",
  EMAIL_FROM_ADDRESS:"noreply@example.test",
  EMAIL_PROVIDER_ENDPOINT:"https://email-provider.example.test/send",
  EMAIL_PROVIDER_API_KEY:"email-api-secret-value",
  EMAIL_WEBHOOK_SECRET:"email-webhook-secret-value",
  EMAIL_AUDIT_HASH_SECRET:"email-audit-secret-value",
  EMAIL_VERIFIED_SENDER_DOMAIN:"example.test",
  LINE_PROVIDER_MODE:"http",
  LINE_CHANNEL_SECRET:"line-channel-secret-value",
  LINE_CHANNEL_ACCESS_TOKEN:"line-access-token-value",
  LINE_AUDIT_HASH_SECRET:"line-audit-secret-value",
  PAYMENT_PROVIDER_MODE:"http",
  PAYMENT_PROVIDER_CHECKOUT_ENDPOINT:"https://payments.example.test/checkout",
  PAYMENT_PROVIDER_API_KEY:"payment-api-secret-value",
  PAYMENT_WEBHOOK_SECRET:"payment-webhook-secret-value",
  NOTIFICATION_SCHEDULER_MODE:"dry_run",
  ASTRO_ENGINE:"mock",
  SWISSEPH_LICENSE_MODE:"none",
  ENABLE_PROVIDER_DRY_RUN:"false",
};

describe("provider activation guardrails", () => {
  it("mock/local provider mode passes without production secrets", () => {
    const report = validateProviderActivationReadiness(localMockEnv);

    assert.equal(report.status, "ok");
    assert.equal(component(report, "email").mode, "sandbox");
    assert.equal(component(report, "line").mode, "sandbox");
    assert.equal(component(report, "payment").mode, "mock");
    assert.equal(report.components.every((item)=>item.networkCallsAllowed === false), true);
  });

  it("real provider flags default to disabled", () => {
    assert.deepEqual(readProviderActivationFlags({}), {
      enableRealEmailSends:false,
      enableRealLineSends:false,
      enableRealPaymentProvider:false,
      enableProviderDryRun:false,
      providerDryRunExplicitlyDisabled:false,
      requireProviderActivationApproval:false,
    });
  });

  it("real email mode fails closed without required config", () => {
    const report = validateProviderActivationReadiness({ ...localMockEnv, EMAIL_PROVIDER_MODE:"http" });
    const email = component(report, "email");

    assert.equal(report.status, "blocked");
    assert.equal(email.status, "blocked");
    assertIssueVariables(email.errors, "EMAIL_REAL_PROVIDER_CONFIG_MISSING", ["EMAIL_AUDIT_HASH_SECRET", "EMAIL_FROM_ADDRESS", "EMAIL_PROVIDER_API_KEY", "EMAIL_PROVIDER_ENDPOINT", "EMAIL_VERIFIED_SENDER_DOMAIN", "EMAIL_WEBHOOK_SECRET"]);
    assertIssueVariables(email.errors, "EMAIL_REAL_PROVIDER_FLAG_REQUIRED", ["ENABLE_REAL_EMAIL_SENDS"]);
  });

  it("real LINE mode fails closed without required config", () => {
    const report = validateProviderActivationReadiness({ ...localMockEnv, LINE_PROVIDER_MODE:"http" });
    const line = component(report, "line");

    assert.equal(report.status, "blocked");
    assertIssueVariables(line.errors, "LINE_REAL_PROVIDER_CONFIG_MISSING", ["LINE_AUDIT_HASH_SECRET", "LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET"]);
    assertIssueVariables(line.errors, "LINE_REAL_PROVIDER_FLAG_REQUIRED", ["ENABLE_REAL_LINE_SENDS"]);
  });

  it("real payment mode fails closed without required config", () => {
    const report = validateProviderActivationReadiness({ ...localMockEnv, PAYMENT_PROVIDER_MODE:"http" });
    const payment = component(report, "payment");

    assert.equal(report.status, "blocked");
    assertIssueVariables(payment.errors, "PAYMENT_REAL_PROVIDER_CONFIG_MISSING", ["PAYMENT_PROVIDER_API_KEY", "PAYMENT_PROVIDER_CHECKOUT_ENDPOINT", "PAYMENT_WEBHOOK_SECRET"]);
    assertIssueVariables(payment.errors, "PAYMENT_REAL_PROVIDER_FLAG_REQUIRED", ["ENABLE_REAL_PAYMENT_PROVIDER"]);
  });

  it("explicit activation approval flag is required for real provider activation", () => {
    const report = validateProviderActivationReadiness({
      ...fullRealProviderEnv,
      ENABLE_REAL_EMAIL_SENDS:"true",
      ENABLE_REAL_LINE_SENDS:"true",
      ENABLE_REAL_PAYMENT_PROVIDER:"true",
      REQUIRE_PROVIDER_ACTIVATION_APPROVAL:"false",
    });

    assert.equal(report.status, "blocked");
    for (const name of ["email", "line", "payment"] as const) {
      assertIssueVariables(component(report, name).errors, `${name.toUpperCase()}_PROVIDER_APPROVAL_REQUIRED`, ["REQUIRE_PROVIDER_ACTIVATION_APPROVAL"]);
    }
  });

  it("explicit dry-run false flag is required for real provider activation", () => {
    const { ENABLE_PROVIDER_DRY_RUN: _dryRun, ...envWithoutDryRunFlag } = fullRealProviderEnv;
    const report = validateProviderActivationReadiness({
      ...envWithoutDryRunFlag,
      ENABLE_REAL_EMAIL_SENDS:"true",
      ENABLE_REAL_LINE_SENDS:"true",
      ENABLE_REAL_PAYMENT_PROVIDER:"true",
      REQUIRE_PROVIDER_ACTIVATION_APPROVAL:"true",
    });

    assert.equal(report.status, "blocked");
    for (const name of ["email", "line", "payment"] as const) {
      const item = component(report, name);
      assert.equal(item.networkCallsAllowed, false);
      assertIssueVariables(item.errors, `${name.toUpperCase()}_PROVIDER_DRY_RUN_FLAG_REQUIRED`, ["ENABLE_PROVIDER_DRY_RUN"]);
    }
  });

  it("partial env vars do not accidentally activate real email", () => {
    const report = validateProviderActivationReadiness({
      ...localMockEnv,
      EMAIL_PROVIDER_MODE:"http",
      EMAIL_PROVIDER_API_KEY:"partial-email-api-secret",
      ENABLE_REAL_EMAIL_SENDS:"true",
      REQUIRE_PROVIDER_ACTIVATION_APPROVAL:"true",
    });
    const email = component(report, "email");

    assert.equal(email.networkCallsAllowed, false);
    assertIssueVariables(email.errors, "EMAIL_REAL_PROVIDER_CONFIG_MISSING", ["EMAIL_AUDIT_HASH_SECRET", "EMAIL_FROM_ADDRESS", "EMAIL_PROVIDER_ENDPOINT", "EMAIL_VERIFIED_SENDER_DOMAIN", "EMAIL_WEBHOOK_SECRET"]);
  });

  it("partial env vars do not accidentally activate real LINE", () => {
    const report = validateProviderActivationReadiness({
      ...localMockEnv,
      LINE_PROVIDER_MODE:"http",
      LINE_CHANNEL_ACCESS_TOKEN:"partial-line-token",
      ENABLE_REAL_LINE_SENDS:"true",
      REQUIRE_PROVIDER_ACTIVATION_APPROVAL:"true",
    });
    const line = component(report, "line");

    assert.equal(line.networkCallsAllowed, false);
    assertIssueVariables(line.errors, "LINE_REAL_PROVIDER_CONFIG_MISSING", ["LINE_AUDIT_HASH_SECRET", "LINE_CHANNEL_SECRET"]);
  });

  it("partial env vars do not accidentally activate real payment", () => {
    const report = validateProviderActivationReadiness({
      ...localMockEnv,
      PAYMENT_PROVIDER_MODE:"http",
      PAYMENT_PROVIDER_API_KEY:"partial-payment-api-secret",
      ENABLE_REAL_PAYMENT_PROVIDER:"true",
      REQUIRE_PROVIDER_ACTIVATION_APPROVAL:"true",
    });
    const payment = component(report, "payment");

    assert.equal(payment.networkCallsAllowed, false);
    assertIssueVariables(payment.errors, "PAYMENT_REAL_PROVIDER_CONFIG_MISSING", ["PAYMENT_PROVIDER_CHECKOUT_ENDPOINT", "PAYMENT_WEBHOOK_SECRET"]);
  });

  it("real email readiness rejects plaintext endpoint and sender domain mismatch", () => {
    const report = validateProviderActivationReadiness({
      ...fullRealProviderEnv,
      EMAIL_PROVIDER_ENDPOINT:"http://email-provider.example.test/send",
      EMAIL_FROM_ADDRESS:"noreply@other.test",
      ENABLE_REAL_EMAIL_SENDS:"true",
      REQUIRE_PROVIDER_ACTIVATION_APPROVAL:"true",
    });
    const email = component(report, "email");

    assert.equal(report.status, "blocked");
    assert.equal(email.networkCallsAllowed, false);
    assertIssueVariables(email.errors, "EMAIL_PROVIDER_ENDPOINT_HTTPS_REQUIRED", ["EMAIL_PROVIDER_ENDPOINT"]);
    assertIssueVariables(email.errors, "EMAIL_VERIFIED_SENDER_DOMAIN_MISMATCH", ["EMAIL_FROM_ADDRESS", "EMAIL_VERIFIED_SENDER_DOMAIN"]);
  });

  it("real payment readiness rejects plaintext checkout endpoint", () => {
    const report = validateProviderActivationReadiness({
      ...fullRealProviderEnv,
      PAYMENT_PROVIDER_CHECKOUT_ENDPOINT:"http://payments.example.test/checkout",
      ENABLE_REAL_PAYMENT_PROVIDER:"true",
      REQUIRE_PROVIDER_ACTIVATION_APPROVAL:"true",
    });
    const payment = component(report, "payment");

    assert.equal(report.status, "blocked");
    assert.equal(payment.networkCallsAllowed, false);
    assertIssueVariables(payment.errors, "PAYMENT_PROVIDER_ENDPOINT_HTTPS_REQUIRED", ["PAYMENT_PROVIDER_CHECKOUT_ENDPOINT"]);
  });

  it("dry-run mode validates readiness but blocks provider network calls", () => {
    const report = validateProviderActivationReadiness({ ...fullRealProviderEnv, ENABLE_PROVIDER_DRY_RUN:"true" });

    assert.equal(report.status, "dry_run");
    for (const name of ["email", "line", "payment"] as const) {
      const item = component(report, name);
      assert.equal(item.status, "dry_run");
      assert.equal(item.networkCallsAllowed, false);
      assert.throws(() => assertProviderNetworkAllowed(report, name), /PROVIDER_NETWORK_CALL_BLOCKED/);
    }
  });

  it("dry-run mode does not call EmailGateway real provider, LineGateway real provider, or PaymentProvider real adapter", () => {
    const emailProvider = new ThrowingEmailProvider();
    const lineProvider = new ThrowingLineProvider();
    const paymentProvider = new ThrowingPaymentProvider();
    const harness = runProviderActivationSafetyHarness({
      env:{ ...fullRealProviderEnv, ENABLE_PROVIDER_DRY_RUN:"true" },
      networkTelemetry:{
        emailNetworkCalls:emailProvider.networkSendCount,
        lineNetworkCalls:lineProvider.networkSendCount,
        paymentNetworkCalls:paymentProvider.networkCallCount,
      },
    });

    assert.equal(harness.networkCallsAttempted, false);
    assert.equal(emailProvider.networkSendCount, 0);
    assert.equal(lineProvider.networkSendCount, 0);
    assert.equal(paymentProvider.networkCallCount, 0);
  });

  it("blocks provider network allowance when the overall environment report is blocked", () => {
    const report = validateProviderActivationReadiness({
      ...fullRealProviderEnv,
      APP_ENV:"production",
      ADMIN_SESSION_SECRET:"",
      ASTRO_ENGINE:"mock",
      ENABLE_REAL_EMAIL_SENDS:"true",
      ENABLE_REAL_LINE_SENDS:"true",
      ENABLE_REAL_PAYMENT_PROVIDER:"true",
      REQUIRE_PROVIDER_ACTIVATION_APPROVAL:"true",
    });

    assert.equal(report.status, "blocked");
    assert.equal(component(report, "email").networkCallsAllowed, false);
    assert.equal(component(report, "line").networkCallsAllowed, false);
    assert.equal(component(report, "payment").networkCallsAllowed, false);
    assert.throws(() => assertProviderNetworkAllowed(report, "email"), /PROVIDER_NETWORK_CALL_BLOCKED:email/);
  });

  it("safety harness reports attempted network calls from supplied telemetry", () => {
    const harness = runProviderActivationSafetyHarness({
      env:{ ...fullRealProviderEnv, ENABLE_PROVIDER_DRY_RUN:"true" },
      networkTelemetry:{ emailNetworkCalls:1 },
    });

    assert.equal(harness.status, "blocked");
    assert.equal(harness.providerActivation.status, "dry_run");
    assert.equal(harness.networkCallsAttempted, true);
  });

  it("HTTP providers enforce dry-run guardrails before fetch calls", async () => {
    let fetchCalls = 0;
    const fetcher = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ id:"checkout_1", checkoutUrl:"https://payments.example.test/checkout/checkout_1" }), { status:200, headers:{ "content-type":"application/json" } });
    };
    const dryRunEnv = { ...fullRealProviderEnv, ENABLE_PROVIDER_DRY_RUN:"true" };
    const emailProvider = new HttpEmailProvider({ endpoint:"https://email-provider.example.test/send", apiKey:"email-api-secret-value", activationEnv:dryRunEnv, fetcher });
    const lineProvider = new HttpLineProvider({ channelAccessToken:"line-access-token-value", activationEnv:dryRunEnv, fetcher });
    const paymentProvider = new HttpPaymentProvider({ checkoutEndpoint:"https://payments.example.test/checkout", apiKey:"payment-api-secret-value", activationEnv:dryRunEnv, fetcher });

    await assert.rejects(emailProvider.send({ to:"user@example.test", from:"noreply@example.test", subject:"Test", text:"Test", html:"<p>Test</p>", headers:{} }), /PROVIDER_NETWORK_CALL_BLOCKED:email/);
    await assert.rejects(lineProvider.push({ to:"U123456789abcdef", messages:[{ type:"text", text:"Test" }] }), /PROVIDER_NETWORK_CALL_BLOCKED:line/);
    await assert.rejects(paymentProvider.createCheckoutSession({
      userId:"user_a",
      planCode:"premium",
      successUrl:"https://app.example.test/success",
      cancelUrl:"https://app.example.test/cancel",
      currentPeriodStart:"2026-05-01T00:00:00.000Z",
      currentPeriodEnd:"2026-06-01T00:00:00.000Z",
    }), /PROVIDER_NETWORK_CALL_BLOCKED:payment/);
    assert.equal(fetchCalls, 0);
  });

  it("activation status redacts secrets and provider payloads", () => {
    const report = toPublicProviderActivationReport(validateProviderActivationReadiness({
      ...fullRealProviderEnv,
      ENABLE_PROVIDER_DRY_RUN:"true",
      RAW_PAYMENT_PAYLOAD:"{\"card\":\"4242424242424242\"}",
      RAW_LINE_USER_ID:"U123456789abcdef",
      RAW_EMAIL:"person@example.test",
      BIRTH_DATE:"1990-01-01",
    }));
    const serialized = JSON.stringify(report);

    for (const unsafe of [
      "email-api-secret-value",
      "email-webhook-secret-value",
      "email-audit-secret-value",
      "line-channel-secret-value",
      "line-access-token-value",
      "line-audit-secret-value",
      "payment-api-secret-value",
      "payment-webhook-secret-value",
      "4242424242424242",
      "U123456789abcdef",
      "person@example.test",
      "1990-01-01",
    ]) {
      assert.equal(serialized.includes(unsafe), false, `provider activation report leaked ${unsafe}`);
    }
    assert.equal(serialized.includes("EMAIL_PROVIDER_API_KEY"), true);
    assert.equal(serialized.includes("LINE_CHANNEL_ACCESS_TOKEN"), true);
    assert.equal(serialized.includes("PAYMENT_WEBHOOK_SECRET"), true);
  });

  it("safety harness produces sanitized health/status output", () => {
    const harness = runProviderActivationSafetyHarness({ ...fullRealProviderEnv, ENABLE_PROVIDER_DRY_RUN:"true" });
    const serialized = JSON.stringify(harness);

    assert.equal(harness.status, "dry_run");
    assert.equal(serialized.includes("email-api-secret-value"), false);
    assert.equal(serialized.includes("line-access-token-value"), false);
    assert.equal(serialized.includes("payment-webhook-secret-value"), false);
  });
});

class ThrowingEmailProvider implements EmailProvider {
  networkSendCount = 0;
  async send(_request:EmailProviderRequest):Promise<never> {
    this.networkSendCount += 1;
    throw new Error("test provider must not be called");
  }
}

class ThrowingLineProvider implements LineProvider {
  networkSendCount = 0;
  async push(_request:LineProviderPushRequest):Promise<never> {
    this.networkSendCount += 1;
    throw new Error("test provider must not be called");
  }
}

class ThrowingPaymentProvider implements PaymentProvider {
  readonly provider = "http" as const;
  networkCallCount = 0;
  async createCheckoutSession(_input:CreateCheckoutInput):Promise<never> {
    this.networkCallCount += 1;
    throw new Error("test provider must not be called");
  }
  async verifyWebhook():Promise<never> {
    this.networkCallCount += 1;
    throw new Error("test provider must not be called");
  }
  async parseWebhook():Promise<never> {
    this.networkCallCount += 1;
    throw new Error("test provider must not be called");
  }
}

function component(report:ProviderActivationReport, name:ProviderActivationComponentName) {
  const found = report.components.find((item)=>item.component === name);
  assert.ok(found, `missing component ${name}`);
  return found;
}

function assertIssueVariables(errors:{ code:string; variables:string[] }[], code:string, variables:string[]):void {
  const found = errors.find((error)=>error.code === code);
  assert.ok(found, `missing issue ${code}`);
  assert.deepEqual(found.variables, [...variables].sort());
}
