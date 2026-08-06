from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from typing import List, Dict, Any
from typing import Dict, Any

# --- STORE SCHEMAS ---
class StoreCreate(BaseModel):
    name: str
    tier: Optional[str] = "T3"

class StoreResponse(BaseModel):
    id: str
    name: str
    tier: str
    is_active: bool
    created_at: datetime

    class Config:
        orm_mode = True

# --- USER SCHEMAS ---
class UserCreate(BaseModel):
    phone_number: str
    role: Optional[str] = "ADMIN"

class UserResponse(BaseModel):
    id: str
    phone_number: str
    role: str
    store_id: str
    status: str
    created_at: datetime

    class Config:
        orm_mode = True

# --- AUTH SCHEMAS ---
class OTPGenerateRequest(BaseModel):
    phone_number: str

class OTPVerifyRequest(BaseModel):
    phone_number: str
    otp: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    store_id: str
    user_id: str


# --- SYNC SCHEMAS (CRDT) ---
class MutationPayload(BaseModel):
    table: str                  # e.g., 'ledger_entries'
    record_id: str              # The UUID generated on the mobile device
    op: str                     # 'INSERT', 'UPDATE', or 'DELETE'
    fields: Dict[str, Any]      # The actual data (e.g., {"amount": 500, "customer_id": "..."})
    timestamp: str              # ISO-8601 timestamp from the mobile device

class SyncPushRequest(BaseModel):
    last_sync_timestamp: str
    mutations: List[MutationPayload]

class SyncPushResponse(BaseModel):
    processed: int
    conflicts: list
    server_timestamp: str

# --- AI ROUTER SCHEMAS ---
class VoiceCommandRequest(BaseModel):
    store_id: str
    transcript: str

class AIActionResponse(BaseModel):
    intent: str
    confidence: float
    parameters: Dict[str, Any]
    executed: bool
    system_message: str

# 1. Define the incoming request payload
class VoiceCommand(BaseModel):
    text: str


class ReceiptItem(BaseModel):
    item_name: str = Field(description="Name of the product")
    quantity: float = Field(default=1.0, description="Quantity of the product")
    purchase_price: float = Field(default=0.0, description="The vendor's billing rate/cost per unit")
    mrp: Optional[float] = Field(default=None, description="The printed Maximum Retail Price (MRP). Leave null if not present.")

class ParsedReceipt(BaseModel):
    items: List[ReceiptItem] = Field(default=[], description="List of detected items")