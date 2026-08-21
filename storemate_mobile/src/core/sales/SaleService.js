/**
 * COUNTR Phase 4B - Shared Sale Service
 *
 * Single database transaction for POS and voice/AI sales.
 * Business validation may happen before this service, but the
 * actual sale + stock deduction + optional Khata entry is committed
 * here so POS and IntentHandler cannot drift into two implementations.
 */

const MAX_MONEY = 100000000;

const safeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const cleanCustomerName = value =>
  typeof value === 'string' ? value.trim().slice(0, 100) : '';

/**
 * Creates one atomic sale transaction.
 *
 * items: [{ record, quantity }]
 * finalAmount: amount that should be recorded (already discounted if POS applied a discount)
 */
export const createSaleTransaction = async ({
  database,
  ownerId,
  items,
  finalAmount,
  paymentType,
  customerName = '',
  customerPhone = '',
  now = Date.now(),
} = {}) => {
  if (!database) throw new Error('Database is required.');
  if (!ownerId) throw new Error('No active account found.');
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Sale requires at least one item.');
  }
  if (paymentType !== 'CASH' && paymentType !== 'KHATA') {
    throw new Error('Invalid payment method.');
  }

  const amount = Number(finalAmount);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_MONEY) {
    throw new Error('Invalid sale amount.');
  }

  const customer = cleanCustomerName(customerName);
  if (paymentType === 'KHATA' && !customer) {
    throw new Error("Please also say the customer's name for Khata sales.");
  }

  const normalizedItems = items.map((entry, index) => {
    const record = entry?.record;
    const quantity = Number(entry?.quantity);

    if (!record || !record.id) {
      throw new Error(`Sale item ${index + 1} is invalid.`);
    }
    if (record.ownerId !== ownerId) {
      throw new Error('Product does not belong to the active account.');
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Invalid quantity for ${record.productName || 'product'}.`);
    }

    const stock = safeNumber(record.quantity);
    if (stock < quantity) {
      throw new Error(
        `Not enough stock. Only ${stock} ${record.productName || 'product'} available.`
      );
    }

    return { record, quantity };
  });

  await database.write(async () => {
    await database.get('sales_transactions').create(transaction => {
      transaction.ownerId = ownerId;
      transaction.totalAmount = amount;
      transaction.paymentType = paymentType;
      transaction.isSynced = false;
      transaction.createdAt = now;
    });

    for (const { record, quantity } of normalizedItems) {
      await record.update(item => {
        if (item.ownerId !== ownerId) {
          throw new Error('Product does not belong to the active account.');
        }

        const currentQuantity = safeNumber(item.quantity);
        if (currentQuantity < quantity) {
          throw new Error(
            `Not enough stock. Only ${currentQuantity} ${item.productName || 'product'} available.`
          );
        }

        item.quantity = currentQuantity - quantity;
        item.isSynced = false;
        item.updatedAt = now;
      });
    }

    if (paymentType === 'KHATA') {
      await database.get('ledger_entries').create(entry => {
        entry.ownerId = ownerId;
        entry.customerId = customer;
        entry.amount = amount;
        entry.entryType = 'CREDIT';
        entry.isSynced = false;
        entry.createdAt = now;

        if (typeof entry.customerPhone !== 'undefined') {
          entry.customerPhone = String(customerPhone || '').slice(0, 30);
        }
      });
    }
  });

  return {
    amount,
    paymentType,
    customerName: customer || null,
    itemCount: normalizedItems.length,
    items: normalizedItems.map(({ record, quantity }) => ({
      id: record.id,
      productName: record.productName,
      quantity,
    })),
  };
};

export default createSaleTransaction;
