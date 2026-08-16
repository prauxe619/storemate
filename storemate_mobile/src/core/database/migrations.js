import {
  schemaMigrations,
  addColumns,
} from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
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

    {
      toVersion: 9,

      steps: [],
    },

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
  ],
});