import { lineWebFormUrl, type LineWebFormEnv } from "./line-liff-onboarding";

export type LineRichMenuActionKey =
  | "today"
  | "weekly"
  | "monthly"
  | "onboarding"
  | "notification_settings"
  | "subscription";

export type LineRichMenuIntent =
  | "today"
  | "weekly"
  | "monthly"
  | "onboarding"
  | "notification_settings"
  | "subscription";

export interface LineRichMenuAction {
  key:LineRichMenuActionKey;
  label:string;
  intent:LineRichMenuIntent;
  type:"message"|"uri";
  text?:string;
  uri?:string;
  route?:"/line/onboarding"|"/line/settings"|"/subscribe";
}

export interface LineRichMenuTemplate {
  name:string;
  chatBarText:string;
  selected:boolean;
  size:{ width:number; height:number };
  uploadMode:"manual_operator_controlled";
  actions:LineRichMenuAction[];
  lineApiConfig:LineRichMenuApiTemplate;
}

export interface LineRichMenuApiTemplate {
  size:{ width:number; height:number };
  selected:boolean;
  name:string;
  chatBarText:string;
  areas:Array<{
    bounds:{ x:number; y:number; width:number; height:number };
    action:{ type:"message"; text:string }|{ type:"uri"; uri:string };
  }>;
}

const RICH_MENU_SIZE = { width:2500, height:1686 } as const;
const RICH_MENU_CELL = { width:833, height:843 } as const;

export const LINE_RICH_MENU_ACTIONS:ReadonlyArray<Omit<LineRichMenuAction, "uri">> = [
  { key:"today", label:"ดวงวันนี้", intent:"today", type:"message", text:"ดวงวันนี้" },
  { key:"weekly", label:"ดวงสัปดาห์", intent:"weekly", type:"message", text:"ดวงสัปดาห์" },
  { key:"monthly", label:"ดวงเดือน", intent:"monthly", type:"message", text:"ดวงเดือน" },
  { key:"onboarding", label:"กรอกข้อมูลเกิด", intent:"onboarding", type:"uri", route:"/line/onboarding" },
  { key:"notification_settings", label:"ตั้งค่าแจ้งเตือน", intent:"notification_settings", type:"uri", route:"/line/settings" },
  { key:"subscription", label:"บัญชี / แพ็กเกจ", intent:"subscription", type:"message", text:"แพ็กเกจของฉัน" },
];

export function buildLineRichMenuTemplate(baseUrl = "https://example.test", env?:LineWebFormEnv):LineRichMenuTemplate {
  const safeBase = safeAppBaseUrl(baseUrl);
  const actions = LINE_RICH_MENU_ACTIONS.map((action)=>richMenuActionWithUrl(action, safeBase, env));
  return {
    name:"Thai Horoscope Beta LINE Rich Menu",
    chatBarText:"เมนูดูดวง",
    selected:true,
    size:{ ...RICH_MENU_SIZE },
    uploadMode:"manual_operator_controlled",
    actions,
    lineApiConfig:{
      size:{ ...RICH_MENU_SIZE },
      selected:true,
      name:"Thai Horoscope Beta LINE Rich Menu",
      chatBarText:"เมนูดูดวง",
      areas:actions.map((action, index)=>({
        bounds:richMenuBounds(index),
        action:lineApiAction(action),
      })),
    },
  };
}

export function assertRichMenuHasNoSecrets(template:LineRichMenuTemplate):true {
  const serialized = JSON.stringify(template);
  if (/LINE_CHANNEL_ACCESS_TOKEN|LINE_CHANNEL_SECRET|channelAccessToken|channelSecret|Bearer\s+[A-Za-z0-9._-]+/i.test(serialized)) {
    throw new Error("LINE_RICH_MENU_SECRET_LEAK");
  }
  if (/U[0-9a-f]{8,}|lineUserId|payment_|webhook|birthProfileId/i.test(serialized)) {
    throw new Error("LINE_RICH_MENU_IDENTIFIER_LEAK");
  }
  return true;
}

function richMenuActionWithUrl(action:Omit<LineRichMenuAction, "uri">, fallbackBaseUrl:string, env?:LineWebFormEnv):LineRichMenuAction {
  if (action.route === "/line/onboarding" || action.route === "/line/settings") {
    return {
      ...action,
      uri:lineWebFormUrl({ env, path:action.route, fallbackBaseUrl }),
    };
  }
  if (action.route === "/subscribe") {
    return {
      ...action,
      uri:urlFor(fallbackBaseUrl, action.route),
    };
  }
  return { ...action };
}

function richMenuBounds(index:number):{ x:number; y:number; width:number; height:number } {
  const column = index % 3;
  const row = Math.floor(index / 3);
  const isLastColumn = column === 2;
  const isLastRow = row === 1;
  return {
    x:column * RICH_MENU_CELL.width,
    y:row * RICH_MENU_CELL.height,
    width:isLastColumn ? RICH_MENU_SIZE.width - column * RICH_MENU_CELL.width : RICH_MENU_CELL.width,
    height:isLastRow ? RICH_MENU_SIZE.height - row * RICH_MENU_CELL.height : RICH_MENU_CELL.height,
  };
}

function lineApiAction(action:LineRichMenuAction):LineRichMenuApiTemplate["areas"][number]["action"] {
  if (action.type === "message" && action.text) return { type:"message", text:action.text };
  if (action.type === "uri" && action.uri) return { type:"uri", uri:action.uri };
  throw new Error("LINE_RICH_MENU_INVALID_ACTION");
}

function safeAppBaseUrl(value:string):string {
  try {
    const url = new URL(value);
    if (url.username || url.password) return "https://example.test";
    if (url.protocol === "https:") return url.toString();
    if (url.protocol === "http:" && isLocalHost(url.hostname)) return url.toString();
  } catch {
    return "https://example.test";
  }
  return "https://example.test";
}

function urlFor(baseUrl:string, path:string):string {
  return new URL(path, baseUrl).toString();
}

function isLocalHost(hostname:string):boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}
