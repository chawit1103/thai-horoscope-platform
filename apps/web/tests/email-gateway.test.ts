import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EmailGateway, SandboxEmailProvider, applyEmailWebhookEvent, createEmailChannelAccount, createEmailVerificationToken, markEmailUnsubscribed, normalizeEmailProviderWebhook, renderTransactionalEmailTemplate, sanitizeEmailLogMetadata, verifyEmailToken, type EmailAuditLogEntry, type EmailProvider } from "../src/mvp/email-gateway";

const makeGateway = (provider: EmailProvider = new SandboxEmailProvider(), auditLogs: EmailAuditLogEntry[] = []) =>
  new EmailGateway({ provider, fromEmail: "noreply@example.test", sandboxMode: true, auditLogs });

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
    assert.equal(provider.sent.length, 1);

    account.verified = true;
    const sent = await gateway.send(account, message);
    assert.equal(sent.status, "sent");
    assert.equal(provider.sent.length, 2);
  });

  it("suppresses non-transactional email after unsubscribe", async () => {
    const provider = new SandboxEmailProvider();
    const gateway = makeGateway(provider);
    const account = { ...createEmailChannelAccount({ userId: "user_a", email: "user@example.test" }), verified: true };
    markEmailUnsubscribed(account);

    const result = await gateway.send(account, { topicCode: "marketing", subject: "Hello", text: "Hello", html: "<p>Hello</p>", transactional: false });
    assert.equal(result.status, "unsubscribed");
    assert.equal(provider.sent.length, 0);

    const transactional = await gateway.send(account, renderTransactionalEmailTemplate("account_deletion"));
    assert.equal(transactional.status, "sent");
    assert.equal(provider.sent.length, 1);
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

  it("verifies email with a signed token flow", () => {
    const account = createEmailChannelAccount({ userId: "user_a", email: "USER@Example.Test" });
    const token = createEmailVerificationToken(account, "verification-secret");

    assert.equal(verifyEmailToken(account, `${token}.extra`, "verification-secret"), false);
    assert.equal(verifyEmailToken(account, token, "wrong-secret"), false);
    assert.equal(verifyEmailToken(account, token, "verification-secret"), true);
    assert.equal(account.verified, true);
    assert.ok(account.verifiedAt);
  });

  it("never performs real network sends in sandbox tests", async () => {
    const provider = new SandboxEmailProvider();
    const gateway = makeGateway(provider);
    const account = { ...createEmailChannelAccount({ userId: "user_a", email: "user@example.test" }), verified: true };

    const result = await gateway.send(account, renderTransactionalEmailTemplate("email_verification", { actionUrl: "https://example.test/verify" }));
    assert.equal(result.status, "sent");
    assert.equal(provider.networkSendCount, 0);
    assert.equal(provider.sent.length, 1);
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
});
