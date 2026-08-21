/**
 * COUNTR Phase 3E-2
 * Gemini result validator / normalizer.
 */

const SALE_INTENTS = new Set(["sale.create"]);
const KHATA_INTENTS = new Set(["khata.credit", "khata.debit", "khata.payment"]);
const INVENTORY_INTENTS = new Set(["inventory.add", "inventory.update"]);
const ALLOWED_INTENTS = new Set(["sale.create", "khata.credit", "khata.debit", "khata.payment", "customer.create", "inventory.add", "inventory.update", "inventory.update_price", "query.inventory", "query.sales", "query.khata", "pos.apply_discount", "pos.checkout", "expense.create", "unknown"]);

const UNIT_ALIASES = { pc: "PCS", pcs: "PCS", piece: "PCS", pieces: "PCS", item: "PCS", items: "PCS", packet: "PACKET", packets: "PACKET", pkt: "PACKET", box: "BOX", boxes: "BOX", bottle: "BOTTLE", bottles: "BOTTLE", kg: "KG", kilo: "KG", kilos: "KG", kilogram: "KG", kilograms: "KG", g: "G", gm: "G", gram: "G", grams: "G", l: "L", litre: "L", liter: "L", liters: "L", litres: "L", ml: "ML", millilitre: "ML", milliliter: "ML" };
const PRODUCT_ALIASES = { "parle ji": "Parle G", "parle jee": "Parle G", "parle g": "Parle G", shakkar: "Sugar", chini: "Sugar", cheeni: "Sugar", chawal: "Rice", rice: "Rice", "basmati chawal": "Basmati Rice", "basmati rice": "Basmati Rice" };

const normalizeText = value => String(value ?? "").trim().toLowerCase().replace(/[₹,]/g, " ").replace(/\s+/g, " ");
const normalizeUnit = value => { if (!value) return null; const key = normalizeText(value); return UNIT_ALIASES[key] || String(value).trim().toUpperCase(); };
const normalizeProductName = value => { if (!value) return null; const original = String(value).trim(); const key = normalizeText(original); return PRODUCT_ALIASES[key] || original; };
const toNumberOrNull = value => { if (value === null || value === undefined || value === "") return null; const n = Number(value); return Number.isFinite(n) ? n : null; };

const getField = (object, ...names) => { for (const name of names) { if (object && Object.prototype.hasOwnProperty.call(object, name)) return object[name]; } return null; };
const readInventoryField = (item, ...names) => { if (!item) return null; for (const name of names) { if (Object.prototype.hasOwnProperty.call(item, name)) return item[name]; try { if (typeof item.get === "function") { const value = item.get(name); if (value !== undefined) return value; } } catch (_) {} } return null; };

const inventoryProduct = item => normalizeProductName(readInventoryField(item, "productName", "product_name", "name"));
const inventoryPrice = item => toNumberOrNull(readInventoryField(item, "sellingPrice", "selling_price", "price"));
const inventoryUnit = item => normalizeUnit(readInventoryField(item, "unit", "unitType", "stockUnit"));
const productNamesEqual = (a, b) => normalizeText(normalizeProductName(a)) === normalizeText(normalizeProductName(b));
const findProductCandidates = (inventory, product) => { if (!product) return []; return (Array.isArray(inventory) ? inventory : []).filter(item => productNamesEqual(inventoryProduct(item), product)); };

export const validateGeminiCommand = ({ command, inventory = [], customerNames = [] } = {}) => {
  const input = command && typeof command === "object" ? command : {};
  let intent = getField(input, "intent"); if (!ALLOWED_INTENTS.has(intent)) intent = "unknown";
  
  let product = normalizeProductName(getField(input, "product", "product_name", "productName"));
  let quantity = toNumberOrNull(getField(input, "quantity", "qty")), unit = normalizeUnit(getField(input, "unit", "unit_type", "unitType"));
  const priceHint = toNumberOrNull(getField(input, "price_hint", "priceHint")), newPrice = toNumberOrNull(getField(input, "new_price", "newPrice")), discountPercent = toNumberOrNull(getField(input, "discount_percent", "discountPercent"));
  
  let amount = toNumberOrNull(getField(input, "amount"));
  let customerName = getField(input, "customer_name", "customerName"); if (typeof customerName === "string") customerName = customerName.trim() || null;
  let paymentType = getField(input, "payment_type", "paymentType"); 

  const rawText = normalizeText(getField(input, "raw_text") || getField(input, "text") || "");
  const isReceivedPayment = /\b(se|ne)\b.*\b(aaye|aae|aaya|diye|diya|mila|received|paid)\b/i.test(rawText) || /\b(received|paid)\b/i.test(rawText);

  // If it's a khata money transaction without items, correctly route based on phrasing:
  if (intent === "khata.credit" || intent === "khata.debit" || intent === "sale.create") {
    if (amount !== null && customerName && !product) {
      if (isReceivedPayment) {
        intent = "khata.credit"; // Payment received (decreases due)
        paymentType = "CASH";
      } else {
        intent = "sale.create"; // Udhaar given (increases due)
        paymentType = "KHATA";
      }
    }
  }

  if (KHATA_INTENTS.has(intent) && !paymentType) paymentType = "KHATA"; 
  if (paymentType) paymentType = String(paymentType).trim().toUpperCase();
  const confidence = Math.max(0, Math.min(1, toNumberOrNull(getField(input, "confidence")) ?? 0));

  if (KHATA_INTENTS.has(intent)) {
    if (!customerName) return { status: "CUSTOMER_REQUIRED", reason: "Khata command requires customer_name.", command: null };
    if (amount === null && !product) return { status: "AMOUNT_REQUIRED", reason: "Money-only Khata command requires amount.", command: null };
  }

  const needsInventory = SALE_INTENTS.has(intent) || INVENTORY_INTENTS.has(intent) || intent === "inventory.update_price";
  if (needsInventory && !product) return { status: "PRODUCT_REQUIRED", reason: "Product command requires a product.", command: null };

  let resolvedItem = null;
  if (needsInventory && product) {
    const candidates = findProductCandidates(inventory, product);
    if (!candidates.length) return { status: "PRODUCT_NOT_FOUND", reason: `No inventory product matches "${product}".`, command: null };
    let unitMatches = candidates;
    if (unit) { unitMatches = candidates.filter(item => inventoryUnit(item) === unit); if (!unitMatches.length) return { status: "UNIT_VARIANT_NOT_FOUND", reason: `No "${product}" inventory variant uses unit "${unit}".`, command: null }; }
    resolvedItem = unitMatches[0];
    if (priceHint !== null) {
      const priceMatches = unitMatches.filter(item => inventoryPrice(item) === priceHint);
      if (!priceMatches.length) return { status: "PRICE_VARIANT_NOT_FOUND", reason: `No "${product}" inventory variant matches price ${priceHint}.`, command: null };
      resolvedItem = priceMatches[0];
    }
  }

  if (customerName && Array.isArray(customerNames)) { const exactCustomer = customerNames.find(name => normalizeText(name) === normalizeText(customerName)); if (exactCustomer) customerName = exactCustomer; }

  return { status: "READY", reason: null, command: { ...input, intent, product, quantity, unit, price_hint: priceHint, amount, new_price: newPrice, discount_percent: discountPercent, customer_name: customerName, payment_type: paymentType, confidence, resolved_inventory_id: resolvedItem ? readInventoryField(resolvedItem, "id") : null, resolved_inventory_item: resolvedItem || null, source: "GEMINI_VALIDATED" } };
};

export default validateGeminiCommand;