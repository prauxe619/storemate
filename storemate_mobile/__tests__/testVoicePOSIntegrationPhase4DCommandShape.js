import {
  processPOSVoiceCommand,
} from '../src/core/ai/POSVoiceIntegrationPhase4D';

import {
  parseVoiceCommand,
} from '../src/core/ai/VoiceCommandRouter';

import {
  executeVoiceTransaction,
} from '../src/core/ai/VoiceTransactionService';


jest.mock(
  '../src/core/ai/VoiceCommandRouter',
  () => ({
    parseVoiceCommand:
      jest.fn(),
  })
);


jest.mock(
  '../src/core/ai/VoiceTransactionService',
  () => ({
    executeVoiceTransaction:
      jest.fn(),
  })
);


describe(
  'COUNTR Phase 4D - Router Command Shape',
  () => {

    beforeEach(() => {

      jest.clearAllMocks();

    });


    test(
      'unwraps Phase 3D nested command before execution',
      async () => {

        parseVoiceCommand.mockResolvedValue({

          status:
            'READY',

          command: {

            status:
              'READY',

            intent:
              'pos.add_item',

            product:
              'Kurkure',

            quantity:
              1,

            resolved_inventory_id:
              'k1',

          },

          source:
            'local_pipeline',

        });


        executeVoiceTransaction.mockResolvedValue({

          status:
            'EXECUTED',

          result: {

            product:
              'Kurkure',

            quantity:
              1,

          },

        });


        await processPOSVoiceCommand({

          text:
            '1 Kurkure add karo',

          inventory: [

            {
              id:
                'k1',

              productName:
                'Kurkure',

              quantity:
                10,

            },

          ],

          customerNames:
            [],

          ownerId:
            'owner-1',

          handlers:
            {},

        });


        expect(
          executeVoiceTransaction
        ).toHaveBeenCalledWith({

          command: {

            status:
              'READY',

            intent:
              'pos.add_item',

            product:
              'Kurkure',

            quantity:
              1,

            resolved_inventory_id:
              'k1',

          },

          context: {

            ownerId:
              'owner-1',

            inventory: [

              {
                id:
                  'k1',

                productName:
                  'Kurkure',

                quantity:
                  10,

              },

            ],

          },

          handlers:
            {},

        });

      }
    );


    test(
      'still supports legacy flat router command',
      async () => {

        parseVoiceCommand.mockResolvedValue({

          status:
            'READY',

          intent:
            'pos.add_item',

          product:
            'Kurkure',

          quantity:
            1,

          resolved_inventory_id:
            'k1',

        });


        executeVoiceTransaction.mockResolvedValue({

          status:
            'EXECUTED',

        });


        await processPOSVoiceCommand({

          text:
            'Kurkure add karo',

          inventory:
            [],

          ownerId:
            'owner-1',

          handlers:
            {},

        });


        expect(
          executeVoiceTransaction
        ).toHaveBeenCalled();


        expect(
          executeVoiceTransaction.mock.calls[0][0]
            .command.intent
        ).toBe(
          'pos.add_item'
        );

      }
    );


    test(
      'never executes a router result without a command',
      async () => {

        parseVoiceCommand.mockResolvedValue({

          status:
            'INVALID_COMMAND',

          command:
            null,

          reason:
            'UNKNOWN_COMMAND',

        });


        const result =
          await processPOSVoiceCommand({

            text:
              'blah blah',

            inventory:
              [],

            ownerId:
              'owner-1',

            handlers:
              {},

          });


        expect(
          result.status
        ).toBe(
          'REJECTED'
        );


        expect(
          result.reason
        ).toBe(
          'UNKNOWN_COMMAND'
        );


        expect(
          executeVoiceTransaction
        ).not.toHaveBeenCalled();

      }
    );

  }
);