import { createHmac, timingSafeEqual } from "node:crypto";

export type EmailTopicCode = "email_verification"|"account_security"|"data_export"|"account_deletion"|"payment_receipt"|"daily_horoscope"|"weekly_horoscope"|"monthly_horoscope"|"yearly_horoscope"|"marketing";
export type EmailDeliveryStatus = "sent"|"failed"|"blocked"|"bounced"|"complained"|"unsubscribed";
export type EmailWebhookEventType = "bounce"|"complaint"|"unsubscribe";

export interface EmailChannelAccount { userId:string; email:string; verified:boolean; unsubscribed:boolean; bounced:boolean; complained:boolean; verificationTokenHash?:string; verifiedAt?:string; updatedAt:string; }
export interface EmailMessage { topicCode:EmailTopicCode; subject:string; text:string; html:string; transactional:boolean; metadata?:Record<string,string>; }
export interface EmailProviderRequest { to:string; from:string; subject:string; text:string; html:string; headers:Record<string,string>; }
export interface EmailProviderResult { providerMessageId?:string; raw?:unknown; }
export interface EmailProvider { send(request:EmailProviderRequest):Promise<EmailProviderResult>; verifyWebhook?(headers:Headers, body:string):Promise<boolean>; normalizeWebhook?(body:unknown):Promise<EmailWebhookEvent[]>; }
export interface EmailWebhookEvent { type:EmailWebhookEventType; email:string; providerMessageId?:string; reason?:string; }
export interface EmailDeliveryResult { status:EmailDeliveryStatus; providerMessageId?:string; errorCode?:string; raw?:unknown; }
export interface EmailAuditLogEntry { action:string; targetId:string; metadata:Record<string,string>; createdAt:string; }
type TransactionalEmailTemplate = "email_verification"|"account_security"|"data_export"|"account_deletion"|"payment_receipt";
const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_TOKEN_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const TRANSACTIONAL_TOPIC_CODES = new Set<EmailTopicCode>(["email_verification", "account_security", "account_deletion", "data_export", "payment_receipt"]);

export class SandboxEmailProvider implements EmailProvider {
  readonly sent: EmailProviderRequest[] = [];
  networkSendCount = 0;

  async send(request: EmailProviderRequest): Promise<EmailProviderResult> {
    this.sent.push(structuredClone(request));
    return { providerMessageId: `sandbox_${this.sent.length}` };
  }

  async verifyWebhook(): Promise<boolean> {
    return true;
  }

  async normalizeWebhook(body: unknown): Promise<EmailWebhookEvent[]> {
    return normalizeEmailProviderWebhook(body);
  }
}

export class HttpEmailProvider implements EmailProvider {
  constructor(private readonly config:{ endpoint:string; apiKey:string; fetcher?:typeof fetch }) {}

  async send(request: EmailProviderRequest): Promise<EmailProviderResult> {
    const fetcher = this.config.fetcher ?? fetch;
    const response = await fetcher(this.config.endpoint, {
      method: "POST",
      headers: { "authorization": `Bearer ${this.config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`Email provider failed with status ${response.status}.`);
    return { providerMessageId: response.headers.get("x-provider-message-id") ?? undefined };
  }
}

export class EmailGateway {
  readonly channel = "email" as const;

  constructor(private readonly config:{ provider:EmailProvider; fromEmail:string; sandboxMode:boolean; auditHashSecret:string; auditLogs?:EmailAuditLogEntry[] }) {
    if (!config.auditHashSecret.trim()) throw new Error("EMAIL_AUDIT_HASH_SECRET is required.");
  }

  async send(channelAccount:EmailChannelAccount, message:EmailMessage):Promise<EmailDeliveryResult> {
    if (!channelAccount.verified && message.topicCode !== "email_verification") return this.block("blocked", "email_not_verified", channelAccount, message);
    if (channelAccount.bounced) return this.block("bounced", "email_bounced", channelAccount, message);
    if (channelAccount.complained) return this.block("complained", "email_complained", channelAccount, message);
    const isTransactional = TRANSACTIONAL_TOPIC_CODES.has(message.topicCode);
    if (channelAccount.unsubscribed && !isTransactional) return this.block("unsubscribed", "email_unsubscribed", channelAccount, message);

    if (this.config.sandboxMode) {
      const providerMessageId = `sandbox_${Date.now()}`;
      this.audit("email_delivery_sent", channelAccount, message, providerMessageId);
      return { status: "sent", providerMessageId, raw: { sandbox: true, delivery: "mock" } };
    }

    try {
      const response = await this.config.provider.send({
        to: channelAccount.email,
        from: this.config.fromEmail,
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: { "x-topic-code": message.topicCode, "x-transactional": String(isTransactional) },
      });
      this.audit("email_delivery_sent", channelAccount, message, response.providerMessageId);
      return { status: "sent", providerMessageId: response.providerMessageId };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "provider_send_failed";
      this.audit("email_delivery_failed", channelAccount, message, undefined, "email_provider_failed");
      return { status: "failed", errorCode: "email_provider_failed", raw: { message: messageText } };
    }
  }

  async verifyWebhook(headers:Headers, body:string):Promise<boolean> {
    return this.config.provider.verifyWebhook?.(headers, body) ?? false;
  }

  async normalizeInboundEvent(body:unknown):Promise<EmailWebhookEvent[]> {
    return this.config.provider.normalizeWebhook?.(body) ?? normalizeEmailProviderWebhook(body);
  }

  private block(status:EmailDeliveryStatus, errorCode:string, account:EmailChannelAccount, message:EmailMessage):EmailDeliveryResult {
    this.audit("email_delivery_suppressed", account, message, undefined, errorCode);
    return { status, errorCode };
  }

  private audit(action:string, account:EmailChannelAccount, message:EmailMessage, providerMessageId?:string, errorCode?:string):void {
    this.config.auditLogs?.push({
      action,
      targetId: stableEmailTarget(account.email, this.config.auditHashSecret),
      createdAt: new Date().toISOString(),
      metadata: sanitizeEmailLogMetadata({ topicCode: message.topicCode, transactional: String(message.transactional), providerMessageId: providerMessageId ?? "", errorCode: errorCode ?? "", email: account.email, subject: message.subject }),
    });
  }
}

export function createEmailChannelAccount(input:{ userId:string; email:string; now?:Date }):EmailChannelAccount {
  return { userId: input.userId, email: input.email.trim().toLowerCase(), verified:false, unsubscribed:false, bounced:false, complained:false, updatedAt:(input.now??new Date("2026-05-03T10:00:00.000Z")).toISOString() };
}

export function createEmailVerificationToken(account:EmailChannelAccount, secret:string):string {
  const issuedAt = new Date().toISOString();
  const payload = Buffer.from(JSON.stringify({ userId: account.userId, email: account.email, issuedAt }), "utf8").toString("base64url");
  const signature = hmac(payload, secret);
  account.verificationTokenHash = hmac(`${payload}.${signature}`, secret);
  return `${payload}.${signature}`;
}

export function verifyEmailToken(account:EmailChannelAccount, token:string, secret:string, now=new Date()):boolean {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const [payload, signature] = parts;
  if (!constantTimeEqual(signature, hmac(payload, secret))) return false;
  if (account.verificationTokenHash !== hmac(token, secret)) return false;
  let parsed:{ userId:string; email:string; issuedAt:string };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId:string; email:string; issuedAt:string };
  } catch {
    return false;
  }
  if (typeof parsed.issuedAt !== "string") return false;
  const issuedAtMs = Date.parse(parsed.issuedAt);
  if (!Number.isFinite(issuedAtMs)) return false;
  const nowMs = now.getTime();
  if (issuedAtMs > nowMs + EMAIL_VERIFICATION_TOKEN_MAX_FUTURE_SKEW_MS) return false;
  if (nowMs - issuedAtMs > EMAIL_VERIFICATION_TOKEN_TTL_MS) return false;
  if (parsed.userId !== account.userId || parsed.email !== account.email) return false;
  account.verified = true;
  account.verifiedAt = now.toISOString();
  account.updatedAt = now.toISOString();
  return true;
}

export function markEmailUnsubscribed(account:EmailChannelAccount, now=new Date("2026-05-03T10:03:00.000Z")):void { account.unsubscribed=true; account.updatedAt=now.toISOString(); }
export function applyEmailWebhookEvent(account:EmailChannelAccount, event:EmailWebhookEvent, now=new Date("2026-05-03T10:04:00.000Z")):void { if(event.type==="bounce") account.bounced=true; if(event.type==="complaint") account.complained=true; if(event.type==="unsubscribe") account.unsubscribed=true; account.updatedAt=now.toISOString(); }

export function normalizeEmailProviderWebhook(body:unknown):EmailWebhookEvent[] {
  if (!body || typeof body !== "object") return [];
  const event = body as { type?:unknown; email?:unknown; providerMessageId?:unknown; reason?:unknown };
  if (event.type !== "bounce" && event.type !== "complaint" && event.type !== "unsubscribe") return [];
  if (typeof event.email !== "string") return [];
  return [{ type:event.type, email:event.email.toLowerCase(), providerMessageId:typeof event.providerMessageId==="string"?event.providerMessageId:undefined, reason:typeof event.reason==="string"?event.reason:undefined }];
}

export function renderTransactionalEmailTemplate(template:TransactionalEmailTemplate, input:{ actionUrl?:string; receiptId?:string } = {}):EmailMessage {
  const templates: Record<TransactionalEmailTemplate,{subject:string;text:string}> = {
    email_verification: { subject:"Verify your email", text:`Use this link to verify your email: ${input.actionUrl ?? "[verification-link]"}` },
    account_security: { subject:"Account security notice", text:"A security-related account action was recorded." },
    data_export: { subject:"Your data export is ready", text:"Your requested data export is ready to view." },
    account_deletion: { subject:"Account deletion request received", text:"We received your account deletion request." },
    payment_receipt: { subject:"Payment receipt", text:`Payment receipt placeholder${input.receiptId ? ` ${input.receiptId}` : ""}.` },
  };
  const rendered = templates[template];
  return { topicCode: template, subject: rendered.subject, text: rendered.text, html:`<p>${escapeHtml(rendered.text)}</p>`, transactional:true };
}

export function sanitizeEmailLogMetadata(metadata:Record<string,string>):Record<string,string> {
  const blocked = new Set(["email","to","from","subject","body","html","text","apiKey","authorization","secret","token"]);
  return Object.fromEntries(Object.entries(metadata).filter(([key,value]) => !blocked.has(key) && !value.includes("@") && !value.toLowerCase().includes("secret")));
}

function stableEmailTarget(email:string, secret:string):string { return `email_${hmac(email.toLowerCase(), secret).slice(0, 16)}`; }
function hmac(value:string, secret:string):string { return createHmac("sha256", secret).update(value).digest("base64url"); }
function constantTimeEqual(a:string,b:string):boolean { const left=Buffer.from(a); const right=Buffer.from(b); return left.length===right.length && timingSafeEqual(left,right); }
function escapeHtml(value:string):string { return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }
