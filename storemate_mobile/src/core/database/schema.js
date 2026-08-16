import { appSchema, tableSchema } from '@nozbe/watermelondb';

export default appSchema({
  version: 10,

  tables: [
    tableSchema({
      name: 'ledger_entries',

      columns: [
        {
          name: 'owner_id',
          type: 'string',
          isIndexed: true,
          isOptional: true,
        },

        {
          name: 'cloud_id',
          type: 'string',
          isOptional: true,
        },

        {
          name: 'customer_id',
          type: 'string',
          isIndexed: true,
        },

        {
          name: 'amount',
          type: 'number',
        },

        {
          name: 'entry_type',
          type: 'string',
        },

        {
          name: 'is_synced',
          type: 'boolean',
        },

        {
          name: 'created_at',
          type: 'number',
        },

        {
          name: 'customer_phone',
          type: 'string',
          isOptional: true,
        },
      ],
    }),

    tableSchema({
      name: 'inventory_items',

      columns: [
        {
          name: 'owner_id',
          type: 'string',
          isIndexed: true,
          isOptional: true,
        },

        {
          name: 'barcode',
          type: 'string',
          isIndexed: true,
          isOptional: true,
        },

        {
          name: 'product_name',
          type: 'string',
        },

        {
          name: 'quantity',
          type: 'number',
        },

        /*
         * UNIVERSAL INVENTORY UNIT
         *
         * Examples:
         *
         * KG
         * GRAM
         * LITRE
         * ML
         * PCS
         * PACK
         * BOX
         * BOTTLE
         * DOZEN
         * STRIP
         * CARTON
         * BUNDLE
         */

        {
          name: 'unit',
          type: 'string',
          isOptional: true,
        },

        {
          name: 'purchase_price',
          type: 'number',
          isOptional: true,
        },

        {
          name: 'selling_price',
          type: 'number',
        },

        {
          name: 'is_synced',
          type: 'boolean',
        },

        {
          name: 'updated_at',
          type: 'number',
        },
      ],
    }),

    tableSchema({
      name: 'sales_transactions',

      columns: [
        {
          name: 'owner_id',
          type: 'string',
          isIndexed: true,
          isOptional: true,
        },

        {
          name: 'total_amount',
          type: 'number',
        },

        {
          name: 'payment_type',
          type: 'string',
        },

        {
          name: 'created_at',
          type: 'number',
        },

        {
          name: 'is_synced',
          type: 'boolean',
        },
      ],
    }),
  ],
});