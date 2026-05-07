import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type LineInboundEventType = "follow"|"unfollow"|"message"|"postback";
export type LineDeliveryStatus = "sent"|"failed"|"blocked";
export type LineMessage = { topicCode:string; title:string; body:string; ctaUrl?:string; imageUrl?:string; periodKey?:string; idempotencyKey?:string; metadata?:Record<string,string>; };
export type LinePushMessage = LineTextMessage | LineFlexMessage;
export interface LineTextMessage { type:"text"; text:string; }
export interface LineFlexMessage { type:"flex"; altText:string; contents:Record<string,unknown>; }
export interface LineChannelAccount { userId:string; lineUserId:string; active:boolean; blocked:boolean; followed:boolean; updatedAt:string; }
export interface LineProviderPushRequest { to:string; messages:LinePushMessage[]; retryKey?:string; }
export interface LineProviderPushResult { providerMessageId?:string; raw?:unknown; }
export interface LineProvider { push(request:LineProviderPushRequest):Promise<LineProviderPushResult>; verifyWebhook?(headers:Headers, body:string):Promise<boolean>; normalizeWebhook?(body:unknown):Promise<LineInboundEvent[]>; }
export interface LineDeliveryResult { status:LineDeliveryStatus; providerMessageId?:string; errorCode?:string; raw?:unknown; }
export interface LineInboundEvent { id:string; type:LineInboundEventType; lineUserIdHash:string; providerEventId?:string; messageType?:string; postbackData?:string; replyToken?:string; createdAt:string; }
export interface LineAuditLogEntry { action:string; targetId:string; metadata:Record<string,string>; createdAt:string; }

export class SandboxLineProvider implements LineProvider {
  readonly sent: LineProviderPushRequest[] = [];
  networkSendCount = 0;

  constructor(private readonly config:{ channelSecret?:string; userIdHashSecret?:string } = {}) {}

  async push(request:LineProviderPushRequest):Promise<LineProviderPushResult> {
    this.sent.push(structuredClone(request));
    return { providerMessageId:`sandbox_line_${this.sent.length}` };
  }

  async verifyWebhook(headers:Headers, body:string):Promise<boolean> {
    return verifyLineWebhookSignature(headers, body, this.config.channelSecret);
  }

  async normalizeWebhook(body:unknown):Promise<LineInboundEvent[]> {
    return normalizeLineWebhook(body, this.config.userIdHashSecret ?? "test-line-user-hash-secret");
  }
}

export class HttpLineProvider implements LineProvider {
  constructor(private readonly config:{ channelAccessToken?:string; channelSecret?:string; pushEndpoint?:string; fetcher?:typeof fetch; userIdHashSecret?:string }) {}

  async push(request:LineProviderPushRequest):Promise<LineProviderPushResult> {
    const token = this.config.channelAccessToken ?? process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token?.trim()) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is required.");
    if (request.retryKey !== undefined) {
      if (!request.retryKey.trim() || !isUuid(request.retryKey)) throw new Error("LINE retryKey must be a valid UUID.");
    }
    const fetcher = this.config.fetcher ?? fetch;
    const response = await fetcher(this.config.pushEndpoint ?? "https://api.line.me/v2/bot/message/push", {
      method:"POST",
      headers:{ authorization:`Bearer ${token}`, "content-type":"application/json", ...(request.retryKey ? { "x-line-retry-key":request.retryKey } : {}) },
      body:JSON.stringify({to:request.to,messages:request.messages}),
    });
    if (response.status === 409) {
      if (request.retryKey?.trim()) {
        return {
          providerMessageId: response.headers.get("x-line-accepted-request-id") ?? response.headers.get("x-line-request-id") ?? undefined,
          raw:{ accepted:true, idempotentConflict:true, status:409 },
        };
      }
      throw new Error("LINE provider failed with status 409 without retry key.");
    }
    if (!response.ok) throw new Error(`LINE provider failed with status ${response.status}.`);
    return { providerMessageId: response.headers.get("x-line-request-id") ?? undefined };
  }

  async verifyWebhook(headers:Headers, body:string):Promise<boolean> {
    return verifyLineWebhookSignature(headers, body, this.config.channelSecret ?? process.env.LINE_CHANNEL_SECRET);
  }

  async normalizeWebhook(body:unknown):Promise<LineInboundEvent[]> {
    return normalizeLineWebhook(body, this.config.userIdHashSecret ?? process.env.LINE_AUDIT_HASH_SECRET ?? "");
  }
}

export class LineGateway {
  readonly channel = "line" as const;
  private readonly sentKeys = new Set<string>();

  constructor(private readonly config:{ provider:LineProvider; sandboxMode:boolean; auditHashSecret:string; auditLogs?:LineAuditLogEntry[] }) {
    if (!config.auditHashSecret.trim()) throw new Error("LINE_AUDIT_HASH_SECRET is required.");
  }

  async send(account:LineChannelAccount, message:LineMessage):Promise<LineDeliveryResult> {
    if (!account.active || account.blocked || !account.followed) return this.block(account, message, "line_account_inactive");
    const retryKey = lineRetryKey(account, message, this.config.auditHashSecret);
    if (this.sentKeys.has(retryKey)) return { status:"blocked", errorCode:"duplicate_line_send" };
    const messages = [renderLineHoroscopePreviewFlex(message)];
    if (this.config.sandboxMode) {
      this.sentKeys.add(retryKey);
      const providerMessageId = `sandbox_line_${Date.now()}`;
      this.audit("line_delivery_sent", account, message, providerMessageId);
      return { status:"sent", providerMessageId, raw:{ sandbox:true } };
    }
    try {
      const result = await this.config.provider.push({ to:account.lineUserId, messages, retryKey });
      this.sentKeys.add(retryKey);
      this.audit("line_delivery_sent", account, message, result.providerMessageId);
      return { status:"sent", providerMessageId:result.providerMessageId };
    } catch {
      this.audit("line_delivery_failed", account, message, undefined, "line_provider_failed");
      return { status:"failed", errorCode:"line_provider_failed" };
    }
  }

  async verifyWebhook(headers:Headers, body:string):Promise<boolean> {
    return this.config.provider.verifyWebhook?.(headers, body) ?? false;
  }

  async normalizeInboundEvent(body:unknown):Promise<LineInboundEvent[]> {
    return this.config.provider.normalizeWebhook?.(body) ?? [];
  }

  private block(account:LineChannelAccount, message:LineMessage, errorCode:string):LineDeliveryResult {
    this.audit("line_delivery_suppressed", account, message, undefined, errorCode);
    return { status:"blocked", errorCode };
  }

  private audit(action:string, account:LineChannelAccount, message:LineMessage, providerMessageId?:string, errorCode?:string):void {
    this.config.auditLogs?.push({
      action,
      targetId: stableLineTarget(account.lineUserId, this.config.auditHashSecret),
      createdAt:new Date().toISOString(),
      metadata:sanitizeLineLogMetadata({ topicCode:message.topicCode, providerMessageId:providerMessageId??"", errorCode:errorCode??"", lineUserId:account.lineUserId, body:message.body, channelAccessToken:"" }),
    });
  }
}

export function createLineChannelAccount(input:{ userId:string; lineUserId:string; now?:Date }):LineChannelAccount {
  return { userId:input.userId, lineUserId:input.lineUserId.trim(), active:true, blocked:false, followed:true, updatedAt:(input.now??new Date()).toISOString() };
}

export function applyLineInboundEvent(account:LineChannelAccount, event:LineInboundEvent, userIdHashSecret:string, now=new Date()):"applied"|"ignored" {
  if (event.lineUserIdHash !== stableLineTarget(account.lineUserId, userIdHashSecret)) return "ignored";
  if (event.type === "follow") { account.active=true; account.blocked=false; account.followed=true; }
  if (event.type === "unfollow") { account.active=false; account.blocked=true; account.followed=false; }
  account.updatedAt = now.toISOString();
  return "applied";
}

export function verifyLineWebhookSignature(headers:Headers, body:string, channelSecret:string|undefined):boolean {
  if (!channelSecret?.trim()) return false;
  const signature = headers.get("x-line-signature");
  if (!signature) return false;
  return constantTimeEqual(signature, createHmac("sha256", channelSecret).update(body).digest("base64"));
}

export function normalizeLineWebhook(body:unknown, userIdHashSecret:string, now=new Date()):LineInboundEvent[] {
  if (!body || typeof body !== "object" || !userIdHashSecret.trim()) return [];
  const events = Array.isArray((body as {events?:unknown}).events) ? (body as {events:unknown[]}).events : [];
  return events.flatMap((event, index) => normalizeLineEvent(event, index, userIdHashSecret, now));
}

export function renderLineHoroscopePreviewFlex(message:LineMessage):LineFlexMessage {
  return {
    type:"flex",
    altText:message.title,
    contents:{
      type:"bubble",
      body:{ type:"box", layout:"vertical", contents:[
        { type:"text", text:message.title, weight:"bold", wrap:true },
        { type:"text", text:message.body, wrap:true, margin:"md" },
      ] },
      footer:{ type:"box", layout:"vertical", contents:[
        { type:"button", style:"primary", action:{ type:"uri", label:"Read horoscope", uri:message.ctaUrl ?? "https://example.test/horoscope" } },
      ] },
    },
  };
}

export function sanitizeLineLogMetadata(metadata:Record<string,string>):Record<string,string> {
  return Object.fromEntries(Object.entries(metadata).filter(([key,value]) => !isSensitiveLineLogKey(key) && !isSensitiveLineLogValue(value)));
}

function normalizeLineEvent(event:unknown, index:number, userIdHashSecret:string, now:Date):LineInboundEvent[] {
  if (!event || typeof event !== "object") return [];
  const input = event as { type?:unknown; source?:{ userId?:unknown }; webhookEventId?:unknown; message?:{ type?:unknown }; postback?:{ data?:unknown }; replyToken?:unknown; timestamp?:unknown };
  if (input.type !== "follow" && input.type !== "unfollow" && input.type !== "message" && input.type !== "postback") return [];
  if (typeof input.source?.userId !== "string" || !input.source.userId.trim()) return [];
  return [{
    id:`line_evt_${typeof input.webhookEventId === "string" ? input.webhookEventId : index}`,
    type:input.type,
    lineUserIdHash:stableLineTarget(input.source.userId, userIdHashSecret),
    providerEventId:typeof input.webhookEventId === "string" ? input.webhookEventId : undefined,
    messageType:typeof input.message?.type === "string" ? input.message.type : undefined,
    postbackData:typeof input.postback?.data === "string" ? input.postback.data : undefined,
    replyToken:typeof input.replyToken === "string" ? input.replyToken : undefined,
    createdAt:new Date(typeof input.timestamp === "number" ? input.timestamp : now.getTime()).toISOString(),
  }];
}

function lineRetryKey(account:LineChannelAccount, message:LineMessage, hashSecret:string):string {
  const periodTopics = new Set(["daily_horoscope","weekly_horoscope","monthly_horoscope","yearly_horoscope"]);
  const requiresPeriodKey = periodTopics.has(message.topicCode);
  if (requiresPeriodKey && !message.periodKey?.trim()) throw new Error(`periodKey is required for topic ${message.topicCode}.`);
  if (!requiresPeriodKey && !message.idempotencyKey?.trim()) throw new Error(`idempotencyKey is required for non-period topic ${message.topicCode}.`);
  const dedupeIdentifier = requiresPeriodKey ? message.periodKey!.trim() : message.idempotencyKey!.trim();
  const logicalDedupeKey = [account.userId, stableLineTarget(account.lineUserId, hashSecret), message.topicCode, dedupeIdentifier].join(":");
  return stableLineRetryUuid(logicalDedupeKey);
}
function stableLineRetryUuid(input:string):string {
  const namespace = "line-retry-key:v1";
  const bytes = createHash("sha1").update(`${namespace}:${input}`).digest();
  const uuid = Buffer.from(bytes.subarray(0, 16));
  uuid[6] = (uuid[6]! & 0x0f) | 0x50;
  uuid[8] = (uuid[8]! & 0x3f) | 0x80;
  return `${uuid.subarray(0, 4).toString("hex")}-${uuid.subarray(4, 6).toString("hex")}-${uuid.subarray(6, 8).toString("hex")}-${uuid.subarray(8, 10).toString("hex")}-${uuid.subarray(10, 16).toString("hex")}`;
}
function isUuid(value:string):boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}
function stableLineTarget(value:string, secret:string):string { return `line_${createHmac("sha256", secret).update(value.trim()).digest("base64url").slice(0,16)}`; }
function isSensitiveLineLogKey(key:string):boolean { const normalized=key.toLowerCase(); return ["lineuserid","userids","userid","channelaccesstoken","secret","token","authorization","body","raw","payload"].some((blocked)=>normalized.includes(blocked)); }
function isSensitiveLineLogValue(value:string):boolean { const normalized=value.toLowerCase(); return /\bU[A-Za-z0-9]{8,}\b/.test(value) || normalized.includes("bearer ") || normalized.includes("secret") || normalized.includes("token"); }
function constantTimeEqual(a:string,b:string):boolean { const left=Buffer.from(a); const right=Buffer.from(b); return left.length===right.length && timingSafeEqual(left,right); }
