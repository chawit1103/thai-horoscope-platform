import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { EmailGateway, HttpEmailProvider, SandboxEmailProvider, applyEmailWebhookEvent, createEmailChannelAccount, createEmailVerificationToken, markEmailUnsubscribed, normalizeEmailProviderWebhook, renderTransactionalEmailTemplate, sanitizeEmailLogMetadata, verifyEmailToken, type EmailAuditLogEntry, type EmailProvider } from "../src/mvp/email-gateway";

const makeGateway = (provider: EmailProvider = new SandboxEmailProvider(), auditLogs: EmailAuditLogEntry[] = []) =>
  new EmailGateway({ provider, fromEmail: "noreply@example.test", sandboxMode: true, auditHashSecret: "test-audit-secret", auditLogs });

const testNow = new Date("2026-05-03T10:00:00.000Z");
const createTestEmailAccount = (input: { userId:string; email:string }) => createEmailChannelAccount({ ...input, now: testNow });

const signVerificationToken = (payload: Record<string, string>, secret: string) => {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
};

const signedWebhookHeaders = (body: string, secret: string, timestamp = Date.now()) => {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("base64url");
  return new Headers({ "x-email-timestamp": String(timestamp), "x-email-signature": signature });
};

describe("email gateway", () => {
  it("routes only to verified email accounts", async () => {
    const provider = new SandboxEmailProvider();
    const gateway = makeGateway(provider);
    const account = createTestEmailAccount({ userId: "user_a", email: "user@example.test" });
    const message = renderTransactionalEmailTemplate("account_security");

    const blocked = await gateway.send(account, message);
    assert.equal(blocked.status, "blocked");
    assert.equal(provider.sent.length, 0);

    const verification = await gateway.send(account, renderTransactionalEmailTemplate("email_verification", { actionUrl: "https://example.test/verify" }));
    assert.equal(verification.status, "sent");
    assert.equal(provider.sent.length, 0);

    account.verified = true;
    const sent = await gateway.send(account, message);
    assert.equal(sent.status, "sent");
    assert.equal(provider.sent.length, 0);
  });

  it("suppresses horoscope and marketing email after unsubscribe even if caller marks transactional", async () => {
    const provider = new SandboxEmailProvider();
    const gateway = makeGateway(provider);
    const account = { ...createTestEmailAccount({ userId: "user_a", email: "user@example.test" }), verified: true };
    markEmailUnsubscribed(account, new Date("2026-05-03T10:03:00.000Z"));

    for (const topicCode of ["daily_horoscope", "weekly_horoscope", "monthly_horoscope", "yearly_horoscope", "marketing", "engagement"] as const) {
      const result = await gateway.send(account, { topicCode, subject: "Hello", text: "Hello", html: "<p>Hello</p>", transactional: true });
      assert.equal(result.status, "unsubscribed");
    }
    assert.equal(provider.sent.length, 0);

    const transactional = await gateway.send(account, renderTransactionalEmailTemplate("account_deletion"));
    assert.equal(transactional.status, "sent");
    assert.equal(provider.sent.length, 0);
  });

  it("bases unsubscribe bypass on gateway topic policy instead of message.transactional", async () => {
    const auditLogs: EmailAuditLogEntry[] = [];
    const gateway = makeGateway(new SandboxEmailProvider(), auditLogs);
    const account = { ...createTestEmailAccount({ userId: "user_a", email: "user@example.test" }), verified: true };
    markEmailUnsubscribed(account, new Date("2026-05-03T10:03:00.000Z"));

    const allowed = await gateway.send(account, { topicCode: "system", subject: "Security", text: "Security", html: "<p>Security</p>", transactional: false });
    assert.equal(allowed.status, "sent");
    assert.equal(auditLogs.at(-1)?.metadata.transactional, "true");

    const suppressed = await gateway.send(account, { topicCode: "marketing", subject: "Offer", text: "Offer", html: "<p>Offer</p>", transactional: true });
    assert.equal(suppressed.status, "unsubscribed");
    assert.equal(auditLogs.at(-1)?.metadata.transactional, "false");
  });

  it("suppresses bounced and complained email accounts", async () => {
    const provider = new SandboxEmailProvider();
    const gateway = makeGateway(provider);
    const bounced = { ...createTestEmailAccount({ userId: "user_a", email: "bounce@example.test" }), verified: true };
    const complained = { ...createTestEmailAccount({ userId: "user_b", email: "complaint@example.test" }), verified: true };
    applyEmailWebhookEvent(bounced, { type: "bounce", email: bounced.email }, new Date("2026-05-03T10:04:00.000Z"));
    applyEmailWebhookEvent(complained, { type: "complaint", email: complained.email }, new Date("2026-05-03T10:04:00.000Z"));

    assert.equal((await gateway.send(bounced, renderTransactionalEmailTemplate("data_export"))).status, "bounced");
    assert.equal((await gateway.send(complained, renderTransactionalEmailTemplate("data_export"))).status, "complained");
    assert.equal(provider.sent.length, 0);
  });

  it("applies webhook account updates only when event email matches", () => {
    const updatedAt = new Date("2026-05-03T10:04:00.000Z");
    const bounced = { ...createTestEmailAccount({ userId: "user_a", email: " User@Example.Test " }), verified: true };
    const complained = { ...createTestEmailAccount({ userId: "user_b", email: "complaint@example.test" }), verified: true };
    const unsubscribed = { ...createTestEmailAccount({ userId: "user_c", email: "unsubscribe@example.test" }), verified: true };

    assert.deepEqual(applyEmailWebhookEvent(bounced, { type: "bounce", email: " user@example.test " }, updatedAt), { status: "applied" });
    assert.equal(bounced.bounced, true);
    assert.equal(bounced.updatedAt, updatedAt.toISOString());

    assert.deepEqual(applyEmailWebhookEvent(complained, { type: "complaint", email: "COMPLAINT@example.test" }, updatedAt), { status: "applied" });
    assert.equal(complained.complained, true);

    assert.deepEqual(applyEmailWebhookEvent(unsubscribed, { type: "unsubscribe", email: "unsubscribe@example.test" }, updatedAt), { status: "applied" });
    assert.equal(unsubscribed.unsubscribed, true);
  });

  it("ignores webhook account updates for missing or mismatched emails", () => {
    const account = { ...createTestEmailAccount({ userId: "user_a", email: "user@example.test" }), verified: true };

    assert.deepEqual(applyEmailWebhookEvent(account, { type: "bounce" }, new Date("2026-05-03T10:04:00.000Z")), { status: "ignored", reason: "email_missing" });
    assert.equal(account.bounced, false);
    assert.equal(account.updatedAt, testNow.toISOString());

    assert.deepEqual(applyEmailWebhookEvent(account, { type: "complaint", email: "other@example.test" }, new Date("2026-05-03T10:05:00.000Z")), { status: "ignored", reason: "email_mismatch" });
    assert.equal(account.complained, false);
    assert.equal(account.updatedAt, testNow.toISOString());
  });

  it("verifies fresh email token and preserves account binding", () => {
    const account = createTestEmailAccount({ userId: "user_a", email: "USER@Example.Test" });
    const token = createEmailVerificationToken(account, "verification-secret", new Date("2026-05-03T10:00:00.000Z"));

    assert.equal(verifyEmailToken(account, `${token}.extra`, "verification-secret"), false);
    assert.equal(verifyEmailToken(account, token, "wrong-secret"), false);
    assert.equal(verifyEmailToken(account, token, "verification-secret", new Date("2026-05-03T10:05:00.000Z")), true);
    assert.equal(account.verified, true);
    assert.ok(account.verifiedAt);
  });

  it("rejects expired, malformed, and future-issued verification tokens", () => {
    const account = createTestEmailAccount({ userId: "user_a", email: "user@example.test" });
    const secret = "verification-secret";
    const freshToken = createEmailVerificationToken(account, secret, new Date("2026-05-03T10:00:00.000Z"));

    const expiredToken = signVerificationToken({ userId: account.userId, email: account.email, issuedAt: "2026-05-01T09:00:00.000Z" }, secret);
    account.verificationTokenHash = createHmac("sha256", secret).update(expiredToken).digest("base64url");
    assert.equal(verifyEmailToken(account, expiredToken, secret, new Date("2026-05-03T10:00:00.000Z")), false);

    const missingIssuedAtToken = signVerificationToken({ userId: account.userId, email: account.email }, secret);
    account.verificationTokenHash = createHmac("sha256", secret).update(missingIssuedAtToken).digest("base64url");
    assert.equal(verifyEmailToken(account, missingIssuedAtToken, secret, new Date("2026-05-03T10:00:00.000Z")), false);

    const malformedToken = signVerificationToken({ userId: account.userId, email: account.email, issuedAt: "not-a-date" }, secret);
    account.verificationTokenHash = createHmac("sha256", secret).update(malformedToken).digest("base64url");
    assert.equal(verifyEmailToken(account, malformedToken, secret, new Date("2026-05-03T10:00:00.000Z")), false);

    const futureToken = signVerificationToken({ userId: account.userId, email: account.email, issuedAt: "2026-05-03T10:10:01.000Z" }, secret);
    account.verificationTokenHash = createHmac("sha256", secret).update(futureToken).digest("base64url");
    assert.equal(verifyEmailToken(account, futureToken, secret, new Date("2026-05-03T10:00:00.000Z")), false);
    account.verificationTokenHash = createHmac("sha256", secret).update(freshToken).digest("base64url");
    assert.equal(verifyEmailToken(account, freshToken, secret, new Date("2026-05-03T10:05:00.000Z")), true);
  });

  it("never performs real network sends in sandbox tests", async () => {
    const provider = new SandboxEmailProvider();
    const gateway = makeGateway(provider);
    const account = { ...createTestEmailAccount({ userId: "user_a", email: "user@example.test" }), verified: true };

    const result = await gateway.send(account, renderTransactionalEmailTemplate("email_verification", { actionUrl: "https://example.test/verify" }));
    assert.equal(result.status, "sent");
    assert.equal(provider.networkSendCount, 0);
    assert.equal(provider.sent.length, 0);
  });

  it("does not call configured provider when sandboxMode=true", async () => {
    let sendCalls = 0;
    const provider: EmailProvider = {
      async send() {
        sendCalls += 1;
        return { providerMessageId: "real_provider_id" };
      },
    };
    const gateway = new EmailGateway({ provider, fromEmail: "noreply@example.test", sandboxMode: true, auditHashSecret: "test-audit-secret" });
    const account = { ...createTestEmailAccount({ userId: "user_a", email: "user@example.test" }), verified: true };
    const result = await gateway.send(account, renderTransactionalEmailTemplate("account_security"));
    assert.equal(sendCalls, 0);
    assert.equal(result.status, "sent");
    assert.ok(result.providerMessageId?.startsWith("sandbox_"));
  });

  it("never performs network/provider calls in sandbox mode even with HttpEmailProvider", async () => {
    let fetchCalls = 0;
    const provider = new HttpEmailProvider({ endpoint: "https://email-provider.test/send", apiKey: "test-key", fetcher: async () => {
      fetchCalls += 1;
      return new Response(null, { status: 200 });
    } });
    const gateway = new EmailGateway({ provider, fromEmail: "noreply@example.test", sandboxMode: true, auditHashSecret: "test-audit-secret" });
    const account = { ...createTestEmailAccount({ userId: "user_a", email: "user@example.test" }), verified: true };
    const result = await gateway.send(account, renderTransactionalEmailTemplate("email_verification", { actionUrl: "https://example.test/verify" }));
    assert.equal(result.status, "sent");
    assert.equal(fetchCalls, 0);
  });

  it("fails closed for default webhook verification", async () => {
    const body = JSON.stringify({ type: "bounce", email: "user@example.test" });
    const providerWithoutVerifier: EmailProvider = {
      async send() {
        throw new Error("send should not be called");
      },
    };
    const defaultGateway = new EmailGateway({ provider: providerWithoutVerifier, fromEmail: "noreply@example.test", sandboxMode: true, auditHashSecret: "test-audit-secret" });
    const sandboxProvider = new SandboxEmailProvider();
    const sandboxGateway = new EmailGateway({ provider: sandboxProvider, fromEmail: "noreply@example.test", sandboxMode: true, auditHashSecret: "test-audit-secret" });

    assert.equal(await defaultGateway.verifyWebhook(new Headers(), body), false);
    assert.equal(await sandboxProvider.verifyWebhook(new Headers(), body), false);
    assert.equal(await sandboxGateway.verifyWebhook(new Headers(), body), false);
  });

  it("verifies sandbox webhooks only when explicitly signed with a sandbox secret", async () => {
    const body = JSON.stringify({ type: "unsubscribe", email: "user@example.test" });
    const secret = "test-sandbox-webhook-secret";
    const provider = new SandboxEmailProvider({ webhookSecret: secret });

    assert.equal(await provider.verifyWebhook(signedWebhookHeaders(body, secret), body), true);
    assert.equal(await provider.verifyWebhook(signedWebhookHeaders(body, "wrong-secret"), body), false);
  });

  it("verifies signed HttpEmailProvider webhooks", async () => {
    const body = JSON.stringify({ type: "bounce", email: "user@example.test" });
    const secret = "test-webhook-secret";
    const provider = new HttpEmailProvider({ endpoint: "https://email-provider.test/send", apiKey: "test-key", webhookSecret: secret });

    assert.equal(await provider.verifyWebhook(signedWebhookHeaders(body, secret), body), true);
    assert.equal(await provider.verifyWebhook(signedWebhookHeaders(body, "wrong-secret"), body), false);
    assert.equal(await provider.verifyWebhook(new Headers({ "x-email-timestamp": String(Date.now()) }), body), false);
    assert.equal(await provider.verifyWebhook(new Headers({ "x-email-signature": "missing_timestamp" }), body), false);
    assert.equal(await provider.verifyWebhook(new Headers({ "x-email-timestamp": "not-a-number", "x-email-signature": "invalid" }), body), false);
  });

  it("uses EMAIL_WEBHOOK_SECRET for HttpEmailProvider verification when no explicit secret is configured", async () => {
    const body = JSON.stringify({ type: "bounce", email: "user@example.test" });
    const previousSecret = process.env.EMAIL_WEBHOOK_SECRET;
    process.env.EMAIL_WEBHOOK_SECRET = "test-env-webhook-secret";
    try {
      const provider = new HttpEmailProvider({ endpoint: "https://email-provider.test/send", apiKey: "test-key" });
      assert.equal(await provider.verifyWebhook(signedWebhookHeaders(body, "test-env-webhook-secret"), body), true);
      assert.equal(await provider.verifyWebhook(signedWebhookHeaders(body, "wrong-secret"), body), false);
    } finally {
      if (previousSecret === undefined) delete process.env.EMAIL_WEBHOOK_SECRET;
      else process.env.EMAIL_WEBHOOK_SECRET = previousSecret;
    }
  });

  it("fails closed for missing or stale HttpEmailProvider webhook verification", async () => {
    const body = JSON.stringify({ type: "unsubscribe", email: "user@example.test" });
    const provider = new HttpEmailProvider({ endpoint: "https://email-provider.test/send", apiKey: "test-key", webhookSecret: " " });
    const configured = new HttpEmailProvider({ endpoint: "https://email-provider.test/send", apiKey: "test-key", webhookSecret: "test-webhook-secret" });
    const staleTimestamp = Date.now() - 10 * 60 * 1000;
    const futureTimestamp = Date.now() + 10 * 60 * 1000;

    assert.equal(await provider.verifyWebhook(signedWebhookHeaders(body, "test-webhook-secret"), body), false);
    assert.equal(await configured.verifyWebhook(signedWebhookHeaders(body, "test-webhook-secret", staleTimestamp), body), false);
    assert.equal(await configured.verifyWebhook(signedWebhookHeaders(body, "test-webhook-secret", futureTimestamp), body), false);
  });

  it("delegates EmailGateway webhook verification to configured HttpEmailProvider", async () => {
    const body = JSON.stringify({ type: "complaint", email: "user@example.test" });
    const secret = "test-webhook-secret";
    const provider = new HttpEmailProvider({ endpoint: "https://email-provider.test/send", apiKey: "test-key", webhookSecret: secret });
    const gateway = new EmailGateway({ provider, fromEmail: "noreply@example.test", sandboxMode: false, auditHashSecret: "test-audit-secret" });

    assert.equal(await gateway.verifyWebhook(signedWebhookHeaders(body, secret), body), true);
    assert.equal(await gateway.verifyWebhook(signedWebhookHeaders(body, "wrong-secret"), body), false);
  });



  it("returns failed result and audits when provider send throws", async () => {
    const auditLogs: EmailAuditLogEntry[] = [];
    const provider: EmailProvider = {
      async send() {
        throw new Error("provider down");
      },
    };
    const gateway = new EmailGateway({ provider, fromEmail: "noreply@example.test", sandboxMode: false, auditHashSecret: "test-audit-secret", auditLogs });
    const account = { ...createTestEmailAccount({ userId: "user_a", email: "user@example.test" }), verified: true };

    const result = await gateway.send(account, renderTransactionalEmailTemplate("account_security"));

    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, "email_provider_failed");
    assert.equal(auditLogs.at(-1)?.action, "email_delivery_failed");
  });

  it("uses runtime timestamps for audit log entries", async () => {
    const provider = new SandboxEmailProvider();
    const auditLogs: EmailAuditLogEntry[] = [];
    const gateway = makeGateway(provider, auditLogs);
    const account = { ...createTestEmailAccount({ userId: "user_a", email: "user@example.test" }), verified: true };
    const before = Date.now();

    await gateway.send(account, renderTransactionalEmailTemplate("account_security"));

    const createdAtMs = Date.parse(auditLogs[0]?.createdAt ?? "");
    const after = Date.now();
    assert.ok(Number.isFinite(createdAtMs));
    assert.ok(createdAtMs >= before && createdAtMs <= after);
  });

  it("uses provided timestamps for email account state updates", () => {
    const createdAt = new Date("2026-05-03T10:00:00.000Z");
    const unsubscribedAt = new Date("2026-05-03T10:03:00.000Z");
    const webhookAt = new Date("2026-05-03T10:04:00.000Z");
    const account = createEmailChannelAccount({ userId: "user_a", email: "user@example.test", now: createdAt });

    assert.equal(account.updatedAt, createdAt.toISOString());

    markEmailUnsubscribed(account, unsubscribedAt);
    assert.equal(account.unsubscribed, true);
    assert.equal(account.updatedAt, unsubscribedAt.toISOString());

    applyEmailWebhookEvent(account, { type: "bounce", email: account.email }, webhookAt);
    assert.equal(account.bounced, true);
    assert.equal(account.updatedAt, webhookAt.toISOString());
  });

  it("uses runtime defaults for email account state timestamps", () => {
    const hardcodedCreateTimestamp = "2026-05-03T10:00:00.000Z";
    const hardcodedUnsubscribeTimestamp = "2026-05-03T10:03:00.000Z";
    const hardcodedWebhookTimestamp = "2026-05-03T10:04:00.000Z";

    const beforeCreate = Date.now();
    const account = createEmailChannelAccount({ userId: "user_a", email: "user@example.test" });
    const afterCreate = Date.now();
    const createdAtMs = Date.parse(account.updatedAt);
    assert.ok(createdAtMs >= beforeCreate && createdAtMs <= afterCreate);
    assert.notEqual(account.updatedAt, hardcodedCreateTimestamp);

    const beforeUnsubscribe = Date.now();
    markEmailUnsubscribed(account);
    const afterUnsubscribe = Date.now();
    const unsubscribedAtMs = Date.parse(account.updatedAt);
    assert.ok(unsubscribedAtMs >= beforeUnsubscribe && unsubscribedAtMs <= afterUnsubscribe);
    assert.notEqual(account.updatedAt, hardcodedUnsubscribeTimestamp);

    const beforeWebhook = Date.now();
    applyEmailWebhookEvent(account, { type: "complaint", email: account.email });
    const afterWebhook = Date.now();
    const webhookAtMs = Date.parse(account.updatedAt);
    assert.ok(webhookAtMs >= beforeWebhook && webhookAtMs <= afterWebhook);
    assert.notEqual(account.updatedAt, hardcodedWebhookTimestamp);
  });

  it("does not include PII or secrets in email audit logs", async () => {
    const provider = new SandboxEmailProvider();
    const auditLogs: EmailAuditLogEntry[] = [];
    const gateway = makeGateway(provider, auditLogs);
    const account = { ...createTestEmailAccount({ userId: "user_a", email: "sensitive@example.test" }), verified: true };

    await gateway.send(account, renderTransactionalEmailTemplate("account_security"));

    const serializedLogs = JSON.stringify(auditLogs);
    assert.equal(serializedLogs.includes("sensitive@example.test"), false);
    assert.equal(serializedLogs.includes("Account security notice"), false);
    assert.equal(JSON.stringify(sanitizeEmailLogMetadata({ apiKey: "secret-key", email: "sensitive@example.test", topicCode: "system" })).includes("secret-key"), false);
    const sanitized = sanitizeEmailLogMetadata({
      authorizationHeader: "Bearer provider-token",
      providerCredentials: "credential-value",
      webhookBody: JSON.stringify({ email: "sensitive@example.test" }),
      topicCode: "system",
    });
    assert.deepEqual(sanitized, { topicCode: "system" });
  });

  it("normalizes bounce complaint and unsubscribe webhook skeleton events", async () => {
    const provider: EmailProvider = new SandboxEmailProvider();
    const gateway = makeGateway(provider);

    assert.deepEqual(normalizeEmailProviderWebhook({ type: "bounce", email: "USER@Example.Test", providerMessageId: "provider_1" }), [{ type: "bounce", email: "user@example.test", providerMessageId: "provider_1", reason: undefined }]);
    assert.deepEqual(await gateway.normalizeInboundEvent({ type: "complaint", email: "user@example.test" }), [{ type: "complaint", email: "user@example.test", providerMessageId: undefined, reason: undefined }]);
    assert.deepEqual(normalizeEmailProviderWebhook({ type: "unknown", email: "user@example.test" }), []);
  });

  it("uses runtime audit hash secret and stays stable per secret", async () => {
    const provider = new SandboxEmailProvider();
    const account = { ...createTestEmailAccount({ userId: "user_a", email: "sensitive@example.test" }), verified: true };
    const logsA: EmailAuditLogEntry[] = [];
    const logsB: EmailAuditLogEntry[] = [];
    const logsC: EmailAuditLogEntry[] = [];
    const gatewayA = new EmailGateway({ provider, fromEmail: "noreply@example.test", sandboxMode: true, auditHashSecret: "secret-a", auditLogs: logsA });
    const gatewayB = new EmailGateway({ provider, fromEmail: "noreply@example.test", sandboxMode: true, auditHashSecret: "secret-a", auditLogs: logsB });
    const gatewayC = new EmailGateway({ provider, fromEmail: "noreply@example.test", sandboxMode: true, auditHashSecret: "secret-b", auditLogs: logsC });

    await gatewayA.send(account, renderTransactionalEmailTemplate("account_security"));
    await gatewayB.send(account, renderTransactionalEmailTemplate("account_security"));
    await gatewayC.send(account, renderTransactionalEmailTemplate("account_security"));

    assert.equal(logsA[0]?.targetId, logsB[0]?.targetId);
    assert.notEqual(logsA[0]?.targetId, logsC[0]?.targetId);
  });

  it("fails closed when audit hash secret is missing", () => {
    assert.throws(
      () => new EmailGateway({ provider: new SandboxEmailProvider(), fromEmail: "noreply@example.test", sandboxMode: true, auditHashSecret: "" }),
      /EMAIL_AUDIT_HASH_SECRET is required/,
    );
  });
});
