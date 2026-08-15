/*
 * ============================================================
 * StoreMate Local Voice Parser
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Convert speech into a structured intent object.
 * 2. Work completely offline.
 * 3. Never write directly to WatermelonDB.
 * 4. Customer/account commands are detected BEFORE product
 *    commands so "create Ravi account" can never become
 *    "product: Ravi".
 *
 * Database writes happen only inside IntentHandler.js.
 * ============================================================
 */


/*
 * ============================================================
 * SYNONYMS & NUMBER WORDS
 * ============================================================
 */

const SYNONYMS = {
  /* Sales */
  cell: 'sell',
  sel: 'sell',
  sal: 'sell',
  sall: 'sell',
  sale: 'sell',
  becho: 'sell',
  bechi: 'sell',
  bikri: 'sell',
  bill: 'sell',

  /* Inventory */
  jodo: 'add',
  daalo: 'add',
  dalo: 'add',
  bhandar: 'add',
  stock: 'add',
  ad: 'add',
  plus: 'add',

  /* Khata */
  udhaar: 'khata',
  udhar: 'khata',
  baki: 'khata',
  khaata: 'khata',

  /* Payment */
  jama: 'received',
  diye: 'received',
  diya: 'received',
  receive: 'received',
  received: 'received',
  pay: 'received',
  paid: 'received',
  mil: 'received',
  mile: 'received',

  /* Hindi numbers */
  ek: '1',
  do: '2',
  teen: '3',
  char: '4',
  chaar: '4',
  panch: '5',
  paanch: '5',
  chhe: '6',
  che: '6',
  saat: '7',
  aath: '8',
  nau: '9',
  das: '10',
};

/*
 * Converts compound spoken numbers like:
 * "do sau" -> 200
 * "paanch hazaar" -> 5000
 * "hundred" -> 100
 * into a single digit token, run BEFORE synonym replacement.
 */
const normalizeSpokenNumbers = text => {
  const HINDI_DIGITS = {
    ek: 1, do: 2, teen: 3, char: 4, chaar: 4, panch: 5, paanch: 5,
    chhe: 6, che: 6, saat: 7, aath: 8, nau: 9, das: 10,
  };
  const MULTIPLIERS = { sau: 100, hundred: 100, hazaar: 1000, hazar: 1000, thousand: 1000, lakh: 100000, lac: 100000 };

  const words = text.split(' ');
  const out = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];

    if (HINDI_DIGITS[w] && MULTIPLIERS[next]) {
      out.push(String(HINDI_DIGITS[w] * MULTIPLIERS[next]));
      i++;
      continue;
    }

    if (MULTIPLIERS[w]) {
      out.push(String(MULTIPLIERS[w]));
      continue;
    }

    out.push(w);
  }

  return out.join(' ');
};

/*
 * ============================================================
 * STOP WORDS
 * ============================================================
 */

const STOP_WORDS = new Set([
  'create',
  'make',
  'open',
  'add',
  'new',
  'an',
  'a',
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
  'banao',
  'karo',
  'kar',
  'do',
  'please',
  'the',
  'for',
  'of',
  'ka',
  'ke',
  'ki',
  'k',
  'naam',
  'mein',
  'me',
  'named',
  'called',
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
]);


/*
 * ============================================================
 * BASIC HELPERS
 * ============================================================
 */

const cleanText = value =>
  typeof value === 'string'
    ? value
        .replace(
          /[\u0000-\u001F\u007F]/g,
          ''
        )
        .trim()
        .slice(0, 500)
    : '';


const titleCase = value =>
  cleanText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map(
      part =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(' ');


/*
 * ============================================================
 * NORMALIZATION
 * ============================================================
 */

const normalizeText = text => {
  const rawBase = cleanText(text).toLowerCase().replace(/['’]/g, '').replace(/\s+/g, ' ');

  // 🚀 Convert number words before evaluating synonyms
  const numberNormalized = normalizeSpokenNumbers(rawBase);

  const clean = numberNormalized
    .split(' ')
    .map(word => SYNONYMS[word] || word)
    .join(' ');

  return {
    raw: numberNormalized,
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
  discount_percent,
  new_price,
  customer_name,
  time_period,
  amount,
  payment_type,
  confidence,
  source: 'local_rules',
});


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
          String(name).trim()
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
    typeof name !== 'string'
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
    cleaned.length < 2 ||
    cleaned.length > 100
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
    words.length === 0
  ) {
    return false;
  }


  /*
   * A customer name should not consist entirely
   * of command words.
   */

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
    typeof value !== 'string'
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


  /*
   * Remove polite words from the beginning/end.
   */

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


  /*
   * Remove "naya/new" if it was accidentally
   * captured as part of the name.
   */

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


  /*
   * Remove trailing command words.
   */

  name =
    name.replace(
      /\s+(?:banao|bnao|bana|banado|banaao|karo|kar|do|khol|kholo)$/i,
      ''
    );


  return isValidCustomerName(
    name
  )
    ? titleCase(name)
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


  const hasCustomerCommand =
    /\b(create|make|open|add|new|customer|account|khata|khate|banao|bnao|bana|banado|banaao)\b/i.test(
      normalized
    );


  if (
    !hasCustomerCommand
  ) {
    return null;
  }

  let fallback =
    normalized.match(
      /^(?:please\s+)?(?:create|make|open|add)\s+(?:a\s+|an\s+|new\s+)?(?:customer|account|khata|khate)\s+(.+)$/i
    );

  if (fallback && fallback[1]) {
    const customerName = cleanCustomerName(fallback[1]);
    if (customerName) return customerName;
  }

  fallback =
    normalized.match(
      /^(?:please\s+)?(?:create|make|open|add)\s+(.+?)\s+as\s+(?:a\s+)?(?:customer|account)$/i
    );

  if (fallback && fallback[1]) {
    const customerName = cleanCustomerName(fallback[1]);
    if (customerName) return customerName;
  }

  fallback =
    normalized.match(
      /^(?:please\s+)?add\s+(.+?)\s+as\s+(?:a\s+)?customer$/i
    );

  if (fallback && fallback[1]) {
    const customerName = cleanCustomerName(fallback[1]);
    if (customerName) return customerName;
  }

  return null;
};


/*
 * ============================================================
 * PAYMENT RECEIVED OR FLAT UDHAAR (BIDIRECTIONAL)
 * ============================================================
 */

const extractPayment = (clean, raw, customerNames) => {
  const knownCustomer = matchKnownCustomer(raw, customerNames);
  const amountMatch = clean.match(/(?:₹|rs\.?|rupees?)?\s*(\d+(?:\.\d+)?)/i);

  // Broadened trigger words — covers natural Hindi/Hinglish khata phrasing
  const KHATA_TRIGGER = /\b(received|jama|paid|payment|mil|mile|diye|diya|se|ne|dalo|daalo|chadhao|udhaar|credit|de do|khate|khata|account)\b/i;

  if (knownCustomer && amountMatch && KHATA_TRIGGER.test(clean)) {
    // Determine direction based on keywords
    const isReceived = /\b(received|jama|paid|payment|mil|mile|se|from)\b/i.test(clean);
    return { customer_name: knownCustomer, amount: Number(amountMatch[1]), isReceived };
  }

  // 🚀 New Broad Patterns (works even without pre-existing customer)
  const namePatterns = [
    {
      // "800 rupees on Rakesh account" / "800 rupees on Rakesh"
      pattern: /(\d+(?:\.\d+)?)\s*(?:rupees?|rs\.?|₹)?\s*(?:on|for)\s+([a-zA-Z][a-zA-Z .'-]*?)\s*(?:account|khata)?$/i,
      isReceived: false
    },
    {
      // "Rakesh ke khate mein 100 dalo" / "...daalo" / "...chadhao"
      pattern: /^([a-zA-Z][a-zA-Z .'-]*?)\s+(?:ke|ka|ki)\s+khat[ae]\s+mein\s+(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?)?\s*(?:dalo|daalo|chadhao|de\s*do)?$/i,
      isReceived: false
    },
    {
      // "credit 500 to Rakesh" / "credit 500 on Rakesh"
      pattern: /^credit\s+(\d+(?:\.\d+)?)\s*(?:rupees?)?\s*(?:to|on)\s+([a-zA-Z][a-zA-Z .'-]*)$/i,
      isReceived: false
    },
    {
      // "Rakesh ko 500 udhaar do" / "Rakesh ko 500 diye"
      pattern: /^([a-zA-Z][a-zA-Z .'-]*?)\s+ko\s+(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?)?\s*(?:udhaar\s*(?:de\s*do|do)|diye|diya)?$/i,
      isReceived: false
    },
    {
      // "Rakesh se 500 mile" / "Rakesh ne 500 diye"
      pattern: /^([a-zA-Z][a-zA-Z .'-]*?)\s+(?:se|ne)\s+(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)\s*(?:rupees?)?\s*(?:mile|mil|gaye|diye|diya|received|jama)?$/i,
      isReceived: true
    }
  ];

  for (const { pattern, isReceived } of namePatterns) {
    const match = raw.match(pattern);
    if (!match) continue;

    // Figure out which capture group is the number vs the name
    const g1IsNumber = /^\d/.test(match[1]);
    const amount = Number(g1IsNumber ? match[1] : match[2]);
    const rawName = g1IsNumber ? match[2] : match[1];

    if (Number.isFinite(amount) && amount > 0 && rawName) {
      return { customer_name: titleCase(rawName.trim()), amount, isReceived };
    }
  }

  // Fallback broad patterns for English
  const fallbackPatterns = [
    /^(?:([a-zA-Z][a-zA-Z .'-]*)\s+)?(?:ne|se)\s+(\d+(?:\.\d+)?)\s+received$/i,
    /^(?:([a-zA-Z][a-zA-Z .'-]*)\s+)?(\d+(?:\.\d+)?)\s+received$/i,
    /^(?:([a-zA-Z][a-zA-Z .'-]*)\s+)?received\s+(\d+(?:\.\d+)?)$/i,
    /^received\s+(\d+(?:\.\d+)?)\s+from\s+([a-zA-Z][a-zA-Z .'-]*)$/i,
  ];

  for (const pattern of fallbackPatterns) {
    const match = raw.match(pattern);
    if (!match) continue;

    let customerName = null;
    let amount = null;

    if (pattern.source.startsWith('^received')) {
      amount = Number(match[1]);
      customerName = match[2];
    } else {
      customerName = match[1];
      amount = Number(match[2]);
    }

    if (Number.isFinite(amount) && amount > 0) {
      return {
        customer_name: customerName ? titleCase(customerName) : knownCustomer,
        amount,
        isReceived: true
      };
    }
  }

  return null;
};


/*
 * ============================================================
 * QUANTITY
 * ============================================================
 */

const extractQuantity = clean => {

  const match =
    clean.match(
      /(?:^|\s)(\d+(?:\.\d+)?)(?:\s|$)/
    );


  if (!match) {
    return 1;
  }


  const value =
    Number(
      match[1]
    );


  return Number.isFinite(
    value
  ) &&
    value > 0
    ? value
    : 1;
};


/*
 * ============================================================
 * PRODUCT FROM INVENTORY
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
    inventoryNames.length === 0
  ) {
    return null;
  }


  const lower =
    raw.toLowerCase();


  const sorted =
    [...inventoryNames]
      .filter(Boolean)
      .sort(
        (a, b) =>
          String(b).length -
          String(a).length
      );


  return (
    sorted.find(
      name =>
        lower.includes(
          String(name)
            .toLowerCase()
        )
    ) ||
    null
  );
};


/*
 * ============================================================
 * PRODUCT FALLBACK
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


  if (exact) {
    return exact;
  }


  const tokens =
    raw
      .split(/\s+/)
      .filter(
        word => {

          if (!word) {
            return false;
          }

          // 🚀 Filter out numbers, even with currency symbols attached
          if (/^(?:₹|rs\.?|rupees?)?\d+(?:\.\d+)?$/i.test(word)) {
            return false;
          }

          if (
            STOP_WORDS.has(
              word
            )
          ) {
            return false;
          }


          if (
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
            ].includes(
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
        tokens.join(' ')
      )
    : null;
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

  if (!raw) {
    return makeResult({
      intent:
        'unknown',

      confidence:
        0,
    });
  }


  /*
   * ==========================================================
   * CUSTOMER CREATE MUST ALWAYS COME FIRST
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
   * PAYMENT OR FLAT UDHAAR
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

    if (payment.isReceived) {
      return makeResult({
        intent: 'khata.credit',
        customer_name: payment.customer_name,
        amount: payment.amount,
        confidence: 0.97,
      });
    } else {
      // Extended Udhaar
      return makeResult({
        intent: 'sale.create',
        customer_name: payment.customer_name,
        amount: payment.amount,
        payment_type: 'KHATA',
        confidence: 0.97,
      });
    }
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
   * QUANTITY + PRODUCT
   * ==========================================================
   */

  const qty =
    extractQuantity(
      clean
    );


  const product =
    productFromWords(
      raw,
      inventoryNames
    );


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
    /\b(cash|nagad|rokar)\b/i.test(
      clean
    )
  ) {

    return makeResult({

      intent:
        'sale.create',

      product,

      qty,

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
   * KHATA QUERY
   * (Moved above Inventory Add to prevent false hijacking)
   * ==========================================================
   */

  if (
    /\b(khata|udhaar|udhar|baki)\b/i.test(
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

      confidence:
        matchedCustomer
          ? 0.95
          : 0.90,
    });
  }


  /*
   * ==========================================================
   * INVENTORY ADD
   * ==========================================================
   */

  if (
    /\b(add|jodo|daalo|dalo|stock|plus)\b/i.test(
      clean
    )
  ) {

    return makeResult({

      intent:
        'inventory.add',

      product,

      qty,

      confidence:
        product
          ? 0.96
          : 0.75,
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

    confidence:
      0.40,
  });
}

export default parseVoiceCommandLocally;