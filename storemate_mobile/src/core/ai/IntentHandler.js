import { database } from '../database';
import { Q } from '@nozbe/watermelondb';

export const executeAIAction = async (aiResponse) => {
  // 🚀 Added 'new_price' to the destructuring
  const { intent, product, qty, customer_name, amount, new_price, reason } = aiResponse;
  const now = Date.now();

  try {
    switch (intent) {
      
      // ==========================================
      // DATABASE WRITE ACTIONS
      // ==========================================
      
      case 'inventory.add':
        if (!product || !qty) return "Missing product name or quantity.";
        
        const inventory = await database.get('inventory_items')
          .query(Q.where('product_name', Q.like(`%${product}%`)))
          .fetch();

        if (inventory.length === 0) {
          return `I couldn't find any items matching "${product}".`;
        }

        const item = inventory[0]; 

        await database.write(async () => {
          await item.update((i) => {
            i.quantity += qty;
            i.isSynced = false;
            i.updatedAt = now;
          });
        });

        return `Stock updated. You now have ${item.quantity} ${item.productName} ready to ship.`;

      case 'sale.create':
        if (!product || !qty) return "Please specify what you are selling and how many.";

        const saleItems = await database.get('inventory_items')
          .query(Q.where('product_name', Q.like(`%${product}%`)))
          .fetch();

        if (saleItems.length === 0) return `Product "${product}" not found.`;
        
        const soldItem = saleItems[0];
        if (soldItem.quantity < qty) {
          return `Not enough stock. You only have ${soldItem.quantity} ${soldItem.productName} left.`;
        }

        const totalSaleValue = soldItem.sellingPrice * qty;

        await database.write(async () => {
          await database.get('sales_transactions').create((t) => {
            t.totalAmount = totalSaleValue;
            t.paymentType = customer_name ? 'KHATA' : 'CASH';
            t.isSynced = false;
            t.createdAt = now;
          });

          await soldItem.update((i) => {
            i.quantity -= qty;
            i.isSynced = false;
            i.updatedAt = now;
          });

          if (customer_name) {
            await database.get('ledger_entries').create((entry) => {
              entry.customerId = customer_name;
              entry.amount = totalSaleValue;
              entry.entryType = 'CREDIT';
              entry.isSynced = false;
              entry.createdAt = now;
            });
          }
        });

        return customer_name 
          ? `Billed ₹${totalSaleValue} to ${customer_name}'s Khata for ${qty} ${soldItem.productName}.`
          : `Cash sale recorded: ₹${totalSaleValue} for ${qty} ${soldItem.productName}.`;

      case 'khata.credit':
        if (!customer_name || !amount) return "Need a customer name and an amount.";

        await database.write(async () => {
          await database.get('ledger_entries').create((entry) => {
            entry.customerId = customer_name;
            entry.amount = amount;
            entry.entryType = 'PAYMENT'; 
            entry.isSynced = false;
            entry.createdAt = now;
          });
        });

        return `Logged ₹${amount} payment received from ${customer_name}.`;

      // 🚀 NEW: Phase 3 Price Update Logic
      case 'inventory.update_price':
        if (!product || !new_price) return "Please specify the product and the new price.";
        
        const priceItems = await database.get('inventory_items')
          .query(Q.where('product_name', Q.like(`%${product}%`)))
          .fetch();

        if (priceItems.length === 0) return `Product "${product}" not found.`;
        
        const priceItem = priceItems[0];
        
        await database.write(async () => {
          await priceItem.update((i) => {
            i.sellingPrice = new_price; // Update the price
            i.isSynced = false;
            i.updatedAt = now;
          });
        });

        return `Price of ${priceItem.productName} is now set to ₹${new_price}.`;


      // ==========================================
      // UI NAVIGATION ACTIONS (No DB Writes)
      // ==========================================
      
      case 'ui.open_billing':
        return "Opening billing screen...";
        
      case 'ui.show_low_stock':
      case 'ui.show_sales':
        return "Looking that up for you...";

      case 'unknown':
      default:
        return reason || "I didn't quite understand that command.";
    }
  } catch (error) {
    console.error("Action Execution Error:", error);
    return "Database error while trying to save.";
  }
};