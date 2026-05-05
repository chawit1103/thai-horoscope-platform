import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { EmailGateway, HttpEmailProvider, SandboxEmailProvider, applyEmailWebhookEvent, createEmailChannelAccount, createEmailVerificationToken, markEmailUnsubscribed, normalizeEmailProviderWebhook, renderTransactionalEmailTemplate, sanitizeEmailLogMetadata, verifyEmailToken, type EmailAuditLogEntry, type EmailProvider } from "../src/mvp/email-gateway";

const makeGateway = (provider: EmailProvider = new SandboxEmailProvider(), auditLogs: EmailAuditLogEntry[] = []) =>
  new EmailGateway({ provider, fromEmail: "noreply@example.test", sandboxMode: true, auditHashSecret: "test-audit-secret", auditLogs });

describe("email gateway", () => {
  it("routes only to verified email accounts", async () => {
    const provider = new SandboxEmailProvider();
    const gateway = makeGateway(provider);
    const account = createEmailChannelAccount({ userId: "user_a", email: "user@example.test" });
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

  it("suppresses horoscope/marketing email after unsubscribe even if caller marks transactional", async () => {
    const provider = new SandboxEmailProvider();
    const gateway = makeGateway(provider);
    const account = { ...createEmailChannelAccount({ userId: "user_a", email: "user@example.test" }), verified: true };
    markEmailUnsubscribed(account);

    const result = await gateway.send(account, { topicCode: "daily_horoscope", subject: "Hello", text: "Hello", html: "<p>Hello</p>", transactional: true });
    assert.equal(result.status, "unsubscribed");
    assert.equal(provider.sent.length, 0);

    const transactional = await gateway.send(account, renderTransactionalEmailTemplate("account_deletion"));
    assert.equal(transactional.status, "sent");
    assert.equal(provider.sent.length, 0);
  });

  it("suppresses bounced and complained email accounts", async () => {
    const provider = new SandboxEmailProvider();
    const gateway = makeGateway(provider);
    const bounced = { ...createEmailChannelAccount({ userId: "user_a", email: "bounce@example.test" }), verified: true };
    const complained = { ...createEmailChannelAccount({ userId: "user_b", email: "complaint@example.test" }), verified: true };
    applyEmailWebhookEvent(bounced, { type: "bounce", email: bounced.email });
    applyEmailWebhookEvent(complained, { type: "complaint", email: complained.email });

    assert.equal((await gateway.send(bounced, renderTransactionalEmailTemplate("data_export"))).status, "bounced");
    assert.equal((await gateway.send(complained, renderTransactionalEmailTemplate("data_export"))).status, "complained");
    assert.equal(provider.sent.length, 0);
  });

  it("verifies fresh email token and preserves account binding", () => {
    const account = createEmailChannelAccount({ userId: "user_a", email: "USER@Example.Test" });
    const token = createEmailVerificationToken(account, "verification-secret");

    assert.equal(verifyEmailToken(account, `${token}.extra`, "verification-secret"), false);
    assert.equal(verifyEmailToken(account, token, "wrong-secret"), false);
    assert.equal(verifyEmailToken(account, token, "verification-secret"), true);
    assert.equal(account.verified, true);
    assert.ok(account.verifiedAt);
  });

  it("rejects expired, malformed, and future-issued verification tokens", () => {
    const account = createEmailChannelAccount({ userId: "user_a", email: "user@example.test" });
    const secret = "verification-secret";
    const freshToken = createEmailVerificationToken(account, secret);
    const [payload, signature] = freshToken.split(".");
    assert.ok(payload && signature);

    const expiredPayload = Buffer.from(JSON.stringify({ userId: account.userId, email: account.email, issuedAt: "2026-05-01T09:00:00.000Z" }), "utf8").toString("base64url");
    const expiredSig = createHmac("sha256", secret).update(expiredPayload).digest("base64url");
    const expiredToken = `${expiredPayload}.${expiredSig}`;
    account.verificationTokenHash = createHmac("sha256", secret).update(expiredToken).digest("base64url");
    assert.equal(verifyEmailToken(account, expiredToken, secret), false);

    const malformedPayload = Buffer.from(JSON.stringify({ userId: account.userId, email: account.email, issuedAt: "not-a-date" }), "utf8").toString("base64url");
    const malformedSig = createHmac("sha256", secret).update(malformedPayload).digest("base64url");
    const malformedToken = `${malformedPayload}.${malformedSig}`;
    account.verificationTokenHash = createHmac("sha256", secret).update(malformedToken).digest("base64url");
    assert.equal(verifyEmailToken(account, malformedToken, secret), false);

    const futurePayload = Buffer.from(JSON.stringify({ userId: account.userId, email: account.email, issuedAt: "2026-05-03T11:00:00.000Z" }), "utf8").toString("base64url");
    const futureSig = createHmac("sha256", secret).update(futurePayload).digest("base64url");
    const futureToken = `${futurePayload}.${futureSig}`;
    account.verificationTokenHash = createHmac("sha256", secret).update(futureToken).digest("base64url");
    assert.equal(verifyEmailToken(account, futureToken, secret), false);
    account.verificationTokenHash = createHmac("sha256", secret).update(freshToken).digest("base64url");
    assert.equal(verifyEmailToken(account, freshToken, secret), true);
  });

  it("never performs real network sends in sandbox tests", async () => {
    const provider = new SandboxEmailProvider();
    const gateway = makeGateway(provider);
    const account = { ...createEmailChannelAccount({ userId: "user_a", email: "user@example.test" }), verified: true };

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
    const account = { ...createEmailChannelAccount({ userId: "user_a", email: "user@example.test" }), verified: true };
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
    const account = { ...createEmailChannelAccount({ userId: "user_a", email: "user@example.test" }), verified: true };
    const result = await gateway.send(account, renderTransactionalEmailTemplate("email_verification", { actionUrl: "https://example.test/verify" }));
    assert.equal(result.status, "sent");
    assert.equal(fetchCalls, 0);
  });



  it("returns failed result and audits when provider send throws", async () => {
    const auditLogs: EmailAuditLogEntry[] = [];
    const provider: EmailProvider = {
      async send() {
        throw new Error("provider down");
      },
    };
    const gateway = new EmailGateway({ provider, fromEmail: "noreply@example.test", sandboxMode: false, auditHashSecret: "test-audit-secret", auditLogs });
    const account = { ...createEmailChannelAccount({ userId: "user_a", email: "user@example.test" }), verified: true };

    const result = await gateway.send(account, renderTransactionalEmailTemplate("account_security"));

    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, "email_provider_failed");
    assert.equal(auditLogs.at(-1)?.action, "email_delivery_failed");
  });

  it("uses runtime timestamps for audit log entries", async () => {
    const provider = new SandboxEmailProvider();
    const auditLogs: EmailAuditLogEntry[] = [];
    const gateway = makeGateway(provider, auditLogs);
    const account = { ...createEmailChannelAccount({ userId: "user_a", email: "user@example.test" }), verified: true };
    const before = Date.now();

    await gateway.send(account, renderTransactionalEmailTemplate("account_security"));

    const createdAtMs = Date.parse(auditLogs[0]?.createdAt ?? "");
    const after = Date.now();
    assert.ok(Number.isFinite(createdAtMs));
    assert.ok(createdAtMs >= before && createdAtMs <= after);
  });

  it("does not include PII or secrets in email audit logs", async () => {
    const provider = new SandboxEmailProvider();
    const auditLogs: EmailAuditLogEntry[] = [];
    const gateway = makeGateway(provider, auditLogs);
    const account = { ...createEmailChannelAccount({ userId: "user_a", email: "sensitive@example.test" }), verified: true };

    await gateway.send(account, renderTransactionalEmailTemplate("account_security"));

    const serializedLogs = JSON.stringify(auditLogs);
    assert.equal(serializedLogs.includes("sensitive@example.test"), false);
    assert.equal(serializedLogs.includes("Account security notice"), false);
    assert.equal(JSON.stringify(sanitizeEmailLogMetadata({ apiKey: "secret-key", email: "sensitive@example.test", topicCode: "system" })).includes("secret-key"), false);
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
    const account = { ...createEmailChannelAccount({ userId: "user_a", email: "sensitive@example.test" }), verified: true };
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
});
