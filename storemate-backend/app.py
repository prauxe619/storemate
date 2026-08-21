import os
import re
import io
import json
from io import BytesIO
import secrets
import traceback
import random
import datetime
from datetime import timedelta
from functools import wraps
from flask import Flask, request, jsonify, render_template, redirect, url_for, session, flash
from PIL import Image
from google import genai
from google.genai import types
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from dotenv import load_dotenv
from google.oauth2 import id_token
from google.auth.transport import requests
from flask_mail import Mail, Message
from geo_utils import get_client_ip, resolve_ip_location
# Local Imports
from models import db, InventoryItem, LedgerEntry, SalesTransaction, User, Feedback
from ai_service import process_invoice_image 
from src.hybrid_parser import parse_with_rules
from admin_web import admin_web_bp, limiter
from telemetry import telemetry_bp
from admin_analytics_bp import admin_analytics_bp


# ==========================================
# 1. INITIALIZATION & ENVIRONMENT SETUP
# ==========================================
load_dotenv()

app = Flask(__name__)

# Ensure upload directory exists
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
# Reject any request body over 10MB before it's even fully read into memory
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB

# Check Debug Mode
IS_DEBUG = os.getenv('FLASK_DEBUG', '0') == '1'

# ==========================================
# 2. HARDENED SECURITY & SECRETS VALIDATION
# ==========================================

# A. Flask Session Secret (Fixed Snyk Hardcoded Non-Crypto Secret finding)
app.secret_key = os.getenv("FLASK_SECRET_KEY")
if not app.secret_key:
    if not IS_DEBUG:
        raise RuntimeError("CRITICAL SECURITY RISK: FLASK_SECRET_KEY environment variable is missing!")
    app.secret_key = secrets.token_hex(32)

# B. JWT Authentication Secret
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY')
if not app.config['JWT_SECRET_KEY']:
    if not IS_DEBUG:
        raise RuntimeError("CRITICAL SECURITY RISK: JWT_SECRET_KEY environment variable is missing!")
    app.config['JWT_SECRET_KEY'] = secrets.token_hex(32)

app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=30)

# C. Database Connection URI
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
if not app.config['SQLALCHEMY_DATABASE_URI']:
    if not IS_DEBUG:
        raise RuntimeError("CRITICAL SECURITY RISK: DATABASE_URL environment variable is missing!")
    # Local dev fallback constructed dynamically
    db_user = os.getenv('DB_USER', 'storemate_admin')
    db_pass = os.getenv('DB_PASS')

    if not db_pass:
        raise RuntimeError("DB_PASS environment variable is not set")
    db_host = os.getenv('DB_HOST', 'localhost:5433')
    db_name = os.getenv('DB_NAME', 'storemate_dev')
    app.config['SQLALCHEMY_DATABASE_URI'] = f"postgresql://{db_user}:{db_pass}@{db_host}/{db_name}"

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# ==========================================
# 3. EXTENSIONS & SERVICES INITIALIZATION
# ==========================================

# Flask-Mail Configuration
app.config['MAIL_SERVER'] = os.getenv('MAIL_SERVER', 'smtp.gmail.com')
try:
    app.config['MAIL_PORT'] = int(os.getenv('MAIL_PORT', '587'))
except (TypeError, ValueError):
    print("⚠️ Invalid MAIL_PORT. Falling back to 587.")
    app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = os.getenv('MAIL_USE_TLS', 'true').strip().lower() in ('true', '1', 'yes', 'on')
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD')
app.config['MAIL_DEFAULT_SENDER'] = os.getenv('MAIL_USERNAME')

# 🚀 FIX: 5-second timeout to prevent the 30-38s app freeze
app.config['MAIL_TIMEOUT'] = 5 

mail = Mail(app)
jwt = JWTManager(app)

# Initialize Rate Limiter & Web Admin Blueprint
limiter.init_app(app)
app.register_blueprint(admin_web_bp)
app.register_blueprint(telemetry_bp)
app.register_blueprint(admin_analytics_bp)

# Initialize Gemini AI Client
google_api_key = os.getenv("GOOGLE_API_KEY")
if not google_api_key:
    print("⚠️ WARNING: GOOGLE_API_KEY is not configured in .env file.")
ai_client = genai.Client(api_key=google_api_key) if google_api_key else None

# ==========================================
# 4. JWT ERROR HANDLING CALLBACKS
# ==========================================
@app.errorhandler(413)
def file_too_large(e):
    return jsonify({"error": "File is too large. Maximum upload size is 10MB."}), 413

@jwt.unauthorized_loader
def unauthorized(reason):
    print("JWT Unauthorized:", reason)
    return jsonify(error=reason), 401

@jwt.invalid_token_loader
def invalid(reason):
    print("JWT Invalid:", reason)
    return jsonify(error=reason), 422

@jwt.expired_token_loader
def expired(jwt_header, jwt_payload):
    print("JWT Expired")
    return jsonify(error="Token expired"), 401

def admin_session_required(f):
    """Blocks direct access to admin HTML pages unless a valid
    admin session already exists (same check used by the '/' route)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not (session.get('admin_email') and session.get('admin_role')):
            return redirect(url_for('admin_web.login'))
        return f(*args, **kwargs)
    return decorated

def is_strong_password(password):
    """Returns (True, None) if valid, or (False, reason) if not."""
    if not password or len(password) < 8:
        return False, "Password must be at least 8 characters long."

    if not re.search(r'[A-Za-z]', password):
        return False, "Password must contain at least one letter."

    if not re.search(r'\d', password):
        return False, "Password must contain at least one number."

    return True, None
# ==========================================
# 5. DATABASE BINDING
# ==========================================

db.init_app(app)

with app.app_context():
    db.create_all()

@app.route('/admin_dashboard')
def admin_dashboard(): 
    # If already logged in as admin, go directly to dashboard
    if session.get('admin_email') and session.get('admin_role'):
        return redirect(url_for('admin_web.dashboard'))

    # Otherwise show admin login
    return redirect(url_for('admin_web.login'))

# ==========================================
# ☁️ SYNC ROUTE
# ==========================================

@app.route('/api/sync', methods=['POST'])
@jwt_required()
def sync_data():
    """
    StoreMate mobile -> cloud synchronization.

    Security rules:
    - JWT determines the merchant.
    - Mobile NEVER controls owner_id.
    - Every record is forced to the authenticated owner.
    - Records belonging to another merchant are rejected/skipped.
    - Inventory supports universal units and decimal quantities.
    - Khata preserves phone/note fields.
    - Sales preserves payment type and timestamps.
    """

    current_user_email = get_jwt_identity()

    user = User.query.filter_by(email=current_user_email).first()

    if not user:
        return jsonify({"status": "error", "error": "Unauthorized"}), 401

    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return jsonify({"status": "error", "error": "Invalid sync payload"}), 400

    try:

        # =====================================================
        # HELPERS
        # =====================================================

        def safe_float(value, default=0.0):
            try:
                number = float(value)

                if number != number:
                    return default

                if number in (float("inf"), float("-inf")):
                    return default

                return number

            except (TypeError, ValueError):
                return default


        def safe_int(value, default=None):
            try:
                if value is None:
                    return default

                return int(value)

            except (TypeError, ValueError):
                return default


        def safe_string(value, default=None, max_length=1000):
            if value is None:
                return default

            try:
                value = str(value).strip()
            except Exception:
                return default

            if not value:
                return default

            return value[:max_length]


        def normalize_unit(value):
            """
            Normalize all supported StoreMate inventory units.
            """

            if not value:
                return None

            value = str(value).strip().upper()

            aliases = {
                "KG": "KG",
                "KGS": "KG",
                "KILO": "KG",
                "KILOGRAM": "KG",
                "KILOGRAMS": "KG",
                "G": "GRAM",
                "GM": "GRAM",
                "GMS": "GRAM",
                "GRAM": "GRAM",
                "GRAMS": "GRAM",
                "L": "LITRE",
                "LTR": "LITRE",
                "LITER": "LITRE",
                "LITRE": "LITRE",
                "LITRES": "LITRE",
                "LITERS": "LITRE",
                "ML": "ML",
                "MILLILITER": "ML",
                "MILLILITRE": "ML",
                "MILLILITERS": "ML",
                "MILLILITRES": "ML",
                "PC": "PIECE",
                "PCS": "PIECE",
                "PIECE": "PIECE",
                "PIECES": "PIECE",
                "PACK": "PACK",
                "PACKET": "PACK",
                "PACKETS": "PACK",
                "BOTTLE": "BOTTLE",
                "BOTTLES": "BOTTLE",
                "BOX": "BOX",
                "BOXES": "BOX",
                "DOZEN": "DOZEN",
                "DOZ": "DOZEN",
                "STRIP": "STRIP",
                "STRIPS": "STRIP",
                "CARTON": "CARTON",
                "CARTONS": "CARTON",
                "BUNDLE": "BUNDLE",
                "BUNDLES": "BUNDLE",
            }

            return aliases.get(value, value[:30])


        def sanitize(data, allowed_fields):
            if not isinstance(data, dict):
                return {}

            return {
                key: value
                for key, value in data.items()
                if key in allowed_fields
            }


        # =====================================================
        # ALLOWED MOBILE FIELDS
        # =====================================================

        ALLOWED_INVENTORY = {
            "id",
            "barcode",
            "product_name",
            "quantity",
            "unit",
            "purchase_price",
            "selling_price",
            "category",
            "image_url",
            "created_at",
            "updated_at",
            "is_synced",
        }

        ALLOWED_LEDGER = {
            "id",
            "customer_id",
            "amount",
            "entry_type",
            "customer_phone",
            "note",
            "created_at",
            "is_synced",
        }

        ALLOWED_SALES = {
            "id",
            "total_amount",
            "payment_type",
            "created_at",
            "is_synced",
        }


        # =====================================================
        # INPUT ARRAYS
        # =====================================================

        inventory_data = payload.get("inventory", [])
        ledger_data = payload.get("ledger", [])
        sales_data = payload.get("sales", [])

        if not isinstance(inventory_data, list):
            inventory_data = []

        if not isinstance(ledger_data, list):
            ledger_data = []

        if not isinstance(sales_data, list):
            sales_data = []


        # =====================================================
        # COUNTERS
        # =====================================================

        inventory_created = 0
        inventory_updated = 0
        inventory_skipped = 0

        ledger_created = 0
        ledger_updated = 0
        ledger_skipped = 0

        sales_created = 0
        sales_updated = 0
        sales_skipped = 0


        # =====================================================
        # OWNER ID
        # =====================================================

        owner_id = str(user.id)


        # =====================================================
        # 1. INVENTORY SYNC
        # =====================================================

        for raw_item in inventory_data:

            item_data = sanitize(raw_item, ALLOWED_INVENTORY)

            item_id = safe_string(item_data.get("id"), max_length=255)

            if not item_id:
                inventory_skipped += 1
                continue

            product_name = safe_string(item_data.get("product_name"), max_length=255)

            if not product_name:
                inventory_skipped += 1
                continue

            quantity = safe_float(item_data.get("quantity"), 0)

            purchase_price = safe_float(item_data.get("purchase_price"), 0)

            selling_price = safe_float(item_data.get("selling_price"), 0)

            unit = normalize_unit(item_data.get("unit"))

            created_at = safe_int(item_data.get("created_at"))

            updated_at = safe_int(item_data.get("updated_at"))

            if updated_at is None:
                updated_at = int(datetime.utcnow().timestamp() * 1000)

            item = db.session.get(InventoryItem, item_id)

            if item:

                existing_owner = getattr(item, "owner_id", None)

                if existing_owner is not None and str(existing_owner) != owner_id:
                    print("⚠️ BLOCKED INVENTORY ACCESS:", item_id, "attempted by user", owner_id)
                    inventory_skipped += 1
                    continue

                item.owner_id = owner_id
                item.product_name = product_name
                item.barcode = safe_string(item_data.get("barcode"), max_length=100)
                item.quantity = quantity
                item.unit = unit
                item.purchase_price = purchase_price
                item.selling_price = selling_price
                item.category = safe_string(item_data.get("category"), max_length=100)
                item.image_url = safe_string(item_data.get("image_url"), max_length=1000)

                if created_at is not None:
                    item.created_at = created_at

                item.updated_at = updated_at
                item.is_synced = True

                inventory_updated += 1

            else:

                item = InventoryItem(
                    id=item_id,
                    owner_id=owner_id,
                    product_name=product_name,
                    barcode=safe_string(item_data.get("barcode"), max_length=100),
                    quantity=quantity,
                    unit=unit,
                    purchase_price=purchase_price,
                    selling_price=selling_price,
                    category=safe_string(item_data.get("category"), max_length=100),
                    image_url=safe_string(item_data.get("image_url"), max_length=1000),
                    is_synced=True,
                    created_at=created_at,
                    updated_at=updated_at,
                )

                db.session.add(item)

                inventory_created += 1


        # =====================================================
        # 2. KHATA / LEDGER SYNC
        # =====================================================

        for raw_entry in ledger_data:

            entry_data = sanitize(raw_entry, ALLOWED_LEDGER)

            entry_id = safe_string(entry_data.get("id"), max_length=255)

            if not entry_id:
                ledger_skipped += 1
                continue

            customer_id = safe_string(entry_data.get("customer_id"), max_length=255)

            if not customer_id:
                ledger_skipped += 1
                continue

            amount = safe_float(entry_data.get("amount"), 0)

            entry_type = safe_string(entry_data.get("entry_type"), max_length=50)

            if entry_type:
                entry_type = entry_type.upper()

            if entry_type not in ("CREDIT", "PAYMENT"):
                ledger_skipped += 1
                continue

            created_at = safe_int(entry_data.get("created_at"))

            if created_at is None:
                created_at = int(datetime.utcnow().timestamp() * 1000)

            entry = db.session.get(LedgerEntry, entry_id)

            if entry:

                existing_owner = getattr(entry, "owner_id", None)

                if existing_owner is not None and str(existing_owner) != owner_id:
                    print("⚠️ BLOCKED LEDGER ACCESS:", entry_id, "attempted by user", owner_id)
                    ledger_skipped += 1
                    continue

                entry.owner_id = owner_id
                entry.customer_id = customer_id
                entry.amount = amount
                entry.entry_type = entry_type
                entry.customer_phone = safe_string(entry_data.get("customer_phone"), max_length=50)
                entry.note = safe_string(entry_data.get("note"), max_length=2000)
                entry.created_at = created_at
                entry.is_synced = True

                ledger_updated += 1

            else:

                entry = LedgerEntry(
                    id=entry_id,
                    owner_id=owner_id,
                    customer_id=customer_id,
                    amount=amount,
                    entry_type=entry_type,
                    customer_phone=safe_string(entry_data.get("customer_phone"), max_length=50),
                    note=safe_string(entry_data.get("note"), max_length=2000),
                    is_synced=True,
                    created_at=created_at,
                )

                db.session.add(entry)

                ledger_created += 1


        # =====================================================
        # 3. SALES SYNC
        # =====================================================

        for raw_sale in sales_data:

            sale_data = sanitize(raw_sale, ALLOWED_SALES)

            sale_id = safe_string(sale_data.get("id"), max_length=255)

            if not sale_id:
                sales_skipped += 1
                continue

            total_amount = safe_float(sale_data.get("total_amount"), 0)

            payment_type = safe_string(sale_data.get("payment_type"), max_length=50)

            if payment_type:
                payment_type = payment_type.upper()

            if payment_type not in ("CASH", "KHATA"):
                sales_skipped += 1
                continue

            created_at = safe_int(sale_data.get("created_at"))

            if created_at is None:
                created_at = int(datetime.utcnow().timestamp() * 1000)

            sale = db.session.get(SalesTransaction, sale_id)

            if sale:

                existing_owner = getattr(sale, "owner_id", None)

                if existing_owner is not None and str(existing_owner) != owner_id:
                    print("⚠️ BLOCKED SALES ACCESS:", sale_id, "attempted by user", owner_id)
                    sales_skipped += 1
                    continue

                sale.owner_id = owner_id
                sale.total_amount = total_amount
                sale.payment_type = payment_type
                sale.created_at = created_at
                sale.is_synced = True

                sales_updated += 1

            else:

                sale = SalesTransaction(
                    id=sale_id,
                    owner_id=owner_id,
                    total_amount=total_amount,
                    payment_type=payment_type,
                    is_synced=True,
                    created_at=created_at,
                )

                db.session.add(sale)

                sales_created += 1


        # =====================================================
        # COMMIT
        # =====================================================

        db.session.commit()


        # =====================================================
        # RESPONSE COUNTERS
        # =====================================================

        total_created = inventory_created + ledger_created + sales_created

        total_updated = inventory_updated + ledger_updated + sales_updated

        total_skipped = inventory_skipped + ledger_skipped + sales_skipped


        print("✅ STOREMATE SYNC SUCCESS")
        print(f"User: {user.id}")
        print(f"Inventory created: {inventory_created}")
        print(f"Inventory updated: {inventory_updated}")
        print(f"Ledger created: {ledger_created}")
        print(f"Ledger updated: {ledger_updated}")
        print(f"Sales created: {sales_created}")
        print(f"Sales updated: {sales_updated}")


        return jsonify({
            "status": "success",
            "message": "StoreMate data synchronized successfully.",
            "owner_id": owner_id,
            "synced": {
                "inventory": {
                    "created": inventory_created,
                    "updated": inventory_updated,
                    "skipped": inventory_skipped,
                },
                "ledger": {
                    "created": ledger_created,
                    "updated": ledger_updated,
                    "skipped": ledger_skipped,
                },
                "sales": {
                    "created": sales_created,
                    "updated": sales_updated,
                    "skipped": sales_skipped,
                },
            },
            "totals": {
                "created": total_created,
                "updated": total_updated,
                "skipped": total_skipped,
            },
        }), 200


    except Exception as e:

        db.session.rollback()

        import traceback

        traceback.print_exc()

        return jsonify({
            "status": "error",
            "message": "Synchronization failed.",
            "error": str(e),
        }), 500


@app.route('/api/sync/restore', methods=['GET'])
@jwt_required()
def restore_sync_data():
    """
    StoreMate cloud -> mobile restore.

    Returns ONLY data belonging to the authenticated merchant.

    Restores:
        - Profile
        - Inventory
        - Khata / Ledger
        - Sales

    Security:
        - JWT identifies the merchant.
        - owner_id is determined by the server.
        - No owner_id is accepted from the client.
        - Password/hash information is NEVER returned.
    """

    try:

        # =====================================================
        # 1. AUTHENTICATED USER
        # =====================================================

        current_user_email = get_jwt_identity()

        user = User.query.filter_by(
            email=current_user_email
        ).first()

        if not user:
            return jsonify({
                "status": "error",
                "error": "Unauthorized"
            }), 401

        owner_id = str(user.id)


        # =====================================================
        # 2. PROFILE
        # =====================================================

        profile = {

            "id":
                str(user.id),

            "email":
                user.email,

            "name":
                user.shop_name,

            "shop_name":
                user.shop_name,

            "phone":
                user.phone or "",

            "address":
                user.address or "",

            "upi_id":
                user.upi_id or "",

            "role":
                user.role,

            "is_active":
                user.is_active,

        }


        # =====================================================
        # 3. INVENTORY
        # =====================================================
        #
        # IMPORTANT:
        # Only records belonging to THIS merchant.
        #

        inventory_records = (
            InventoryItem.query
            .filter(
                InventoryItem.owner_id == owner_id
            )
            .order_by(
                InventoryItem.updated_at.asc()
            )
            .all()
        )


        inventory = []

        for item in inventory_records:

            inventory.append({

                "id": item.id,

                "owner_id": owner_id,

                "barcode": (
                    item.barcode
                    if item.barcode is not None
                    else ""
                ),

                "product_name": (
                    item.product_name
                    if item.product_name is not None
                    else ""
                ),

                "quantity": (
                    float(item.quantity)
                    if item.quantity is not None
                    else 0
                ),

                "unit": (
                    item.unit
                    if item.unit
                    else "PCS"
                ),

                "purchase_price": (
                    float(item.purchase_price)
                    if item.purchase_price is not None
                    else 0
                ),

                "selling_price": (
                    float(item.selling_price)
                    if item.selling_price is not None
                    else 0
                ),

                "category": (
                    item.category
                    if item.category is not None
                    else None
                ),

                "image_url": (
                    item.image_url
                    if item.image_url is not None
                    else None
                ),

                "is_synced": True,

                "created_at": (
                    int(item.created_at)
                    if item.created_at is not None
                    else None
                ),

                "updated_at": (
                    int(item.updated_at)
                    if item.updated_at is not None
                    else None
                ),
            })


        # =====================================================
        # 4. KHATA / LEDGER
        # =====================================================

        ledger_records = (
            LedgerEntry.query
            .filter(
                LedgerEntry.owner_id == owner_id
            )
            .order_by(
                LedgerEntry.created_at.asc()
            )
            .all()
        )


        ledger = []

        for entry in ledger_records:

            ledger.append({

                "id": entry.id,

                "owner_id": owner_id,

                "customer_id": (
                    entry.customer_id
                    if entry.customer_id is not None
                    else ""
                ),

                "amount": (
                    float(entry.amount)
                    if entry.amount is not None
                    else 0
                ),

                "entry_type": (
                    entry.entry_type
                    if entry.entry_type is not None
                    else ""
                ),

                "customer_phone": (
                    entry.customer_phone
                    if entry.customer_phone is not None
                    else None
                ),

                "note": (
                    entry.note
                    if entry.note is not None
                    else None
                ),

                "is_synced": True,

                "created_at": (
                    int(entry.created_at)
                    if entry.created_at is not None
                    else None
                ),
            })


        # =====================================================
        # 5. SALES
        # =====================================================

        sales_records = (
            SalesTransaction.query
            .filter(
                SalesTransaction.owner_id == owner_id
            )
            .order_by(
                SalesTransaction.created_at.asc()
            )
            .all()
        )


        sales = []

        for sale in sales_records:

            sales.append({

                "id": sale.id,

                "owner_id": owner_id,

                "total_amount": (
                    float(sale.total_amount)
                    if sale.total_amount is not None
                    else 0
                ),

                "payment_type": (
                    sale.payment_type
                    if sale.payment_type is not None
                    else ""
                ),

                "is_synced": True,

                "created_at": (
                    int(sale.created_at)
                    if sale.created_at is not None
                    else None
                ),
            })


        # =====================================================
        # 6. RESPONSE
        # =====================================================

        response = {

            "status": "success",

            "owner_id": owner_id,

            "profile": profile,

            "inventory": inventory,

            "ledger": ledger,

            "sales": sales,

            "counts": {

                "inventory": len(
                    inventory
                ),

                "ledger": len(
                    ledger
                ),

                "sales": len(
                    sales
                ),
            },

        }


        print(
            "✅ STOREMATE RESTORE SUCCESS"
        )

        print(
            f"User: {user.id}"
        )

        print(
            f"Inventory: {len(inventory)}"
        )

        print(
            f"Ledger: {len(ledger)}"
        )

        print(
            f"Sales: {len(sales)}"
        )


        return jsonify(
            response
        ), 200


    except Exception as e:

        import traceback

        traceback.print_exc()

        return jsonify({

            "status": "error",

            "message":
                "Restore failed.",

            "error":
                str(e),

        }), 500

    
# ==========================================
# 🤖 DUAL-ENGINE INVOICE SCANNER ROUTE
# ==========================================

def normalize_inventory_unit(value):
    """
    Normalize any OCR/Gemini unit into StoreMate's universal units.

    Supported:
    KG, GRAM, LITRE, ML,
    PCS, PACK, BOX, BOTTLE,
    DOZEN, STRIP, CARTON, BUNDLE
    """

    if value is None:
        return "PCS"

    raw = str(value).strip().lower()

    if not raw:
        return "PCS"

    raw = re.sub(r"[\(\)\[\]\{\}\.,:;!?]", " ", raw)
    raw = re.sub(r"\s+", " ", raw).strip()

    # PCS
    if raw in {
        "pcs", "pc", "piece", "pieces",
        "unit", "units", "item", "items",
        "nos", "no", "number", "numbers",
        "nag", "n",
        "नग", "पीस", "पीसेज"
    }:
        return "PCS"

    # PACK
    if raw in {
        "pack", "packs",
        "packet", "packets",
        "pkt", "pk",
        "pouch", "pouches",
        "sachet", "sachets",
        "पैक", "पैकेट", "पाउच", "सैशे"
    }:
        return "PACK"

    # BOX
    if raw in {
        "box", "boxes",
        "dabba", "dabbas",
        "डब्बा", "डिब्बा", "डब्बे", "डिब्बे"
    }:
        return "BOX"

    # BOTTLE
    if raw in {
        "bottle", "bottles",
        "bot", "btl",
        "बोतल", "बॉटल"
    }:
        return "BOTTLE"

    # KG
    if raw in {
        "kg", "kgs",
        "kilo", "kilos",
        "kilogram", "kilograms",
        "kilogramme", "kilogrammes",
        "किलो", "किलोग्राम", "किलो ग्राम"
    }:
        return "KG"

    # GRAM
    if raw in {
        "g", "gm", "gms",
        "gram", "grams",
        "gramme", "grammes",
        "ग्राम", "ग्राम्स"
    }:
        return "GRAM"

    # LITRE
    if raw in {
        "l", "ltr", "ltrs",
        "litre", "litres",
        "liter", "liters",
        "लीटर", "लीटर्स"
    }:
        return "LITRE"

    # ML
    if raw in {
        "ml", "mls",
        "millilitre", "millilitres",
        "milliliter", "milliliters",
        "मिली", "मिलीलीटर", "मिलिलीटर"
    }:
        return "ML"

    # DOZEN
    if raw in {
        "dozen", "dozens",
        "dz", "doz",
        "दर्जन"
    }:
        return "DOZEN"

    # STRIP
    if raw in {
        "strip", "strips",
        "tablet strip",
        "medicine strip",
        "स्ट्रिप"
    }:
        return "STRIP"

    # CARTON
    if raw in {
        "carton", "cartons",
        "ctn",
        "कार्टन"
    }:
        return "CARTON"

    # BUNDLE
    if raw in {
        "bundle", "bundles",
        "bunch", "bunches",
        "बंडल", "गट्ठर"
    }:
        return "BUNDLE"

    # Phrase detection
    if re.search(
        r"\b(kg|kgs|kilo|kilos|kilogram|kilograms)\b",
        raw,
        re.I
    ):
        return "KG"

    if re.search(
        r"\b(g|gm|gms|gram|grams|gramme|grammes)\b",
        raw,
        re.I
    ):
        return "GRAM"

    if re.search(
        r"\b(ml|millilitre|millilitres|milliliter|milliliters)\b",
        raw,
        re.I
    ):
        return "ML"

    if re.search(
        r"\b(l|ltr|ltrs|litre|litres|liter|liters)\b",
        raw,
        re.I
    ):
        return "LITRE"

    if re.search(
        r"\b(pack|packs|packet|packets|pkt|pouch|pouches)\b",
        raw,
        re.I
    ):
        return "PACK"

    if re.search(
        r"\b(box|boxes)\b",
        raw,
        re.I
    ):
        return "BOX"

    if re.search(
        r"\b(bottle|bottles|btl)\b",
        raw,
        re.I
    ):
        return "BOTTLE"

    if re.search(
        r"\b(dozen|dozens|doz|dz)\b",
        raw,
        re.I
    ):
        return "DOZEN"

    if re.search(
        r"\b(strip|strips)\b",
        raw,
        re.I
    ):
        return "STRIP"

    if re.search(
        r"\b(carton|cartons|ctn)\b",
        raw,
        re.I
    ):
        return "CARTON"

    if re.search(
        r"\b(bundle|bundles|bunch|bunches)\b",
        raw,
        re.I
    ):
        return "BUNDLE"

    if re.search(
        r"\b(piece|pieces|pcs|pc|nos|items?)\b",
        raw,
        re.I
    ):
        return "PCS"

    return "PCS"

def clean_donut_output(donut_data):
    """Fallback Parser: Cleans raw Donut ML output if Gemini fails."""

    extracted_items = []

    def find_items_list(d):
        if isinstance(d, list):
            return d

        if isinstance(d, dict):
            for k, v in d.items():
                if isinstance(v, list):
                    return v

                res = find_items_list(v)

                if res:
                    return res

        return []

    raw_items = find_items_list(donut_data)

    for idx, item in enumerate(raw_items):

        if not isinstance(item, dict):
            continue

        # ------------------------------------------
        # PRODUCT NAME
        # ------------------------------------------

        name = (
            item.get("productName")
            or item.get("item_name")
            or item.get("product_name")
            or item.get("name")
            or item.get("nm")
            or item.get("item_title")
            or item.get("desc")
            or f"Item #{idx + 1}"
        )

        # ------------------------------------------
        # QUANTITY
        # ------------------------------------------

        qty_str = str(
            item.get("quantity")
            or item.get("qty")
            or item.get("num")
            or "1"
        )

        qty_match = re.search(
            r"(\d+(?:\.\d+)?)",
            qty_str
        )

        qty = (
            float(qty_match.group(1))
            if qty_match
            else 1.0
        )

        # ------------------------------------------
        # UNIT
        # ------------------------------------------

        unit = (
            item.get("unit")
            or item.get("units")
            or item.get("Unit")
            or item.get("UNIT")
            or item.get("productUnit")
            or item.get("product_unit")
            or item.get("quantityUnit")
            or item.get("quantity_unit")
            or item.get("uom")
            or item.get("UOM")
            or ""
        )

        unit = normalize_inventory_unit(unit)

        # ------------------------------------------
        # PURCHASE PRICE
        # ------------------------------------------

        price_str = str(
            item.get("purchasePrice")
            or item.get("purchase_price")
            or item.get("price")
            or item.get("unitprice")
            or "0"
        )

        price_match = re.search(
            r"(\d+(?:\.\d+)?)",
            price_str
        )

        price = (
            float(price_match.group(1))
            if price_match
            else 0.0
        )

        # ------------------------------------------
        # SELLING PRICE
        # ------------------------------------------

        selling_price = (
            item.get("sellingPrice")
            or item.get("selling_price")
            or item.get("mrp")
        )

        try:
            selling_price = float(
                selling_price
            )
        except (TypeError, ValueError):
            selling_price = 0.0

        if selling_price <= 0 and price > 0:
            selling_price = round(
                price * 1.2
            )

        # ------------------------------------------
        # BARCODE
        # ------------------------------------------

        barcode = str(
            item.get("barcode")
            or item.get("bar_code")
            or ""
        ).strip()

        # ------------------------------------------
        # NORMALIZED ITEM
        # ------------------------------------------

        extracted_items.append({
            "productName": str(name).strip().title(),
            "quantity": qty,
            "unit": unit,
            "purchasePrice": price,
            "sellingPrice": selling_price,
            "barcode": barcode
        })

    return extracted_items


@app.route('/api/v1/invoices/upload', methods=['POST'])
@jwt_required() # 🚀 SECURITY: Block unauthorized API abuse
def upload_invoice():
    file_key = 'file' if 'file' in request.files else ('invoice' if 'invoice' in request.files else None)
    
    if not file_key:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files[file_key]
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    # Validate the extension AND the actual file content —
    # extension alone can be spoofed
    ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
    filename_lower = file.filename.lower()
    if not any(filename_lower.endswith(ext) for ext in ALLOWED_EXTENSIONS):
        return jsonify({"error": "Only JPG, PNG, or WEBP images are allowed."}), 400


    # 🚀 SAFE HANDLING: Read into memory so BOTH Cloud and Local can read it safely
    file_bytes = file.read()

    # Confirm it's actually a valid, openable image (not just a
    # renamed .exe or corrupted file with a fake extension)
    try:
        test_image = Image.open(BytesIO(file_bytes))
        test_image.verify()
    except Exception:
        return jsonify({"error": "The uploaded file is not a valid image."}), 400
    
    # STAGE 1: Try Fast Gemini Cloud Engine (Strict Schema)
    try:
        print("\n📸 Invoice received! Optimizing image for AI...")
        # Create a fresh stream from the bytes for PIL
        image_stream = BytesIO(file_bytes)
        image = Image.open(image_stream)
        image.thumbnail((1500, 1500)) 

        prompt = """
            Extract every purchased inventory item from this wholesale bill.

            You are building inventory for a general Indian kirana / grocery shop.

            For EVERY item, return:

            1. productName
            2. quantity
            3. unit
            4. purchasePrice
            5. sellingPrice

            ==================================================
            UNIVERSAL UNIT RULE
            ==================================================

            The unit MUST be one of:

            PCS
            GRAM
            KG
            ML
            LITRE
            PACK
            BOX
            BOTTLE
            DOZEN
            STRIP
            CARTON
            BUNDLE

            ==================================================
            IMPORTANT UNIT DISTINCTION
            ==================================================

            Do NOT confuse quantity with unit.

            Examples:

            "500g sugar"
            quantity = 500
            unit = "GRAM"

            "2 kg sugar"
            quantity = 2
            unit = "KG"

            "5 litre oil"
            quantity = 5
            unit = "LITRE"

            "6 bottles milk"
            quantity = 6
            unit = "BOTTLE"

            "10 packets biscuits"
            quantity = 10
            unit = "PACK"

            "4 biscuit packets"
            quantity = 4
            unit = "PACK"

            "12 pieces soap"
            quantity = 12
            unit = "PCS"

            "2 boxes biscuits"
            quantity = 2
            unit = "BOX"

            "1 dozen eggs"
            quantity = 1
            unit = "DOZEN"

            ==================================================
            KIRANA-SPECIFIC RULE
            ==================================================

            For packaged products, use the package unit.

            Examples:

            Biscuit packet -> PACK
            Milk packet -> PACK
            Chips packet -> PACK
            Noodles packet -> PACK
            Soap bar -> PCS
            Shampoo bottle -> BOTTLE
            Oil bottle -> BOTTLE
            Water bottle -> BOTTLE
            Medicine strip -> STRIP
            Carton of bottles -> CARTON

            Do not convert PACK into PCS unless the bill explicitly says individual pieces.

            ==================================================
            WEIGHTED BULK ITEMS
            ==================================================

            If the bill says:

            "SUGAR 50KG Rs 2000"

            then:

            quantity = 50
            unit = "KG"
            purchasePrice = 40

            because Rs 2000 / 50 KG = Rs 40 per KG.

            Do NOT return:

            quantity = 2000
            unit = KG

            ==================================================
            PRICING
            ==================================================

            purchasePrice should represent the cost corresponding to ONE inventory unit.

            Examples:

            50 KG sugar costing Rs 2000:

            quantity = 50
            unit = KG
            purchasePrice = 40

            10 biscuit packets costing Rs 300:

            quantity = 10
            unit = PACK
            purchasePrice = 30

            6 bottles oil costing Rs 900:

            quantity = 6
            unit = BOTTLE
            purchasePrice = 150

            If sellingPrice/MRP is visible, use it.

            If sellingPrice is not visible:

            sellingPrice = purchasePrice * 1.2

            ==================================================
            OCR UNCERTAINTY
            ==================================================

            If the unit cannot be confidently determined from the bill,
            use PCS.

            Never invent a unit that is not supported by the image.

            Return ONLY valid JSON matching the requested schema.
            """

        response = ai_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[image, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "required": ["extracted_data"], # 🚀 ENFORCEMENT: Root key is mandatory
                    "properties": {
                        "extracted_data": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                # 🚀 ENFORCEMENT: All 4 keys must be returned for every item
                                "required": [
                                        "productName",
                                        "quantity",
                                        "unit",
                                        "purchasePrice",
                                        "sellingPrice"
                                    ],
                                "properties": {
                                    "productName": {
                                        "type": "STRING"
                                    },

                                    "quantity": {
                                        "type": "NUMBER"
                                    },

                                    "unit": {
                                        "type": "STRING",
                                        "enum": [
                                            "PCS",
                                            "GRAM",
                                            "KG",
                                            "ML",
                                            "LITRE",
                                            "PACK",
                                            "BOX",
                                            "BOTTLE",
                                            "DOZEN",
                                            "STRIP",
                                            "CARTON",
                                            "BUNDLE"
                                        ]
                                    },

                                    "purchasePrice": {
                                        "type": "NUMBER"
                                    },

                                    "sellingPrice": {
                                        "type": "NUMBER"
                                    }
                                }
                            }
                        }
                    }
                }
            )
        )

        tokens_used = response.usage_metadata.total_token_count
        print(f"💰 Gemini Tokens Used for Invoice: {tokens_used}")

        result_json = json.loads(response.text)
        items = result_json.get("extracted_data") or []

        print(f"⚡ Cloud Engine Success: Extracted {len(items)} items!")
        return jsonify({"extracted_data": items, "status": "SUCCESS"}), 200

    except Exception as cloud_err:
        print(f"⚠️ Cloud Engine Unavailable ({cloud_err}). Falling back to Local Donut ML...")
        
        # STAGE 2: Local Donut ML Fallback
        try:
            # Create a fresh, untouched stream from the original bytes for Donut ML
            fallback_stream = BytesIO(file_bytes)
            raw_donut_json = process_invoice_image(fallback_stream)
            formatted_items = clean_donut_output(raw_donut_json)
            
            print(f"✅ Local Fallback Extracted {len(formatted_items)} items!")
            return jsonify({"extracted_data": formatted_items, "status": "SUCCESS_LOCAL"}), 200

        except Exception as local_err:
            print("\n❌ Both Cloud and Local Extraction Failed:")
            traceback.print_exc()
            return jsonify({"error": "Invoice extraction failed", "details": str(local_err)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return {"status": "online"}, 200


# ==========================================
# 🎙️ 100% OFFLINE VOICE PARSER ROUTE
# ==========================================

@app.route('/api/v1/ai/parse-intent', methods=['POST'])
@jwt_required()
def parse_intent():
    data = request.json or {}
    text = data.get('text', '')
    inventory_names = data.get('inventory_names', [])

    if not text:
        return jsonify({"error": "No speech text provided"}), 400

    try:
        local_result = parse_with_rules(text, inventory_names=inventory_names)
        print(f"⚡ Confidence: {local_result['confidence']} | Intent: {local_result['intent']} | Command: '{text}'")

        local_result['source'] = 'LOCAL_HYBRID_ENGINE'
        return jsonify(local_result), 200

    except Exception as e:
        print(f"❌ Local Parser Error: {e}")
        return jsonify({"error": "Voice parsing failed", "details": str(e)}), 500


# ==========================================
# 🔐 AUTHENTICATION & PROFILE ROUTES 
# ==========================================

@app.route('/api/v1/auth/register', methods=['POST'])
@limiter.limit("5 per hour")
def register():
    data = request.json or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password')
    shop_name = data.get('shop_name')

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    # Basic email format check
    if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
        return jsonify({"error": "Please enter a valid email address."}), 400

    is_valid, reason = is_strong_password(password)
    if not is_valid:
        return jsonify({"error": reason}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "User already exists"}), 400

    new_user = User(
        email=email,
        password_hash=generate_password_hash(password),
        shop_name=shop_name
    )
    db.session.add(new_user)
    db.session.commit()

    return jsonify({"message": "Shop registered successfully"}), 201



@app.route('/api/v1/auth/login', methods=['POST'])
@limiter.limit("10 per minute")
def login():
    data = request.json or {}
    
    # 🚀 FIX: Prevent case-sensitivity 401 errors
    email = data.get('email', '').strip().lower()
    password = data.get('password')

    user = User.query.filter_by(email=email).first()
    
    # 🚀 FIX: Catch Google SSO users before throwing a generic 401
    if user and user.password_hash == "GOOGLE_SSO_USER":
        return jsonify({"error": "Please log in using the 'Continue with Google' button."}), 401

    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid credentials"}), 401

    # 📍 Capture IP and resolve region on login
    client_ip = get_client_ip(request)
    loc_data = resolve_ip_location(client_ip)
    
    user.last_ip = client_ip
    user.city = loc_data['city']
    user.state = loc_data['state']
    user.country = loc_data['country']
    
    db.session.commit()

    access_token = create_access_token(identity=email)
    return jsonify({"access_token": access_token, "user_id": user.id, "email": user.email, "shop_name": user.shop_name}), 200

@app.route('/api/v1/auth/forgot-password', methods=['POST'])
@limiter.limit("3 per hour")
def forgot_password():
    data = request.get_json() or {}
    # 🚀 FIX: Normalize email
    email = data.get('email', '').strip().lower()

    user = User.query.filter_by(email=email).first()

    if user:
        otp = str(random.randint(100000, 999999))
        user.reset_otp = otp
        user.reset_otp_expiry = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=10)
        db.session.commit()

        try:
            msg = Message(
                subject="StoreMate - Password Reset OTP",
                recipients=[user.email],
                body=f"Hello,\n\nYour 6-digit password reset OTP for StoreMate is: {otp}\n\nThis code is valid for 10 minutes. If you did not request this, please ignore this email."
            )
            mail.send(msg)
        except Exception as e:
            print("Failed to send email:", str(e))
            return jsonify({"error": "Failed to send email. Check server SMTP settings."}), 500

    return jsonify({"message": "If that email is registered, a 6-digit OTP has been sent."}), 200


@app.route('/api/v1/auth/reset-password', methods=['POST'])
@limiter.limit("5 per 10 minute")
def reset_password():
    data = request.get_json() or {}
    email = data.get('email')
    otp = data.get('otp')
    new_password = data.get('new_password')

    if not email or not otp or not new_password:
        return jsonify({"error": "Email, OTP, and new password are required."}), 400

    user = User.query.filter_by(email=email).first()

    if not user or not user.reset_otp or user.reset_otp != otp:
        return jsonify({"error": "Invalid OTP code."}), 400

    now = datetime.datetime.now(datetime.timezone.utc)
    expiry = user.reset_otp_expiry.replace(tzinfo=datetime.timezone.utc) if user.reset_otp_expiry.tzinfo is None else user.reset_otp_expiry

    if now > expiry:
        return jsonify({"error": "OTP has expired. Please request a new one."}), 400

    user.password_hash = generate_password_hash(new_password)
    user.reset_otp = None
    user.reset_otp_expiry = None
    db.session.commit()

    return jsonify({"message": "Password updated successfully! You can now log in."}), 200


@app.route('/api/v1/auth/google', methods=['POST'])
def google_auth():
    data = request.get_json() or {}
    token = data.get('token')
    
    CLIENT_ID = os.getenv("GOOGLE_WEB_CLIENT_ID")

    if not CLIENT_ID:
        return jsonify({"error": "Google OAuth is not configured"}), 500

    if not token:
        return jsonify({"error": "Google token is missing"}), 400

    try:
        # 1. Verify token with Google's servers
        idinfo = id_token.verify_oauth2_token(token, requests.Request(), CLIENT_ID)
        
        # 🚀 FIX: Normalize Google's email to lowercase
        email = idinfo['email'].strip().lower()
        name = idinfo.get('name', 'My Shop')
        
        # 🚀 FIX: Use ilike() for case-insensitive lookup to prevent duplicate accounts
        user = User.query.filter(User.email.ilike(email)).first()
        
        if not user:
            shop_name = data.get('shop_name') or f"{name.split(' ')[0]}'s Shop"
            user = User(
                email=email,
                shop_name=shop_name,
                password_hash="GOOGLE_SSO_USER"
            )
            db.session.add(user)
            db.session.commit()

        # 3. Generate JWT access token
        access_token = create_access_token(identity=user.email)
        
        return jsonify({"message": "Authenticated successfully", "access_token": access_token, "user_id": user.id, "shop_name": user.shop_name, "email": user.email}), 200

    except ValueError as ve:
        print(f"❌ Google Token Verification ValueError: {ve}")
        return jsonify({"error": "Invalid Google token", "details": str(ve)}), 401
    except Exception as e:
        print(f"❌ Unexpected Error during Google Auth: {e}")
        traceback.print_exc()
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

@app.route('/api/v1/auth/profile', methods=['PUT'])
@jwt_required()
def update_profile():

    current_user_email = get_jwt_identity()

    user = User.query.filter_by(
        email=current_user_email
    ).first()

    if not user:
        return jsonify({
            "error": "User not found"
        }), 404

    data = request.get_json(silent=True) or {}

    if 'shop_name' in data:
        user.shop_name = str(
            data['shop_name']
        ).strip()

    if 'phone' in data:
        user.phone = str(
            data['phone']
        ).strip()

    if 'address' in data:
        user.address = str(
            data['address']
        ).strip()

    if 'upi_id' in data:
        user.upi_id = str(
            data['upi_id']
        ).strip()

    db.session.commit()

    return jsonify({

        "message":
            "Profile updated successfully",

        "email":
            user.email,

        "shop_name":
            user.shop_name or "",

        "phone":
            user.phone or "",

        "address":
            user.address or "",

        "upi_id":
            user.upi_id or "",

    }), 200


@app.route('/api/v1/feedback', methods=['POST'])
def submit_feedback():
    data = request.json or {}
    user_identifier = data.get('user_id')
    message = data.get('message')

    if not user_identifier or not message:
        return jsonify({"error": "User ID and message are required"}), 400

    try:
        user_id = None
        if isinstance(user_identifier, int) or (isinstance(user_identifier, str) and user_identifier.isdigit()):
            user_id = int(user_identifier)
        else:
            user = User.query.filter_by(email=str(user_identifier)).first()
            if user:
                user_id = user.id

        if not user_id:
            first_user = User.query.first()
            user_id = first_user.id if first_user else 1

        new_feedback = Feedback(user_id=user_id, message=message)
        db.session.add(new_feedback)
        db.session.commit()
        return jsonify({"success": True, "message": "Feedback received"}), 201
    except Exception as e:
        db.session.rollback()
        print(f"❌ Feedback Error: {e}")
        return jsonify({"error": str(e)}), 500


# ==========================================
# 👑 SUPER ADMIN ROUTES
# ==========================================

@app.route('/api/v1/admin/users', methods=['GET'])
@jwt_required()
def get_all_users():
    current_user_email = get_jwt_identity()
    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "connect.manim@gmail.com")
    
    if current_user_email != ADMIN_EMAIL:
        return jsonify({"error": "Access Denied. Super Admins only."}), 403

    users = User.query.order_by(User.id.desc()).all()
    
    user_list = []
    for u in users:
        user_list.append({
            "id": u.id,
            "email": u.email,
            "shop_name": u.shop_name,
            "phone": u.phone or "No Phone"
        })

    return jsonify({
        "total_shops": len(user_list),
        "users": user_list
    }), 200

@app.route('/admin/telemetry-dashboard')
@admin_session_required
def admin_dashboard_ui():
    return render_template('admin/admin_dashboard.html')

@app.route('/admin/dashboard')
@admin_session_required
def admin_merchant_dashboard():
    return render_template('admin/dashboard.html')


#--------------User Facing Routes----------------#


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/how-it-works")
def how_it_works():
    return render_template("how-it-works.html")


@app.route("/features")
def features():
    return render_template("features.html")


@app.route("/security")
def security():
    return render_template("security.html")


@app.route("/about")
def about():
    return render_template("about.html")


@app.route("/privacy")
def privacy():
    return render_template("privacy.html")


@app.route("/terms")
def terms():
    return render_template("terms.html")

@app.route("/contact", methods=["GET", "POST"])
def contact():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip()
        reason = request.form.get("reason", "").strip()
        message = request.form.get("message", "").strip()

        # TODO: validate, rate-limit, CSRF-protect, and save/send safely.
        if not name or not email or not message:
            flash("Please complete the required fields.", "error")
            return redirect(url_for("contact"))

        # TODO: send via your configured email provider or save to DB.
        flash("Thanks. Your message has been received.", "success")
        return redirect(url_for("contact"))

    return render_template("contact.html")


@app.route("/get-started")
def get_started():
    return render_template("get-started.html")


@app.errorhandler(404)
def page_not_found(error):
    return render_template("404.html"), 404


@app.route("/sitemap.xml")
def sitemap():
    return app.send_static_file("sitemap.xml")


@app.route("/robots.txt")
def robots():
    return app.send_static_file("robots.txt")

#________________________________________________________________________________________

if __name__ == '__main__':
    debug_mode = os.getenv('FLASK_DEBUG', '0') == '1'
    app.run(host='0.0.0.0', port=5050, debug=debug_mode)
