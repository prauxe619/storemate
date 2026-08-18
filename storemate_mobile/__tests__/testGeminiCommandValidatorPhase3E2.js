import {
  validateGeminiCommand,
} from "../src/core/ai/GeminiCommandValidator";

const inventory = [
  { id: "parle-5", productName: "Parle G", sellingPrice: 5, unit: "PCS" },
  { id: "parle-10", productName: "Parle G", sellingPrice: 10, unit: "PCS" },
  { id: "kurkure-10", productName: "Kurkure", sellingPrice: 10, unit: "PCS" },
  { id: "rice-50-5kg", productName: "Rice", sellingPrice: 50, unit: "KG" },
  { id: "basmati-100", productName: "Basmati Rice", sellingPrice: 100, unit: "KG" },
  { id: "sugar-kg", productName: "Sugar", sellingPrice: 60, unit: "KG" },
  { id: "parle-packet-10", productName: "Parle G", sellingPrice: 10, unit: "PACKET" },
];

const customers = ["Rahul", "Devendra"];

describe("COUNTR Phase 3E-2 - Gemini Command Validator", () => {
  test("10 wala Kurkure defaults quantity to 1", () => {
    const r = validateGeminiCommand({
      command: { intent: "sale.create", product: "Kurkure", price_hint: 10, confidence: 1 },
      inventory,
      customerNames: customers,
    });
    expect(r.status).toBe("READY");
    expect(r.command.quantity).toBe(1);
    expect(r.command.price_hint).toBe(10);
    expect(r.command.resolved_inventory_id).toBe("kurkure-10");
  });

  test("10 wala Parle Ji normalizes to Parle G", () => {
    const r = validateGeminiCommand({
      command: { intent: "unknown", product: "Parle Ji", price_hint: 10, confidence: 1 },
      inventory,
      customerNames: customers,
    });
    expect(r.status).toBe("READY");
    expect(r.command.product).toBe("Parle G");
    expect(r.command.quantity).toBe(1);
    expect(r.command.price_hint).toBe(10);
  });

  test("100 wale basmati chawal preserves Basmati Rice", () => {
    const r = validateGeminiCommand({
      command: { intent: "sale.create", product: "Basmati Rice", price_hint: 100, confidence: 0.9 },
      inventory,
      customerNames: customers,
    });
    expect(r.status).toBe("READY");
    expect(r.command.product).toBe("Basmati Rice");
    expect(r.command.quantity).toBe(1);
    expect(r.command.resolved_inventory_id).toBe("basmati-100");
  });

  test("50 wala chawal 5 kilo keeps price and quantity separate", () => {
    const r = validateGeminiCommand({
      command: { intent: "sale.create", product: "Rice", quantity: 5, unit: "kilo", price_hint: 50, confidence: 1 },
      inventory,
      customerNames: customers,
    });
    expect(r.status).toBe("READY");
    expect(r.command.quantity).toBe(5);
    expect(r.command.unit).toBe("KG");
    expect(r.command.price_hint).toBe(50);
    expect(r.command.resolved_inventory_id).toBe("rice-50-5kg");
  });

  test("Rahul khata + 2 kg sugar is ready", () => {
    const r = validateGeminiCommand({
      command: { intent: "sale.create", product: "Sugar", quantity: 2, unit: "KG", customer_name: "Rahul", payment_type: "KHATA", confidence: 1 },
      inventory,
      customerNames: customers,
    });
    expect(r.status).toBe("READY");
    expect(r.command.customer_name).toBe("Rahul");
    expect(r.command.payment_type).toBe("KHATA");
  });

  test("Rahul khata + 2 packet 10 wala Parle Ji resolves packet variant", () => {
    const r = validateGeminiCommand({
      command: { intent: "sale.create", product: "Parle Jee", quantity: 2, unit: "packet", price_hint: 10, customer_name: "Rahul", payment_type: "KHATA", confidence: 1 },
      inventory,
      customerNames: customers,
    });
    expect(r.status).toBe("READY");
    expect(r.command.product).toBe("Parle G");
    expect(r.command.quantity).toBe(2);
    expect(r.command.unit).toBe("PACKET");
    expect(r.command.resolved_inventory_id).toBe("parle-packet-10");
  });

  test("money-only Rahul khata does not require inventory", () => {
    const r = validateGeminiCommand({
      command: { intent: "khata.credit", customer_name: "Rahul", amount: 500, confidence: 1 },
      inventory: [],
      customerNames: customers,
    });
    expect(r.status).toBe("READY");
    expect(r.command.amount).toBe(500);
    expect(r.command.payment_type).toBe("KHATA");
    expect(r.command.resolved_inventory_id).toBeNull();
  });

  test("missing product is rejected", () => {
    const r = validateGeminiCommand({
      command: { intent: "sale.create", quantity: 2, confidence: 1 },
      inventory,
      customerNames: customers,
    });
    expect(r.status).toBe("PRODUCT_REQUIRED");
  });

  test("unknown product is rejected", () => {
    const r = validateGeminiCommand({
      command: { intent: "sale.create", product: "Colgate", quantity: 1, confidence: 1 },
      inventory,
      customerNames: customers,
    });
    expect(r.status).toBe("PRODUCT_NOT_FOUND");
  });

  test("wrong explicit price is never silently substituted", () => {
    const r = validateGeminiCommand({
      command: { intent: "sale.create", product: "Parle G", quantity: 1, price_hint: 15, confidence: 1 },
      inventory,
      customerNames: customers,
    });
    expect(r.status).toBe("PRICE_VARIANT_NOT_FOUND");
  });

  test("missing unit variant is never silently substituted", () => {
    const r = validateGeminiCommand({
      command: { intent: "sale.create", product: "Rice", quantity: 5, unit: "PACKET", price_hint: 50, confidence: 1 },
      inventory,
      customerNames: customers,
    });
    expect(r.status).toBe("UNIT_VARIANT_NOT_FOUND");
  });

  test("price is never treated as quantity", () => {
    const r = validateGeminiCommand({
      command: { intent: "sale.create", product: "Kurkure", price_hint: 10, confidence: 1 },
      inventory,
      customerNames: customers,
    });
    expect(r.status).toBe("READY");
    expect(r.command.quantity).toBe(1);
    expect(r.command.price_hint).toBe(10);
  });

  test("khata without customer is rejected", () => {
    const r = validateGeminiCommand({
      command: { intent: "khata.credit", amount: 500, confidence: 1 },
      inventory: [],
      customerNames: customers,
    });
    expect(r.status).toBe("CUSTOMER_REQUIRED");
  });

  test("khata without amount/product is rejected", () => {
    const r = validateGeminiCommand({
      command: { intent: "khata.credit", customer_name: "Rahul", confidence: 1 },
      inventory: [],
      customerNames: customers,
    });
    expect(r.status).toBe("AMOUNT_REQUIRED");
  });

  test("invalid intent becomes unknown", () => {
    const r = validateGeminiCommand({
      command: { intent: "delete_everything", product: "Kurkure", confidence: 1 },
      inventory,
      customerNames: customers,
    });
    expect(r.status).toBe("READY");
    expect(r.command.intent).toBe("unknown");
  });

  test("supports snake_case inventory", () => {
    const r = validateGeminiCommand({
      command: { intent: "sale.create", product: "Parle G", price_hint: 10 },
      inventory: [{ id: "snake", product_name: "Parle G", selling_price: 10, unit: "PCS" }],
      customerNames: customers,
    });
    expect(r.status).toBe("READY");
    expect(r.command.resolved_inventory_id).toBe("snake");
  });

  test("normalizes known customer spelling/whitespace", () => {
    const r = validateGeminiCommand({
      command: { intent: "khata.credit", customer_name: " Rahul ", amount: 500 },
      inventory: [],
      customerNames: customers,
    });
    expect(r.status).toBe("READY");
    expect(r.command.customer_name).toBe("Rahul");
    expect(r.command.payment_type).toBe("KHATA");
  });
});
