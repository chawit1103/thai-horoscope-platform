import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { POST } from "../app/api/line/webhook/route";
import { HttpLineProvider, LineGateway, SandboxLineProvider, applyLineInboundEvent, createLineChannelAccount, normalizeLineWebhook, renderLineHoroscopePreviewFlex, sanitizeLineLogMetadata, verifyLineWebhookSignature, type LineAuditLogEntry, type LineProvider } from "../src/mvp/line-gateway";

const testNow = new Date("2026-05-04T09:00:00.000Z");
const testChannelSecret = "test-line-channel-secret";
const testAuditSecret = "test-line-audit-secret";
const testLineUserId = "U1234567890abcdef";
const lineActivationEnv = {
  APP_ENV:"staging",
  ADMIN_SESSION_SECRET:"admin-session-secret",
  EMAIL_PROVIDER_MODE:"sandbox",
  EMAIL_AUDIT_HASH_SECRET:"email-audit-secret",
  LINE_PROVIDER_MODE:"http",
  LINE_CHANNEL_SECRET:testChannelSecret,
  LINE_CHANNEL_ACCESS_TOKEN:"test-line-access-token",
  LINE_AUDIT_HASH_SECRET:testAuditSecret,
  PAYMENT_PROVIDER_MODE:"mock",
  NOTIFICATION_SCHEDULER_MODE:"dry_run",
  ASTRO_ENGINE:"mock",
  SWISSEPH_LICENSE_MODE:"none",
  ENABLE_REAL_LINE_SENDS:"true",
  ENABLE_PROVIDER_DRY_RUN:"false",
  REQUIRE_PROVIDER_ACTIVATION_APPROVAL:"true",
};

const signLineBody = (body:string, secret = testChannelSecret) => createHmac("sha256", secret).update(body).digest("base64");
const signedLineHeaders = (body:string, secret = testChannelSecret) => new Headers({ "x-line-signature": signLineBody(body, secret) });
const makeGateway = (provider:LineProvider = new SandboxLineProvider({ channelSecret:testChannelSecret }), auditLogs:LineAuditLogEntry[] = []) =>
  new LineGateway({ provider, sandboxMode:true, auditHashSecret:testAuditSecret, auditLogs });

describe("line gateway", () => {
  it("rejects invalid or missing LINE webhook signatures", () => {
    const body = JSON.stringify({ events:[] });

    assert.equal(verifyLineWebhookSignature(new Headers({ "x-line-signature":"bad" }), body, testChannelSecret), false);
    assert.equal(verifyLineWebhookSignature(new Headers(), body, testChannelSecret), false);
    assert.equal(verifyLineWebhookSignature(signedLineHeaders(body), body, ""), false);
  });

  it("accepts valid LINE webhook signatures", () => {
    const body = JSON.stringify({ events:[] });

    assert.equal(verifyLineWebhookSignature(signedLineHeaders(body), body, testChannelSecret), true);
  });

  it("LINE webhook endpoint rejects invalid signatures and accepts valid signatures", async () => {
    const body = JSON.stringify({ events:[{ type:"follow", webhookEventId:"evt_1", source:{ type:"user", userId:testLineUserId }, timestamp:testNow.getTime() }] });
    const previousSecret = process.env.LINE_CHANNEL_SECRET;
    const previousToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const previousAuditSecret = process.env.LINE_AUDIT_HASH_SECRET;
    process.env.LINE_CHANNEL_SECRET = testChannelSecret;
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "test-line-access-token";
    process.env.LINE_AUDIT_HASH_SECRET = testAuditSecret;
    try {
      const invalid = await POST(new Request("https://example.test/api/line/webhook", { method:"POST", headers:new Headers({ "x-line-signature":"bad" }), body }));
      assert.equal(invalid.status, 401);

      const valid = await POST(new Request("https://example.test/api/line/webhook", { method:"POST", headers:signedLineHeaders(body), body }));
      assert.equal(valid.status, 200);
      assert.deepEqual(await valid.json(), { ok:true, eventCount:1 });
    } finally {
      if (previousSecret === undefined) delete process.env.LINE_CHANNEL_SECRET;
      else process.env.LINE_CHANNEL_SECRET = previousSecret;
      if (previousToken === undefined) delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
      else process.env.LINE_CHANNEL_ACCESS_TOKEN = previousToken;
      if (previousAuditSecret === undefined) delete process.env.LINE_AUDIT_HASH_SECRET;
      else process.env.LINE_AUDIT_HASH_SECRET = previousAuditSecret;
    }
  });

  it("LINE webhook endpoint fails closed when LINE_AUDIT_HASH_SECRET is missing", async () => {
    const previousAuditSecret = process.env.LINE_AUDIT_HASH_SECRET;
    delete process.env.LINE_AUDIT_HASH_SECRET;
    try {
      const response = await POST(new Request("https://example.test/api/line/webhook", { method:"POST", body:JSON.stringify({ events:[] }) }));
      assert.equal(response.status, 500);
    } finally {
      if (previousAuditSecret === undefined) delete process.env.LINE_AUDIT_HASH_SECRET;
      else process.env.LINE_AUDIT_HASH_SECRET = previousAuditSecret;
    }
  });

  it("normalizes LINE follow message postback and unfollow events without raw user IDs", () => {
    const normalized = normalizeLineWebhook({
      events:[
        { type:"follow", webhookEventId:"evt_follow", source:{ type:"user", userId:testLineUserId }, replyToken:"reply_1", timestamp:testNow.getTime() },
        { type:"message", webhookEventId:"evt_msg", source:{ type:"user", userId:testLineUserId }, message:{ type:"text", text:"hi" }, timestamp:testNow.getTime() },
        { type:"postback", webhookEventId:"evt_postback", source:{ type:"user", userId:testLineUserId }, postback:{ data:"period=daily" }, timestamp:testNow.getTime() },
        { type:"unfollow", webhookEventId:"evt_unfollow", source:{ type:"user", userId:testLineUserId }, timestamp:testNow.getTime() },
      ],
    }, testChannelSecret, testNow);

    assert.deepEqual(normalized.map((event)=>event.type), ["follow", "message", "postback", "unfollow"]);
    assert.equal(normalized[0]?.providerEventId, "evt_follow");
    assert.equal(normalized[1]?.messageType, "text");
    assert.equal(normalized[2]?.postbackData, "period=daily");
    assert.equal(JSON.stringify(normalized).includes(testLineUserId), false);
  });

  it("unfollow marks a matching LINE channel account inactive", () => {
    const account = createLineChannelAccount({ userId:"user_a", lineUserId:testLineUserId, now:testNow });
    const [event] = normalizeLineWebhook({ events:[{ type:"unfollow", source:{ userId:testLineUserId }, timestamp:testNow.getTime() }] }, testChannelSecret, testNow);

    assert.equal(event?.type, "unfollow");
    assert.equal(applyLineInboundEvent(account, event!, testChannelSecret, new Date("2026-05-04T09:01:00.000Z")), "applied");
    assert.equal(account.active, false);
    assert.equal(account.blocked, true);
    assert.equal(account.followed, false);
  });

  it("ignores inbound events that do not match the LINE channel account", () => {
    const account = createLineChannelAccount({ userId:"user_a", lineUserId:testLineUserId, now:testNow });
    const [event] = normalizeLineWebhook({ events:[{ type:"unfollow", source:{ userId:"Uother" }, timestamp:testNow.getTime() }] }, testChannelSecret, testNow);

    assert.equal(applyLineInboundEvent(account, event!, testChannelSecret, new Date("2026-05-04T09:01:00.000Z")), "ignored");
    assert.equal(account.active, true);
    assert.equal(account.blocked, false);
  });

  it("suppresses inactive and blocked LINE channel accounts", async () => {
    const provider = new SandboxLineProvider();
    const gateway = makeGateway(provider);
    const inactive = { ...createLineChannelAccount({ userId:"user_a", lineUserId:testLineUserId, now:testNow }), active:false };
    const blocked = { ...createLineChannelAccount({ userId:"user_b", lineUserId:"Ublocked", now:testNow }), blocked:true };

    assert.equal((await gateway.send(inactive, { topicCode:"daily_horoscope", title:"Daily", body:"Preview", ctaUrl:"https://example.test/today" })).status, "blocked");
    assert.equal((await gateway.send(blocked, { topicCode:"daily_horoscope", title:"Daily", body:"Preview", ctaUrl:"https://example.test/today" })).status, "blocked");
    assert.equal(provider.sent.length, 0);
  });

  it("does not call the configured provider in LINE sandbox mode", async () => {
    let pushCalls = 0;
    const provider: LineProvider = {
      async push() {
        pushCalls += 1;
        throw new Error("network call should not happen");
      },
    };
    const gateway = new LineGateway({ provider, sandboxMode:true, auditHashSecret:testAuditSecret });
    const account = createLineChannelAccount({ userId:"user_a", lineUserId:testLineUserId, now:testNow });

    const result = await gateway.send(account, { topicCode:"daily_horoscope", title:"Daily", body:"Preview", ctaUrl:"https://example.test/today", periodKey:"2026-05-04" });
    assert.equal(result.status, "sent");
    assert.equal(pushCalls, 0);
  });

  it("does not make real LINE API calls in tests", async () => {
    const provider = new SandboxLineProvider();
    const gateway = makeGateway(provider);
    const account = createLineChannelAccount({ userId:"user_a", lineUserId:testLineUserId, now:testNow });

    await gateway.send(account, { topicCode:"daily_horoscope", title:"Daily", body:"Preview", ctaUrl:"https://example.test/today", periodKey:"2026-05-04" });

    assert.equal(provider.networkSendCount, 0);
    assert.equal(provider.sent.length, 0);
  });

  it("sends through HttpLineProvider only when sandbox is disabled and fetcher is injected", async () => {
    let fetchCalls = 0;
    let retryHeader = "";
    const provider = new HttpLineProvider({ channelAccessToken:"test-line-access-token", channelSecret:testChannelSecret, activationEnv:lineActivationEnv, fetcher:async (_url, init) => {
      fetchCalls += 1;
      retryHeader = new Headers(init?.headers).get("x-line-retry-key") ?? "";
      return new Response(null, { status:200, headers:{ "x-line-request-id":"line_request_1" } });
    } });
    const gateway = new LineGateway({ provider, sandboxMode:false, auditHashSecret:testAuditSecret });
    const account = createLineChannelAccount({ userId:"user_a", lineUserId:testLineUserId, now:testNow });

    const result = await gateway.send(account, { topicCode:"daily_horoscope", title:"Daily", body:"Preview", ctaUrl:"https://example.test/today", periodKey:"2026-05-04" });

    assert.equal(result.status, "sent");
    assert.equal(result.providerMessageId, "line_request_1");
    assert.equal(fetchCalls, 1);
    assert.match(retryHeader, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(retryHeader.includes("user_a:"), false);
  });

  it("uses stable UUID LINE retry keys for the same logical message and different UUIDs for different ids", async () => {
    const seenHeaders:string[] = [];
    const provider = new HttpLineProvider({ channelAccessToken:"test-line-access-token", activationEnv:lineActivationEnv, fetcher:async (_url, init) => {
      seenHeaders.push(new Headers(init?.headers).get("x-line-retry-key") ?? "");
      return new Response(null, { status:200 });
    } });
    const gateway = new LineGateway({ provider, sandboxMode:false, auditHashSecret:testAuditSecret });
    const account = createLineChannelAccount({ userId:"user_a", lineUserId:testLineUserId, now:testNow });

    await gateway.send(account, { topicCode:"daily_horoscope", title:"Daily", body:"Preview", periodKey:"2026-05-04" });
    await gateway.send(account, { topicCode:"daily_horoscope", title:"Daily", body:"Preview", periodKey:"2026-05-05" });
    await gateway.send(createLineChannelAccount({ userId:"user_b", lineUserId:"U9876543210", now:testNow }), { topicCode:"system_announcement", title:"Notice", body:"Body", idempotencyKey:"evt_01" });

    assert.equal(seenHeaders[0] !== seenHeaders[1], true);
    assert.equal(seenHeaders[1] !== seenHeaders[2], true);
    for (const header of seenHeaders) assert.match(header, /^[0-9a-f-]{36}$/i);
  });

  it("treats LINE 409 with retry key as accepted idempotent success and still fails unsafe cases", async () => {
    const okProvider = new HttpLineProvider({ channelAccessToken:"test-line-access-token", activationEnv:lineActivationEnv, fetcher:async () => new Response(null, { status:200, headers:{ "x-line-request-id":"ok_1" } }) });
    const okResult = await okProvider.push({ to:testLineUserId, messages:[{ type:"text", text:"ok" }], retryKey:"3cf0c8ef-2f24-4eb8-9461-d7f97ef9ed90" });
    assert.equal(okResult.providerMessageId, "ok_1");

    const retryConflictProvider = new HttpLineProvider({ channelAccessToken:"test-line-access-token", activationEnv:lineActivationEnv, fetcher:async () => new Response(null, { status:409, headers:{ "x-line-request-id":"conflict_1", "x-line-accepted-request-id":"accepted_1" } }) });
    const retryConflictResult = await retryConflictProvider.push({ to:testLineUserId, messages:[{ type:"text", text:"retry" }], retryKey:"3cf0c8ef-2f24-4eb8-9461-d7f97ef9ed90" });
    assert.equal(retryConflictResult.providerMessageId, "accepted_1");
    assert.deepEqual(retryConflictResult.raw, { accepted:true, idempotentConflict:true, status:409 });

    const retryConflictFallbackProvider = new HttpLineProvider({ channelAccessToken:"test-line-access-token", activationEnv:lineActivationEnv, fetcher:async () => new Response(null, { status:409, headers:{ "x-line-request-id":"conflict_fallback_1" } }) });
    const retryConflictFallbackResult = await retryConflictFallbackProvider.push({ to:testLineUserId, messages:[{ type:"text", text:"retry" }], retryKey:"3cf0c8ef-2f24-4eb8-9461-d7f97ef9ed90" });
    assert.equal(retryConflictFallbackResult.providerMessageId, "conflict_fallback_1");

    await assert.rejects(retryConflictProvider.push({ to:testLineUserId, messages:[{ type:"text", text:"retry" }] }), /without retry key/);
    await assert.rejects(retryConflictProvider.push({ to:testLineUserId, messages:[{ type:"text", text:"retry" }], retryKey:"not-a-uuid" }), /valid UUID/);

    const failProvider = new HttpLineProvider({ channelAccessToken:"test-line-access-token", activationEnv:lineActivationEnv, fetcher:async () => new Response(null, { status:500 }) });
    await assert.rejects(failProvider.push({ to:testLineUserId, messages:[{ type:"text", text:"fail" }], retryKey:"3cf0c8ef-2f24-4eb8-9461-d7f97ef9ed90" }), /status 500/);
  });



  it("rejects empty, whitespace, and invalid retry keys before calling fetcher", async () => {
    let fetchCalls = 0;
    const provider = new HttpLineProvider({ channelAccessToken:"test-line-access-token", activationEnv:lineActivationEnv, fetcher:async () => {
      fetchCalls += 1;
      return new Response(null, { status:200 });
    } });

    await assert.rejects(provider.push({ to:testLineUserId, messages:[{ type:"text", text:"bad-empty" }], retryKey:"" }), /valid UUID/);
    await assert.rejects(provider.push({ to:testLineUserId, messages:[{ type:"text", text:"bad-space" }], retryKey:"   " }), /valid UUID/);
    await assert.rejects(provider.push({ to:testLineUserId, messages:[{ type:"text", text:"bad-format" }], retryKey:"not-a-uuid" }), /valid UUID/);

    assert.equal(fetchCalls, 0);
  });

  it("forwards valid retry keys and keeps behavior unchanged when retry key is missing", async () => {
    let forwardedRetryHeader:string|null = null;
    const provider = new HttpLineProvider({ channelAccessToken:"test-line-access-token", activationEnv:lineActivationEnv, fetcher:async (_url, init) => {
      forwardedRetryHeader = new Headers(init?.headers).get("x-line-retry-key");
      return new Response(null, { status:200, headers:{ "x-line-request-id":"ok_no_retry" } });
    } });
    await provider.push({ to:testLineUserId, messages:[{ type:"text", text:"hello" }], retryKey:"3cf0c8ef-2f24-4eb8-9461-d7f97ef9ed90" });
    assert.equal(forwardedRetryHeader, "3cf0c8ef-2f24-4eb8-9461-d7f97ef9ed90");

    forwardedRetryHeader = "unexpected";
    await provider.push({ to:testLineUserId, messages:[{ type:"text", text:"hello-no-retry" }] });
    assert.equal(forwardedRetryHeader, null);
  });

  it("builds a LINE Flex Message horoscope preview with CTA link", () => {
    const flex = renderLineHoroscopePreviewFlex({ topicCode:"daily_horoscope", title:"Daily horoscope", body:"Preview text", ctaUrl:"https://example.test/today" });

    assert.equal(flex.type, "flex");
    assert.equal(flex.altText, "Daily horoscope");
    assert.equal(JSON.stringify(flex.contents).includes("https://example.test/today"), true);
  });

  it("does not include LINE user IDs or secrets in unsafe logs", async () => {
    const auditLogs: LineAuditLogEntry[] = [];
    const provider = new SandboxLineProvider();
    const gateway = makeGateway(provider, auditLogs);
    const account = createLineChannelAccount({ userId:"user_a", lineUserId:testLineUserId, now:testNow });

    await gateway.send(account, { topicCode:"daily_horoscope", title:"Daily", body:"Sensitive preview body", ctaUrl:"https://example.test/today", periodKey:"2026-05-04" });

    const serialized = JSON.stringify(auditLogs);
    assert.equal(serialized.includes(testLineUserId), false);
    assert.equal(serialized.includes("Sensitive preview body"), false);
    assert.deepEqual(sanitizeLineLogMetadata({ lineUserId:testLineUserId, channelAccessToken:"secret-token", rawPayload:"body", topicCode:"daily_horoscope" }), { topicCode:"daily_horoscope" });
  });

  it("prevents duplicate LINE sends for the same account topic and period key", async () => {
    const gateway = makeGateway();
    const account = createLineChannelAccount({ userId:"user_a", lineUserId:testLineUserId, now:testNow });
    const message = { topicCode:"daily_horoscope", title:"Daily", body:"Preview", ctaUrl:"https://example.test/today", periodKey:"2026-05-04" };

    assert.equal((await gateway.send(account, message)).status, "sent");
    const duplicate = await gateway.send(account, message);
    assert.equal(duplicate.status, "blocked");
    assert.equal(duplicate.errorCode, "duplicate_line_send");
  });

  it("requires periodKey for daily weekly monthly yearly horoscope topics", async () => {
    const gateway = makeGateway();
    const account = createLineChannelAccount({ userId:"user_a", lineUserId:testLineUserId, now:testNow });
    for (const topicCode of ["daily_horoscope", "weekly_horoscope", "monthly_horoscope", "yearly_horoscope"]) {
      await assert.rejects(gateway.send(account, { topicCode, title:"Stable", body:"Preview" }), /periodKey is required/);
    }
  });

  it("never uses title or periodKey as dedupe key for non-period topics", async () => {
    const gateway = makeGateway();
    const account = createLineChannelAccount({ userId:"user_a", lineUserId:testLineUserId, now:testNow });
    await assert.rejects(gateway.send(account, { topicCode:"system_announcement", title:"Daily", body:"Preview" }), /idempotencyKey is required/);
    await assert.rejects(gateway.send(account, { topicCode:"system_announcement", title:"Daily", body:"Preview", periodKey:"2026-05" }), /idempotencyKey is required/);
    const first = await gateway.send(account, { topicCode:"system_announcement", title:"Daily", body:"Preview", idempotencyKey:"evt_001" });
    const second = await gateway.send(account, { topicCode:"system_announcement", title:"Daily", body:"Preview", idempotencyKey:"evt_001" });
    assert.equal(first.status, "sent");
    assert.equal(second.status, "blocked");
  });

  it("treats different period keys as different legitimate sends", async () => {
    const gateway = makeGateway();
    const account = createLineChannelAccount({ userId:"user_a", lineUserId:testLineUserId, now:testNow });
    const first = await gateway.send(account, { topicCode:"daily_horoscope", title:"Daily", body:"Preview", periodKey:"2026-05-04" });
    const second = await gateway.send(account, { topicCode:"daily_horoscope", title:"Daily", body:"Preview", periodKey:"2026-05-05" });
    assert.equal(first.status, "sent");
    assert.equal(second.status, "sent");
  });

  it("uses the same audit hash secret for webhook normalization and inbound follow/unfollow matching", () => {
    const account = createLineChannelAccount({ userId:"user_a", lineUserId:testLineUserId, now:testNow });
    const [event] = normalizeLineWebhook({ events:[{ type:"follow", source:{ userId:testLineUserId }, timestamp:testNow.getTime() }] }, testAuditSecret, testNow);
    assert.equal(applyLineInboundEvent(account, event!, testAuditSecret, testNow), "applied");
    assert.equal(applyLineInboundEvent(account, event!, "different-secret", testNow), "ignored");
  });
});
