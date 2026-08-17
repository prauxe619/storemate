import {
  appSchema,
  tableSchema,
} from '@nozbe/watermelondb';


export default appSchema({

  /*
   * ==========================================================
   * VERSION 11
   * ==========================================================
   *
   * Version 11 adds the fields required for:
   *
   * - Universal inventory
   * - Inventory categories
   * - Inventory images
   * - Inventory creation timestamps
   * - Khata notes
   *
   * Existing records remain intact.
   */

  version: 11,


  tables: [

    /*
     * ========================================================
     * LEDGER / KHATA
     * ========================================================
     */

    tableSchema({

      name:
        'ledger_entries',

      columns: [

        {
          name:
            'owner_id',

          type:
            'string',

          isIndexed:
            true,

          isOptional:
            true,
        },


        {
          name:
            'cloud_id',

          type:
            'string',

          isOptional:
            true,
        },


        {
          name:
            'customer_id',

          type:
            'string',

          isIndexed:
            true,
        },


        {
          name:
            'amount',

          type:
            'number',
        },


        {
          name:
            'entry_type',

          type:
            'string',
        },


        {
          name:
            'is_synced',

          type:
            'boolean',
        },


        {
          name:
            'created_at',

          type:
            'number',
        },


        {
          name:
            'customer_phone',

          type:
            'string',

          isOptional:
            true,
        },


        /*
         * NEW IN VERSION 11
         *
         * Example:
         *
         * "Milk udhaar"
         * "Rakesh ne cash diya"
         * "Old balance"
         */

        {
          name:
            'note',

          type:
            'string',

          isOptional:
            true,
        },

      ],

    }),


    /*
     * ========================================================
     * INVENTORY
     * ========================================================
     */

    tableSchema({

      name:
        'inventory_items',

      columns: [

        {
          name:
            'owner_id',

          type:
            'string',

          isIndexed:
            true,

          isOptional:
            true,
        },


        {
          name:
            'barcode',

          type:
            'string',

          isIndexed:
            true,

          isOptional:
            true,
        },


        {
          name:
            'product_name',

          type:
            'string',
        },


        {
          name:
            'quantity',

          type:
            'number',
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
          name:
            'unit',

          type:
            'string',

          isOptional:
            true,
        },


        {
          name:
            'purchase_price',

          type:
            'number',

          isOptional:
            true,
        },


        {
          name:
            'selling_price',

          type:
            'number',
        },


        /*
         * NEW IN VERSION 11
         *
         * Product category.
         *
         * Examples:
         *
         * Grocery
         * Dairy
         * Beverages
         * Snacks
         * Tobacco
         */

        {
          name:
            'category',

          type:
            'string',

          isOptional:
            true,
        },


        /*
         * NEW IN VERSION 11
         *
         * Product image URL/path.
         */

        {
          name:
            'image_url',

          type:
            'string',

          isOptional:
            true,
        },


        {
          name:
            'is_synced',

          type:
            'boolean',
        },


        /*
         * NEW IN VERSION 11
         *
         * Required for cloud backup/restore
         * and record history.
         */

        {
          name:
            'created_at',
          type:
            'number',
        },


        {
          name:
            'updated_at',

          type:
            'number',
        },

      ],

    }),


    /*
     * ========================================================
     * SALES TRANSACTIONS
     * ========================================================
     */

    tableSchema({

      name:
        'sales_transactions',

      columns: [

        {
          name:
            'owner_id',

          type:
            'string',

          isIndexed:
            true,

          isOptional:
            true,
        },


        {
          name:
            'total_amount',

          type:
            'number',
        },


        {
          name:
            'payment_type',

          type:
            'string',
        },


        {
          name:
            'created_at',

          type:
            'number',
        },


        {
          name:
            'is_synced',

          type:
            'boolean',
        },

      ],

    }),

  ],

});