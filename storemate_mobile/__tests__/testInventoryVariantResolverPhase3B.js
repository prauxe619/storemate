import {
  resolveInventoryVariant,
  resolveVoiceInventoryVariant,
  normalizeVariantUnit,
  canConvertVariantUnit,
} from '../src/core/ai/InventoryVariantResolver';


describe(
  'COUNTR Phase 3B - Inventory Variant Resolver',
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
        id: 'sugar-500g',
        productName: 'Sugar',
        sellingPrice: 25,
        unit: 'G',
        quantity: 10000,
      },

      {
        id: 'toothbrush-10',
        productName: 'Tooth Brush',
        sellingPrice: 10,
        unit: 'PCS',
        quantity: 40,
      },

    ];


    test(
      'normalizes units',
      () => {

        expect(
          normalizeVariantUnit('kg')
        ).toBe('KG');

        expect(
          normalizeVariantUnit('kilo')
        ).toBe('KG');

        expect(
          normalizeVariantUnit('packet')
        ).toBe('PACKET');

        expect(
          normalizeVariantUnit('pcs')
        ).toBe('PCS');

      }
    );


    test(
      'recognizes compatible weight units',
      () => {

        expect(
          canConvertVariantUnit(
            'KG',
            'G'
          )
        ).toBe(true);

        expect(
          canConvertVariantUnit(
            'ML',
            'L'
          )
        ).toBe(true);

        expect(
          canConvertVariantUnit(
            'KG',
            'PACKET'
          )
        ).toBe(false);

      }
    );


    test(
      'finds exact Parle G ₹10 variant',
      () => {

        const result =
          resolveVoiceInventoryVariant(
            {
              product: 'Parle G',
              qty: 2,
              unit: 'PACKET',
              price_hint: 10,
            },
            inventory
          );


        expect(
          result.status
        ).toBe('FOUND');

        expect(
          result.id
        ).toBe('parle-10');

        expect(
          result.selling_price
        ).toBe(10);

        expect(
          result.unit
        ).toBe('PACKET');

      }
    );


    test(
      'Parle Ji alias still resolves to Parle G ₹10',
      () => {

        const result =
          resolveVoiceInventoryVariant(
            {
              product: 'Parle Ji',
              qty: 1,
              unit: 'PACKET',
              price_hint: 10,
            },
            inventory
          );


        expect(
          result.status
        ).toBe('FOUND');

        expect(
          result.id
        ).toBe('parle-10');

      }
    );


    test(
      'finds 10 wala Kurkure',
      () => {

        const result =
          resolveVoiceInventoryVariant(
            {
              product: 'Kurkure',
              qty: 1,
              unit: 'PACKET',
              price_hint: 10,
            },
            inventory
          );


        expect(
          result.status
        ).toBe('FOUND');

        expect(
          result.id
        ).toBe('kurkure-10');

      }
    );


    test(
      'finds 5 wala Tiger biscuit',
      () => {

        const result =
          resolveVoiceInventoryVariant(
            {
              product: 'Tiger Biscuit',
              qty: 1,
              unit: 'PACKET',
              price_hint: 5,
            },
            inventory
          );


        expect(
          result.status
        ).toBe('FOUND');

        expect(
          result.id
        ).toBe('tiger-5');

      }
    );


    test(
      'finds 50 wala chawal 5 KG',
      () => {

        const result =
          resolveVoiceInventoryVariant(
            {
              product: 'Rice',
              qty: 5,
              unit: 'KG',
              price_hint: 50,
            },
            inventory
          );


        expect(
          result.status
        ).toBe('FOUND');

        expect(
          result.id
        ).toBe('rice-50');

        expect(
          result.selling_price
        ).toBe(50);

        expect(
          result.unit
        ).toBe('KG');

      }
    );


    test(
      'finds 100 wale basmati chawal',
      () => {

        const result =
          resolveVoiceInventoryVariant(
            {
              product: 'Basmati Rice',
              qty: 1,
              unit: 'KG',
              price_hint: 100,
            },
            inventory
          );


        expect(
          result.status
        ).toBe('FOUND');

        expect(
          result.id
        ).toBe('basmati-100');

      }
    );


    test(
      'does NOT silently choose another price',
      () => {

        const result =
          resolveVoiceInventoryVariant(
            {
              product: 'Parle G',
              qty: 1,
              unit: 'PACKET',
              price_hint: 15,
            },
            inventory
          );


        expect(
          result.status
        ).toBe(
          'VARIANT_NOT_FOUND'
        );

        expect(
          result.requested_price
        ).toBe(15);

        expect(
          result.available_variants
            .map(v => v.selling_price)
            .sort((a, b) => a - b)
        ).toEqual([
          5,
          10,
          20,
        ]);

      }
    );


    test(
      'missing product returns PRODUCT_NOT_FOUND',
      () => {

        const result =
          resolveVoiceInventoryVariant(
            {
              product: 'Maggi',
              qty: 1,
              unit: 'PACKET',
              price_hint: 10,
            },
            inventory
          );


        expect(
          result.status
        ).toBe(
          'PRODUCT_NOT_FOUND'
        );

      }
    );


    test(
      'missing unit returns UNIT_VARIANT_NOT_FOUND',
      () => {

        const result =
          resolveVoiceInventoryVariant(
            {
              product: 'Rice',
              qty: 1,
              unit: 'PACKET',
              price_hint: 50,
            },
            inventory
          );


        expect(
          result.status
        ).toBe(
          'UNIT_VARIANT_NOT_FOUND'
        );

      }
    );


    test(
      'product and price can work when unit is omitted',
      () => {

        const result =
          resolveVoiceInventoryVariant(
            {
              product: 'Parle G',
              qty: 1,
              price_hint: 10,
            },
            inventory
          );


        expect(
          result.status
        ).toBe('FOUND');

        expect(
          result.id
        ).toBe('parle-10');

      }
    );


    test(
      'supports snake_case inventory fields',
      () => {

        const snakeInventory = [

          {
            id: 'sugar-snake',
            product_name: 'Sugar',
            selling_price: 45,
            unit: 'KG',
            quantity: 20,
          },

        ];


        const result =
          resolveVoiceInventoryVariant(
            {
              product: 'Sugar',
              qty: 2,
              unit: 'KG',
              price_hint: 45,
            },
            snakeInventory
          );


        expect(
          result.status
        ).toBe('FOUND');

        expect(
          result.id
        ).toBe('sugar-snake');

      }
    );


    test(
      'supports Watermelon-style getter objects',
      () => {

        const watermelonItem = {

          id: 'wm-parle',

          get productName() {
            return 'Parle G';
          },

          get sellingPrice() {
            return 10;
          },

          get unit() {
            return 'PACKET';
          },

          get quantity() {
            return 12;
          },

        };


        const result =
          resolveVoiceInventoryVariant(
            {
              product: 'Parle Ji',
              qty: 2,
              unit: 'PACKET',
              price_hint: 10,
            },
            [
              watermelonItem,
            ]
          );


        expect(
          result.status
        ).toBe('FOUND');

        expect(
          result.id
        ).toBe('wm-parle');

        expect(
          result.stock_quantity
        ).toBe(12);

      }
    );


    test(
      'does not confuse generic rice with basmati rice',
      () => {

        const result =
          resolveVoiceInventoryVariant(
            {
              product: 'Basmati Rice',
              qty: 1,
              unit: 'KG',
              price_hint: 100,
            },
            inventory
          );


        expect(
          result.id
        ).toBe('basmati-100');

        expect(
          result.product_name
        ).toBe(
          'Basmati Rice'
        );

      }
    );


    test(
      'does not treat price as quantity',
      () => {

        const command = {

          product: 'Tooth Brush',

          qty: 1,

          price_hint: 10,

          unit: 'PCS',

        };


        const result =
          resolveInventoryVariant({
            command,
            inventory,
          });


        /*
         * Calling the object-form API.
         */

        expect(
          result.status
        ).toBe('FOUND');

        expect(
          result.id
        ).toBe('toothbrush-10');

      }
    );

  }
);
