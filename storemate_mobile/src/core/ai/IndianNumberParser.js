/**
 * ============================================================
 * COUNTR - INDIAN NUMBER / QUANTITY PARSER
 * ============================================================
 *
 * Purpose:
 *
 * Convert Indian English / Hindi / Hinglish expressions
 * into reliable numeric values.
 *
 * Examples:
 *
 *   "paanch"                    -> 5
 *   "paanch sau"                -> 500
 *   "paanchso"                  -> 500
 *   "do sau pachaas"            -> 250
 *   "ek hazaar"                 -> 1000
 *
 *   "dedh"                      -> 1.5
 *   "dedh sau"                  -> 150
 *   "dhai sau"                  -> 250
 *   "sawa sau"                  -> 125
 *
 *   "aadha kilo"                -> 0.5 KG
 *   "pauna kilo"                -> 0.75 KG
 *   "sawa kilo"                 -> 1.25 KG
 *   "dedh kilo"                 -> 1.5 KG
 *   "dhai kilo"                 -> 2.5 KG
 *
 *   "2.5 kg"                    -> 2.5 KG
 *   "250 gram"                  -> 250 G
 *
 *   "10 wala kurkure"           -> 10
 *   "paanch wala biscuit"       -> 5
 *   "100 wale chawal"            -> 100
 *   "5 ka biscuit"              -> 5
 *
 *   "₹500"                      -> 500
 *   "500 rupees"                -> 500
 *   "paanch sau rupaye"         -> 500
 *
 * IMPORTANT:
 *
 * This parser does NOT decide the intent.
 *
 * It only understands:
 *
 *   - numbers
 *   - quantities
 *   - units
 *   - wala pricing
 *   - money amounts
 *
 * IntentHandler / Gemini / LocalVoiceParser decides
 * what the command actually means.
 * ============================================================
 */


/* ============================================================
 * BASIC NUMBERS
 * ============================================================
 */

const BASIC_NUMBERS = Object.freeze({

  /* ----------------------------------------------------------
   * 0 - 10
   * ----------------------------------------------------------
   */

  zero: 0,
  shunya: 0,
  shoonya: 0,

  ek: 1,
  eka: 1,
  one: 1,

  do: 2,
  doh: 2,
  two: 2,

  teen: 3,
  tin: 3,
  three: 3,

  char: 4,
  chaar: 4,
  four: 4,

  paanch: 5,
  panch: 5,
  panj: 5,
  five: 5,

  che: 6,
  chhe: 6,
  chhah: 6,
  six: 6,

  saat: 7,
  sat: 7,
  seven: 7,

  aath: 8,
  ath: 8,
  eight: 8,

  nau: 9,
  nao: 9,
  no: 9,
  nine: 9,

  das: 10,
  dus: 10,
  dasa: 10,
  ten: 10,


  /* ----------------------------------------------------------
   * 11 - 19
   * ----------------------------------------------------------
   */

  gyarah: 11,
  gyaarah: 11,
  gyara: 11,
  eleven: 11,

  barah: 12,
  bara: 12,
  baarah: 12,
  twelve: 12,

  terah: 13,
  tera: 13,
  thirteen: 13,

  chaudah: 14,
  chaudha: 14,
  fourteen: 14,

  pandrah: 15,
  pandra: 15,
  fifteen: 15,

  solah: 16,
  sola: 16,
  sixteen: 16,

  satrah: 17,
  satra: 17,
  seventeen: 17,

  atharah: 18,
  athara: 18,
  eighteen: 18,

  unnis: 19,
  unnees: 19,
  unnIs: 19,
  nineteen: 19,


  /* ----------------------------------------------------------
   * 20 - 90
   * ----------------------------------------------------------
   */

  bees: 20,
  bis: 20,
  twenty: 20,

  ikkis: 21,
  ikkIs: 21,
  ikkIs: 21,

  bais: 22,
  baais: 22,

  teis: 23,
  teiis: 23,

  chaubis: 24,
  chaubees: 24,

  pachis: 25,
  pachees: 25,

  chabbis: 26,
  chhabis: 26,

  sattais: 27,

  athais: 28,
  athaais: 28,

  untees: 29,
  unattis: 29,

  tees: 30,
  tis: 30,
  thirty: 30,

  chaalis: 40,
  chalis: 40,
  forty: 40,

  pachaas: 50,
  pachas: 50,
  fifty: 50,

  saath: 60,
  saatth: 60,
  sixty: 60,

  sattar: 70,
  sathtar: 70,
  seventy: 70,

  assi: 80,
  asi: 80,
  eighty: 80,

  nabbe: 90,
  nabbey: 90,
  ninety: 90,


  /* ----------------------------------------------------------
   * HUNDREDS
   * ----------------------------------------------------------
   */

  sau: 100,
  so: 100,
  shau: 100,
  soh: 100,
  hundred: 100,


  /* ----------------------------------------------------------
   * THOUSANDS
   * ----------------------------------------------------------
   */

  hazaar: 1000,
  hajar: 1000,
  hazar: 1000,
  hajaar: 1000,
  thousand: 1000,


  /* ----------------------------------------------------------
   * LAKH
   * ----------------------------------------------------------
   */

  lakh: 100000,
  lac: 100000,
  lakhs: 100000,


  /* ----------------------------------------------------------
   * CRORE
   * ----------------------------------------------------------
   */

  crore: 10000000,
  crores: 10000000,

});


/* ============================================================
 * FRACTIONS
 * ============================================================
 */

const FRACTIONS = Object.freeze({

  aadha: 0.5,
  adha: 0.5,
  aadhi: 0.5,
  adhi: 0.5,
  half: 0.5,

  pauna: 0.75,
  pona: 0.75,
  paune: 0.75,
  pone: 0.75,

  sawa: 1.25,
  sava: 1.25,

  dedh: 1.5,
  dedha: 1.5,
  derh: 1.5,

  dhai: 2.5,
  dhaai: 2.5,
  dhayi: 2.5,

});


/* ============================================================
 * UNIT ALIASES
 * ============================================================
 *
 * These are normalized units.
 *
 * Conversion between compatible units will be handled by
 * the next product/unit resolver layer.
 * ============================================================
 */

const UNIT_ALIASES = Object.freeze({

  /* ----------------------------------------------------------
   * WEIGHT
   * ----------------------------------------------------------
   */

  mg: "MG",
  milligram: "MG",
  milligrams: "MG",
  milli: "MG",

  g: "G",
  gm: "G",
  gms: "G",
  gram: "G",
  grams: "G",
  grm: "G",
  gramme: "G",
  grammes: "G",

  kg: "KG",
  kgs: "KG",
  kilo: "KG",
  kilos: "KG",
  kilogram: "KG",
  kilograms: "KG",

  q: "QUINTAL",
  quintal: "QUINTAL",
  quintals: "QUINTAL",

  ton: "TON",
  tons: "TON",
  tonne: "TON",
  tonnes: "TON",
  mt: "TON",
  metricton: "TON",
  metrictons: "TON",


  /* ----------------------------------------------------------
   * VOLUME
   * ----------------------------------------------------------
   */

  ml: "ML",
  milliliter: "ML",
  milliliters: "ML",
  millilitre: "ML",
  millilitres: "ML",

  l: "L",
  lt: "L",
  liter: "L",
  liters: "L",
  litre: "L",
  litres: "L",


  /* ----------------------------------------------------------
   * PIECES
   * ----------------------------------------------------------
   */

  pcs: "PCS",
  pc: "PCS",
  piece: "PCS",
  pieces: "PCS",
  item: "PCS",
  items: "PCS",

  piecee: "PCS",


  /* ----------------------------------------------------------
   * PACKAGING
   * ----------------------------------------------------------
   */

  packet: "PACKET",
  packets: "PACKET",
  pkt: "PACKET",
  pkts: "PACKET",

  pack: "PACK",
  packs: "PACK",

  box: "BOX",
  boxes: "BOX",

  bottle: "BOTTLE",
  bottles: "BOTTLE",

  pouch: "POUCH",
  pouches: "POUCH",

  bag: "BAG",
  bags: "BAG",

  sack: "BAG",
  sacks: "BAG",

  carton: "CARTON",
  cartons: "CARTON",

  crate: "CRATE",
  crates: "CRATE",

  jar: "JAR",
  jars: "JAR",

  tin: "TIN",
  tins: "TIN",

  can: "CAN",
  cans: "CAN",

  roll: "ROLL",
  rolls: "ROLL",

  strip: "STRIP",
  strips: "STRIP",


  /* ----------------------------------------------------------
   * COUNTING
   * ----------------------------------------------------------
   */

  dozen: "DOZEN",
  dozens: "DOZEN",

  pair: "PAIR",
  pairs: "PAIR",

});


/* ============================================================
 * TEXT CLEANING
 * ============================================================
 *
 * IMPORTANT:
 *
 * Do NOT remove "rupaye" here if money extraction needs it.
 *
 * This cleaner is mainly used by number / quantity / wala
 * parsing where money words should not interfere.
 * ============================================================
 */

function cleanNumberText(value) {

  if (value == null) {
    return "";
  }

  return String(value)
    .toLowerCase()
    .trim()

    /* Remove currency symbol and commas */
    .replace(/[₹,]/g, "")

    /* Remove common money words */
    .replace(/\brs\.\b/g, " ")
    .replace(/\brs\b/g, " ")
    .replace(/\brupees?\b/g, " ")
    .replace(/\brupaye?\b/g, " ")
    .replace(/\brupay\b/g, " ")
    .replace(/\brupiya\b/g, " ")
    .replace(/\brupai\b/g, " ")

    /* Normalize whitespace */
    .replace(/\s+/g, " ")

    .trim();
}


/* ============================================================
 * NUMBER + UNIT SEPARATION
 * ============================================================
 *
 * Converts:
 *
 * 5kg      -> 5 kg
 * 250gm    -> 250 gm
 * 2packet  -> 2 packet
 * ============================================================
 */

function separateNumberAndUnit(text) {

  return String(text || "").replace(

    /(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilos|g|gm|gms|gram|grams|mg|ml|l|lt|liter|litre|pcs|pc|piece|pieces|packet|packets|pkt|pack|box|bottle|bag|pouch|carton|quintal|quintals|ton|tons|tonne|tonnes)\b/gi,

    "$1 $2"

  );
}


/* ============================================================
 * NUMERIC CHECK
 * ============================================================
 */

function isNumericToken(token) {

  return /^\d+(?:\.\d+)?$/.test(
    String(token || "").trim()
  );

}


/* ============================================================
 * SINGLE NUMERIC VALUE
 * ============================================================
 */

function numericValue(token) {

  if (token == null) {
    return null;
  }

  const clean =
    String(token)
      .trim()
      .toLowerCase();


  if (isNumericToken(clean)) {

    return Number(clean);

  }


  if (
    Object.prototype.hasOwnProperty.call(
      BASIC_NUMBERS,
      clean
    )
  ) {

    return BASIC_NUMBERS[clean];

  }


  if (
    Object.prototype.hasOwnProperty.call(
      FRACTIONS,
      clean
    )
  ) {

    return FRACTIONS[clean];

  }


  return null;
}


/* ============================================================
 * JOINED INDIAN NUMBER
 * ============================================================
 *
 * Handles speech-to-text variations such as:
 *
 * paanchso
 * paanchsau
 * ekhazaar
 * dohazaar
 *
 * This is deliberately conservative.
 * ============================================================
 */

function parseJoinedNumber(input) {

  if (!input) {
    return null;
  }

  const text =
    String(input)
      .toLowerCase()
      .trim();


  /*
   * Direct known number.
   */

  if (
    Object.prototype.hasOwnProperty.call(
      BASIC_NUMBERS,
      text
    )
  ) {

    return BASIC_NUMBERS[text];

  }


  /*
   * Common joined hundred forms.
   *
   * paanchso
   * paanchsau
   * dusso
   * bees sau-like STT variants
   */

  const hundredMatch =
    text.match(
      /^(.+?)(sau|so)$/
    );


  if (hundredMatch) {

    const prefix =
      hundredMatch[1];


    const value =
      numericValue(prefix);


    if (
      value != null &&
      value !== 100
    ) {

      return value * 100;

    }

  }


  /*
   * Common joined thousand forms.
   */

  const thousandMatch =
    text.match(
      /^(.+?)(hazaar|hajar|hazar)$/
    );


  if (thousandMatch) {

    const prefix =
      thousandMatch[1];


    const value =
      numericValue(prefix);


    if (
      value != null &&
      value !== 1000
    ) {

      return value * 1000;

    }

  }


  return null;
}


/* ============================================================
 * INDIAN NUMBER PARSER
 * ============================================================
 */

export function parseIndianNumber(input) {

  if (input == null) {
    return null;
  }


  let text =
    cleanNumberText(input);


  if (!text) {
    return null;
  }


  /*
   * Separate things like:
   *
   * 500kg
   *
   * before number parsing.
   */

  text =
    separateNumberAndUnit(text)
      .trim();


  /* ==========================================================
   * DIRECT NUMBER
   * ==========================================================
   */

  if (isNumericToken(text)) {

    return Number(text);

  }


  /* ==========================================================
   * SINGLE FRACTION
   *
   * dedh
   * dhai
   * sawa
   * aadha
   * ==========================================================
   */

  if (
    Object.prototype.hasOwnProperty.call(
      FRACTIONS,
      text
    )
  ) {

    return FRACTIONS[text];

  }


  /* ==========================================================
   * FRACTION + MULTIPLIER
   *
   * dedh sau       = 150
   * dhai sau       = 250
   * sawa sau       = 125
   *
   * dedh hazaar    = 1500
   * dhai hazaar    = 2500
   * ==========================================================
   */

  const fractionMultiplierMatch =
    text.match(

      /^(dedh|derh|dedha|dhai|dhaai|dhayi|sawa|sava|aadha|adha|aadhi|adhi|pauna|pona|paune|pone)\s+(sau|so|hundred|hazaar|hajar|hazar|thousand|lakh|lac|crore|crores)$/i

    );


  if (fractionMultiplierMatch) {

    const fractionWord =
      fractionMultiplierMatch[1];


    const multiplierWord =
      fractionMultiplierMatch[2];


    const fraction =
      FRACTIONS[
        fractionWord
      ];


    const multiplier =
      BASIC_NUMBERS[
        multiplierWord
      ];


    if (
      fraction != null &&
      multiplier != null
    ) {

      return (
        fraction *
        multiplier
      );

    }

  }


  /* ==========================================================
   * DECIMAL SPEECH
   *
   * 2 point 5
   * 2 dot 5
   * ==========================================================
   */

  const decimalMatch =
    text.match(
      /^(\d+)\s*(?:point|dot)\s*(\d+)$/
    );


  if (decimalMatch) {

    return Number(
      `${decimalMatch[1]}.${decimalMatch[2]}`
    );

  }


  /* ==========================================================
   * JOINED NUMBER
   *
   * paanchso
   * ekhazaar
   * ==========================================================
   */

  const joined =
    parseJoinedNumber(text);


  if (joined != null) {

    return joined;

  }


  /* ==========================================================
   * TOKENIZE
   * ==========================================================
   */

  const tokens =
    text
      .split(/\s+/)
      .filter(Boolean);


  if (!tokens.length) {
    return null;
  }


  /* ==========================================================
   * SINGLE WORD
   * ==========================================================
   */

  if (tokens.length === 1) {

    return numericValue(
      tokens[0]
    );

  }


  /* ==========================================================
   * INDIAN COMPOUND NUMBER
   *
   * paanch sau
   * do sau
   * teen sau pachaas
   * ek hazaar
   * paanch hazaar paanch sau
   * ==========================================================
   */

  let total = 0;

  let current = 0;

  let foundNumber = false;


  for (
    const token of tokens
  ) {

    const value =
      numericValue(token);


    if (value == null) {

      /*
       * Ignore non-number words.
       *
       * This makes this function useful when called
       * against partially cleaned speech.
       */

      continue;

    }


    foundNumber = true;


    /* --------------------------------------------------------
     * 100
     * --------------------------------------------------------
     */

    if (value === 100) {

      if (current === 0) {

        current = 1;

      }


      current *= 100;

      continue;

    }


    /* --------------------------------------------------------
     * 1000
     * --------------------------------------------------------
     */

    if (value === 1000) {

      if (current === 0) {

        current = 1;

      }


      total +=
        current * 1000;


      current = 0;

      continue;

    }


    /* --------------------------------------------------------
     * LAKH
     * --------------------------------------------------------
     */

    if (value === 100000) {

      if (current === 0) {

        current = 1;

      }


      total +=
        current * 100000;


      current = 0;

      continue;

    }


    /* --------------------------------------------------------
     * CRORE
     * --------------------------------------------------------
     */

    if (value === 10000000) {

      if (current === 0) {

        current = 1;

      }


      total +=
        current * 10000000;


      current = 0;

      continue;

    }


    /* --------------------------------------------------------
     * NORMAL NUMBER
     * --------------------------------------------------------
     */

    current += value;

  }


  if (!foundNumber) {

    return null;

  }


  return (
    total +
    current
  );

}


/* ============================================================
 * FRACTIONAL QUANTITY
 * ============================================================
 */

export function parseFractionalQuantity(input) {

  if (input == null) {
    return null;
  }


  const text =
    cleanNumberText(input);


  if (!text) {
    return null;
  }


  const tokens =
    text.split(/\s+/);


  /* ----------------------------------------------------------
   * Fraction alone
   *
   * aadha
   * dedh
   * dhai
   * ----------------------------------------------------------
   */

  if (tokens.length === 1) {

    const fraction =
      FRACTIONS[
        tokens[0]
      ];


    if (fraction != null) {

      return {

        quantity:
          fraction,

        unit:
          null,

        raw:
          input,

      };

    }

  }


  /* ----------------------------------------------------------
   * Fraction + unit
   *
   * aadha kilo
   * dedh kilo
   * dhai kilo
   * sawa kilo
   * ----------------------------------------------------------
   */

  if (tokens.length >= 2) {

    const first =
      tokens[0];


    const second =
      tokens[1];


    const fraction =
      FRACTIONS[first];


    const unit =
      UNIT_ALIASES[second];


    if (
      fraction != null &&
      unit
    ) {

      return {

        quantity:
          fraction,

        unit,

        raw:
          input,

      };

    }

  }


  return null;
}


/* ============================================================
 * NORMALIZE UNIT
 * ============================================================
 */

export function normalizeIndianUnit(unit) {

  if (unit == null) {
    return null;
  }


  const normalized =
    String(unit)
      .toLowerCase()
      .trim();


  return (
    UNIT_ALIASES[
      normalized
    ] ||
    normalized.toUpperCase()
  );
}


/* ============================================================
 * EXTRACT QUANTITY + UNIT
 * ============================================================
 *
 * Examples:
 *
 * 2 kg
 * 250 gram
 * aadha kilo
 * paanch kilo
 * paanch sau gram
 * 5 packet
 * 2 bottle
 * ============================================================
 */

export function extractQuantityAndUnit(text) {

  if (
    !text ||
    typeof text !== "string"
  ) {

    return null;

  }


  const normalized =
    cleanNumberText(text);


  /* ----------------------------------------------------------
   * Fractional quantity first
   * ----------------------------------------------------------
   */

  const fractional =
    parseFractionalQuantity(
      normalized
    );


  if (fractional) {

    return fractional;

  }


  /* ----------------------------------------------------------
   * Numeric quantity + unit
   * ----------------------------------------------------------
   */

  const separated =
    separateNumberAndUnit(
      normalized
    );


  const match =
    separated.match(

      /(?:^|\s)(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilos|g|gm|gms|gram|grams|mg|ml|l|lt|liter|litre|liters|litres|pcs|pc|piece|pieces|packet|packets|pkt|pkts|pack|packs|box|boxes|bottle|bottles|bag|bags|pouch|pouches|carton|cartons|quintal|quintals|ton|tons|tonne|tonnes|dozen|pair|pairs)\b/i

    );


  if (match) {

    return {

      quantity:
        Number(match[1]),

      unit:
        normalizeIndianUnit(
          match[2]
        ),

      raw:
        match[0].trim(),

    };

  }


  /* ----------------------------------------------------------
   * Hindi number + unit
   *
   * paanch kilo
   * paanch sau gram
   * do packet
   * ----------------------------------------------------------
   */

  const tokens =
    separated.split(/\s+/);


  for (
    let i = 0;
    i < tokens.length;
    i++
  ) {

    const possibleUnit =
      normalizeIndianUnit(
        tokens[i]
      );


    /*
     * Ignore normal words that are not actual units.
     */

    if (
      !possibleUnit ||
      !UNIT_ALIASES[
        String(tokens[i])
          .toLowerCase()
      ]
    ) {

      continue;

    }


    /*
     * Look backwards for up to 5
     * number words.
     */

    for (
      let start =
        Math.max(0, i - 5);

      start < i;

      start++
    ) {

      const numberText =
        tokens
          .slice(
            start,
            i
          )
          .join(" ");


      const number =
        parseIndianNumber(
          numberText
        );


      if (number != null) {

        return {

          quantity:
            number,

          unit:
            possibleUnit,

          raw:
            `${numberText} ${tokens[i]}`,

        };

      }

    }

  }


  return null;
}


/* ============================================================
 * EXTRACT "WALA" PRICE
 * ============================================================
 *
 * Examples:
 *
 * 10 wala Kurkure
 * 5 wala Tiger biscuit
 * 10 wala Parle G
 * 100 wale chawal
 * dus wala toothbrush
 * paanch wala biscuit
 *
 * Also:
 *
 * 5 ka biscuit
 * dus ka Kurkure
 * ============================================================
 */

export function extractWalaPrice(text) {

  if (
    !text ||
    typeof text !== "string"
  ) {

    return null;

  }


  const normalized =
    cleanNumberText(text);


  const tokens =
    normalized.split(/\s+/);


  /* ----------------------------------------------------------
   * Numeric:
   *
   * 10 wala
   * 10 wale
   * 10 waala
   * 10 waale
   * ----------------------------------------------------------
   */

  const numericMatch =
    normalized.match(

      /(?:^|\s)(\d+(?:\.\d+)?)\s*(?:wala|wale|waala|waale)\b/

    );


  if (numericMatch) {

    return Number(
      numericMatch[1]
    );

  }


  /* ----------------------------------------------------------
   * Hindi:
   *
   * dus wala
   * paanch wala
   * sau wala
   * ----------------------------------------------------------
   */

  for (
    let i = 0;
    i < tokens.length;
    i++
  ) {

    if (
      [
        "wala",
        "wale",
        "waala",
        "waale",
      ].includes(
        tokens[i]
      )
    ) {

      /*
       * Try LONGEST number phrase first.
       */

      for (
        let count = 5;
        count >= 1;
        count--
      ) {

        const start =
          i - count;


        if (start < 0) {
          continue;
        }


        const numberText =
          tokens
            .slice(
              start,
              i
            )
            .join(" ");


        const value =
          parseIndianNumber(
            numberText
          );


        if (value != null) {

          return value;

        }

      }

    }

  }


  /* ----------------------------------------------------------
   * Numeric:
   *
   * 5 ka biscuit
   * ----------------------------------------------------------
   */

  const kaNumericMatch =
    normalized.match(

      /(?:^|\s)(\d+(?:\.\d+)?)\s*ka\b/

    );


  if (kaNumericMatch) {

    return Number(
      kaNumericMatch[1]
    );

  }


  /* ----------------------------------------------------------
   * Hindi:
   *
   * dus ka biscuit
   * paanch ka Kurkure
   * ----------------------------------------------------------
   */

  for (
    let i = 0;
    i < tokens.length;
    i++
  ) {

    if (
      tokens[i] !== "ka"
    ) {

      continue;

    }


    for (
      let count = 5;
      count >= 1;
      count--
    ) {

      const start =
        i - count;


      if (start < 0) {
        continue;
      }


      const numberText =
        tokens
          .slice(
            start,
            i
          )
          .join(" ");


      const value =
        parseIndianNumber(
          numberText
        );


      if (value != null) {

        return value;

      }

    }

  }


  return null;
}


/* ============================================================
 * EXTRACT MONEY AMOUNT
 * ============================================================
 *
 * Examples:
 *
 * ₹500
 * 500 rs
 * 500 rupees
 * 500 rupaye
 *
 * paanch sau rupaye
 * ek hazaar rupaye
 * dedh sau rupaye
 * dhai sau rupaye
 *
 * rahul ke khate mein paanch sau rupaye daalo
 * ============================================================
 */

export function extractMoneyAmount(text) {

  if (
    !text ||
    typeof text !== "string"
  ) {

    return null;

  }


  /*
   * IMPORTANT:
   *
   * Do NOT use cleanNumberText() here.
   *
   * That function removes "rupaye".
   */

  const raw =
    String(text)
      .toLowerCase()
      .trim();


  /* ==========================================================
   * ₹500
   * ==========================================================
   */

  const symbolMatch =
    raw.match(
      /₹\s*(\d+(?:\.\d+)?)/
    );


  if (symbolMatch) {

    return Number(
      symbolMatch[1]
    );

  }


  /* ==========================================================
   * 500 rs
   * 500 rupees
   * 500 rupaye
   * ==========================================================
   */

  const numericMoneyMatch =
    raw.match(

      /(\d+(?:\.\d+)?)\s*(?:rs|rupees?|rupaye?|rupay|rupiya|rupai)\b/i

    );


  if (numericMoneyMatch) {

    return Number(
      numericMoneyMatch[1]
    );

  }


  /* ==========================================================
   * PUNCTUATION ONLY
   *
   * DO NOT REMOVE MONEY WORDS.
   * ==========================================================
   */

  const moneyText =
    raw
      .replace(
        /[₹,\u0964\u0965!?;:]+/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();


  const tokens =
    moneyText
      .split(/\s+/)
      .filter(Boolean);


  /* ==========================================================
   * MONEY WORDS
   * ==========================================================
   */

  const moneyWords = [

    "rupee",
    "rupees",

    "rupaye",
    "rupay",

    "rupiya",
    "rupai",

    "rs",

  ];


  /* ==========================================================
   * FIND MONEY WORD
   * ==========================================================
   */

  const moneyIndexes = [];


  tokens.forEach(
    (token, index) => {

      if (
        moneyWords.includes(
          token
        )
      ) {

        moneyIndexes.push(
          index
        );

      }

    }
  );


  if (
    !moneyIndexes.length
  ) {

    return null;

  }


  /*
   * Use the LAST money word.
   */

  const moneyIndex =
    moneyIndexes[
      moneyIndexes.length - 1
    ];


  const beforeMoney =
    tokens.slice(
      0,
      moneyIndex
    );


  /* ==========================================================
   * LONGEST MATCH FIRST
   *
   * This is VERY important.
   *
   * "paanch sau rupaye"
   *
   * MUST become:
   *
   * 500
   *
   * and NOT:
   *
   * 100
   *
   * because "sau" alone = 100.
   * ==========================================================
   */

  for (
    let count = 6;
    count >= 1;
    count--
  ) {

    const start =
      beforeMoney.length -
      count;


    if (start < 0) {
      continue;
    }


    const numberText =
      beforeMoney
        .slice(
          start
        )
        .join(" ");


    const parsed =
      parseIndianNumber(
        numberText
      );


    if (parsed != null) {

      return parsed;

    }

  }


  /* ==========================================================
   * FALLBACK SEARCH
   *
   * Search every possible phrase and keep the LONGEST
   * successfully parsed expression.
   *
   * Example:
   *
   * Rahul ke khate mein paanch sau rupaye daalo
   *
   * We want:
   *
   * paanch sau
   *
   * not:
   *
   * sau
   * ==========================================================
   */

  let bestParsedValue =
    null;


  let bestTokenCount =
    0;


  for (
    let start = 0;
    start < moneyIndex;
    start++
  ) {

    for (
      let end = moneyIndex;
      end > start;
      end--
    ) {

      const numberText =
        tokens
          .slice(
            start,
            end
          )
          .join(" ");


      const parsed =
        parseIndianNumber(
          numberText
        );


      if (
        parsed != null &&
        end - start >
          bestTokenCount
      ) {

        bestParsedValue =
          parsed;


        bestTokenCount =
          end - start;

      }

    }

  }


  if (
    bestParsedValue != null
  ) {

    return bestParsedValue;

  }


  return null;
}


/* ============================================================
 * COMPLETE QUANTITY EXPRESSION
 * ============================================================
 *
 * Useful for:
 *
 * debugging
 * local parser
 * Gemini preprocessing
 * IntentHandler
 * ============================================================
 */

export function parseQuantityExpression(
  text
) {

  const quantity =
    extractQuantityAndUnit(
      text
    );


  const walaPrice =
    extractWalaPrice(
      text
    );


  const money =
    extractMoneyAmount(
      text
    );


  return {

    raw:
      text,

    quantity,

    wala_price:
      walaPrice,

    money_amount:
      money,

  };

}


/* ============================================================
 * DEFAULT EXPORT
 * ============================================================
 */

export default {

  parseIndianNumber,

  parseFractionalQuantity,

  normalizeIndianUnit,

  extractQuantityAndUnit,

  extractWalaPrice,

  extractMoneyAmount,

  parseQuantityExpression,

};