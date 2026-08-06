import { database } from '../core/database';

/**
 * Handles batch operations for saving inventory items.
 * Uses database.batch to ensure all items are saved in one transaction,
 * which is critical for maintaining high UI performance.
 */
export const batchSaveInventory = async (lineItems) => {
    try {
        await database.write(async () => {
            const inventoryCollection = database.get("inventory_items");
            
            // Create batch operations
            const batch = lineItems.map(line => 
                inventoryCollection.prepareCreate(item => {
                    item.barcode = line.barcode || ""; // Defaults to empty if not provided
                    item.productName = line.sku;
                    item.quantity = parseInt(line.qty, 10);
                    item.sellingPrice = parseFloat(line.rate);
                    item.isSynced = false; // Mark for background sync
                })
            );
            
            // Execute batch write to SQLite
            await database.batch(...batch);
        });
        return { success: true };
    } catch (error) {
        console.error("Batch save failed:", error);
        throw error;
    }
};

/**
 * Utility to fetch current inventory count.
 */
export const getInventoryCount = async () => {
    return await database.get("inventory_items").query().fetchCount();
};