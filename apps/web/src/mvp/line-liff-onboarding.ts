export interface LineWebFormEnv {
  LINE_LIFF_URL?:string;
  LINE_LIFF_ID?:string;
  NEXT_PUBLIC_APP_BASE_URL?:string;
}

export type LineWebFormPath = "/line/onboarding" | "/line/profile" | "/line/settings";

export function lineWebFormUrl(input:{ env?:LineWebFormEnv; path:LineWebFormPath; fallbackBaseUrl?:string }):string {
  const liffUrl = normalizeBase(input.env?.LINE_LIFF_URL);
  if (liffUrl) return lineLiffAppUrl(liffUrl, input.path);
  const configured = normalizeBase(input.env?.NEXT_PUBLIC_APP_BASE_URL) ?? normalizeBase(input.fallbackBaseUrl) ?? "https://example.test";
  const url = new URL(input.path, configured);
  if (input.env?.LINE_LIFF_ID?.trim() && !input.env.LINE_LIFF_URL?.trim()) {
    url.searchParams.set("liff", "optional");
  }
  return url.toString();
}

export function safeLineReturnPath(value:unknown):"/line/onboarding/saved"|undefined {
  const path = String(value ?? "").trim();
  return path === "/line/onboarding/saved" ? path : undefined;
}

function normalizeBase(value:string|undefined):string|null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function lineLiffAppUrl(configured:string, path:LineWebFormPath):string {
  const url = new URL(configured);
  url.search = "";
  url.hash = "";
  url.searchParams.set("line_route", path);
  return url.toString();
}
