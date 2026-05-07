import { type EmailMessage } from "./email-gateway";
import { evaluateHoroscopeContentSafety, generateHoroscopeContent, validateHoroscopeContentOutput, type HoroscopeContentOutput, type HoroscopeContentPeriod, type HoroscopeRuleHit, type StructuredChartSnapshot } from "./horoscope-content-engine";
import { type LineMessage } from "./line-gateway";

export type HoroscopeDeliveryTopic = "daily_horoscope"|"weekly_horoscope"|"monthly_horoscope"|"yearly_horoscope";

export interface HoroscopeDeliveryPayload {
  content:HoroscopeContentOutput;
  title:string;
  previewText:string;
  emailText:string;
  emailHtml:string;
  metadata:Record<string,string>;
}

export interface HoroscopeDeliveryInput {
  topicCode:HoroscopeDeliveryTopic;
  periodType:HoroscopeContentPeriod;
  periodKey:string;
  chartSnapshot:StructuredChartSnapshot;
  contentProfileCode?:string;
  generatedAt?:Date;
}

const PERIOD_TITLE:Record<HoroscopeContentPeriod,string> = {
  daily: "ดวงวันนี้ของคุณ",
  weekly: "ดวงสัปดาห์นี้ของคุณ",
  monthly: "ดวงเดือนนี้ของคุณ",
  yearly: "ดวงปีนี้ของคุณ",
};
const SHORT_DISCLAIMER = "เพื่อความบันเทิงและการทบทวนตนเอง";
const LONG_DISCLAIMER = "เนื้อหานี้จัดทำเพื่อความบันเทิงและการทบทวนตนเองเท่านั้น ไม่ใช่คำแนะนำทางการแพทย์ การเงิน กฎหมาย หรือการตัดสินใจที่มีความเสี่ยงสูง";

export function generateHoroscopeDeliveryPayload(input:HoroscopeDeliveryInput):HoroscopeDeliveryPayload {
  const content = generateHoroscopeContent({
    periodType: input.periodType,
    periodKey: input.periodKey,
    chartSnapshot: input.chartSnapshot,
    contentProfileCode: input.contentProfileCode,
    generatedAt: input.generatedAt,
  });
  return buildHoroscopeDeliveryPayload(input.topicCode, content);
}

export function buildHoroscopeDeliveryPayload(topicCode:HoroscopeDeliveryTopic, content:HoroscopeContentOutput):HoroscopeDeliveryPayload {
  assertSafeHoroscopeDeliveryContent(content);
  const title = PERIOD_TITLE[content.period_type];
  const previewText = compactLines([
    content.overview,
    content.advice,
    warningPreview(content),
    SHORT_DISCLAIMER,
  ]);
  const emailText = compactLines([
    title,
    "",
    `ภาพรวม: ${content.overview}`,
    `งาน: ${content.work}`,
    `การเงิน: ${content.money}`,
    `ความสัมพันธ์: ${content.relationship}`,
    `สุขภาวะ: ${content.wellness}`,
    `คำแนะนำ: ${content.advice}`,
    `ข้อควรระวัง: ${content.caution}`,
    content.lucky_window ? `ช่วงที่เหมาะกับการทบทวน: ${content.lucky_window}` : "",
    content.reflection_question ? `คำถามชวนทบทวน: ${content.reflection_question}` : "",
    warningPreview(content),
    LONG_DISCLAIMER,
  ]);
  return {
    content,
    title,
    previewText,
    emailText,
    emailHtml: renderEmailHtml(title, content),
    metadata: buildDeliveryMetadata(topicCode, content),
  };
}

export function horoscopeContentToEmailMessage(input:{ topicCode:HoroscopeDeliveryTopic; content:HoroscopeContentOutput; idempotencyKey:string; metadata?:Record<string,string> }):EmailMessage {
  const payload = buildHoroscopeDeliveryPayload(input.topicCode, input.content);
  return {
    topicCode: input.topicCode,
    subject: payload.title,
    text: payload.emailText,
    html: payload.emailHtml,
    transactional: false,
    idempotencyKey: input.idempotencyKey,
    metadata: { ...payload.metadata, ...(input.metadata ?? {}), idempotencyKey: input.idempotencyKey },
  };
}

export function horoscopeContentToLineMessage(input:{ topicCode:HoroscopeDeliveryTopic; content:HoroscopeContentOutput; metadata?:Record<string,string> }):LineMessage {
  const payload = buildHoroscopeDeliveryPayload(input.topicCode, input.content);
  return {
    topicCode: input.topicCode,
    title: payload.title,
    body: payload.previewText,
    periodKey: input.content.period_key,
    ctaUrl: "https://example.test/horoscope",
    metadata: { ...payload.metadata, ...(input.metadata ?? {}) },
  };
}

export function assertSafeHoroscopeDeliveryContent(content:HoroscopeContentOutput):void {
  const validation = validateHoroscopeContentOutput(content);
  if (!validation.ok) throw new Error(`Unsafe horoscope delivery content: ${validation.errors.join(",")}`);
  const finalSafety = evaluateHoroscopeContentSafety(deliveryTextFields(content));
  if (!finalSafety.safe || content.safety_flags.length > 0) {
    throw new Error(`Unsafe horoscope delivery content: ${[...content.safety_flags, ...finalSafety.flags].join(",")}`);
  }
}

function buildDeliveryMetadata(topicCode:HoroscopeDeliveryTopic, content:HoroscopeContentOutput):Record<string,string> {
  return sanitizeDeliveryMetadata({
    topicCode,
    periodType: content.period_type,
    periodKey: content.period_key,
    contentProfileCode: content.content_profile_code,
    calculationHash: content.calculation_hash,
    chartSnapshotId: content.source_chart_snapshot_id ?? "",
    contentHash: content.content_hash,
    safetyFlags: content.safety_flags.join(","),
    ruleHitIds: ruleHitIds(content.rule_hits),
    warningCodes: content.warnings.map((warning)=>warning.code).join(","),
  });
}

function renderEmailHtml(title:string, content:HoroscopeContentOutput):string {
  const warning = warningPreview(content);
  const rows = [
    ["ภาพรวม", content.overview],
    ["งาน", content.work],
    ["การเงิน", content.money],
    ["ความสัมพันธ์", content.relationship],
    ["สุขภาวะ", content.wellness],
    ["คำแนะนำ", content.advice],
    ["ข้อควรระวัง", content.caution],
    ...(content.lucky_window ? [["ช่วงที่เหมาะกับการทบทวน", content.lucky_window]] : []),
    ...(content.reflection_question ? [["คำถามชวนทบทวน", content.reflection_question]] : []),
  ];
  return [
    `<h1>${escapeHtml(title)}</h1>`,
    ...rows.map(([heading, body])=>`<h2>${escapeHtml(heading)}</h2><p>${escapeHtml(body)}</p>`),
    ...(warning ? [`<p>${escapeHtml(warning)}</p>`] : []),
    `<p>${escapeHtml(LONG_DISCLAIMER)}</p>`,
  ].join("");
}

function deliveryTextFields(content:HoroscopeContentOutput):string[] {
  return [
    content.overview,
    content.work,
    content.money,
    content.relationship,
    content.wellness,
    content.advice,
    content.caution,
    content.lucky_window ?? "",
    content.reflection_question ?? "",
  ];
}

function warningPreview(content:HoroscopeContentOutput):string {
  return content.warnings.some((warning)=>warning.code === "CONTENT_CONFIDENCE_LOWERED_UNKNOWN_BIRTH_TIME")
    ? "หมายเหตุ: คำอ่านนี้ใช้ถ้อยคำแบบแนวโน้มกว้าง ๆ เพราะเวลาเกิดไม่ชัดเจน"
    : "";
}

function compactLines(lines:string[]):string {
  return lines.map((line)=>line.trim()).filter(Boolean).join("\n");
}

function ruleHitIds(ruleHits:HoroscopeRuleHit[]):string {
  return ruleHits.map((hit)=>hit.rule_id).slice(0, 12).join(",");
}

function sanitizeDeliveryMetadata(metadata:Record<string,string>):Record<string,string> {
  return Object.fromEntries(Object.entries(metadata).filter(([key,value])=>!isSensitiveMetadataKey(key)&&!isSensitiveMetadataValue(value)));
}

function isSensitiveMetadataKey(key:string):boolean {
  const normalized = key.toLowerCase();
  return ["email","lineuserid","userid","birthdate","birthtime","birthplace","location","secret","token","authorization","raw","payload","card"].some((blocked)=>normalized.includes(blocked));
}

function isSensitiveMetadataValue(value:string):boolean {
  const normalized = value.toLowerCase();
  return value.includes("@") || /\bU[A-Za-z0-9]{8,}\b/.test(value) || normalized.includes("secret") || normalized.includes("bearer ") || normalized.includes("token");
}

function escapeHtml(value:string):string {
  return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}
