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

from flask import Flask, request, jsonify, render_template, redirect, url_for, session
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

# ==========================================
# 5. DATABASE BINDING
# ==========================================

db.init_app(app)

with app.app_context():
    db.create_all()

@app.route("/")
def home():
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
    current_user_email = get_jwt_identity()
    user = User.query.filter_by(email=current_user_email).first()
    
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    if not data:
        return jsonify({"error": "No payload data provided"}), 400

    try:
        # MASS ASSIGNMENT DEFENSE: Strictly define the exact fields allowed to be updated.
        ALLOWED_INVENTORY = ['id', 'barcode', 'product_name', 'quantity', 'purchase_price', 'selling_price', 'updated_at']
        ALLOWED_LEDGER = ['id', 'customer_id', 'amount', 'entry_type', 'created_at']
        ALLOWED_SALES = ['id', 'total_amount', 'payment_type', 'created_at']

        def sanitize_data(incoming_data, allowed_fields):
            return {k: v for k, v in incoming_data.items() if k in allowed_fields}

        # 1. Sync Inventory
        for item_data in data.get('inventory', []):
            clean_data = sanitize_data(item_data, ALLOWED_INVENTORY)
            item = db.session.get(InventoryItem, clean_data.get('id'))
            
            if item:
                # BOLA/IDOR DEFENSE: Ensure this item actually belongs to the user trying to modify it
                if getattr(item, 'user_id', user.id) == user.id:
                    for key, value in clean_data.items():
                        setattr(item, key, value)
            else:
                clean_data['user_id'] = user.id
                db.session.add(InventoryItem(**clean_data))

        # 2. Sync Ledger
        for entry_data in data.get('ledger', []):
            clean_data = sanitize_data(entry_data, ALLOWED_LEDGER)
            entry = db.session.get(LedgerEntry, clean_data.get('id'))
            
            if entry:
                if getattr(entry, 'user_id', user.id) == user.id:
                    for key, value in clean_data.items():
                        setattr(entry, key, value)
            else:
                clean_data['user_id'] = user.id
                db.session.add(LedgerEntry(**clean_data))

        # 3. Sync Sales
        sales_count = 0
        for sale_data in data.get('sales', []):
            clean_data = sanitize_data(sale_data, ALLOWED_SALES)
            sale = db.session.get(SalesTransaction, clean_data.get('id'))
            
            if sale:
                if getattr(sale, 'user_id', user.id) == user.id:
                    for key, value in clean_data.items():
                        setattr(sale, key, value)
            else:
                clean_data['user_id'] = user.id
                db.session.add(SalesTransaction(**clean_data))
                sales_count += 1

        db.session.commit()
        print(f"✅ Secure Sync: {len(data.get('inventory', []))} items, {len(data.get('ledger', []))} khata, {sales_count} sales for user {user.id}.")
        return jsonify({"status": "success", "message": "Database updated securely"}), 200

    except Exception as e:
        db.session.rollback()
        print("❌ SECURE SYNC CRASHED!")
        traceback.print_exc()
        return jsonify({"status": "error", "message": "Internal processing error"}), 500


# ==========================================
# 🤖 DUAL-ENGINE INVOICE SCANNER ROUTE
# ==========================================

def clean_donut_output(donut_data):
    """Fallback Parser: Cleans raw Donut ML output if Gemini fails"""
    extracted_items = []
    
    def find_items_list(d):
        if isinstance(d, list): return d
        if isinstance(d, dict):
            for k, v in d.items():
                if isinstance(v, list): return v
                res = find_items_list(v)
                if res: return res
        return []

    raw_items = find_items_list(donut_data)
    
    for idx, item in enumerate(raw_items):
        if not isinstance(item, dict): continue
        
        name = (item.get("productName") or item.get("item_name") or item.get("name") or 
                item.get("nm") or item.get("item_title") or item.get("desc") or f"Item #{idx + 1}")
        
        qty_str = str(item.get("quantity") or item.get("qty") or item.get("num") or "1")
        qty_match = re.search(r'(\d+(\.\d+)?)', qty_str)
        qty = float(qty_match.group(1)) if qty_match else 1.0
        
        price_str = str(item.get("purchasePrice") or item.get("price") or item.get("unitprice") or "0")
        price_match = re.search(r'(\d+(\.\d+)?)', price_str)
        price = float(price_match.group(1)) if price_match else 0.0
        
        extracted_items.append({
            "productName": str(name).title(),
            "quantity": qty,
            "purchasePrice": price,
            "sellingPrice": round(price * 1.2) if price > 0 else 0
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

    # 🚀 SAFE HANDLING: Read into memory so BOTH Cloud and Local can read it safely
    file_bytes = file.read()
    
    # STAGE 1: Try Fast Gemini Cloud Engine (Strict Schema)
    try:
        print("\n📸 Invoice received! Optimizing image for AI...")
        # Create a fresh stream from the bytes for PIL
        image_stream = BytesIO(file_bytes)
        image = Image.open(image_stream)
        image.thumbnail((1500, 1500)) 

        prompt = """
        Extract purchased items from this wholesale bill.
        CRITICAL RULES:
        1. If a loose bulk item is listed (e.g. 'SUGAR 50KG Rs 2000'), calculate quantity as 50, purchasePrice as 40, productName as 'Sugar (Per KG)'.
        2. 'sellingPrice' must default to purchasePrice * 1.2
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
                                "required": ["productName", "quantity", "purchasePrice", "sellingPrice"],
                                "properties": {
                                    "productName": {"type": "STRING"},
                                    "quantity": {"type": "NUMBER"},
                                    "purchasePrice": {"type": "NUMBER"},
                                    "sellingPrice": {"type": "NUMBER"}
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
def parse_intent():
    data = request.json or {}
    text = data.get('text', '')
    inventory_names = data.get('inventory_names', []) 

    if not text:
        return jsonify({"error": "No speech text provided"}), 400

    try:
        local_result = parse_with_rules(text, inventory_names=inventory_names)
        print(f"⚡ Local Parser Confidence: {local_result['confidence']} for command: '{text}'")

        local_result['source'] = 'LOCAL_HYBRID_ENGINE'
        return jsonify(local_result), 200

    except Exception as e:
        print(f"❌ Local Parser Error: {e}")
        return jsonify({"error": "Voice parsing failed", "details": str(e)}), 500


# ==========================================
# 🔐 AUTHENTICATION & PROFILE ROUTES 
# ==========================================

@app.route('/api/v1/auth/register', methods=['POST'])
def register():
    data = request.json or {}
    # 🚀 FIX: Normalize email
    email = data.get('email', '').strip().lower()
    password = data.get('password')
    shop_name = data.get('shop_name')

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400
    
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

@app.route('/api/v1/auth/profile', methods=['GET'])
@jwt_required()
def get_profile():
    current_user_email = get_jwt_identity() 
    user = User.query.filter_by(email=current_user_email).first()
    
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    return jsonify({
        "email": user.email,
        "shop_name": user.shop_name,
        "phone": getattr(user, 'phone', '') or "",
        "address": getattr(user, 'address', '') or "",
        "upi_id": getattr(user, 'upi_id', '') or ""
    }), 200


@app.route('/api/v1/auth/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    current_user_email = get_jwt_identity()
    user = User.query.filter_by(email=current_user_email).first()
    
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    data = request.json or {}
    
    user.shop_name = data.get('shop_name', user.shop_name)
    user.phone = data.get('phone', user.phone)
    
    if hasattr(user, 'address') and 'address' in data:
        user.address = data['address']
    if hasattr(user, 'upi_id') and 'upi_id' in data:
        user.upi_id = data['upi_id']
    
    db.session.commit()
    
    return jsonify({
        "message": "Profile updated successfully", 
        "shop_name": user.shop_name,
        "phone": user.phone,
        "address": getattr(user, 'address', ''),
        "upi_id": getattr(user, 'upi_id', '')
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

# 1. Telemetry Control Center Dashboard
@app.route('/admin/telemetry-dashboard')
def admin_dashboard_ui():
    return render_template('admin_dashboard.html')

# 2. Main Merchant Management Dashboard
@app.route('/admin/dashboard')
def admin_merchant_dashboard():
    return render_template('dashboard.html')

@app.route('/health')
def health():
    return {'status': 'ok'}, 200
#________________________________________________________________________________________

if __name__ == '__main__':
    debug_mode = os.getenv('FLASK_DEBUG', '0') == '1'
    app.run(host='0.0.0.0', port=5050, debug=debug_mode)
