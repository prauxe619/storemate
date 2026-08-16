import { Model } from '@nozbe/watermelondb';


/*
 * ============================================================
 * LEDGER / KHATA
 * ============================================================
 */

export class LedgerEntry extends Model {
  static table = 'ledger_entries';


  // ==========================================================
  // GETTERS
  // ==========================================================

  get ownerId() {
    return this._getRaw('owner_id');
  }

  get cloudId() {
    return this._getRaw('cloud_id');
  }

  get customerId() {
    return this._getRaw('customer_id');
  }

  get amount() {
    return this._getRaw('amount');
  }

  get entryType() {
    return this._getRaw('entry_type');
  }

  get customerPhone() {
    return this._getRaw('customer_phone');
  }

  get note() {
    return this._getRaw('note');
  }

  get isSynced() {
    return this._getRaw('is_synced');
  }

  get createdAt() {
    return this._getRaw('created_at');
  }


  // ==========================================================
  // SETTERS
  // ==========================================================

  set ownerId(value) {
    this._setRaw('owner_id', value);
  }

  set cloudId(value) {
    this._setRaw('cloud_id', value);
  }

  set customerId(value) {
    this._setRaw('customer_id', value);
  }

  set amount(value) {
    this._setRaw('amount', value);
  }

  set entryType(value) {
    this._setRaw('entry_type', value);
  }

  set customerPhone(value) {
    this._setRaw('customer_phone', value);
  }

  set note(value) {
    this._setRaw('note', value);
  }

  set isSynced(value) {
    this._setRaw('is_synced', value);
  }

  set createdAt(value) {
    this._setRaw('created_at', value);
  }
}


/*
 * ============================================================
 * INVENTORY
 * ============================================================
 */

export class InventoryItem extends Model {
  static table = 'inventory_items';


  // ==========================================================
  // GETTERS
  // ==========================================================

  get ownerId() {
    return this._getRaw('owner_id');
  }

  get barcode() {
    return this._getRaw('barcode');
  }

  get productName() {
    return this._getRaw('product_name');
  }

  get quantity() {
    return this._getRaw('quantity');
  }

  get unit() {
    return this._getRaw('unit');
  }

  get purchasePrice() {
    return this._getRaw('purchase_price');
  }

  get sellingPrice() {
    return this._getRaw('selling_price');
  }

  get category() {
    return this._getRaw('category');
  }

  get imageUrl() {
    return this._getRaw('image_url');
  }

  get isSynced() {
    return this._getRaw('is_synced');
  }

  get createdAt() {
    return this._getRaw('created_at');
  }

  get updatedAt() {
    return this._getRaw('updated_at');
  }


  // ==========================================================
  // SETTERS
  // ==========================================================

  set ownerId(value) {
    this._setRaw('owner_id', value);
  }

  set barcode(value) {
    this._setRaw('barcode', value);
  }

  set productName(value) {
    this._setRaw('product_name', value);
  }

  set quantity(value) {
    this._setRaw('quantity', value);
  }

  set unit(value) {
    this._setRaw('unit', value);
  }

  set purchasePrice(value) {
    this._setRaw('purchase_price', value);
  }

  set sellingPrice(value) {
    this._setRaw('selling_price', value);
  }

  set category(value) {
    this._setRaw('category', value);
  }

  set imageUrl(value) {
    this._setRaw('image_url', value);
  }

  set isSynced(value) {
    this._setRaw('is_synced', value);
  }

  set createdAt(value) {
    this._setRaw('created_at', value);
  }

  set updatedAt(value) {
    this._setRaw('updated_at', value);
  }
}


/*
 * ============================================================
 * SALES TRANSACTION
 * ============================================================
 */

export class SalesTransaction extends Model {
  static table = 'sales_transactions';


  // ==========================================================
  // GETTERS
  // ==========================================================

  get ownerId() {
    return this._getRaw('owner_id');
  }

  get totalAmount() {
    return this._getRaw('total_amount');
  }

  get paymentType() {
    return this._getRaw('payment_type');
  }

  get createdAt() {
    return this._getRaw('created_at');
  }

  get isSynced() {
    return this._getRaw('is_synced');
  }


  // ==========================================================
  // SETTERS
  // ==========================================================

  set ownerId(value) {
    this._setRaw('owner_id', value);
  }

  set totalAmount(value) {
    this._setRaw('total_amount', value);
  }

  set paymentType(value) {
    this._setRaw('payment_type', value);
  }

  set createdAt(value) {
    this._setRaw('created_at', value);
  }

  set isSynced(value) {
    this._setRaw('is_synced', value);
  }
}