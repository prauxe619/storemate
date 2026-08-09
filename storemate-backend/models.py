from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class InventoryItem(db.Model):
    __tablename__ = 'inventory_items'
    id = db.Column(db.String(255), primary_key=True) # WatermelonDB ID
    barcode = db.Column(db.String(50))
    product_name = db.Column(db.String(255))
    quantity = db.Column(db.Integer)
    purchase_price = db.Column(db.Float)
    selling_price = db.Column(db.Float)
    updated_at = db.Column(db.BigInteger)

class LedgerEntry(db.Model):
    __tablename__ = 'ledger_entries'
    id = db.Column(db.String(255), primary_key=True)
    customer_id = db.Column(db.String(255))
    amount = db.Column(db.Float)
    entry_type = db.Column(db.String(50))
    created_at = db.Column(db.BigInteger)

class SalesTransaction(db.Model):
    __tablename__ = 'sales_transactions'
    id = db.Column(db.String(255), primary_key=True)
    total_amount = db.Column(db.Float)
    payment_type = db.Column(db.String(50))
    created_at = db.Column(db.BigInteger)

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    shop_name = db.Column(db.String(200), nullable=False)
    phone = db.Column(db.String(20), nullable=True)
    reset_otp = db.Column(db.String(6), nullable=True)
    reset_otp_expiry = db.Column(db.DateTime, nullable=True)
    is_active = db.Column(db.Boolean, default=True)