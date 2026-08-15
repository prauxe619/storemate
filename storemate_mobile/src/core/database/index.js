import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import schema from './schema';
import migrations from './migrations';
import { LedgerEntry, InventoryItem, SalesTransaction } from './model';

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: true,
  onSetUpError: error => {
    console.error('Database failed to load', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [LedgerEntry, InventoryItem, SalesTransaction],
});