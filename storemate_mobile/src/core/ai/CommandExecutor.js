/**
 * COUNTR Phase 4A - Command Executor
 *
 * Executes only validated/READY commands through injected app handlers.
 * No AI, parsing, or database API assumptions are made here.
 */

const EXECUTABLE_INTENTS = new Set([
  "sale.create",
  "khata.credit",
  "khata.debit",
  "khata.payment",
  "inventory.add",
  "inventory.update",
  "inventory.update_price",
  "pos.apply_discount",
  "query.inventory",
  "query.khata",
]);

const KHATA_INTENTS = new Set([
  "khata.credit",
  "khata.debit",
  "khata.payment",
]);

const HANDLER_NAMES = {
  "sale.create": "saleCreate",
  "khata.credit": "khataCredit",
  "khata.debit": "khataDebit",
  "khata.payment": "khataPayment",
  "inventory.add": "inventoryAdd",
  "inventory.update": "inventoryUpdate",
  "inventory.update_price": "inventoryUpdatePrice",
  "pos.apply_discount": "applyDiscount",
  "query.inventory": "queryInventory",
  "query.khata": "queryKhata",
};

const hasValue = v => v !== null && v !== undefined && v !== "";
const finite = v => typeof v === "number" && Number.isFinite(v);
const intentOf = v => typeof v === "string" ? v.trim().toLowerCase() : "";

const validateReadyCommand = command => {
  if (!command || typeof command !== "object")
    return { ok:false, status:"COMMAND_REQUIRED", reason:"A command is required." };

  const intent = intentOf(command.intent);

  if (!EXECUTABLE_INTENTS.has(intent))
    return { ok:false, status:"INTENT_NOT_EXECUTABLE", reason:`Intent "${command.intent}" cannot be executed.` };

  if (hasValue(command.status) && command.status !== "READY")
    return { ok:false, status:"COMMAND_NOT_READY", reason:`Command status is "${command.status}".` };

  if (intent === "sale.create") {
    if (!hasValue(command.resolved_inventory_id))
      return { ok:false, status:"INVENTORY_RESOLUTION_REQUIRED", reason:"Sale requires resolved inventory." };
    if (!finite(command.quantity) || command.quantity <= 0)
      return { ok:false, status:"QUANTITY_REQUIRED", reason:"Sale requires a positive quantity." };
  }

  if (KHATA_INTENTS.has(intent)) {
    if (!hasValue(command.customer_name))
      return { ok:false, status:"CUSTOMER_REQUIRED", reason:"Khata requires a customer." };

    if (!hasValue(command.product) && !finite(command.amount))
      return { ok:false, status:"AMOUNT_REQUIRED", reason:"Money-only Khata requires amount." };
  }

  if (intent === "inventory.add" &&
      !hasValue(command.product) &&
      !hasValue(command.resolved_inventory_id))
    return { ok:false, status:"PRODUCT_REQUIRED", reason:"Inventory add requires a product." };

  if (intent === "inventory.update" || intent === "inventory.update_price") {
    if (!hasValue(command.product) && !hasValue(command.resolved_inventory_id))
      return { ok:false, status:"PRODUCT_REQUIRED", reason:"Inventory update requires a product." };

    if (intent === "inventory.update_price" &&
        (!finite(command.new_price) || command.new_price < 0))
      return { ok:false, status:"NEW_PRICE_REQUIRED", reason:"A valid new price is required." };
  }

  if (intent === "pos.apply_discount" &&
      (!finite(command.discount_percent) ||
       command.discount_percent < 0 ||
       command.discount_percent > 100))
    return { ok:false, status:"DISCOUNT_REQUIRED", reason:"Discount must be 0-100." };

  if (intent === "query.inventory" &&
      !hasValue(command.product) &&
      !hasValue(command.resolved_inventory_id))
    return { ok:false, status:"PRODUCT_REQUIRED", reason:"Inventory query requires a product." };

  if (intent === "query.khata" && !hasValue(command.customer_name))
    return { ok:false, status:"CUSTOMER_REQUIRED", reason:"Khata query requires a customer." };

  return { ok:true, status:"READY", intent };
};

export const executeCommand = async ({
  command,
  handlers = {},
  context = {},
} = {}) => {
  const validation = validateReadyCommand(command);

  if (!validation.ok) {
    return {
      status: validation.status,
      executed: false,
      reason: validation.reason,
      command: null,
    };
  }

  const handlerName = HANDLER_NAMES[validation.intent];
  const handler = handlers[handlerName] || handlers[validation.intent];

  if (typeof handler !== "function") {
    return {
      status: "HANDLER_NOT_CONFIGURED",
      executed: false,
      reason: `No handler configured for "${validation.intent}".`,
      intent: validation.intent,
      command: { ...command },
    };
  }

  const safeCommand = { ...command };
  const safeContext = {
    ...context,
    inventory: Array.isArray(context.inventory)
      ? context.inventory.map(item =>
          item && typeof item === "object" ? { ...item } : item
        )
      : context.inventory,
  };

  try {
    const result = await handler(safeCommand, safeContext);

    return {
      status: "EXECUTED",
      executed: true,
      intent: validation.intent,
      result,
      command: safeCommand,
    };
  } catch (error) {
    return {
      status: "EXECUTION_FAILED",
      executed: false,
      intent: validation.intent,
      reason: error?.message || "Command execution failed.",
      error,
      command: safeCommand,
    };
  }
};

export { EXECUTABLE_INTENTS, HANDLER_NAMES, validateReadyCommand };
export default executeCommand;
