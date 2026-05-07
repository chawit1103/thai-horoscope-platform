import { createHash } from "node:crypto";
import { generateHoroscopeDeliveryPayload, type HoroscopeDeliveryPayload } from "./horoscope-delivery-integration";
import { getMockMvpState, type HoroscopeResult, type PeriodType } from "./mock-flow";

export type ContentPreviewApprovalStatus = "pending_review"|"approved"|"rejected";
export type ContentPreviewItemStatus = ContentPreviewApprovalStatus|"queued"|"sent"|"suppressed";
export type ContentPreviewTopic = "daily_horoscope"|"weekly_horoscope"|"monthly_horoscope"|"yearly_horoscope";
export type ContentPreviewChannel = "line"|"email";
export type ContentPreviewAuditAction = "admin_content_batch_approved"|"admin_content_batch_rejected";
export const CONTENT_PREVIEW_APPROVAL_SESSION_ID = "__content_preview_approval__";

export interface ContentPreviewRuleHit {
  ruleId:string;
  trigger:string;
  category:string;
  weight:number;
  sourcePoints:string[];
}

export interface ContentPreviewWarning {
  code:string;
  message:string;
}

export interface ContentPreviewSections {
  overview:string;
  work:string;
  money:string;
  relationship:string;
  wellness:string;
  advice:string;
  caution:string;
}

export interface ContentPreviewItem {
  id:string;
  periodType:PeriodType;
  periodKey:string;
  topicCode:ContentPreviewTopic;
  contentProfileCode:string;
  safetyFlags:string[];
  warnings:ContentPreviewWarning[];
  ruleHits:ContentPreviewRuleHit[];
  source:{ calculationHash:string };
  deliveryChannels:ContentPreviewChannel[];
  sections:ContentPreviewSections;
  approvalStatus:ContentPreviewItemStatus;
}

export interface ContentPreviewBatch {
  batchId:string;
  approvalStatus:ContentPreviewApprovalStatus;
  createdAt:string;
  updatedAt:string;
  approvedAt?:string;
  approvedBy?:string;
  rejectedAt?:string;
  rejectedBy?:string;
  items:ContentPreviewItem[];
}

export interface ContentPreviewAuditLogEntry {
  action:ContentPreviewAuditAction;
  targetId:string;
  actorId:string;
  createdAt:string;
  metadata:Record<string,string>;
}

interface InternalContentPreviewBatch extends ContentPreviewBatch {
  sourceResultId:string;
  contentHash:string;
}

interface ContentPreviewApprovalState {
  batches:InternalContentPreviewBatch[];
  auditLogs:ContentPreviewAuditLogEntry[];
}

let registry = new Map<string, ContentPreviewApprovalState>();

export function resetContentPreviewApprovalState():void {
  registry = new Map();
}

export function getContentPreviewApprovalState(sessionId="dev-default"):{ batches:ContentPreviewBatch[]; auditLogs:ContentPreviewAuditLogEntry[] } {
  const state = getState(sessionId);
  return {
    batches: state.batches.map(publicBatch),
    auditLogs: structuredClone(state.auditLogs),
  };
}

export function listContentPreviewBatches(sessionId="dev-default"):ContentPreviewBatch[] {
  return getContentPreviewApprovalState(sessionId).batches;
}

export function getContentPreviewBatch(sessionId:string, batchId:string):ContentPreviewBatch|undefined {
  const batch = getState(sessionId).batches.find((item)=>item.batchId===batchId);
  return batch ? publicBatch(batch) : undefined;
}

export function getContentPreviewApprovalForResult(sessionId:string, sourceResultId:string):{ batchId:string; approvalStatus:ContentPreviewApprovalStatus }|undefined {
  const batch = getState(sessionId).batches.find((item)=>item.sourceResultId===sourceResultId);
  return batch ? { batchId:batch.batchId, approvalStatus:batch.approvalStatus } : undefined;
}

export function ensureContentPreviewBatch(input:{ sessionId?:string; horoscopeResult:HoroscopeResult; topicCode:ContentPreviewTopic; deliveryPayload:HoroscopeDeliveryPayload; deliveryChannels:ContentPreviewChannel[]; now?:Date }):ContentPreviewBatch {
  const sessionId = input.sessionId ?? "dev-default";
  const state = getState(sessionId);
  const batchId = batchIdFor(sessionId, input.horoscopeResult.id);
  const existing = state.batches.find((batch)=>batch.batchId===batchId);
  const nowIso = (input.now ?? new Date()).toISOString();
  const contentHash = input.deliveryPayload.content.content_hash;
  const nextApprovalStatus = existing && existing.contentHash === contentHash ? existing.approvalStatus : "pending_review";
  const item = buildPreviewItem(input.horoscopeResult, input.topicCode, input.deliveryPayload, input.deliveryChannels, nextApprovalStatus);

  if (existing) {
    if (existing.contentHash !== contentHash) {
      existing.approvalStatus = "pending_review";
      existing.approvedAt = undefined;
      existing.approvedBy = undefined;
      existing.rejectedAt = undefined;
      existing.rejectedBy = undefined;
    }
    existing.contentHash = contentHash;
    existing.items = [item];
    existing.updatedAt = nowIso;
    return publicBatch(existing);
  }

  const batch:InternalContentPreviewBatch = {
    batchId,
    sourceResultId: input.horoscopeResult.id,
    contentHash,
    approvalStatus:"pending_review",
    createdAt:nowIso,
    updatedAt:nowIso,
    items:[item],
  };
  state.batches.push(batch);
  return publicBatch(batch);
}

export function ensureContentPreviewBatchesForApprovedResults(input:{ sessionId?:string; approvalSessionId?:string; now?:Date } = {}):ContentPreviewBatch[] {
  const sourceSessionId = input.sessionId ?? "dev-default";
  const approvalSessionId = input.approvalSessionId ?? input.sessionId ?? "dev-default";
  const mockState = getMockMvpState(sourceSessionId);
  const batches:ContentPreviewBatch[] = [];
  const approvalState = getState(approvalSessionId);
  for (const result of mockState.horoscopeResults.filter((item)=>item.status==="approved")) {
    const existing = approvalState.batches.find((batch)=>batch.sourceResultId===result.id);
    if (existing) {
      batches.push(publicBatch(existing));
      continue;
    }
    const chart = mockState.chartSnapshots.find((snapshot)=>snapshot.id===result.chartSnapshotId&&snapshot.userId===result.userId&&snapshot.birthProfileId===result.birthProfileId);
    if (!chart) continue;
    const topicCode = `${result.periodType}_horoscope` as ContentPreviewTopic;
    const payload = generateHoroscopeDeliveryPayload({ topicCode, periodType:result.periodType, periodKey:result.periodKey, chartSnapshot:chart });
    batches.push(ensureContentPreviewBatch({ sessionId:approvalSessionId, horoscopeResult:result, topicCode, deliveryPayload:payload, deliveryChannels:["line", "email"], now:input.now }));
  }
  return batches;
}

export function approveContentPreviewBatch(input:{ sessionId?:string; batchId:string; actorId:string; now?:Date }):ContentPreviewBatch {
  const state = getState(input.sessionId ?? "dev-default");
  const batch = requireBatch(state, input.batchId);
  if (batch.approvalStatus === "rejected") throw new Error("Rejected content batches require regeneration before approval.");
  if (batch.approvalStatus === "approved") return publicBatch(batch);
  const nowIso = (input.now ?? new Date()).toISOString();
  batch.approvalStatus = "approved";
  batch.approvedAt = nowIso;
  batch.approvedBy = input.actorId;
  batch.updatedAt = nowIso;
  batch.items = batch.items.map((item)=>({ ...item, approvalStatus:"approved" }));
  writeAudit(state, "admin_content_batch_approved", batch, input.actorId, nowIso);
  return publicBatch(batch);
}

export function rejectContentPreviewBatch(input:{ sessionId?:string; batchId:string; actorId:string; now?:Date }):ContentPreviewBatch {
  const state = getState(input.sessionId ?? "dev-default");
  const batch = requireBatch(state, input.batchId);
  if (batch.approvalStatus === "approved") throw new Error("Approved content batches cannot be rejected without regeneration.");
  if (batch.approvalStatus === "rejected") return publicBatch(batch);
  const nowIso = (input.now ?? new Date()).toISOString();
  batch.approvalStatus = "rejected";
  batch.rejectedAt = nowIso;
  batch.rejectedBy = input.actorId;
  batch.updatedAt = nowIso;
  batch.items = batch.items.map((item)=>({ ...item, approvalStatus:"rejected" }));
  writeAudit(state, "admin_content_batch_rejected", batch, input.actorId, nowIso);
  return publicBatch(batch);
}

function getState(sessionId:string):ContentPreviewApprovalState {
  const key = sessionId.trim() || "dev-default";
  if (!registry.has(key)) registry.set(key, { batches:[], auditLogs:[] });
  return registry.get(key)!;
}

function requireBatch(state:ContentPreviewApprovalState, batchId:string):InternalContentPreviewBatch {
  const batch = state.batches.find((item)=>item.batchId===batchId);
  if (!batch) throw new Error(`Content preview batch not found: ${batchId}`);
  return batch;
}

function buildPreviewItem(result:HoroscopeResult, topicCode:ContentPreviewTopic, payload:HoroscopeDeliveryPayload, deliveryChannels:ContentPreviewChannel[], approvalStatus:ContentPreviewItemStatus):ContentPreviewItem {
  const content = payload.content;
  return {
    id:`content_item_${stableHash(`${result.id}:${topicCode}`).slice(0,16)}`,
    periodType:content.period_type,
    periodKey:content.period_key,
    topicCode,
    contentProfileCode:content.content_profile_code,
    safetyFlags:[...content.safety_flags],
    warnings:content.warnings.map((warning)=>({ code:warning.code, message:warning.message })),
    ruleHits:content.rule_hits.map((hit)=>({ ruleId:hit.rule_id, trigger:hit.trigger, category:hit.category, weight:hit.weight, sourcePoints:[...hit.source_points] })),
    source:{ calculationHash:content.calculation_hash },
    deliveryChannels:[...new Set(deliveryChannels)].sort(),
    sections:{
      overview:content.overview,
      work:content.work,
      money:content.money,
      relationship:content.relationship,
      wellness:content.wellness,
      advice:content.advice,
      caution:content.caution,
    },
    approvalStatus,
  };
}

function publicBatch(batch:InternalContentPreviewBatch):ContentPreviewBatch {
  const { sourceResultId:_, contentHash:__, ...safe } = batch;
  return structuredClone(safe);
}

function writeAudit(state:ContentPreviewApprovalState, action:ContentPreviewAuditAction, batch:InternalContentPreviewBatch, actorId:string, createdAt:string):void {
  state.auditLogs.push({
    action,
    targetId:batch.batchId,
    actorId,
    createdAt,
    metadata:sanitizeAuditMetadata({
      approvalStatus:batch.approvalStatus,
      itemCount:String(batch.items.length),
      topicCodes:batch.items.map((item)=>item.topicCode).join(","),
      periodKeys:batch.items.map((item)=>item.periodKey).join(","),
      contentProfileCodes:batch.items.map((item)=>item.contentProfileCode).join(","),
    }),
  });
}

function sanitizeAuditMetadata(metadata:Record<string,string>):Record<string,string> {
  return Object.fromEntries(Object.entries(metadata).filter(([key,value])=>!isSensitiveKey(key)&&!isSensitiveValue(value)));
}

function isSensitiveKey(key:string):boolean {
  const normalized = key.toLowerCase();
  return ["email","lineuserid","userid","birth","place","location","secret","token","authorization","raw","payload","content","body","calculationhash","chartsnapshot"].some((blocked)=>normalized.includes(blocked));
}

function isSensitiveValue(value:string):boolean {
  const normalized = value.toLowerCase();
  return value.includes("@") || /\bU[A-Za-z0-9]{8,}\b/.test(value) || normalized.includes("secret") || normalized.includes("bearer ") || normalized.includes("token") || /\b\d{1,2}:\d{2}\b/.test(value);
}

function batchIdFor(sessionId:string, resultId:string):string {
  return `content_batch_${stableHash(`${sessionId}:${resultId}`).slice(0,16)}`;
}

function stableHash(value:string):string {
  return createHash("sha256").update(value).digest("hex");
}
