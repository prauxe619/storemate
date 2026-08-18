/**
 * ============================================================
 * COUNTR - INVENTORY VARIANT RESOLVER
 * ============================================================
 *
 * Phase 3B
 *
 * Converts the normalized local voice result into an ACTUAL
 * inventory record.
 *
 * IMPORTANT:
 *
 * This layer does NOT execute a sale.
 * It only finds the correct inventory item.
 *
 * Example:
 *
 * Voice:
 *   "2 packet 10 wala parle ji"
 *
 * Parser result:
 *   product     = "Parle G"
 *   qty         = 2
 *   unit        = "PACK"
 *   price_hint  = 10
 *
 * Inventory:
 *   Parle G / PACK / ₹5
 *   Parle G / PACK / ₹10
 *   Parle G / PACK / ₹20
 *
 * Result:
 *   Parle G / PACK / ₹10
 *
 * If ₹10 does NOT exist, we return VARIANT_NOT_FOUND.
 * We NEVER silently choose ₹20 or ₹5.
 * ============================================================
 */


/* ============================================================
 * NORMALIZATION
 * ============================================================
 */

const normalizeText = value =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[₹,]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();


const numberOrNull = value => {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
};


const sameNumber = (
  a,
  b,
  epsilon = 0.000001
) => {

  const left =
    numberOrNull(a);

  const right =
    numberOrNull(b);

  if (
    left === null ||
    right === null
  ) {
    return false;
  }

  return (
    Math.abs(left - right) <=
    epsilon
  );
};


/* ============================================================
 * UNIT NORMALIZATION
 * ============================================================
 *
 * Keep this compatible with the units used by COUNTR
 * inventory.
 * ============================================================
 */

const UNIT_ALIASES = Object.freeze({

  mg: "MG",
  milligram: "MG",
  milligrams: "MG",

  g: "G",
  gm: "G",
  gms: "G",
  gram: "G",
  grams: "G",
  grm: "G",

  kg: "KG",
  kgs: "KG",
  kilo: "KG",
  kilos: "KG",
  kilogram: "KG",
  kilograms: "KG",

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

  pc: "PCS",
  pcs: "PCS",
  piece: "PCS",
  pieces: "PCS",
  item: "PCS",
  items: "PCS",

  packet: "PACKET",
  packets: "PACKET",
  pkt: "PACKET",
  pkts: "PACKET",

  pack: "PACKET",
  packs: "PACKET",

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

  dozen: "DOZEN",
  dozens: "DOZEN",

  pair: "PAIR",
  pairs: "PAIR",

  quintal: "QUINTAL",
  quintals: "QUINTAL",

  ton: "TON",
  tons: "TON",
  tonne: "TON",
  tonnes: "TON",
  mt: "TON",

});


export const normalizeVariantUnit = unit => {

  if (
    unit === null ||
    unit === undefined ||
    unit === ""
  ) {
    return null;
  }

  const clean =
    normalizeText(unit)
      .replace(/\s+/g, "");

  return (
    UNIT_ALIASES[clean] ||
    String(unit)
      .trim()
      .toUpperCase()
  );
};


/* ============================================================
 * UNIT CONVERSION
 * ============================================================
 *
 * Only compatible WEIGHT and VOLUME units are convertible.
 *
 * PACKET, BOX, PCS etc. are deliberately NOT converted.
 * ============================================================
 */

const UNIT_TO_BASE = Object.freeze({

  MG: {
    group: "WEIGHT",
    multiplier: 0.001,
  },

  G: {
    group: "WEIGHT",
    multiplier: 1,
  },

  KG: {
    group: "WEIGHT",
    multiplier: 1000,
  },

  QUINTAL: {
    group: "WEIGHT",
    multiplier: 100000,
  },

  TON: {
    group: "WEIGHT",
    multiplier: 1000000,
  },

  ML: {
    group: "VOLUME",
    multiplier: 1,
  },

  L: {
    group: "VOLUME",
    multiplier: 1000,
  },

});


export const canConvertVariantUnit = (
  fromUnit,
  toUnit
) => {

  const from =
    normalizeVariantUnit(
      fromUnit
    );

  const to =
    normalizeVariantUnit(
      toUnit
    );

  if (!from || !to) {
    return false;
  }

  if (from === to) {
    return true;
  }

  const fromInfo =
    UNIT_TO_BASE[from];

  const toInfo =
    UNIT_TO_BASE[to];

  if (
    !fromInfo ||
    !toInfo
  ) {
    return false;
  }

  return (
    fromInfo.group ===
    toInfo.group
  );
};


const unitEquivalent = (
  requestedUnit,
  storedUnit
) => {

  const requested =
    normalizeVariantUnit(
      requestedUnit
    );

  const stored =
    normalizeVariantUnit(
      storedUnit
    );

  if (!requested) {
    return true;
  }

  if (!stored) {
    return false;
  }

  if (
    requested === stored
  ) {
    return true;
  }

  return canConvertVariantUnit(
    requested,
    stored
  );
};


/* ============================================================
 * INVENTORY FIELD ACCESS
 * ============================================================
 *
 * Supports:
 *
 * WatermelonDB InventoryItem:
 *   item.productName
 *   item.sellingPrice
 *   item.unit
 *
 * Plain object:
 *   item.productName
 *   item.product_name
 *   item.sellingPrice
 *   item.selling_price
 *
 * This keeps the resolver independent of the UI/database layer.
 * ============================================================
 */

const getField = (
  item,
  camel,
  snake
) => {

  if (!item) {
    return undefined;
  }

  if (
    item[camel] !== undefined
  ) {
    return item[camel];
  }

  if (
    item[snake] !== undefined
  ) {
    return item[snake];
  }

  return undefined;
};


export const getInventoryProductName =
  item =>
    getField(
      item,
      "productName",
      "product_name"
    );


export const getInventorySellingPrice =
  item =>
    getField(
      item,
      "sellingPrice",
      "selling_price"
    );


export const getInventoryUnit =
  item =>
    getField(
      item,
      "unit",
      "unit"
    );


export const getInventoryQuantity =
  item =>
    getField(
      item,
      "quantity",
      "quantity"
    );


export const getInventoryId =
  item =>
    getField(
      item,
      "id",
      "id"
    );


/* ============================================================
 * PRODUCT NAME NORMALIZATION
 * ============================================================
 */

const PRODUCT_ALIASES = Object.freeze([

  {
    canonical: "parle g",
    aliases: [
      "parle g",
      "parle ji",
      "parle jee",
      "parle gee",
      "parle gi",
      "parle g biscuit",
      "parle ji biscuit",
      "g biscuit",
      "पारले जी",
      "पार्ले जी",
    ],
  },

  {
    canonical: "kurkure",
    aliases: [
      "kurkure",
      "kurkura",
      "कुरकुरे",
      "कुरकुरा",
    ],
  },

  {
    canonical: "tiger biscuit",
    aliases: [
      "tiger biscuit",
      "tiger biscuits",
      "tiger",
      "टाइगर बिस्किट",
      "टाइगर बिस्कुट",
    ],
  },

  {
    canonical: "rice",
    aliases: [
      "rice",
      "chawal",
      "chaawal",
      "चावल",
    ],
  },

  {
    canonical: "basmati rice",
    aliases: [
      "basmati rice",
      "basmati chawal",
      "basmati chaawal",
      "बासमती चावल",
    ],
  },

  {
    canonical: "sugar",
    aliases: [
      "sugar",
      "chini",
      "cheeni",
      "चीनी",
      "शक्कर",
    ],
  },

  {
    canonical: "biscuit",
    aliases: [
      "biscuit",
      "biscuits",
      "biskit",
      "biskits",
      "बिस्किट",
      "बिस्कुट",
    ],
  },

  {
    canonical: "tooth brush",
    aliases: [
      "toothbrush",
      "tooth brush",
      "ब्रश",
      "टूथब्रश",
      "टूथ ब्रश",
    ],
  },

]);


const canonicalProductName =
  value => {

    const normalized =
      normalizeText(value);

    if (!normalized) {
      return "";
    }

    const candidates = [];

    for (
      const group of
        PRODUCT_ALIASES
    ) {

      for (
        const alias of
          group.aliases
      ) {

        const normalizedAlias =
          normalizeText(
            alias
          );

        if (
          normalized.includes(
            normalizedAlias
          )
        ) {

          candidates.push({

            canonical:
              group.canonical,

            length:
              normalizedAlias.length,

          });

        }

      }

    }

    candidates.sort(
      (a, b) =>
        b.length -
        a.length
    );

    if (
      candidates.length
    ) {

      return normalizeText(
        candidates[0].canonical
      );

    }

    return normalized;
  };


/* ============================================================
 * PRODUCT MATCH SCORE
 * ============================================================
 */

const productScore = (
  requestedProduct,
  storedProduct
) => {

  const requested =
    normalizeText(
      requestedProduct
    );

  const stored =
    normalizeText(
      storedProduct
    );

  if (
    !requested ||
    !stored
  ) {
    return 0;
  }


  /*
   * Exact actual inventory name.
   */

  if (
    requested === stored
  ) {
    return 1000;
  }


  /*
   * Canonical alias match.
   */

  const requestedCanonical =
    canonicalProductName(
      requested
    );

  const storedCanonical =
    canonicalProductName(
      stored
    );


  if (
    requestedCanonical ===
    storedCanonical
  ) {

    return 900;

  }


  /*
   * One contains the other.
   */

  if (
    stored.includes(
      requested
    ) ||
    requested.includes(
      stored
    )
  ) {

    return 700;

  }


  /*
   * Word overlap.
   */

  const requestedWords =
    requested
      .split(/\s+/)
      .filter(
        word =>
          word.length >= 2
      );


  const storedWords =
    stored
      .split(/\s+/)
      .filter(
        word =>
          word.length >= 2
      );


  let matches = 0;

  for (
    const word of
      requestedWords
  ) {

    if (
      storedWords.includes(
        word
      )
    ) {

      matches++;

    }

  }


  if (!matches) {
    return 0;
  }


  return (
    500 +
    matches * 50
  );
};


/* ============================================================
 * MAIN RESOLVER
 * ============================================================
 *
 * Returns:
 *
 * {
 *   status: "FOUND",
 *   item,
 *   product_name,
 *   selling_price,
 *   unit,
 *   requested_price,
 *   requested_unit,
 *   match_reason
 * }
 *
 * OR:
 *
 * {
 *   status: "VARIANT_NOT_FOUND",
 *   ...
 * }
 *
 * OR:
 *
 * {
 *   status: "PRODUCT_NOT_FOUND",
 *   ...
 * }
 *
 * OR:
 *
 * {
 *   status: "AMBIGUOUS",
 *   candidates: [...]
 * }
 * ============================================================
 */

export const resolveInventoryVariant = ({
  command,
  inventory,
}) => {

  if (
    !command ||
    typeof command !== "object"
  ) {

    return {

      status:
        "INVALID_COMMAND",

      reason:
        "No normalized voice command was provided.",

    };

  }


  if (
    !Array.isArray(
      inventory
    ) ||
    inventory.length === 0
  ) {

    return {

      status:
        "PRODUCT_NOT_FOUND",

      reason:
        "Inventory is empty.",

      requested_product:
        command.product ||
        command.product_name ||
        null,

    };

  }


  const requestedProduct =
    command.product ||
    command.product_name ||
    null;


  const requestedPrice =
    numberOrNull(
      command.price_hint ??
      command.variant_price ??
      command.selling_price
    );


  const requestedUnit =
    normalizeVariantUnit(
      command.unit
    );


  if (!requestedProduct) {

    return {

      status:
        "PRODUCT_NOT_FOUND",

      reason:
        "Command does not contain a product name.",

    };

  }


  /*
   * ==========================================================
   * STEP 1
   * PRODUCT CANDIDATES
   * ==========================================================
   */

  const productCandidates =
    inventory
      .map(
        item => ({

          item,

          score:
            productScore(
              requestedProduct,
              getInventoryProductName(
                item
              )
            ),

        })
      )
      .filter(
        candidate =>
          candidate.score > 0
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );


  if (
    productCandidates.length === 0
  ) {

    return {

      status:
        "PRODUCT_NOT_FOUND",

      requested_product:
        requestedProduct,

      requested_price:
        requestedPrice,

      requested_unit:
        requestedUnit,

    };

  }


  /*
   * ==========================================================
   * STEP 2
   * PRICE FILTER
   * ==========================================================
   *
   * If the user explicitly said:
   *
   * "10 wala"
   *
   * then ₹10 is a HARD constraint.
   *
   * NEVER fall back to another price.
   * ==========================================================
   */

  let candidates =
    productCandidates;


  if (
    requestedPrice !== null
  ) {

    candidates =
      candidates.filter(
        candidate =>
          sameNumber(
            getInventorySellingPrice(
              candidate.item
            ),
            requestedPrice
          )
      );


    if (
      candidates.length === 0
    ) {

      return {

        status:
          "VARIANT_NOT_FOUND",

        reason:
          "Requested product exists, but the requested selling price variant does not exist.",

        requested_product:
          requestedProduct,

        requested_price:
          requestedPrice,

        requested_unit:
          requestedUnit,

        available_variants:
          productCandidates.map(
            candidate => ({

              id:
                getInventoryId(
                  candidate.item
                ),

              product_name:
                getInventoryProductName(
                  candidate.item
                ),

              selling_price:
                numberOrNull(
                  getInventorySellingPrice(
                    candidate.item
                  )
                ),

              unit:
                normalizeVariantUnit(
                  getInventoryUnit(
                    candidate.item
                  )
                ),

            })
          ),

      };

    }

  }


  /*
   * ==========================================================
   * STEP 3
   * UNIT FILTER
   * ==========================================================
   *
   * If the user said:
   *
   * "5 kg"
   *
   * KG is a constraint.
   *
   * Compatible units such as G are allowed at this resolver
   * stage, but we return the stored unit so the execution
   * layer can decide whether quantity conversion is required.
   * ==========================================================
   */

  if (
    requestedUnit
  ) {

    const unitCandidates =
      candidates.filter(
        candidate =>
          unitEquivalent(
            requestedUnit,
            getInventoryUnit(
              candidate.item
            )
          )
      );


    if (
      unitCandidates.length === 0
    ) {

      return {

        status:
          "UNIT_VARIANT_NOT_FOUND",

        reason:
          "Product and price were found, but no compatible inventory unit exists.",

        requested_product:
          requestedProduct,

        requested_price:
          requestedPrice,

        requested_unit:
          requestedUnit,

        available_variants:
          candidates.map(
            candidate => ({

              id:
                getInventoryId(
                  candidate.item
                ),

              product_name:
                getInventoryProductName(
                  candidate.item
                ),

              selling_price:
                numberOrNull(
                  getInventorySellingPrice(
                    candidate.item
                  )
                ),

              unit:
                normalizeVariantUnit(
                  getInventoryUnit(
                    candidate.item
                  )
                ),

            })
          ),

      };

    }


    candidates =
      unitCandidates;

  }


  /*
   * ==========================================================
   * STEP 4
   * BEST MATCH
   * ==========================================================
   */

  candidates.sort(
    (a, b) =>
      b.score -
      a.score
  );


  /*
   * If there are several equally good variants and the user
   * did not specify price/unit, do not guess.
   */

  if (
    candidates.length > 1 &&
    requestedPrice === null &&
    requestedUnit === null
  ) {

    const topScore =
      candidates[0].score;


    const equallyGood =
      candidates.filter(
        candidate =>
          candidate.score ===
          topScore
      );


    if (
      equallyGood.length > 1
    ) {

      return {

        status:
          "AMBIGUOUS",

        reason:
          "Multiple inventory variants match the requested product.",

        requested_product:
          requestedProduct,

        candidates:
          equallyGood.map(
            candidate => ({

              id:
                getInventoryId(
                  candidate.item
                ),

              product_name:
                getInventoryProductName(
                  candidate.item
                ),

              selling_price:
                numberOrNull(
                  getInventorySellingPrice(
                    candidate.item
                  )
                ),

              unit:
                normalizeVariantUnit(
                  getInventoryUnit(
                    candidate.item
                  )
                ),

            })
          ),

      };

    }

  }


  const winner =
    candidates[0].item;


  /*
   * ==========================================================
   * SUCCESS
   * ==========================================================
   */

  return {

    status:
      "FOUND",

    item:
      winner,

    id:
      getInventoryId(
        winner
      ),

    product_name:
      getInventoryProductName(
        winner
      ),

    selling_price:
      numberOrNull(
        getInventorySellingPrice(
          winner
        )
      ),

    unit:
      normalizeVariantUnit(
        getInventoryUnit(
          winner
        )
      ),

    stock_quantity:
      numberOrNull(
        getInventoryQuantity(
          winner
        )
      ),

    requested_product:
      requestedProduct,

    requested_price:
      requestedPrice,

    requested_unit:
      requestedUnit,

    match_reason:
      requestedPrice !== null
        ? "PRODUCT_AND_PRICE"
        : requestedUnit !== null
        ? "PRODUCT_AND_UNIT"
        : "PRODUCT",

  };

};


/* ============================================================
 * CONVENIENCE FUNCTION
 * ============================================================
 *
 * Allows:
 *
 * resolveVoiceInventoryVariant(
 *   {
 *     product: "Parle G",
 *     qty: 2,
 *     unit: "PACK",
 *     price_hint: 10
 *   },
 *   inventory
 * )
 * ============================================================
 */

export const resolveVoiceInventoryVariant = (
  command,
  inventory
) =>
  resolveInventoryVariant({
    command,
    inventory,
  });


export default {
  resolveInventoryVariant,
  resolveVoiceInventoryVariant,
  normalizeVariantUnit,
  canConvertVariantUnit,
  getInventoryProductName,
  getInventorySellingPrice,
  getInventoryUnit,
  getInventoryQuantity,
  getInventoryId,
};
