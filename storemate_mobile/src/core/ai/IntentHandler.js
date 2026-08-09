import { database } from '../database';
import { Q } from '@nozbe/watermelondb';

// Shared by both the direct sale.create path (when payment method is
// already clear) and confirmPendingSale (after the user explicitly taps
// Cash or Udhaar in the confirmation dialog). Keeping this in one place
// means both paths write the database identically - no drift between them.
async function commitSale(soldItem, qty, totalSaleValue, paymentType, customer_name, now) {
  if (paymentType === 'KHATA' && !customer_name) {
    return "Please also say the customer's name for Khata sales.";
  }

  await database.write(async () => {
    await database.get('sales_transactions').create((t) => {
      t.totalAmount = totalSaleValue;
      t.paymentType = paymentType;
      t.isSynced = false;
      t.createdAt = now;
    });

    await soldItem.update((i) => {
      i.quantity -= qty;
      i.isSynced = false;
      i.updatedAt = now;
    });

    if (paymentType === 'KHATA') {
      await database.get('ledger_entries').create((entry) => {
        entry.customerId = customer_name.trim();
        entry.amount = totalSaleValue;
        entry.entryType = 'CREDIT';
        entry.isSynced = false;
        entry.createdAt = now;
      });
    }
  });

  return paymentType === 'KHATA'
    ? `Billed ₹${totalSaleValue} to ${customer_name}'s Khata for ${qty} ${soldItem.productName}.`
    : `Cash sale recorded: ₹${totalSaleValue} for ${qty} ${soldItem.productName}.`;
}

// Called from HomeScreen.js after the user taps "Cash" or "Udhaar" in the
// confirmation Alert triggered by a needsConfirmation response above.
export const confirmPendingSale = async (pendingSale, chosenPaymentType) => {
  if (!pendingSale || (chosenPaymentType !== 'CASH' && chosenPaymentType !== 'KHATA')) {
    return "Something went wrong confirming that sale.";
  }

  try {
    const soldItem = await database.get('inventory_items').find(pendingSale.itemId);

    if (soldItem.quantity < pendingSale.qty) {
      return `Not enough stock. You only have ${soldItem.quantity} ${soldItem.productName} left.`;
    }

    return await commitSale(
      soldItem,
      pendingSale.qty,
      pendingSale.totalSaleValue,
      chosenPaymentType,
      pendingSale.customer_name,
      Date.now()
    );
  } catch (error) {
    console.error("Confirm Sale Error:", error);
    return "Database error while trying to save.";
  }
};

export const executeAIAction = async (aiResponse) => {
  const now = Date.now();

  // ==========================================
  // SECURITY: Validate AI response
  // ==========================================

  if (!aiResponse || typeof aiResponse !== 'object') {
    return "Invalid AI response.";
  }

  // Only allow actions that StoreMate explicitly supports.
  const allowedIntents = new Set([
    'inventory.add',
    'sale.create',
    'khata.credit',
    'inventory.update_price',
    'customer.create',
    'query.sales',
    'query.khata',
    'query.inventory',
    'ui.open_billing',
    'ui.show_low_stock',
    'ui.show_sales',
    'pos.add_item',
    'pos.apply_discount',
    'pos.checkout',
    'unknown'
  ]);

  const intent =
    typeof aiResponse.intent === 'string'
      ? aiResponse.intent.trim()
      : 'unknown';

  if (!allowedIntents.has(intent)) {
    console.warn('Blocked unknown AI intent:', intent);
    return "I couldn't understand that command.";
  }

  // ==========================================
  // SECURITY: Sanitize text fields
  // ==========================================

  const cleanText = (value, maxLength = 150) => {
    if (typeof value !== 'string') return '';

    return value
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .trim()
      .slice(0, maxLength);
  };

  const product = cleanText(aiResponse.product, 150);
  const customer_name = cleanText(aiResponse.customer_name, 100);
  const reason = cleanText(aiResponse.reason, 250);
  const time_period = cleanText(aiResponse.time_period, 50);
  const payment_type = (aiResponse.payment_type === 'CASH' || aiResponse.payment_type === 'KHATA')
    ? aiResponse.payment_type
    : null;

  // ==========================================
  // SECURITY: Validate numeric fields
  // ==========================================

  const parsePositiveNumber = (value) => {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
      return null;
    }

    return number;
  };

  const qty = parsePositiveNumber(aiResponse.qty);
  const amount = parsePositiveNumber(aiResponse.amount);
  const new_price = parsePositiveNumber(aiResponse.new_price);

  // Hard upper bounds prevent malformed/compromised AI responses
  // from creating unrealistic inventory or financial records.
  const MAX_QTY = 100000;
  const MAX_MONEY = 100000000;

  if (qty !== null && qty > MAX_QTY) {
    return "The requested quantity is too large.";
  }

  if (amount !== null && amount > MAX_MONEY) {
    return "The requested amount is too large.";
  }

  if (new_price !== null && new_price > MAX_MONEY) {
    return "The requested price is too large.";
  }

  try {
    switch (intent) {
      
      // ==========================================
      // DATABASE WRITE ACTIONS
      // ==========================================
      
      case 'inventory.add':
        if (!product) {
          return "Which product are you adding?";
        }

        if (!qty) {
          return `How many ${product} do you want to add?`;
        }

        if (qty > 100000) {
          return "That quantity is too large.";
        }
        
        const allInventoryItems = await database
          .get('inventory_items')
          .query()
          .fetch();

        const normalizedProduct = String(product).trim().toLowerCase();

        const inventory = allInventoryItems.filter(item =>
          String(item.productName || '').toLowerCase().includes(normalizedProduct)
        );

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
        if (qty > MAX_QTY) return "That quantity is too large.";

        const allSaleItems = await database.get('inventory_items').query().fetch();
        const soldItem = allSaleItems.find(i => 
          i.productName.toLowerCase().includes(product.toLowerCase())
        );

        if (!soldItem) return `Product "${product}" not found in your inventory.`;
              
        if (soldItem.quantity < qty) {
          return `Not enough stock. You only have ${soldItem.quantity} ${soldItem.productName} left.`;
        }

        const sellingPrice = Number(soldItem.sellingPrice);

        if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
          return "This product has an invalid selling price.";
        }

        const totalSaleValue = sellingPrice * qty;

        if (!Number.isFinite(totalSaleValue) || totalSaleValue > MAX_MONEY) {
          return "The sale amount is too large.";
        }

        // Only trust an EXPLICIT signal for payment method: either the
        // shopkeeper said "cash"/"udhaar" outright (payment_type), or they
        // named a customer (which only makes sense for Khata). If NEITHER
        // is present, don't silently default to Cash - that's how real
        // money quietly ends up in the wrong bucket. Ask instead.
        let resolvedPaymentType = null;
        if (payment_type === 'CASH' || payment_type === 'KHATA') {
          resolvedPaymentType = payment_type;
        } else if (customer_name) {
          resolvedPaymentType = 'KHATA';
        }

        if (!resolvedPaymentType) {
          return {
            needsConfirmation: true,
            message: `Cash or Khata for ${qty} ${soldItem.productName} (₹${totalSaleValue})?`,
            pendingSale: {
              itemId: soldItem.id,
              qty,
              totalSaleValue,
              customer_name: customer_name || null,
            },
          };
        }

        return await commitSale(soldItem, qty, totalSaleValue, resolvedPaymentType, customer_name, now);

      case 'khata.credit':
        // 🚀 FIX: Support fallback if Python parser mapped the money to 'new_price' or 'qty' due to the ₹ symbol
        const paymentAmount = amount ?? new_price ?? qty;

        if (!customer_name || !paymentAmount) {
          return "Need a customer name and an amount.";
        }

        if (!Number.isFinite(paymentAmount) || paymentAmount <= 0 || paymentAmount > MAX_MONEY) {
          return "Please provide a valid payment amount.";
        }

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
        if (!product || !new_price) {
          return "Please specify the product and the new price.";
        }

        if (!Number.isFinite(new_price) || new_price <= 0 || new_price > MAX_MONEY) {
          return "Please provide a valid price.";
        }
        
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
        if (!customer_name) {
          return "Please specify the customer name for the new Khata.";
        }

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
        
        const allEntries = await database
          .get('ledger_entries')
          .query()
          .fetch();

        const normalizedCustomer = String(customer_name)
          .trim()
          .toLowerCase();

        const entries = allEntries.filter(entry =>
          String(entry.customerId || '')
            .toLowerCase()
            .includes(normalizedCustomer)
        );
          
        if (entries.length === 0) return `I couldn't find any Khata records for ${customer_name}.`;
        
        let balance = 0;
        entries.forEach(e => {
          const entryAmount = Number(e.amount);

          if (!Number.isFinite(entryAmount)) {
            return;
          }

          if (e.entryType === 'CREDIT') balance += entryAmount;
          if (e.entryType === 'PAYMENT') balance -= entryAmount;
        });
        
        if (balance > 0) return `${customer_name} currently owes you ₹${balance.toLocaleString('en-IN')}.`;
        if (balance < 0) return `You hold an advance of ₹${Math.abs(balance).toLocaleString('en-IN')} for ${customer_name}.`;
        return `${customer_name}'s account is completely settled (₹0 balance).`;

      case 'query.inventory':
        if (!product) return "Which product are you looking for?";
        
        const allStockItems = await database
          .get('inventory_items')
          .query()
          .fetch();

        const normalizedProductName = String(product)
          .trim()
          .toLowerCase();

        const stock = allStockItems.filter(item =>
          String(item.productName || '')
            .toLowerCase()
            .includes(normalizedProductName)
        );
          
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
      
    }
  } catch (error) {
    console.error("Action Execution Error:", error);
    return "Database error while trying to save.";
  }
};