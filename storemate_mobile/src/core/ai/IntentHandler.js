import { database } from '../database';
import { Q } from '@nozbe/watermelondb';

export const executeAIAction = async (aiResponse) => {
  // 🚀 Added 'time_period' for Phase 7
  const { intent, product, qty, customer_name, amount, new_price, reason, time_period } = aiResponse;
  const now = Date.now();

  try {
    switch (intent) {
      
      // ==========================================
      // DATABASE WRITE ACTIONS
      // ==========================================
      
      case 'inventory.add':
        // 🚀 Catch missing quantities gracefully
        if (!product || !qty) return `How many ${product || 'items'} do you want to add?`;
        
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
        // Flat Khata Entry (No specific product, just an amount)
        if (!product && customer_name && (new_price || amount || qty)) {
          const flatAmount = parseFloat(new_price || amount || qty);
          
          await database.write(async () => {
            const now = Date.now();
            await database.get('sales_transactions').create((t) => {
              t.totalAmount = flatAmount;
              t.paymentType = 'KHATA';
              t.isSynced = false;
              t.createdAt = now;
            });
            await database.get('ledger_entries').create((entry) => {
              entry.customerId = customer_name.trim();
              entry.amount = flatAmount;
              entry.entryType = 'CREDIT'; 
              entry.isSynced = false;
              entry.createdAt = now;
            });
          });
          return `Added flat Udhaar of ₹${flatAmount} to ${customer_name}'s Khata.`;
        }

        // --- Standard Inventory Item Sale ---
        
        // 🚀 FIX: Split the errors so it tells you EXACTLY what is missing!
        if (!product) return "Which product are you trying to sell?";
        if (!qty) return `How many ${product} are you selling?`;

        const allSaleItems = await database.get('inventory_items').query().fetch();
        const soldItem = allSaleItems.find(i => 
          i.productName.toLowerCase().includes(product.toLowerCase())
        );

        if (!soldItem) return `Product "${product}" not found in your inventory.`;
              
        if (soldItem.quantity < qty) {
          return `Not enough stock. You only have ${soldItem.quantity} ${soldItem.productName} left.`;
        }

        const totalSaleValue = soldItem.sellingPrice * qty;

        await database.write(async () => {
          const now = Date.now();
          
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
              entry.customerId = customer_name.trim(); 
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
        // 🚀 FIX: Support fallback if Python parser mapped the money to 'new_price' or 'qty' due to the ₹ symbol
        const paymentAmount = amount || new_price || qty; 
        if (!customer_name || !paymentAmount) return "Need a customer name and an amount.";

        await database.write(async () => {
          const now = Date.now();
          await database.get('ledger_entries').create((entry) => {
            entry.customerId = customer_name.trim();
            entry.amount = paymentAmount;
            entry.entryType = 'PAYMENT'; 
            entry.isSynced = false;
            entry.createdAt = now;
          });
        });

        return `Logged ₹${paymentAmount} payment received from ${customer_name}.`;

      case 'inventory.update_price':
        if (!product || !new_price) return "Please specify the product and the new price.";
        
        // 🚀 FIX: Robust case-insensitive matching
        const allPriceItems = await database.get('inventory_items').query().fetch();
        const priceItem = allPriceItems.find(i => 
          i.productName.toLowerCase().includes(product.toLowerCase())
        );

        if (!priceItem) return `Product "${product}" not found.`;
        
        await database.write(async () => {
          const now = Date.now();
          await priceItem.update((i) => {
            i.sellingPrice = new_price; // Update the price
            i.isSynced = false;
            i.updatedAt = now;
          });
        });

        return `Price of ${priceItem.productName} is now set to ₹${new_price}.`;
      
      // ==========================================
      // DATABASE WRITE ACTIONS
      // ==========================================

      case 'customer.create':
        if (!customer_name) return "Please specify the customer name for the new Khata.";

        await database.write(async () => {
          await database.get('ledger_entries').create((entry) => {
            entry.customerId = customer_name;
            entry.amount = 0; // Initialize with a 0 balance
            entry.entryType = 'CREDIT'; 
            entry.isSynced = false;
            entry.createdAt = now;
          });
        });

        return `New Khata account created for ${customer_name}.`;


      // ==========================================
      // 🚀 PHASE 7: READ-ONLY ANALYTICS & SEARCH
      // ==========================================
      
      case 'query.sales':
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const sales = await database.get('sales_transactions')
          .query(Q.where('created_at', Q.gte(today.getTime())))
          .fetch();
          
        const totalSales = sales.reduce((sum, s) => sum + s.totalAmount, 0);
        return `You have made ₹${totalSales.toLocaleString('en-IN')} in sales today.`;

      case 'query.khata':
        if (!customer_name) return "Which customer's balance do you want to check?";
        
        const entries = await database.get('ledger_entries')
          .query(Q.where('customer_id', Q.like(`%${customer_name}%`)))
          .fetch();
          
        if (entries.length === 0) return `I couldn't find any Khata records for ${customer_name}.`;
        
        let balance = 0;
        entries.forEach(e => {
          if (e.entryType === 'CREDIT') balance += e.amount;
          if (e.entryType === 'PAYMENT') balance -= e.amount;
        });
        
        if (balance > 0) return `${customer_name} currently owes you ₹${balance.toLocaleString('en-IN')}.`;
        if (balance < 0) return `You hold an advance of ₹${Math.abs(balance).toLocaleString('en-IN')} for ${customer_name}.`;
        return `${customer_name}'s account is completely settled (₹0 balance).`;

      case 'query.inventory':
        if (!product) return "Which product are you looking for?";
        
        const stock = await database.get('inventory_items')
          .query(Q.where('product_name', Q.like(`%${product}%`)))
          .fetch();
          
        if (stock.length === 0) return `You don't have any "${product}" in your inventory.`;
        
        const foundItem = stock[0];
        if (foundItem.quantity <= 0) return `${foundItem.productName} is currently out of stock!`;
        return `You have ${foundItem.quantity} ${foundItem.productName} ready to sell.`;


      // ==========================================
      // UI NAVIGATION ACTIONS & ERROR HANDLING
      // ==========================================
      
      case 'ui.open_billing':
        return "Opening billing screen...";
        
      case 'ui.show_low_stock':
      case 'ui.show_sales':
        return "Looking that up for you...";
        
      // 🚀 Catch Cart commands used on the Home Screen
      case 'pos.add_item':
      case 'pos.apply_discount':
      case 'pos.checkout':
        return "Please open 'New Sale' first to use cart commands.";

      case 'unknown':
      default:
        return reason || "Please specify an action, product, and quantity.";
      
      case 'customer.create':
        if (!customer_name) return "Please specify the customer name for the new Khata.";
        // In StoreMate, accounts are initialized dynamically on first transaction,
        // but we can return a confirmation message right away.
        return `New Khata account initialized for ${customer_name} (₹0 balance).`;
    }
  } catch (error) {
    console.error("Action Execution Error:", error);
    return "Database error while trying to save.";
  }
};