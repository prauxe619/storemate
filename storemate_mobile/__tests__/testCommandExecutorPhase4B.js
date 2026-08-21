import {
  executeCommand,
  validateReadyCommand,
} from "../src/core/ai/CommandExecutor";

describe("COUNTR Phase 4B - POS command routing", () => {
  test("routes POS add-item through injected handler", async () => {
    const addItem = jest.fn(async c => ({
      id: c.resolved_inventory_id,
      quantity: c.quantity,
    }));

    const result = await executeCommand({
      command: {
        status: "READY",
        intent: "pos.add_item",
        product: "Parle G",
        quantity: 2,
        resolved_inventory_id: "parle-10",
      },
      handlers: { addItem },
    });

    expect(result.status).toBe("EXECUTED");
    expect(result.result).toEqual({ id: "parle-10", quantity: 2 });
    expect(addItem).toHaveBeenCalledTimes(1);
  });

  test("routes POS checkout without silently choosing payment", async () => {
    const checkout = jest.fn(async c => c.payment_type || "READY_FOR_PAYMENT");

    const result = await executeCommand({
      command: {
        status: "READY",
        intent: "pos.checkout",
      },
      handlers: { checkout },
    });

    expect(result.status).toBe("EXECUTED");
    expect(result.result).toBe("READY_FOR_PAYMENT");
  });

  test("rejects invalid POS checkout payment type", async () => {
    const checkout = jest.fn();

    const result = await executeCommand({
      command: {
        status: "READY",
        intent: "pos.checkout",
        payment_type: "CARD",
      },
      handlers: { checkout },
    });

    expect(result.status).toBe("PAYMENT_TYPE_REQUIRED");
    expect(checkout).not.toHaveBeenCalled();
  });

  test("accepts zero percent discount", () => {
    const result = validateReadyCommand({
      status: "READY",
      intent: "pos.apply_discount",
      discount_percent: 0,
    });

    expect(result.ok).toBe(true);
  });
});
