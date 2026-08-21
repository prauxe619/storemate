jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    })),
    addEventListener: jest.fn(() => jest.fn()),
  },
}));

import { resolveInventoryVariant } from '../src/core/ai/InventoryVariantResolver';
import { processLocalVoiceCommand } from '../src/core/ai/LocalCommandPipeline';
import { parseVoiceCommand } from '../src/core/ai/VoiceCommandRouter';
import validateGeminiCommand from '../src/core/ai/GeminiCommandValidator';
import bridgeGeminiCommand from '../src/core/ai/GeminiCommandBridge';
import executeCommand from '../src/core/ai/CommandExecutor';
import { executeVoiceTransaction } from '../src/core/ai/VoiceTransactionService';

const inventory = [
  {
    id: 'parle-10',
    productName: 'Parle G',
    sellingPrice: 10,
    unit: 'PACKET',
    quantity: 100,
  },
  {
    id: 'parle-20',
    productName: 'Parle G',
    sellingPrice: 20,
    unit: 'PACKET',
    quantity: 80,
  },
  {
    id: 'kurkure-10',
    productName: 'Kurkure',
    sellingPrice: 10,
    unit: 'PACKET',
    quantity: 100,
  },
  {
    id: 'tiger-5',
    productName: 'Tiger Biscuit',
    sellingPrice: 5,
    unit: 'PACKET',
    quantity: 100,
  },
  {
    id: 'rice-50',
    productName: 'Rice',
    sellingPrice: 50,
    unit: 'KG',
    quantity: 100,
  },
  {
    id: 'basmati-100',
    productName: 'Basmati Rice',
    sellingPrice: 100,
    unit: 'KG',
    quantity: 50,
  },
  {
    id: 'sugar-60',
    productName: 'Sugar',
    sellingPrice: 60,
    unit: 'KG',
    quantity: 50,
  },
];

const customerNames = ['Rahul', 'Devendra', 'Amit', 'Priya'];

const createHandlers = () => ({
  saleCreate: jest.fn(async command => ({
    status: 'EXECUTED',
    result: {
      ok: true,
      command,
    },
  })),
  khataCredit: jest.fn(async command => ({
    status: 'EXECUTED',
    result: {
      ok: true,
      command,
    },
  })),
  khataDebit: jest.fn(async command => ({
    status: 'EXECUTED',
    result: {
      ok: true,
      command,
    },
  })),
  khataPayment: jest.fn(async command => ({
    status: 'EXECUTED',
    result: {
      ok: true,
      command,
    },
  })),
  inventoryAdd: jest.fn(),
  inventoryUpdate: jest.fn(),
  inventoryUpdatePrice: jest.fn(),
  queryInventory: jest.fn(),
  queryKhata: jest.fn(),
});

const containsAny = (text, values) =>
  values.some(value =>
    text.toLowerCase().includes(value.toLowerCase())
  );

const commandNeedsInventory = command =>
  command &&
  [
    'sale.create',
    'inventory.add',
    'inventory.update',
    'inventory.update_price',
  ].includes(command.intent);

const runLocalPipeline = text =>
  processLocalVoiceCommand({
    text,
    inventory,
    customerNames,
  });

const runValidator = command =>
  validateGeminiCommand({
    command,
    inventory,
    customerNames,
  });

const runBridge = command =>
  bridgeGeminiCommand({
    geminiResult: command,
    inventory,
    customerNames,
  });

const clone = value =>
  JSON.parse(JSON.stringify(value));

describe('COUNTR Phase 4F - Real World Voice Command Stress Test', () => {
  let handlers;

  beforeEach(() => {
    handlers = createHandlers();
    jest.clearAllMocks();
  });

  test('inventory resolver handles real-world inventory language', () => {
    const cases = [
      {
        product: 'Parle Ji',
        priceHint: 10,
        unit: 'PACKET',
        id: 'parle-10',
      },
      {
        product: 'Parle G',
        priceHint: 10,
        unit: 'PACKET',
        id: 'parle-10',
      },
      {
        product: 'Kurkure',
        priceHint: 10,
        unit: 'PACKET',
        id: 'kurkure-10',
      },
      {
        product: 'Tiger biscuit',
        priceHint: 5,
        unit: 'PACKET',
        id: 'tiger-5',
      },
      {
        product: 'chawal',
        priceHint: 50,
        unit: 'KG',
        id: 'rice-50',
      },
      {
        product: 'basmati chawal',
        priceHint: 100,
        unit: 'KG',
        id: 'basmati-100',
      },
      {
        product: 'sugar',
        priceHint: 60,
        unit: 'KG',
        id: 'sugar-60',
      },
    ];

    cases.forEach(testCase => {
      const result = resolveInventoryVariant({
        inventory,
        product: testCase.product,
        priceHint: testCase.priceHint,
        unit: testCase.unit,
      });

      expect(result).toBeDefined();
      expect(result.status).toBe('FOUND');
      expect(result.id).toBe(testCase.id);
    });
  });

  test.each([
    '10 wala Parle Ji',
    '10 रुपये वाला पार्ले जी',
    'Parle Ji ka 10 wala packet',
    'ek packet 10 wala Parle Ji',
    '1 packet Parle G 10 wala',
    'do packet 10 wala Parle Ji',
    '2 packet Parle Ji',
    'Kurkure ka 10 wala packet',
    '5 wala Tiger biscuit',
    '50 wala chawal 5 kilo',
    '5 kilo 50 wala chawal',
    '100 wale basmati chawal',
    'basmati chawal 100 wala',
    '2 kilo sugar',
    'do kilo chini',
    '3 kilo cheeni',
  ])('local pipeline safely handles product command: %s', text => {
    const before = clone(inventory);
    const result = runLocalPipeline(text);

    expect(result).toBeDefined();
    expect(result.status).not.toBe('EXECUTED');

    if (result.status === 'READY') {
      expect(result.command).toBeDefined();
      expect(result.command.intent).toBeDefined();

      if (commandNeedsInventory(result.command)) {
        expect(result.command.product).toBeTruthy();

        if (result.command.intent === 'sale.create') {
          expect(result.command.resolved_inventory_id).toBeTruthy();
        }
      }
    }

    expect(inventory).toEqual(before);
  });

  test.each([
    {
      text: 'Rahul ke khate mein 500 rupaye daalo',
      intent: 'khata.credit',
      customer: 'Rahul',
      amount: 500,
    },
    {
      text: 'Rahul ke khate mein paanch sau rupaye daalo',
      intent: 'khata.credit',
      customer: 'Rahul',
      amount: 500,
    },
    {
      text: 'Rahul ko 500 rupaye udhaar likho',
      intent: 'khata.credit',
      customer: 'Rahul',
      amount: 500,
    },
    {
      text: 'Rahul ki bahi mein 500 chadha do',
      intent: 'khata.credit',
      customer: 'Rahul',
      amount: 500,
    },
    {
      text: 'Devendra ke khate mein dedh sau rupaye daalo',
      intent: 'khata.credit',
      customer: 'Devendra',
      amount: 150,
    },
    {
      text: 'Devendra ko 150 udhaar',
      intent: 'khata.credit',
      customer: 'Devendra',
      amount: 150,
    },
  ])(
    'local pipeline handles money-only Khata: $text',
    ({ text, intent, customer, amount }) => {
      const before = clone(inventory);
      const result = runLocalPipeline(text);

      expect(result).toBeDefined();

      if (result.status === 'READY') {
        expect(result.command.intent).toBe(intent);
        expect(result.command.customer_name).toBe(customer);
        expect(result.command.amount).toBe(amount);
        expect(result.command.resolved_inventory_id).toBeNull();
      } else {
        throw new Error(
          `Expected READY for "${text}" but received ${JSON.stringify(result)}`
        );
      }

      expect(inventory).toEqual(before);
    }
  );

  test.each([
    'Rahul ke khate mein 2 kilo sugar daalo',
    'Rahul ke khate mein 2 packet 10 wala Parle Ji',
    'Rahul ke khate mein 5 kilo chawal',
    'Devendra ke khate mein 2 packet Kurkure',
    'Rahul ko 1 packet Parle Ji udhaar',
  ])('local pipeline handles product-on-Khata: %s', text => {
    const before = clone(inventory);
    const result = runLocalPipeline(text);

    expect(result).toBeDefined();

    if (result.status === 'READY') {
      expect(result.command.customer_name).toBeTruthy();
      expect(result.command.product).toBeTruthy();
      expect(result.command.quantity).toBeGreaterThan(0);
    }

    expect(inventory).toEqual(before);
  });

  test.each([
    'Rahul',
    '500',
    'do',
    'Parle',
    '10 wala',
    '2 kilo',
    'Rahul ke khate mein',
    'Rahul ko kuch de do',
    'khata mein 500',
  ])('invalid or incomplete command never executes: %s', text => {
    const before = clone(inventory);
    const result = runLocalPipeline(text);

    expect(result).toBeDefined();
    expect(result.status).not.toBe('EXECUTED');

    if (result.status === 'READY') {
      expect(result.command).toBeDefined();
      expect(result.command.intent).toBeDefined();
    }

    expect(inventory).toEqual(before);
  });

  test.each([
    ['Unknown biscuit 2 packet', 'PRODUCT_NOT_FOUND'],
    ['Parle G 999 wala', 'PRICE_VARIANT_NOT_FOUND'],
    ['Parle G 2 litre', 'UNIT_VARIANT_NOT_FOUND'],
    ['Basmati Rice 999 wala', 'PRICE_VARIANT_NOT_FOUND'],
  ])(
    'validator rejects unsafe inventory substitution: %s',
    (text, expectedStatus) => {
      const command = {
        intent: 'sale.create',
        product: containsAny(text, ['Basmati'])
          ? 'Basmati Rice'
          : containsAny(text, ['Unknown'])
            ? 'Unknown biscuit'
            : 'Parle G',
        quantity: 1,
        unit: containsAny(text, ['litre'])
          ? 'L'
          : containsAny(text, ['Basmati'])
            ? 'KG'
            : 'PACKET',
        price_hint: text.includes('999') ? 999 : 10,
        confidence: 1,
      };

      const result = runValidator(command);

      expect(result.status).toBe(expectedStatus);
    }
  );

  test('validator never treats price as quantity', () => {
    const result = runValidator({
      intent: 'sale.create',
      product: 'Parle G',
      quantity: null,
      unit: null,
      price_hint: 10,
      confidence: 1,
    });

    expect(result.status).toBe('READY');
    expect(result.command.quantity).toBe(1);
    expect(result.command.price_hint).toBe(10);
  });

  test('validator preserves quantity and price independently', () => {
    const result = runValidator({
      intent: 'sale.create',
      product: 'Rice',
      quantity: 5,
      unit: 'KG',
      price_hint: 50,
      confidence: 1,
    });

    expect(result.status).toBe('READY');
    expect(result.command.quantity).toBe(5);
    expect(result.command.unit).toBe('KG');
    expect(result.command.price_hint).toBe(50);
    expect(result.command.resolved_inventory_id).toBe('rice-50');
  });

  test('Parle Ji resolves to real Parle G inventory', () => {
    const result = runValidator({
      intent: 'sale.create',
      product: 'Parle Ji',
      quantity: 2,
      unit: 'PACKET',
      price_hint: 10,
      confidence: 1,
    });

    expect(result.status).toBe('READY');
    expect(result.command.product).toBe('Parle G');
    expect(result.command.resolved_inventory_id).toBe('parle-10');
  });

  test('Basmati Rice never resolves to generic Rice', () => {
    const result = runValidator({
      intent: 'sale.create',
      product: 'Basmati Rice',
      quantity: 1,
      unit: 'KG',
      price_hint: 100,
      confidence: 1,
    });

    expect(result.status).toBe('READY');
    expect(result.command.resolved_inventory_id).toBe('basmati-100');
  });

  test('money-only Khata never requires inventory', () => {
    const result = runValidator({
      intent: 'khata.credit',
      customer_name: 'Rahul',
      amount: 500,
      confidence: 1,
    });

    expect(result.status).toBe('READY');
    expect(result.command.intent).toBe('khata.credit');
    expect(result.command.amount).toBe(500);
    expect(result.command.resolved_inventory_id).toBeNull();
  });

  test('Khata without customer is rejected with explicit status', () => {
    const result = runValidator({
      intent: 'khata.credit',
      amount: 500,
      confidence: 1,
    });

    expect(result.status).toBe('CUSTOMER_REQUIRED');
  });

  test('Khata without amount or product is rejected with explicit status', () => {
    const result = runValidator({
      intent: 'khata.credit',
      customer_name: 'Rahul',
      confidence: 1,
    });

    expect(result.status).toBe('AMOUNT_REQUIRED');
  });

  test('bridge resolves Gemini product command to real inventory', () => {
    const result = runBridge({
      intent: 'sale.create',
      product: 'Parle Ji',
      quantity: 2,
      unit: 'PACKET',
      price_hint: 10,
      confidence: 1,
    });

    expect(result.status).toBe('READY');
    expect(result.command.product).toBe('Parle G');
    expect(result.command.resolved_inventory_id).toBe('parle-10');
  });

  test('bridge rejects unknown Gemini product', () => {
    const result = runBridge({
      intent: 'sale.create',
      product: 'Unknown Biscuit',
      quantity: 2,
      unit: 'PACKET',
      price_hint: 10,
      confidence: 1,
    });

    expect(result.status).toBe('PRODUCT_NOT_FOUND');
  });

  test('bridge rejects wrong explicit price', () => {
    const result = runBridge({
      intent: 'sale.create',
      product: 'Parle G',
      quantity: 1,
      unit: 'PACKET',
      price_hint: 999,
      confidence: 1,
    });

    expect(result.status).toBe('PRICE_VARIANT_NOT_FOUND');
  });

  test('executor rejects sale without resolved inventory', async () => {
    const result = await executeCommand({
      command: {
        status: 'READY',
        intent: 'sale.create',
        product: 'Parle G',
        quantity: 1,
        unit: 'PACKET',
        price_hint: 10,
      },
      inventory,
      handlers,
    });

    expect(result.status).toBe('INVENTORY_RESOLUTION_REQUIRED');
  });

  test('executor rejects zero quantity with explicit status', async () => {
    const result = await executeCommand({
      command: {
        status: 'READY',
        intent: 'sale.create',
        product: 'Parle G',
        quantity: 0,
        unit: 'PACKET',
        price_hint: 10,
        resolved_inventory_id: 'parle-10',
      },
      inventory,
      handlers,
    });

    expect(result.status).toBe('QUANTITY_REQUIRED');
  });

  test('executor rejects Khata without customer with explicit status', async () => {
    const result = await executeCommand({
      command: {
        status: 'READY',
        intent: 'khata.credit',
        amount: 500,
      },
      inventory,
      handlers,
    });

    expect(result.status).toBe('CUSTOMER_REQUIRED');
  });

  test('full money-only Khata execution path works', async () => {
    const command = runValidator({
      intent: 'khata.credit',
      customer_name: 'Rahul',
      amount: 500,
      confidence: 1,
    });

    expect(command.status).toBe('READY');

    const result = await executeVoiceTransaction({
      command: command.command,
      context: {
        ownerId: 'stress-owner',
        inventory,
      },
      handlers,
    });

    expect(result.status).toBe('EXECUTED');
    expect(handlers.khataCredit).toHaveBeenCalled();
  });

  test('full Parle G sale execution path works only with resolved inventory', async () => {
    const command = runValidator({
      intent: 'sale.create',
      product: 'Parle Ji',
      quantity: 2,
      unit: 'PACKET',
      price_hint: 10,
      confidence: 1,
    });

    expect(command.status).toBe('READY');
    expect(command.command.resolved_inventory_id).toBe('parle-10');

    const result = await executeVoiceTransaction({
      command: command.command,
      context: {
        ownerId: 'stress-owner',
        inventory,
      },
      handlers,
    });

    expect(result.status).toBe('EXECUTED');
    expect(handlers.saleCreate).toHaveBeenCalled();
  });

  test('full product-on-Khata execution path works', async () => {
    const command = runValidator({
      intent: 'khata.credit',
      product: 'Sugar',
      quantity: 2,
      unit: 'KG',
      customer_name: 'Rahul',
      confidence: 1,
    });

    expect(command.status).toBe('READY');

    const result = await executeVoiceTransaction({
      command: command.command,
      context: {
        ownerId: 'stress-owner',
        inventory,
      },
      handlers,
    });

    expect(result.status).toBe('EXECUTED');
  });

  test('command and inventory remain unchanged after full pipeline', async () => {
    const command = runValidator({
      intent: 'sale.create',
      product: 'Parle Ji',
      quantity: 2,
      unit: 'PACKET',
      price_hint: 10,
      confidence: 1,
    }).command;

    const commandBefore = clone(command);
    const inventoryBefore = clone(inventory);

    await executeVoiceTransaction({
      command,
      context: {
        ownerId: 'stress-owner',
        inventory,
      },
      handlers,
    });

    expect(command).toEqual(commandBefore);
    expect(inventory).toEqual(inventoryBefore);
  });

  test('randomized command corpus never crashes the pipeline', async () => {
    const commands = [
      '10 wala Parle Ji',
      '2 packet Parle Ji',
      'do packet 10 wala Parle Ji',
      '5 wala Tiger biscuit',
      '3 packet Kurkure',
      '50 wala chawal 5 kilo',
      '5 kilo chawal',
      '100 wale basmati chawal',
      '2 kilo sugar',
      'do kilo chini',
      '3 kilo cheeni',
      'Rahul ke khate mein 500 rupaye daalo',
      'Rahul ke khate mein paanch sau rupaye daalo',
      'Devendra ke khate mein 150 rupaye daalo',
      'Rahul ke khate mein 2 kilo sugar daalo',
      'Rahul ke khate mein 2 packet 10 wala Parle Ji',
      'Rahul ko 1 packet Parle Ji udhaar',
      'inventory mein sugar kitni hai',
      'Rahul ka khata batao',
      'Parle G ka price kya hai',
      'cart mein 2 Kurkure add karo',
      'discount 10 percent lagao',
      'checkout karo',
      'Rahul',
      '500',
      'do',
      'Parle',
      '10 wala',
      '2 kilo',
      'Rahul ke khate mein',
      'unknown biscuit 2 packet',
      'Parle G 999 wala',
      'Basmati Rice 999 wala',
      'Parle G 2 litre',
      'Devendra ko 150 udhaar',
      'Rahul ko 250 udhaar',
      'Amit ko 700 udhaar likh do',
      'Priya ke khate mein 300 chadha do',
    ];

    const failures = [];

    for (const text of commands) {
      try {
        const local = runLocalPipeline(text);

        expect(local).toBeDefined();

        if (local.status === 'READY' && local.command) {
          const validated = runValidator(local.command);

          expect(validated).toBeDefined();

          if (validated.status === 'READY' && validated.command) {
            const command = validated.command;

            if (commandNeedsInventory(command)) {
              expect(command.resolved_inventory_id).toBeTruthy();
            }
          }
        }
      } catch (error) {
        failures.push({
          text,
          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }

    expect(failures).toEqual([]);
  });

  test('router handles truly unknown natural language without crashing', async () => {
    const result = await parseVoiceCommand({
      text: 'mujhe batao aaj dukaan mein sabse zyada kya bik sakta hai',
      inventory,
      customerNames,
      offline: true,
    });

    expect(result).toBeDefined();
    expect(result.status || result.source).toBeDefined();
  });

  test('no command can execute when router returns no command', async () => {
    const result = await executeVoiceTransaction({
      command: {
        status: 'REJECTED',
        reason: 'INVALID_COMMAND',
        command: null,
      },
      context: {
        ownerId: 'stress-owner',
        inventory,
      },
      handlers,
    });

    expect(result.status).toBe('INTENT_NOT_EXECUTABLE');
  });
});