import {
  bridgeGeminiCommand,
} from "../src/core/ai/GeminiCommandBridge";

const inventory = [
  {
    id: "parle-5",
    productName: "Parle G",
    sellingPrice: 5,
    unit: "PCS",
  },
  {
    id: "parle-10",
    productName: "Parle G",
    sellingPrice: 10,
    unit: "PCS",
  },
  {
    id: "parle-packet-10",
    productName: "Parle G",
    sellingPrice: 10,
    unit: "PACKET",
  },
  {
    id: "kurkure-10",
    productName: "Kurkure",
    sellingPrice: 10,
    unit: "PCS",
  },
  {
    id: "rice-50-5kg",
    productName: "Rice",
    sellingPrice: 50,
    unit: "KG",
  },
  {
    id: "basmati-100",
    productName: "Basmati Rice",
    sellingPrice: 100,
    unit: "KG",
  },
  {
    id: "sugar-kg",
    productName: "Sugar",
    sellingPrice: 60,
    unit: "KG",
  },
];

const customers = [
  "Rahul",
  "Devendra",
];

describe(
  "COUNTR Phase 3E-3 - Gemini Command Bridge",
  () => {
    test(
      "bridges 10 wala Kurkure to a READY command",
      () => {
        const result =
          bridgeGeminiCommand({
            geminiResult: {
              intent: "sale.create",
              product: "Kurkure",
              quantity: null,
              price_hint: 10,
              confidence: 1,
            },
            inventory,
            customerNames: customers,
          });

        expect(result.status).toBe("READY");
        expect(result.source).toBe(
          "GEMINI_VALIDATED"
        );

        expect(
          result.command.product
        ).toBe("Kurkure");

        expect(
          result.command.quantity
        ).toBe(1);

        expect(
          result.command.price_hint
        ).toBe(10);

        expect(
          result.command.resolved_inventory_id
        ).toBe("kurkure-10");
      }
    );

    test(
      "bridges Parle Ji to the real Parle G inventory item",
      () => {
        const result =
          bridgeGeminiCommand({
            geminiResult: {
              intent: "unknown",
              product: "Parle Ji",
              quantity: null,
              price_hint: 10,
              confidence: 1,
            },
            inventory,
            customerNames: customers,
          });

        expect(result.status).toBe("READY");

        expect(
          result.command.intent
        ).toBe("sale.create");

        expect(
          result.command.product
        ).toBe("Parle G");

        expect(
          result.command.quantity
        ).toBe(1);

        expect(
          result.command.price_hint
        ).toBe(10);

        expect(
          result.command.resolved_inventory_id
        ).toBe("parle-10");
      }
    );

    test(
      "bridges 50 wala chawal 5 kilo without confusing price and quantity",
      () => {
        const result =
          bridgeGeminiCommand({
            geminiResult: {
              intent: "sale.create",
              product: "Rice",
              quantity: 5,
              unit: "kilo",
              price_hint: 50,
              confidence: 1,
            },
            inventory,
            customerNames: customers,
          });

        expect(result.status).toBe("READY");

        expect(
          result.command.quantity
        ).toBe(5);

        expect(
          result.command.unit
        ).toBe("KG");

        expect(
          result.command.price_hint
        ).toBe(50);

        expect(
          result.command.resolved_inventory_id
        ).toBe("rice-50-5kg");
      }
    );

    test(
      "bridges Rahul khata + 2 kg sugar",
      () => {
        const result =
          bridgeGeminiCommand({
            geminiResult: {
              intent: "sale.create",
              product: "Sugar",
              quantity: 2,
              unit: "KG",
              customer_name: "Rahul",
              payment_type: "KHATA",
              confidence: 1,
            },
            inventory,
            customerNames: customers,
          });

        expect(result.status).toBe("READY");

        expect(
          result.command.customer_name
        ).toBe("Rahul");

        expect(
          result.command.payment_type
        ).toBe("KHATA");

        expect(
          result.command.quantity
        ).toBe(2);

        expect(
          result.command.unit
        ).toBe("KG");

        expect(
          result.command.resolved_inventory_id
        ).toBe("sugar-kg");
      }
    );

    test(
      "bridges Rahul + 2 packet 10 wala Parle Ji",
      () => {
        const result =
          bridgeGeminiCommand({
            geminiResult: {
              intent: "sale.create",
              product: "Parle Jee",
              quantity: 2,
              unit: "packet",
              price_hint: 10,
              customer_name: "Rahul",
              payment_type: "KHATA",
              confidence: 1,
            },
            inventory,
            customerNames: customers,
          });

        expect(result.status).toBe("READY");

        expect(
          result.command.product
        ).toBe("Parle G");

        expect(
          result.command.quantity
        ).toBe(2);

        expect(
          result.command.unit
        ).toBe("PACKET");

        expect(
          result.command.price_hint
        ).toBe(10);

        expect(
          result.command.customer_name
        ).toBe("Rahul");

        expect(
          result.command.payment_type
        ).toBe("KHATA");

        expect(
          result.command.resolved_inventory_id
        ).toBe("parle-packet-10");
      }
    );

    test(
      "money-only Rahul khata does not need inventory",
      () => {
        const result =
          bridgeGeminiCommand({
            geminiResult: {
              intent: "khata.credit",
              customer_name: "Rahul",
              amount: 500,
              payment_type: null,
              confidence: 1,
            },
            inventory: [],
            customerNames: customers,
          });

        expect(result.status).toBe("READY");

        expect(
          result.command.intent
        ).toBe("khata.credit");

        expect(
          result.command.customer_name
        ).toBe("Rahul");

        expect(
          result.command.amount
        ).toBe(500);

        expect(
          result.command.payment_type
        ).toBe("KHATA");

        expect(
          result.command.resolved_inventory_id
        ).toBeNull();
      }
    );

    test(
      "rejects a Gemini command for a product not in inventory",
      () => {
        const result =
          bridgeGeminiCommand({
            geminiResult: {
              intent: "sale.create",
              product: "Colgate",
              quantity: 1,
              confidence: 1,
            },
            inventory,
            customerNames: customers,
          });

        expect(result.status).toBe(
          "PRODUCT_NOT_FOUND"
        );

        expect(result.command).toBeNull();
      }
    );

    test(
      "rejects a wrong explicit price instead of substituting another variant",
      () => {
        const result =
          bridgeGeminiCommand({
            geminiResult: {
              intent: "sale.create",
              product: "Parle G",
              quantity: 1,
              price_hint: 15,
              confidence: 1,
            },
            inventory,
            customerNames: customers,
          });

        expect(result.status).toBe(
          "PRICE_VARIANT_NOT_FOUND"
        );

        expect(result.command).toBeNull();
      }
    );

    test(
      "rejects a missing unit variant",
      () => {
        const result =
          bridgeGeminiCommand({
            geminiResult: {
              intent: "sale.create",
              product: "Rice",
              quantity: 5,
              unit: "PACKET",
              price_hint: 50,
              confidence: 1,
            },
            inventory,
            customerNames: customers,
          });

        expect(result.status).toBe(
          "UNIT_VARIANT_NOT_FOUND"
        );

        expect(result.command).toBeNull();
      }
    );

    test(
      "supports a wrapped Gemini response",
      () => {
        const result =
          bridgeGeminiCommand({
            geminiResult: {
              source: "GEMINI_AI",
              command: {
                intent: "sale.create",
                product: "Kurkure",
                quantity: 1,
                price_hint: 10,
                confidence: 1,
              },
            },
            inventory,
            customerNames: customers,
          });

        expect(result.status).toBe("READY");

        expect(
          result.command.product
        ).toBe("Kurkure");

        expect(
          result.command.resolved_inventory_id
        ).toBe("kurkure-10");
      }
    );

    test(
      "preserves the raw Gemini command only for diagnostics",
      () => {
        const geminiResult = {
          intent: "sale.create",
          product: "Kurkure",
          quantity: 1,
          price_hint: 10,
          confidence: 0.91,
        };

        const result =
          bridgeGeminiCommand({
            geminiResult,
            inventory,
            customerNames: customers,
          });

        expect(result.status).toBe("READY");

        expect(
          result.command.gemini_raw
        ).toEqual(geminiResult);

        expect(
          result.command.resolved_inventory_id
        ).toBe("kurkure-10");
      }
    );

    test(
      "never mutates inventory",
      () => {
        const before =
          JSON.stringify(inventory);

        bridgeGeminiCommand({
          geminiResult: {
            intent: "sale.create",
            product: "Kurkure",
            quantity: 2,
            price_hint: 10,
            confidence: 1,
          },
          inventory,
          customerNames: customers,
        });

        expect(
          JSON.stringify(inventory)
        ).toBe(before);
      }
    );

    test(
      "invalid Gemini result is rejected safely",
      () => {
        const result =
          bridgeGeminiCommand({
            geminiResult: null,
            inventory,
            customerNames: customers,
          });

        expect(result.status).toBe(
          "INVALID_GEMINI_RESULT"
        );

        expect(result.command).toBeNull();
      }
    );

    test(
      "missing customer prevents Khata execution",
      () => {
        const result =
          bridgeGeminiCommand({
            geminiResult: {
              intent: "khata.credit",
              amount: 500,
              confidence: 1,
            },
            inventory: [],
            customerNames: customers,
          });

        expect(result.status).toBe(
          "CUSTOMER_REQUIRED"
        );

        expect(result.command).toBeNull();
      }
    );
  }
);
