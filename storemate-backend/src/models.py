from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
import uuid
from datetime import datetime
from src.database import Base
from datetime import datetime
from sqlalchemy import Float 

# 1. The Store Table
class Store(Base):
    __tablename__ = "stores"

    # We use UUIDs (unique strings) instead of 1, 2, 3 so data is safe and offline-sync friendly
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    tier = Column(String, default="T3") # T1, T2, T3 depending on city size
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)

# 2. The User Table
class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    phone_number = Column(String, unique=True, index=True, nullable=False)
    role = Column(String, default="ADMIN") # ADMIN or STAFF
    store_id = Column(String, ForeignKey("stores.id")) # Links the user to their specific store
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="ACTIVE")


# --- LEDGER MODEL ---
class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    # We use String for the ID because the mobile phone generates the UUID while offline
    id = Column(String, primary_key=True)
    customer_id = Column(String, index=True, nullable=False)
    amount = Column(Float, nullable=False)
    entry_type = Column(String, nullable=False) # 'CREDIT_GIVEN' or 'PAYMENT_RECEIVED'
    timestamp = Column(DateTime, nullable=False) # The exact time the offline action happened
    
    # We also track when the server actually received it
    server_created_at = Column(DateTime, default=datetime.utcnow)