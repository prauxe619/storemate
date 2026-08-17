/*
 * ============================================================
 * StoreMate Universal Unit Conversion
 * ============================================================
 *
 * PURPOSE
 * ------------------------------------------------------------
 * Converts quantities between units used by:
 *
 * - Kirana stores
 * - Grocery stores
 * - General stores
 * - Medical stores
 * - Dairy stores
 * - Beverage shops
 * - Hardware/local stores
 *
 *
 * SAFE CONVERSIONS
 * ------------------------------------------------------------
 *
 * WEIGHT:
 *   MG
 *   GRAM
 *   KG
 *   QUINTAL
 *   TON
 *
 * VOLUME:
 *   ML
 *   LITRE
 *
 * COUNT:
 *   PCS
 *   DOZEN
 *   PAIR
 *   GROSS
 *   SCORE
 *
 *
 * PRODUCT-SPECIFIC UNITS
 * ------------------------------------------------------------
 *
 * PACK
 * PACKET
 * POUCH
 * BOX
 * BOTTLE
 * JAR
 * TIN
 * CAN
 * BAG
 * SACK
 * STRIP
 * CARTON
 * BUNDLE
 * TRAY
 * CRATE
 * ROLL
 *
 * These MUST NOT automatically be converted to PCS because
 * their actual quantity depends on the product.
 *
 * Example:
 *
 * 1 carton Coca Cola
 * could contain 12, 24 or 48 bottles.
 *
 * StoreMate must NEVER guess this.
 *
 * ============================================================
 */


/*
 * ============================================================
 * UNIT ALIASES
 * ============================================================
 */

const UNIT_ALIASES = {

  /*
   * ----------------------------------------------------------
   * WEIGHT
   * ----------------------------------------------------------
   */

  MG: 'MG',

  MGS: 'MG',

  MILLIGRAM: 'MG',

  MILLIGRAMS: 'MG',

  MILLIGRAMME: 'MG',

  MILLIGRAMMES: 'MG',


  G: 'GRAM',

  GM: 'GRAM',

  GMS: 'GRAM',

  GRAM: 'GRAM',

  GRAMS: 'GRAM',

  GRAMME: 'GRAM',

  GRAMMES: 'GRAM',


  KG: 'KG',

  KGS: 'KG',

  KILO: 'KG',

  KILOS: 'KG',

  KILOGRAM: 'KG',

  KILOGRAMS: 'KG',

  KILOGRAMME: 'KG',

  KILOGRAMMES: 'KG',


  QUINTAL: 'QUINTAL',

  QUINTALS: 'QUINTAL',

  QUANTAL: 'QUINTAL',

  QUANTALS: 'QUINTAL',

  Q: 'QUINTAL',


  TON: 'TON',

  TONS: 'TON',

  TONNE: 'TON',

  TONNES: 'TON',

  MT: 'TON',

  METRICTON: 'TON',

  METRICTONS: 'TON',

  TONNE: 'TON',

  'टन': 'TON',

  /*
   * Traditional Indian weight units are recognized but are
   * NOT automatically converted unless a future product/shop
   * configuration supplies their exact local conversion.
   */
  TOLA: 'TOLA',
  TOLAS: 'TOLA',
  'तोला': 'TOLA',

  CHHATAK: 'CHHATAK',
  CHATAK: 'CHHATAK',
  'छटांक': 'CHHATAK',

  SEER: 'SEER',
  SER: 'SEER',
  'सेर': 'SEER',

  MAUND: 'MAUND',
  MAN: 'MAUND',
  'मन': 'MAUND',
  'मण': 'MAUND',


  /*
   * ----------------------------------------------------------
   * VOLUME
   * ----------------------------------------------------------
   */

  ML: 'ML',

  MLS: 'ML',

  MILLILITRE: 'ML',

  MILLILITRES: 'ML',

  MILLILITER: 'ML',

  MILLILITERS: 'ML',

  MILLILITREs: 'ML',

  CC: 'ML',


  L: 'LITRE',

  LT: 'LITRE',

  LTR: 'LITRE',

  LTRS: 'LITRE',

  LITRE: 'LITRE',

  LITRES: 'LITRE',

  LITER: 'LITRE',

  LITERS: 'LITRE',

  LITERS: 'LITRE',

  'मिली': 'ML',
  'एमएल': 'ML',
  'मिलीलीटर': 'ML',
  'मिलीलीटर': 'ML',

  'लीटर': 'LITRE',
  'ली': 'LITRE',


  /*
   * ----------------------------------------------------------
   * COUNT
   * ----------------------------------------------------------
   */

  PC: 'PCS',

  PCS: 'PCS',

  PIECE: 'PCS',

  PIECES: 'PCS',

  UNIT: 'PCS',

  UNITS: 'PCS',


  DOZEN: 'DOZEN',

  DOZ: 'DOZEN',

  DOZENS: 'DOZEN',


  PAIR: 'PAIR',

  PAIRS: 'PAIR',


  GROSS: 'GROSS',

  GROSSES: 'GROSS',


  SCORE: 'SCORE',

  SCORES: 'SCORE',

  'पीस': 'PCS',
  'नग': 'PCS',
  'दर्जन': 'DOZEN',
  'जोड़ी': 'PAIR',
  'जोड़ी': 'PAIR',
  'ग्रॉस': 'GROSS',
  'ग्रोस': 'GROSS',
  'स्कोर': 'SCORE',


  /*
   * ----------------------------------------------------------
   * PRODUCT-SPECIFIC PACKAGING
   * ----------------------------------------------------------
   */

  PACK: 'PACK',

  PACKS: 'PACK',

  PK: 'PACK',

  PKS: 'PACK',


  PACKET: 'PACK',

  PACKETS: 'PACK',

  PKT: 'PACK',

  PKTS: 'PACK',


  POUCH: 'POUCH',

  POUCHES: 'POUCH',


  BOX: 'BOX',

  BOXES: 'BOX',


  BOTTLE: 'BOTTLE',

  BOTTLES: 'BOTTLE',


  JAR: 'JAR',

  JARS: 'JAR',


  TIN: 'TIN',

  TINS: 'TIN',


  CAN: 'CAN',

  CANS: 'CAN',


  BAG: 'BAG',

  BAGS: 'BAG',


  SACK: 'SACK',

  SACKS: 'SACK',


  STRIP: 'STRIP',

  STRIPS: 'STRIP',


  CARTON: 'CARTON',

  CARTONS: 'CARTON',


  BUNDLE: 'BUNDLE',

  BUNDLES: 'BUNDLE',


  TRAY: 'TRAY',

  TRAYS: 'TRAY',


  CRATE: 'CRATE',

  CRATES: 'CRATE',


  ROLL: 'ROLL',

  ROLLS: 'ROLL',

  'पैक': 'PACK',
  'पैकेट': 'PACK',
  'पैकेट्स': 'PACK',
  'पाउच': 'POUCH',
  'डिब्बा': 'BOX',
  'डिब्बे': 'BOX',
  'डब्बा': 'BOX',
  'डब्बे': 'BOX',
  'बोतल': 'BOTTLE',
  'बॉटल': 'BOTTLE',
  'जार': 'JAR',
  'टिन': 'TIN',
  'कैन': 'CAN',
  'बैग': 'BAG',
  'बोरी': 'SACK',
  'स्ट्रिप': 'STRIP',
  'कार्टन': 'CARTON',
  'बंडल': 'BUNDLE',
  'ट्रे': 'TRAY',
  'क्रेट': 'CRATE',
  'रोल': 'ROLL',


  /*
   * Common shop terminology
   */

  DOZ: 'DOZEN',

};


/*
 * ============================================================
 * UNIT FAMILY
 * ============================================================
 */

const UNIT_FAMILY = {

  MG: 'WEIGHT',

  GRAM: 'WEIGHT',

  KG: 'WEIGHT',

  QUINTAL: 'WEIGHT',

  TON: 'WEIGHT',


  ML: 'VOLUME',

  LITRE: 'VOLUME',


  PCS: 'COUNT',

  DOZEN: 'COUNT',

  PAIR: 'COUNT',

  GROSS: 'COUNT',

  SCORE: 'COUNT',


  PACK: 'PACKAGING',

  POUCH: 'PACKAGING',

  BOX: 'PACKAGING',

  BOTTLE: 'PACKAGING',

  JAR: 'PACKAGING',

  TIN: 'PACKAGING',

  CAN: 'PACKAGING',

  BAG: 'PACKAGING',

  SACK: 'PACKAGING',

  STRIP: 'PACKAGING',

  CARTON: 'PACKAGING',

  BUNDLE: 'PACKAGING',

  TRAY: 'PACKAGING',

  CRATE: 'PACKAGING',

  ROLL: 'PACKAGING',
};


/*
 * ============================================================
 * BASE UNIT MULTIPLIERS
 * ============================================================
 *
 * WEIGHT → MG
 *
 * VOLUME → ML
 *
 * COUNT → PCS
 *
 * Packaging units intentionally do NOT have a multiplier.
 *
 * ============================================================
 */

const TO_BASE = {

  /*
   * WEIGHT
   */

  MG: 1,

  GRAM: 1000,

  KG: 1000000,

  QUINTAL: 100000000,

  TON: 1000000000,


  /*
   * VOLUME
   */

  ML: 1,

  LITRE: 1000,


  /*
   * COUNT
   */

  PCS: 1,

  DOZEN: 12,

  PAIR: 2,

  GROSS: 144,

  SCORE: 20,
};


/*
 * ============================================================
 * PACKAGING UNITS
 * ============================================================
 */

const PACKAGING_UNITS = new Set([

  'PACK',

  'POUCH',

  'BOX',

  'BOTTLE',

  'JAR',

  'TIN',

  'CAN',

  'BAG',

  'SACK',

  'STRIP',

  'CARTON',

  'BUNDLE',

  'TRAY',

  'CRATE',

  'ROLL',

]);


/*
 * ============================================================
 * NORMALIZE UNIT
 * ============================================================
 *
 * Converts:
 *
 * "gm"        → GRAM
 * "kgs"       → KG
 * "litre"     → LITRE
 * "quintal"   → QUINTAL
 * "packet"    → PACK
 *
 * ============================================================
 */

export const normalizeUnit = value => {

  if (
    typeof value !== 'string'
  ) {
    return null;
  }


  const cleaned = value
    .trim()
    .toUpperCase()
    .replace(
      /\s+/g,
      ''
    )
    .replace(
      /-/g,
      ''
    )
    .replace(
      /_/g,
      ''
    )
    .replace(
      /[^A-Z0-9\u0900-\u097F]/g,
      ''
    );


  return (
    UNIT_ALIASES[cleaned] ||
    null
  );
};


/*
 * ============================================================
 * GET UNIT FAMILY
 * ============================================================
 */

export const getUnitFamily = unit => {

  const normalized =
    normalizeUnit(unit);


  if (!normalized) {
    return null;
  }


  return (
    UNIT_FAMILY[normalized] ||
    null
  );
};


/*
 * ============================================================
 * IS PACKAGING UNIT?
 * ============================================================
 */

export const isPackagingUnit = unit => {

  const normalized =
    normalizeUnit(unit);


  if (!normalized) {
    return false;
  }


  return PACKAGING_UNITS.has(
    normalized
  );
};


/*
 * ============================================================
 * IS WEIGHT UNIT?
 * ============================================================
 */

export const isWeightUnit = unit => {

  return (
    getUnitFamily(unit) ===
    'WEIGHT'
  );
};


/*
 * ============================================================
 * IS VOLUME UNIT?
 * ============================================================
 */

export const isVolumeUnit = unit => {

  return (
    getUnitFamily(unit) ===
    'VOLUME'
  );
};


/*
 * ============================================================
 * IS COUNT UNIT?
 * ============================================================
 */

export const isCountUnit = unit => {

  return (
    getUnitFamily(unit) ===
    'COUNT'
  );
};


/*
 * ============================================================
 * CAN CONVERT?
 * ============================================================
 */

export const canConvertUnit = (
  fromUnit,
  toUnit
) => {

  const from =
    normalizeUnit(fromUnit);

  const to =
    normalizeUnit(toUnit);


  if (
    !from ||
    !to
  ) {
    return false;
  }


  /*
   * Same unit
   */

  if (
    from === to
  ) {
    return true;
  }


  const fromFamily =
    UNIT_FAMILY[from];

  const toFamily =
    UNIT_FAMILY[to];


  /*
   * Weight
   */

  if (
    fromFamily === 'WEIGHT' &&
    toFamily === 'WEIGHT'
  ) {
    return true;
  }


  /*
   * Volume
   */

  if (
    fromFamily === 'VOLUME' &&
    toFamily === 'VOLUME'
  ) {
    return true;
  }


  /*
   * Count
   */

  if (
    fromFamily === 'COUNT' &&
    toFamily === 'COUNT'
  ) {
    return true;
  }


  /*
   * Packaging units are NOT automatically
   * convertible.
   */

  return false;
};


/*
 * ============================================================
 * CONVERT QUANTITY
 * ============================================================
 *
 * Example:
 *
 * convertQuantity(
 *   200,
 *   'GRAM',
 *   'KG'
 * )
 *
 * → 0.2
 *
 *
 * Example:
 *
 * convertQuantity(
 *   2,
 *   'DOZEN',
 *   'PCS'
 * )
 *
 * → 24
 *
 * ============================================================
 */

export const convertQuantity = (
  quantity,
  fromUnit,
  toUnit
) => {

  const value =
    Number(quantity);


  const from =
    normalizeUnit(fromUnit);


  const to =
    normalizeUnit(toUnit);


  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    return null;
  }


  if (
    !from ||
    !to
  ) {
    return null;
  }


  /*
   * Same unit
   */

  if (
    from === to
  ) {
    return value;
  }


  /*
   * Verify compatibility
   */

  if (
    !canConvertUnit(
      from,
      to
    )
  ) {
    return null;
  }


  const fromBase =
    TO_BASE[from];


  const toBase =
    TO_BASE[to];


  if (
    fromBase === undefined ||
    toBase === undefined
  ) {
    return null;
  }


  const result =
    (
      value *
      fromBase
    ) /
    toBase;


  if (
    !Number.isFinite(result)
  ) {
    return null;
  }


  return result;
};


/*
 * ============================================================
 * CONVERT WITH DETAILS
 * ============================================================
 *
 * Useful for IntentHandler.
 *
 * Returns:
 *
 * {
 *   success: true,
 *   quantity: 0.2,
 *   fromUnit: "GRAM",
 *   toUnit: "KG"
 * }
 *
 * OR
 *
 * {
 *   success: false,
 *   reason: "INCOMPATIBLE_UNITS"
 * }
 *
 * ============================================================
 */

export const convertQuantityDetailed = (
  quantity,
  fromUnit,
  toUnit
) => {

  const from =
    normalizeUnit(fromUnit);


  const to =
    normalizeUnit(toUnit);


  if (!from) {

    return {
      success: false,

      quantity: null,

      fromUnit: null,

      toUnit: to || null,

      reason:
        'INVALID_SOURCE_UNIT',
    };
  }


  if (!to) {

    return {
      success: false,

      quantity: null,

      fromUnit: from,

      toUnit: null,

      reason:
        'INVALID_TARGET_UNIT',
    };
  }


  if (
    !Number.isFinite(
      Number(quantity)
    )
  ) {

    return {
      success: false,

      quantity: null,

      fromUnit: from,

      toUnit: to,

      reason:
        'INVALID_QUANTITY',
    };
  }


  const converted =
    convertQuantity(
      quantity,
      from,
      to
    );


  if (
    converted === null
  ) {

    return {
      success: false,

      quantity: null,

      fromUnit: from,

      toUnit: to,

      reason:
        'INCOMPATIBLE_UNITS',
    };
  }


  return {

    success: true,

    quantity: converted,

    fromUnit: from,

    toUnit: to,

    reason: null,

  };
};


/*
 * ============================================================
 * PACKAGING CONVERSION
 * ============================================================
 *
 * Packaging conversion MUST be product-specific.
 *
 * Example:
 *
 * 1 BOX = 12 PCS
 *
 * This is only valid if the product actually has
 * 12 pieces per box.
 *
 * Example usage:
 *
 * convertPackagingQuantity(
 *   2,
 *   'BOX',
 *   'PCS',
 *   12
 * )
 *
 * → 24
 *
 * ============================================================
 */

export const convertPackagingQuantity = (
  quantity,
  fromUnit,
  toUnit,
  packSize
) => {

  const value =
    Number(quantity);


  const from =
    normalizeUnit(fromUnit);


  const to =
    normalizeUnit(toUnit);


  const size =
    Number(packSize);


  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    return null;
  }


  if (
    !from ||
    !to
  ) {
    return null;
  }


  if (
    !Number.isFinite(size) ||
    size <= 0
  ) {
    return null;
  }


  /*
   * Same unit
   */

  if (
    from === to
  ) {
    return value;
  }


  /*
   * Example:
   *
   * 2 BOX
   * box contains 12 pcs
   *
   * → 24 PCS
   */

  if (
    isPackagingUnit(from) &&
    to === 'PCS'
  ) {

    return (
      value *
      size
    );
  }


  /*
   * Reverse:
   *
   * 24 PCS
   * box contains 12 pcs
   *
   * → 2 BOX
   */

  if (
    from === 'PCS' &&
    isPackagingUnit(to)
  ) {

    return (
      value /
      size
    );
  }


  return null;
};


/*
 * ============================================================
 * GET BASE UNIT
 * ============================================================
 */

export const getBaseUnit = unit => {

  const normalized =
    normalizeUnit(unit);


  if (!normalized) {
    return null;
  }


  switch (
    UNIT_FAMILY[normalized]
  ) {

    case 'WEIGHT':
      return 'MG';


    case 'VOLUME':
      return 'ML';


    case 'COUNT':
      return 'PCS';


    default:
      return null;
  }
};


/*
 * ============================================================
 * GET UNIT LABEL
 * ============================================================
 */

export const unitLabel = unit => {

  const normalized =
    normalizeUnit(unit);


  switch (
    normalized
  ) {

    case 'MG':
      return 'mg';


    case 'GRAM':
      return 'g';


    case 'KG':
      return 'kg';


    case 'QUINTAL':
      return 'quintal';


    case 'TON':
      return 'ton';


    case 'ML':
      return 'ml';


    case 'LITRE':
      return 'litre';


    case 'PCS':
      return 'pcs';


    case 'DOZEN':
      return 'dozen';


    case 'PAIR':
      return 'pair';


    case 'GROSS':
      return 'gross';


    case 'SCORE':
      return 'score';


    case 'PACK':
      return 'pack';


    case 'POUCH':
      return 'pouch';


    case 'BOX':
      return 'box';


    case 'BOTTLE':
      return 'bottle';


    case 'JAR':
      return 'jar';


    case 'TIN':
      return 'tin';


    case 'CAN':
      return 'can';


    case 'BAG':
      return 'bag';


    case 'SACK':
      return 'sack';


    case 'STRIP':
      return 'strip';


    case 'CARTON':
      return 'carton';


    case 'BUNDLE':
      return 'bundle';


    case 'TRAY':
      return 'tray';


    case 'CRATE':
      return 'crate';


    case 'ROLL':
      return 'roll';


    default:
      return 'units';
  }
};


/*
 * ============================================================
 * FORMAT QUANTITY
 * ============================================================
 */

export const formatQuantity = value => {

  const number =
    Number(value);


  if (
    !Number.isFinite(number)
  ) {
    return '0';
  }


  if (
    Number.isInteger(number)
  ) {
    return String(number);
  }


  return number
    .toFixed(6)
    .replace(
      /0+$/,
      ''
    )
    .replace(
      /\.$/,
      ''
    );
};


/*
 * ============================================================
 * FORMAT QUANTITY + UNIT
 * ============================================================
 */

export const formatQuantityWithUnit = (
  quantity,
  unit
) => {

  const normalized =
    normalizeUnit(unit);


  const formatted =
    formatQuantity(quantity);


  if (!normalized) {
    return formatted;
  }


  return `${formatted} ${unitLabel(normalized)}`;
};


/*
 * ============================================================
 * COMMON UNIT INFORMATION
 * ============================================================
 *
 * Useful for IntentHandler / UI.
 * ============================================================
 */

export const getUnitInfo = unit => {

  const normalized =
    normalizeUnit(unit);


  if (!normalized) {
    return null;
  }


  return {

    unit: normalized,

    family:
      UNIT_FAMILY[normalized] ||
      null,

    label:
      unitLabel(normalized),

    isPackaging:
      isPackagingUnit(normalized),

    isWeight:
      isWeightUnit(normalized),

    isVolume:
      isVolumeUnit(normalized),

    isCount:
      isCountUnit(normalized),

    baseUnit:
      getBaseUnit(normalized),

    conversionMultiplier:
      TO_BASE[normalized] ??
      null,

  };
};


/*
 * ============================================================
 * DEFAULT EXPORT
 * ============================================================
 */

export default {

  normalizeUnit,

  getUnitFamily,

  canConvertUnit,

  convertQuantity,

  convertQuantityDetailed,

  convertPackagingQuantity,

  isPackagingUnit,

  isWeightUnit,

  isVolumeUnit,

  isCountUnit,

  getBaseUnit,

  getUnitInfo,

  unitLabel,

  formatQuantity,

  formatQuantityWithUnit,

};