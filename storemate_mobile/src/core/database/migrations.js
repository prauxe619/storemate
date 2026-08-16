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
     *
     * Adds owner_id to all business tables.
     */

    {
      toVersion:
        8,

      steps: [

        addColumns({

          table:
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

          ],

        }),


        addColumns({

          table:
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

          ],

        }),


        addColumns({

          table:
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
      toVersion:
        9,

      steps:
        [],
    },


    /*
     * ========================================================
     * VERSION 10
     * ========================================================
     *
     * Adds universal inventory unit.
     */

    {
      toVersion:
        10,

      steps: [

        addColumns({

          table:
            'inventory_items',

          columns: [

            {
              name:
                'unit',

              type:
                'string',

              isOptional:
                true,
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
     * Adds fields required by the new
     * backup / sync / inventory system.
     *
     * INVENTORY:
     *
     * category
     * image_url
     * created_at
     *
     * KHATA:
     *
     * note
     */

    {
      toVersion:
        11,

      steps: [

        /*
         * -----------------------------------------------
         * INVENTORY
         * -----------------------------------------------
         */

        addColumns({

          table:
            'inventory_items',

          columns: [

            {
              name:
                'category',

              type:
                'string',

              isOptional:
                true,
            },


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
                'created_at',

              type:
                'number',

              isOptional:
                true,
            },

          ],

        }),


        /*
         * -----------------------------------------------
         * LEDGER / KHATA
         * -----------------------------------------------
         */

        addColumns({

          table:
            'ledger_entries',

          columns: [

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

      ],

    },

  ],

});