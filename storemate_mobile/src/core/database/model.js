import { Model } from '@nozbe/watermelondb';

export class LedgerEntry extends Model {
  static table = 'ledger_entries';
  
  get cloudId() { return this._getRaw('cloud_id'); }
  get customerId() { return this._getRaw('customer_id'); }
  get amount() { return this._getRaw('amount'); }
  get entryType() { return this._getRaw('entry_type'); }
  get isSynced() { return this._getRaw('is_synced'); }
  get createdAt() { return this._getRaw('created_at'); }
  get customerPhone() { return this._getRaw('customer_phone'); } // ✅ NEW GETTER

  set cloudId(value) { this._setRaw('cloud_id', value); }
  set customerId(value) { this._setRaw('customer_id', value); }
  set amount(value) { this._setRaw('amount', value); }
  set entryType(value) { this._setRaw('entry_type', value); }
  set isSynced(value) { this._setRaw('is_synced', value); }
  set createdAt(value) { this._setRaw('created_at', value); }
  set customerPhone(value) { this._setRaw('customer_phone', value); } // ✅ NEW SETTER
}

export class InventoryItem extends Model {
  static table = 'inventory_items';

  get barcode() { return this._getRaw('barcode'); } // ✅ NEW
  get productName() { return this._getRaw('product_name'); }
  get quantity() { return this._getRaw('quantity'); }
  get unit() { return this._getRaw('unit'); }
  get purchasePrice() { return this._getRaw('purchase_price'); }
  get sellingPrice() { return this._getRaw('selling_price'); }
  get isSynced() { return this._getRaw('is_synced'); }
  get updatedAt() { return this._getRaw('updated_at'); }

  set barcode(value) { this._setRaw('barcode', value); } // ✅ NEW
  set productName(value) { this._setRaw('product_name', value); }
  set quantity(value) { this._setRaw('quantity', value); }
  set unit(value) { this._setRaw('unit', value); }
  set purchasePrice(value) { this._setRaw('purchase_price', value); }
  set sellingPrice(value) { this._setRaw('selling_price', value); }
  set isSynced(value) { this._setRaw('is_synced', value); }
  set updatedAt(value) { this._setRaw('updated_at', value); }
}


export class SalesTransaction extends Model {
  static table = 'sales_transactions';

  get totalAmount() { return this._getRaw('total_amount'); }
  get paymentType() { return this._getRaw('payment_type'); }
  get createdAt() { return this._getRaw('created_at'); }
  get isSynced() { return this._getRaw('is_synced'); }

  set totalAmount(value) { this._setRaw('total_amount', value); }
  set paymentType(value) { this._setRaw('payment_type', value); }
  set createdAt(value) { this._setRaw('created_at', value); }
  set isSynced(value) { this._setRaw('is_synced', value); }
}