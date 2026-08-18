/**
 * ============================================================
 * COUNTR - LOCAL COMMAND PIPELINE
 * ============================================================
 *
 * Phase 3C
 *
 * Local flow:
 *
 *   Voice text
 *      ↓
 *   LocalVoiceParser
 *      ↓
 *   InventoryVariantResolver
 *      ↓
 *   Safe normalized command
 *
 * This layer NEVER writes to the database.
 * ============================================================
 */

import {
  parseVoiceCommandLocally,
} from './LocalVoiceParser';

import {
  resolveInventoryVariant,
} from './InventoryVariantResolver';


/* ============================================================
 * HELPERS
 * ============================================================
 */

const numberOrNull = value => {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : null;
};


const cleanName = value => {

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(value).trim();

  return text || null;
};


const normalizeText = value =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();


/* ============================================================
 * MONEY-ONLY KHATA DETECTION
 * ============================================================
 *
 * IMPORTANT:
 *
 * LocalVoiceParser may classify:
 *
 *   "rahul ke khate mein paanch sau rupaye daalo"
 *
 * as sale.create because "daalo" / "add" can also occur in
 * product commands.
 *
 * At the pipeline level we make the final distinction:
 *
 *   customer + money + khata + NO PRODUCT
 *
 * => khata.credit
 *
 * This is intentionally deterministic.
 * ============================================================
 */

const isKhataPhrase = text => {

  const normalized =
    normalizeText(text);

  return (
    /\b(?:ke|ki|ka)\s+(?:khate|khata|account|account\s+mein|account\s+me)\b/i
      .test(normalized) ||
    /\bkhate\s+mein\b/i.test(normalized) ||
    /\bkhata\s+mein\b/i.test(normalized) ||
    /\baccount\s+mein\b/i.test(normalized) ||
    /\baccount\s+me\b/i.test(normalized)
  );
};


const hasMoneyPhrase = text => {

  const normalized =
    normalizeText(text);

  return (
    /(?:₹|rs\.?|rupees?|rupaye?|rupay|rupee|रुपये|रुपए|रुपया)\b/i
      .test(normalized)
  );
};


const looksLikeMoneyOnlyKhataCommand = ({
  text,
  parsed,
}) => {

  if (!isKhataPhrase(text)) {
    return false;
  }

  const amount =
    numberOrNull(
      parsed?.amount
    );

  if (amount === null) {
    return false;
  }

  /*
   * If the spoken command explicitly contains a money marker,
   * it is overwhelmingly a money-only khata operation unless
   * an actual product is also clearly present.
   */
  if (hasMoneyPhrase(text)) {
    return true;
  }

  /*
   * Hindi number + khata can be used without "rupaye":
   *
   * "Rahul ke khate mein paanch sau daal do"
   *
   * Only treat it as money-only when parser has no useful
   * product name.
   */
  const product =
    parsed?.product ||
    parsed?.product_name;

  return !product;
};


/* ============================================================
 * NORMALIZED COMMAND
 * ============================================================
 */

const buildNormalizedCommand = ({
  parsed,
  resolved,
}) => {

  const command = {

    intent:
      parsed.intent || 'unknown',

    product:
      parsed.product ||
      parsed.product_name ||
      null,

    quantity:
      numberOrNull(
        parsed.qty ??
        parsed.quantity
      ),

    unit:
      parsed.unit ||
      null,

    price_hint:
      numberOrNull(
        parsed.price_hint ??
        parsed.variant_price
      ),

    amount:
      numberOrNull(
        parsed.amount
      ),

    customer_name:
      cleanName(
        parsed.customer_name
      ),

    payment_type:
      parsed.payment_type ||
      null,

    confidence:
      numberOrNull(
        parsed.confidence
      ),

    source:
      'local',

  };


  if (
    resolved &&
    resolved.status === 'FOUND'
  ) {

    command.inventory_item_id =
      resolved.id;

    command.product =
      resolved.product_name ||
      command.product;

    command.selling_price =
      numberOrNull(
        resolved.selling_price
      );

    command.inventory_unit =
      resolved.unit ||
      null;

    command.stock_quantity =
      numberOrNull(
        resolved.stock_quantity
      );

    command.variant_resolved =
      true;

  } else {

    command.variant_resolved =
      false;

  }


  return command;
};


/* ============================================================
 * MAIN PIPELINE
 * ============================================================
 */

export const processLocalVoiceCommand = ({
  text,
  inventory = [],
  customerNames = [],
} = {}) => {

  if (
    !text ||
    typeof text !== 'string' ||
    !text.trim()
  ) {

    return {

      status:
        'INVALID_COMMAND',

      reason:
        'Voice command is empty.',

      command:
        null,

    };

  }


  /* ==========================================================
   * STEP 1 - LOCAL PARSER
   * ==========================================================
   */

  let parsed;

  try {

    parsed =
      parseVoiceCommandLocally(
        text,
        inventory.map(
          item =>
            item?.productName ??
            item?.product_name ??
            item
        ),
        customerNames
      );

  } catch (error) {

    return {

      status:
        'PARSER_ERROR',

      reason:
        error?.message ||
        'Local voice parser failed.',

      command:
        null,

    };

  }


  if (!parsed) {

    return {

      status:
        'UNKNOWN_COMMAND',

      reason:
        'Local parser returned no result.',

      parsed:
        null,

      command:
        null,

    };

  }


  /* ==========================================================
   * STEP 2 - MONEY-ONLY KHATA
   * ==========================================================
   *
   * Do this BEFORE product resolution.
   *
   * This fixes:
   *
   * "Rahul ke khate mein paanch sau rupaye daalo"
   *
   * even if LocalVoiceParser classified it as sale.create.
   * ==========================================================
   */

  if (
    looksLikeMoneyOnlyKhataCommand({
      text,
      parsed,
    })
  ) {

    const moneyParsed = {

      ...parsed,

      intent:
        'khata.credit',

      product:
        null,

      product_name:
        null,

      payment_type:
        'KHATA',

    };


    return {

      status:
        'READY',

      command:
        buildNormalizedCommand({
          parsed:
            moneyParsed,

          resolved:
            null,
        }),

      parsed:
        moneyParsed,

      inventory:
        null,

    };

  }


  /* ==========================================================
   * STEP 3 - UNKNOWN INTENT
   * ==========================================================
   */

  if (
    parsed.intent === 'unknown'
  ) {

    return {

      status:
        'UNKNOWN_COMMAND',

      reason:
        'Local parser could not determine the command.',

      parsed,

      command:
        null,

    };

  }


  /* ==========================================================
   * STEP 4 - PRODUCT DETECTION
   * ==========================================================
   */

  const hasProduct =
    Boolean(
      parsed.product ||
      parsed.product_name
    );


  /*
   * Non-product commands such as queries can pass through
   * without inventory resolution.
   */

  if (!hasProduct) {

    return {

      status:
        'READY',

      command:
        buildNormalizedCommand({
          parsed,
          resolved:
            null,
        }),

      parsed,

      inventory:
        null,

    };

  }


  /* ==========================================================
   * STEP 5 - INVENTORY VARIANT RESOLUTION
   * ==========================================================
   */

  let resolved;

  try {

    resolved =
      resolveInventoryVariant({

        command:
          parsed,

        inventory,

      });

  } catch (error) {

    return {

      status:
        'RESOLVER_ERROR',

      reason:
        error?.message ||
        'Inventory variant resolver failed.',

      parsed,

      command:
        null,

    };

  }


  /* ==========================================================
   * STEP 6 - SAFE FAILURE
   * ==========================================================
   */

  if (
    !resolved ||
    resolved.status !== 'FOUND'
  ) {

    return {

      status:
        resolved?.status ||
        'VARIANT_NOT_FOUND',

      reason:
        resolved?.reason ||
        'Inventory variant could not be resolved.',

      parsed,

      command:
        buildNormalizedCommand({
          parsed,
          resolved,
        }),

      inventory:
        resolved || null,

    };

  }


  /* ==========================================================
   * STEP 7 - FINAL COMMAND
   * ==========================================================
   */

  const command =
    buildNormalizedCommand({
      parsed,
      resolved,
    });


  /*
   * Product placed directly into khata remains a sale/create
   * operation with KHATA payment.
   */

  if (
    parsed.payment_type ===
    'KHATA'
  ) {

    command.payment_type =
      'KHATA';

  }


  return {

    status:
      'READY',

    command,

    parsed,

    inventory:
      resolved,

  };

};


/* ============================================================
 * CAN EXECUTE?
 * ============================================================
 *
 * Validation only. No DB mutation.
 * ============================================================
 */

export const canExecuteLocalCommand =
  result => {

    if (
      !result ||
      result.status !==
        'READY'
    ) {

      return false;

    }


    const command =
      result.command;


    if (!command) {
      return false;
    }


    if (
      command.intent ===
      'sale.create'
    ) {

      return Boolean(
        command.inventory_item_id
      );

    }


    if (
      command.intent ===
      'khata.credit'
    ) {

      return (
        Boolean(
          command.customer_name
        ) &&
        numberOrNull(
          command.amount
        ) !== null
      );

    }


    return true;

  };


export default {
  processLocalVoiceCommand,
  canExecuteLocalCommand,
};
