/**
 * ============================================================
 * COUNTR VOICE NORMALIZER
 * Cleans Hindi / Hinglish / English voice transcripts.
 * This module does NOT decide the user's intent.
 * ============================================================
 */

import { parseIndianNumber, extractQuantityAndUnit, extractWalaPrice, extractMoneyAmount } from "./IndianNumberParser";

const WORD_REPLACEMENTS = Object.freeze({
  k: "ke", me: "mein", mai: "mein", m: "mein", ki: "ki", ko: "ko",
  kr: "kar", krna: "karna", krdo: "kar do", krde: "kar de", krdiya: "kar diya", krdi: "kar di", kro: "karo",
  bnao: "banao", bna: "bana", bh: "bhi", dalo: "daalo", dal: "daal", dedo: "de do", lelo: "le lo", chaiye: "chahiye",
  udhar: "udhaar", khata: "khata", hisab: "hisaab", hisaab: "hisaab", jma: "jama", payment: "payment", paisa: "paisa", paise: "paise",
  stok: "stock", stock: "stock", inventory: "inventory", qty: "quantity", quantityy: "quantity"
});

function cleanText(text) { return (text == null || typeof text !== "string") ? "" : text.toString().toLowerCase().replace(/[,\u0964\u0965!?;:]+/g, " ").replace(/\s+/g, " ").trim(); }
function normalizeWords(text) { return !text ? "" : text.split(" ").map(word => WORD_REPLACEMENTS[word] || word).join(" "); }

export function normalizeCountrVoiceText(text) {
  if (!text || typeof text !== "string") return "";
  let normalized = cleanText(text); normalized = normalizeWords(normalized); return normalized.replace(/\s+/g, " ").trim();
}

export function normalizeCountrVoiceInput(text) {
  const original = typeof text === "string" ? text.trim() : "";
  const normalized = normalizeCountrVoiceText(text);
  return { original_text: original, normalized_text: normalized };
}

export function analyzeCountrNumbers(text) {
  const normalized = normalizeCountrVoiceText(text);
  return { raw: text || "", normalized_text: normalized, number: parseIndianNumber(normalized), quantity: extractQuantityAndUnit(normalized), wala_price: extractWalaPrice(normalized), money_amount: extractMoneyAmount(normalized) };
}

export { parseIndianNumber, extractQuantityAndUnit, extractWalaPrice, extractMoneyAmount };