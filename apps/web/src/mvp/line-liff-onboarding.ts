export interface LineWebFormEnv {
  LINE_LIFF_URL?:string;
  LINE_LIFF_ID?:string;
  NEXT_PUBLIC_APP_BASE_URL?:string;
}

export type LineWebFormPath = "/line/onboarding" | "/line/profile" | "/line/settings";

export function lineWebFormUrl(input:{ env?:LineWebFormEnv; path:LineWebFormPath; fallbackBaseUrl?:string }):string {
  const liffUrl = normalizeHttpsBase(input.env?.LINE_LIFF_URL);
  if (liffUrl) return lineLiffAppUrl(liffUrl, input.path);
  const configured = normalizeWebBase(input.env?.NEXT_PUBLIC_APP_BASE_URL) ?? normalizeWebBase(input.fallbackBaseUrl) ?? "https://example.test";
  const url = new URL(input.path, configured);
  if (input.env?.LINE_LIFF_ID?.trim() && !liffUrl) {
    url.searchParams.set("liff", "optional");
  }
  return url.toString();
}

export function safeLineReturnPath(value:unknown):"/line/onboarding/saved"|undefined {
  const path = String(value ?? "").trim();
  return path === "/line/onboarding/saved" ? path : undefined;
}

function normalizeHttpsBase(value:string|undefined):string|null {
  const url = normalizeUrl(value);
  if (!url || url.protocol !== "https:") return null;
  return url.toString();
}

function normalizeWebBase(value:string|undefined):string|null {
  const url = normalizeUrl(value);
  if (!url) return null;
  if (url.protocol === "https:") return url.toString();
  if (url.protocol === "http:" && isLocalHost(url.hostname)) return url.toString();
  return null;
}

function normalizeUrl(value:string|undefined):URL|null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function isLocalHost(hostname:string):boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function lineLiffAppUrl(configured:string, path:LineWebFormPath):string {
  const url = new URL(configured);
  url.search = "";
  url.hash = "";
  url.searchParams.set("line_route", path);
  return url.toString();
}
