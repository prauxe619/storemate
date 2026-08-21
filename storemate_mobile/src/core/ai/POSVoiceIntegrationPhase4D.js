/**
 * ============================================================
 * COUNTR PHASE 4D
 * POS VOICE INTEGRATION
 * ============================================================
 *
 * Speech -> VoiceCommandRouter -> Deterministic validation -> VoiceTransactionService -> POS handlers
 *
 * IMPORTANT: The router receives BOTH actual inventory objects and inventory names.
 * - names are enough for backend language parsing
 * - actual objects are required for local inventory resolution
 * ============================================================
 */

import { parseVoiceCommand } from './VoiceCommandRouter';
import { executeVoiceTransaction } from './VoiceTransactionService';

const sanitizeText = value => {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 500);
};

const normalizeRouterResult = routerResult => {
  if (!routerResult || typeof routerResult !== 'object' || Array.isArray(routerResult)) {
    return { status: 'REJECTED', reason: 'INVALID_ROUTER_RESULT', command: null };
  }

  if (routerResult.command && typeof routerResult.command === 'object' && !Array.isArray(routerResult.command)) {
    return {
      status: routerResult.status || 'READY',
      command: routerResult.command,
      source: routerResult.source,
      confidence: routerResult.confidence,
      reason: routerResult.reason,
      execution: routerResult.execution,
      cloud_called: routerResult.cloud_called,
    };
  }

  if (typeof routerResult.intent === 'string' && routerResult.intent.trim()) {
    return {
      status: routerResult.status || 'READY',
      command: routerResult,
      source: routerResult.source,
      confidence: routerResult.confidence,
      reason: routerResult.reason,
      execution: routerResult.execution,
      cloud_called: routerResult.cloud_called,
    };
  }

  return {
    status: routerResult.status || 'REJECTED',
    reason: routerResult.reason || 'INVALID_COMMAND',
    command: null,
    source: routerResult.source,
  };
};

export const processPOSVoiceCommand = async ({ text, inventory = [], customerNames = [], ownerId, handlers = {} } = {}) => {
  const safeText = sanitizeText(text);
  if (!safeText) return { status: 'REJECTED', reason: 'EMPTY_COMMAND', command: null };

  const safeInventory = Array.isArray(inventory) ? inventory.filter(Boolean).slice(0, 2000) : [];
  const safeCustomerNames = Array.isArray(customerNames) ? customerNames.filter(Boolean).map(value => String(value).trim().slice(0, 100)).filter(Boolean).slice(0, 1000) : [];

  console.log('COUNTR PHASE4D INVENTORY:', {
    command: safeText,
    inventoryCount: safeInventory.length,
    inventory: safeInventory.slice(0, 20).map(item => ({
      id: item?.id ?? null,
      productName: item?.productName ?? item?.product_name ?? item?.name ?? null,
      quantity: item?.quantity ?? null,
      unit: item?.unit ?? null,
      sellingPrice: item?.sellingPrice ?? null,
    })),
  });

  let routerResult;
  try {
    routerResult = await parseVoiceCommand({ text: safeText, inventory: safeInventory, customerNames: safeCustomerNames });
  } catch (error) {
    console.error('COUNTR PHASE4D ROUTER ERROR:', error?.message || error);
    return { status: 'REJECTED', reason: error?.message || 'Voice router failed.', command: null };
  }

  const normalized = normalizeRouterResult(routerResult);
  if (!normalized.command) {
    return { status: 'REJECTED', reason: normalized.reason || 'Voice command could not be understood.', source: normalized.source, command: null };
  }

  const rawCommand = normalized.command;
  const quantityValue = rawCommand.quantity ?? rawCommand.qty ?? null;

  const normalizedCommand = {
    ...rawCommand,
    quantity: quantityValue !== null && quantityValue !== undefined ? Number(quantityValue) : null,
    qty: quantityValue !== null && quantityValue !== undefined ? Number(quantityValue) : null,
    unit: rawCommand.unit ? String(rawCommand.unit).trim().toUpperCase() : null,
    product: rawCommand.product ? String(rawCommand.product).trim() : null,
    customer_name: rawCommand.customer_name ? String(rawCommand.customer_name).trim() : null,
  };

  console.log('COUNTR PHASE4D COMMAND:', {
    intent: normalizedCommand.intent,
    product: normalizedCommand.product,
    quantity: normalizedCommand.quantity,
    qty: normalizedCommand.qty,
    unit: normalizedCommand.unit,
    price_hint: normalizedCommand.price_hint,
    resolved_inventory_id: normalizedCommand.resolved_inventory_id,
    inventory_item_id: normalizedCommand.inventory_item_id,
    confidence: normalizedCommand.confidence,
    source: normalizedCommand.source,
  });

  try {
    const execution = await executeVoiceTransaction({
      command: normalizedCommand,
      context: { ownerId, inventory: safeInventory },
      handlers: handlers && typeof handlers === 'object' ? handlers : {},
    });

    if (!execution || typeof execution !== 'object') {
      return { status: 'REJECTED', reason: 'Voice executor returned an invalid result.', command: normalizedCommand };
    }

    return { ...execution, command: execution.command || normalizedCommand };
  } catch (error) {
    console.error('COUNTR PHASE4D EXECUTION ERROR:', error?.message || error);
    return { status: 'REJECTED', reason: error?.message || 'Voice transaction could not be executed.', command: normalizedCommand };
  }
};

export default processPOSVoiceCommand;