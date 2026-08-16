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
                    item.ownerId = currentOwnerId;
                    item.barcode = line.barcode || "";
                    item.productName = line.sku;
                    item.quantity = parseFloat(line.qty) || 0;
                    item.sellingPrice = parseFloat(line.rate) || 0;
                    item.unit = line.unit || "PCS";
                    item.isSynced = false;
                    item.updatedAt = Date.now();
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