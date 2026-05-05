import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { EmailGateway, SandboxEmailProvider, createEmailChannelAccount, type EmailAuditLogEntry } from "../src/mvp/email-gateway";
import { canAccessPeriod, getMockSubscriptionState, processMockSubscriptionWebhook, resetMockSubscriptionState, subscriptionGrantsEntitlement, type MockSubscriptionWebhookEvent, type PeriodType, type PlanCode, type SubscriptionRecord } from "../src/mvp/subscription-lifecycle";

const periodStart = "2026-05-01T00:00:00.000Z";
const periodEnd = "2026-06-01T00:00:00.000Z";
const renewedPeriodEnd = "2026-07-01T00:00:00.000Z";
const insidePeriod = new Date("2026-05-15T00:00:00.000Z");
const afterPeriod = new Date("2026-06-02T00:00:00.000Z");

const event = (input: Partial<MockSubscriptionWebhookEvent> & Pick<MockSubscriptionWebhookEvent, "id"|"type"|"subscriptionId"|"userId">): MockSubscriptionWebhookEvent => ({
  planCode: "premium",
  currentPeriodStart: periodStart,
  currentPeriodEnd: periodEnd,
  occurredAt: "2026-05-01T00:00:01.000Z",
  ...input,
});

const createSubscription = async (overrides: Partial<MockSubscriptionWebhookEvent> = {}) => {
  const result = await processMockSubscriptionWebhook(event({ id: "evt_created", type: "subscription.created", subscriptionId: "sub_1", userId: "user_a", ...overrides }));
  assert.equal(result.status, "applied");
  assert.ok(result.subscription);
  return result.subscription;
};

describe("subscription lifecycle", () => {
  beforeEach(() => resetMockSubscriptionState());

  it("active subscription grants entitlement during current period", async () => {
    const subscription = await createSubscription({ status: "active", planCode: "premium" });

    assert.equal(subscriptionGrantsEntitlement(subscription, insidePeriod), true);
    assert.equal(canAccessPeriod({ subscription, periodType: "yearly", now: insidePeriod }), true);
    assert.equal(canAccessPeriod({ subscription, periodType: "yearly", now: afterPeriod }), false);
  });

  it("trialing subscription grants entitlement until period end", async () => {
    const subscription = await createSubscription({ id: "evt_trial", status: "trialing", planCode: "basic" });

    assert.equal(canAccessPeriod({ subscription, periodType: "weekly", now: insidePeriod }), true);
    assert.equal(canAccessPeriod({ subscription, periodType: "monthly", now: insidePeriod }), false);
    assert.equal(canAccessPeriod({ subscription, periodType: "weekly", now: afterPeriod }), false);
  });

  it("expired subscription denies entitlement", async () => {
    const subscription = await createSubscription();
    const expired = await processMockSubscriptionWebhook(event({ id: "evt_expired", type: "subscription.expired", subscriptionId: subscription.id, userId: subscription.userId, occurredAt: "2026-06-01T00:00:01.000Z" }));

    assert.equal(expired.status, "applied");
    assert.equal(expired.subscription?.status, "expired");
    assert.equal(canAccessPeriod({ subscription: expired.subscription, periodType: "daily", now: insidePeriod }), false);
    assert.ok(expired.subscription?.expiredAt);
  });

  it("canceled at period end preserves entitlement until end date", async () => {
    const subscription = await createSubscription();
    const canceled = await processMockSubscriptionWebhook(event({ id: "evt_cancel_end", type: "subscription.canceled", subscriptionId: subscription.id, userId: subscription.userId, cancelAtPeriodEnd: true, occurredAt: "2026-05-10T00:00:00.000Z" }));

    assert.equal(canceled.subscription?.status, "canceled");
    assert.equal(canceled.subscription?.cancelAtPeriodEnd, true);
    assert.equal(canAccessPeriod({ subscription: canceled.subscription, periodType: "monthly", now: insidePeriod }), true);
    assert.equal(canAccessPeriod({ subscription: canceled.subscription, periodType: "monthly", now: afterPeriod }), false);
  });

  it("immediate cancellation revokes entitlement", async () => {
    const subscription = await createSubscription();
    const canceled = await processMockSubscriptionWebhook(event({ id: "evt_cancel_now", type: "subscription.canceled", subscriptionId: subscription.id, userId: subscription.userId, cancelAtPeriodEnd: false, occurredAt: "2026-05-10T00:00:00.000Z" }));

    assert.equal(canceled.subscription?.status, "canceled");
    assert.equal(canceled.subscription?.cancelAtPeriodEnd, false);
    assert.equal(canAccessPeriod({ subscription: canceled.subscription, periodType: "daily", now: insidePeriod }), false);
  });

  it("renewal extends currentPeriodEnd", async () => {
    const subscription = await createSubscription({ planCode: "basic" });
    const renewed = await processMockSubscriptionWebhook(event({ id: "evt_renewed", type: "subscription.renewed", subscriptionId: subscription.id, userId: subscription.userId, currentPeriodStart: periodEnd, currentPeriodEnd: renewedPeriodEnd, occurredAt: "2026-06-01T00:00:01.000Z" }));

    assert.equal(renewed.status, "applied");
    assert.equal(renewed.subscription?.status, "active");
    assert.equal(renewed.subscription?.currentPeriodEnd, renewedPeriodEnd);
    assert.equal(canAccessPeriod({ subscription: renewed.subscription, periodType: "weekly", now: new Date("2026-06-15T00:00:00.000Z") }), true);
  });

  it("failed renewal moves to past_due and denies entitlement without grace period", async () => {
    const subscription = await createSubscription();
    const pastDue = await processMockSubscriptionWebhook(event({ id: "evt_failed", type: "subscription.renewal_failed", subscriptionId: subscription.id, userId: subscription.userId, occurredAt: "2026-05-20T00:00:00.000Z" }));

    assert.equal(pastDue.subscription?.status, "past_due");
    assert.equal(canAccessPeriod({ subscription: pastDue.subscription, periodType: "daily", now: insidePeriod }), false);
  });

  it("duplicate webhook event is idempotent", async () => {
    const first = await processMockSubscriptionWebhook(event({ id: "evt_once", type: "subscription.created", subscriptionId: "sub_idem", userId: "user_a" }));
    const duplicate = await processMockSubscriptionWebhook(event({ id: "evt_once", type: "subscription.renewed", subscriptionId: "sub_idem", userId: "user_a", currentPeriodEnd: renewedPeriodEnd }));
    const state = getMockSubscriptionState();

    assert.equal(first.status, "applied");
    assert.equal(duplicate.status, "duplicate");
    assert.equal(state.subscriptions.length, 1);
    assert.equal(state.subscriptions[0]?.currentPeriodEnd, periodEnd);
    assert.equal(state.auditLogs.filter((log) => log.action === "subscription_status_changed").length, 1);
  });

  it("stale or invalid webhook transition is ignored safely", async () => {
    const subscription = await createSubscription();
    const staleRenewal = await processMockSubscriptionWebhook(event({ id: "evt_stale", type: "subscription.renewed", subscriptionId: subscription.id, userId: subscription.userId, currentPeriodStart: periodStart, currentPeriodEnd: "2026-05-15T00:00:00.000Z" }));
    const missingExisting = await processMockSubscriptionWebhook(event({ id: "evt_missing", type: "subscription.renewed", subscriptionId: "sub_missing", userId: "user_a", currentPeriodEnd: renewedPeriodEnd }));

    assert.equal(staleRenewal.status, "rejected_terminal");
    assert.equal(staleRenewal.reason, "stale_period");
    assert.equal(missingExisting.status, "ignored_retryable");
    assert.equal(getMockSubscriptionState().subscriptions.find((item) => item.id === subscription.id)?.currentPeriodEnd, periodEnd);
  });

  it("webhook processing does not trust client-side subscription state", async () => {
    await createSubscription({ planCode: "basic" });
    const forgedClientSubscription = { id: "sub_1", userId: "user_a", planCode: "premium", status: "active", currentPeriodStart: periodStart, currentPeriodEnd: "2027-01-01T00:00:00.000Z", cancelAtPeriodEnd: false, updatedAt: periodStart } satisfies SubscriptionRecord;
    const renewed = await processMockSubscriptionWebhook(event({ id: "evt_server_renewal", type: "subscription.renewed", subscriptionId: "sub_1", userId: "user_a", currentPeriodStart: periodEnd, currentPeriodEnd: renewedPeriodEnd }));

    assert.equal(forgedClientSubscription.planCode, "premium");
    assert.equal(renewed.subscription?.planCode, "basic");
    assert.equal(renewed.subscription?.currentPeriodEnd, renewedPeriodEnd);
  });

  it("webhook processing rejects mismatched users and unsafe revival by renewal", async () => {
    const subscription = await createSubscription();
    const mismatchedUser = await processMockSubscriptionWebhook(event({ id: "evt_wrong_user", type: "subscription.renewed", subscriptionId: subscription.id, userId: "attacker_user", currentPeriodStart: periodEnd, currentPeriodEnd: renewedPeriodEnd }));
    assert.equal(mismatchedUser.status, "rejected_terminal");
    assert.equal(getMockSubscriptionState().subscriptions[0]?.currentPeriodEnd, periodEnd);

    await processMockSubscriptionWebhook(event({ id: "evt_cancel_for_renewal", type: "subscription.canceled", subscriptionId: subscription.id, userId: subscription.userId, cancelAtPeriodEnd: false }));
    const unsafeRenewal = await processMockSubscriptionWebhook(event({ id: "evt_unsafe_renewal", type: "subscription.renewed", subscriptionId: subscription.id, userId: subscription.userId, currentPeriodStart: periodEnd, currentPeriodEnd: renewedPeriodEnd }));
    assert.equal(unsafeRenewal.status, "rejected_terminal");
    assert.equal(getMockSubscriptionState().subscriptions[0]?.status, "canceled");
  });

  it("audit logs are created for subscription state changes without PII", async () => {
    await createSubscription({ userId: "user_with_email@example.test" });
    const state = getMockSubscriptionState();

    assert.equal(state.auditLogs.filter((log) => log.action === "subscription_status_changed").length, 1);
    assert.equal(JSON.stringify(state.auditLogs).includes("user_with_email@example.test"), false);
    assert.equal(state.auditLogs[0]?.metadata.status, "active");
  });

  it("notification hook is mocked through EmailGateway without real email send", async () => {
    const provider = new SandboxEmailProvider();
    const emailAuditLogs: EmailAuditLogEntry[] = [];
    const emailGateway = new EmailGateway({ provider, fromEmail: "noreply@example.test", sandboxMode: true, auditHashSecret: "test-email-audit-secret", auditLogs: emailAuditLogs });
    const emailAccount = { ...createEmailChannelAccount({ userId: "user_a", email: "user@example.test", now: new Date(periodStart) }), verified: true };

    const result = await processMockSubscriptionWebhook(event({ id: "evt_notify", type: "subscription.created", subscriptionId: "sub_notify", userId: "user_a" }), { emailGateway, emailAccount });

    assert.equal(result.notification?.status, "sent");
    assert.equal(provider.networkSendCount, 0);
    assert.equal(provider.sent.length, 0);
    assert.equal(getMockSubscriptionState().notificationResults.length, 1);
    assert.equal(JSON.stringify(emailAuditLogs).includes("user@example.test"), false);
  });

  it("plan entitlements are respected for free basic and premium", async () => {
    const cases: Array<{ planCode:PlanCode; allowed:PeriodType[]; denied:PeriodType[] }> = [
      { planCode:"free", allowed:["daily"], denied:["weekly","monthly","yearly"] },
      { planCode:"basic", allowed:["daily","weekly"], denied:["monthly","yearly"] },
      { planCode:"premium", allowed:["daily","weekly","monthly","yearly"], denied:[] },
    ];

    for (const entry of cases) {
      const subscription = await createSubscription({ id: `evt_${entry.planCode}`, subscriptionId: `sub_${entry.planCode}`, planCode: entry.planCode });
      for (const periodType of entry.allowed) assert.equal(canAccessPeriod({ subscription, periodType, now: insidePeriod }), true, `${entry.planCode} should allow ${periodType}`);
      for (const periodType of entry.denied) assert.equal(canAccessPeriod({ subscription, periodType, now: insidePeriod }), false, `${entry.planCode} should deny ${periodType}`);
    }
  });

  it("free plan without a subscription only grants daily entitlement", () => {
    assert.equal(canAccessPeriod({ planCode: "free", periodType: "daily", now: insidePeriod }), true);
    assert.equal(canAccessPeriod({ planCode: "free", periodType: "weekly", now: insidePeriod }), false);
  });

  it("reactivation restores active entitlement after cancellation", async () => {
    const subscription = await createSubscription();
    await processMockSubscriptionWebhook(event({ id: "evt_cancel_reactivate", type: "subscription.canceled", subscriptionId: subscription.id, userId: subscription.userId, cancelAtPeriodEnd: false }));
    const reactivated = await processMockSubscriptionWebhook(event({ id: "evt_reactivated", type: "subscription.reactivated", subscriptionId: subscription.id, userId: subscription.userId, currentPeriodStart: "2026-05-20T00:00:00.000Z", currentPeriodEnd: renewedPeriodEnd }));

    assert.equal(reactivated.subscription?.status, "active");
    assert.equal(reactivated.subscription?.planCode, subscription.planCode);
    assert.equal(canAccessPeriod({ subscription: reactivated.subscription, periodType: "monthly", now: new Date("2026-06-01T00:00:00.000Z") }), true);
  });

  it("reactivation is rejected for active trialing and past_due subscriptions", async () => {
    const active = await createSubscription({ subscriptionId: "sub_active", planCode: "basic", status: "active" });
    const activeReactivate = await processMockSubscriptionWebhook(event({ id: "evt_reactivate_active", type: "subscription.reactivated", subscriptionId: active.id, userId: active.userId, planCode: "premium", currentPeriodStart: "2026-05-20T00:00:00.000Z", currentPeriodEnd: renewedPeriodEnd }));
    assert.equal(activeReactivate.status, "rejected_terminal");
    assert.equal(activeReactivate.subscription?.planCode, "basic");

    const trial = await createSubscription({ id: "evt_trial_reactivate", subscriptionId: "sub_trial", status: "trialing", planCode: "basic" });
    const trialReactivate = await processMockSubscriptionWebhook(event({ id: "evt_reactivate_trial", type: "subscription.reactivated", subscriptionId: trial.id, userId: trial.userId, planCode: "premium", currentPeriodStart: "2026-05-20T00:00:00.000Z", currentPeriodEnd: renewedPeriodEnd }));
    assert.equal(trialReactivate.status, "rejected_terminal");
    assert.equal(trialReactivate.subscription?.planCode, "basic");

    const pastDue = await processMockSubscriptionWebhook(event({ id: "evt_make_past_due", type: "subscription.renewal_failed", subscriptionId: active.id, userId: active.userId }));
    assert.equal(pastDue.subscription?.status, "past_due");
    const pastDueReactivate = await processMockSubscriptionWebhook(event({ id: "evt_reactivate_past_due", type: "subscription.reactivated", subscriptionId: active.id, userId: active.userId, planCode: "premium", currentPeriodStart: "2026-05-20T00:00:00.000Z", currentPeriodEnd: renewedPeriodEnd }));
    assert.equal(pastDueReactivate.status, "rejected_terminal");
    assert.equal(pastDueReactivate.subscription?.planCode, "basic");
    assert.equal(canAccessPeriod({ subscription: pastDueReactivate.subscription, periodType: "monthly", now: insidePeriod }), false);
  });

  it("out-of-order renewal remains retryable and can apply after created", async () => {
    const renewalEvent = event({ id: "evt_ooo_renewal", type: "subscription.renewed", subscriptionId: "sub_ooo", userId: "user_ooo", currentPeriodStart: periodEnd, currentPeriodEnd: renewedPeriodEnd });
    const beforeCreate = await processMockSubscriptionWebhook(renewalEvent);
    assert.equal(beforeCreate.status, "ignored_retryable");
    assert.equal(getMockSubscriptionState().processedWebhookEventIds.includes("evt_ooo_renewal"), false);

    const created = await processMockSubscriptionWebhook(event({ id: "evt_ooo_created", type: "subscription.created", subscriptionId: "sub_ooo", userId: "user_ooo", planCode: "basic" }));
    assert.equal(created.status, "applied");
    const replayRenewal = await processMockSubscriptionWebhook(renewalEvent);
    assert.equal(replayRenewal.status, "applied");
    const duplicateReplay = await processMockSubscriptionWebhook(renewalEvent);
    assert.equal(duplicateReplay.status, "duplicate");
  });

  it("renewal_failed does not revive canceled or expired subscriptions", async () => {
    const canceled = await createSubscription({ subscriptionId: "sub_cancel_guard", planCode: "basic" });
    await processMockSubscriptionWebhook(event({ id: "evt_cancel_guard", type: "subscription.canceled", subscriptionId: canceled.id, userId: canceled.userId, cancelAtPeriodEnd: false }));
    const canceledFailed = await processMockSubscriptionWebhook(event({ id: "evt_fail_canceled", type: "subscription.renewal_failed", subscriptionId: canceled.id, userId: canceled.userId }));
    assert.equal(canceledFailed.status, "rejected_terminal");
    assert.equal(canceledFailed.subscription?.status, "canceled");

    const expired = await createSubscription({ id: "evt_expire_source", subscriptionId: "sub_expired_guard", planCode: "basic" });
    await processMockSubscriptionWebhook(event({ id: "evt_expire_guard", type: "subscription.expired", subscriptionId: expired.id, userId: expired.userId }));
    const expiredFailed = await processMockSubscriptionWebhook(event({ id: "evt_fail_expired", type: "subscription.renewal_failed", subscriptionId: expired.id, userId: expired.userId }));
    assert.equal(expiredFailed.status, "rejected_terminal");
    assert.equal(expiredFailed.subscription?.status, "expired");
  });

  it("ignores stale renewal_failed from previous period and keeps entitlement", async () => {
    const created = await createSubscription({ subscriptionId: "sub_stale_fail", planCode: "premium" });
    const renewed = await processMockSubscriptionWebhook(event({ id: "evt_stale_fail_renew", type: "subscription.renewed", subscriptionId: created.id, userId: created.userId, currentPeriodStart: periodEnd, currentPeriodEnd: renewedPeriodEnd, occurredAt: "2026-06-01T00:00:01.000Z" }));
    assert.equal(renewed.status, "applied");

    const staleFailed = await processMockSubscriptionWebhook(event({ id: "evt_stale_fail", type: "subscription.renewal_failed", subscriptionId: created.id, userId: created.userId, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, occurredAt: "2026-05-20T00:00:00.000Z" }));
    assert.equal(staleFailed.status, "ignored_retryable");
    assert.equal(staleFailed.reason, "ignored_stale");
    assert.equal(staleFailed.subscription?.status, "active");
    assert.equal(canAccessPeriod({ subscription: staleFailed.subscription, periodType: "monthly", now: new Date("2026-06-10T00:00:00.000Z") }), true);
  });

  it("ignores stale canceled and expired events after reactivation/renewal", async () => {
    const created = await createSubscription({ subscriptionId: "sub_stale_terminal", planCode: "basic" });
    await processMockSubscriptionWebhook(event({ id: "evt_term_cancel", type: "subscription.canceled", subscriptionId: created.id, userId: created.userId, occurredAt: "2026-05-10T00:00:00.000Z" }));
    const reactivated = await processMockSubscriptionWebhook(event({ id: "evt_term_reactivate", type: "subscription.reactivated", subscriptionId: created.id, userId: created.userId, currentPeriodStart: periodEnd, currentPeriodEnd: renewedPeriodEnd, occurredAt: "2026-06-01T00:00:00.000Z" }));
    assert.equal(reactivated.status, "applied");
    assert.equal(reactivated.subscription?.status, "active");

    const staleCanceled = await processMockSubscriptionWebhook(event({ id: "evt_term_stale_cancel", type: "subscription.canceled", subscriptionId: created.id, userId: created.userId, occurredAt: "2026-05-15T00:00:00.000Z" }));
    assert.equal(staleCanceled.status, "ignored_retryable");
    assert.equal(staleCanceled.reason, "ignored_stale");
    assert.equal(staleCanceled.subscription?.status, "active");

    const staleExpired = await processMockSubscriptionWebhook(event({ id: "evt_term_stale_expired", type: "subscription.expired", subscriptionId: created.id, userId: created.userId, occurredAt: "2026-05-16T00:00:00.000Z" }));
    assert.equal(staleExpired.status, "ignored_retryable");
    assert.equal(staleExpired.reason, "ignored_stale");
    assert.equal(staleExpired.subscription?.status, "active");
    assert.equal(canAccessPeriod({ subscription: staleExpired.subscription, periodType: "weekly", now: new Date("2026-06-10T00:00:00.000Z") }), true);
  });
});
