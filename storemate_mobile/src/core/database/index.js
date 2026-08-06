import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import schema from './schema';
// 1. Import BOTH models
import { LedgerEntry, InventoryItem, SalesTransaction } from './model';

// 2. Configure the SQLite Adapter
const adapter = new SQLiteAdapter({
  schema,
  jsi: true, 
  onSetUpError: error => {
    console.error("Database failed to load", error);
  }
});

// 3. Instantiate the Database and register BOTH models
export const database = new Database({
  adapter,

  modelClasses: [LedgerEntry, InventoryItem, SalesTransaction],
});