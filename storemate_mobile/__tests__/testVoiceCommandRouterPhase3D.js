/*
 * ============================================================
 * COUNTR - VOICE COMMAND ROUTER
 * PHASE 3D TESTS
 * ============================================================
 *
 * Tests:
 *
 * 1. Local product command
 * 2. Local price variant
 * 3. Local Parle Ji alias
 * 4. Local product directly into Khata
 * 5. Local money-only Khata
 * 6. Unknown command can go to cloud
 * 7. Offline fallback
 * 8. Local pipeline gets priority over cloud
 *
 * IMPORTANT:
 *
 * This test mocks:
 *
 * - NetInfo
 * - AsyncStorage
 * - fetch
 *
 * No real internet or Railway request is made.
 * ============================================================
 */

import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  parseVoiceCommand,
} from '../src/core/ai/VoiceCommandRouter';


/*
 * ============================================================
 * MOCK NETWORK
 * ============================================================
 */

jest.mock(
  '@react-native-community/netinfo',
  () => ({
    fetch: jest.fn(),
  })
);


/*
 * ============================================================
 * MOCK STORAGE
 * ============================================================
 */

jest.mock(
  '@react-native-async-storage/async-storage',
  () => ({
    getItem: jest.fn(),
  })
);


/*
 * ============================================================
 * TEST INVENTORY
 * ============================================================
 */

const inventory = [

  {
    id: 'kurkure-10',
    productName: 'Kurkure',
    sellingPrice: 10,
    unit: 'PACKET',
    quantity: 50,
  },

  {
    id: 'parle-5',
    productName: 'Parle G',
    sellingPrice: 5,
    unit: 'PACKET',
    quantity: 100,
  },

  {
    id: 'parle-10',
    productName: 'Parle G',
    sellingPrice: 10,
    unit: 'PACKET',
    quantity: 80,
  },

  {
    id: 'parle-20',
    productName: 'Parle G',
    sellingPrice: 20,
    unit: 'PACKET',
    quantity: 40,
  },

  {
    id: 'chawal-50-5kg',
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
    quantity: 60,
  },

  {
    id: 'sugar',
    productName: 'Sugar',
    sellingPrice: 50,
    unit: 'KG',
    quantity: 100,
  },

  {
    id: 'toothbrush-10',
    productName: 'Tooth Brush',
    sellingPrice: 10,
    unit: 'PCS',
    quantity: 30,
  },

];


/*
 * ============================================================
 * CUSTOMER LIST
 * ============================================================
 */

const customerNames = [

  'Rahul',

  'Devendra',

  'Kiran',

  'Amit',

];


/*
 * ============================================================
 * NETWORK HELPERS
 * ============================================================
 */

const setOnline = () => {

  NetInfo.fetch.mockResolvedValue({

    isConnected:
      true,

    isInternetReachable:
      true,

  });

};


const setOffline = () => {

  NetInfo.fetch.mockResolvedValue({

    isConnected:
      false,

    isInternetReachable:
      false,

  });

};


/*
 * ============================================================
 * CLOUD MOCK
 * ============================================================
 */

const mockCloudSuccess = (
  response
) => {

  global.fetch =
    jest.fn()
      .mockResolvedValue({

        ok:
          true,

        status:
          200,

        json:
          jest.fn()
            .mockResolvedValue(
              response
            ),

      });

};


const mockCloudFailure = (
  status = 500
) => {

  global.fetch =
    jest.fn()
      .mockResolvedValue({

        ok:
          false,

        status,

        json:
          jest.fn()
            .mockResolvedValue({

              error:
                'Server error',

            }),

      });

};


/*
 * ============================================================
 * SETUP
 * ============================================================
 */

beforeEach(() => {

  jest.clearAllMocks();

  global.fetch =
    jest.fn();

  AsyncStorage.getItem
    .mockResolvedValue(
      'test-token'
    );

  setOnline();

});


/*
 * ============================================================
 * TEST SUITE
 * ============================================================
 */

describe(
  'COUNTR Phase 3D - Voice Command Router',
  () => {


    /*
     * ========================================================
     * TEST 1
     * ========================================================
     */

    test(
      '10 wala Kurkure stays completely local',
      async () => {

        const result =
          await parseVoiceCommand({

            text:
              '10 wala Kurkure',

            inventory,

            customerNames,

          });


        expect(
          result.status
        ).toBe(
          'READY'
        );


        expect(
          result.command.intent
        ).toBe(
          'sale.create'
        );


        expect(
          result.command.product
        ).toBe(
          'Kurkure'
        );


        expect(
          result.command.price_hint
        ).toBe(
          10
        );


        expect(
          result.command.inventory_item_id
        ).toBe(
          'kurkure-10'
        );


        expect(
          result.source
        ).toBe(
          'local_pipeline'
        );


        expect(
          result.execution
        ).toBe(
          'local'
        );


        expect(
          result.cloud_called
        ).toBe(
          false
        );


        expect(
          global.fetch
        ).not.toHaveBeenCalled();

      }
    );


    /*
     * ========================================================
     * TEST 2
     * ========================================================
     */

    test(
      '10 wala Parle Ji resolves Parle G ₹10 locally',
      async () => {

        const result =
          await parseVoiceCommand({

            text:
              '10 wala Parle Ji',

            inventory,

            customerNames,

          });


        expect(
          result.status
        ).toBe(
          'READY'
        );


        expect(
          result.command.product
        ).toBe(
          'Parle G'
        );


        expect(
          result.command.price_hint
        ).toBe(
          10
        );


        expect(
          result.command.inventory_item_id
        ).toBe(
          'parle-10'
        );


        expect(
          result.command.selling_price
        ).toBe(
          10
        );


        expect(
          result.command.variant_resolved
        ).toBe(
          true
        );


        expect(
          result.source
        ).toBe(
          'local_pipeline'
        );


        expect(
          global.fetch
        ).not.toHaveBeenCalled();

      }
    );


    /*
     * ========================================================
     * TEST 3
     * ========================================================
     */

    test(
      '100 wale basmati chawal resolves exact Basmati variant locally',
      async () => {

        const result =
          await parseVoiceCommand({

            text:
              '100 wale basmati chawal',

            inventory,

            customerNames,

          });


        expect(
          result.status
        ).toBe(
          'READY'
        );


        expect(
          result.command.intent
        ).toBe(
          'sale.create'
        );


        expect(
          result.command.product
        ).toBe(
          'Basmati Rice'
        );


        expect(
          result.command.price_hint
        ).toBe(
          100
        );


        expect(
          result.command.inventory_item_id
        ).toBe(
          'basmati-100'
        );


        expect(
          result.command.selling_price
        ).toBe(
          100
        );


        expect(
          result.source
        ).toBe(
          'local_pipeline'
        );


        expect(
          global.fetch
        ).not.toHaveBeenCalled();

      }
    );


    /*
     * ========================================================
     * TEST 4
     * ========================================================
     */

    test(
      'Rahul ke khate mein 2 packet 10 wala Parle Ji stays local',
      async () => {

        const result =
          await parseVoiceCommand({

            text:
              'Rahul ke khate mein 2 packet 10 wala Parle Ji daalo',

            inventory,

            customerNames,

          });


        expect(
          result.status
        ).toBe(
          'READY'
        );


        expect(
          result.command.intent
        ).toBe(
          'sale.create'
        );


        expect(
          result.command.customer_name
        ).toBe(
          'Rahul'
        );


        expect(
          result.command.payment_type
        ).toBe(
          'KHATA'
        );


        expect(
          result.command.quantity
        ).toBe(
          2
        );


        expect(
          result.command.product
        ).toBe(
          'Parle G'
        );


        expect(
          result.command.price_hint
        ).toBe(
          10
        );


        expect(
          result.command.inventory_item_id
        ).toBe(
          'parle-10'
        );


        expect(
          result.command.selling_price
        ).toBe(
          10
        );


        expect(
          result.source
        ).toBe(
          'local_pipeline'
        );


        expect(
          result.cloud_called
        ).toBe(
          false
        );


        expect(
          global.fetch
        ).not.toHaveBeenCalled();

      }
    );


    /*
     * ========================================================
     * TEST 5
     * ========================================================
     */

    test(
      'Rahul ke khate mein 500 rupaye daalo becomes khata.credit locally',
      async () => {

        const result =
          await parseVoiceCommand({

            text:
              'Rahul ke khate mein paanch sau rupaye daalo',

            inventory,

            customerNames,

          });


        expect(
          result.status
        ).toBe(
          'READY'
        );


        expect(
          result.command.intent
        ).toBe(
          'khata.credit'
        );


        expect(
          result.command.customer_name
        ).toBe(
          'Rahul'
        );


        expect(
          result.command.amount
        ).toBe(
          500
        );


        expect(
          result.command.payment_type
        ).toBe(
          'KHATA'
        );


        expect(
          result.source
        ).toBe(
          'local_pipeline'
        );


        expect(
          result.execution
        ).toBe(
          'local'
        );


        expect(
          result.cloud_called
        ).toBe(
          false
        );


        expect(
          global.fetch
        ).not.toHaveBeenCalled();

      }
    );


    /*
     * ========================================================
     * TEST 6
     * ========================================================
     *
     * Unknown / complicated language should be allowed to
     * reach the cloud when internet is available.
     *
     * The exact cloud interpretation is not the responsibility
     * of Phase 3D.
     * ========================================================
     */

    test(
    'truly unknown natural language can fall through to cloud AI',
    async () => {

        mockCloudSuccess({

        intent:
            'query.khata',

        customer_name:
            'Rahul',

        amount:
            null,

        confidence:
            0.96,

        });


        /*
        * This sentence intentionally does not contain
        * a recognizable transaction/product/khata command.
        *
        * It should therefore be allowed to reach cloud AI.
        */

        const result =
        await parseVoiceCommand({

            text:
            'kal wali baat jo hui thi usko samjha do',

            inventory,

            customerNames,

        });


        expect(
        global.fetch
        ).toHaveBeenCalledTimes(
        1
        );


        expect(
        result.source
        ).toBe(
        'remote_ai'
        );


        expect(
        result.execution
        ).toBe(
        'remote'
        );


    expect(
      result.cloud_called
    ).toBe(
      true
    );


    expect(
      result.intent
    ).toBe(
      'query.khata'
    );


    expect(
      result.customer_name
    ).toBe(
      'Rahul'
    );

  }
);


    /*
     * ========================================================
     * TEST 7
     * ========================================================
     *
     * Internet OFF:
     *
     * The app must NOT crash.
     * It must return the local interpretation.
     * ========================================================
     */

    test(
      'offline mode never calls cloud',
      async () => {

        setOffline();


        const result =
          await parseVoiceCommand({

            text:
              '10 wala Kurkure',

            inventory,

            customerNames,

          });


        expect(
          result.status
        ).toBe(
          'READY'
        );


        expect(
          result.command.inventory_item_id
        ).toBe(
          'kurkure-10'
        );


        expect(
          result.source
        ).toBe(
          'local_pipeline'
        );


        expect(
          result.cloud_called
        ).toBe(
          false
        );


        expect(
          global.fetch
        ).not.toHaveBeenCalled();

      }
    );


    /*
     * ========================================================
     * TEST 8
     * ========================================================
     *
     * If local understands a transactional command,
     * cloud must never override it.
     * ========================================================
     */

    test(
      'local transactional command has priority over cloud',
      async () => {

        /*
         * Even if cloud tries to return something else,
         * it must never be called for a strong local command.
         */

        const result =
          await parseVoiceCommand({

            text:
              '10 wala Parle G',

            inventory,

            customerNames,

          });


        expect(
          result.status
        ).toBe(
          'READY'
        );


        expect(
          result.command.intent
        ).toBe(
          'sale.create'
        );


        expect(
          result.command.inventory_item_id
        ).toBe(
          'parle-10'
        );


        expect(
          result.source
        ).toBe(
          'local_pipeline'
        );


        expect(
          result.cloud_called
        ).toBe(
          false
        );


        expect(
          global.fetch
        ).not.toHaveBeenCalled();

      }
    );


    /*
     * ========================================================
     * TEST 9
     * ========================================================
     *
     * Direct product quantity + Khata.
     * ========================================================
     */

    test(
      'Rahul ke khate mein 2 kg sugar stays local',
      async () => {

        const result =
          await parseVoiceCommand({

            text:
              'Rahul ke khate mein 2 kg sugar daalo',

            inventory,

            customerNames,

          });


        expect(
          result.status
        ).toBe(
          'READY'
        );


        expect(
          result.command.intent
        ).toBe(
          'sale.create'
        );


        expect(
          result.command.customer_name
        ).toBe(
          'Rahul'
        );


        expect(
          result.command.payment_type
        ).toBe(
          'KHATA'
        );


        expect(
          result.command.product
        ).toBe(
          'Sugar'
        );


        expect(
          result.command.quantity
        ).toBe(
          2
        );


        expect(
          result.command.unit
        ).toBe(
          'KG'
        );


        expect(
          result.command.inventory_item_id
        ).toBe(
          'sugar'
        );


        expect(
          result.source
        ).toBe(
          'local_pipeline'
        );


        expect(
          global.fetch
        ).not.toHaveBeenCalled();

      }
    );


    /*
     * ========================================================
     * TEST 10
     * ========================================================
     *
     * Empty command.
     * ========================================================
     */

    test(
      'empty command is safely rejected',
      async () => {

        const result =
          await parseVoiceCommand({

            text:
              '',

            inventory,

            customerNames,

          });


        expect(
          result.status
        ).toBe(
          'INVALID_COMMAND'
        );


        expect(
          result.command
        ).toBeNull();


        expect(
          global.fetch
        ).not.toHaveBeenCalled();

      }
    );


    /*
     * ========================================================
     * TEST 11
     * ========================================================
     *
     * Backend failure must not crash the app.
     * ========================================================
     */

    test(
      'backend failure falls back safely to local result',
      async () => {

        mockCloudFailure(
          500
        );


        /*
         * This command intentionally has no usable local
         * inventory match, forcing the router toward cloud.
         */

        const result =
          await parseVoiceCommand({

            text:
              'Rahul ka purana khata dikhao',

            inventory,

            customerNames,

          });


        expect(
          global.fetch
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          result
        ).toBeDefined();


        expect(
          result.source
        ).toBe(
          'local_backend_error'
        );


        expect(
          result.execution
        ).toBe(
          'local'
        );


        expect(
          result.cloud_called
        ).toBe(
          true
        );

      }
    );

  }
);