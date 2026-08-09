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

class VoiceCommand(BaseModel):
    text: str

# 🚀 THIS COMPLETES PHASE 3: The unified strict schema for Gemini
class IntentResult(BaseModel):
    intent: str = Field(
        description="""
        The exact mapped action. MUST be one of: 
        'inventory.add', 'sale.create', 'khata.credit', 
        'inventory.update_price', 'ui.show_low_stock', 
        'ui.search', 'ui.open_billing', 'ui.show_sales',
        'pos.add_item', 'pos.apply_discount', 'pos.checkout', 'unknown'
        """
    )
    discount_percent: Optional[float] = Field(
        default=None, 
        description="The discount percentage to apply to the cart, e.g., 10 for '10 percent'."
    )
    product: Optional[str] = Field(
        default=None, 
        description="The product name, e.g., 'heavyweight oversized t-shirt', 'minimalist pullover'."
    )
    qty: Optional[float] = Field(
        default=None, 
        description="Quantity of the product mentioned."
    )
    customer_name: Optional[str] = Field(
        default=None, 
        description="Name of the customer for sales or Khata entries."
    )
    amount: Optional[float] = Field(
        default=None, 
        description="Financial amount for ledger entries."
    )
    new_price: Optional[float] = Field(
        default=None, 
        description="The new price to set if updating a product's price."
    )
    reason: Optional[str] = Field(
        default=None, 
        description="If intent is 'unknown', explain why the command was not understood."
    )


class ReceiptItem(BaseModel):
    item_name: str = Field(description="Name of the product")
    quantity: float = Field(default=1.0, description="Quantity of the product")
    purchase_price: float = Field(default=0.0, description="The vendor's billing rate/cost per unit")
    mrp: Optional[float] = Field(default=None, description="The printed Maximum Retail Price (MRP). Leave null if not present.")

class ParsedReceipt(BaseModel):
    items: List[ReceiptItem] = Field(default=[], description="List of detected items")