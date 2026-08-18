/*
 * ============================================================
 * StoreMate Local Voice Parser
 * ============================================================
 *
 * OFFLINE-FIRST KIRANA / LOCAL STORE VOICE ENGINE
 *
 * Languages:
 *   - English
 *   - Hindi
 *   - Hinglish
 *   - Mixed Hindi + English
 *
 * Designed for commands such as:
 *
 *   200 gram sugar
 *   500g sugar add karo
 *   aadha kilo chini
 *   paav kilo chawal
 *   pauna kilo aata
 *   sawa kilo sugar
 *   dedh kilo rice
 *   dhai kilo dal
 *
 *   1 kg 250 gram sugar
 *   2 litre 500 ml oil
 *
 *   2 packet biscuit
 *   5 piece soap
 *   1 dozen eggs
 *   1 gross pen
 *   2 pair socks
 *   1 box biscuit
 *   3 pouch milk
 *   5 bottle oil
 *   2 carton cold drink
 *   10 strip medicine
 *   2 tray eggs
 *   1 sack rice
 *   1 bori wheat
 *
 *   mere paas Parle G kitna hai
 *   Parle G kitna stock hai
 *
 *   Rakesh ke khate mein 100 dalo
 *   Rakesh ko 100 udhaar do
 *   Rakesh se 100 mile
 *
 * IMPORTANT:
 *
 * This file NEVER writes to WatermelonDB.
 * IntentHandler.js performs all database operations.
 *
 * ============================================================
 */


/*
 * ============================================================
 * LIMITS
 * ============================================================
 */

const MAX_TEXT_LENGTH =
  500;

const MAX_QUANTITY =
  100000;

const MAX_AMOUNT =
  100000000;


/*
 * ============================================================
 * ACTION / LANGUAGE SYNONYMS
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
  bechdo: 'sell',

  bikri: 'sell',
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
  adding: 'add',

  ad: 'add',

  plus: 'add',

  jodo: 'add',
  jod: 'add',
  jorna: 'add',
  jor: 'add',

  daalo: 'add',
  dalo: 'add',
  daal: 'add',
  dal: 'add',

  chadha: 'add',
  chadhao: 'add',
  chadao: 'add',
  chadhana: 'add',

  bharo: 'add',
  bhar: 'add',

  stock: 'stock',
  maal: 'stock',


  /*
   * ----------------------------------------------------------
   * REMOVE
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
  chhut: 'discount',


  /*
   * ----------------------------------------------------------
   * CUSTOMER
   * ----------------------------------------------------------
   */

  grahak: 'customer',
  graahak: 'customer',

  customer: 'customer',
  customers: 'customer',

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

  please: 'please',
  pls: 'please',
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

  'इक्कीस': 21,
  'बाईस': 22,
  'तेईस': 23,
  'तेइस': 23,
  'चौबीस': 24,
  'पच्चीस': 25,
  'छब्बीस': 26,
  'सत्ताईस': 27,
  'अट्ठाईस': 28,
  'उनतीस': 29,
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
 * ENGLISH / HINGLISH NUMBER WORDS
 * ============================================================
 */

const SMALL_NUMBERS = {

  zero: 0,

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
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,

  ek: 1,
  aik: 1,
  eka: 1,

  do: 2,
  dono: 2,

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
  naoo: 9,

  das: 10,

  gyarah: 11,
  gyaarah: 11,

  barah: 12,
  baarah: 12,

  terah: 13,
  chaudah: 14,
  pandrah: 15,
  solah: 16,
  satrah: 17,
  atharah: 18,
  unnis: 19,
  bees: 20,

  ikkis: 21,
  bais: 22,
  baais: 22,
  teis: 23,
  teiis: 23,
  chaubis: 24,
  pachis: 25,
  chhabis: 26,
  satais: 27,
  athais: 28,
  untees: 29,
  tees: 30,

  chaalis: 40,
  chalis: 40,

  pachaas: 50,
  pachas: 50,

  saath: 60,
  sattar: 70,
  assi: 80,
  nabbe: 90,
};


/*
 * ============================================================
 * MULTIPLIERS
 * ============================================================
 */

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


/*
 * ============================================================
 * FRACTION / LOCAL QUANTITY WORDS
 * ============================================================
 *
 * These are extremely important for Indian kirana speech.
 *
 * aadha kilo     = 0.5 KG
 * paav kilo      = 0.25 KG
 * pauna kilo     = 0.75 KG
 * sawa kilo      = 1.25 KG
 * dedh kilo      = 1.5 KG
 * dhai kilo      = 2.5 KG
 *
 * Also works with litre where spoken:
 *
 * aadha litre
 * pauna litre
 * sawa litre
 *
 * ============================================================
 */

const FRACTION_WORDS = {

  aadha: 0.5,
  aadhi: 0.5,
  aadhe: 0.5,
  half: 0.5,

  paav: 0.25,
  pav: 0.25,
  paawa: 0.25,

  pauna: 0.75,
  paune: 0.75,
  pona: 0.75,

  quarter: 0.25,

  sava: 1.25,
  sawa: 1.25,

  dedh: 1.5,
  dedha: 1.5,
  dedhi: 1.5,

  dhai: 2.5,
  dhaai: 2.5,

  'आधा': 0.5,
  'आधे': 0.5,
  'आधी': 0.5,

  'पाव': 0.25,
  'पौना': 0.75,
  'पौने': 0.75,

  'सवा': 1.25,

  'डेढ़': 1.5,

  'ढाई': 2.5,
};


/*
 * ============================================================
 * UNIT ALIASES
 * ============================================================
 *
 * ALL units are normalized into canonical names.
 *
 * The parser does not perform stock conversion itself.
 * It only tells IntentHandler what unit the user said.
 *
 * UnitConversion.js is responsible for mathematical conversion.
 *
 * ============================================================
 */

const UNIT_ALIASES = {

  /*
   * ==========================================================
   * WEIGHT
   * ==========================================================
   */

  mg: 'MG',
  mgs: 'MG',
  milligram: 'MG',
  milligrams: 'MG',
  milligramme: 'MG',
  milligrammes: 'MG',

  'मिलीग्राम': 'MG',
  'मिलीग्राम्': 'MG',

  gram: 'GRAM',
  grams: 'GRAM',
  gm: 'GRAM',
  gms: 'GRAM',
  g: 'GRAM',
  gramme: 'GRAM',
  grammes: 'GRAM',

  'ग्राम': 'GRAM',
  'ग्राम्': 'GRAM',

  kg: 'KG',
  kgs: 'KG',
  kilo: 'KG',
  kilos: 'KG',
  kilogram: 'KG',
  kilograms: 'KG',
  kilogramme: 'KG',
  kilogrammes: 'KG',

  'किलो': 'KG',
  'किलोग्राम': 'KG',

  quintal: 'QUINTAL',
  quintals: 'QUINTAL',
  qtl: 'QUINTAL',

  'क्विंटल': 'QUINTAL',
  'क्विन्टल': 'QUINTAL',

  ton: 'TON',
  tons: 'TON',
  tonne: 'TON',
  tonnes: 'TON',
  mt: 'TON',
  metricton: 'TON',

  'टन': 'TON',


  /*
   * Traditional / local weight names.
   *
   * These are recognized, but conversion should only be enabled
   * in UnitConversion.js if you want to support them.
   */

  tola: 'TOLA',
  tolas: 'TOLA',

  'तोला': 'TOLA',

  chhatak: 'CHHATAK',
  chatak: 'CHHATAK',
  chhatacks: 'CHHATAK',

  'छटांक': 'CHHATAK',

  seer: 'SEER',
  ser: 'SEER',

  'सेर': 'SEER',

  maund: 'MAUND',
  man: 'MAUND',

  'मन': 'MAUND',
  'मण': 'MAUND',


  /*
   * ==========================================================
   * LIQUID / VOLUME
   * ==========================================================
   */

  ml: 'ML',
  mls: 'ML',

  millilitre: 'ML',
  millilitres: 'ML',
  milliliter: 'ML',
  milliliters: 'ML',

  milliliteres: 'ML',

  'मिली': 'ML',
  'एमएल': 'ML',
  'मिलीलीटर': 'ML',

  litre: 'LITRE',
  liter: 'LITRE',
  litres: 'LITRE',
  liters: 'LITRE',
  l: 'LITRE',

  'लीटर': 'LITRE',
  'लीटर': 'LITRE',
  'ली': 'LITRE',


  /*
   * ==========================================================
   * COUNT
   * ==========================================================
   */

  piece: 'PIECE',
  pieces: 'PIECE',
  pc: 'PIECE',
  pcs: 'PIECE',
  piecee: 'PIECE',
  piecees: 'PIECE',

  item: 'PIECE',
  items: 'PIECE',

  nag: 'PIECE',
  नग: 'PIECE',

  'पीस': 'PIECE',
  'नग': 'PIECE',
  'नग्ग': 'PIECE',

  dozen: 'DOZEN',
  dozens: 'DOZEN',
  dz: 'DOZEN',

  'दर्जन': 'DOZEN',

  gross: 'GROSS',

  'ग्रॉस': 'GROSS',
  'ग्रोस': 'GROSS',

  pair: 'PAIR',
  pairs: 'PAIR',

  jodi: 'PAIR',
  jodiyaan: 'PAIR',
  jodiya: 'PAIR',

  'जोड़ी': 'PAIR',
  'जोड़ी': 'PAIR',

  set: 'SET',
  sets: 'SET',

  'सेट': 'SET',


  /*
   * ==========================================================
   * PACKAGING
   * ==========================================================
   */

  pack: 'PACK',
  packs: 'PACK',
  packet: 'PACK',
  packets: 'PACK',
  pkt: 'PACK',
  pkts: 'PACK',

  'पैक': 'PACK',
  'पैकेट': 'PACK',
  'पैकेट्स': 'PACK',

  pouch: 'POUCH',
  pouches: 'POUCH',

  'पाउच': 'POUCH',

  sachet: 'SACHET',
  sachets: 'SACHET',

  'सैशे': 'SACHET',
  'सैशेट': 'SACHET',

  bag: 'BAG',
  bags: 'BAG',

  'बैग': 'BAG',

  bottle: 'BOTTLE',
  bottles: 'BOTTLE',
  btl: 'BOTTLE',

  'बोतल': 'BOTTLE',
  'बॉटल': 'BOTTLE',

  jar: 'JAR',
  jars: 'JAR',

  'जार': 'JAR',

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

  tin: 'TIN',
  tins: 'TIN',

  'टिन': 'TIN',

  can: 'CAN',
  cans: 'CAN',

  'कैन': 'CAN',
  'कनस्तर': 'CAN',

  carton: 'CARTON',
  cartons: 'CARTON',

  'कार्टन': 'CARTON',

  tray: 'TRAY',
  trays: 'TRAY',

  'ट्रे': 'TRAY',

  strip: 'STRIP',
  strips: 'STRIP',

  'स्ट्रिप': 'STRIP',

  blister: 'BLISTER',
  blisters: 'BLISTER',

  'ब्लिस्टर': 'BLISTER',

  tube: 'TUBE',
  tubes: 'TUBE',

  'ट्यूब': 'TUBE',

  cup: 'CUP',
  cups: 'CUP',

  'कप': 'CUP',


  /*
   * ==========================================================
   * STORE / LOOSE GOODS UNITS
   * ==========================================================
   */

  bundle: 'BUNDLE',
  bundles: 'BUNDLE',

  gaddi: 'BUNDLE',
  gaddis: 'BUNDLE',

  'बंडल': 'BUNDLE',
  'गड्डी': 'BUNDLE',
  'गद्दी': 'BUNDLE',

  bunch: 'BUNCH',
  bunches: 'BUNCH',

  'गुच्छा': 'BUNCH',
  'गुच्छे': 'BUNCH',
  'बंच': 'BUNCH',

  roll: 'ROLL',
  rolls: 'ROLL',

  'रोल': 'ROLL',

  sack: 'SACK',
  sacks: 'SACK',

  bora: 'BORI',
  bori: 'BORI',
  boras: 'BORI',

  'बोरी': 'BORI',

  crate: 'CRATE',
  crates: 'CRATE',

  'क्रेट': 'CRATE',

  bucket: 'BUCKET',
  buckets: 'BUCKET',

  'बाल्टी': 'BUCKET',
  'बाल्टी': 'BUCKET',

  drum: 'DRUM',
  drums: 'DRUM',

  'ड्रम': 'DRUM',

  basket: 'BASKET',
  baskets: 'BASKET',

  'टोकरी': 'BASKET',
  'टोकरी': 'BASKET',
};


/*
 * ============================================================
 * ALL UNIT CANONICAL NAMES
 * ============================================================
 */

const ALL_UNITS = new Set(
  Object.values(
    UNIT_ALIASES
  )
);


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

  'please',
  'pls',

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
   * Query
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
  'baaki',

  /*
   * Payment
   */

  'received',
  'payment',
  'paid',
  'jama',

  /*
   * Cash
   */

  'cash',
  'nagad',
  'rokar',

  /*
   * Time
   */

  'today',
  'aaj',

  /*
   * Actions
   */

  'karo',
  'kar',
  'kardo',
  'do',

  'wala',
  'wale',
  'wali',
  'waala',
  'waale',
  'waali',
  'rupee',
  'rupees',
  'rupaye',
  'rupay',
  'rs',
  'rs.',
  'price',
  'rate',

  'वाला',
  'वाले',
  'वाली',
  'रुपया',
  'रुपये',
  'रुपए',
  'का',
  'की',
  'के',
]);


/*
 * Add every unit alias to STOP_WORDS.
 *
 * This prevents:
 *
 * "200 gram sugar"
 *
 * from becoming:
 *
 * "gram sugar"
 *
 * as the product name.
 */

Object.keys(
  UNIT_ALIASES
).forEach(
  unit =>
    STOP_WORDS.add(
      unit
    )
);


/*
 * ============================================================
 * CUSTOMER COMMAND WORDS
 * ============================================================
 */

const CUSTOMER_COMMAND_WORDS =
  new Set([

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
    .split(
      /\s+/
    )
    .filter(
      Boolean
    )
    .map(
      part =>
        part.charAt(0)
          .toUpperCase() +
        part.slice(1)
    )
    .join(' ');
};


/*
 * ============================================================
 * DEVANAGARI DIGITS
 * ============================================================
 */

const convertDevanagariDigits =
  text => {

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
 * DEVANAGARI NUMBER WORDS
 * ============================================================
 */

const convertDevanagariNumberWords =
  text => {

    return text
      .split(
        /\s+/
      )
      .map(
        word =>
          DEVANAGARI_NUMBERS[
            word
          ] !== undefined

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
 * NUMBER NORMALIZATION
 * ============================================================
 *
 * Supports:
 *
 * two hundred
 * five hundred
 * two thousand
 * do sau
 * paanch sau
 * do hazaar
 * teen hazaar
 *
 * ============================================================
 */

const normalizeSpokenNumbers =
  text => {

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
        .split(
          /\s+/
        )
        .filter(
          Boolean
        );


    const output =
      [];


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
       * Fraction words stay as they are.
       */

      if (
        FRACTION_WORDS[
          word
        ] !== undefined
      ) {

        output.push(
          word
        );

        continue;
      }


      const currentNumber =
        SMALL_NUMBERS[
          word
        ];


      const nextMultiplier =
        MULTIPLIERS[
          next
        ];


      /*
       * one hundred
       * do sau
       * five thousand
       */

      if (
        currentNumber !==
          undefined &&
        nextMultiplier !==
          undefined
      ) {

        output.push(
          String(
            currentNumber *
            nextMultiplier
          )
        );


        i++;

        continue;
      }


      /*
       * Numeric 2 + thousand.
       */

      if (
        /^\d+(?:\.\d+)?$/.test(
          word
        ) &&
        nextMultiplier !==
          undefined
      ) {

        output.push(
          String(
            Number(word) *
            nextMultiplier
          )
        );


        i++;

        continue;
      }


      /*
       * Simple number.
       */

      if (
        currentNumber !==
        undefined
      ) {

        output.push(
          String(
            currentNumber
          )
        );

        continue;
      }


      /*
       * Devanagari / numeric multiplier.
       */

      if (
        MULTIPLIERS[
          word
        ] !== undefined
      ) {

        output.push(
          String(
            MULTIPLIERS[
              word
            ]
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
 * TEXT NORMALIZATION
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
      .split(
        /\s+/
      )
      .map(
        word =>
          SYNONYMS[
            word
          ] ||
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

  price_hint = null,

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

  price_hint,

  confidence,

  source:
    'local_rules',
});


/*
 * ============================================================
 * UNIT NORMALIZATION
 * ============================================================
 */

const normalizeUnit =
  value => {

    if (
      value === null ||
      value === undefined
    ) {

      return null;
    }


    const normalized =
      String(
        value
      )
        .trim()
        .toLowerCase();


    return (
      UNIT_ALIASES[
        normalized
      ] ||
      null
    );
  };


/*
 * ============================================================
 * UNIT EXTRACTION
 * ============================================================
 */

const extractUnit =
  raw => {

    if (
      !raw
    ) {

      return null;
    }


    const words =
      raw
        .toLowerCase()
        .split(
          /\s+/
        );


    for (
      const word of words
    ) {

      const normalized =
        normalizeUnit(
          word
        );


      if (
        normalized
      ) {

        return normalized;
      }
    }


    return null;
  };


/*
 * ============================================================
 * NUMBER + UNIT TOKEN PARSER
 * ============================================================
 *
 * Handles:
 *
 * 500g
 * 500 g
 * 1.5kg
 * 1.5 kg
 * 200gram
 * 2packet
 * 2 packet
 *
 * ============================================================
 */

const parseNumberUnitTokens =
  raw => {

    const matches =
      [];


    /*
     * Important:
     *
     * Number and unit can be touching:
     *
     * 500g
     *
     * OR separated:
     *
     * 500 g
     */

    const regex =
      /(\d+(?:\.\d+)?)\s*([a-zA-Z\u0900-\u097F]+)/gi;


    let match;


    while (
      (
        match =
          regex.exec(
            raw
          )
      ) !== null
    ) {

      const value =
        Number(
          match[1]
        );


      const unit =
        normalizeUnit(
          match[2]
        );


      if (
        Number.isFinite(
          value
        ) &&
        value > 0 &&
        unit
      ) {

        matches.push({

          qty:
            value,

          unit,

          index:
            match.index,

          length:
            match[0].length,
        });
      }
    }


    return matches;
  };


/*
 * ============================================================
 * FRACTION + UNIT PARSER
 * ============================================================
 */

const parseFractionUnit =
  raw => {

    const words =
      raw
        .toLowerCase()
        .split(
          /\s+/
        );


    for (
      let i = 0;
      i < words.length - 1;
      i++
    ) {

      const fraction =
        FRACTION_WORDS[
          words[i]
        ];


      if (
        fraction ===
        undefined
      ) {

        continue;
      }


      const unit =
        normalizeUnit(
          words[i + 1]
        );


      if (
        unit
      ) {

        return {

          qty:
            fraction,

          unit,

          index:
            i,
        };
      }
    }


    /*
     * "half a kilo"
     * "aadha ek kilo"
     */

    for (
      let i = 0;
      i < words.length - 2;
      i++
    ) {

      const fraction =
        FRACTION_WORDS[
          words[i]
        ];


      if (
        fraction ===
        undefined
      ) {

        continue;
      }


      const possibleArticle =
        words[i + 1];


      const unit =
        normalizeUnit(
          words[i + 2]
        );


      if (
        (
          possibleArticle ===
            'a' ||
          possibleArticle ===
            'an' ||
          possibleArticle ===
            'ek'
        ) &&
        unit
      ) {

        return {

          qty:
            fraction,

          unit,

          index:
            i,
        };
      }
    }


    return null;
  };


/*
 * ============================================================
 * MIXED QUANTITY NORMALIZATION
 * ============================================================
 *
 * Examples:
 *
 * 1 KG + 250 GRAM
 *
 * Returns:
 *
 * {
 *   qty: 1.25,
 *   unit: KG
 * }
 *
 * 2 LITRE + 500 ML
 *
 * Returns:
 *
 * {
 *   qty: 2.5,
 *   unit: LITRE
 * }
 *
 * 1 DOZEN + 4 PIECE
 *
 * Returns:
 *
 * {
 *   qty: 16,
 *   unit: PIECE
 * }
 *
 * The parser only handles combinations where the relationship
 * is unambiguous.
 *
 * ============================================================
 */

const MIXED_UNIT_FACTORS = {

  /*
   * Weight -> canonical KG.
   */

  MG: {
    base: 'KG',
    factor: 0.000001,
  },

  GRAM: {
    base: 'KG',
    factor: 0.001,
  },

  KG: {
    base: 'KG',
    factor: 1,
  },

  QUINTAL: {
    base: 'KG',
    factor: 100,
  },

  TON: {
    base: 'KG',
    factor: 1000,
  },


  /*
   * Volume -> canonical LITRE.
   */

  ML: {
    base: 'LITRE',
    factor: 0.001,
  },

  LITRE: {
    base: 'LITRE',
    factor: 1,
  },


  /*
   * Count -> canonical PIECE.
   */

  PIECE: {
    base: 'PIECE',
    factor: 1,
  },

  DOZEN: {
    base: 'PIECE',
    factor: 12,
  },

  GROSS: {
    base: 'PIECE',
    factor: 144,
  },

  PAIR: {
    base: 'PIECE',
    factor: 2,
  },
};


const combineQuantityTokens =
  tokens => {

    if (
      !tokens ||
      tokens.length ===
        0
    ) {

      return null;
    }


    /*
     * Single quantity.
     */

    if (
      tokens.length ===
      1
    ) {

      return {

        qty:
          Math.min(
            tokens[0].qty,
            MAX_QUANTITY
          ),

        unit:
          tokens[0].unit,
      };
    }


    /*
     * Check if all units belong to
     * the same convertible family.
     */

    const firstFactor =
      MIXED_UNIT_FACTORS[
        tokens[0].unit
      ];


    if (
      !firstFactor
    ) {

      return {

        qty:
          tokens[0].qty,

        unit:
          tokens[0].unit,
      };
    }


    const base =
      firstFactor.base;


    const compatible =
      tokens.every(
        token =>
          MIXED_UNIT_FACTORS[
            token.unit
          ] &&
          MIXED_UNIT_FACTORS[
            token.unit
          ].base ===
          base
      );


    if (
      !compatible
    ) {

      /*
       * Example:
       *
       * 2 packet + 3 bottle
       *
       * Cannot safely combine.
       */

      return {

        qty:
          tokens[0].qty,

        unit:
          tokens[0].unit,
      };
    }


    /*
     * Convert all to base unit.
     */

    let baseQuantity =
      0;


    tokens.forEach(
      token => {

        const factor =
          MIXED_UNIT_FACTORS[
            token.unit
          ].factor;


        baseQuantity +=
          token.qty *
          factor;
      }
    );


    /*
     * Prefer the larger practical unit
     * where possible.
     *
     * KG instead of GRAM
     * LITRE instead of ML
     * PIECE for mixed count.
     */

    let outputUnit =
      base;


    let outputQuantity =
      baseQuantity;


    /*
     * If quantity is very small, preserve
     * a smaller unit for readability.
     */

    if (
      base === 'KG'
    ) {

      if (
        baseQuantity < 0.001
      ) {

        outputUnit =
          'MG';

        outputQuantity =
          baseQuantity *
          1000000;

      } else if (
        baseQuantity < 1
      ) {

        outputUnit =
          'GRAM';

        outputQuantity =
          baseQuantity *
          1000;
      }

    } else if (
      base === 'LITRE'
    ) {

      if (
        baseQuantity < 1
      ) {

        outputUnit =
          'ML';

        outputQuantity =
          baseQuantity *
          1000;
      }

    } else if (
      base === 'PIECE'
    ) {

      outputUnit =
        'PIECE';

      outputQuantity =
        baseQuantity;
    }


    return {

      qty:
        Math.min(
          outputQuantity,
          MAX_QUANTITY
        ),

      unit:
        outputUnit,
    };
  };


/*
 * ============================================================
 * QUANTITY + UNIT EXTRACTION
 * ============================================================
 */

const extractQuantityAndUnit =
  raw => {

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


    /*
     * --------------------------------------------------------
     * FRACTION FIRST
     * --------------------------------------------------------
     *
     * This prevents:
     *
     * aadha kilo
     *
     * from being interpreted incorrectly.
     */

    const fraction =
      parseFractionUnit(
        raw
      );


    if (
      fraction
    ) {

      return {

        qty:
          Math.min(
            fraction.qty,
            MAX_QUANTITY
          ),

        unit:
          fraction.unit,
      };
    }


    /*
     * --------------------------------------------------------
     * MULTIPLE NUMBER + UNIT PAIRS
     * --------------------------------------------------------
     */

    const tokens =
      parseNumberUnitTokens(
        raw
      );


    /*
     * "10kg or 5kg" / "10 kilo ya 5 kilo" are alternatives,
     * not 15kg. Use the first spoken option rather than
     * inventing a combined quantity.
     */
    if (
      tokens.length > 1 &&
      /\b(or|ya)\b|(?:या|या फिर)/i.test(raw)
    ) {
      return {
        qty:
          Math.min(
            tokens[0].qty,
            MAX_QUANTITY
          ),
        unit:
          tokens[0].unit,
      };
    }


    if (
      tokens.length
    ) {

      /*
       * Multiple quantities only when they are
       * close enough to reasonably belong together.
       */

      if (
        tokens.length >
        1
      ) {

        const combined =
          combineQuantityTokens(
            tokens
          );


        if (
          combined
        ) {

          return combined;
        }
      }


      return {

        qty:
          Math.min(
            tokens[0].qty,
            MAX_QUANTITY
          ),

        unit:
          tokens[0].unit,
      };
    }


    /*
     * --------------------------------------------------------
     * FRACTION WITHOUT UNIT
     * --------------------------------------------------------
     *
     * "aadha biscuit"
     *
     * We preserve the quantity but unit remains null.
     */

    const words =
      raw
        .toLowerCase()
        .split(
          /\s+/
        );


    for (
      const word of words
    ) {

      if (
        FRACTION_WORDS[
          word
        ] !== undefined
      ) {

        return {

          qty:
            FRACTION_WORDS[
              word
            ],

          unit:
            null,
        };
      }
    }


    /*
     * --------------------------------------------------------
     * SIMPLE NUMERIC QUANTITY
     * --------------------------------------------------------
     */

    const quantityMatch =
      raw.match(
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

const matchKnownCustomer =
  (
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
 * CUSTOMER NAME VALIDATION
 * ============================================================
 */

const isValidCustomerName =
  name => {

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
        .split(
          /\s+/
        )
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


    return true;
  };


/*
 * ============================================================
 * CLEAN CUSTOMER NAME
 * ============================================================
 */

const cleanCustomerName =
  value => {

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

const extractCustomerCreation =
  raw => {

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
 * PAYMENT / FLAT KHATA
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


  const patterns = [

    {
      pattern:
        /(\d+(?:\.\d+)?)\s*(?:rupees?|rs\.?|₹)?\s*(?:on|for)\s+([a-zA-Z][a-zA-Z .'-]*?)\s*(?:account|khata)?$/i,

      isReceived:
        false,
    },


    {
      pattern:
        /^([a-zA-Z][a-zA-Z .'-]*?)\s+(?:ke|ka|ki)\s+khat[ae]\s+mein\s+(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?)?\s*(?:dalo|daalo|chadhao|chadao|de\s*do)?$/i,

      isReceived:
        false,
    },


    {
      pattern:
        /^([a-zA-Z][a-zA-Z .'-]*?)\s+(?:ke|ka|ki)\s+(?:account|khata|khate)\s+(?:mein|me)\s+(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?)?\s*(?:add|dalo|daalo|jodo|chadhao|chadao|de\s*do)?$/i,

      isReceived:
        false,
    },


    {
      pattern:
        /^credit\s+(\d+(?:\.\d+)?)\s*(?:rupees?)?\s*(?:to|on)\s+([a-zA-Z][a-zA-Z .'-]*)$/i,

      isReceived:
        false,
    },


    {
      pattern:
        /^([a-zA-Z][a-zA-Z .'-]*?)\s+ko\s+(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?)?\s*(?:udhaar|udhar)?\s*(?:de\s*do|do|diye|diya)?$/i,

      isReceived:
        false,
    },


    {
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
    } of patterns
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


  return null;
};



/*
 * ============================================================
 * PRODUCT / BRAND ALIASES + PRICE HINT + KHATA ITEM
 * ============================================================
 */

const PRODUCT_ALIASES = [
  {
    canonical: 'parle g',
    aliases: [
      'parle g', 'parle ji', 'parle jee', 'parle gee', 'parle gi',
      'parle g biscuit', 'parle ji biscuit', 'parle jee biscuit',
      'g biscuit', 'जी बिस्किट', 'पारले जी', 'पार्ले जी',
      'पारले जी बिस्किट', 'पार्ले जी बिस्किट'
    ]
  },
  {
    canonical: 'kurkure',
    aliases: ['kurkure', 'kurkura', 'kurkure namkeen', 'कुरकुरे', 'कुरकुरा']
  },
  {
    canonical: 'tiger biscuit',
    aliases: ['tiger biscuit', 'tiger biscuits', 'tiger', 'टाइगर बिस्किट', 'टाइगर बिस्कुट']
  },
  {
    canonical: 'rice',
    aliases: ['rice', 'chawal', 'chaawal', 'चावल']
  },
  {
    canonical: 'basmati rice',
    aliases: ['basmati rice', 'basmati chawal', 'basmati chaawal', 'बासमती चावल']
  },
  {
    canonical: 'sugar',
    aliases: ['sugar', 'chini', 'cheeni', 'चीनी', 'शक्कर']
  },
  {
    canonical: 'biscuit',
    aliases: ['biscuit', 'biscuits', 'biskit', 'biskits', 'बिस्किट', 'बिस्कुट']
  },
  {
    canonical: 'tooth brush',
    aliases: ['toothbrush', 'tooth brush', 'toothbrushes', 'ब्रश', 'टूथब्रश', 'टूथ ब्रश']
  },
];

const normalizeAliasText = value =>
  cleanText(value).toLowerCase().replace(/[\/,]+/g,' ').replace(/\s+/g,' ').trim();

const canonicalProductSpeech = value => {
  const normalized = normalizeAliasText(value);
  if (!normalized) return '';
  for (const group of PRODUCT_ALIASES) {
    if (
      normalized === normalizeAliasText(group.canonical) ||
      group.aliases.some(alias => normalizeAliasText(alias) === normalized)
    ) return normalizeAliasText(group.canonical);
  }
  return normalized;
};

const parsePriceHint = raw => {
  if (!raw) return null;
  const text = convertDevanagariDigits(cleanText(raw).toLowerCase());
  const patterns = [
    /(?:^|\s)₹\s*(\d+(?:\.\d+)?)\b/i,
    /(?:^|\s)(?:rs\.?|rupees?|rupee|rupaye|rupay|rupiya|rupiye)\s*(\d+(?:\.\d+)?)\b/i,
    /\b(\d+(?:\.\d+)?)\s*(?:₹|rs\.?|rupees?|rupee|rupaye|rupay|rupiya|rupiye)\b/i,
    /\b(\d+(?:\.\d+)?)\s*(?:wala|wale|wali|waala|waale|waali)\b/i,
    /\b(\d+(?:\.\d+)?)\s*(?:रुपये|रुपए|रुपया|वाला|वाले|वाली)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0 && value <= MAX_AMOUNT) return value;
  }
  return null;
};


/*
 * ============================================================
 * PRODUCT VARIANT / PRICE QUALIFIER
 * ============================================================
 *
 * Examples:
 *
 *   10 wala Kurkure
 *   5 wala Tiger biscuit
 *   10 wala Parle G
 *   10 wala Parle Ji
 *   100 wale basmati chawal
 *   50 wala chawal 5 kilo
 *
 * IMPORTANT:
 * "10 wala" is a PRICE HINT, not quantity 10.
 */
const extractProductVariant =
  itemText => {

    const cleaned =
      cleanText(itemText);

    if (!cleaned) {
      return null;
    }

    const price =
      parsePriceHint(cleaned);

    if (price === null) {
      return null;
    }

    const quantity =
      extractQuantityAndUnit(cleaned);

    /*
     * Remove the price qualifier from the product phrase,
     * while preserving the actual quantity.
     */
    const productText =
      cleaned
        .replace(
          /\b\d+(?:\.\d+)?\s*(?:wala|wale|wali|waala|waale|waali)\b/gi,
          ' '
        )
        .replace(
          /(?:₹|rs\.?|rupees?|rupee|rupaye|rupay|rupiya|rupiye)\s*\d+(?:\.\d+)?/gi,
          ' '
        )
        .replace(
          /\d+(?:\.\d+)?\s*(?:₹|rs\.?|rupees?|rupee|rupaye|rupay|rupiya|rupiye)\b/gi,
          ' '
        )
        .replace(/\s+/g, ' ')
        .trim();

    return {
      price_hint: price,
      product_text: productText,
      qty: quantity.qty,
      unit: quantity.unit,
    };
  };


const extractKhataItemCommand = (raw, customerNames) => {
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g,' ').trim();
  const patterns = [
    /^(.+?)\s+(?:ke|ka|ki)\s+(?:khate|khata|account|accounts)\s+(?:mein|me)\s+(.+)$/i,
    /^(.+?)\s+(?:ke|ka|ki)\s+(?:udhaar|udhar|baki|baaki|credit)\s+(?:mein|me)\s+(.+)$/i,
    /^(.+?)\s+ko\s+(.+?)\s+(?:udhaar|udhar|credit)(?:\s+(?:do|de\s*do))?$/i,
    /^(.+?)\s+(?:के)\s+(?:खाते|खाता|उधार)\s+(?:में|मे)\s+(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const rawCustomer = cleanCustomerName(match[1]);
    const itemText = cleanText(match[2]);
    if (rawCustomer && itemText) {
      return { customer_name: titleCase(rawCustomer), itemText };
    }
  }
  const knownCustomer = matchKnownCustomer(raw, customerNames);
  if (knownCustomer) {
    const escaped = knownCustomer.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const remainder = normalized
      .replace(new RegExp('^'+escaped,'i'),'')
      .replace(/^(?:ke\s+)?(?:khate|khata|account|udhaar|udhar)\s+(?:mein|me)\s+/i,'')
      .trim();
    if (remainder) return { customer_name: titleCase(knownCustomer), itemText: remainder };
  }
  return null;
};

/*
 * ============================================================
 * INVENTORY PRODUCT MATCH
 * ============================================================
 */

const productFromInventory =
  (
    raw,
    inventoryNames
  ) => {

    if (
      !Array.isArray(
        inventoryNames
      ) ||
      inventoryNames.length === 0
    ) {

      return null;
    }


    const rawNormalized =
      normalizeAliasText(
        raw
      );


    if (!rawNormalized) {

      return null;
    }


    /*
     * ========================================================
     * 1. PREPARE INVENTORY
     * ========================================================
     */

    const sorted =
      [...inventoryNames]
        .filter(Boolean)
        .map(
          name =>
            String(name).trim()
        )
        .filter(Boolean);


    /*
     * ========================================================
     * 2. EXACT STORED PRODUCT
     * ========================================================
     *
     * Prefer the longest actual inventory name.
     */

    const exactCandidates =
      sorted
        .filter(
          name =>
            rawNormalized.includes(
              normalizeAliasText(
                name
              )
            )
        )
        .sort(
          (a, b) =>
            normalizeAliasText(b).length -
            normalizeAliasText(a).length
        );


    if (
      exactCandidates.length
    ) {

      return exactCandidates[0];

    }


    /*
     * ========================================================
     * 3. ALIAS MATCH
     * ========================================================
     *
     * Longest alias wins.
     *
     * This prevents:
     *
     * "basmati chawal"
     *
     * from becoming:
     *
     * "chawal"
     */

    const aliasCandidates = [];


    for (
      const group of PRODUCT_ALIASES
    ) {

      for (
        const alias of group.aliases
      ) {

        const normalizedAlias =
          normalizeAliasText(
            alias
          );


        if (
          !normalizedAlias
        ) {

          continue;

        }


        if (
          rawNormalized.includes(
            normalizedAlias
          )
        ) {

          aliasCandidates.push({

            group,

            alias:
              normalizedAlias,

            length:
              normalizedAlias.length,

          });

        }

      }

    }


    aliasCandidates.sort(
      (a, b) =>
        b.length -
        a.length
    );


    /*
     * ========================================================
     * 4. RESOLVE ALIAS TO REAL INVENTORY PRODUCT
     * ========================================================
     */

    for (
      const candidate of
      aliasCandidates
    ) {

      const canonical =
        normalizeAliasText(
          candidate.group.canonical
        );


      const inventoryMatch =
        sorted.find(
          name =>
            canonicalProductSpeech(
              name
            ) === canonical
        );


      if (
        inventoryMatch
      ) {

        return inventoryMatch;

      }

    }


    /*
     * ========================================================
     * 5. WORD-BASED SCORING
     * ========================================================
     *
     * This handles products that aren't explicitly listed
     * in PRODUCT_ALIASES.
     *
     * Example:
     *
     * "basmati chawal"
     *
     * inventory:
     *
     * "Basmati Rice"
     * "Rice"
     *
     * Basmati Rice gets the stronger semantic/word score.
     * ========================================================
     */

    const ignoredWords =
      new Set([

        'wala',
        'wale',
        'wali',
        'waala',
        'waale',
        'waali',

        'ka',
        'ke',
        'ki',

        'rupaye',
        'rupay',
        'rupee',
        'rupees',

        'kg',
        'kgs',
        'kilo',
        'kilos',

        'g',
        'gm',
        'gram',
        'grams',

        'packet',
        'packets',
        'pack',

        'box',
        'boxes',

        'bottle',
        'bottles',

        'piece',
        'pieces',
        'pcs',

        'daalo',
        'dalo',
        'do',
        'de',
        'dena',

      ]);


    const rawWords =
      rawNormalized
        .split(/\s+/)
        .filter(
          word =>
            word.length >= 2 &&
            !ignoredWords.has(
              word
            ) &&
            !/^\d+(?:\.\d+)?$/.test(
              word
            )
        );


    if (
      !rawWords.length
    ) {

      return null;

    }


    let bestProduct =
      null;


    let bestScore =
      0;


    for (
      const name of sorted
    ) {

      const productNormalized =
        normalizeAliasText(
          name
        );


      const productWords =
        productNormalized
          .split(/\s+/)
          .filter(Boolean);


      let score = 0;


      for (
        const rawWord of rawWords
      ) {

        /*
         * Direct word match.
         */

        if (
          productWords.includes(
            rawWord
          )
        ) {

          score += 10;

          continue;

        }


        /*
         * Hindi → English semantic aliases.
         */

        const canonicalRaw =
          canonicalProductSpeech(
            rawWord
          );


        if (
          productNormalized.includes(
            canonicalRaw
          )
        ) {

          score += 8;

        }

      }


      /*
       * Prefer products with more matching words.
       */

      if (
        score > bestScore
      ) {

        bestScore =
          score;

        bestProduct =
          name;

      }

    }


    if (
      bestProduct &&
      bestScore > 0
    ) {

      return bestProduct;

    }
    return null;
  };


/*
 * ============================================================
 * PRODUCT FALLBACK
 * ============================================================
 */

const productFromWords =
  (
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
        .split(
          /\s+/
        )
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
              normalizeUnit(
                word
              )
            ) {

              return false;
            }


            /*
             * Fractions.
             */

            if (
              FRACTION_WORDS[
                word
              ] !== undefined
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
             * Common query/action words.
             */

            const ignored = [

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
              'baaki',

              'hai',
              'hain',

              'today',
              'aaj',

              'ke',
              'ka',
              'ki',
              'ko',
              'mein',
              'me',

              'wala',
              'wale',
              'wali',
              'waala',
              'waale',
              'waali',
              'rupee',
              'rupees',
              'rupaye',
              'rupay',
              'rs',
              'price',
              'rate',

              'वाला',
              'वाले',
              'वाली',
              'रुपये',
              'रुपए',

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
 * INVENTORY QUERY
 * ============================================================
 */

const isInventoryQuery =
  (
    raw,
    clean
  ) => {

    return (

      /\b(how\s+much|how\s+many|stock|inventory|have|has|left|remaining)\b/i.test(
        raw
      )

      ||

      /\b(kitna|kitni|kitne|mere\s+pass|mere\s+paas|mera\s+pass|meri\s+pass|bacha|bache|baki|baaki)\b/i.test(
        raw
      )

      ||

      /(?:कितना|कितनी|कितने|स्टॉक|माल|बचा|बचे|बाकी|पास)/i.test(
        raw
      )
    );
  };


/*
 * ============================================================
 * KHATA QUERY
 * ============================================================
 */

const isKhataQuery =
  raw => {

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
 * TODAY KHATA SUMMARY
 * ============================================================
 */

const isTodayKhataSummary =
  raw => {

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
   * EMPTY COMMAND
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
   * Must be checked before generic product parsing.
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
   * DIRECT KHATA + PRODUCT
   * ==========================================================
   */
  const khataItem = extractKhataItemCommand(raw, customerNames);

  if (khataItem) {
    const variant =
      extractProductVariant(
        khataItem.itemText
      );

    const itemQty =
      variant
        ? variant.qty
        : extractQuantityAndUnit(
            khataItem.itemText
          ).qty;

    const itemUnit =
      variant
        ? variant.unit
        : extractQuantityAndUnit(
            khataItem.itemText
          ).unit;

    const itemPriceHint =
      variant
        ? variant.price_hint
        : parsePriceHint(
            khataItem.itemText
          );

    const itemProduct =
      productFromWords(
        variant
          ? variant.product_text
          : khataItem.itemText,
        inventoryNames
      );

    if (itemProduct) {
      return makeResult({
        intent: 'sale.create',
        product: itemProduct,
        qty:
          itemPriceHint !== null &&
          !itemUnit &&
          itemQty === itemPriceHint
            ? 1
            : itemQty,
        unit: itemUnit,
        customer_name: khataItem.customer_name,
        payment_type: 'KHATA',
        price_hint: itemPriceHint,
        confidence: 0.99,
      });
    }
  }


  /*
   * ==========================================================
   * PAYMENT / KHATA
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

  const price_hint = parsePriceHint(raw);

  let {
    qty,
    unit,
  } = extractQuantityAndUnit(raw);

  if (
    price_hint !== null &&
    !unit &&
    qty === price_hint
  ) {
    /*
     * The only number we found is the price:
     * "₹10 Kurkure" / "10 wala Kurkure".
     */
    qty = 1;
  }


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
   * PRICE-QUALIFIED SALE
   * ==========================================================
   */
  if (price_hint !== null && product) {
    const customerName = matchKnownCustomer(raw, customerNames);

    return makeResult({
      intent: 'sale.create',
      product,
      qty,
      unit,
      customer_name: customerName,
      payment_type: customerName ? 'KHATA' : null,
      price_hint,
      confidence: customerName ? 0.99 : 0.96,
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

      price_hint,

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

      price_hint,

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

      price_hint,

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
   *   5 biscuit
   *   2 packet parle
   *   500 gram sugar
   *
   * Only treat as inventory.add when a product can
   * actually be identified.
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

      price_hint,

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


/*
 * ============================================================
 * OPTIONAL DEBUG EXPORT
 * ============================================================
 *
 * Useful during development/testing.
 *
 * It does NOT write anything to the database.
 * ============================================================
 */

export const getSupportedVoiceUnits =
  () => {

    return Array.from(
      ALL_UNITS
    );
  };


export {
  parsePriceHint,
  canonicalProductSpeech,
  productFromInventory,
  extractKhataItemCommand,
  extractProductVariant,
};

export default parseVoiceCommandLocally;