import { database } from '../database';
import { Q } from '@nozbe/watermelondb';
import { requireCurrentUserId } from '../auth/localUser';
import TelemetryService from '../../services/TelemetryService';
import { createSaleTransaction } from '../sales/SaleService';
import { normalizeUnit, convertQuantity, canConvertUnit, unitLabel, formatQuantity } from './UnitConversion';

const MAX_QTY = 100000;
const MAX_MONEY = 100000000;

const trackIntentSuccess = (intent, payload = {}) => { try { TelemetryService.trackEvent('voice_action_success', 'voice', { intent, ...payload }); } catch (error) { console.log('Telemetry success error:', error?.message || error); } };
const trackIntentFailure = (intent, reason, payload = {}) => { try { TelemetryService.trackEvent('voice_action_failed', 'voice', { intent, reason: String(reason || 'Unknown error').slice(0, 300), ...payload }); } catch (error) { console.log('Telemetry failure error:', error?.message || error); } };

const cleanText = (value, maxLength = 150) => typeof value !== 'string' ? '' : value.replace(/[\u0000-\u001F\u007F]/g, '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
const parsePositiveNumber = value => { if (value === null || value === undefined || value === '') return null; const number = Number(value); return (!Number.isFinite(number) || number <= 0) ? null : number; };
const safeNumber = (value, fallback = 0) => { const number = Number(value); return Number.isFinite(number) ? number : fallback; };

const getStartOfToday = () => { const date = new Date(); date.setHours(0, 0, 0, 0); return date.getTime(); };
const getStartOfTomorrow = () => { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + 1); return date.getTime(); };
const isTodayTimestamp = timestamp => { const value = Number(timestamp); return !Number.isFinite(value) ? false : (value >= getStartOfToday() && value < getStartOfTomorrow()); };

const normalizeProductName = value => cleanText(value, 150).toLowerCase().replace(/[^a-z0-9\u0900-\u097F\s.-]/gi, '').replace(/\s+/g, ' ').trim();

const PRODUCT_ALIAS_GROUPS = [
  { canonical: 'parle g', aliases: ['parle g', 'parle ji', 'parle jee', 'parle gee', 'parle gi', 'g biscuit', 'पारले जी', 'पार्ले जी'] },
  { canonical: 'rice', aliases: ['rice', 'chawal', 'chaawal', 'चावल'] },
  { canonical: 'sugar', aliases: ['sugar', 'chini', 'cheeni', 'चीनी', 'शक्कर'] },
  { canonical: 'biscuit', aliases: ['biscuit', 'biscuits', 'biskit', 'बिस्किट', 'बिस्कुट'] },
  { canonical: 'tooth brush', aliases: ['toothbrush', 'tooth brush', 'ब्रश', 'टूथब्रश', 'टूथ ब्रश'] },
];

const normalizeVoiceProduct = value => cleanText(value, 150).toLowerCase().replace(/[\/,]+/g, ' ').replace(/\s+/g, ' ').trim();
const canonicalVoiceProduct = value => {
  const normalized = normalizeVoiceProduct(value); if (!normalized) return '';
  for (const group of PRODUCT_ALIAS_GROUPS) { if (normalized === normalizeVoiceProduct(group.canonical) || group.aliases.some(alias => normalizeVoiceProduct(alias) === normalized)) return group.canonical; }
  return normalized;
};

const productAliasMatches = (requested, stored) => {
  const requestText = normalizeVoiceProduct(requested), storedText = normalizeVoiceProduct(stored);
  if (!requestText || !storedText) return false;
  if (requestText === storedText || requestText.includes(storedText) || storedText.includes(requestText)) return true;
  const requestCanonical = canonicalVoiceProduct(requestText), storedCanonical = canonicalVoiceProduct(storedText);
  if (requestCanonical === storedCanonical) return true;
  return PRODUCT_ALIAS_GROUPS.some(group => { if (storedCanonical !== group.canonical) return false; return group.aliases.some(alias => requestText.includes(normalizeVoiceProduct(alias))); });
};

const findInventoryItem = async (product, ownerId, options = {}) => {
  if (!product || !ownerId) return null;
  const normalizedProduct = normalizeProductName(product); if (!normalizedProduct) return null;
  const priceHint = Number.isFinite(Number(options?.priceHint)) && Number(options?.priceHint) > 0 ? Number(options.priceHint) : null;
  const requestedUnit = normalizeUnit(options?.unit);
  const allItems = await database.get('inventory_items').query(Q.where('owner_id', ownerId)).fetch();
  const productCandidates = allItems.filter(item => productAliasMatches(normalizedProduct, item.productName));
  if (!productCandidates.length) return null;

  if (priceHint !== null) {
    const exactPrice = productCandidates.filter(item => Math.abs(safeNumber(item.sellingPrice) - priceHint) < 0.000001);
    if (!exactPrice.length) return null;
    if (requestedUnit) { const unitMatch = exactPrice.find(item => getStoredUnit(item) === requestedUnit); if (unitMatch) return unitMatch; }
    return exactPrice[0];
  }

  if (requestedUnit) {
    const unitMatch = productCandidates.find(item => { const stored = getStoredUnit(item); return (stored === requestedUnit || (stored && canConvertUnit(requestedUnit, stored))); });
    if (unitMatch) return unitMatch;
  }

  const exact = productCandidates.find(item => normalizeProductName(item.productName) === normalizedProduct);
  if (exact) return exact;

  const requestedWords = normalizedProduct.split(' ').filter(word => word.length >= 2);
  const wordMatch = productCandidates.find(item => { const itemName = normalizeProductName(item.productName); return requestedWords.every(word => itemName.includes(word)); });
  return wordMatch || productCandidates[0] || null;
};

const getStoredUnit = item => {
  if (!item) return null;
  for (const value of [item.unit, item.unitType, item.stockUnit]) { const normalized = normalizeUnit(value); if (normalized) return normalized; }
  return null;
};

const resolveQuantityForInventory = (requestedQty, requestedUnit, item) => {
  const qty = Number(requestedQty);
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, message: 'Invalid quantity.' };
  if (qty > MAX_QTY) return { ok: false, message: 'The requested quantity is too large.' };
  
  const storedUnit = getStoredUnit(item);
  const normalizedRequested = normalizeUnit(requestedUnit);

  if (!normalizedRequested) return { ok: true, quantity: qty, originalQuantity: qty, storedUnit, requestedUnit: null, converted: false };
  if (!storedUnit) return { ok: true, quantity: qty, originalQuantity: qty, storedUnit: normalizedRequested, requestedUnit: normalizedRequested, converted: false };
  if (storedUnit === normalizedRequested) return { ok: true, quantity: qty, originalQuantity: qty, storedUnit, requestedUnit: normalizedRequested, converted: false };

  if (canConvertUnit(normalizedRequested, storedUnit)) {
    const converted = convertQuantity(qty, normalizedRequested, storedUnit);
    if (converted !== null && Number.isFinite(converted) && converted > 0) return { ok: true, quantity: converted, originalQuantity: qty, storedUnit, requestedUnit: normalizedRequested, converted: true };
  }
  return { ok: false, message: `I can't safely convert ${formatQuantity(qty)} ${unitLabel(normalizedRequested)} to ${unitLabel(storedUnit)} for ${item.productName}.`, storedUnit, requestedUnit: normalizedRequested };
};

async function commitSale(soldItem, requestedQty, totalSaleValue, paymentType, customerName, now, ownerId, requestedUnit = null, priceHint = null) {
  if (!soldItem) return 'Product could not be found.';
  if (!ownerId) return 'No active account found.';
  if (soldItem.ownerId !== ownerId) return 'Product does not belong to the active account.';

  const quantityResolution = resolveQuantityForInventory(requestedQty, requestedUnit, soldItem);
  if (!quantityResolution.ok) return quantityResolution.message;
  
  const quantityToSell = quantityResolution.quantity;
  const storedUnit = quantityResolution.storedUnit || quantityResolution.requestedUnit || null;
  const currentStock = safeNumber(soldItem.quantity);
  if (currentStock < quantityToSell) return `Not enough stock. You only have ${formatQuantity(currentStock)} ${unitLabel(storedUnit)} ${soldItem.productName} left.`;

  const finalAmount = Number(totalSaleValue);
  if (!Number.isFinite(finalAmount) || finalAmount < 0 || finalAmount > MAX_MONEY) return 'Invalid sale amount.';

  if (priceHint !== null && priceHint !== undefined) {
    const expectedPrice = Number(priceHint), actualPrice = safeNumber(soldItem.sellingPrice);
    if (Number.isFinite(expectedPrice) && Math.abs(actualPrice - expectedPrice) > 0.000001) return `I couldn't find the requested ₹${expectedPrice} price variant of ${soldItem.productName}.`;
  }

  if (paymentType !== 'CASH' && paymentType !== 'KHATA') return 'Invalid payment method.';
  const cleanCustomerName = customerName ? cleanText(customerName, 100) : '';
  if (paymentType === 'KHATA' && !cleanCustomerName) return "Please also say the customer's name for Khata sales.";

  await createSaleTransaction({ database, ownerId, items: [{ record: soldItem, quantity: quantityToSell }], finalAmount, paymentType, customerName: cleanCustomerName, now });

  // Update the latest ledger entry description with item details for Khata matching
  if (paymentType === 'KHATA') {
    const itemDesc = `${formatQuantity(quantityToSell)} ${unitLabel(storedUnit)} ${soldItem.productName}`;
    const entries = await database.get('ledger_entries').query(Q.where('owner_id', ownerId), Q.where('customer_id', cleanCustomerName), Q.sortBy('created_at', Q.desc), Q.take(1)).fetch();
    if (entries.length > 0) {
      await database.write(async () => {
        await entries[0].update(entry => { entry.description = itemDesc; });
      });
    }
  }

  const quantityMessage = quantityResolution.converted ? `${formatQuantity(quantityResolution.originalQuantity)} ${unitLabel(quantityResolution.requestedUnit)} (${formatQuantity(quantityToSell)} ${unitLabel(storedUnit)})` : `${formatQuantity(quantityToSell)} ${unitLabel(storedUnit)}`;
  if (paymentType === 'KHATA') return `Billed ₹${finalAmount} to ${cleanCustomerName}'s Khata for ${quantityMessage} ${soldItem.productName}.`;
  return `Cash sale recorded: ₹${finalAmount} for ${quantityMessage} ${soldItem.productName}.`;
}

export const confirmPendingSale = async (pendingSale, chosenPaymentType) => {
  if (!pendingSale || (chosenPaymentType !== 'CASH' && chosenPaymentType !== 'KHATA')) return 'Something went wrong confirming that sale.';
  try {
    const ownerId = await requireCurrentUserId();
    if (!ownerId) return 'No active account found.';
    if (!pendingSale.itemId) return 'Product information is missing.';

    const soldItem = await database.get('inventory_items').find(pendingSale.itemId);
    if (soldItem.ownerId !== ownerId) return 'Product does not belong to the active account.';

    const pendingQty = Number(pendingSale.qty);
    if (!Number.isFinite(pendingQty) || pendingQty <= 0) return 'Invalid quantity.';

    const requestedUnit = normalizeUnit(pendingSale.unit);
    const quantityResolution = resolveQuantityForInventory(pendingQty, requestedUnit, soldItem);
    if (!quantityResolution.ok) return quantityResolution.message;

    const quantityToSell = quantityResolution.quantity, currentStock = safeNumber(soldItem.quantity);
    if (currentStock < quantityToSell) return `Not enough stock. You only have ${formatQuantity(currentStock)} ${unitLabel(quantityResolution.storedUnit)} ${soldItem.productName} left.`;

    const totalSaleValue = Number(pendingSale.totalSaleValue);
    if (!Number.isFinite(totalSaleValue) || totalSaleValue < 0 || totalSaleValue > MAX_MONEY) return 'Invalid sale amount.';

    const result = await commitSale(soldItem, pendingQty, totalSaleValue, chosenPaymentType, pendingSale.customer_name, Date.now(), ownerId, requestedUnit, pendingSale.price_hint);
    trackIntentSuccess('sale.confirm', { product: soldItem.productName, requested_qty: pendingQty, requested_unit: requestedUnit || null, stored_qty: quantityToSell, stored_unit: quantityResolution.storedUnit || null, amount: totalSaleValue, payment_type: chosenPaymentType, customer_name: pendingSale.customer_name || null });
    return result;
  } catch (error) {
    console.error('Confirm Sale Error:', error);
    trackIntentFailure('sale.confirm', error?.message || 'Database error while trying to save.');
    try { TelemetryService.logError('voice_sale_confirm', error?.message || 'Database error while trying to save.', error?.stack); } catch (_) {}
    return error?.message || 'Database error while trying to save.';
  }
};

const getTodayKhataSummary = async ownerId => {
  if (!ownerId) return { totalCredit: 0, totalPayment: 0, uniqueCustomers: 0, creditEntries: 0, paymentEntries: 0 };
  const allEntries = await database.get('ledger_entries').query(Q.where('owner_id', ownerId)).fetch();
  const todayEntries = allEntries.filter(entry => isTodayTimestamp(entry.createdAt));

  let totalCredit = 0, totalPayment = 0, creditEntries = 0, paymentEntries = 0; const customers = new Set();
  todayEntries.forEach(entry => {
    const value = Number(entry.amount); if (!Number.isFinite(value) || value <= 0) return;
    const entryType = String(entry.entryType || '').trim().toUpperCase(), customer = String(entry.customerId || '').trim().toLowerCase();
    if (entryType === 'CREDIT') { totalCredit += value; creditEntries += 1; if (customer) customers.add(customer); }
    if (entryType === 'PAYMENT') { totalPayment += value; paymentEntries += 1; }
  });
  return { totalCredit, totalPayment, uniqueCustomers: customers.size, creditEntries, paymentEntries };
};

export const executeAIAction = async (aiResponse) => {
  const now = Date.now();
  if (!aiResponse || typeof aiResponse !== 'object' || Array.isArray(aiResponse)) return 'Invalid voice command.';

  const allowedIntents = new Set(['inventory.create', 'inventory.add', 'sale.create', 'khata.credit', 'inventory.update_price', 'customer.create', 'query.sales', 'query.khata', 'query.khata.summary', 'query.inventory', 'ui.open_billing', 'ui.show_low_stock', 'ui.show_sales', 'pos.add_item', 'pos.apply_discount', 'pos.checkout', 'unknown']);
  const intent = typeof aiResponse.intent === 'string' ? aiResponse.intent.trim().toLowerCase() : 'unknown';

  if (!allowedIntents.has(intent)) {
    console.warn('Blocked unknown AI intent:', intent); trackIntentFailure(intent, 'Unknown or blocked intent');
    return "I couldn't understand that command.";
  }

  const product = cleanText(aiResponse.product, 150), customer_name = cleanText(aiResponse.customer_name, 100), reason = cleanText(aiResponse.reason, 250), time_period = cleanText(aiResponse.time_period, 50).toLowerCase();
  const unit = normalizeUnit(aiResponse.unit);
  const payment_type = (aiResponse.payment_type === 'CASH' || aiResponse.payment_type === 'KHATA') ? aiResponse.payment_type : null;
  const qty = parsePositiveNumber(aiResponse.qty), amount = parsePositiveNumber(aiResponse.amount), new_price = parsePositiveNumber(aiResponse.new_price), price_hint = parsePositiveNumber(aiResponse.price_hint), discount_percent = parsePositiveNumber(aiResponse.discount_percent);

  if (discount_percent !== null && discount_percent > 100) return 'Discount cannot be more than 100%.';
  if (qty !== null && qty > MAX_QTY) return 'The requested quantity is too large.';
  if (amount !== null && amount > MAX_MONEY) return 'The requested amount is too large.';
  if (new_price !== null && new_price > MAX_MONEY) return 'The requested price is too large.';

  try {
    const ownerId = await requireCurrentUserId();
    if (!ownerId) return 'No active account found.';

    switch (intent) {
      case 'inventory.create': {
        if (!product) return 'Please specify the product name.';
        const existing = await findInventoryItem(product, ownerId);
        if (existing) return `${existing.productName} already exists in your inventory.`;

        const startingQuantity = qty !== null ? qty : 0, startingPrice = new_price !== null ? new_price : 0;
        await database.write(async () => {
          await database.get('inventory_items').create(item => { item.ownerId = ownerId; item.productName = product; item.quantity = startingQuantity; item.sellingPrice = startingPrice; item.isSynced = false; item.createdAt = now; item.updatedAt = now; if (unit && typeof item.unit !== 'undefined') item.unit = unit; if (aiResponse.barcode && typeof item.barcode !== 'undefined') item.barcode = cleanText(aiResponse.barcode, 100); if (aiResponse.category && typeof item.category !== 'undefined') item.category = cleanText(aiResponse.category, 100); });
        });
        trackIntentSuccess('inventory.create', { product, qty: startingQuantity, unit: unit || null, price: startingPrice });

        if (startingQuantity > 0 && startingPrice > 0) return `New product ${product} created with ${formatQuantity(startingQuantity)} ${unitLabel(unit)} at ₹${startingPrice}.`;
        if (startingQuantity > 0) return `New product ${product} created with ${formatQuantity(startingQuantity)} ${unitLabel(unit)} stock.`;
        if (startingPrice > 0) return `New product ${product} created at ₹${startingPrice}.`;
        return `New product ${product} created.`;
      }

      case 'inventory.add': {
        if (!product) return 'Which product are you adding?';
        if (!qty) return `How many ${product} do you want to add?`;

        const item = await findInventoryItem(product, ownerId);
        if (!item) return `I couldn't find ${product} in your inventory.`;
        if (item.ownerId !== ownerId) return 'Product does not belong to the active account.';

        const quantityResolution = resolveQuantityForInventory(qty, unit, item);
        if (!quantityResolution.ok) return quantityResolution.message;

        const quantityToAdd = quantityResolution.quantity, storedUnit = quantityResolution.storedUnit || quantityResolution.requestedUnit || null;

        await database.write(async () => {
          await item.update(current => { if (current.ownerId !== ownerId) throw new Error('Product does not belong to the active account.'); const currentQuantity = safeNumber(current.quantity); current.quantity = currentQuantity + quantityToAdd; if (!getStoredUnit(current) && quantityResolution.requestedUnit && typeof current.unit !== 'undefined') current.unit = quantityResolution.requestedUnit; current.isSynced = false; current.updatedAt = now; });
        });

        const updatedItem = await database.get('inventory_items').find(item.id), finalQuantity = safeNumber(updatedItem.quantity);
        trackIntentSuccess('inventory.add', { product: updatedItem.productName, requested_qty: qty, requested_unit: unit || null, stored_qty: quantityToAdd, stored_unit: storedUnit || null, converted: quantityResolution.converted || false });

        if (quantityResolution.converted) return `Added ${formatQuantity(qty)} ${unitLabel(unit)} ${updatedItem.productName}. That is ${formatQuantity(quantityToAdd)} ${unitLabel(storedUnit)}. You now have ${formatQuantity(finalQuantity)} ${unitLabel(storedUnit)} ${updatedItem.productName}.`;
        return `Added ${formatQuantity(qty)} ${unitLabel(unit || storedUnit)} ${updatedItem.productName}. You now have ${formatQuantity(finalQuantity)} ${unitLabel(storedUnit)}.`;
      }

      case 'sale.create': {
        if (!product && customer_name && (new_price || amount)) {
          const flatAmount = Number(new_price || amount);
          if (!Number.isFinite(flatAmount) || flatAmount <= 0 || flatAmount > MAX_MONEY) return 'Please provide a valid amount.';
          await database.write(async () => {
            await database.get('sales_transactions').create(transaction => { transaction.ownerId = ownerId; transaction.totalAmount = flatAmount; transaction.paymentType = 'KHATA'; transaction.isSynced = false; transaction.createdAt = now; });
            await database.get('ledger_entries').create(entry => { entry.ownerId = ownerId; entry.customerId = customer_name.trim(); entry.amount = flatAmount; entry.entryType = 'CREDIT'; entry.description = `Direct Udhaar ₹${flatAmount}`; entry.isSynced = false; entry.createdAt = now; });
          });
          trackIntentSuccess('khata.credit', { customer_name, amount: flatAmount });
          return `Added flat Udhaar of ₹${flatAmount} to ${customer_name}'s Khata.`;
        }

        if (!product) return 'Which product are you trying to sell?';
        if (!qty) return `How many ${product} are you selling?`;

        const soldItem = await findInventoryItem(product, ownerId, { priceHint: price_hint, unit });
        if (!soldItem) return price_hint !== null ? `I couldn't find a ₹${price_hint} price variant of ${product} in your inventory.` : `Product "${product}" not found in your inventory.`;
        if (soldItem.ownerId !== ownerId) return 'Product does not belong to the active account.';

        const quantityResolution = resolveQuantityForInventory(qty, unit, soldItem);
        if (!quantityResolution.ok) return quantityResolution.message;
        const quantityToSell = quantityResolution.quantity, storedUnit = quantityResolution.storedUnit || quantityResolution.requestedUnit || null;

        const currentStock = safeNumber(soldItem.quantity);
        if (currentStock < quantityToSell) return `Not enough stock. You only have ${formatQuantity(currentStock)} ${unitLabel(storedUnit)} ${soldItem.productName} left.`;

        const sellingPrice = safeNumber(soldItem.sellingPrice);
        if (sellingPrice < 0) return 'This product has an invalid selling price.';

        const totalSaleValue = sellingPrice * quantityToSell;
        if (!Number.isFinite(totalSaleValue) || totalSaleValue > MAX_MONEY) return 'The sale amount is too large.';

        let resolvedPaymentType = null;
        if (payment_type === 'CASH' || payment_type === 'KHATA') resolvedPaymentType = payment_type; else if (customer_name) resolvedPaymentType = 'KHATA';

        if (!resolvedPaymentType) {
          let quantityMessage;
          if (quantityResolution.converted) quantityMessage = `${formatQuantity(qty)} ${unitLabel(unit)} (${formatQuantity(quantityToSell)} ${unitLabel(storedUnit)})`;
          else quantityMessage = `${formatQuantity(quantityToSell)} ${unitLabel(storedUnit)}`;

          return { needsConfirmation: true, message: `Cash or Khata for ${quantityMessage} ${soldItem.productName} (₹${totalSaleValue})?`, pendingSale: { itemId: soldItem.id, qty, unit: unit || null, totalSaleValue, price_hint, customer_name: customer_name || null } };
        }

        const saleResult = await commitSale(soldItem, qty, totalSaleValue, resolvedPaymentType, customer_name, now, ownerId, unit, price_hint);
        trackIntentSuccess('sale.create', { product: soldItem.productName, requested_qty: qty, requested_unit: unit || null, stored_qty: quantityToSell, stored_unit: storedUnit || null, amount: totalSaleValue, price_hint, payment_type: resolvedPaymentType, customer_name: customer_name || null });
        return saleResult;
      }

      case 'khata.credit': {
        const paymentAmount = amount ?? new_price ?? qty;
        if (!customer_name || !paymentAmount) return 'I need the customer name and amount received.';
        if (!Number.isFinite(paymentAmount) || paymentAmount <= 0 || paymentAmount > MAX_MONEY) return 'Please provide a valid payment amount.';

        await database.write(async () => {
          await database.get('ledger_entries').create(entry => { entry.ownerId = ownerId; entry.customerId = customer_name.trim(); entry.amount = paymentAmount; entry.entryType = 'PAYMENT'; entry.description = 'Payment Received'; entry.isSynced = false; entry.createdAt = now; });
        });
        trackIntentSuccess('khata.credit', { customer_name, amount: paymentAmount, entry_type: 'PAYMENT' });
        return `Logged ₹${paymentAmount} payment received from ${customer_name}.`;
      }

      case 'inventory.update_price': {
        if (!product || !new_price) return 'Please specify the product and the new price.';
        const priceItem = await findInventoryItem(product, ownerId);
        if (!priceItem) return `Product "${product}" not found.`;
        if (priceItem.ownerId !== ownerId) return 'Product does not belong to the active account.';

        await database.write(async () => {
          await priceItem.update(item => { if (item.ownerId !== ownerId) throw new Error('Product does not belong to the active account.'); item.sellingPrice = new_price; item.isSynced = false; item.updatedAt = now; });
        });
        trackIntentSuccess('inventory.update_price', { product: priceItem.productName, new_price });
        return `Price of ${priceItem.productName} is now ₹${new_price}.`;
      }

      case 'customer.create': {
        if (!customer_name) return 'Please specify the customer name for the new Khata.';
        const cleanCustomerName = cleanText(customer_name, 100);
        if (cleanCustomerName.length < 2) return 'Please provide a valid customer name.';

        const existingEntries = await database.get('ledger_entries').query(Q.where('owner_id', ownerId)).fetch();
        const normalizedName = cleanCustomerName.toLowerCase();
        const alreadyExists = existingEntries.some(entry => String(entry.customerId || '').trim().toLowerCase() === normalizedName);
        if (alreadyExists) return `${cleanCustomerName}'s Khata already exists.`;

        await database.write(async () => {
          await database.get('ledger_entries').create(entry => { entry.ownerId = ownerId; entry.customerId = cleanCustomerName; entry.amount = 0; entry.entryType = 'CREDIT'; entry.description = 'Account Created'; entry.isSynced = false; entry.createdAt = now; });
        });
        trackIntentSuccess('customer.create', { customer_name: cleanCustomerName });
        return `New Khata account created for ${cleanCustomerName}.`;
      }

      case 'query.sales': {
        const today = getStartOfToday();
        const sales = await database.get('sales_transactions').query(Q.where('owner_id', ownerId), Q.where('created_at', Q.gte(today))).fetch();
        const totalSales = sales.reduce((sum, sale) => sum + safeNumber(sale.totalAmount), 0);
        return `You have made ₹${totalSales.toLocaleString('en-IN')} in sales today.`;
      }

      case 'query.khata':
      case 'query.khata.summary': {
        const normalizedPeriod = time_period.replace(/[\s_-]+/g, '');
        const summaryRequested = intent === 'query.khata.summary' || (!customer_name && (normalizedPeriod === 'today' || normalizedPeriod === 'aaj' || normalizedPeriod === 'day' || normalizedPeriod === 'todays'));

        if (summaryRequested) {
          const summary = await getTodayKhataSummary(ownerId);
          if (summary.totalCredit <= 0 && summary.totalPayment <= 0) return 'No Khata activity has been recorded today.';

          const creditText = `₹${summary.totalCredit.toLocaleString('en-IN')}`, paymentText = `₹${summary.totalPayment.toLocaleString('en-IN')}`;
          if (summary.totalCredit <= 0) return `You received ${paymentText} in Khata payments today.`;
          if (summary.totalPayment <= 0) return `${summary.uniqueCustomers} ${(summary.uniqueCustomers === 1 ? 'customer' : 'customers')} were given credit today totalling ${creditText}.`;
          return `${summary.uniqueCustomers} ${(summary.uniqueCustomers === 1 ? 'customer' : 'customers')} were given credit today totalling ${creditText}. You also received ${paymentText} in Khata payments today.`;
        }

        if (!customer_name) return "Which customer's balance do you want to check?";
        const allEntries = await database.get('ledger_entries').query(Q.where('owner_id', ownerId)).fetch();
        const normalizedCustomer = customer_name.trim().toLowerCase();
        const entries = allEntries.filter(entry => String(entry.customerId || '').trim().toLowerCase().includes(normalizedCustomer));
        if (entries.length === 0) return `I couldn't find any Khata records for ${customer_name}.`;

        let balance = 0;
        entries.forEach(entry => {
          const entryAmount = Number(entry.amount); if (!Number.isFinite(entryAmount)) return;
          const entryType = String(entry.entryType || '').trim().toUpperCase();
          if (entryType === 'CREDIT') balance += entryAmount;
          if (entryType === 'PAYMENT') balance -= entryAmount;
        });

        if (balance > 0) return `${customer_name} currently owes you ₹${balance.toLocaleString('en-IN')}.`;
        if (balance < 0) return `You hold an advance of ₹${Math.abs(balance).toLocaleString('en-IN')} for ${customer_name}.`;
        return `${customer_name}'s account is completely settled (₹0 balance).`;
      }

      case 'query.inventory': {
        if (!product) return 'Which product are you looking for?';
        const stockItem = await findInventoryItem(product, ownerId);
        if (!stockItem) return `You don't have any "${product}" in your inventory.`;
        if (stockItem.ownerId !== ownerId) return 'Product does not belong to the active account.';
        const storedUnit = getStoredUnit(stockItem), stock = safeNumber(stockItem.quantity);
        if (stock <= 0) return `${stockItem.productName} is currently out of stock!`;
        return `You have ${formatQuantity(stock)} ${unitLabel(storedUnit)} ${stockItem.productName} ready to sell.`;
      }

      case 'ui.open_billing': return 'Opening billing screen...';
      case 'ui.show_low_stock':
      case 'ui.show_sales': return 'Looking that up for you...';
      case 'pos.add_item':
      case 'pos.apply_discount':
      case 'pos.checkout': return "Please open 'New Sale' first to use cart commands.";
      case 'unknown':
      default: return reason || 'Please specify an action, product, and quantity.';
    }
  } catch (error) {
    console.error('Action Execution Error:', error); trackIntentFailure(intent, error?.message || 'Database error while trying to save.');
    try { TelemetryService.logError('voice_action', error?.message || 'Database error while trying to save.', error?.stack); } catch (_) {}
    return error?.message || 'Database error while trying to save.';
  }
};

export { findInventoryItem, getStoredUnit, resolveQuantityForInventory };