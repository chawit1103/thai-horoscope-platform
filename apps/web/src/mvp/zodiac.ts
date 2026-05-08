export interface ZodiacSign {
  index:number;
  en:string;
  th:string;
}

export interface ZodiacLayoutSign extends ZodiacSign {
  counterclockwise_order:number;
  math_angle_deg:number;
  screen_x:number;
  screen_y:number;
}

export const CANONICAL_ZODIAC_SIGNS:ZodiacSign[] = [
  { index:0, en:"Aries", th:"เมษ" },
  { index:1, en:"Taurus", th:"พฤษภ" },
  { index:2, en:"Gemini", th:"มิถุน" },
  { index:3, en:"Cancer", th:"กรกฎ" },
  { index:4, en:"Leo", th:"สิงห์" },
  { index:5, en:"Virgo", th:"กันย์" },
  { index:6, en:"Libra", th:"ตุล" },
  { index:7, en:"Scorpio", th:"พิจิก" },
  { index:8, en:"Sagittarius", th:"ธนู" },
  { index:9, en:"Capricorn", th:"มกร" },
  { index:10, en:"Aquarius", th:"กุมภ์" },
  { index:11, en:"Pisces", th:"มีน" },
];

export const THAI_ZODIAC_SIGNS = CANONICAL_ZODIAC_SIGNS.map((sign)=>sign.th);
export const EN_ZODIAC_SIGNS = CANONICAL_ZODIAC_SIGNS.map((sign)=>sign.en);

export function normalizeLongitudeDeg(value:number):number {
  return ((value % 360) + 360) % 360;
}

export function zodiacSignIndex(longitudeDeg:number):number {
  return Math.floor(normalizeLongitudeDeg(longitudeDeg) / 30);
}

export function degreeWithinSign(longitudeDeg:number):number {
  return roundDeg(normalizeLongitudeDeg(longitudeDeg) % 30);
}

export function thaiSignNameFromLongitude(longitudeDeg:number):string {
  return THAI_ZODIAC_SIGNS[zodiacSignIndex(longitudeDeg)] ?? "";
}

export function englishSignNameFromLongitude(longitudeDeg:number):string {
  return EN_ZODIAC_SIGNS[zodiacSignIndex(longitudeDeg)] ?? "";
}

export function buildCounterclockwiseZodiacLayout():ZodiacLayoutSign[] {
  return CANONICAL_ZODIAC_SIGNS.map((sign, index)=>{
    const mathAngleDeg = -90 - index * 30;
    const radians = (mathAngleDeg * Math.PI) / 180;
    return {
      ...sign,
      counterclockwise_order:index,
      math_angle_deg:mathAngleDeg,
      screen_x:roundDeg(Math.cos(radians)),
      screen_y:roundDeg(Math.sin(radians)),
    };
  });
}

function roundDeg(value:number):number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
