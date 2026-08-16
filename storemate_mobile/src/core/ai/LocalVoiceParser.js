/*
 * ============================================================
 * StoreMate Local Voice Parser
 * ============================================================
 *
 * OFFLINE-FIRST KIRANA VOICE ENGINE
 *
 * Understands:
 *
 * Hindi
 * Hinglish
 * English
 * Mixed Hindi + English
 *
 * Examples:
 *
 *   500 gram sugar
 *   aadha kilo chini
 *   paav kilo chawal
 *   2 packet biscuit
 *   do packet biscuit
 *   5 piece soap
 *   1 bottle milk
 *   1 dozen eggs
 *   10 cigarette
 *
 *   500 gram chini dalo
 *   biscuit ke 2 packet jodo
 *   5 cigarette add karo
 *
 *   mere paas Parle G kitna hai
 *   Parle G kitna stock hai
 *   sabudana kitna bacha hai
 *
 *   Rakesh ke khate mein 100 dalo
 *   Rakesh ko 100 udhaar do
 *   Rakesh se 100 mile
 *
 * IMPORTANT:
 *
 * This file NEVER writes to WatermelonDB.
 * IntentHandler.js is responsible for database writes.
 * ============================================================
 */


/*
 * ============================================================
 * LIMITS
 * ============================================================
 */

const MAX_TEXT_LENGTH = 500;

const MAX_QUANTITY = 100000;

const MAX_AMOUNT = 100000000;


/*
 * ============================================================
 * SYNONYMS
 * ============================================================
 */

const SYNONYMS = {

  /*
   * ----------------------------------------------------------
   * SALES
   * ----------------------------------------------------------
   */

  sell: 'sell',
  sale: 'sell',
  sales: 'sell',

  cell: 'sell',
  sel: 'sell',
  sal: 'sell',
  sall: 'sell',

  becho: 'sell',
  bech: 'sell',
  bechi: 'sell',
  bechna: 'sell',
  bechdo: 'sell',

  bikri: 'sell',
  bik: 'sell',

  bill: 'sell',
  billing: 'sell',


  /*
   * ----------------------------------------------------------
   * INVENTORY / ADD
   * ----------------------------------------------------------
   */

  add: 'add',
  added: 'add',

  ad: 'add',

  plus: 'add',

  jodo: 'add',
  jod: 'add',
  jorna: 'add',

  daalo: 'add',
  dalo: 'add',
  daal: 'add',
  dal: 'add',

  chadha: 'add',
  chadhao: 'add',
  chadao: 'add',

  bharo: 'add',
  bhar: 'add',

  bhandar: 'add',

  stock: 'stock',

  maal: 'stock',


  /*
   * ----------------------------------------------------------
   * SALES / INVENTORY HINDI
   * ----------------------------------------------------------
   */

  nikalo: 'remove',
  nikaalo: 'remove',
  nikal: 'remove',

  hatao: 'remove',
  htao: 'remove',

  kam: 'remove',


  /*
   * ----------------------------------------------------------
   * KHATA
   * ----------------------------------------------------------
   */

  udhaar: 'khata',
  udhar: 'khata',
  udhhar: 'khata',

  baki: 'khata',
  baaki: 'khata',

  khaata: 'khata',
  khata: 'khata',
  khate: 'khata',
  khato: 'khata',

  account: 'account',
  accounts: 'account',

  credit: 'credit',


  /*
   * ----------------------------------------------------------
   * PAYMENT
   * ----------------------------------------------------------
   */

  jama: 'received',
  jamaa: 'received',

  diye: 'received',
  diya: 'received',
  diyaa: 'received',

  receive: 'received',
  received: 'received',
  receiving: 'received',

  pay: 'received',
  paid: 'received',
  payment: 'received',

  mil: 'received',
  mile: 'received',
  mila: 'received',

  vasool: 'received',
  vasooli: 'received',

  liya: 'received',
  liye: 'received',


  /*
   * ----------------------------------------------------------
   * CASH
   * ----------------------------------------------------------
   */

  cash: 'cash',
  nagad: 'cash',
  nagdi: 'cash',
  rokad: 'cash',
  rokar: 'cash',


  /*
   * ----------------------------------------------------------
   * DISCOUNT
   * ----------------------------------------------------------
   */

  discount: 'discount',
  chhoot: 'discount',
  chut: 'discount',


  /*
   * ----------------------------------------------------------
   * CUSTOMER
   * ----------------------------------------------------------
   */

  grahak: 'customer',
  graahak: 'customer',

  customer: 'customer',
  customers: 'customer',

  account: 'account',

  naya: 'new',
  naye: 'new',

  new: 'new',

  create: 'create',
  make: 'create',
  open: 'create',

  banao: 'create',
  bnao: 'create',
  bana: 'create',
  banado: 'create',
  banaao: 'create',
  banaye: 'create',
  khol: 'create',
  kholo: 'create',
  kholna: 'create',


  /*
   * ----------------------------------------------------------
   * COMMON ACTION WORDS
   * ----------------------------------------------------------
   */

  karo: 'do',
  kar: 'do',

  kardo: 'do',
  kardena: 'do',

  do: 'do',

  please: 'please',
  pls: 'please',


  /*
   * ----------------------------------------------------------
   * NUMBER WORDS
   * ----------------------------------------------------------
   */

  ek: '1',
  aik: '1',
  eka: '1',

  do: '2',
  dono: '2',

  teen: '3',
  tin: '3',

  char: '4',
  chaar: '4',

  panch: '5',
  paanch: '5',

  chhe: '6',
  che: '6',
  chhah: '6',

  saat: '7',
  sat: '7',

  aath: '8',
  ath: '8',

  nau: '9',
  naoo: '9',

  das: '10',

  gyarah: '11',
  gyaarah: '11',

  barah: '12',
  baarah: '12',

  terah: '13',
  chaudah: '14',
  pandrah: '15',
  solah: '16',
  satrah: '17',
  atharah: '18',
  unnis: '19',
  bees: '20',

  ikkis: '21',
  bais: '22',
  teiis: '23',
  teis: '23',
  chaubis: '24',
  pachis: '25',
  chhabis: '26',
  satais: '27',
  athais: '28',
  untees: '29',
  tees: '30',

  chaalis: '40',
  chalis: '40',

  pachaas: '50',
  pachas: '50',

  saath: '60',
  sattar: '70',
  assi: '80',
  nabbe: '90',

  sau: '100',
  so: '100',

  hundred: '100',

  hazaar: '1000',
  hazar: '1000',
  thousand: '1000',

  lakh: '100000',
  lac: '100000',
};


/*
 * ============================================================
 * DEVANAGARI NUMBER WORDS
 * ============================================================
 */

const DEVANAGARI_NUMBERS = {

  'एक': 1,
  'दो': 2,
  'तीन': 3,
  'चार': 4,
  'पाँच': 5,
  'पांच': 5,
  'छह': 6,
  'छः': 6,
  'सात': 7,
  'आठ': 8,
  'नौ': 9,
  'दस': 10,

  'ग्यारह': 11,
  'बारह': 12,
  'तेरह': 13,
  'चौदह': 14,
  'पंद्रह': 15,
  'पन्द्रह': 15,
  'सोलह': 16,
  'सत्रह': 17,
  'अठारह': 18,
  'उन्नीस': 19,
  'बीस': 20,

  'तीस': 30,
  'चालीस': 40,
  'पचास': 50,
  'साठ': 60,
  'सत्तर': 70,
  'अस्सी': 80,
  'नब्बे': 90,

  'सौ': 100,
  'हज़ार': 1000,
  'हजार': 1000,
  'लाख': 100000,
};


/*
 * ============================================================
 * UNIT DEFINITIONS
 * ============================================================
 *
 * IMPORTANT:
 * The returned unit is normalized.
 *
 * KG
 * GRAM
 * LITRE
 * ML
 * PIECE
 * PACK
 * BOTTLE
 * BOX
 * DOZEN
 * STRIP
 * CARTON
 * BUNDLE
 * ============================================================
 */

const UNIT_ALIASES = {

  /*
   * Weight
   */

  kg: 'KG',
  kgs: 'KG',
  kilo: 'KG',
  kilos: 'KG',
  kilogram: 'KG',
  kilograms: 'KG',

  kiloGram: 'KG',

  'किलो': 'KG',
  'किलोग्राम': 'KG',


  gram: 'GRAM',
  grams: 'GRAM',
  gm: 'GRAM',
  gms: 'GRAM',
  g: 'GRAM',

  'ग्राम': 'GRAM',
  'ग्राम्': 'GRAM',


  /*
   * Liquid
   */

  litre: 'LITRE',
  liter: 'LITRE',
  litres: 'LITRE',
  liters: 'LITRE',
  l: 'LITRE',

  'लीटर': 'LITRE',
  'लीटर': 'LITRE',


  ml: 'ML',
  millilitre: 'ML',
  millilitres: 'ML',
  milliliter: 'ML',
  milliliters: 'ML',

  'मिली': 'ML',
  'मिलीलीटर': 'ML',


  /*
   * Individual item
   */

  piece: 'PIECE',
  pieces: 'PIECE',
  pc: 'PIECE',
  pcs: 'PIECE',
  piecees: 'PIECE',

  'पीस': 'PIECE',
  'नग': 'PIECE',
  nag: 'PIECE',
  नग: 'PIECE',


  /*
   * Packets
   */

  packet: 'PACK',
  packets: 'PACK',
  pkt: 'PACK',
  pkts: 'PACK',
  pack: 'PACK',
  packs: 'PACK',

  'पैकेट': 'PACK',
  'पैकेट्स': 'PACK',


  /*
   * Bottle
   */

  bottle: 'BOTTLE',
  bottles: 'BOTTLE',
  btl: 'BOTTLE',

  'बोतल': 'BOTTLE',
  'बॉटल': 'BOTTLE',


  /*
   * Box
   */

  box: 'BOX',
  boxes: 'BOX',
  dabba: 'BOX',
  dabbe: 'BOX',
  dibba: 'BOX',
  dibbe: 'BOX',

  'डिब्बा': 'BOX',
  'डिब्बे': 'BOX',
  'डब्बा': 'BOX',
  'डब्बे': 'BOX',


  /*
   * Dozen
   */

  dozen: 'DOZEN',
  dz: 'DOZEN',

  'दर्जन': 'DOZEN',


  /*
   * Strip
   */

  strip: 'STRIP',
  strips: 'STRIP',

  'स्ट्रिप': 'STRIP',


  /*
   * Carton
   */

  carton: 'CARTON',
  cartons: 'CARTON',

  'कार्टन': 'CARTON',


  /*
   * Bundle
   */

  bundle: 'BUNDLE',
  bundles: 'BUNDLE',

  gaddi: 'BUNDLE',
  gaddi: 'BUNDLE',

  'बंडल': 'BUNDLE',
};


/*
 * ============================================================
 * FRACTION / APPROXIMATE QUANTITY WORDS
 * ============================================================
 */

const FRACTION_WORDS = {

  aadha: 0.5,
  aadhi: 0.5,
  aadhe: 0.5,
  half: 0.5,

  paav: 0.25,
  pav: 0.25,
  pauna: 0.75,
  paune: 0.75,

  quarter: 0.25,

  sava: 1.25,
  sawa: 1.25,

  dedh: 1.5,
  dedha: 1.5,
  dedhi: 1.5,

  dhai: 2.5,
  dhaai: 2.5,

  'डेढ़': 1.5,
  'ढाई': 2.5,
  'आधा': 0.5,
  'आधे': 0.5,
  'पाव': 0.25,
  'पौना': 0.75,
  'सवा': 1.25,
};


/*
 * ============================================================
 * STOP WORDS
 * ============================================================
 */

const STOP_WORDS = new Set([

  /*
   * Actions
   */

  'create',
  'make',
  'open',
  'add',
  'new',

  'sell',
  'sale',
  'sales',

  'remove',
  'stock',

  'do',
  'please',

  /*
   * Articles
   */

  'an',
  'a',
  'the',

  /*
   * Customer
   */

  'account',
  'accounts',
  'customer',
  'customers',

  'khata',
  'khate',

  /*
   * Hindi customer words
   */

  'banao',
  'bnao',
  'bana',
  'banado',
  'banaao',

  /*
   * Connectors
   */

  'for',
  'of',
  'to',
  'from',
  'on',

  'ka',
  'ke',
  'ki',
  'k',

  'mein',
  'me',

  'ko',
  'se',
  'ne',

  'naam',
  'named',
  'called',

  /*
   * Quantity / units
   */

  'kg',
  'kgs',
  'kilo',
  'kilos',
  'kilogram',
  'kilograms',

  'gram',
  'grams',
  'gm',
  'gms',
  'g',

  'litre',
  'liter',
  'litres',
  'liters',
  'l',

  'ml',

  'piece',
  'pieces',
  'pc',
  'pcs',

  'packet',
  'packets',
  'pkt',
  'pkts',
  'pack',
  'packs',

  'bottle',
  'bottles',
  'btl',

  'box',
  'boxes',

  'dabba',
  'dabbe',
  'dibba',
  'dibbe',

  'dozen',
  'dz',

  'strip',
  'strips',

  'carton',
  'cartons',

  'bundle',
  'bundles',

  /*
   * Hindi units
   */

  'किलो',
  'किलोग्राम',
  'ग्राम',
  'लीटर',
  'मिली',
  'पीस',
  'नग',
  'पैकेट',
  'बोतल',
  'डिब्बा',
  'डिब्बे',
  'दर्जन',
  'स्ट्रिप',
  'कार्टन',
  'बंडल',

  /*
   * Query words
   */

  'how',
  'much',
  'many',
  'have',
  'has',
  'left',
  'remaining',

  'kitna',
  'kitni',
  'kitne',
  'bacha',
  'bache',
  'baki',

  /*
   * Cash
   */

  'cash',
  'nagad',
  'rokar',

  /*
   * Payment
   */

  'received',
  'payment',
  'paid',
  'jama',

  /*
   * Misc
   */

  'today',
  'aaj',
]);


/*
 * ============================================================
 * CUSTOMER COMMAND WORDS
 * ============================================================
 */

const CUSTOMER_COMMAND_WORDS = new Set([

  'create',
  'make',
  'open',
  'add',
  'new',

  'account',
  'accounts',

  'customer',
  'customers',

  'khata',
  'khate',

  'banao',
  'bnao',
  'bana',
  'banado',
  'banaao',

  'karo',
  'kar',
  'do',

  'please',

  'naam',
  'named',
  'called',

  'grahak',
]);


/*
 * ============================================================
 * BASIC HELPERS
 * ============================================================
 */

const cleanText = value => {

  if (
    typeof value !==
    'string'
  ) {
    return '';
  }


  return value
    .replace(
      /[\u0000-\u001F\u007F]/g,
      ''
    )
    .trim()
    .slice(
      0,
      MAX_TEXT_LENGTH
    );
};


const titleCase = value => {

  const cleaned =
    cleanText(
      value
    );


  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map(
      part =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(' ');
};


/*
 * ============================================================
 * DEVANAGARI DIGIT CONVERSION
 * ============================================================
 */

const convertDevanagariDigits = text => {

  const map = {

    '०': '0',
    '१': '1',
    '२': '2',
    '३': '3',
    '४': '4',
    '५': '5',
    '६': '6',
    '७': '7',
    '८': '8',
    '९': '9',
  };


  return text.replace(
    /[०-९]/g,
    digit =>
      map[digit] ||
      digit
  );
};


/*
 * ============================================================
 * DEVANAGARI NUMBER WORD CONVERSION
 * ============================================================
 */

const convertDevanagariNumberWords = text => {

  return text
    .split(/\s+/)
    .map(
      word =>
        DEVANAGARI_NUMBERS[word] !==
        undefined
          ? String(
              DEVANAGARI_NUMBERS[
                word
              ]
            )
          : word
    )
    .join(' ');
};


/*
 * ============================================================
 * SPOKEN NUMBER NORMALIZATION
 * ============================================================
 *
 * Handles:
 *
 * do sau
 * paanch sau
 * do hazaar
 * teen hazaar
 * one hundred
 * two hundred
 * five thousand
 *
 * Also:
 *
 * aadha kilo
 * paav kilo
 * dedh kilo
 * dhai kilo
 * ============================================================
 */

const normalizeSpokenNumbers = text => {

  let working =
    convertDevanagariDigits(
      text
    );


  working =
    convertDevanagariNumberWords(
      working
    );


  const words =
    working
      .split(/\s+/)
      .filter(Boolean);


  const output =
    [];


  const SMALL_NUMBERS = {

    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,

    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,

    twenty: 20,

    ek: 1,
    do: 2,
    teen: 3,
    tin: 3,
    char: 4,
    chaar: 4,
    panch: 5,
    paanch: 5,
    chhe: 6,
    che: 6,
    chhah: 6,
    saat: 7,
    sat: 7,
    aath: 8,
    ath: 8,
    nau: 9,
    das: 10,
  };


  const MULTIPLIERS = {

    hundred: 100,
    sau: 100,
    so: 100,

    thousand: 1000,
    hazaar: 1000,
    hazar: 1000,

    lakh: 100000,
    lac: 100000,
  };


  for (
    let i = 0;
    i < words.length;
    i++
  ) {

    const word =
      words[i];

    const next =
      words[i + 1];


    /*
     * Fraction words.
     */

    if (
      FRACTION_WORDS[
        word
      ] !== undefined
    ) {

      output.push(
        String(
          FRACTION_WORDS[
            word
          ]
        )
      );

      continue;
    }


    /*
     * Simple English/Hinglish number
     * followed by multiplier.
     */

    if (
      SMALL_NUMBERS[word] !==
        undefined &&
      MULTIPLIERS[next] !==
        undefined
    ) {

      output.push(
        String(
          SMALL_NUMBERS[word] *
          MULTIPLIERS[next]
        )
      );

      i++;

      continue;
    }


    /*
     * Hindi numeric word followed
     * by multiplier.
     */

    if (
      !Number.isNaN(
        Number(word)
      ) &&
      MULTIPLIERS[next] !==
        undefined
    ) {

      output.push(
        String(
          Number(word) *
          MULTIPLIERS[next]
        )
      );

      i++;

      continue;
    }


    /*
     * Standalone number words.
     */

    if (
      SMALL_NUMBERS[word] !==
      undefined
    ) {

      output.push(
        String(
          SMALL_NUMBERS[word]
        )
      );

      continue;
    }


    /*
     * Standalone multiplier.
     */

    if (
      MULTIPLIERS[word] !==
      undefined
    ) {

      output.push(
        String(
          MULTIPLIERS[word]
        )
      );

      continue;
    }


    output.push(
      word
    );
  }


  return output.join(
    ' '
  );
};


/*
 * ============================================================
 * NORMALIZATION
 * ============================================================
 */

const normalizeText = text => {

  const rawBase =
    cleanText(
      text
    )
      .toLowerCase()
      .replace(
        /['’]/g,
        ''
      )
      .replace(
        /,/g,
        ''
      )
      .replace(
        /\s+/g,
        ' '
      );


  const numberNormalized =
    normalizeSpokenNumbers(
      rawBase
    );


  const clean =
    numberNormalized
      .split(/\s+/)
      .map(
        word =>
          SYNONYMS[word] ||
          word
      )
      .join(' ');


  return {

    raw:
      numberNormalized,

    clean,
  };
};


/*
 * ============================================================
 * RESULT BUILDER
 * ============================================================
 */

const makeResult = ({

  intent,

  product = null,

  qty = 1,

  unit = null,

  amount = null,

  discount_percent = null,

  new_price = null,

  customer_name = null,

  time_period = null,

  payment_type = null,

  confidence = 0.95,

}) => ({

  intent,

  product,

  qty,

  unit,

  discount_percent,

  new_price,

  customer_name,

  time_period,

  amount,

  payment_type,

  confidence,

  source:
    'local_rules',
});


/*
 * ============================================================
 * UNIT EXTRACTION
 * ============================================================
 */

const extractUnit = raw => {

  if (
    !raw
  ) {
    return null;
  }


  const words =
    raw
      .toLowerCase()
      .split(/\s+/);


  for (
    const word of words
  ) {

    if (
      UNIT_ALIASES[word]
    ) {

      return UNIT_ALIASES[
        word
      ];
    }
  }


  return null;
};


/*
 * ============================================================
 * UNIT POSITION / QUANTITY
 * ============================================================
 */

const extractQuantityAndUnit = raw => {

  if (
    !raw
  ) {

    return {

      qty:
        1,

      unit:
        null,
    };
  }


  const normalized =
    raw.toLowerCase();


  /*
   * ----------------------------------------------------------
   * Fraction + unit
   *
   * aadha kilo
   * paav kilo
   * half kg
   * dedh kilo
   * ----------------------------------------------------------
   */

  for (
    const [
      fractionWord,
      fractionValue
    ] of Object.entries(
      FRACTION_WORDS
    )
  ) {

    const escaped =
      fractionWord
        .replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        );


    const pattern =
      new RegExp(
        `\\b${escaped}\\s+([^\\s]+)`,
        'i'
      );


    const match =
      normalized.match(
        pattern
      );


    if (
      match
    ) {

      const unit =
        UNIT_ALIASES[
          match[1]
        ];


      if (
        unit
      ) {

        return {

          qty:
            fractionValue,

          unit,
        };
      }
    }
  }


  /*
   * ----------------------------------------------------------
   * Numeric quantity + unit
   *
   * 500 gram
   * 2 packet
   * 5 piece
   * ----------------------------------------------------------
   */

  const numericUnitPattern =
    /(?:^|\s)(\d+(?:\.\d+)?)\s*([a-zA-Z\u0900-\u097F]+)(?:\s|$)/i;


  const numericUnitMatch =
    normalized.match(
      numericUnitPattern
    );


  if (
    numericUnitMatch
  ) {

    const value =
      Number(
        numericUnitMatch[1]
      );


    const unit =
      UNIT_ALIASES[
        numericUnitMatch[2]
      ];


    if (
      Number.isFinite(
        value
      ) &&
      value > 0 &&
      unit
    ) {

      return {

        qty:
          Math.min(
            value,
            MAX_QUANTITY
          ),

        unit,
      };
    }
  }


  /*
   * ----------------------------------------------------------
   * Quantity without explicit unit
   * ----------------------------------------------------------
   */

  const quantityMatch =
    normalized.match(
      /(?:^|\s)(\d+(?:\.\d+)?)(?:\s|$)/
    );


  if (
    quantityMatch
  ) {

    const value =
      Number(
        quantityMatch[1]
      );


    if (
      Number.isFinite(
        value
      ) &&
      value > 0
    ) {

      return {

        qty:
          Math.min(
            value,
            MAX_QUANTITY
          ),

        unit:
          null,
      };
    }
  }


  /*
   * Default.
   */

  return {

    qty:
      1,

    unit:
      null,
  };
};


/*
 * ============================================================
 * KNOWN CUSTOMER MATCHING
 * ============================================================
 */

const matchKnownCustomer = (
  raw,
  customerNames
) => {

  if (
    !Array.isArray(
      customerNames
    )
  ) {
    return null;
  }


  const lower =
    raw.toLowerCase();


  const sorted =
    customerNames
      .filter(Boolean)
      .map(
        name =>
          String(
            name
          )
            .trim()
      )
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.length -
          a.length
      );


  return (
    sorted.find(
      name =>
        lower.includes(
          name.toLowerCase()
        )
    ) ||
    null
  );
};


/*
 * ============================================================
 * CUSTOMER NAME VALIDATION
 * ============================================================
 */

const isValidCustomerName = name => {

  if (
    !name ||
    typeof name !==
      'string'
  ) {

    return false;
  }


  const cleaned =
    name
      .trim()
      .replace(
        /\s+/g,
        ' '
      );


  if (
    cleaned.length <
      2 ||
    cleaned.length >
      100
  ) {

    return false;
  }


  if (
    /^\d+(?:\.\d+)?$/.test(
      cleaned
    )
  ) {

    return false;
  }


  const words =
    cleaned
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);


  if (
    words.length ===
    0
  ) {

    return false;
  }


  if (
    words.every(
      word =>
        CUSTOMER_COMMAND_WORDS.has(
          word
        )
    )
  ) {

    return false;
  }


  const badName =
    new Set([

      'account',
      'accounts',

      'customer',
      'customers',

      'khata',
      'khate',

      'product',
      'products',

      'item',
      'items',

      'new',
      'naya',

      'create',
      'make',
      'open',

      'add',

      'please',

      'for',
      'of',

      'named',
      'called',

      'kitna',
      'kitni',
      'kitne',

      'stock',

      'bacha',
      'bache',

      'left',

      'how',
      'much',
      'many',

    ]);


  if (
    words.some(
      word =>
        badName.has(
          word
        )
    )
  ) {

    return false;
  }


  return true;
};


/*
 * ============================================================
 * CLEAN CUSTOMER NAME
 * ============================================================
 */

const cleanCustomerName = value => {

  if (
    !value ||
    typeof value !==
      'string'
  ) {

    return null;
  }


  let name =
    value
      .trim()
      .replace(
        /\s+/g,
        ' '
      );


  name =
    name.replace(
      /^(?:please|pls)\s+/i,
      ''
    );


  name =
    name.replace(
      /\s+(?:please|pls)$/i,
      ''
    );


  name =
    name.replace(
      /^(?:naya|new)\s+/i,
      ''
    );


  name =
    name.replace(
      /\s+(?:naya|new)$/i,
      ''
    );


  name =
    name.replace(
      /\s+(?:banao|bnao|bana|banado|banaao|karo|kar|do|khol|kholo|khol\s+do)$/i,
      ''
    );


  return isValidCustomerName(
    name
  )
    ? titleCase(
        name
      )
    : null;
};


/*
 * ============================================================
 * CUSTOMER CREATION
 * ============================================================
 */

const extractCustomerCreation = raw => {

  const normalized =
    raw
      .toLowerCase()
      .replace(
        /\s+/g,
        ' '
      )
      .trim();


  const patterns = [

    /^(?:please|pls)\s+(?:create|make|open|add)\s+(?:a\s+|an\s+|new\s+)?(.+?)\s+(?:account|customer|khata)$/i,

    /^(?:create|make|open|add)\s+(?:a\s+|an\s+|new\s+)?(.+?)\s+(?:account|customer|khata)$/i,

    /^(?:please\s+)?(?:create|make|open|add)\s+(?:a\s+|an\s+|new\s+)?(?:account|customer|khata)\s+(?:for|of)\s+(.+)$/i,

    /^(?:new|naya)\s+(.+?)\s+(?:account|customer|khata)$/i,

    /^(.+?)\s+(?:account|customer|khata)\s+(?:banao|bnao|bana|banado|banaao|karo|kar\s+do|khol|kholo|khol\s+do)$/i,

    /^(.+?)\s+(?:ka|k|ke|ki)\s+(?:account|customer|khata|khate)\s+(?:banao|bnao|bana|banado|banaao|karo|kar\s+do|khol|kholo|khol\s+do)$/i,

    /^(.+?)\s+(?:ka|k|ke|ki)\s+naya\s+(?:account|customer|khata|khate)\s+(?:banao|bnao|bana|banado|banaao|karo|kar\s+do|khol|kholo|khol\s+do)$/i,

    /^(.+?)\s+(?:ke\s+naam\s+ka|ke\s+naam\s+ke|ke\s+naam\s+ki)\s+(?:account|customer|khata|khate)\s+(?:banao|bnao|bana|banado|banaao|karo|kar\s+do|khol|kholo|khol\s+do)$/i,

    /^(?:naya|new)\s+(?:account|customer|khata|khate)\s+(.+?)\s+(?:ka|k|ke|ki)\s+(?:banao|bnao|bana|banado|banaao|karo|kar\s+do)$/i,

    /^(?:account|customer|khata|khate)\s+(?:banao|bnao|bana|banado|banaao)\s+(.+?)\s+(?:ka|k|ke|ki)$/i,

  ];


  for (
    const pattern of patterns
  ) {

    const match =
      normalized.match(
        pattern
      );


    if (
      !match ||
      !match[1]
    ) {

      continue;
    }


    const customerName =
      cleanCustomerName(
        match[1]
      );


    if (
      customerName
    ) {

      return customerName;
    }
  }


  return null;
};


/*
 * ============================================================
 * PAYMENT / FLAT UDHAAR
 * ============================================================
 *
 * IMPORTANT:
 *
 * These patterns are matched against RAW text.
 *
 * This prevents:
 *
 * dalo -> add
 * udhaar -> khata
 *
 * from destroying Hindi patterns.
 * ============================================================
 */

const extractPayment = (
  clean,
  raw,
  customerNames
) => {

  const knownCustomer =
    matchKnownCustomer(
      raw,
      customerNames
    );


  const amountMatch =
    clean.match(
      /(?:₹|rs\.?|rupees?)?\s*(\d+(?:\.\d+)?)/i
    );


  const KHATA_TRIGGER =
    /\b(received|jama|paid|payment|mil|mile|diye|diya|se|ne|dalo|daalo|chadhao|udhaar|udhar|credit|de do|khate|khata|account)\b/i;


  if (
    knownCustomer &&
    amountMatch &&
    KHATA_TRIGGER.test(
      raw
    )
  ) {

    const isReceived =
      /\b(received|jama|paid|payment|mil|mile|diye|diya|se|ne|from)\b/i.test(
        raw
      );


    return {

      customer_name:
        knownCustomer,

      amount:
        Number(
          amountMatch[1]
        ),

      isReceived,
    };
  }


  /*
   * ----------------------------------------------------------
   * New customer / flat Khata patterns
   * ----------------------------------------------------------
   */

  const namePatterns = [

    {
      /*
       * 800 rupees on Rakesh account
       */

      pattern:
        /(\d+(?:\.\d+)?)\s*(?:rupees?|rs\.?|₹)?\s*(?:on|for)\s+([a-zA-Z][a-zA-Z .'-]*?)\s*(?:account|khata)?$/i,

      isReceived:
        false,
    },


    {
      /*
       * Rakesh ke khate mein 100 dalo
       */

      pattern:
        /^([a-zA-Z][a-zA-Z .'-]*?)\s+(?:ke|ka|ki)\s+khat[ae]\s+mein\s+(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?)?\s*(?:dalo|daalo|chadhao|chadao|de\s*do)?$/i,

      isReceived:
        false,
    },


    {
      /*
       * Rakesh ke account mein 100 add karo
       */

      pattern:
        /^([a-zA-Z][a-zA-Z .'-]*?)\s+(?:ke|ka|ki)\s+(?:account|khata|khate)\s+(?:mein|me)\s+(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?)?\s*(?:add|dalo|daalo|jodo|chadhao|chadao|de\s*do)?$/i,

      isReceived:
        false,
    },


    {
      /*
       * credit 500 to Rakesh
       */

      pattern:
        /^credit\s+(\d+(?:\.\d+)?)\s*(?:rupees?)?\s*(?:to|on)\s+([a-zA-Z][a-zA-Z .'-]*)$/i,

      isReceived:
        false,
    },


    {
      /*
       * Rakesh ko 500 udhaar do
       */

      pattern:
        /^([a-zA-Z][a-zA-Z .'-]*?)\s+ko\s+(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?)?\s*(?:udhaar|udhar)?\s*(?:de\s*do|do|diye|diya)?$/i,

      isReceived:
        false,
    },


    {
      /*
       * Rakesh se 500 mile
       */

      pattern:
        /^([a-zA-Z][a-zA-Z .'-]*?)\s+(?:se|ne)\s+(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?)?\s*(?:mile|mil|gaye|diye|diya|received|jama)?$/i,

      isReceived:
        true,
    },

  ];


  for (
    const {
      pattern,
      isReceived,
    } of namePatterns
  ) {

    const match =
      raw.match(
        pattern
      );


    if (
      !match
    ) {

      continue;
    }


    const g1IsNumber =
      /^\d/.test(
        match[1]
      );


    const amount =
      Number(
        g1IsNumber
          ? match[1]
          : match[2]
      );


    const rawName =
      g1IsNumber
        ? match[2]
        : match[1];


    if (
      Number.isFinite(
        amount
      ) &&
      amount > 0 &&
      amount <= MAX_AMOUNT &&
      rawName
    ) {

      return {

        customer_name:
          titleCase(
            rawName.trim()
          ),

        amount,

        isReceived,
      };
    }
  }


  /*
   * ----------------------------------------------------------
   * English fallback
   * ----------------------------------------------------------
   */

  const fallbackPatterns = [

    /^(?:([a-zA-Z][a-zA-Z .'-]*)\s+)?(?:ne|se)\s+(\d+(?:\.\d+)?)\s+received$/i,

    /^(?:([a-zA-Z][a-zA-Z .'-]*)\s+)?(\d+(?:\.\d+)?)\s+received$/i,

    /^(?:([a-zA-Z][a-zA-Z .'-]*)\s+)?received\s+(\d+(?:\.\d+)?)$/i,

    /^received\s+(\d+(?:\.\d+)?)\s+from\s+([a-zA-Z][a-zA-Z .'-]*)$/i,

  ];


  for (
    const pattern of fallbackPatterns
  ) {

    const match =
      raw.match(
        pattern
      );


    if (
      !match
    ) {

      continue;
    }


    let customerName =
      null;

    let amount =
      null;


    if (
      pattern.source.startsWith(
        '^received'
      )
    ) {

      amount =
        Number(
          match[1]
        );

      customerName =
        match[2];

    } else {

      customerName =
        match[1];

      amount =
        Number(
          match[2]
        );
    }


    if (
      Number.isFinite(
        amount
      ) &&
      amount > 0
    ) {

      return {

        customer_name:
          customerName
            ? titleCase(
                customerName
              )
            : knownCustomer,

        amount,

        isReceived:
          true,
      };
    }
  }


  return null;
};


/*
 * ============================================================
 * INVENTORY PRODUCT MATCH
 * ============================================================
 */

const productFromInventory = (
  raw,
  inventoryNames
) => {

  if (
    !Array.isArray(
      inventoryNames
    ) ||
    inventoryNames.length ===
      0
  ) {

    return null;
  }


  const lower =
    raw.toLowerCase();


  const sorted =
    [...inventoryNames]
      .filter(Boolean)
      .map(
        name =>
          String(
            name
          ).trim()
      )
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.length -
          a.length
      );


  return (
    sorted.find(
      name =>
        lower.includes(
          name.toLowerCase()
        )
    ) ||
    null
  );
};


/*
 * ============================================================
 * PRODUCT FALLBACK
 * ============================================================
 *
 * This is intentionally conservative.
 *
 * Words like:
 *
 * how
 * much
 * stock
 * have
 * bacha
 *
 * must NEVER become the product name.
 * ============================================================
 */

const productFromWords = (
  raw,
  inventoryNames
) => {

  const exact =
    productFromInventory(
      raw,
      inventoryNames
    );


  if (
    exact
  ) {

    return exact;
  }


  const tokens =
    raw
      .split(/\s+/)
      .filter(
        word => {

          if (
            !word
          ) {
            return false;
          }


          /*
           * Numbers.
           */

          if (
            /^(?:₹|rs\.?|rupees?)?\d+(?:\.\d+)?$/i.test(
              word
            )
          ) {

            return false;
          }


          /*
           * Units.
           */

          if (
            UNIT_ALIASES[
              word
            ]
          ) {

            return false;
          }


          /*
           * Fraction words.
           */

          if (
            FRACTION_WORDS[
              word
            ] !==
            undefined
          ) {

            return false;
          }


          /*
           * Stop words.
           */

          if (
            STOP_WORDS.has(
              word
            )
          ) {

            return false;
          }


          /*
           * Additional action/query words.
           */

          const ignored =
            [

              'sell',
              'becho',
              'bechi',
              'bikri',
              'sale',
              'bill',

              'add',
              'jodo',
              'daalo',
              'dalo',
              'stock',
              'plus',

              'remove',

              'khata',
              'khate',

              'cash',
              'nagad',
              'rokar',

              'received',
              'from',

              'ne',
              'se',

              'discount',
              'percent',

              'payment',
              'jama',

              'create',
              'make',
              'open',
              'new',

              'account',
              'accounts',

              'customer',
              'customers',

              'banao',
              'bnao',
              'bana',
              'banado',
              'banaao',

              'named',
              'called',

              'how',
              'much',
              'many',

              'have',
              'has',

              'left',
              'remaining',

              'kitna',
              'kitni',
              'kitne',

              'mere',
              'mera',
              'meri',
              'pass',

              'paas',

              'bacha',
              'bache',
              'baki',

              'hai',
              'hain',

              'today',
              'aaj',

              'kitna',
              'kitni',
              'kitne',

              'ke',
              'ka',
              'ki',
              'ko',
              'mein',
              'me',

              'karo',
              'kar',
              'do',

            ];


          if (
            ignored.includes(
              word
            )
          ) {

            return false;
          }


          return true;
        }
      );


  return tokens.length
    ? titleCase(
        tokens.join(
          ' '
        )
      )
    : null;
};


/*
 * ============================================================
 * STOCK / INVENTORY QUERY DETECTION
 * ============================================================
 */

const isInventoryQuery = (
  raw,
  clean
) => {

  return (

    /*
     * English
     */

    /\b(how\s+much|how\s+many|stock|inventory|have|has|left|remaining)\b/i.test(
      raw
    )

    ||

    /*
     * Hindi / Hinglish
     */

    /\b(kitna|kitni|kitne|mere\s+pass|mere\s+paas|mera\s+pass|meri\s+pass|bacha|bache|baki|baaki)\b/i.test(
      raw
    )

    ||

    /*
     * Devanagari
     */

    /(?:कितना|कितनी|कितने|स्टॉक|माल|बचा|बचे|बाकी|पास)/i.test(
      raw
    )
  );
};


/*
 * ============================================================
 * KHATA QUERY DETECTION
 * ============================================================
 */

const isKhataQuery = raw => {

  return (

    /\b(khata|khate|udhaar|udhar|baki|baaki|credit|account)\b/i.test(
      raw
    )

    ||

    /(?:उधार|उधारी|खाता|खाते|बकाया|क्रेडिट)/i.test(
      raw
    )
  );
};


/*
 * ============================================================
 * TODAY KHATA SUMMARY DETECTION
 * ============================================================
 */

const isTodayKhataSummary = raw => {

  const today =
    /\b(today|aaj|aajki|aaj\s+ki|आज|आजकी|आज\s+की)\b/i.test(
      raw
    );


  const khata =
    /\b(udhaar|udhar|udhari|baki|baaki|khata|khate|credit|account)\b/i.test(
      raw
    )
    ||
    /(?:उधार|उधारी|बकाया|खाता|खाते|क्रेडिट)/i.test(
      raw
    );


  const summaryWords =
    /\b(kitna|kitni|kitne|how\s+much|how\s+many|total|amount|log|customer|customers|people|diya|diye|given|gave)\b/i.test(
      raw
    )
    ||
    /(?:कितना|कितनी|कितने|कुल|लोग|ग्राहक)/i.test(
      raw
    );


  return (
    today &&
    khata &&
    summaryWords
  );
};


/*
 * ============================================================
 * MAIN LOCAL PARSER
 * ============================================================
 */

export function parseVoiceCommandLocally(
  text,
  inventoryNames = [],
  customerNames = []
) {

  const {
    raw,
    clean,
  } =
    normalizeText(
      text
    );


  /*
   * ==========================================================
   * EMPTY
   * ==========================================================
   */

  if (
    !raw
  ) {

    return makeResult({

      intent:
        'unknown',

      confidence:
        0,
    });
  }


  /*
   * ==========================================================
   * CUSTOMER CREATION
   * ==========================================================
   *
   * MUST COME FIRST.
   * ==========================================================
   */

  const customer =
    extractCustomerCreation(
      raw
    );


  if (
    customer
  ) {

    return makeResult({

      intent:
        'customer.create',

      customer_name:
        customer,

      confidence:
        0.99,
    });
  }


  /*
   * ==========================================================
   * PAYMENT / FLAT UDHAAR
   * ==========================================================
   */

  const payment =
    extractPayment(
      clean,
      raw,
      customerNames
    );


  if (
    payment &&
    payment.customer_name
  ) {

    if (
      payment.isReceived
    ) {

      return makeResult({

        intent:
          'khata.credit',

        customer_name:
          payment.customer_name,

        amount:
          payment.amount,

        confidence:
          0.97,
      });

    }


    /*
     * Customer is being given credit.
     */

    return makeResult({

      intent:
        'sale.create',

      customer_name:
        payment.customer_name,

      amount:
        payment.amount,

      payment_type:
        'KHATA',

      confidence:
        0.97,
    });
  }


  /*
   * ==========================================================
   * DISCOUNT
   * ==========================================================
   */

  const discountMatch =
    clean.match(
      /(\d+(?:\.\d+)?)\s*(?:%|percent|discount)/
    );


  if (
    discountMatch
  ) {

    const discount =
      Number(
        discountMatch[1]
      );


    if (
      Number.isFinite(
        discount
      ) &&
      discount >= 0 &&
      discount <= 100
    ) {

      return makeResult({

        intent:
          'pos.apply_discount',

        discount_percent:
          discount,

        confidence:
          0.97,
      });
    }
  }


  /*
   * ==========================================================
   * TODAY KHATA SUMMARY
   * ==========================================================
   */

  if (
    isTodayKhataSummary(
      raw
    )
  ) {

    return makeResult({

      intent:
        'query.khata.summary',

      time_period:
        'today',

      confidence:
        0.98,
    });
  }


  /*
   * ==========================================================
   * KHATA QUERY
   * ==========================================================
   */

  if (
    isKhataQuery(
      raw
    )
  ) {

    const matchedCustomer =
      matchKnownCustomer(
        raw,
        customerNames
      );


    return makeResult({

      intent:
        'query.khata',

      customer_name:
        matchedCustomer,

      time_period:
        /\b(today|aaj|aajki|aaj\s+ki|आज|आजकी|आज\s+की)\b/i.test(
          raw
        )
          ? 'today'
          : null,

      confidence:
        matchedCustomer
          ? 0.95
          : 0.90,
    });
  }


  /*
   * ==========================================================
   * QUANTITY + UNIT
   * ==========================================================
   */

  const {
    qty,
    unit,
  } =
    extractQuantityAndUnit(
      raw
    );


  /*
   * ==========================================================
   * PRODUCT
   * ==========================================================
   */

  const product =
    productFromWords(
      raw,
      inventoryNames
    );


  /*
   * ==========================================================
   * INVENTORY QUERY
   * ==========================================================
   *
   * MUST COME BEFORE INVENTORY ADD.
   *
   * This prevents:
   *
   * "mere pass sabudana kitna hai"
   *
   * becoming:
   *
   * inventory.add
   * ==========================================================
   */

  if (
    isInventoryQuery(
      raw,
      clean
    )
  ) {

    return makeResult({

      intent:
        'query.inventory',

      product,

      qty,

      unit,

      confidence:
        product
          ? 0.97
          : 0.78,
    });
  }


  /*
   * ==========================================================
   * SALE
   * ==========================================================
   */

  if (
    /\b(sell|becho|bechi|bikri|sale|bill)\b/i.test(
      clean
    )
  ) {

    const customerName =
      matchKnownCustomer(
        raw,
        customerNames
      );


    return makeResult({

      intent:
        'sale.create',

      product,

      qty,

      unit,

      customer_name:
        customerName,

      payment_type:
        customerName
          ? 'KHATA'
          : null,

      confidence:
        product
          ? 0.96
          : 0.75,
    });
  }


  /*
   * ==========================================================
   * CASH SALE
   * ==========================================================
   */

  if (
    /\b(cash|nagad|rokar|rokad)\b/i.test(
      clean
    )
  ) {

    return makeResult({

      intent:
        'sale.create',

      product,

      qty,

      unit,

      payment_type:
        'CASH',

      confidence:
        product
          ? 0.93
          : 0.70,
    });
  }


  /*
   * ==========================================================
   * INVENTORY ADD
   * ==========================================================
   */

  if (
    /\b(add|jodo|daalo|dalo|stock|plus|chadhao|chadao|bharo)\b/i.test(
      clean
    )
  ) {

    return makeResult({

      intent:
        'inventory.add',

      product,

      qty,

      unit,

      confidence:
        product
          ? 0.97
          : 0.75,
    });
  }


  /*
   * ==========================================================
   * SIMPLE PRODUCT + QUANTITY
   * ==========================================================
   *
   * Example:
   *
   * "5 biscuit"
   * "2 packet parle"
   *
   * We only classify it as inventory.add when
   * an actual inventory product is matched.
   * ==========================================================
   */

  if (
    product &&
    (
      unit ||
      qty !== 1
    )
  ) {

    return makeResult({

      intent:
        'inventory.add',

      product,

      qty,

      unit,

      confidence:
        0.82,
    });
  }


  /*
   * ==========================================================
   * UNKNOWN
   * ==========================================================
   */

  return makeResult({

    intent:
      'unknown',

    product:
      null,

    qty,

    unit,

    confidence:
      0.40,
  });
}


export default parseVoiceCommandLocally;