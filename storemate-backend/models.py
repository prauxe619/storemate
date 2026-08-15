from datetime import datetime

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
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

class LedgerEntry(db.Model):
    __tablename__ = 'ledger_entries'
    id = db.Column(db.String(255), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    customer_id = db.Column(db.String(255))
    amount = db.Column(db.Float)
    entry_type = db.Column(db.String(50))
    created_at = db.Column(db.BigInteger)

class SalesTransaction(db.Model):
    __tablename__ = 'sales_transactions'
    id = db.Column(db.String(255), primary_key=True)
    
    # 🚀 FIX: Add this line to link the transaction to the merchant
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True) 
    
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
    
    # 📍 Location & Telemetry Metadata
    last_ip = db.Column(db.String(45), nullable=True)
    city = db.Column(db.String(100), default='Unknown City', nullable=True)
    state = db.Column(db.String(100), default='Unknown State', nullable=True)
    country = db.Column(db.String(100), default='India', nullable=True)

    reset_otp = db.Column(db.String(6), nullable=True)
    reset_otp_expiry = db.Column(db.DateTime, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    role = db.Column(db.String(20), default='MERCHANT', nullable=False)

class AuditLog(db.Model):
    __tablename__ = 'audit_logs'
    __table_args__ = {'extend_existing': True} # Prevents Double-Registration Crashes
    
    id = db.Column(db.Integer, primary_key=True)
    
    # 👤 Who performed the action?
    admin_id = db.Column(db.Integer, nullable=True) 
    admin_email = db.Column(db.String(120), nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)
    
    # ⚡ What did they do?
    action = db.Column(db.String(100), nullable=False)
    
    # 🎯 Who/What was affected?
    target_type = db.Column(db.String(32), nullable=True) 
    target_id = db.Column(db.String(64), nullable=True) # String to support WatermelonDB IDs
    
    # 📝 Extra diagnostic data
    details = db.Column(db.JSON, nullable=True) 
    
    # 🕒 When did it happen?
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    

class Subscription(db.Model):
    __tablename__ = 'subscriptions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    plan_type = db.Column(db.String(20), default='FREE') # FREE, STARTER, PRO
    monthly_price = db.Column(db.Float, default=0.0)     # e.g. 0.0, 499.0, 999.0
    status = db.Column(db.String(20), default='ACTIVE')  # ACTIVE, EXPIRED, CANCELLED
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('subscription', uselist=False))

class Feedback(db.Model):
    __tablename__ = 'feedback'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    message = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default='NEW') # NEW, REVIEWED, RESOLVED
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationship to easily access user details
    user = db.relationship('User', backref=db.backref('feedbacks', lazy=True))