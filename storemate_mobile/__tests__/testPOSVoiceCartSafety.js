jest.mock(
  '@react-native-community/netinfo',
  () => ({
    __esModule: true,

    default: {
      fetch:
        jest.fn(
          async () => ({
            isConnected: false,
            isInternetReachable: false,
            type: 'none',
          })
        ),

      addEventListener:
        jest.fn(
          () => jest.fn()
        ),
    },
  })
);

import {
  processPOSVoiceCommand,
} from '../src/core/ai/POSVoiceIntegrationPhase4D';

const inventory = [
  {
    id: 'parle-10',
    productName: 'Parle G',
    sellingPrice: 10,
    quantity: 100,
    unit: 'PACK',
  },

  {
    id: 'parle-20',
    productName: 'Parle G',
    sellingPrice: 20,
    quantity: 100,
    unit: 'PACK',
  },

  {
    id: 'kurkure-10',
    productName: 'Kurkure',
    sellingPrice: 10,
    quantity: 100,
    unit: 'PACK',
  },

  {
    id: 'tiger-5',
    productName: 'Tiger Biscuit',
    sellingPrice: 5,
    quantity: 100,
    unit: 'PACK',
  },

  {
    id: 'rice-basmati-1',
    productName: 'Basmati Rice',
    sellingPrice: 120,
    quantity: 50,
    unit: 'KG',
  },
];

const handlers = {
  addItem: jest.fn(
    async command => ({
      product:
        command.product,

      quantity:
        command.quantity,
    })
  ),

  applyDiscount:
    jest.fn(),

  checkout:
    jest.fn(),
};

describe(
  'COUNTR POS voice cart safety',
  () => {

    test(
      '10 wala Kurkure becomes cart add',
      async () => {

        const result =
          await processPOSVoiceCommand({
            text:
              '10 wala kurkure',

            inventory,

            handlers,
          });

        expect(
          result.status
        ).toBe('EXECUTED');

        expect(
          result.command.intent
        ).toBe('pos.add_item');

        expect(
          result.command.resolved_inventory_id
        ).toBe('kurkure-10');

        expect(
          result.command.quantity
        ).toBe(1);
      }
    );

    test(
      '10 wala Parle G selects ₹10 variant',
      async () => {

        const result =
          await processPOSVoiceCommand({
            text:
              '10 wala parle g',

            inventory,

            handlers,
          });

        expect(
          result.status
        ).toBe('EXECUTED');

        expect(
          result.command.intent
        ).toBe('pos.add_item');

        expect(
          result.command.resolved_inventory_id
        ).toBe('parle-10');

        expect(
          result.command.quantity
        ).toBe(1);
      }
    );

    test(
      '2kg Basmati Rice becomes cart add',
      async () => {

        const result =
          await processPOSVoiceCommand({
            text:
              '2 kg basmati rice',

            inventory,

            handlers,
          });

        expect(
          result.status
        ).toBe('EXECUTED');

        expect(
          result.command.intent
        ).toBe('pos.add_item');

        expect(
          result.command.resolved_inventory_id
        ).toBe('rice-basmati-1');

        expect(
          result.command.quantity
        ).toBe(2);
      }
    );

    test(
      '5 wala Tiger biscuit becomes cart add',
      async () => {

        const result =
          await processPOSVoiceCommand({
            text:
              '5 wala tiger biscuit',

            inventory,

            handlers,
          });

        expect(
          result.status
        ).toBe('EXECUTED');

        expect(
          result.command.intent
        ).toBe('pos.add_item');

        expect(
          result.command.resolved_inventory_id
        ).toBe('tiger-5');

        expect(
          result.command.quantity
        ).toBe(1);
      }
    );
  }
);