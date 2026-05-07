import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InMemoryStructuredLogger,
  MockAlertProvider,
  astroCalcFailureEvent,
  createMonitoringEvent,
  emailDeliveryFailureEvent,
  emitMonitoringEvent,
  environmentValidationFailureEvents,
  lineDeliveryFailureEvent,
  operationalStatusFromEnvironmentReport,
  paymentWebhookFailureEvent,
  redactForObservability,
} from "../src/mvp/observability";
import { validateDeploymentEnvironment } from "../src/mvp/environment-validation";

describe("observability", () => {
  it("redacts email addresses", () => {
    const redacted = JSON.stringify(redactForObservability({ email:"user@example.test", message:"failed for user@example.test" }));

    assert.equal(redacted.includes("user@example.test"), false);
    assert.equal(redacted.includes("[REDACTED_EMAIL]"), true);
  });

  it("redacts LINE user IDs", () => {
    const redacted = JSON.stringify(redactForObservability({ lineUserId:"U1234567890abcdef", body:"blocked U1234567890abcdef" }));

    assert.equal(redacted.includes("U1234567890abcdef"), false);
    assert.equal(redacted.includes("[REDACTED_LINE_USER]") || redacted.includes("[REDACTED]"), true);
  });

  it("redacts birth date time and place", () => {
    const redacted = JSON.stringify(redactForObservability({ birthDate:"1992-08-15", birthTime:"07:30", birthPlace:"Bangkok", note:"born 1992-08-15 at 07:30 in Bangkok" }));

    assert.equal(redacted.includes("1992-08-15"), false);
    assert.equal(redacted.includes("07:30"), false);
    assert.equal(redacted.includes("\"Bangkok\""), false);
  });

  it("redacts API keys secrets and card-like values", () => {
    const redacted = JSON.stringify(redactForObservability({ apiKey:"sk_live_secret123456", authorization:"Bearer payment-secret", cardNumber:"4242424242424242", message:"card 4242 4242 4242 4242 webhook whsec_1234567890abcdef bearer sk-proj-abcdef1234567890", reason:"Authorization: sk-proj-zyxwvut987654321" }));

    for (const unsafe of ["sk_live_secret123456", "Bearer payment-secret", "4242424242424242", "4242 4242 4242 4242", "whsec_1234567890abcdef", "whsec_abcdef1234567890", "sk-proj-abcdef1234567890", "sk-proj-zyxwvut987654321"]) {
      assert.equal(redacted.includes(unsafe), false, `leaked ${unsafe}`);
    }
  });

  it("payment webhook failure event does not include raw payload", () => {
    const event = paymentWebhookFailureEvent({
      reason:"invalid_signature",
      provider:"mock",
      providerEventId:"evt_raw_001",
      rawPayload:{ email:"payer@example.test", card:"4242424242424242", webhookSecret:"payment-secret-value" },
      now:new Date("2026-05-07T09:00:00.000Z"),
    });
    const serialized = JSON.stringify(event);

    assert.equal(event.type, "payment_webhook_signature_failed");
    assert.equal(serialized.includes("payer@example.test"), false);
    assert.equal(serialized.includes("4242424242424242"), false);
    assert.equal(serialized.includes("payment-secret-value"), false);
    assert.equal(serialized.includes("evt_raw_001"), false);
  });

  it("email delivery failure event does not include raw email", () => {
    const event = emailDeliveryFailureEvent({ reason:"provider_timeout", email:"reader@example.test", topicCode:"daily_horoscope", now:new Date("2026-05-07T09:00:00.000Z") });
    const serialized = JSON.stringify(event);

    assert.equal(event.type, "email_delivery_failed");
    assert.equal(serialized.includes("reader@example.test"), false);
  });

  it("LINE delivery failure event does not include raw LINE user ID", () => {
    const event = lineDeliveryFailureEvent({ reason:"line_provider_failed", lineUserId:"Uabcdef1234567890", topicCode:"weekly_horoscope", now:new Date("2026-05-07T09:00:00.000Z") });
    const serialized = JSON.stringify(event);

    assert.equal(event.type, "line_delivery_failed");
    assert.equal(serialized.includes("Uabcdef1234567890"), false);
  });

  it("astro-calc error event does not include raw birth date or time", () => {
    const event = astroCalcFailureEvent({ reason:"calculation_failed", errorCode:"INVALID_DATETIME", birthDate:"1971-03-11", birthTime:"08:17", birthPlace:"Bangkok", rawError:"Invalid 1971-03-11T08:17 in Bangkok" });
    const serialized = JSON.stringify(event);

    assert.equal(event.type, "astro_calc_health_failed");
    for (const unsafe of ["1971-03-11", "08:17", "\"Bangkok\""]) assert.equal(serialized.includes(unsafe), false);
  });

  it("mock alert provider records sanitized alerts only", async () => {
    const provider = new MockAlertProvider({ suppressWindowMs:60_000, now:()=>new Date("2026-05-07T09:00:00.000Z") });
    const event = emailDeliveryFailureEvent({ reason:"provider_failed", email:"reader@example.test", topicCode:"daily_horoscope" });

    await provider.notify(event);

    assert.equal(provider.alerts.length, 1);
    assert.equal(provider.networkSendCount, 0);
    assert.equal(JSON.stringify(provider.alerts[0]).includes("reader@example.test"), false);
  });

  it("mock alert provider suppresses duplicate alerts", async () => {
    const provider = new MockAlertProvider({ suppressWindowMs:60_000, now:()=>new Date("2026-05-07T09:00:00.000Z") });
    const event = createMonitoringEvent({ type:"notification_scheduler_failed", severity:"error", source:"notification_scheduler", dedupeKey:"scheduler:daily", metadata:{ reason:"provider_exception" } });

    await provider.notify(event);
    await provider.notify(event);

    assert.equal(provider.alerts.length, 1);
    assert.equal(provider.networkSendCount, 0);
  });

  it("alert provider does not send real network requests in tests", async () => {
    const provider = new MockAlertProvider();
    const event = createMonitoringEvent({ type:"admin_auth_denied", severity:"warning", source:"admin_auth", metadata:{ email:"admin@example.test", reason:"invalid_token" } });

    await provider.notify(event);

    assert.equal(provider.networkSendCount, 0);
  });

  it("structured logger stores sanitized event objects", async () => {
    const logger = new InMemoryStructuredLogger();
    const alertProvider = new MockAlertProvider();
    const event = paymentWebhookFailureEvent({ reason:"processing_failed", provider:"mock", rawPayload:{ email:"payer@example.test" } });

    await emitMonitoringEvent({ event, logger, alertProvider });

    assert.equal(logger.entries.length, 1);
    assert.equal(logger.entries[0]?.level, "error");
    assert.equal(alertProvider.alerts.length, 1);
    assert.equal(JSON.stringify(logger.entries).includes("payer@example.test"), false);
  });

  it("health status output does not include secrets", () => {
    const report = validateDeploymentEnvironment({
      APP_ENV:"staging",
      ADMIN_SESSION_SECRET:"admin-secret-value",
      EMAIL_PROVIDER_MODE:"http",
      EMAIL_FROM_ADDRESS:"noreply@example.test",
      EMAIL_PROVIDER_ENDPOINT:"https://email.example.test/send",
      EMAIL_PROVIDER_API_KEY:"email-api-secret",
      EMAIL_WEBHOOK_SECRET:"email-webhook-secret",
      EMAIL_AUDIT_HASH_SECRET:"email-audit-secret",
      LINE_PROVIDER_MODE:"sandbox",
      LINE_AUDIT_HASH_SECRET:"line-audit-secret",
      PAYMENT_PROVIDER_MODE:"mock",
      NOTIFICATION_SCHEDULER_MODE:"dry_run",
      ASTRO_ENGINE:"mock",
    });
    const status = operationalStatusFromEnvironmentReport(report);
    const serialized = JSON.stringify(status);

    assert.equal(serialized.includes("admin-secret-value"), false);
    assert.equal(serialized.includes("email-api-secret"), false);
    assert.equal(serialized.includes("line-audit-secret"), false);
    assert.equal(status.components.some((component)=>component.component === "email_gateway"), true);
  });

  it("environment validation failures create sanitized monitorable events", () => {
    const report = validateDeploymentEnvironment({ APP_ENV:"production", PAYMENT_PROVIDER_MODE:"mock", ASTRO_ENGINE:"mock" });
    const events = environmentValidationFailureEvents(report, new Date("2026-05-07T09:00:00.000Z"));
    const serialized = JSON.stringify(events);

    assert.equal(events.some((event)=>event.type === "environment_validation_failed"), true);
    assert.equal(events.some((event)=>event.severity === "critical"), true);
    assert.equal(serialized.includes("secret"), false);
  });
});
