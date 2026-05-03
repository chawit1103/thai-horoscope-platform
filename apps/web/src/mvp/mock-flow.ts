import { createHash } from "node:crypto";

export type PeriodType = "daily" | "weekly" | "monthly" | "yearly";
export type PlanCode = "free" | "basic" | "premium";
export type HoroscopeStatus = "draft" | "approved" | "rejected" | "queued" | "sent";
export type DeliveryStatus = "queued" | "sent" | "failed";

export interface BirthProfileInput {
  birthDate: string;
  birthTime?: string;
  birthTimeUnknown: boolean;
  birthPlaceText: string;
  timezone: string;
  consentBirthData: boolean;
}

export interface BirthProfile extends BirthProfileInput {
  id: string;
  userId: string;
  createdAt: string;
}

export interface ChartSnapshot {
  id: string;
  userId: string;
  birthProfileId: string;
  calculation_profile_code: "TH_MOCK_MVP_V1";
  engine: "mock";
  engine_version: "0.1.0";
  ephemeris_source: "mock";
  datetime_utc: string;
  julian_day_ut: number;
  planets: Record<string, { sign_index: number; longitude_deg: number; retrograde: boolean }>;
  houses: { system: "mock_whole_sign"; ascendant_deg: number | null; cusps_deg: number[] };
  aspects: Array<{ planet_a: string; planet_b: string; type: string; orb_deg: number }>;
  warnings: string[];
  calculation_hash: string;
}

export interface HoroscopeResult {
  id: string;
  userId: string;
  periodType: PeriodType;
  periodKey: string;
  chartSnapshotId: string;
  status: HoroscopeStatus;
  rule_hits_json: Array<{ rule_id: string; category: string; weight: number; source_hash: string }>;
  content_json: {
    title: string;
    summary: string;
    sections: Array<{ heading: string; body: string }>;
    disclaimer: string;
  };
  approvedAt?: string;
  approvedBy?: string;
}

export interface OutboundMessage {
  id: string;
  userId: string;
  horoscopeResultId: string;
  topicCode: string;
  channel: "mock";
  title: string;
  body: string;
  status: "queued" | "sent";
  createdAt: string;
}

export interface DeliveryAttempt {
  id: string;
  outboundMessageId: string;
  gateway: "mock";
  status: DeliveryStatus;
  attemptedAt: string;
  providerMessageId?: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  action: "birth_profile_saved" | "chart_snapshot_stored" | "horoscope_generated" | "draft_approved" | "outbound_queued" | "delivery_attempt_recorded";
  targetId: string;
  createdAt: string;
  metadata: Record<string, string>;
}

export interface MockMvpState {
  currentUserId: string;
  userPlans: Record<string, PlanCode>;
  birthProfiles: BirthProfile[];
  chartSnapshots: ChartSnapshot[];
  horoscopeResults: HoroscopeResult[];
  outboundMessages: OutboundMessage[];
  deliveryAttempts: DeliveryAttempt[];
  auditLogs: AuditLogEntry[];
}

const disclaimer =
  "เนื้อหานี้จัดทำเพื่อความบันเทิงและการทบทวนตนเองเท่านั้น ไม่ใช่คำแนะนำทางการแพทย์ การเงิน กฎหมาย หรือการตัดสินใจที่มีความเสี่ยงสูง";

const entitlements: Record<PlanCode, PeriodType[]> = {
  free: ["daily"],
  basic: ["daily", "weekly"],
  premium: ["daily", "weekly", "monthly", "yearly"],
};

let state: MockMvpState = createInitialState();

export function setMockCurrentUser(userId: string): void {
  const normalized = userId.trim();
  if (!normalized) throw new Error("Mock user id is required.");
  state.currentUserId = normalized;
  if (!state.userPlans[normalized]) state.userPlans[normalized] = "premium";
}

export function setMockUserPlan(userId: string, planCode: PlanCode): void {
  setMockCurrentUser(userId);
  state.userPlans[userId] = planCode;
}

export function resetMockMvpState(planCode: PlanCode = "premium"): void {
  state = createInitialState(planCode);
}

export function getMockMvpState(): MockMvpState {
  return structuredClone(state) as MockMvpState;
}

export function canViewPeriod(planCode: PlanCode, periodType: PeriodType): boolean {
  return entitlements[planCode].includes(periodType);
}

export function saveBirthProfile(input: BirthProfileInput, now = new Date("2026-05-03T09:00:00.000Z")): BirthProfile {
  validateBirthProfile(input);

  const profile: BirthProfile = {
    ...input,
    id: `birth_${state.birthProfiles.length + 1}`,
    userId: state.currentUserId,
    birthPlaceText: input.birthPlaceText.trim(),
    timezone: input.timezone.trim(),
    createdAt: now.toISOString(),
  };

  state.birthProfiles.push(profile);
  writeAudit("system", "birth_profile_saved", profile.id, now, { userId: profile.userId });
  return profile;
}

export function callMockAstroCalc(profile: BirthProfile): ChartSnapshot {
  const hashInput = [
    profile.birthDate,
    profile.birthTimeUnknown ? "unknown" : profile.birthTime ?? "",
    profile.birthPlaceText,
    profile.timezone,
    "TH_MOCK_MVP_V1",
  ].join("|");
  const calculationHash = sha256(hashInput);
  const seed = Number.parseInt(calculationHash.slice(0, 8), 16);

  return {
    id: `chart_${calculationHash.slice(0, 12)}`,
    userId: profile.userId,
    birthProfileId: profile.id,
    calculation_profile_code: "TH_MOCK_MVP_V1",
    engine: "mock",
    engine_version: "0.1.0",
    ephemeris_source: "mock",
    datetime_utc: `${profile.birthDate}T00:00:00.000Z`,
    julian_day_ut: 2461163.5,
    planets: {
      sun: mockPlanet(seed, 0),
      moon: mockPlanet(seed, 1),
      mercury: mockPlanet(seed, 2),
      venus: mockPlanet(seed, 3),
      mars: mockPlanet(seed, 4),
    },
    houses: {
      system: "mock_whole_sign",
      ascendant_deg: profile.birthTimeUnknown ? null : (seed % 36000) / 100,
      cusps_deg: profile.birthTimeUnknown ? [] : Array.from({ length: 12 }, (_, index) => ((seed + index * 3000) % 36000) / 100),
    },
    aspects: [
      { planet_a: "moon", planet_b: "venus", type: "trine", orb_deg: 2.5 },
      { planet_a: "mars", planet_b: "mercury", type: "square", orb_deg: 3.1 },
    ],
    warnings: profile.birthTimeUnknown ? ["UNKNOWN_BIRTH_TIME"] : [],
    calculation_hash: calculationHash,
  };
}

export function storeChartSnapshot(snapshot: ChartSnapshot, now = new Date("2026-05-03T09:01:00.000Z")): ChartSnapshot {
  const existing = state.chartSnapshots.find((candidate) => candidate.calculation_hash === snapshot.calculation_hash);

  if (existing) {
    return existing;
  }

  state.chartSnapshots.push(snapshot);
  writeAudit("system", "chart_snapshot_stored", snapshot.id, now, { calculationHash: snapshot.calculation_hash });
  return snapshot;
}

export function generateHoroscopeResult(input: {
  chartSnapshot: ChartSnapshot;
  periodType: PeriodType;
  periodKey: string;
  now?: Date;
}): HoroscopeResult {
  const existing = state.horoscopeResults.find(
    (result) =>
      result.userId === input.chartSnapshot.userId &&
      result.chartSnapshotId === input.chartSnapshot.id &&
      result.periodType === input.periodType &&
      result.periodKey === input.periodKey,
  );

  if (existing) {
    return existing;
  }

  const now = input.now ?? new Date("2026-05-03T09:02:00.000Z");
  const ruleHits = createRuleHits(input.chartSnapshot, input.periodType);
  const result: HoroscopeResult = {
    id: `horo_${input.chartSnapshot.userId}_${input.periodType}_${input.periodKey.replace(/[^a-zA-Z0-9]/g, "_")}`,
    userId: input.chartSnapshot.userId,
    periodType: input.periodType,
    periodKey: input.periodKey,
    chartSnapshotId: input.chartSnapshot.id,
    status: "draft",
    rule_hits_json: ruleHits,
    content_json: renderSafeThaiContent(input.periodType, input.periodKey, ruleHits),
  };

  state.horoscopeResults.push(result);
  writeAudit("system", "horoscope_generated", result.id, now, { periodType: input.periodType });
  return result;
}

export function getEntitledHoroscope(periodType: PeriodType): HoroscopeResult | undefined {
  const planCode = state.userPlans[state.currentUserId] ?? "free";
  if (!canViewPeriod(planCode, periodType)) {
    return undefined;
  }

  return state.horoscopeResults.find((result) => result.userId === state.currentUserId && result.periodType === periodType);
}

export function approveDraft(resultId: string, actorId = "dev_admin_mock", now = new Date("2026-05-03T09:03:00.000Z")): HoroscopeResult {
  const result = requireHoroscopeResult(resultId);
  result.status = "approved";
  result.approvedAt = now.toISOString();
  result.approvedBy = actorId;
  writeAudit(actorId, "draft_approved", result.id, now, { periodType: result.periodType });
  return result;
}

export function queueMockOutboundMessage(resultId: string, now = new Date("2026-05-03T09:04:00.000Z")): OutboundMessage {
  const result = requireHoroscopeResult(resultId);

  if (result.status !== "approved") {
    throw new Error("Only approved horoscope results can be queued.");
  }

  const topicCode = `${result.periodType}_horoscope`;
  const idempotencyKey = `${result.id}:${result.userId}:${topicCode}:${result.periodKey}`;
  const existing = state.outboundMessages.find((candidate) =>
    `${candidate.horoscopeResultId}:${candidate.userId}:${candidate.topicCode}:${requireHoroscopeResult(candidate.horoscopeResultId).periodKey}` === idempotencyKey &&
    (candidate.status === "queued" || candidate.status === "sent"),
  );

  if (existing) {
    return existing;
  }

  const message: OutboundMessage = {
    id: `out_${state.outboundMessages.length + 1}`,
    userId: result.userId,
    horoscopeResultId: result.id,
    topicCode,
    channel: "mock",
    title: result.content_json.title,
    body: `${result.content_json.summary} เพื่อความบันเทิงและการทบทวนตนเอง`,
    status: "queued",
    createdAt: now.toISOString(),
  };

  state.outboundMessages.push(message);
  writeAudit("system", "outbound_queued", message.id, now, { resultId });
  return message;
}

export function recordMockDeliveryAttempt(messageId: string, now = new Date("2026-05-03T09:05:00.000Z")): DeliveryAttempt {
  const message = state.outboundMessages.find((candidate) => candidate.id === messageId);

  if (!message) {
    throw new Error(`Outbound message not found: ${messageId}`);
  }

  const existing = state.deliveryAttempts.find((attempt) => attempt.outboundMessageId === message.id && attempt.status === "sent");
  if (existing) {
    message.status = "sent";
    return existing;
  }

  message.status = "sent";
  const attempt: DeliveryAttempt = {
    id: `attempt_${state.deliveryAttempts.length + 1}`,
    outboundMessageId: message.id,
    gateway: "mock",
    status: "sent",
    attemptedAt: now.toISOString(),
    providerMessageId: `mock_provider_${message.id}`,
  };

  state.deliveryAttempts.push(attempt);
  writeAudit("system", "delivery_attempt_recorded", attempt.id, now, { messageId });
  return attempt;
}

export function runMockEndToEndFlow(input: BirthProfileInput): {
  birthProfile: BirthProfile;
  chartSnapshot: ChartSnapshot;
  generatedResults: HoroscopeResult[];
  approvedDraft: HoroscopeResult;
  outboundMessage: OutboundMessage;
  deliveryAttempt: DeliveryAttempt;
} {
  const birthProfile = saveBirthProfile(input);
  const chartSnapshot = storeChartSnapshot(callMockAstroCalc(birthProfile));
  const generatedResults = (["daily", "weekly", "monthly", "yearly"] as PeriodType[]).map((periodType) =>
    generateHoroscopeResult({
      chartSnapshot,
      periodType,
      periodKey: getMockPeriodKey(periodType),
    }),
  );
  const approvedDraft = approveDraft(generatedResults[0]?.id ?? "");
  const outboundMessage = queueMockOutboundMessage(approvedDraft.id);
  const deliveryAttempt = recordMockDeliveryAttempt(outboundMessage.id);

  return {
    birthProfile,
    chartSnapshot,
    generatedResults,
    approvedDraft,
    outboundMessage,
    deliveryAttempt,
  };
}

export function bootstrapDemoFlow(): void {
  if (state.birthProfiles.length > 0) {
    return;
  }

  runMockEndToEndFlow({
    birthDate: "1992-08-15",
    birthTime: "07:30",
    birthTimeUnknown: false,
    birthPlaceText: "Bangkok",
    timezone: "Asia/Bangkok",
    consentBirthData: true,
  });
}

export function getMockPeriodKey(periodType: PeriodType): string {
  const keys: Record<PeriodType, string> = {
    daily: "2026-05-03",
    weekly: "2026-W18",
    monthly: "2026-05",
    yearly: "2026",
  };

  return keys[periodType];
}

function createInitialState(planCode: PlanCode = "premium"): MockMvpState {
  return {
    currentUserId: "user_mock_001",
    userPlans: { user_mock_001: planCode },
    birthProfiles: [],
    chartSnapshots: [],
    horoscopeResults: [],
    outboundMessages: [],
    deliveryAttempts: [],
    auditLogs: [],
  };
}

function validateBirthProfile(input: BirthProfileInput): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) {
    throw new Error("Birth date must use YYYY-MM-DD.");
  }

  if (!input.birthTimeUnknown && !/^\d{2}:\d{2}$/.test(input.birthTime ?? "")) {
    throw new Error("Birth time is required unless marked unknown.");
  }

  if (!input.birthPlaceText.trim()) {
    throw new Error("Birth place is required.");
  }

  if (!input.timezone.trim()) {
    throw new Error("Timezone is required.");
  }

  if (!input.consentBirthData) {
    throw new Error("Birth data consent is required.");
  }
}

function mockPlanet(seed: number, offset: number): { sign_index: number; longitude_deg: number; retrograde: boolean } {
  const longitude = ((seed + offset * 4321) % 36000) / 100;

  return {
    sign_index: Math.floor(longitude / 30),
    longitude_deg: longitude,
    retrograde: (seed + offset) % 5 === 0,
  };
}

function createRuleHits(chartSnapshot: ChartSnapshot, periodType: PeriodType): HoroscopeResult["rule_hits_json"] {
  const categories = ["overview", "work_study", "money", "relationship", "wellness", "advice"];
  const base = Number.parseInt(chartSnapshot.calculation_hash.slice(0, 6), 16);

  return categories.map((category, index) => ({
    rule_id: `MOCK_${periodType.toUpperCase()}_${category.toUpperCase()}_${String(index + 1).padStart(3, "0")}`,
    category,
    weight: ((base + index) % 3) + 1,
    source_hash: chartSnapshot.calculation_hash,
  }));
}

function renderSafeThaiContent(
  periodType: PeriodType,
  periodKey: string,
  ruleHits: HoroscopeResult["rule_hits_json"],
): HoroscopeResult["content_json"] {
  const titleMap: Record<PeriodType, string> = {
    daily: "ดวงวันนี้ของคุณ",
    weekly: "ดวงสัปดาห์นี้ของคุณ",
    monthly: "ดวงเดือนนี้ของคุณ",
    yearly: "ดวงปีนี้ของคุณ",
  };
  const sections = [
    { heading: "ภาพรวม", body: "แนวโน้มช่วงนี้เหมาะกับการจัดลำดับความสำคัญและค่อย ๆ ลงมือทำสิ่งที่ดูแลได้จริง" },
    { heading: "งาน/การเรียน", body: "ควรตรวจรายละเอียดและสื่อสารความคาดหวังให้ชัดเจน เพื่อให้การทำงานร่วมกันราบรื่นขึ้น" },
    { heading: "การเงิน", body: "เรื่องเงินควรเน้นการทบทวนรายรับรายจ่ายและตัดสินใจอย่างรอบคอบ" },
    { heading: "ความสัมพันธ์", body: "การฟังอย่างตั้งใจและถามด้วยความอ่อนโยนจะช่วยลดความเข้าใจผิดได้" },
    { heading: "สุขภาวะ", body: "ควรให้ความสำคัญกับการพักผ่อน จังหวะชีวิต และพื้นที่เงียบ ๆ สำหรับตัวเอง" },
    { heading: "คำแนะนำ", body: "ใช้วิจารณญาณ เลือกก้าวเล็ก ๆ ที่ทำได้จริง และกลับมาทบทวนความรู้สึกของตัวเอง" },
  ];

  return {
    title: titleMap[periodType],
    summary: `${titleMap[periodType]}สำหรับ ${periodKey} สร้างจาก ${ruleHits.length} mock rule hits`,
    sections,
    disclaimer,
  };
}

function requireHoroscopeResult(resultId: string): HoroscopeResult {
  const result = state.horoscopeResults.find((candidate) => candidate.id === resultId);

  if (!result) {
    throw new Error(`Horoscope result not found: ${resultId}`);
  }

  return result;
}

function writeAudit(
  actorId: string,
  action: AuditLogEntry["action"],
  targetId: string,
  now: Date,
  metadata: Record<string, string>,
): void {
  state.auditLogs.push({
    id: `audit_${state.auditLogs.length + 1}`,
    actorId,
    action,
    targetId,
    createdAt: now.toISOString(),
    metadata,
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
