/**
 * COUNTR Phase 3E-2
 * Gemini result validator / normalizer.
 *
 * Gemini interprets language.
 * This module remains the business authority.
 *
 * IMPORTANT:
 * - Gemini does NOT execute transactions.
 * - Gemini does NOT decide which inventory variant exists.
 * - Explicit prices are never silently substituted.
 * - Explicit units are never silently substituted.
 * - Price is never treated as quantity.
 */

const SALE_INTENTS = new Set([
  "sale.create",
]);

const KHATA_INTENTS = new Set([
  "khata.credit",
  "khata.debit",
  "khata.payment",
]);

const INVENTORY_INTENTS = new Set([
  "inventory.add",
  "inventory.update",
]);

const ALLOWED_INTENTS = new Set([
  "sale.create",

  "khata.credit",
  "khata.debit",
  "khata.payment",

  "customer.create",

  "inventory.add",
  "inventory.update",
  "inventory.update_price",

  "query.inventory",
  "query.sales",
  "query.khata",

  "pos.apply_discount",
  "pos.checkout",

  "expense.create",

  "unknown",
]);


// ============================================================
// UNIT ALIASES
// ============================================================

const UNIT_ALIASES = {

  pc: "PCS",
  pcs: "PCS",
  piece: "PCS",
  pieces: "PCS",

  item: "PCS",
  items: "PCS",

  packet: "PACKET",
  packets: "PACKET",
  pkt: "PACKET",

  box: "BOX",
  boxes: "BOX",

  bottle: "BOTTLE",
  bottles: "BOTTLE",

  kg: "KG",
  kilo: "KG",
  kilos: "KG",
  kilogram: "KG",
  kilograms: "KG",

  g: "G",
  gm: "G",
  gram: "G",
  grams: "G",

  l: "L",
  litre: "L",
  liter: "L",
  liters: "L",
  litres: "L",

  ml: "ML",
  millilitre: "ML",
  milliliter: "ML",
};


// ============================================================
// PRODUCT ALIASES
// ============================================================
//
// These are deterministic aliases.
// Gemini may say "Parle Ji", but the inventory may contain
// "Parle G".
//
// This does NOT create an inventory item.
// It only normalizes the name before inventory validation.
// ============================================================

const PRODUCT_ALIASES = {

  "parle ji": "Parle G",
  "parle jee": "Parle G",
  "parle g": "Parle G",

  shakkar: "Sugar",
  chini: "Sugar",
  cheeni: "Sugar",

  chawal: "Rice",
  rice: "Rice",

  "basmati chawal": "Basmati Rice",
  "basmati rice": "Basmati Rice",
};


// ============================================================
// TEXT NORMALIZATION
// ============================================================

const normalizeText = value =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[₹,]/g, " ")
    .replace(/\s+/g, " ");


// ============================================================
// UNIT NORMALIZATION
// ============================================================

const normalizeUnit = value => {

  if (!value) {
    return null;
  }

  const key =
    normalizeText(value);

  return (
    UNIT_ALIASES[key] ||
    String(value)
      .trim()
      .toUpperCase()
  );
};


// ============================================================
// PRODUCT NORMALIZATION
// ============================================================

const normalizeProductName = value => {

  if (!value) {
    return null;
  }

  const original =
    String(value).trim();

  const key =
    normalizeText(original);

  return (
    PRODUCT_ALIASES[key] ||
    original
  );
};


// ============================================================
// NUMBER NORMALIZATION
// ============================================================

const toNumberOrNull = value => {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : null;
};


// ============================================================
// GENERIC FIELD READER
// ============================================================

const getField = (
  object,
  ...names
) => {

  for (
    const name of names
  ) {

    if (
      object &&
      Object.prototype.hasOwnProperty.call(
        object,
        name
      )
    ) {

      return object[name];
    }
  }

  return null;
};


// ============================================================
// INVENTORY FIELD READER
// ============================================================
//
// Supports:
// - normal JS objects
// - snake_case backend objects
// - WatermelonDB-style getter objects
// ============================================================

const readInventoryField = (
  item,
  ...names
) => {

  if (!item) {
    return null;
  }

  for (
    const name of names
  ) {

    if (
      Object.prototype.hasOwnProperty.call(
        item,
        name
      )
    ) {

      return item[name];
    }


    try {

      if (
        typeof item.get ===
        "function"
      ) {

        const value =
          item.get(name);

        if (
          value !== undefined
        ) {

          return value;
        }
      }

    } catch (_) {

      // Ignore unsupported
      // WatermelonDB getter fields.

    }
  }

  return null;
};


// ============================================================
// INVENTORY NORMALIZATION
// ============================================================

const inventoryProduct = item =>
  normalizeProductName(
    readInventoryField(
      item,
      "productName",
      "product_name",
      "name"
    )
  );


const inventoryPrice = item =>
  toNumberOrNull(
    readInventoryField(
      item,
      "sellingPrice",
      "selling_price",
      "price"
    )
  );


const inventoryUnit = item =>
  normalizeUnit(
    readInventoryField(
      item,
      "unit",
      "unitType",
      "stockUnit"
    )
  );


// ============================================================
// PRODUCT COMPARISON
// ============================================================

const productNamesEqual = (
  a,
  b
) => {

  return (
    normalizeText(
      normalizeProductName(a)
    ) ===
    normalizeText(
      normalizeProductName(b)
    )
  );
};


// ============================================================
// FIND PRODUCT CANDIDATES
// ============================================================

const findProductCandidates = (
  inventory,
  product
) => {

  if (!product) {
    return [];
  }

  return (
    Array.isArray(inventory)
      ? inventory
      : []
  ).filter(
    item =>
      productNamesEqual(
        inventoryProduct(item),
        product
      )
  );
};


// ============================================================
// MAIN VALIDATOR
// ============================================================

export const validateGeminiCommand = ({
  command,
  inventory = [],
  customerNames = [],
} = {}) => {

  // ----------------------------------------------------------
  // BASIC INPUT
  // ----------------------------------------------------------

  const input =
    command &&
    typeof command === "object"
      ? command
      : {};


  // ----------------------------------------------------------
  // INTENT
  // ----------------------------------------------------------

  let intent =
    getField(
      input,
      "intent"
    );


  if (
    !ALLOWED_INTENTS.has(
      intent
    )
  ) {

    intent =
      "unknown";
  }


  // ----------------------------------------------------------
  // PRODUCT
  // ----------------------------------------------------------

  let product =
    normalizeProductName(
      getField(
        input,
        "product",
        "product_name",
        "productName"
      )
    );


  // ----------------------------------------------------------
  // QUANTITY
  // ----------------------------------------------------------

  let quantity =
    toNumberOrNull(
      getField(
        input,
        "quantity",
        "qty"
      )
    );


  // ----------------------------------------------------------
  // UNIT
  // ----------------------------------------------------------

  const unit =
    normalizeUnit(
      getField(
        input,
        "unit",
        "unit_type",
        "unitType"
      )
    );


  // ----------------------------------------------------------
  // PRICE
  // ----------------------------------------------------------

  const priceHint =
    toNumberOrNull(
      getField(
        input,
        "price_hint",
        "priceHint"
      )
    );


  // ----------------------------------------------------------
  // MONEY AMOUNT
  // ----------------------------------------------------------

  const amount =
    toNumberOrNull(
      getField(
        input,
        "amount"
      )
    );


  // ----------------------------------------------------------
  // NEW PRICE
  // ----------------------------------------------------------

  const newPrice =
    toNumberOrNull(
      getField(
        input,
        "new_price",
        "newPrice"
      )
    );


  // ----------------------------------------------------------
  // DISCOUNT
  // ----------------------------------------------------------

  const discountPercent =
    toNumberOrNull(
      getField(
        input,
        "discount_percent",
        "discountPercent"
      )
    );


  // ----------------------------------------------------------
  // CUSTOMER
  // ----------------------------------------------------------

  let customerName =
    getField(
      input,
      "customer_name",
      "customerName"
    );


  if (
    typeof customerName ===
    "string"
  ) {

    customerName =
      customerName.trim() ||
      null;
  }


  // ----------------------------------------------------------
  // PAYMENT TYPE
  // ----------------------------------------------------------

  let paymentType =
    getField(
      input,
      "payment_type",
      "paymentType"
    );


  if (
    KHATA_INTENTS.has(intent) &&
    !paymentType
  ) {

    paymentType =
      "KHATA";
  }


  if (paymentType) {

    paymentType =
      String(paymentType)
        .trim()
        .toUpperCase();
  }


  // ----------------------------------------------------------
  // CONFIDENCE
  // ----------------------------------------------------------

  const confidenceValue =
    toNumberOrNull(
      getField(
        input,
        "confidence"
      )
    );


  const confidence =
    Math.max(
      0,
      Math.min(
        1,
        confidenceValue ?? 0
      )
    );


  // ==========================================================
  // KHATA VALIDATION
  // ==========================================================

  if (
    KHATA_INTENTS.has(intent)
  ) {

    if (!customerName) {

      return {

        status:
          "CUSTOMER_REQUIRED",

        reason:
          "Khata command requires customer_name.",

        command:
          null,

      };
    }


    // Money-only Khata:

    if (
      amount === null &&
      !product
    ) {

      return {

        status:
          "AMOUNT_REQUIRED",

        reason:
          "Money-only Khata command requires amount.",

        command:
          null,

      };
    }
  }


  // ==========================================================
  // PRICE-VARIANT SALE NORMALIZATION
  // ==========================================================
  //
  // Gemini can occasionally return:
  //
  // intent: "unknown"
  // product: "Parle Ji"
  // price_hint: 10
  // quantity: null
  //
  // for:
  //
  // "10 wala Parle Ji"
  //
  // COUNTR knows this pattern.
  //
  // Product + explicit price + no quantity
  // means one item.
  //
  // We promote it to sale.create.
  //
  // IMPORTANT:
  // Inventory is STILL checked below.
  // Gemini cannot invent the variant.
  // ==========================================================

  const looksLikePriceVariantSale =
    Boolean(product) &&
    priceHint !== null &&
    quantity === null &&
    (
      SALE_INTENTS.has(intent) ||
      intent === "unknown"
    );


  if (
    looksLikePriceVariantSale
  ) {

    quantity =
      1;


    if (
      intent === "unknown"
    ) {

      intent =
        "sale.create";
    }
  }


  // ==========================================================
  // INVENTORY REQUIREMENT
  // ==========================================================
  //
  // IMPORTANT:
  // This is calculated AFTER the price-variant normalization.
  //
  // This fixes the previous bug where:
  //
  // unknown → sale.create
  //
  // happened after needsInventory had already been calculated.
  // ==========================================================

  const needsInventory =
    SALE_INTENTS.has(intent) ||
    INVENTORY_INTENTS.has(intent) ||
    intent === "inventory.update_price";


  // ==========================================================
  // PRODUCT REQUIRED
  // ==========================================================

  if (
    needsInventory &&
    !product
  ) {

    return {

      status:
        "PRODUCT_REQUIRED",

      reason:
        "Product command requires a product.",

      command:
        null,

    };
  }


  // ==========================================================
  // QUANTITY VALIDATION
  // ==========================================================

  if (
    SALE_INTENTS.has(intent) &&
    quantity !== null &&
    quantity <= 0
  ) {

    return {

      status:
        "INVALID_QUANTITY",

      reason:
        "Quantity must be greater than zero.",

      command:
        null,

    };
  }


  // ==========================================================
  // INVENTORY RESOLUTION
  // ==========================================================

  let resolvedItem =
    null;


  if (
    needsInventory &&
    product
  ) {

    // --------------------------------------------------------
    // PRODUCT
    // --------------------------------------------------------

    const candidates =
      findProductCandidates(
        inventory,
        product
      );


    if (
      !candidates.length
    ) {

      return {

        status:
          "PRODUCT_NOT_FOUND",

        reason:
          `No inventory product matches "${product}".`,

        command:
          null,

      };
    }


    // --------------------------------------------------------
    // UNIT
    // --------------------------------------------------------

    let unitMatches =
      candidates;


    if (unit) {

      unitMatches =
        candidates.filter(
          item =>
            inventoryUnit(item) ===
            unit
        );


      if (
        !unitMatches.length
      ) {

        return {

          status:
            "UNIT_VARIANT_NOT_FOUND",

          reason:
            `No "${product}" inventory variant uses unit "${unit}".`,

          command:
            null,

        };
      }
    }


    // --------------------------------------------------------
    // INITIAL ITEM
    // --------------------------------------------------------

    resolvedItem =
      unitMatches[0];


    // --------------------------------------------------------
    // EXPLICIT PRICE
    // --------------------------------------------------------
    //
    // NEVER silently substitute another price.
    // --------------------------------------------------------

    if (
      priceHint !== null
    ) {

      const priceMatches =
        unitMatches.filter(
          item =>
            inventoryPrice(item) ===
            priceHint
        );


      if (
        !priceMatches.length
      ) {

        return {

          status:
            "PRICE_VARIANT_NOT_FOUND",

          reason:
            `No "${product}" inventory variant matches price ${priceHint}.`,

          command:
            null,

        };
      }


      resolvedItem =
        priceMatches[0];
    }
  }


  // ==========================================================
  // QUERY VALIDATION
  // ==========================================================

  if (
    intent ===
      "query.inventory" &&
    !product
  ) {

    return {

      status:
        "PRODUCT_REQUIRED",

      reason:
        "Inventory query requires a product.",

      command:
        null,

    };
  }


  if (
    intent ===
      "query.khata" &&
    !customerName
  ) {

    return {

      status:
        "CUSTOMER_REQUIRED",

      reason:
        "Khata query requires customer_name.",

      command:
        null,

    };
  }


  // ==========================================================
  // CUSTOMER NORMALIZATION
  // ==========================================================

  if (
    customerName &&
    Array.isArray(
      customerNames
    )
  ) {

    const exactCustomer =
      customerNames.find(
        name =>
          normalizeText(name) ===
          normalizeText(
            customerName
          )
      );


    if (
      exactCustomer
    ) {

      customerName =
        exactCustomer;
    }
  }


  // ==========================================================
  // FINAL SAFE COMMAND
  // ==========================================================

  return {

    status:
      "READY",

    reason:
      null,

    command: {

      ...input,

      intent,

      product,

      quantity,

      unit,

      price_hint:
        priceHint,

      amount,

      new_price:
        newPrice,

      discount_percent:
        discountPercent,

      customer_name:
        customerName,

      payment_type:
        paymentType,

      confidence,

      // ------------------------------------------------------
      // ACTUAL INVENTORY RECORD
      // ------------------------------------------------------

      resolved_inventory_id:
        resolvedItem
          ? readInventoryField(
              resolvedItem,
              "id"
            )
          : null,


      resolved_inventory_item:
        resolvedItem ||
        null,


      source:
        "GEMINI_VALIDATED",

    },
  };
};


export default validateGeminiCommand;