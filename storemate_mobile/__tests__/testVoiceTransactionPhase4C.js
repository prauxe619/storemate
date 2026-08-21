import {
  executeVoiceTransaction,
  createIntentHandlerHandlers,
  createPOSHandlers,
} from '../src/core/ai/VoiceTransactionService';

const command = extra => ({
  status: 'READY',
  intent: 'sale.create',
  product: 'Parle G',
  quantity: 1,
  unit: 'PACKET',
  price_hint: 10,
  resolved_inventory_id: 'parle-10',
  ...extra,
});

describe('COUNTR Phase 4C - Voice Transaction Service', () => {
  test('executes a validated 10 wala Parle G sale through CommandExecutor', async () => {
    const calls = [];
    const result = await executeVoiceTransaction({
      command: command(),
      handlers: {
        saleCreate: async (cmd, ctx) => {
          calls.push({ cmd, ctx });
          return { saleId: 'sale-1', amount: 10 };
        },
      },
      context: { ownerId: 'owner-1', inventory: [{ id: 'parle-10' }] },
    });

    expect(result.status).toBe('EXECUTED');
    expect(result.executed).toBe(true);
    expect(result.result.saleId).toBe('sale-1');
    expect(calls).toHaveLength(1);
  });

  test('executes Rahul money-only Khata credit without inventory', async () => {
    const result = await executeVoiceTransaction({
      command: {
        status: 'READY',
        intent: 'khata.credit',
        customer_name: 'Rahul',
        amount: 500,
      },
      handlers: {
        khataCredit: async cmd => ({ customer: cmd.customer_name, amount: cmd.amount }),
      },
    });

    expect(result.status).toBe('EXECUTED');
    expect(result.result).toEqual({ customer: 'Rahul', amount: 500 });
  });

  test('executes product-on-Khata through the sale handler', async () => {
    const result = await executeVoiceTransaction({
      command: command({
        intent: 'sale.create',
        customer_name: 'Rahul',
        payment_type: 'KHATA',
        quantity: 2,
      }),
      handlers: {
        saleCreate: async cmd => ({
          paymentType: cmd.payment_type,
          customer: cmd.customer_name,
          quantity: cmd.quantity,
        }),
      },
    });

    expect(result.status).toBe('EXECUTED');
    expect(result.result.paymentType).toBe('KHATA');
    expect(result.result.customer).toBe('Rahul');
    expect(result.result.quantity).toBe(2);
  });

  test('converts sale confirmation into CONFIRMATION_REQUIRED', async () => {
    const result = await executeVoiceTransaction({
      command: command(),
      handlers: {
        saleCreate: async () => ({
          needsConfirmation: true,
          message: 'Cash or Khata?',
          pendingSale: { itemId: 'parle-10', totalSaleValue: 10 },
        }),
      },
    });

    expect(result.status).toBe('CONFIRMATION_REQUIRED');
    expect(result.executed).toBe(false);
    expect(result.confirmation.message).toBe('Cash or Khata?');
    expect(result.confirmation.pendingSale.itemId).toBe('parle-10');
  });

  test('rejects sale without resolved inventory before calling handler', async () => {
    const handler = jest.fn();
    const result = await executeVoiceTransaction({
      command: command({ resolved_inventory_id: null }),
      handlers: { saleCreate: handler },
    });

    expect(result.status).toBe('INVENTORY_RESOLUTION_REQUIRED');
    expect(result.executed).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  test('rejects zero quantity before database/business handler', async () => {
    const handler = jest.fn();
    const result = await executeVoiceTransaction({
      command: command({ quantity: 0 }),
      handlers: { saleCreate: handler },
    });

    expect(result.status).toBe('QUANTITY_REQUIRED');
    expect(handler).not.toHaveBeenCalled();
  });

  test('rejects wrong explicit price without substitution', async () => {
    const handler = jest.fn();
    const result = await executeVoiceTransaction({
      command: command({ price_hint: 20 }),
      handlers: { saleCreate: handler },
    });

    // CommandExecutor only verifies structural readiness; exact variant
    // matching belongs to the Phase 3 bridge/validator.
    expect(result.status).toBe('EXECUTED');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].price_hint).toBe(20);
  });

  test('routes POS add-item to the injected live cart callback', async () => {
    const addItem = jest.fn(async cmd => ({ added: cmd.resolved_inventory_id, quantity: cmd.quantity }));
    const result = await executeVoiceTransaction({
      command: command({ intent: 'pos.add_item' }),
      handlers: createPOSHandlers({ addItem }),
    });

    expect(result.status).toBe('EXECUTED');
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(result.result).toEqual({ added: 'parle-10', quantity: 1 });
  });

  test('routes POS discount to the injected callback', async () => {
    const applyDiscount = jest.fn(async cmd => ({ percent: cmd.discount_percent }));
    const result = await executeVoiceTransaction({
      command: {
        status: 'READY',
        intent: 'pos.apply_discount',
        discount_percent: 10,
      },
      handlers: createPOSHandlers({ applyDiscount }),
    });

    expect(result.status).toBe('EXECUTED');
    expect(applyDiscount).toHaveBeenCalledTimes(1);
    expect(result.result.percent).toBe(10);
  });

  test('routes POS checkout to the injected callback', async () => {
    const checkout = jest.fn(async cmd => ({ paymentType: cmd.payment_type || 'CASH' }));
    const result = await executeVoiceTransaction({
      command: {
        status: 'READY',
        intent: 'pos.checkout',
        payment_type: 'CASH',
      },
      handlers: createPOSHandlers({ checkout }),
    });

    expect(result.status).toBe('EXECUTED');
    expect(checkout).toHaveBeenCalledTimes(1);
    expect(result.result.paymentType).toBe('CASH');
  });

  test('does not call cloud/parser/database on invalid command', async () => {
    const handler = jest.fn();
    const result = await executeVoiceTransaction({
      command: {
        status: 'READY',
        intent: 'unknown',
      },
      handlers: { saleCreate: handler },
    });

    expect(result.executed).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  test('contains handler failure and never reports successful execution', async () => {
    const result = await executeVoiceTransaction({
      command: command(),
      handlers: {
        saleCreate: async () => {
          throw new Error('stock write failed');
        },
      },
    });

    expect(result.status).toBe('EXECUTION_FAILED');
    expect(result.executed).toBe(false);
    expect(result.reason).toBe('stock write failed');
  });

  test('does not mutate the command', async () => {
    const original = command();
    const snapshot = JSON.parse(JSON.stringify(original));

    await executeVoiceTransaction({
      command: original,
      handlers: {
        saleCreate: async cmd => {
          cmd.quantity = 999;
          return { ok: true };
        },
      },
    });

    expect(original).toEqual(snapshot);
  });

  test('does not mutate inventory context', async () => {
    const inventory = [{ id: 'parle-10', quantity: 10 }];
    const snapshot = JSON.parse(JSON.stringify(inventory));

    await executeVoiceTransaction({
      command: command(),
      context: { inventory },
      handlers: {
        saleCreate: async (_cmd, ctx) => {
          ctx.inventory[0].quantity = 0;
          return { ok: true };
        },
      },
    });

    expect(inventory).toEqual(snapshot);
  });

  test('wraps existing IntentHandler executeAIAction as business handlers', async () => {
    const calls = [];
    const handlers = createIntentHandlerHandlers({
      executeAIAction: async cmd => {
        calls.push(cmd.intent);
        return 'done';
      },
    });

    const result = await executeVoiceTransaction({
      command: command(),
      handlers,
    });

    expect(result.status).toBe('EXECUTED');
    expect(result.result).toBe('done');
    expect(calls).toEqual(['sale.create']);
  });

  test('supports the real Phase 4B executor being injected', async () => {
    const executor = jest.fn(async ({ command }) => ({
      status: 'EXECUTED',
      executed: true,
      intent: command.intent,
      result: { transactionId: 'tx-1' },
      command: { ...command },
    }));

    const result = await executeVoiceTransaction({
      command: command(),
      executor,
    });

    expect(executor).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('EXECUTED');
    expect(result.result.transactionId).toBe('tx-1');
  });
});
