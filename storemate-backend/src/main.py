from ast import List
import os

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from src.database import get_db, engine
from src import models, schemas
from src.security import create_access_token
from datetime import datetime
from src.ai_engine import parse_store_intent
import re
from pydantic import BaseModel
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
import json
from typing import List
from fastapi import UploadFile, File
import io
import PIL.Image
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")

if not GEMINI_API_KEY:
    raise RuntimeError("GOOGLE_API_KEY not found")

ai_client = genai.Client(api_key=GEMINI_API_KEY)

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Storemate API",
    version="1.0.0"
)

# --- 2. ADD THIS ENTIRE BLOCK ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # This tells Python to accept requests from your HTML file!
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- HEALTH CHECK ---
@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "online", "database": "connected"}
    except Exception as e:
        return {"status": "online", "database": f"disconnected: {str(e)}"}

# --- STORES API ---
@app.post("/stores/", response_model=schemas.StoreResponse)
def create_store(store: schemas.StoreCreate, db: Session = Depends(get_db)):
    db_store = models.Store(name=store.name, tier=store.tier)
    db.add(db_store)
    db.commit()
    db.refresh(db_store)
    return db_store

@app.get("/stores/{store_id}", response_model=schemas.StoreResponse)
def get_store(store_id: str, db: Session = Depends(get_db)):
    store = db.query(models.Store).filter(models.Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store

# --- USERS API ---
@app.post("/stores/{store_id}/users/", response_model=schemas.UserResponse)
def create_user(store_id: str, user: schemas.UserCreate, db: Session = Depends(get_db)):
    # Verify the store exists first
    store = db.query(models.Store).filter(models.Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Cannot add user. Store not found.")
    
    # Check if phone number already exists
    existing_user = db.query(models.User).filter(models.User.phone_number == user.phone_number).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Phone number already registered.")

    db_user = models.User(
        phone_number=user.phone_number,
        role=user.role,
        store_id=store_id
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# --- AUTHENTICATION API ---

@app.post("/auth/generate-otp")
def generate_otp(request: schemas.OTPGenerateRequest, db: Session = Depends(get_db)):
    # 1. Check if the user exists
    user = db.query(models.User).filter(models.User.phone_number == request.phone_number).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="Phone number not found. Create a user first.")
    
    # 2. In production, we trigger an AWS SNS / Twilio SMS here.
    # For local dev, we are hardcoding a fake OTP: "123456"
    return {"message": "OTP sent successfully.", "dev_otp": "123456"}

@app.post("/auth/verify-otp", response_model=schemas.TokenResponse)
def verify_otp(request: schemas.OTPVerifyRequest, db: Session = Depends(get_db)):
    # 1. Find the user
    user = db.query(models.User).filter(models.User.phone_number == request.phone_number).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # 2. Verify the OTP (Hardcoded for dev testing)
    if request.otp != "123456":
        raise HTTPException(status_code=401, detail="Invalid OTP")

    # 3. OTP is valid! Generate the JWT Access Token
    access_token = create_access_token(data={"sub": user.phone_number, "role": user.role})

    # 4. Return the Token so the mobile app can securely talk to our APIs
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "store_id": user.store_id,
        "user_id": user.id
    }

# --- OFFLINE SYNC API ---

@app.post("/sync/push", response_model=schemas.SyncPushResponse)
def push_sync(request: schemas.SyncPushRequest, db: Session = Depends(get_db)):
    processed_count = 0
    conflicts = []

    for mutation in request.mutations:
        try:
            # Here we dynamically determine which table to update
            if mutation.table == "ledger_entries":
                
                # Check if this record already exists in PostgreSQL
                existing_record = db.query(models.LedgerEntry).filter(models.LedgerEntry.id == mutation.record_id).first()
                
                if mutation.op == "INSERT" and not existing_record:
                    # Create a new record from the mobile device's data
                    new_entry = models.LedgerEntry(
                        id=mutation.record_id,
                        customer_id=mutation.fields.get("customer_id"),
                        amount=mutation.fields.get("amount"),
                        entry_type=mutation.fields.get("entry_type"),
                        timestamp=datetime.fromisoformat(mutation.timestamp.replace('Z', '+00:00'))
                    )
                    db.add(new_entry)
                    processed_count += 1
                
                elif mutation.op == "UPDATE" and existing_record:
                    # Last-Write-Wins (LWW) Logic: Only update if the mobile timestamp is newer
                    mobile_time = datetime.fromisoformat(mutation.timestamp.replace('Z', '+00:00'))
                    
                    if mobile_time > existing_record.timestamp:
                        for key, value in mutation.fields.items():
                            setattr(existing_record, key, value)
                        processed_count += 1
                    else:
                        # The server has newer data, ignore the mobile update
                        pass

        except Exception as e:
            # If a specific mutation fails, log it as a conflict but don't crash the whole batch
            conflicts.append({
                "record_id": mutation.record_id,
                "error": str(e)
            })

    # Commit all successful mutations in one transaction
    db.commit()

    return {
        "processed": processed_count,
        "conflicts": conflicts,
        "server_timestamp": datetime.utcnow().isoformat() + "Z"
    }

@app.get("/admin/ledger")
def get_admin_ledger(db: Session = Depends(get_db)):
    # Fetch all records from PostgreSQL, sorted by newest first
    entries = db.query(models.LedgerEntry).order_by(models.LedgerEntry.timestamp.desc()).all()
    return entries

# --- AI BRAIN API ---

@app.post("/ai/voice-command", response_model=schemas.AIActionResponse)
def execute_voice_command(command: schemas.VoiceCommandRequest, db: Session = Depends(get_db)):
    # 1. Pass the raw text to our AI Engine
    parsed_data = parse_store_intent(command.transcript)
    
    intent = parsed_data["intent"]
    params = parsed_data["parameters"]
    
    # 2. Execute the database action based on the AI's intent
    system_message = ""
    executed = False

    if intent == "ADD_LEDGER_CREDIT":
        # In a real scenario, we would lookup the customer_id based on the name here
        # For now, we simulate the ledger insertion
        system_message = f"Successfully added ₹{params.get('amount')} to {params.get('customer_name')}'s account."
        executed = True

    elif intent == "CHECK_INVENTORY":
        system_message = f"Checked stock for {params.get('item_name')}. You have 14 units remaining."
        executed = True
        
    else:
        system_message = "I didn't quite catch that. Could you repeat?"

    # 3. Return the structured action to the mobile app UI
    return {
        "intent": intent,
        "confidence": parsed_data["confidence"],
        "parameters": params,
        "executed": executed,
        "system_message": system_message
    }

# 1. Define what a physical product looks like
class LineItem(BaseModel):
    product_name: str = Field(description="The name of the physical product, e.g., 'Amul Milk', 'Sugar'")
    quantity: float = Field(description="The numeric quantity purchased, e.g., 2, 1.5")
    unit: str = Field(description="The unit of measurement, e.g., 'packets', 'kg', 'liters', or 'pieces'")

# 2. Upgrade the main intent to include a shopping cart
class ParsedIntent(BaseModel):
    status: str = Field(description="Must be 'success' or 'error'")
    intent: str = Field(description="Must be 'CREDIT_GIVEN', 'PAYMENT_RECEIVED', or 'CASH_SALE'")
    amount: float = Field(description="The exact financial amount extracted. If not explicitly stated, estimate based on items.")
    customer_id: str = Field(description="The customer's name, prefixed with 'cust_'. Use 'cust_walkin' if no name is given.")
    message: str = Field(description="A friendly, concise confirmation message for the Kirana owner")
    cart: List[LineItem] = Field(default=[], description="The list of physical products the customer purchased")
class VoiceCommand(BaseModel):
    text: str

@app.post("/ai/command")
async def parse_voice_command(command: VoiceCommand):
    try:
        response = ai_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=f"Extract the transaction and product details from this messy transcription: '{command.text}'",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ParsedIntent,
                system_instruction="You are an AI assistant for an Indian Kirana store. Extract the customer name, the total amount, and build a shopping cart of any physical items mentioned. If the user doesn't mention a price, you can set the amount to 0."
            ),
        )
        ai_data = json.loads(response.text)
        return ai_data
        
    except Exception as e:
        return {
            "status": "error", 
            "message": f"The AI Brain failed: {str(e)}"
        }

@app.post("/ai/scan-receipt")
async def scan_receipt(file: UploadFile = File(...)):
    try:
        image_data = await file.read()
        image = PIL.Image.open(io.BytesIO(image_data))

        response = ai_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[
                image,
                "Extract ONLY the purchased line items from this receipt. Ignore headers, store name, taxes, and totals."
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schemas.ParsedReceipt,  # <--- Reference it here!
            ),
        )
        return json.loads(response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse receipt: {str(e)}")