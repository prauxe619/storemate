/**
 * ============================================================
 * COUNTR - INDIAN NUMBER / QUANTITY PARSER
 * Convert Indian English / Hindi / Hinglish expressions into reliable numeric values.
 * ============================================================
 */

const BASIC_NUMBERS = Object.freeze({ zero: 0, shunya: 0, shoonya: 0, ek: 1, eka: 1, one: 1, do: 2, doh: 2, two: 2, teen: 3, tin: 3, three: 3, char: 4, chaar: 4, four: 4, paanch: 5, panch: 5, panj: 5, five: 5, che: 6, chhe: 6, chhah: 6, six: 6, saat: 7, sat: 7, seven: 7, aath: 8, ath: 8, eight: 8, nau: 9, nao: 9, no: 9, nine: 9, das: 10, dus: 10, dasa: 10, ten: 10, gyarah: 11, gyaarah: 11, gyara: 11, eleven: 11, barah: 12, bara: 12, baarah: 12, twelve: 12, terah: 13, tera: 13, thirteen: 13, chaudah: 14, chaudha: 14, fourteen: 14, pandrah: 15, pandra: 15, fifteen: 15, solah: 16, sola: 16, sixteen: 16, satrah: 17, satra: 17, seventeen: 17, atharah: 18, athara: 18, eighteen: 18, unnis: 19, unnees: 19, unnIs: 19, nineteen: 19, bees: 20, bis: 20, twenty: 20, ikkis: 21, ikkIs: 21, bais: 22, baais: 22, teis: 23, teiis: 23, chaubis: 24, chaubees: 24, pachis: 25, pachees: 25, chabbis: 26, chhabis: 26, sattais: 27, athais: 28, athaais: 28, untees: 29, unattis: 29, tees: 30, tis: 30, thirty: 30, chaalis: 40, chalis: 40, forty: 40, pachaas: 50, pachas: 50, fifty: 50, saath: 60, saatth: 60, sixty: 60, sattar: 70, sathtar: 70, seventy: 70, assi: 80, asi: 80, eighty: 80, nabbe: 90, nabbey: 90, ninety: 90, sau: 100, so: 100, shau: 100, soh: 100, hundred: 100, hazaar: 1000, hajar: 1000, hazar: 1000, hajaar: 1000, thousand: 1000, lakh: 100000, lac: 100000, lakhs: 100000, crore: 10000000, crores: 10000000 });
const FRACTIONS = Object.freeze({ aadha: 0.5, adha: 0.5, aadhi: 0.5, adhi: 0.5, half: 0.5, pauna: 0.75, pona: 0.75, paune: 0.75, pone: 0.75, sawa: 1.25, sava: 1.25, dedh: 1.5, dedha: 1.5, derh: 1.5, dhai: 2.5, dhaai: 2.5, dhayi: 2.5 });
const UNIT_ALIASES = Object.freeze({ mg: "MG", milligram: "MG", milligrams: "MG", milli: "MG", g: "G", gm: "G", gms: "G", gram: "G", grams: "G", grm: "G", gramme: "G", grammes: "G", kg: "KG", kgs: "KG", kilo: "KG", kilos: "KG", kilogram: "KG", kilograms: "KG", q: "QUINTAL", quintal: "QUINTAL", quintals: "QUINTAL", ton: "TON", tons: "TON", tonne: "TON", tonnes: "TON", mt: "TON", metricton: "TON", metrictons: "TON", ml: "ML", milliliter: "ML", milliliters: "ML", millilitre: "ML", millilitres: "ML", l: "L", lt: "L", liter: "L", liters: "L", litre: "L", litres: "L", pcs: "PCS", pc: "PCS", piece: "PCS", pieces: "PCS", item: "PCS", items: "PCS", piecee: "PCS", packet: "PACKET", packets: "PACKET", pkt: "PACKET", pkts: "PACKET", pack: "PACK", packs: "PACK", box: "BOX", boxes: "BOX", bottle: "BOTTLE", bottles: "BOTTLE", pouch: "POUCH", pouches: "POUCH", bag: "BAG", bags: "BAG", sack: "BAG", sacks: "BAG", carton: "CARTON", cartons: "CARTON", crate: "CRATE", crates: "CRATE", jar: "JAR", jars: "JAR", tin: "TIN", tins: "TIN", can: "CAN", cans: "CAN", roll: "ROLL", rolls: "ROLL", strip: "STRIP", strips: "STRIP", dozen: "DOZEN", dozens: "DOZEN", pair: "PAIR", pairs: "PAIR" });

function cleanNumberText(value) { return value == null ? "" : String(value).toLowerCase().trim().replace(/[₹,]/g, "").replace(/\brs\.\b/g, " ").replace(/\brs\b/g, " ").replace(/\brupees?\b/g, " ").replace(/\brupaye?\b/g, " ").replace(/\brupay\b/g, " ").replace(/\brupiya\b/g, " ").replace(/\brupai\b/g, " ").replace(/\s+/g, " ").trim(); }
function separateNumberAndUnit(text) { return String(text || "").replace(/(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilos|g|gm|gms|gram|grams|mg|ml|l|lt|liter|litre|pcs|pc|piece|pieces|packet|packets|pkt|pack|box|bottle|bag|pouch|carton|quintal|quintals|ton|tons|tonne|tonnes)\b/gi, "$1 $2"); }
function isNumericToken(token) { return /^\d+(?:\.\d+)?$/.test(String(token || "").trim()); }

function numericValue(token) {
  if (token == null) return null; const clean = String(token).trim().toLowerCase();
  if (isNumericToken(clean)) return Number(clean);
  if (Object.prototype.hasOwnProperty.call(BASIC_NUMBERS, clean)) return BASIC_NUMBERS[clean];
  if (Object.prototype.hasOwnProperty.call(FRACTIONS, clean)) return FRACTIONS[clean]; return null;
}

function parseJoinedNumber(input) {
  if (!input) return null; const text = String(input).toLowerCase().trim();
  if (Object.prototype.hasOwnProperty.call(BASIC_NUMBERS, text)) return BASIC_NUMBERS[text];
  const hundredMatch = text.match(/^(.+?)(sau|so)$/); if (hundredMatch) { const value = numericValue(hundredMatch[1]); if (value != null && value !== 100) return value * 100; }
  const thousandMatch = text.match(/^(.+?)(hazaar|hajar|hazar)$/); if (thousandMatch) { const value = numericValue(thousandMatch[1]); if (value != null && value !== 1000) return value * 1000; } return null;
}

export function parseIndianNumber(input) {
  if (input == null) return null; let text = cleanNumberText(input); if (!text) return null;
  text = separateNumberAndUnit(text).trim(); if (isNumericToken(text)) return Number(text);
  if (Object.prototype.hasOwnProperty.call(FRACTIONS, text)) return FRACTIONS[text];
  
  const fractionMultiplierMatch = text.match(/^(dedh|derh|dedha|dhai|dhaai|dhayi|sawa|sava|aadha|adha|aadhi|adhi|pauna|pona|paune|pone)\s+(sau|so|hundred|hazaar|hajar|hazar|thousand|lakh|lac|crore|crores)$/i);
  if (fractionMultiplierMatch) { const fraction = FRACTIONS[fractionMultiplierMatch[1]], multiplier = BASIC_NUMBERS[fractionMultiplierMatch[2]]; if (fraction != null && multiplier != null) return fraction * multiplier; }
  
  const decimalMatch = text.match(/^(\d+)\s*(?:point|dot)\s*(\d+)$/); if (decimalMatch) return Number(`${decimalMatch[1]}.${decimalMatch[2]}`);
  const joined = parseJoinedNumber(text); if (joined != null) return joined;
  
  const tokens = text.split(/\s+/).filter(Boolean); if (!tokens.length) return null; if (tokens.length === 1) return numericValue(tokens[0]);
  
  let total = 0, current = 0, foundNumber = false;
  for (const token of tokens) {
    const value = numericValue(token); if (value == null) continue; foundNumber = true;
    if (value === 100) { if (current === 0) current = 1; current *= 100; continue; }
    if (value === 1000) { if (current === 0) current = 1; total += current * 1000; current = 0; continue; }
    if (value === 100000) { if (current === 0) current = 1; total += current * 100000; current = 0; continue; }
    if (value === 10000000) { if (current === 0) current = 1; total += current * 10000000; current = 0; continue; }
    current += value;
  }
  return !foundNumber ? null : total + current;
}

export function parseFractionalQuantity(input) {
  if (input == null) return null; const text = cleanNumberText(input); if (!text) return null;
  const tokens = text.split(/\s+/);
  if (tokens.length === 1) { const fraction = FRACTIONS[tokens[0]]; if (fraction != null) return { quantity: fraction, unit: null, raw: input }; }
  if (tokens.length >= 2) { const fraction = FRACTIONS[tokens[0]], unit = UNIT_ALIASES[tokens[1]]; if (fraction != null && unit) return { quantity: fraction, unit, raw: input }; } return null;
}

export function normalizeIndianUnit(unit) { if (unit == null) return null; const normalized = String(unit).toLowerCase().trim(); return UNIT_ALIASES[normalized] || normalized.toUpperCase(); }

export function extractQuantityAndUnit(text) {
  if (!text || typeof text !== "string") return null; const normalized = cleanNumberText(text);
  const fractional = parseFractionalQuantity(normalized); if (fractional) return fractional;
  const separated = separateNumberAndUnit(normalized);
  const match = separated.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilos|g|gm|gms|gram|grams|mg|ml|l|lt|liter|litre|liters|litres|pcs|pc|piece|pieces|packet|packets|pkt|pkts|pack|packs|box|boxes|bottle|bottles|bag|bags|pouch|pouches|carton|cartons|quintal|quintals|ton|tons|tonne|tonnes|dozen|pair|pairs)\b/i);
  if (match) return { quantity: Number(match[1]), unit: normalizeIndianUnit(match[2]), raw: match[0].trim() };
  
  const tokens = separated.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const possibleUnit = normalizeIndianUnit(tokens[i]); if (!possibleUnit || !UNIT_ALIASES[String(tokens[i]).toLowerCase()]) continue;
    for (let start = Math.max(0, i - 5); start < i; start++) { const numberText = tokens.slice(start, i).join(" "), number = parseIndianNumber(numberText); if (number != null) return { quantity: number, unit: possibleUnit, raw: `${numberText} ${tokens[i]}` }; }
  } return null;
}

export function extractWalaPrice(text) {
  if (!text || typeof text !== "string") return null; const normalized = cleanNumberText(text), tokens = normalized.split(/\s+/);
  const numericMatch = normalized.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(?:wala|wale|waala|waale)\b/); if (numericMatch) return Number(numericMatch[1]);
  for (let i = 0; i < tokens.length; i++) { if (["wala", "wale", "waala", "waale"].includes(tokens[i])) { for (let count = 5; count >= 1; count--) { const start = i - count; if (start < 0) continue; const numberText = tokens.slice(start, i).join(" "), value = parseIndianNumber(numberText); if (value != null) return value; } } }
  const kaNumericMatch = normalized.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*ka\b/); if (kaNumericMatch) return Number(kaNumericMatch[1]);
  for (let i = 0; i < tokens.length; i++) { if (tokens[i] !== "ka") continue; for (let count = 5; count >= 1; count--) { const start = i - count; if (start < 0) continue; const numberText = tokens.slice(start, i).join(" "), value = parseIndianNumber(numberText); if (value != null) return value; } } return null;
}

export function extractMoneyAmount(text) {
  if (!text || typeof text !== "string") return null; const raw = String(text).toLowerCase().trim();
  const symbolMatch = raw.match(/₹\s*(\d+(?:\.\d+)?)/); if (symbolMatch) return Number(symbolMatch[1]);
  const numericMoneyMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:rs|rupees?|rupaye?|rupay|rupiya|rupai)\b/i); if (numericMoneyMatch) return Number(numericMoneyMatch[1]);
  const moneyText = raw.replace(/[₹,\u0964\u0965!?;:]+/g, " ").replace(/\s+/g, " ").trim(), tokens = moneyText.split(/\s+/).filter(Boolean);
  const moneyWords = ["rupee", "rupees", "rupaye", "rupay", "rupiya", "rupai", "rs"], moneyIndexes = [];
  tokens.forEach((token, index) => { if (moneyWords.includes(token)) moneyIndexes.push(index); });
  if (!moneyIndexes.length) return null;
  const moneyIndex = moneyIndexes[moneyIndexes.length - 1], beforeMoney = tokens.slice(0, moneyIndex);
  for (let count = 6; count >= 1; count--) { const start = beforeMoney.length - count; if (start < 0) continue; const numberText = beforeMoney.slice(start).join(" "), parsed = parseIndianNumber(numberText); if (parsed != null) return parsed; }
  let bestParsedValue = null, bestTokenCount = 0;
  for (let start = 0; start < moneyIndex; start++) { for (let end = moneyIndex; end > start; end--) { const numberText = tokens.slice(start, end).join(" "), parsed = parseIndianNumber(numberText); if (parsed != null && end - start > bestTokenCount) { bestParsedValue = parsed; bestTokenCount = end - start; } } }
  return bestParsedValue != null ? bestParsedValue : null;
}

export function parseQuantityExpression(text) { return { raw: text, quantity: extractQuantityAndUnit(text), wala_price: extractWalaPrice(text), money_amount: extractMoneyAmount(text) }; }
export default { parseIndianNumber, parseFractionalQuantity, normalizeIndianUnit, extractQuantityAndUnit, extractWalaPrice, extractMoneyAmount, parseQuantityExpression };