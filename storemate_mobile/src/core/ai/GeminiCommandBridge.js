/**
 * ============================================================
 * COUNTR Phase 3E-3
 * Gemini Command Bridge
 * Purpose: Take structured backend result, validate it deterministically, and return a safe command contract.
 * ============================================================
 */

import { validateGeminiCommand } from "./GeminiCommandValidator";

const buildReadyResult = ({ validation, originalCommand }) => {
  return {
    status: "READY", source: "GEMINI_VALIDATED",
    command: {
      ...validation.command,
      gemini_raw: {
        intent: originalCommand.intent ?? null, product: originalCommand.product ?? null, quantity: originalCommand.quantity ?? null,
        qty: originalCommand.qty ?? null, unit: originalCommand.unit ?? null, price_hint: originalCommand.price_hint ?? null,
        amount: originalCommand.amount ?? null, customer_name: originalCommand.customer_name ?? null, payment_type: originalCommand.payment_type ?? null,
        confidence: originalCommand.confidence ?? null, source: originalCommand.source ?? null
      }
    },
    reason: null
  };
};

const normalizeCommand = command => {
  if (!command || typeof command !== "object" || Array.isArray(command)) return null;
  return {
    ...command,
    quantity: command.quantity ?? command.qty ?? null, qty: command.qty ?? command.quantity ?? null,
    product: typeof command.product === "string" ? command.product.trim() || null : (command.product ?? null),
    unit: typeof command.unit === "string" ? command.unit.trim().toUpperCase() || null : (command.unit ?? null),
    price_hint: command.price_hint ?? null, amount: command.amount ?? null,
    customer_name: typeof command.customer_name === "string" ? command.customer_name.trim() || null : (command.customer_name ?? null)
  };
};

export const bridgeGeminiCommand = ({ geminiResult, inventory = [], customerNames = [] } = {}) => {
  if (!geminiResult || typeof geminiResult !== "object" || Array.isArray(geminiResult)) return { status: "INVALID_GEMINI_RESULT", source: "GEMINI_BRIDGE", command: null, reason: "Gemini result must be an object." };
  const rawCommand = geminiResult.command && typeof geminiResult.command === "object" && !Array.isArray(geminiResult.command) ? geminiResult.command : geminiResult;
  const originalCommand = normalizeCommand(rawCommand);
  if (!originalCommand) return { status: "INVALID_GEMINI_COMMAND", source: "GEMINI_BRIDGE", command: null, reason: "Gemini command could not be normalized." };

  const safeInventory = Array.isArray(inventory) ? inventory : [];
  const safeCustomerNames = Array.isArray(customerNames) ? customerNames : [];
  let validation;

  try { validation = validateGeminiCommand({ command: originalCommand, inventory: safeInventory, customerNames: safeCustomerNames }); } 
  catch (error) { return { status: "GEMINI_VALIDATION_ERROR", source: "GEMINI_BRIDGE", command: null, reason: error?.message || "Gemini command validation failed." }; }

  if (!validation || validation.status !== "READY") return { status: validation?.status || "GEMINI_VALIDATION_FAILED", source: "GEMINI_BRIDGE", command: null, reason: validation?.reason || "Gemini command failed deterministic validation." };
  return buildReadyResult({ validation, originalCommand });
};

export default bridgeGeminiCommand;