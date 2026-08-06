import { Q } from '@nozbe/watermelondb';
import { database } from '../database';
import { apiClient } from '../api/client';

export const synchronizeOfflineData = async () => {
  try {
    // 1. Fetch all unsynced records from all collections
    const ledgerEntries = await database.get('ledger_entries').query(Q.where('is_synced', false)).fetch();
    const inventoryItems = await database.get('inventory_items').query(Q.where('is_synced', false)).fetch();
    const salesTrans = await database.get('sales_transactions').query(Q.where('is_synced', false)).fetch();

    if (ledgerEntries.length === 0 && inventoryItems.length === 0 && salesTrans.length === 0) {
      return { success: true, message: "All data already synced.", processed: 0 };
    }

    // 2. Prepare the complete Payload
    const syncPayload = {
      ledger: ledgerEntries.map(e => ({ id: e.id, customer_id: e.customerId, amount: e.amount, entry_type: e.entryType, created_at: e.createdAt })),
      inventory: inventoryItems.map(i => ({ id: i.id, barcode: i.barcode, product_name: i.productName, quantity: i.quantity, selling_price: i.sellingPrice, updated_at: i.updatedAt })),
      sales: salesTrans.map(s => ({ id: s.id, total_amount: s.totalAmount, payment_type: s.paymentType, created_at: s.createdAt }))
    };

    // 3. Push to Flask
    const response = await apiClient.post('/api/sync', syncPayload);

    if (response.status === 200) {
      // ✅ Calculate the total processed count OUTSIDE the write block
      const totalProcessed = ledgerEntries.length + inventoryItems.length + salesTrans.length;

      // 4. Batch update isSynced status for all collections
      await database.write(async () => {
        const allUpdates = [
          ...ledgerEntries.map(r => r.prepareUpdate(rec => { rec.isSynced = true })),
          ...inventoryItems.map(r => r.prepareUpdate(rec => { rec.isSynced = true })),
          ...salesTrans.map(r => r.prepareUpdate(rec => { rec.isSynced = true }))
        ];
        await database.batch(...allUpdates);
      });

      // ✅ Return the pre-calculated total so we don't try to access the scoped variable
      return { success: true, message: "Cloud synced successfully", processed: totalProcessed };
    }
  } catch (error) {
    console.error("Sync Error:", error);
    return { success: false, message: "Sync failed - Server unreachable", processed: 0 };
  }
};