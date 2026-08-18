/**
 * COUNTR Phase 3E-3
 *
 * Gemini Command Bridge
 *
 * Purpose:
 *   Take an already structured Gemini result, validate it with the
 *   deterministic GeminiCommandValidator, and return a safe command
 *   contract for the existing local execution pipeline.
 *
 * IMPORTANT:
 *   This module does NOT execute sales, mutate inventory, create Khata
 *   entries, or write to the database.
 *
 *   Gemini = language interpretation
 *   Validator/Resolver = business authority
 *   Existing executor = transaction authority
 */

import {
  validateGeminiCommand,
} from "./GeminiCommandValidator";

/**
 * Convert a validator READY result into the command contract expected
 * by the rest of COUNTR.
 *
 * Kept separate so Phase 3E-3 is easy to evolve without changing the
 * validator itself.
 */
const buildReadyResult = ({
  validation,
  originalCommand,
}) => {
  return {
    status: "READY",

    source: "GEMINI_VALIDATED",

    command: {
      ...validation.command,

      // Keep the original Gemini result available for diagnostics.
      // Nothing in execution should use this field as authority.
      gemini_raw: originalCommand,
    },

    reason: null,
  };
};

/**
 * Bridge a Gemini result into the deterministic local command system.
 *
 * @param {Object} options
 * @param {Object} options.geminiResult
 * @param {Array} options.inventory
 * @param {Array} options.customerNames
 *
 * @returns {Object}
 *
 * Possible statuses come from GeminiCommandValidator:
 *   READY
 *   PRODUCT_REQUIRED
 *   PRODUCT_NOT_FOUND
 *   UNIT_VARIANT_NOT_FOUND
 *   PRICE_VARIANT_NOT_FOUND
 *   CUSTOMER_REQUIRED
 *   AMOUNT_REQUIRED
 *   INVALID_QUANTITY
 */
export const bridgeGeminiCommand = ({
  geminiResult,
  inventory = [],
  customerNames = [],
} = {}) => {
  if (
    !geminiResult ||
    typeof geminiResult !== "object"
  ) {
    return {
      status: "INVALID_GEMINI_RESULT",
      source: "GEMINI_BRIDGE",
      command: null,
      reason: "Gemini result must be an object.",
    };
  }

  // Support both:
  //
  // 1. Raw Gemini command:
  //    { intent, product, quantity, ... }
  //
  // 2. A parser response wrapper:
  //    { command: { intent, product, ... } }
  //
  // The wrapper is only unwrapped here; validation still happens below.
  const originalCommand =
    geminiResult.command &&
    typeof geminiResult.command === "object"
      ? geminiResult.command
      : geminiResult;

  const validation =
    validateGeminiCommand({
      command: originalCommand,
      inventory,
      customerNames,
    });

  if (
    !validation ||
    validation.status !== "READY"
  ) {
    return {
      status:
        validation?.status ||
        "GEMINI_VALIDATION_FAILED",

      source: "GEMINI_BRIDGE",

      command: null,

      reason:
        validation?.reason ||
        "Gemini command failed deterministic validation.",
    };
  }

  return buildReadyResult({
    validation,
    originalCommand,
  });
};

export default bridgeGeminiCommand;
