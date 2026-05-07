import { createHash } from "node:crypto";

export type HoroscopeContentPeriod = "daily" | "weekly" | "monthly" | "yearly";
export type HoroscopeContentCategory = "overview" | "work" | "money" | "relationship" | "wellness" | "advice" | "caution";
export type HoroscopeSafetyFlag =
  | "medical_claim"
  | "financial_advice"
  | "legal_advice"
  | "death_or_accident_prediction"
  | "guaranteed_outcome"
  | "fear_based_language"
  | "ritual_upsell"
  | "relationship_coercion"
  | "pii_or_secret_leak";

export interface HoroscopeRuleHit {
  rule_id:string;
  trigger:string;
  category:HoroscopeContentCategory;
  weight:number;
  source_points:string[];
}

export interface HoroscopeContentWarning {
  code:string;
  message:string;
}

export interface HoroscopeContentOutput {
  period_type:HoroscopeContentPeriod;
  period_key:string;
  overview:string;
  work:string;
  money:string;
  relationship:string;
  wellness:string;
  advice:string;
  caution:string;
  lucky_window?:string;
  reflection_question?:string;
  rule_hits:HoroscopeRuleHit[];
  safety_flags:HoroscopeSafetyFlag[];
  content_profile_code:string;
  generated_at:string;
  source_chart_snapshot_id?:string;
  calculation_hash:string;
  content_hash:string;
  warnings:HoroscopeContentWarning[];
}

export interface HoroscopeContentInput {
  periodType:HoroscopeContentPeriod;
  periodKey:string;
  chartSnapshot:StructuredChartSnapshot;
  transit?:StructuredTransitComparison | null;
  contentProfileCode?:string;
  generatedAt?:Date;
}

export interface StructuredChartSnapshot {
  id?:string;
  calculation_hash:string;
  calculation_profile_code?:string;
  planets?:Record<string, StructuredPlanetPosition>;
  houses?:{ reliable?:boolean; ascendant_deg?:number|null; cusps_deg?:number[] };
  angles?:{ reliable?:boolean };
  aspects?:StructuredAspect[];
  warnings?:StructuredWarning[];
}

export interface StructuredTransitComparison {
  transit_to_natal_hits?:Array<{
    transit_planet:string;
    natal_point:string;
    aspect_type:string;
    category_hint:string|null;
    weight_hint:number|null;
    interpretation_key:string;
  }>;
}

interface StructuredPlanetPosition {
  sign_index?:number;
  longitude_deg?:number;
  retrograde?:boolean;
  house_number?:number|null;
  warnings?:StructuredWarning[];
}

type StructuredWarning = string | { code?:string; message?:string };

interface StructuredAspect {
  body_a?:string;
  body_b?:string;
  planet_a?:string;
  planet_b?:string;
  type:string;
  orb_deg?:number;
  applying?:boolean|null;
}

const DEFAULT_CONTENT_PROFILE_CODE = "TH_SAFE_REFLECTION_V1";
const PERIOD_LABEL:Record<HoroscopeContentPeriod, string> = {
  daily: "วันนี้",
  weekly: "สัปดาห์นี้",
  monthly: "เดือนนี้",
  yearly: "ปีนี้",
};

const SOFTENED_UNKNOWN_TIME_WARNING:HoroscopeContentWarning = {
  code: "CONTENT_CONFIDENCE_LOWERED_UNKNOWN_BIRTH_TIME",
  message: "คำอ่านนี้ใช้ถ้อยคำแบบกว้างขึ้น เพราะเวลาเกิดไม่ชัดเจน จึงไม่ใช้ลัคนาหรือเรือนชะตาเป็นข้อสรุปหลัก",
};

const UNSAFE_PATTERNS:Array<{ flag:HoroscopeSafetyFlag; pattern:RegExp }> = [
  { flag: "death_or_accident_prediction", pattern: /ตาย|เสียชีวิต|ถึงแก่ชีวิต|อุบัติเหตุ|รถชน|เครื่องบินตก|เภทภัย/u },
  { flag: "medical_claim", pattern: /ป่วยหนัก|โรคร้าย|วินิจฉัย|รักษาโรค|รักษาอาการ|หยุดยา|กินยา|ใช้ยา|แพทย์|หมอ/u },
  { flag: "legal_advice", pattern: /ฟ้อง|คดี|ศาล|ทนาย|กฎหมาย|สัญญานี้ต้อง/u },
  { flag: "financial_advice", pattern: /ซื้อหุ้น|ขายหุ้น|ลงทุนตัวนี้|คริปโต|กองทุนนี้|หวย|ลอตเตอรี่|เลขเด็ด/u },
  { flag: "guaranteed_outcome", pattern: /แน่นอน|รับประกัน|100%|ไม่มีทางพลาด|ต้องรวย|ต้องได้/u },
  { flag: "fear_based_language", pattern: /ถ้าไม่.*จะ|ต้องรีบ|ดวงตกหนัก|เคราะห์หนัก|ชะตาบังคับ/u },
  { flag: "ritual_upsell", pattern: /ทำพิธี|แก้ดวง|บูชา|เครื่องราง|สะเดาะเคราะห์/u },
  { flag: "relationship_coercion", pattern: /ต้องเลิกทันที|เขาจะนอกใจ|มีชู้/u },
  { flag: "pii_or_secret_leak", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|U[0-9a-f]{32}|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}:\d{2}\b|api[_-]?key|secret|token/iu },
];

const TEMPLATES:Record<Exclude<HoroscopeContentCategory, "caution">, string[]> = {
  overview: [
    "ภาพรวม{period}เหมาะกับการตั้งหลักอย่างใจเย็น เลือกเรื่องสำคัญก่อน แล้วค่อยขยับทีละขั้น",
    "{period}มีจังหวะให้ทบทวนทิศทางของตัวเองและจัดพื้นที่ให้สิ่งที่สำคัญจริง ๆ",
    "พลังงาน{period}เหมาะกับการสังเกตตัวเองมากขึ้น ตัดสิ่งรบกวนออก และรักษาจังหวะที่พอดี",
  ],
  work: [
    "เรื่องงานควรเน้นการสื่อสารที่ชัด ตรวจรายละเอียด และเปิดพื้นที่ให้คนรอบตัวเข้าใจเป้าหมายเดียวกัน",
    "งานหรือการเรียนเด่นที่การจัดลำดับความสำคัญ สิ่งที่ค้างอยู่จะเบาขึ้นเมื่อแบ่งเป็นขั้นเล็ก ๆ",
    "เหมาะกับการทบทวนแผนงานเดิม ปรับวิธีคุย และใช้ข้อมูลก่อนตัดสินใจเรื่องสำคัญ",
  ],
  money: [
    "เรื่องเงินควรเน้นความรอบคอบมากกว่าความรีบ จังหวะดีอาจมาจากการวางแผนที่ชัดขึ้น",
    "การเงินเหมาะกับการดูรายรับรายจ่ายและแยกความจำเป็นออกจากความอยากแบบไม่กดดันตัวเอง",
    "ควรให้เวลากับการเปรียบเทียบทางเลือกและกันพื้นที่สำหรับเงินสำรองก่อนตัดสินใจใช้จ่าย",
  ],
  relationship: [
    "ความสัมพันธ์ดีขึ้นได้จากการฟังอย่างตั้งใจและถามอย่างอ่อนโยน โดยไม่รีบสรุปความรู้สึกของอีกฝ่าย",
    "เรื่องความรักและคนใกล้ตัวเหมาะกับการคุยตรง ๆ แบบรักษาน้ำใจ สิ่งที่ค้างใจจะค่อย ๆ ชัดขึ้น",
    "ให้ความสำคัญกับขอบเขตและความสบายใจของทั้งสองฝ่าย บทสนทนาที่นุ่มนวลจะช่วยลดความเข้าใจผิด",
  ],
  wellness: [
    "สุขภาวะควรดูแลด้วยการพักผ่อน จัดจังหวะชีวิต และให้เวลาตัวเองได้เงียบลงบ้าง",
    "เหมาะกับการกลับมาสังเกตร่างกายและอารมณ์ในชีวิตประจำวัน เลือกกิจกรรมเบา ๆ ที่ช่วยเติมพลัง",
    "ควรลดความเร่งในวันที่ทำได้ และให้ความสำคัญกับอาหาร การนอน และพื้นที่ส่วนตัวอย่างพอดี",
  ],
  advice: [
    "คำแนะนำคือใช้วิจารณญาณกับทุกเรื่อง เลือกก้าวเล็กที่ทำได้จริง แล้วกลับมาทบทวนผลลัพธ์อย่างอ่อนโยน",
    "ลองถามตัวเองว่าเรื่องไหนควรทำให้ง่ายขึ้น การลดความซับซ้อนอาจช่วยให้เห็นทางเลือกชัดกว่าเดิม",
    "ให้ความสำคัญกับสิ่งที่ควบคุมได้ก่อน แล้วค่อยเปิดรับโอกาสใหม่เมื่อใจและข้อมูลพร้อมขึ้น",
  ],
};

const REFLECTION_QUESTIONS:Record<HoroscopeContentPeriod, string[]> = {
  daily: ["วันนี้มีเรื่องไหนที่อยากทำให้เรียบง่ายขึ้น?", "วันนี้คุณอยากดูแลพลังใจของตัวเองอย่างไร?"],
  weekly: ["สัปดาห์นี้เรื่องใดควรได้รับพื้นที่และเวลาเพิ่มขึ้น?", "มีขอบเขตไหนที่อยากตั้งให้ชัดขึ้นในสัปดาห์นี้?"],
  monthly: ["เดือนนี้คุณอยากเห็นตัวเองเติบโตในเรื่องใด?", "อะไรคือสิ่งที่ควรปล่อยให้เบาลงในเดือนนี้?"],
  yearly: ["ปีนี้คุณอยากสร้างจังหวะชีวิตแบบไหนให้ยั่งยืนขึ้น?", "บทเรียนใดที่อยากพกไปอย่างนุ่มนวลในปีนี้?"],
};

export function generateHoroscopeContent(input:HoroscopeContentInput):HoroscopeContentOutput {
  const contentProfileCode = normalizeContentProfileCode(input.contentProfileCode);
  const reliableHouses = hasReliableHouses(input.chartSnapshot);
  const inputWarnings = normalizeWarnings(input.chartSnapshot.warnings);
  const warningCodes = new Set(inputWarnings.map((warning) => warning.code));
  const softenedForUnknownTime = !reliableHouses || warningCodes.has("UNKNOWN_BIRTH_TIME") || warningCodes.has("UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE");
  const ruleHits = detectRuleHits(input.chartSnapshot, input.transit ?? null, input.periodType, reliableHouses);
  const generatedAt = (input.generatedAt ?? defaultGeneratedAt(input.periodType, input.periodKey)).toISOString();
  const periodLabel = PERIOD_LABEL[input.periodType];
  const warnings = softenedForUnknownTime ? [...inputWarnings, SOFTENED_UNKNOWN_TIME_WARNING] : inputWarnings;

  const outputWithoutSafety:Omit<HoroscopeContentOutput, "safety_flags"|"content_hash"> = {
    period_type: input.periodType,
    period_key: input.periodKey,
    overview: renderCategory("overview", input.periodType, periodLabel, contentProfileCode, ruleHits, softenedForUnknownTime),
    work: renderCategory("work", input.periodType, periodLabel, contentProfileCode, ruleHits, softenedForUnknownTime),
    money: renderCategory("money", input.periodType, periodLabel, contentProfileCode, ruleHits, softenedForUnknownTime),
    relationship: renderCategory("relationship", input.periodType, periodLabel, contentProfileCode, ruleHits, softenedForUnknownTime),
    wellness: renderCategory("wellness", input.periodType, periodLabel, contentProfileCode, ruleHits, softenedForUnknownTime),
    advice: renderCategory("advice", input.periodType, periodLabel, contentProfileCode, ruleHits, softenedForUnknownTime),
    caution: renderCaution(input.periodType, softenedForUnknownTime),
    lucky_window: renderLuckyWindow(input.periodType, contentProfileCode, input.chartSnapshot.calculation_hash),
    reflection_question: pick(REFLECTION_QUESTIONS[input.periodType], `${contentProfileCode}:${input.periodType}:${input.periodKey}:reflection`),
    rule_hits: ruleHits,
    content_profile_code: contentProfileCode,
    generated_at: generatedAt,
    source_chart_snapshot_id: input.chartSnapshot.id,
    calculation_hash: input.chartSnapshot.calculation_hash,
    warnings,
  };

  const safetyFlags = evaluateHoroscopeContentSafety(textFieldsForSafety(outputWithoutSafety)).flags;
  return {
    ...outputWithoutSafety,
    safety_flags: safetyFlags,
    content_hash: stableHash({ ...outputWithoutSafety, safety_flags: safetyFlags }),
  };
}

export function evaluateHoroscopeContentSafety(text:string|string[]):{ safe:boolean; flags:HoroscopeSafetyFlag[] } {
  const joined = Array.isArray(text) ? text.join("\n") : text;
  const flags = new Set<HoroscopeSafetyFlag>();
  for (const { flag, pattern } of UNSAFE_PATTERNS) {
    if (pattern.test(joined)) flags.add(flag);
  }
  return { safe: flags.size === 0, flags: [...flags].sort() };
}

export function validateHoroscopeContentOutput(output:HoroscopeContentOutput):{ ok:boolean; errors:string[] } {
  const errors:string[] = [];
  const requiredText:HoroscopeContentCategory[] = ["overview", "work", "money", "relationship", "wellness", "advice", "caution"];
  for (const key of requiredText) {
    if (!output[key].trim()) errors.push(`${key}_required`);
  }
  if (!["daily", "weekly", "monthly", "yearly"].includes(output.period_type)) errors.push("period_type_invalid");
  if (!output.period_key.trim()) errors.push("period_key_required");
  if (!output.content_profile_code.trim()) errors.push("content_profile_code_required");
  if (!/^[a-f0-9]{64}$/.test(output.calculation_hash)) errors.push("calculation_hash_invalid");
  if (!/^[a-f0-9]{64}$/.test(output.content_hash)) errors.push("content_hash_invalid");
  if (!Number.isFinite(Date.parse(output.generated_at))) errors.push("generated_at_invalid");
  for (const hit of output.rule_hits) {
    if (!hit.rule_id || !hit.trigger || !hit.category || !Number.isFinite(hit.weight) || hit.source_points.length === 0) {
      errors.push("rule_hit_invalid");
      break;
    }
  }
  const safety = evaluateHoroscopeContentSafety(textFieldsForSafety(output));
  for (const flag of safety.flags) errors.push(`unsafe_${flag}`);
  return { ok: errors.length === 0, errors };
}

function detectRuleHits(chartSnapshot:StructuredChartSnapshot, transit:StructuredTransitComparison|null, periodType:HoroscopeContentPeriod, reliableHouses:boolean):HoroscopeRuleHit[] {
  const hits:HoroscopeRuleHit[] = [];
  const planets = chartSnapshot.planets ?? {};
  const aspects = chartSnapshot.aspects ?? [];
  const prefix = periodType.toUpperCase();

  for (const aspect of aspects) {
    const bodyA = normalizePointName(aspect.body_a ?? aspect.planet_a ?? "");
    const bodyB = normalizePointName(aspect.body_b ?? aspect.planet_b ?? "");
    const pair = [bodyA, bodyB].sort().join(":");
    if (pair === "moon:venus" && ["trine", "sextile", "conjunction"].includes(aspect.type)) {
      hits.push(ruleHit(`NATAL_${prefix}_MOON_VENUS_SUPPORT`, "moon_venus_supportive_aspect", "relationship", 2, [bodyA, bodyB]));
    }
    if (pair === "mars:mercury" && ["square", "opposition"].includes(aspect.type)) {
      hits.push(ruleHit(`NATAL_${prefix}_MARS_MERCURY_REVIEW`, "mars_mercury_tension_aspect", "work", 2, [bodyA, bodyB]));
    }
  }

  if (planets.mercury?.retrograde) {
    hits.push(ruleHit(`NATAL_${prefix}_MERCURY_RETROGRADE_REVIEW`, "mercury_retrograde", "work", 1, ["mercury"]));
  }
  if (typeof planets.moon?.sign_index === "number") {
    hits.push(ruleHit(`NATAL_${prefix}_MOON_REFLECTION_TONE`, `moon_sign_${safeIndex(planets.moon.sign_index)}`, "overview", 1, ["moon"]));
  }
  if (typeof planets.venus?.sign_index === "number") {
    hits.push(ruleHit(`NATAL_${prefix}_VENUS_VALUE_CHECK`, `venus_sign_${safeIndex(planets.venus.sign_index)}`, "money", 1, ["venus"]));
  }

  if (reliableHouses) {
    const houseRules:Array<{ planet:string; house:number; category:HoroscopeContentCategory; rule:string }> = [
      { planet: "sun", house: 10, category: "work", rule: "HOUSE_TEN_VISIBILITY" },
      { planet: "jupiter", house: 2, category: "money", rule: "HOUSE_TWO_PLANNING" },
      { planet: "venus", house: 7, category: "relationship", rule: "HOUSE_SEVEN_RELATING" },
    ];
    for (const houseRule of houseRules) {
      if (planets[houseRule.planet]?.house_number === houseRule.house) {
        hits.push(ruleHit(`NATAL_${prefix}_${houseRule.rule}`, `${houseRule.planet}_house_${houseRule.house}`, houseRule.category, 2, [houseRule.planet, `house_${houseRule.house}`]));
      }
    }
  }

  for (const transitHit of transit?.transit_to_natal_hits ?? []) {
    const category = normalizeCategory(transitHit.category_hint);
    hits.push(ruleHit(
      `TRANSIT_${prefix}_${safeRuleSegment(transitHit.interpretation_key)}`,
      `${normalizePointName(transitHit.transit_planet)}_${transitHit.aspect_type}_${normalizePointName(transitHit.natal_point)}`,
      category,
      clampWeight(transitHit.weight_hint ?? 1),
      [normalizePointName(transitHit.transit_planet), normalizePointName(transitHit.natal_point)],
    ));
  }

  if (hits.length === 0) {
    hits.push(ruleHit(`BASELINE_${prefix}_REFLECTION`, "baseline_safe_reflection", "overview", 1, ["calculation_hash"]));
  }

  return dedupeRuleHits(hits).sort((a, b) => b.weight - a.weight || a.rule_id.localeCompare(b.rule_id));
}

function renderCategory(category:Exclude<HoroscopeContentCategory, "caution">, periodType:HoroscopeContentPeriod, periodLabel:string, contentProfileCode:string, ruleHits:HoroscopeRuleHit[], softened:boolean):string {
  const categoryHits = ruleHits.filter((hit) => hit.category === category);
  const seed = `${contentProfileCode}:${periodType}:${category}:${categoryHits.map((hit) => hit.rule_id).join("|")}`;
  const base = pick(TEMPLATES[category], seed).replaceAll("{period}", periodLabel);
  if (softened && (category === "overview" || category === "advice")) {
    return `${base} ถ้อยคำนี้อ่านแบบแนวโน้มกว้าง ๆ ไม่ใช่ข้อสรุปเฉพาะบุคคล`;
  }
  return base;
}

function renderCaution(periodType:HoroscopeContentPeriod, softened:boolean):string {
  const periodLabel = PERIOD_LABEL[periodType];
  const base = `${periodLabel}ควรหลีกเลี่ยงการตัดสินใจจากอารมณ์ชั่ววูบ และใช้ข้อมูลจริงประกอบเสมอ`;
  if (!softened) return base;
  return `${base} เนื่องจากข้อมูลเวลาเกิดไม่ชัดเจน จึงควรอ่านเป็นแนวทางสะท้อนตัวเองแบบกว้าง`;
}

function renderLuckyWindow(periodType:HoroscopeContentPeriod, contentProfileCode:string, calculationHash:string):string {
  const windows:Record<HoroscopeContentPeriod, string[]> = {
    daily: ["ช่วงสาย", "ช่วงบ่าย", "ช่วงเย็น"],
    weekly: ["ต้นสัปดาห์", "กลางสัปดาห์", "ปลายสัปดาห์"],
    monthly: ["สัปดาห์แรก", "ช่วงกลางเดือน", "ช่วงปลายเดือน"],
    yearly: ["ไตรมาสแรก", "ช่วงกลางปี", "ไตรมาสสุดท้าย"],
  };
  return `${pick(windows[periodType], `${contentProfileCode}:${calculationHash}:${periodType}:window`)} เหมาะกับการทบทวนแผนและจัดลำดับความสำคัญ`;
}

function hasReliableHouses(chartSnapshot:StructuredChartSnapshot):boolean {
  const warningCodes = new Set(normalizeWarnings(chartSnapshot.warnings).map((warning) => warning.code));
  if (warningCodes.has("UNKNOWN_BIRTH_TIME") || warningCodes.has("UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE")) return false;
  if (chartSnapshot.houses?.reliable === false || chartSnapshot.angles?.reliable === false) return false;
  if (chartSnapshot.houses?.reliable === true) return true;
  return chartSnapshot.houses?.ascendant_deg !== null && chartSnapshot.houses?.ascendant_deg !== undefined && (chartSnapshot.houses.cusps_deg?.length ?? 0) >= 12;
}

function normalizeWarnings(warnings:StructuredWarning[]|undefined):HoroscopeContentWarning[] {
  return (warnings ?? []).map((warning) => {
    const code = typeof warning === "string" ? warning : warning.code;
    return {
      code: safeWarningCode(code),
      message: warningMessageForCode(safeWarningCode(code)),
    };
  });
}

function warningMessageForCode(code:string):string {
  if (code === "UNKNOWN_BIRTH_TIME" || code === "UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE") return "ข้อมูลเวลาเกิดไม่ชัดเจน จึงลดความเฉพาะเจาะจงของคำอ่าน";
  if (code === "MISSING_LOCATION") return "ข้อมูลสถานที่ไม่ครบ จึงหลีกเลี่ยงการอ่านที่ต้องพึ่งเรือนชะตา";
  return "มีคำเตือนจากชั้นคำนวณ ระบบจึงใช้ถ้อยคำแบบระมัดระวัง";
}

function ruleHit(rule_id:string, trigger:string, category:HoroscopeContentCategory, weight:number, source_points:string[]):HoroscopeRuleHit {
  return { rule_id, trigger, category, weight: clampWeight(weight), source_points: source_points.map(normalizePointName).filter(Boolean) };
}

function dedupeRuleHits(hits:HoroscopeRuleHit[]):HoroscopeRuleHit[] {
  const byId = new Map<string, HoroscopeRuleHit>();
  for (const hit of hits) {
    if (!byId.has(hit.rule_id)) byId.set(hit.rule_id, hit);
  }
  return [...byId.values()];
}

function normalizeCategory(category:string|null|undefined):HoroscopeContentCategory {
  if (category === "work" || category === "money" || category === "relationship" || category === "wellness" || category === "advice" || category === "caution") return category;
  if (category === "love" || category === "relationships") return "relationship";
  return "overview";
}

function normalizePointName(value:string):string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeContentProfileCode(value:string|undefined):string {
  const candidate = (value ?? DEFAULT_CONTENT_PROFILE_CODE).trim().toUpperCase();
  return /^[A-Z0-9_]{3,64}$/.test(candidate) ? candidate : DEFAULT_CONTENT_PROFILE_CODE;
}

function safeWarningCode(value:string|undefined):string {
  const candidate = (value ?? "UPSTREAM_WARNING").trim().toUpperCase();
  return /^[A-Z0-9_]{3,80}$/.test(candidate) ? candidate : "UPSTREAM_WARNING";
}

function safeRuleSegment(value:string):string {
  const segment = value.toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/^_+|_+$/g, "");
  return segment.slice(0, 80) || "STRUCTURED_SIGNAL";
}

function safeIndex(value:number):number {
  return Math.max(0, Math.min(11, Math.trunc(value)));
}

function clampWeight(value:number):number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(3, Math.trunc(value)));
}

function pick(values:string[], seed:string):string {
  return values[stableInt(seed) % values.length];
}

function stableInt(seed:string):number {
  return Number.parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16);
}

function stableHash(value:unknown):string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function defaultGeneratedAt(periodType:HoroscopeContentPeriod, periodKey:string):Date {
  if (periodType === "daily") {
    const dailyDate = exactUtcDate(periodKey);
    if (dailyDate) return dailyDate;
  }
  if (periodType === "weekly") {
    const isoWeekStart = isoWeekStartDate(periodKey);
    if (isoWeekStart) return isoWeekStart;
  }
  if (periodType === "monthly") {
    const monthlyDate = exactUtcMonth(periodKey);
    if (monthlyDate) return monthlyDate;
  }
  if (periodType === "yearly" && /^\d{4}$/.test(periodKey)) return new Date(`${periodKey}-01-01T00:00:00.000Z`);
  throw new Error(`Invalid period key for ${periodType} horoscope content.`);
}

function exactUtcDate(periodKey:string):Date|null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(periodKey);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function exactUtcMonth(periodKey:string):Date|null {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  if (month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, 1));
}

function isoWeekStartDate(periodKey:string):Date|null {
  const match = /^(\d{4})-W(\d{2})$/.exec(periodKey);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const week = Number.parseInt(match[2], 10);
  if (week < 1 || week > 53) return null;
  const jan4 = Date.UTC(year, 0, 4);
  const jan4Day = new Date(jan4).getUTCDay() || 7;
  const weekOneMonday = jan4 - (jan4Day - 1) * 86_400_000;
  const start = new Date(weekOneMonday + (week - 1) * 7 * 86_400_000);
  const isoYearCheck = new Date(start.getTime() + 3 * 86_400_000).getUTCFullYear();
  if (isoYearCheck !== year) return null;
  return start;
}

function textFieldsForSafety(output:Pick<HoroscopeContentOutput, "overview"|"work"|"money"|"relationship"|"wellness"|"advice"|"caution"|"lucky_window"|"reflection_question">):string[] {
  return [
    output.overview,
    output.work,
    output.money,
    output.relationship,
    output.wellness,
    output.advice,
    output.caution,
    output.lucky_window ?? "",
    output.reflection_question ?? "",
  ];
}
