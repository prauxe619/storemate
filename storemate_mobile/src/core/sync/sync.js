import { Q } from '@nozbe/watermelondb';
import { database } from '../database';

// Note: 10.0.2.2 is how the Android Emulator connects to your computer's localhost
// Change localhost to your IP:
const SYNC_URL = 'http://192.168.31.65:5050/api/sync';

export const syncWithCloud = async () => {
  try {
    // 1. Fetch all unsynced records from all THREE tables
    const unsyncedInventory = await database.collections
      .get('inventory_items')
      .query(Q.where('is_synced', false))
      .fetch();

    const unsyncedLedger = await database.collections
      .get('ledger_entries')
      .query(Q.where('is_synced', false))
      .fetch();

    // ✅ NEW: Fetch unsynced sales
    const unsyncedSales = await database.collections
      .get('sales_transactions')
      .query(Q.where('is_synced', false))
      .fetch();

    if (unsyncedInventory.length === 0 && unsyncedLedger.length === 0 && unsyncedSales.length === 0) {
      console.log('✅ Everything is already synced up to date.');
      return { success: true, message: 'Up to date' };
    }

    // 2. Format the payload for Python
    const payload = {
      inventory: unsyncedInventory.map(item => ({
        id: item.id,
        barcode: item.barcode,
        product_name: item.productName,
        quantity: item.quantity,
        purchase_price: item.purchasePrice,
        selling_price: item.sellingPrice,
        updated_at: item.updatedAt
      })),
      ledger: unsyncedLedger.map(entry => ({
        id: entry.id,
        customer_id: entry.customerId,
        amount: entry.amount,
        entry_type: entry.entryType,
        created_at: entry.createdAt
      })),
      // ✅ NEW: Format sales for Python
      sales: unsyncedSales.map(sale => ({
        id: sale.id,
        total_amount: sale.totalAmount,
        payment_type: sale.paymentType,
        created_at: sale.createdAt
      }))
    };

    console.log('📤 Pushing payload to cloud:', payload);

    // 3. Send to Flask Backend
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error('Server rejected the sync.');

    // 4. If Python says OK, mark all as synced locally!
    await database.write(async () => {
      // ✅ NEW: Added unsyncedSales to the batch update array
      const recordsToUpdate = [...unsyncedInventory, ...unsyncedLedger, ...unsyncedSales].map(record =>
        record.prepareUpdate(r => {
          r.isSynced = true;
        })
      );
      
      // Batch update is extremely fast
      await database.batch(...recordsToUpdate);
    });

    console.log('✅ Sync successful! Records marked as synced.');
    return { success: true, message: 'Sync complete' };

  } catch (error) {
    console.error('❌ Sync Failed:', error.message);
    return { success: false, message: error.message };
  }
};