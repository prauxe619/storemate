import {
  executeCommand,
  validateReadyCommand,
} from "../src/core/ai/CommandExecutor";

describe("COUNTR Phase 4A - Command Executor", () => {
  test("executes 10 wala Parle G sale", async () => {
    const handler = jest.fn(async c => ({
      inventoryId: c.resolved_inventory_id,
      quantity: c.quantity,
    }));

    const result = await executeCommand({
      command: {
        status: "READY",
        intent: "sale.create",
        product: "Parle G",
        quantity: 1,
        unit: "PACKET",
        price_hint: 10,
        resolved_inventory_id: "parle-10",
      },
      handlers: { saleCreate: handler },
    });

    expect(result.status).toBe("EXECUTED");
    expect(result.result.inventoryId).toBe("parle-10");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("executes Rahul ₹500 khata credit", async () => {
    const handler = jest.fn(async c => ({
      customer: c.customer_name,
      amount: c.amount,
    }));

    const result = await executeCommand({
      command: {
        status: "READY",
        intent: "khata.credit",
        customer_name: "Rahul",
        amount: 500,
        payment_type: "KHATA",
      },
      handlers: { khataCredit: handler },
    });

    expect(result.status).toBe("EXECUTED");
    expect(result.result).toEqual({ customer:"Rahul", amount:500 });
  });

  test("executes product-on-khata", async () => {
    const handler = jest.fn(async c => c);

    const result = await executeCommand({
      command: {
        status: "READY",
        intent: "khata.credit",
        customer_name: "Rahul",
        product: "Sugar",
        quantity: 2,
        unit: "KG",
        resolved_inventory_id: "sugar-kg",
      },
      handlers: { khataCredit: handler },
    });

    expect(result.status).toBe("EXECUTED");
    expect(result.result.quantity).toBe(2);
  });

  test("rejects sale without resolved inventory", async () => {
    const handler = jest.fn();

    const result = await executeCommand({
      command: {
        status: "READY",
        intent: "sale.create",
        product: "Parle G",
        quantity: 1,
      },
      handlers: { saleCreate: handler },
    });

    expect(result.status).toBe("INVENTORY_RESOLUTION_REQUIRED");
    expect(handler).not.toHaveBeenCalled();
  });

  test("rejects zero quantity", async () => {
    const handler = jest.fn();

    const result = await executeCommand({
      command: {
        status: "READY",
        intent: "sale.create",
        quantity: 0,
        resolved_inventory_id: "parle-10",
      },
      handlers: { saleCreate: handler },
    });

    expect(result.status).toBe("QUANTITY_REQUIRED");
    expect(handler).not.toHaveBeenCalled();
  });

  test("rejects Khata without customer", async () => {
    const handler = jest.fn();

    const result = await executeCommand({
      command: {
        status: "READY",
        intent: "khata.credit",
        amount: 500,
      },
      handlers: { khataCredit: handler },
    });

    expect(result.status).toBe("CUSTOMER_REQUIRED");
    expect(handler).not.toHaveBeenCalled();
  });

  test("rejects money-only Khata without amount", async () => {
    const handler = jest.fn();

    const result = await executeCommand({
      command: {
        status: "READY",
        intent: "khata.credit",
        customer_name: "Rahul",
      },
      handlers: { khataCredit: handler },
    });

    expect(result.status).toBe("AMOUNT_REQUIRED");
    expect(handler).not.toHaveBeenCalled();
  });

  test("rejects unknown intent", async () => {
    const result = await executeCommand({
      command: { status:"READY", intent:"unknown" },
      handlers: { unknown: jest.fn() },
    });

    expect(result.status).toBe("INTENT_NOT_EXECUTABLE");
    expect(result.executed).toBe(false);
  });

  test("rejected validator result never executes", async () => {
    const handler = jest.fn();

    const result = await executeCommand({
      command: {
        status: "PRODUCT_NOT_FOUND",
        intent: "sale.create",
        product: "Unknown",
        quantity: 1,
        resolved_inventory_id: null,
      },
      handlers: { saleCreate: handler },
    });

    expect(result.status).toBe("COMMAND_NOT_READY");
    expect(handler).not.toHaveBeenCalled();
  });

  test("executes inventory price update", async () => {
    const handler = jest.fn(async c => c.new_price);

    const result = await executeCommand({
      command: {
        status:"READY",
        intent:"inventory.update_price",
        product:"Parle G",
        resolved_inventory_id:"parle-10",
        new_price:12,
      },
      handlers:{ inventoryUpdatePrice:handler },
    });

    expect(result.status).toBe("EXECUTED");
    expect(result.result).toBe(12);
  });

  test("rejects invalid discount", async () => {
    const handler = jest.fn();

    const result = await executeCommand({
      command:{
        status:"READY",
        intent:"pos.apply_discount",
        discount_percent:150,
      },
      handlers:{ applyDiscount:handler },
    });

    expect(result.status).toBe("DISCOUNT_REQUIRED");
    expect(handler).not.toHaveBeenCalled();
  });

  test("executes khata query", async () => {
    const handler = jest.fn(async () => ({ balance:850 }));

    const result = await executeCommand({
      command:{
        status:"READY",
        intent:"query.khata",
        customer_name:"Rahul",
      },
      handlers:{ queryKhata:handler },
    });

    expect(result.status).toBe("EXECUTED");
    expect(result.result.balance).toBe(850);
  });

  test("contains handler errors", async () => {
    const result = await executeCommand({
      command:{
        status:"READY",
        intent:"khata.credit",
        customer_name:"Rahul",
        amount:500,
      },
      handlers:{
        khataCredit: async () => {
          throw new Error("database unavailable");
        },
      },
    });

    expect(result.status).toBe("EXECUTION_FAILED");
    expect(result.executed).toBe(false);
    expect(result.reason).toBe("database unavailable");
  });

  test("does not mutate command", async () => {
    const command = {
      status:"READY",
      intent:"sale.create",
      quantity:2,
      resolved_inventory_id:"parle-10",
    };

    const before = JSON.parse(JSON.stringify(command));

    await executeCommand({
      command,
      handlers:{
        saleCreate: async received => {
          received.quantity = 999;
        },
      },
    });

    expect(command).toEqual(before);
  });

  test("does not mutate inventory context", async () => {
    const inventory = [{ id:"parle-10", price:10 }];
    const before = JSON.parse(JSON.stringify(inventory));

    await executeCommand({
      command:{
        status:"READY",
        intent:"sale.create",
        quantity:1,
        resolved_inventory_id:"parle-10",
      },
      context:{ inventory },
      handlers:{
        saleCreate: async (_c, ctx) => {
          ctx.inventory[0].price = 9999;
        },
      },
    });

    expect(inventory).toEqual(before);
  });

  test("validateReadyCommand accepts valid product Khata", () => {
    const result = validateReadyCommand({
      status:"READY",
      intent:"khata.credit",
      customer_name:"Rahul",
      product:"Sugar",
      quantity:2,
      unit:"KG",
      resolved_inventory_id:"sugar-kg",
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("READY");
  });
});
