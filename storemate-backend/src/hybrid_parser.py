import os
import re
import json
import logging
from rapidfuzz import process, fuzz

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.5  # Lowered so rules handle everything locally

# ===========================================================================
# HINGLISH & PHONETIC DICTIONARY
# ===========================================================================
SYNONYMS = {
    # Sell / Billing Variants
    "cell": "sell", "sel": "sell", "sal": "sell", "sall": "sell", "sale": "sell",
    "becho": "sell", "bechi": "sell", "de do": "sell", "bikri": "sell", "bill": "sell",

    # Add / Inventory Variants
    "jodo": "add", "daalo": "add", "dalo": "add", "bhandar": "add", "stock": "add", "ad": "add", "plus": "add",

    # Udhaar / Khata Variants
    "udhaar": "khata", "udhar": "khata", "baki": "khata", "khaata": "khata", "khatas": "khata",
    "nagad": "cash", "rokar": "cash", "naqad": "cash",

    # 🚀 Payment Words (Jama)
    "jama": "received", "diye": "received", "diya": "received", "pay": "received", "paid": "received",
    "receive": "received", "mil": "received", "mile": "received",

    # Hindi Number Mapping
    "ek": "1", "do": "2", "teen": "3", "char": "4", "panch": "5", 
    "chhe": "6", "saat": "7", "aath": "8", "nau": "9", "das": "10",

    # Product Synonyms
    "shakkar": "sugar", "chini": "sugar", "cheeni": "sugar",
    "tel": "oil", "tail": "oil", "oils": "oil",
    "dal": "daal", "daal": "daal"
}

SALES_QUERY_PHRASES = ["today sale", "aaj ki bikri", "kitna bika", "sale today", "sales today", "bikri kitni"]
KHATA_QUERY_PHRASES = ["kitna baki", "balance", "how much owe", "kitna dena", "kitna udhar", "kitna udhaar", "bacha hai"]
ACCOUNT_CREATE_PHRASES = ["create account", "new customer", "add customer", "naya customer", "customer banao", "naya khata", "khata bnao"]


def _normalize_possessives(text: str) -> str:
    return re.sub(r"'s\b", "", text)


def _result(intent, confidence, product=None, qty=1, discount_percent=None,
            new_price=None, customer_name=None, time_period=None, source="rules",
            payment_type=None):
    return {
        "intent": intent,
        "product": product,
        "qty": qty,
        "discount_percent": discount_percent,
        "new_price": new_price,
        "customer_name": customer_name,
        "time_period": time_period,
        "confidence": confidence,
        "source": source,
        "payment_type": payment_type,
    }


def parse_with_rules(text: str, inventory_names: list = None, customer_names: list = None):
    text_raw = _normalize_possessives(text.lower().strip())

    words = text_raw.split()
    normalized_words = [SYNONYMS.get(w, w) for w in words]
    text_clean = " ".join(normalized_words)

    combined = f"{text_raw} {text_clean}"

    # 1. Query Intents
    if any(k in combined for k in SALES_QUERY_PHRASES):
        return _result("query.sales", confidence=0.95, time_period="today")

    if any(k in combined for k in KHATA_QUERY_PHRASES):
        cust_match = re.search(r'(?:ka|ki|ke)?\s*([a-zA-Z]+)\s*(?:ka|ki|ke)?\s*(?:baki|bacha|owe|khata)', text_raw)
        c_name = cust_match.group(1).title() if cust_match and cust_match.group(1) not in ["kitna", "udhar", "udhaar", "baki"] else None
        return _result("query.khata", confidence=0.90, customer_name=c_name)

    if any(k in combined for k in ACCOUNT_CREATE_PHRASES):
        name_match = (
            re.search(r'^([a-zA-Z]+)\s+(?:ka|ke\s+naam|ke\s+khate)', text_raw) or 
            re.search(r'(?:name|customer|account|of)\s+([a-zA-Z]+)', text_raw)
        )
        c_name = name_match.group(1).title() if name_match else None
        return _result("customer.create", confidence=0.90, customer_name=c_name)

    has_update_verb = any(w in text_clean for w in ["update", "rate", "karo", "kar do", "karo price"])

    # Explicit cash/khata signal, if the shopkeeper said it outright.
    # Only set when genuinely explicit - absence of this stays None rather
    # than defaulting to CASH, since a wrong default here misfiles real money.
    payment_type = None
    if any(w in text_clean for w in ["khata", "udhaar", "udhar", "baki"]):
        payment_type = "KHATA"
    elif any(w in text_clean for w in ["cash", "nagad", "rokar"]):
        payment_type = "CASH"

    # 2. Extract Quantity
    qty = 1
    qty_match = re.search(r'(\d+(?:\.\d+)?)\s*(kg|kilo|g|gm|liter|litre|ltr|pcs|pack|packet|can|bottle|piece|pieces)?', text_clean)
    if qty_match:
        qty = float(qty_match.group(1))
        if qty.is_integer():
            qty = int(qty)

    discount_match = re.search(r'(\d+)\s*(?:%|percent|pratishat|discount)', text_clean)
    discount_percent = float(discount_match.group(1)) if discount_match else None

    price_match = re.search(r'(?:to|set|price|daam|rate|rs|rupees|₹)\s*(\d+(?:\.\d+)?)', text_clean)
    new_price = float(price_match.group(1)) if price_match and has_update_verb else None

    # 3. Extract Customer Name
    customer_name = None
    name_before_match = re.search(r'^([a-zA-Z]+)\s+(?:ke\s+khate|ke\s+khata|ka\s+khata|ka\s+naam|ko|mein|me|ne)', text_raw)
    if name_before_match:
        candidate = name_before_match.group(1).title()
        if candidate.lower() not in ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "ek", "do", "one", "kg", "kilo"]:
            customer_name = candidate

    if not customer_name:
        customer_match = re.search(r'(?:to|for|ko|mein|me|in|named|from)\s+([a-zA-Z]+)', text_raw)
        if customer_match:
            extracted_name = customer_match.group(1).title()
            if extracted_name.lower() not in ["khata", "cash", "cart", "stock", "the", "cell", "sell", "dalo", "mein", "me", "khate", "account", "acc"]:
                customer_name = extracted_name

    # 4. Intent Classification
    intent = None
    if any(w in text_clean for w in ["received"]):
        intent = "khata.credit"
    elif discount_percent is not None or "discount" in text_clean:
        intent = "pos.apply_discount"
    elif customer_name:
        intent = "sale.create" 
    elif any(w in text_clean for w in ["sell", "becho", "bechi", "bikri", "sale", "bill"]):
        intent = "sale.create"
    elif any(w in text_clean for w in ["add", "jodo", "daalo", "dalo", "unpacked", "stock"]):
        intent = "inventory.add"
    elif new_price is not None or has_update_verb:
        intent = "inventory.update_price"
    elif any(w in text_clean for w in ["checkout", "invoice", "bill banao"]):
        intent = "pos.checkout"
    
    if not intent:
        intent = "sale.create"

    # 5. Entity Extraction (Product Name Matching)
    # 🚀 CRITICAL FIX: "receive" and "from" added to noise words
    noise_words = {
        "add", "jodo", "daalo", "dalo", "sell", "becho", "bechi", "bikri", "sale", "bill", "cell", "sel", "to", "the", "in",
        "cart", "khata", "khate", "account", "acc", "ac", "udhaar", "udhar", "cash", "nagad", "rokar", "for", "please", "kilo", "kg", "liter",
        "ltr", "pcs", "pack", "packet", "and", "put", "apply", "discount", "percent", "%", "rs", "rupees",
        "rupee", "update", "price", "daam", "rate", "set", "of", "a", "ko", "mein", "me", "ka", "ki", "ke",
        "hai", "hui", "kya", "kitni", "kitna", "karo", "kar", "do", "₹", "panch", "ek", "do", "teen", "char",
        "from", "receive", "received", "jama", "diye", "diya", "pay", "paid", "ne" 
    }

    # 🚀 CRITICAL FIX: Helper function to scrub text before fuzzy matching
    def get_clean_entity(t):
        t = t.replace("₹", " ")
        if customer_name:
            t = re.sub(r'\b' + re.escape(customer_name) + r'\b', '', t, flags=re.IGNORECASE)
        filtered = [w for w in t.split() if w.lower() not in noise_words and not re.match(r'^\d+(\.\d+)?$', w)]
        return " ".join(filtered).strip()

    # 🚀 CRITICAL FIX: Creates a bilingual search array
    # 🚀 CRITICAL FIX: Creates a bilingual search array
    entity_raw = get_clean_entity(text_raw)     # e.g., "shakkar"
    entity_clean = get_clean_entity(text_clean) # e.g., "sugar"

    matched_product = None
    if inventory_names and (entity_raw or entity_clean):
        candidates = list(set([e for e in [entity_raw, entity_clean] if e]))
        best_match = None
        best_score = 0
        for cand in candidates:
            res = process.extractOne(cand, inventory_names, scorer=fuzz.token_set_ratio)
            if res:
                match, score, _ = res
                if score > best_score:
                    best_score = score
                    best_match = match
                    
        if best_score >= 45:
            matched_product = best_match
        else:
            # 🚀 FIX: If not found in DB, return the raw word so React Native can tell you it's missing!
            matched_product = (entity_clean or entity_raw).title()
    else:
        # Fallback if inventory is empty
        fallback_str = entity_clean if entity_clean else entity_raw
        matched_product = fallback_str.title() if fallback_str else None

    return _result(
        intent=intent,
        confidence=0.90,
        product=matched_product,
        qty=qty,
        discount_percent=discount_percent,
        new_price=new_price,
        customer_name=customer_name,
        time_period="today" if intent == "query.sales" else None,
        source="rules_local",
        payment_type=payment_type,
    )

def parse_voice_command(text: str, inventory_names: list = None, customer_names: list = None):
    return parse_with_rules(text, inventory_names, customer_names)