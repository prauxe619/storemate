import {
  processLocalVoiceCommand,
  canExecuteLocalCommand,
} from '../src/core/ai/LocalCommandPipeline';


describe(
  'COUNTR Phase 3C - Local Command Pipeline',
  () => {

    const inventory = [

      {
        id: 'parle-5',
        productName: 'Parle G',
        sellingPrice: 5,
        unit: 'PACKET',
        quantity: 30,
      },

      {
        id: 'parle-10',
        productName: 'Parle G',
        sellingPrice: 10,
        unit: 'PACKET',
        quantity: 50,
      },

      {
        id: 'parle-20',
        productName: 'Parle G',
        sellingPrice: 20,
        unit: 'PACKET',
        quantity: 10,
      },

      {
        id: 'kurkure-10',
        productName: 'Kurkure',
        sellingPrice: 10,
        unit: 'PACKET',
        quantity: 20,
      },

      {
        id: 'tiger-5',
        productName: 'Tiger Biscuit',
        sellingPrice: 5,
        unit: 'PACKET',
        quantity: 25,
      },

      {
        id: 'rice-50',
        productName: 'Rice',
        sellingPrice: 50,
        unit: 'KG',
        quantity: 100,
      },

      {
        id: 'rice-60',
        productName: 'Rice',
        sellingPrice: 60,
        unit: 'KG',
        quantity: 80,
      },

      {
        id: 'basmati-100',
        productName: 'Basmati Rice',
        sellingPrice: 100,
        unit: 'KG',
        quantity: 40,
      },

      {
        id: 'sugar-45',
        productName: 'Sugar',
        sellingPrice: 45,
        unit: 'KG',
        quantity: 60,
      },

      {
        id: 'toothbrush-10',
        productName: 'Tooth Brush',
        sellingPrice: 10,
        unit: 'PCS',
        quantity: 40,
      },

    ];


    const customers = [
      'Rahul',
      'Devendra',
      'Rakesh',
    ];


    test(
      '10 wala Kurkure resolves to actual inventory item',
      () => {

        const result =
          processLocalVoiceCommand({

            text:
              '10 wala kurkure',

            inventory,

            customerNames:
              customers,

          });


        expect(
          result.status
        ).toBe('READY');

        expect(
          result.command.intent
        ).toBe('sale.create');

        expect(
          result.command.inventory_item_id
        ).toBe('kurkure-10');

        expect(
          result.command.selling_price
        ).toBe(10);

        expect(
          result.command.quantity
        ).toBe(1);

        expect(
          canExecuteLocalCommand(
            result
          )
        ).toBe(true);

      }
    );


    test(
      '10 wala Parle Ji resolves to Parle G ₹10',
      () => {

        const result =
          processLocalVoiceCommand({

            text:
              '10 wala parle ji',

            inventory,

            customerNames:
              customers,

          });


        expect(
          result.status
        ).toBe('READY');

        expect(
          result.command.product
        ).toBe('Parle G');

        expect(
          result.command.inventory_item_id
        ).toBe('parle-10');

        expect(
          result.command.selling_price
        ).toBe(10);

      }
    );


    test(
      '50 wala chawal 5 kilo resolves price and quantity separately',
      () => {

        const result =
          processLocalVoiceCommand({

            text:
              '50 wala chawal 5 kilo',

            inventory,

            customerNames:
              customers,

          });


        expect(
          result.status
        ).toBe('READY');

        expect(
          result.command.inventory_item_id
        ).toBe('rice-50');

        expect(
          result.command.quantity
        ).toBe(5);

        expect(
          result.command.unit
        ).toBe('KG');

        expect(
          result.command.selling_price
        ).toBe(50);

      }
    );


    test(
      '100 wale basmati chawal resolves to basmati variant',
      () => {

        const result =
          processLocalVoiceCommand({

            text:
              '100 wale basmati chawal',

            inventory,

            customerNames:
              customers,

          });


        expect(
          result.status
        ).toBe('READY');

        expect(
          result.command.inventory_item_id
        ).toBe('basmati-100');

        expect(
          result.command.product
        ).toBe('Basmati Rice');

        expect(
          result.command.selling_price
        ).toBe(100);

      }
    );


    test(
      'Rahul khata + 2 kg sugar',
      () => {

        const result =
          processLocalVoiceCommand({

            text:
              'rahul ke khate mein 2 kilo sugar daalo',

            inventory,

            customerNames:
              customers,

          });


        expect(
          result.status
        ).toBe('READY');

        expect(
          result.command.intent
        ).toBe('sale.create');

        expect(
          result.command.customer_name
        ).toBe('Rahul');

        expect(
          result.command.payment_type
        ).toBe('KHATA');

        expect(
          result.command.inventory_item_id
        ).toBe('sugar-45');

        expect(
          result.command.quantity
        ).toBe(2);

        expect(
          result.command.unit
        ).toBe('KG');

        expect(
          canExecuteLocalCommand(
            result
          )
        ).toBe(true);

      }
    );


    test(
      'Rahul khata + 2 packet 10 wala Parle Ji',
      () => {

        const result =
          processLocalVoiceCommand({

            text:
              'rahul ke khate mein 2 packet 10 wala parle ji daal do',

            inventory,

            customerNames:
              customers,

          });


        expect(
          result.status
        ).toBe('READY');

        expect(
          result.command.intent
        ).toBe('sale.create');

        expect(
          result.command.customer_name
        ).toBe('Rahul');

        expect(
          result.command.payment_type
        ).toBe('KHATA');

        expect(
          result.command.inventory_item_id
        ).toBe('parle-10');

        expect(
          result.command.quantity
        ).toBe(2);

        expect(
          result.command.unit
        ).toBe('PACK');

        expect(
          result.command.selling_price
        ).toBe(10);

      }
    );


    test(
      'Rahul khata + 500 rupees does not require inventory',
      () => {

        const result =
          processLocalVoiceCommand({

            text:
              'rahul ke khate mein paanch sau rupaye daalo',

            inventory,

            customerNames:
              customers,

          });


        expect(
          result.status
        ).toBe('READY');

        expect(
          result.command.intent
        ).toBe('khata.credit');

        expect(
          result.command.customer_name
        ).toBe('Rahul');

        expect(
          result.command.amount
        ).toBe(500);

        expect(
          result.command.inventory_item_id
        ).toBeUndefined();

        expect(
          canExecuteLocalCommand(
            result
          )
        ).toBe(true);

      }
    );


    test(
      'missing price variant is never silently substituted',
      () => {

        const result =
          processLocalVoiceCommand({

            text:
              '15 wala parle g',

            inventory,

            customerNames:
              customers,

          });


        expect(
          result.status
        ).toBe(
          'VARIANT_NOT_FOUND'
        );

        expect(
          result.command
            .variant_resolved
        ).toBe(false);

        expect(
          canExecuteLocalCommand(
            result
          )
        ).toBe(false);

      }
    );


    test(
      'missing product cannot execute',
      () => {

        const result =
          processLocalVoiceCommand({

            text:
              '10 wala maggi',

            inventory,

            customerNames:
              customers,

          });


        expect(
          result.status
        ).toBe(
          'PRODUCT_NOT_FOUND'
        );

        expect(
          canExecuteLocalCommand(
            result
          )
        ).toBe(false);

      }
    );


    test(
      'missing inventory cannot execute a product sale',
      () => {

        const result =
          processLocalVoiceCommand({

            text:
              '10 wala parle g',

            inventory: [],

            customerNames:
              customers,

          });


        expect(
          result.status
        ).toBe(
          'PRODUCT_NOT_FOUND'
        );

        expect(
          canExecuteLocalCommand(
            result
          )
        ).toBe(false);

      }
    );


    test(
      'empty voice command is rejected safely',
      () => {

        const result =
          processLocalVoiceCommand({

            text: '',

            inventory,

            customerNames:
              customers,

          });


        expect(
          result.status
        ).toBe(
          'INVALID_COMMAND'
        );

        expect(
          canExecuteLocalCommand(
            result
          )
        ).toBe(false);

      }
    );


    test(
      'pipeline does not mutate inventory',
      () => {

        const before =
          JSON.stringify(
            inventory
          );

        processLocalVoiceCommand({

          text:
            '10 wala parle ji',

          inventory,

          customerNames:
            customers,

        });


        expect(
          JSON.stringify(
            inventory
          )
        ).toBe(before);

      }
    );

  }
);
