/**
 * ============================================================
 * COUNTR VOICE NORMALIZER
 * ============================================================
 *
 * Cleans Hindi / Hinglish / English voice transcripts.
 *
 * This module does NOT decide the user's intent.
 *
 * It prepares the command for:
 *
 *   LocalVoiceParser
 *        OR
 *   Gemini
 *
 * Number understanding is handled by:
 *
 *   IndianNumberParser.js
 *
 * ============================================================
 */

import {
  parseIndianNumber,
  extractQuantityAndUnit,
  extractWalaPrice,
  extractMoneyAmount,
} from "./IndianNumberParser";


/* ============================================================
 * COMMON SPEECH NORMALIZATION
 * ============================================================
 *
 * IMPORTANT:
 *
 * We only normalize common filler / speech variations.
 *
 * We DO NOT convert Hindi number words here.
 *
 * Example:
 *
 *   "paanch sau"
 *
 * stays:
 *
 *   "paanch sau"
 *
 * because IndianNumberParser must interpret it as:
 *
 *   500
 *
 * ============================================================
 */

const WORD_REPLACEMENTS = Object.freeze({

  /* ----------------------------------------------------------
   * Hindi postpositions
   * ---------------------------------------------------------- */

  k: "ke",
  me: "mein",
  mai: "mein",
  m: "mein",

  ki: "ki",
  ko: "ko",


  /* ----------------------------------------------------------
   * Common speech shortcuts
   * ---------------------------------------------------------- */

  kr: "kar",
  krna: "karna",

  krdo: "kar do",
  krde: "kar de",

  krdiya: "kar diya",
  krdi: "kar di",

  kro: "karo",


  /* ----------------------------------------------------------
   * Create / add
   * ---------------------------------------------------------- */

  bnao: "banao",
  bna: "bana",

  bh: "bhi",


  /* ----------------------------------------------------------
   * Add / put / deposit
   * ---------------------------------------------------------- */

  dalo: "daalo",
  dal: "daal",

  dedo: "de do",


  /* ----------------------------------------------------------
   * Take
   * ---------------------------------------------------------- */

  lelo: "le lo",


  /* ----------------------------------------------------------
   * Need
   * ---------------------------------------------------------- */

  chaiye: "chahiye",


  /* ----------------------------------------------------------
   * Khata / credit
   * ---------------------------------------------------------- */

  udhar: "udhaar",

  khata: "khata",

  hisab: "hisaab",

  hisaab: "hisaab",


  /* ----------------------------------------------------------
   * Payments
   * ---------------------------------------------------------- */

  jma: "jama",

  payment: "payment",

  paisa: "paisa",

  paise: "paise",


  /* ----------------------------------------------------------
   * Inventory
   * ---------------------------------------------------------- */

  stok: "stock",

  stock: "stock",

  inventory: "inventory",


  /* ----------------------------------------------------------
   * Quantity
   * ---------------------------------------------------------- */

  qty: "quantity",

  quantityy: "quantity",

});


/* ============================================================
 * CLEAN TEXT
 * ============================================================
 */

function cleanText(text) {

  if (
    text == null ||
    typeof text !== "string"
  ) {
    return "";
  }


  return text
    .toString()
    .toLowerCase()

    /*
     * Remove common punctuation.
     *
     * Decimal points are intentionally preserved.
     */
    .replace(/[,\u0964\u0965!?;:]+/g, " ")

    /*
     * Normalize whitespace.
     */
    .replace(/\s+/g, " ")

    .trim();
}


/* ============================================================
 * NORMALIZE WORDS
 * ============================================================
 *
 * Only replaces known speech shortcuts.
 *
 * Product names and customer names are otherwise preserved.
 *
 * ============================================================
 */

function normalizeWords(text) {

  if (!text) {
    return "";
  }


  return text
    .split(" ")
    .map(word => {

      return (
        WORD_REPLACEMENTS[word] ||
        word
      );

    })
    .join(" ");
}


/* ============================================================
 * MAIN TEXT NORMALIZER
 * ============================================================
 */

export function normalizeCountrVoiceText(text) {

  if (
    !text ||
    typeof text !== "string"
  ) {
    return "";
  }


  let normalized =
    cleanText(text);


  normalized =
    normalizeWords(
      normalized
    );


  return normalized
    .replace(/\s+/g, " ")
    .trim();
}


/* ============================================================
 * COMPLETE COUNTR VOICE INPUT
 * ============================================================
 *
 * Example:
 *
 * INPUT:
 *
 *   "Rahul k khate me paanch sau dalo"
 *
 * OUTPUT:
 *
 * {
 *   original_text:
 *     "Rahul k khate me paanch sau dalo",
 *
 *   normalized_text:
 *     "rahul ke khate mein paanch sau daalo"
 * }
 *
 * IMPORTANT:
 *
 * "paanch sau" is NOT converted here.
 *
 * IndianNumberParser will later determine:
 *
 *   paanch sau = 500
 *
 * ============================================================
 */

export function normalizeCountrVoiceInput(text) {

  const original =
    typeof text === "string"
      ? text.trim()
      : "";


  const normalized =
    normalizeCountrVoiceText(
      text
    );


  return {

    original_text:
      original,

    normalized_text:
      normalized,

  };
}


/* ============================================================
 * NUMERICAL ANALYSIS
 * ============================================================
 *
 * This helper gives other AI modules a single place to obtain
 * numerical information from the voice command.
 *
 * Example:
 *
 * "10 wala Kurkure"
 *
 * =>
 *
 * {
 *   number: null,
 *   quantity: null,
 *   wala_price: 10,
 *   money_amount: null
 * }
 *
 *
 * "2 kg sugar"
 *
 * =>
 *
 * {
 *   number: null,
 *   quantity: {
 *      quantity: 2,
 *      unit: "KG"
 *   }
 * }
 *
 * ============================================================
 */

export function analyzeCountrNumbers(text) {

  const normalized =
    normalizeCountrVoiceText(
      text
    );


  return {

    raw:
      text || "",

    normalized_text:
      normalized,

    /*
     * Useful when the caller has a standalone
     * number expression.
     */
    number:
      parseIndianNumber(
        normalized
      ),

    /*
     * Quantity + unit.
     */
    quantity:
      extractQuantityAndUnit(
        normalized
      ),

    /*
     * "10 wala Kurkure"
     */
    wala_price:
      extractWalaPrice(
        normalized
      ),

    /*
     * ₹500 / 500 rupaye /
     * paanch sau rupaye
     */
    money_amount:
      extractMoneyAmount(
        normalized
      ),

  };
}


/* ============================================================
 * RE-EXPORT NUMBER ENGINE
 * ============================================================
 *
 * This allows existing Countr modules to import these helpers
 * from CountrNormalizer without changing architecture later.
 * ============================================================
 */

export {

  parseIndianNumber,

  extractQuantityAndUnit,

  extractWalaPrice,

  extractMoneyAmount,

};