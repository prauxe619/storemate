from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

# ============================================================
# INVENTORY
# ============================================================

class InventoryItem(db.Model):
    __tablename__ = 'inventory_items'

    id = db.Column(db.String(255), primary_key=True)
    
    # Store/account owner
    owner_id = db.Column(db.String(255), nullable=True, index=True)
    
    product_name = db.Column(db.String(255), nullable=False)
    barcode = db.Column(db.String(100), nullable=True, index=True)
    quantity = db.Column(db.Float, nullable=False, default=0.0)
    
    # Examples: PCS, KG, G, LITRE, ML, BOX, PACK, etc.
    unit = db.Column(db.String(30), nullable=True, default='PCS')
    purchase_price = db.Column(db.Float, nullable=True, default=0.0)
    selling_price = db.Column(db.Float, nullable=False, default=0.0)
    category = db.Column(db.String(100), nullable=True)
    image_url = db.Column(db.String(1000), nullable=True)
    
    # Sync and Audit
    is_synced = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.BigInteger, nullable=True)
    updated_at = db.Column(db.BigInteger, nullable=False)


# ============================================================
# KHATA / LEDGER
# ============================================================

class LedgerEntry(db.Model):
    __tablename__ = 'ledger_entries'

    id = db.Column(db.String(255), primary_key=True)
    owner_id = db.Column(db.String(255), nullable=True, index=True)
    customer_id = db.Column(db.String(255), nullable=False)
    
    amount = db.Column(db.Float, nullable=False, default=0.0)
    entry_type = db.Column(db.String(50), nullable=False)
    customer_phone = db.Column(db.String(50), nullable=True)
    note = db.Column(db.Text, nullable=True)
    
    is_synced = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.BigInteger, nullable=False)


# ============================================================
# SALES TRANSACTIONS
# ============================================================

class SalesTransaction(db.Model):
    __tablename__ = 'sales_transactions'

    id = db.Column(db.String(255), primary_key=True)
    owner_id = db.Column(db.String(255), nullable=True, index=True)
    
    total_amount = db.Column(db.Float, nullable=False, default=0.0)
    payment_type = db.Column(db.String(50), nullable=False)
    
    is_synced = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.BigInteger, nullable=False)


# ============================================================
# USERS / MERCHANTS
# ============================================================

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    
    # Profile
    shop_name = db.Column(db.String(200), nullable=False)
    phone = db.Column(db.String(20), nullable=True)
    address = db.Column(db.String(500), nullable=True)
    upi_id = db.Column(db.String(100), nullable=True)
    
    # Network / Location
    last_ip = db.Column(db.String(45), nullable=True)
    city = db.Column(db.String(100), default='Unknown City', nullable=True)
    state = db.Column(db.String(100), default='Unknown State', nullable=True)
    country = db.Column(db.String(100), default='India', nullable=True)
    
    # Password Reset
    reset_otp = db.Column(db.String(6), nullable=True)
    reset_otp_expiry = db.Column(db.DateTime, nullable=True)
    
    # Account Status
    is_active = db.Column(db.Boolean, default=True)
    role = db.Column(db.String(20), default='MERCHANT', nullable=False)


# ============================================================
# ADMIN AUDIT LOG
# ============================================================

class AuditLog(db.Model):
    __tablename__ = 'audit_logs'
    __table_args__ = {'extend_existing': True}

    id = db.Column(db.Integer, primary_key=True)
    admin_id = db.Column(db.Integer, nullable=True)
    admin_email = db.Column(db.String(120), nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)
    
    action = db.Column(db.String(100), nullable=False)
    target_type = db.Column(db.String(32), nullable=True)
    target_id = db.Column(db.String(64), nullable=True)
    details = db.Column(db.JSON, nullable=True)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


# ============================================================
# SUBSCRIPTION
# ============================================================

class Subscription(db.Model):
    __tablename__ = 'subscriptions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    plan_type = db.Column(db.String(20), default='FREE')
    monthly_price = db.Column(db.Float, default=0.0)
    status = db.Column(db.String(20), default='ACTIVE')
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    user = db.relationship('User', backref=db.backref('subscription', uselist=False))


# ============================================================
# FEEDBACK
# ============================================================

class Feedback(db.Model):
    __tablename__ = 'feedback'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    message = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default='NEW')
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    user = db.relationship('User', backref=db.backref('feedbacks', lazy=True))