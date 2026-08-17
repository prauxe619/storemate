import {
  schemaMigrations,
  addColumns,
} from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({

  migrations: [

    /*
     * ========================================================
     * VERSION 8
     * ========================================================
     */

    {
      toVersion: 8,

      steps: [

        addColumns({
          table: 'ledger_entries',

          columns: [
            {
              name: 'owner_id',
              type: 'string',
              isIndexed: true,
              isOptional: true,
            },
          ],
        }),

        addColumns({
          table: 'inventory_items',

          columns: [
            {
              name: 'owner_id',
              type: 'string',
              isIndexed: true,
              isOptional: true,
            },
          ],
        }),

        addColumns({
          table: 'sales_transactions',

          columns: [
            {
              name: 'owner_id',
              type: 'string',
              isIndexed: true,
              isOptional: true,
            },
          ],
        }),

      ],
    },


    /*
     * ========================================================
     * VERSION 9
     * ========================================================
     */

    {
      toVersion: 9,

      steps: [],
    },


    /*
     * ========================================================
     * VERSION 10
     * ========================================================
     */

    {
      toVersion: 10,

      steps: [

        addColumns({
          table: 'inventory_items',

          columns: [
            {
              name: 'unit',
              type: 'string',
              isOptional: true,
            },
          ],
        }),

      ],
    },


    /*
     * ========================================================
     * VERSION 11
     * ========================================================
     *
     * Inventory:
     * - category
     * - image_url
     * - created_at
     *
     * Ledger:
     * - note
     *
     */

    {
      toVersion: 11,

      steps: [

        addColumns({
          table: 'inventory_items',

          columns: [

            {
              name: 'category',
              type: 'string',
              isOptional: true,
            },

            {
              name: 'image_url',
              type: 'string',
              isOptional: true,
            },

            /*
             * IMPORTANT:
             *
             * WatermelonDB requires created_at
             * to be a required number.
             */
            {
              name: 'created_at',
              type: 'number',
            },

          ],
        }),


        addColumns({
          table: 'ledger_entries',

          columns: [

            {
              name: 'note',
              type: 'string',
              isOptional: true,
            },

          ],
        }),

      ],
    },

  ],

});