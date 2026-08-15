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
 * SYNONYMS
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

  const raw =
    cleanText(text)
      .toLowerCase()
      .replace(
        /[’']/g,
        ''
      )
      .replace(
        /\s+/g,
        ' '
      );


  const clean =
    raw
      .split(' ')
      .map(
        word =>
          SYNONYMS[word] ||
          word
      )
      .join(' ');


  return {
    raw,
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
 *
 * Supported examples:
 *
 * create Ravi account
 * create a Ravi account
 * create new Ravi account
 * create Ravi customer
 * create account for Ravi
 * create a new account for Ravi
 * add Ravi account
 * new Ravi account
 * please create Ravi account
 * Ravi ka account banao
 * Ravi ka naya khata banao
 * Ravi ka khata bana do
 * Ravi ke naam ka khata banao
 * naya khata Ravi ka banao
 * Ravi account banao
 * Ravi customer banao
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

    /*
     * Please create Ravi account
     */

    /^(?:please|pls)\s+(?:create|make|open|add)\s+(?:a\s+|an\s+|new\s+)?(.+?)\s+(?:account|customer|khata)$/i,


    /*
     * Create Ravi account
     * Create a Ravi account
     * Create new Ravi account
     */

    /^(?:create|make|open|add)\s+(?:a\s+|an\s+|new\s+)?(.+?)\s+(?:account|customer|khata)$/i,


    /*
     * Create account for Ravi
     * Create a new account for Ravi
     */

    /^(?:please\s+)?(?:create|make|open|add)\s+(?:a\s+|an\s+|new\s+)?(?:account|customer|khata)\s+(?:for|of)\s+(.+)$/i,


    /*
     * New Ravi account
     */

    /^(?:new|naya)\s+(.+?)\s+(?:account|customer|khata)$/i,


    /*
     * Ravi account banao
     * Ravi customer banao
     * Ravi khata banao
     */

    /^(.+?)\s+(?:account|customer|khata)\s+(?:banao|bnao|bana|banado|banaao|karo|kar\s+do|khol|kholo|khol\s+do)$/i,


    /*
     * Ravi ka account banao
     * Ravi k account banao
     * Ravi ke khate banao
     */

    /^(.+?)\s+(?:ka|k|ke|ki)\s+(?:account|customer|khata|khate)\s+(?:banao|bnao|bana|banado|banaao|karo|kar\s+do|khol|kholo|khol\s+do)$/i,


    /*
     * Ravi ka naya khata banao
     */

    /^(.+?)\s+(?:ka|k|ke|ki)\s+naya\s+(?:account|customer|khata|khate)\s+(?:banao|bnao|bana|banado|banaao|karo|kar\s+do|khol|kholo|khol\s+do)$/i,


    /*
     * Ravi ke naam ka khata banao
     */

    /^(.+?)\s+(?:ke\s+naam\s+ka|ke\s+naam\s+ke|ke\s+naam\s+ki)\s+(?:account|customer|khata|khate)\s+(?:banao|bnao|bana|banado|banaao|karo|kar\s+do|khol|kholo|khol\s+do)$/i,


    /*
     * Naya khata Ravi ka banao
     */

    /^(?:naya|new)\s+(?:account|customer|khata|khate)\s+(.+?)\s+(?:ka|k|ke|ki)\s+(?:banao|bnao|bana|banado|banaao|karo|kar\s+do)$/i,


    /*
     * Account banao Ravi ka
     */

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


  /*
   * ==========================================================
   * FALLBACK CUSTOMER EXTRACTION
   * ==========================================================
   *
   * This handles natural speech such as:
   *
   * "please make a new khata for Ravi"
   * "create new customer Ravi"
   * "please add Ravi as customer"
   *
   * We only use this fallback when a clear customer/account
   * command word is present.
   * ==========================================================
   */

  const hasCustomerCommand =
    /\b(create|make|open|add|new|customer|account|khata|khate|banao|bnao|bana|banado|banaao)\b/i.test(
      normalized
    );


  if (
    !hasCustomerCommand
  ) {
    return null;
  }


  /*
   * "create new customer Ravi"
   */

  let fallback =
    normalized.match(
      /^(?:please\s+)?(?:create|make|open|add)\s+(?:a\s+|an\s+|new\s+)?(?:customer|account|khata|khate)\s+(.+)$/i
    );


  if (
    fallback &&
    fallback[1]
  ) {
    const customerName =
      cleanCustomerName(
        fallback[1]
      );


    if (
      customerName
    ) {
      return customerName;
    }
  }


  /*
   * "create Ravi as customer"
   */

  fallback =
    normalized.match(
      /^(?:please\s+)?(?:create|make|open|add)\s+(.+?)\s+as\s+(?:a\s+)?(?:customer|account)$/i
    );


  if (
    fallback &&
    fallback[1]
  ) {
    const customerName =
      cleanCustomerName(
        fallback[1]
      );


    if (
      customerName
    ) {
      return customerName;
    }
  }


  /*
   * "please add Ravi as a customer"
   */

  fallback =
    normalized.match(
      /^(?:please\s+)?add\s+(.+?)\s+as\s+(?:a\s+)?customer$/i
    );


  if (
    fallback &&
    fallback[1]
  ) {
    const customerName =
      cleanCustomerName(
        fallback[1]
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
 * PAYMENT RECEIVED
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


  if (
    knownCustomer &&
    amountMatch &&
    /\b(received|jama|paid|payment|mil|mile|diye|diya|se|ne)\b/i.test(
      clean
    )
  ) {

    return {
      customer_name:
        knownCustomer,

      amount:
        Number(
          amountMatch[1]
        ),
    };
  }


  const patterns = [

    /*
     * Ravi ne 500 received
     */

    /^(?:([a-zA-Z][a-zA-Z .'-]*)\s+)?(?:ne|se)\s+(\d+(?:\.\d+)?)\s+received$/i,


    /*
     * Ravi 500 received
     */

    /^(?:([a-zA-Z][a-zA-Z .'-]*)\s+)?(\d+(?:\.\d+)?)\s+received$/i,


    /*
     * Ravi received 500
     */

    /^(?:([a-zA-Z][a-zA-Z .'-]*)\s+)?received\s+(\d+(?:\.\d+)?)$/i,


    /*
     * Received 500 from Ravi
     */

    /^received\s+(\d+(?:\.\d+)?)\s+from\s+([a-zA-Z][a-zA-Z .'-]*)$/i,
  ];


  for (
    const pattern of patterns
  ) {

    const match =
      clean.match(
        pattern
      );


    if (!match) {
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
 *
 * IMPORTANT:
 *
 * Customer/account words are removed here.
 *
 * This prevents:
 *
 * "create Ravi account"
 *
 * from becoming:
 *
 * product = "Ravi"
 *
 * if customer detection ever fails.
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


          if (
            /^\d+(?:\.\d+)?$/.test(
              word
            )
          ) {
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
   * PAYMENT RECEIVED
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
   * KHATA QUERY
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