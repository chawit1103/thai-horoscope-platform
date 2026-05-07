import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authorizeAdminRoute, createAdminSessionCookie } from "../src/mvp/admin-auth";
import { buildOperatorConsoleStatus, findOperatorCard } from "../src/mvp/operator-status";

const localMockEnv = {
  APP_ENV:"local",
  EMAIL_PROVIDER_MODE:"sandbox",
  LINE_PROVIDER_MODE:"sandbox",
  PAYMENT_PROVIDER_MODE:"mock",
  NOTIFICATION_SCHEDULER_MODE:"disabled",
  ASTRO_ENGINE:"mock",
  SWISSEPH_LICENSE_MODE:"none",
};

describe("operator status", () => {
  it("non-admin cannot access operator console routes", () => {
    const userCookie = createAdminSessionCookie({ actorId:"reader", role:"user", sessionSecret:"session-secret" });
    const missing = authorizeAdminRoute({ path:"/admin/operator", sessionSecret:"session-secret" });
    const nonAdmin = authorizeAdminRoute({ path:"/admin/operator", sessionCookie:userCookie, sessionSecret:"session-secret" });

    assert.equal(missing.ok, false);
    assert.equal(nonAdmin.ok, false);
  });

  it("admin can access operator console routes", () => {
    const adminCookie = createAdminSessionCookie({ actorId:"admin_actor", role:"admin", sessionSecret:"session-secret" });
    const access = authorizeAdminRoute({ path:"/admin/operator", sessionCookie:adminCookie, sessionSecret:"session-secret" });

    assert.equal(access.ok, true);
  });

  it("local mock mode renders safely without production secrets", () => {
    const status = buildOperatorConsoleStatus({ env:localMockEnv, now:new Date("2026-05-07T12:00:00.000Z") });

    assert.equal(status.environment, "local");
    assert.equal(findOperatorCard(status, "email_gateway").mode, "sandbox");
    assert.equal(findOperatorCard(status, "line_gateway").mode, "sandbox");
    assert.equal(findOperatorCard(status, "payment_provider").mode, "mock");
    assert.equal(findOperatorCard(status, "astro_calc").mode, "mock");
    assert.equal(findOperatorCard(status, "privacy_controls").mode, "documented");
    assert.equal(findOperatorCard(status, "subscription_lifecycle").mode, "mock_foundation");
    assert.equal(findOperatorCard(status, "monitoring_alerting").mode, "mock_alert_provider");
  });

  it("operator status output redacts secrets and raw private data", () => {
    const status = buildOperatorConsoleStatus({
      env:{
        APP_ENV:"staging",
        ADMIN_SESSION_SECRET:"super-secret-admin-value",
        MOCK_ADMIN_TOKEN:"mock-token-value",
        EMAIL_PROVIDER_MODE:"http",
        EMAIL_FROM_ADDRESS:"reader@example.test",
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
        ASTRO_ENGINE:"mock",
        BIRTH_DATE:"1992-08-15",
        BIRTH_TIME:"07:30",
        BIRTH_PLACE:"Bangkok",
        LINE_USER_ID:"Uabcdef1234567890",
        PAYMENT_RAW_PAYLOAD:"{\"card\":\"4242424242424242\"}",
      },
    });
    const serialized = JSON.stringify(status);

    for (const unsafe of ["super-secret-admin-value", "mock-token-value", "reader@example.test", "email-api-secret-value", "line-channel-secret-value", "line-access-token-value", "payment-api-secret-value", "payment-webhook-secret-value", "1992-08-15", "07:30", "Bangkok", "Uabcdef1234567890", "4242424242424242"]) {
      assert.equal(serialized.includes(unsafe), false, `operator status leaked ${unsafe}`);
    }
  });

  it("production blockers are visible when required config is missing", () => {
    const status = buildOperatorConsoleStatus({ env:{ ...localMockEnv, APP_ENV:"production" } });
    const blockers = findOperatorCard(status, "known_blockers");
    const release = findOperatorCard(status, "release_readiness");

    assert.equal(status.overallStatus, "error");
    assert.equal(blockers.status, "error");
    assert.equal(release.status, "error");
    assert.equal(blockers.blockers.some((blocker)=>blocker.includes("PAYMENT_MOCK_MODE_PRODUCTION_FORBIDDEN")), true);
    assert.equal(blockers.blockers.some((blocker)=>blocker.includes("ASTRO_MOCK_ENGINE_PRODUCTION_FORBIDDEN")), true);
  });

  it("does not call real providers while building operator status", () => {
    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = (() => {
      fetchCount += 1;
      throw new Error("network calls are not allowed in operator status tests");
    }) as typeof fetch;
    try {
      buildOperatorConsoleStatus({
        env:{
          ...localMockEnv,
          APP_ENV:"staging",
          ADMIN_SESSION_SECRET:"admin-secret",
          EMAIL_PROVIDER_MODE:"http",
          EMAIL_FROM_ADDRESS:"ops@example.test",
          EMAIL_PROVIDER_ENDPOINT:"https://email-provider.example.test/send",
          EMAIL_PROVIDER_API_KEY:"email-api-secret",
          EMAIL_WEBHOOK_SECRET:"email-webhook-secret",
          EMAIL_AUDIT_HASH_SECRET:"email-audit-secret",
          LINE_PROVIDER_MODE:"http",
          LINE_CHANNEL_SECRET:"line-secret",
          LINE_CHANNEL_ACCESS_TOKEN:"line-access-token",
          LINE_AUDIT_HASH_SECRET:"line-audit-secret",
          PAYMENT_PROVIDER_MODE:"http",
          PAYMENT_PROVIDER_CHECKOUT_ENDPOINT:"https://payments.example.test/checkout",
          PAYMENT_PROVIDER_API_KEY:"payment-api-secret",
          PAYMENT_WEBHOOK_SECRET:"payment-webhook-secret",
          NOTIFICATION_SCHEDULER_MODE:"dry_run",
        },
      });
      assert.equal(fetchCount, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
