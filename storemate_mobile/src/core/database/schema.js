import { appSchema, tableSchema } from '@nozbe/watermelondb'

export default appSchema({
  version: 7, 
  tables: [
    tableSchema({
      name: 'ledger_entries',
      columns: [
        { name: 'cloud_id', type: 'string', isOptional: true },
        { name: 'customer_id', type: 'string', isIndexed: true },
        { name: 'amount', type: 'number' },
        { name: 'entry_type', type: 'string' },
        { name: 'is_synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'customer_phone', type: 'string', isOptional: true },
      ]
    }),
    tableSchema({
      name: 'inventory_items',
      columns: [
        { name: 'barcode', type: 'string', isIndexed: true, isOptional: true },
        { name: 'product_name', type: 'string' },
        { name: 'quantity', type: 'number' },
        { name: 'unit', type: 'string', isOptional: true },
        { name: 'purchase_price', type: 'number', isOptional: true },
        { name: 'selling_price', type: 'number' },
        { name: 'is_synced', type: 'boolean' },
        { name: 'updated_at', type: 'number' }, // ✅ FIXED: Removed isOptional
      ]
    }),
    tableSchema({
      name: 'sales_transactions',
      columns: [
        { name: 'total_amount', type: 'number' },
        { name: 'payment_type', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'is_synced', type: 'boolean' },
      ]
    }),
  ]
})