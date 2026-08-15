/*
 * ============================================================
 * StoreMate Local Voice Parser
 * ============================================================
 *
 * IMPORTANT:
 *
 * This file ONLY converts speech into an intent object.
 *
 * It NEVER writes to WatermelonDB.
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

  /*
   * Sales
   */
  cell: 'sell',
  sel: 'sell',
  sal: 'sell',
  sall: 'sell',
  sale: 'sell',
  becho: 'sell',
  bechi: 'sell',
  bikri: 'sell',
  bill: 'sell',

  /*
   * Inventory
   */
  jodo: 'add',
  daalo: 'add',
  dalo: 'add',
  bhandar: 'add',
  stock: 'add',
  ad: 'add',
  plus: 'add',

  /*
   * Khata
   */
  udhaar: 'khata',
  udhar: 'khata',
  baki: 'khata',
  khaata: 'khata',

  /*
   * Payment
   */
  jama: 'received',
  diye: 'received',
  diya: 'received',
  receive: 'received',
  received: 'received',
  pay: 'received',
  paid: 'received',
  mil: 'received',
  mile: 'received',

  /*
   * Hindi numbers
   */
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
  'customer',
  'customers',
  'khata',
  'khate',
  'banao',
  'bnao',
  'bana',
  'banado',
  'banaao',
  'do',
  'karo',
  'kar',
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
        .slice(
          0,
          500
        )
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

  source:
    'local_rules',
});


/*
 * ============================================================
 * CUSTOMER NAME MATCHING
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
 * CUSTOMER CREATION
 * ============================================================
 */

const extractCustomerCreation = raw => {

  const patterns = [

    /*
     * Create Ravi account
     */
    /^(?:create|make|open)\s+(?:an?\s+)?(.+?)\s+(?:account|customer|khata)$/i,

    /*
     * Add Ravi account
     */
    /^add\s+(.+?)\s+(?:account|customer|khata)$/i,

    /*
     * Create account for Ravi
     */
    /^(?:create|make|open|add)\s+(?:an?\s+)?(?:account|customer|khata)\s+(?:for|of)\s+(.+)$/i,

    /*
     * New Ravi account
     */
    /^new\s+(.+?)\s+(?:account|customer|khata)$/i,

    /*
     * Ravi ka khata banao
     */
    /^(.+?)\s+(?:ka|k|ke|ki)\s+(?:naya\s+)?(?:account|customer|khata)\s+(?:banao|bnao|bana|banado|banaao|karo|kar\s+do|khol|kholo|khol\s+do)$/i,

    /*
     * Ravi ka naya khata banao
     */
    /^(.+?)\s+(?:ka|k|ke|ki)\s+naya\s+(?:account|customer|khata)\s+(?:banao|bnao|bana|banado|banaao|karo|kar\s+do|khol|kholo|khol\s+do)$/i,

    /*
     * Naya khata Ravi ka banao
     */
    /^naya\s+(?:account|customer|khata)\s+(.+?)\s+(?:ka|k|ke|ki)\s+(?:banao|bnao|bana|karo|kar\s+do)$/i,
  ];


  for (
    const pattern of patterns
  ) {

    const match =
      raw.match(
        pattern
      );


    if (
      !match ||
      !match[1]
    ) {

      continue;
    }


    const name =
      match[1]
        .replace(
          /\b(?:naya|new)\b/gi,
          ''
        )
        .trim();


    if (
      !name ||
      name.length < 2
    ) {

      continue;
    }


    /*
     * Reject obvious command words accidentally captured
     * as a name.
     */

    const badName =
      new Set([
        'account',
        'customer',
        'khata',
        'new',
        'naya',
        'product',
        'item',
      ]);


    if (
      badName.has(
        name.toLowerCase()
      )
    ) {

      continue;
    }


    return titleCase(
      name
    );
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

  /*
   * First prefer a known customer name.
   */

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
              'cash',
              'received',
              'from',
              'ne',
              'se',
              'discount',
              'percent',
              'payment',
              'jama',
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
   * 1. CUSTOMER CREATE
   * ==========================================================
   */

  const customer =
    extractCustomerCreation(
      raw
    );


  if (customer) {

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
   * 2. PAYMENT RECEIVED
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
   * 3. DISCOUNT
   * ==========================================================
   */

  const discountMatch =
    clean.match(
      /(\d+(?:\.\d+)?)\s*(?:%|percent|discount)/
    );


  if (discountMatch) {

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
   * 4. QUANTITY + PRODUCT
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
   * 5. CASH / SALE
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
   * 6. CASH SALE
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
   * 7. INVENTORY ADD
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
   * 8. KHATA QUERY
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
   * 9. UNKNOWN
   * ==========================================================
   */

  return makeResult({

    intent:
      'unknown',

    product,

    qty,

    confidence:
      0.40,
  });
}


export default parseVoiceCommandLocally;