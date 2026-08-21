/**
 * Countr AI Intent Contract
 *
 * IMPORTANT:
 * Gemini is allowed to UNDERSTAND a command. Gemini is NOT allowed to execute anything.
 * The mobile app/backend validates this contract before any database action is performed.
 */

export const COUNTR_INTENTS = Object.freeze([
  "sale.create", "pos.add_item", "pos.apply_discount", "pos.checkout",
  "khata.credit", "khata.payment", "customer.create", "customer.search",
  "inventory.add", "inventory.reduce", "inventory.check", "inventory.update_price",
  "query.sales", "query.khata", "query.inventory",
  "ui.open_billing", "ui.show_low_stock", "ui.show_sales", "unknown"
]);

export const COUNTR_INTENT_SET = new Set(COUNTR_INTENTS);

export function isValidCountrIntent(intent) {
  return typeof intent === "string" && COUNTR_INTENT_SET.has(intent);
}

export function sanitizeCountrIntent(data) {
  if (!data || typeof data !== "object") return { intent: "unknown", confidence: 0 };

  const intent = isValidCountrIntent(data.intent) ? data.intent : "unknown";
  const confidence = typeof data.confidence === "number" && Number.isFinite(data.confidence) ? Math.max(0, Math.min(1, data.confidence)) : 0;

  return {
    intent,
    product: typeof data.product === "string" ? data.product.trim() : null,
    product_id: data.product_id != null ? String(data.product_id) : null,
    customer_name: typeof data.customer_name === "string" ? data.customer_name.trim() : null,
    customer_id: data.customer_id != null ? String(data.customer_id) : null,
    qty: typeof data.qty === "number" && Number.isFinite(data.qty) ? data.qty : null,
    amount: typeof data.amount === "number" && Number.isFinite(data.amount) ? data.amount : null,
    new_price: typeof data.new_price === "number" && Number.isFinite(data.new_price) ? data.new_price : null,
    discount_percent: typeof data.discount_percent === "number" && Number.isFinite(data.discount_percent) ? data.discount_percent : null,
    unit: typeof data.unit === "string" ? data.unit.trim() : null,
    payment_type: typeof data.payment_type === "string" ? data.payment_type.trim() : null,
    confidence,
    needs_confirmation: data.needs_confirmation === true,
    raw_text: typeof data.raw_text === "string" ? data.raw_text : null,
  };
}