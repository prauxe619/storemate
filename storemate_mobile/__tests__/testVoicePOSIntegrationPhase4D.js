/**
 * COUNTR Phase 4D - POS Voice Integration Regression
 */

jest.mock('../src/core/ai/VoiceCommandRouter', () => ({
  parseVoiceCommand: jest.fn(),
}));

jest.mock('../src/core/ai/VoiceTransactionService', () => ({
  executeVoiceTransaction: jest.fn(),
}));

import { parseVoiceCommand } from '../src/core/ai/VoiceCommandRouter';
import { executeVoiceTransaction } from '../src/core/ai/VoiceTransactionService';
import { processPOSVoiceCommand } from '../src/core/ai/POSVoiceIntegrationPhase4D';

describe('COUNTR Phase 4D - POS Voice Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('passes inventory names to the router', async () => {
    parseVoiceCommand.mockResolvedValue({
      intent: 'pos.add_item',
      product: 'Parle G',
      quantity: 2,
      status: 'READY',
    });
    executeVoiceTransaction.mockResolvedValue({
      status: 'EXECUTED',
      result: { product: 'Parle G', quantity: 2 },
    });

    const inventory = [
      { id: 'p1', productName: 'Parle G', quantity: 20 },
      { id: 'p2', productName: 'Sugar', quantity: 10 },
    ];

    const result = await processPOSVoiceCommand({
      text: '2 packet Parle Ji add karo',
      inventory,
      customerNames: ['Rahul'],
      ownerId: 'owner-1',
      handlers: {},
    });

    expect(parseVoiceCommand).toHaveBeenCalledWith({
      text: '2 packet Parle Ji add karo',
      inventory: [
        {
          id: 'p1',
          productName: 'Parle G',
          quantity: 20,
        },
        {
          id: 'p2',
          productName: 'Sugar',
          quantity: 10,
        },
      ],
      customerNames: ['Rahul'],
    });
    expect(executeVoiceTransaction).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('EXECUTED');
  });

  test('empty speech never reaches parser or executor', async () => {
    const result = await processPOSVoiceCommand({
      text: '   ',
      inventory: [],
      ownerId: 'owner-1',
      handlers: {},
    });

    expect(result.status).toBe('REJECTED');
    expect(result.reason).toBe('EMPTY_COMMAND');
    expect(parseVoiceCommand).not.toHaveBeenCalled();
    expect(executeVoiceTransaction).not.toHaveBeenCalled();
  });

  test('sanitizes and bounds speech text before routing', async () => {
    parseVoiceCommand.mockResolvedValue({
      intent: 'pos.add_item',
      product: 'Sugar',
      quantity: 1,
      status: 'READY',
    });
    executeVoiceTransaction.mockResolvedValue({
      status: 'EXECUTED',
    });

    const dirty = `\u0000  Sugar add karo ${'x'.repeat(700)}`;

    await processPOSVoiceCommand({
      text: dirty,
      inventory: [{ id: 's1', productName: 'Sugar', quantity: 5 }],
      ownerId: 'owner-1',
      handlers: {},
    });

    const sent = parseVoiceCommand.mock.calls[0][0].text;
    expect(sent.length).toBeLessThanOrEqual(500);
    expect(sent).not.toContain('\u0000');
  });

  test('keeps executor result authoritative', async () => {
    parseVoiceCommand.mockResolvedValue({
      intent: 'pos.checkout',
      payment_type: 'CASH',
      status: 'READY',
    });
    executeVoiceTransaction.mockResolvedValue({
      status: 'CONFIRMATION_REQUIRED',
      reason: 'CONFIRM_SALE',
    });

    const result = await processPOSVoiceCommand({
      text: 'cash checkout karo',
      inventory: [],
      ownerId: 'owner-1',
      handlers: {},
    });

    expect(result).toEqual({
      status: 'CONFIRMATION_REQUIRED',
      reason: 'CONFIRM_SALE',
    });
  });

  test('passes owner and inventory context to transaction service', async () => {
    parseVoiceCommand.mockResolvedValue({
      intent: 'pos.add_item',
      product: 'Kurkure',
      quantity: 1,
      status: 'READY',
    });
    executeVoiceTransaction.mockResolvedValue({
      status: 'EXECUTED',
    });

    const inventory = [
      { id: 'k1', productName: 'Kurkure', quantity: 10 },
    ];

    await processPOSVoiceCommand({
      text: 'Kurkure add karo',
      inventory,
      ownerId: 'owner-99',
      handlers: { addItem: jest.fn() },
    });

    expect(executeVoiceTransaction).toHaveBeenCalledWith({
      command: {
      intent: 'pos.add_item',
      product: 'Kurkure',
      quantity: 1,
      status: 'READY',
    },
  context: {
    ownerId: 'owner-99',
    inventory,
  },
  handlers: {
  addItem: expect.any(Function),
},
});
  });
});
