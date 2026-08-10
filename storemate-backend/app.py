import os
import re
import io
import json
import traceback
from flask import Flask, request, jsonify
from PIL import Image
from google import genai
from google.genai import types
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from datetime import timedelta
from dotenv import load_dotenv
from google.oauth2 import id_token
from google.auth.transport import requests
import random
import datetime
from flask_mail import Mail, Message

# Local Imports
from models import db, InventoryItem, LedgerEntry, SalesTransaction, User, Feedback
from ai_service import process_invoice_image 
from src.hybrid_parser import parse_with_rules
from admin_web import admin_web_bp, limiter

# Load environment variables
load_dotenv()

# Ensure an 'uploads' directory exists
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "YOUR_SUPER_SECRET_SESSION_KEY")

# Register Web Admin Blueprint
limiter.init_app(app)
app.register_blueprint(admin_web_bp)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Configure Flask-Mail
app.config['MAIL_SERVER'] = os.getenv('MAIL_SERVER', 'smtp.gmail.com')
app.config['MAIL_PORT'] = int(os.getenv('MAIL_PORT', 587))
app.config['MAIL_USE_TLS'] = os.getenv('MAIL_USE_TLS', 'True') == 'True'
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD')
app.config['MAIL_DEFAULT_SENDER'] = os.getenv('MAIL_USERNAME')

mail = Mail(app)

# PostgreSQL credentials
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
    'DATABASE_URL',
    'postgresql://storemate_admin:secretpassword123@localhost:5433/storemate_dev'
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Setup JWT Authentication
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY')

if not app.config['JWT_SECRET_KEY']:
    raise RuntimeError("JWT_SECRET_KEY environment variable is not configured")

app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=30) 

jwt = JWTManager(app)

# Initialize Gemini AI Client
ai_client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

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

db.init_app(app)

# Create tables if they don't exist
with app.app_context():
    db.create_all()

@app.route("/")
def home():
    return {
        "status": "running",
        "service": "StoreMate Backend (Optimized Dual-Engine)",
        "version": "3.0"
    }

# ==========================================
# ☁️ SYNC ROUTE
# ==========================================

@app.route('/api/sync', methods=['POST'])
def sync_data():
    data = request.json
    if not data:
        return jsonify({"error": "No data"}), 400

    try:
        def sanitize_data(model_class, incoming_data):
            valid_keys = [c.name for c in model_class.__table__.columns]
            return {k: v for k, v in incoming_data.items() if k in valid_keys}

        # 1. Sync Inventory
        for item_data in data.get('inventory', []):
            item = db.session.get(InventoryItem, item_data.get('id'))
            if item:
                for key, value in sanitize_data(InventoryItem, item_data).items():
                    setattr(item, key, value)
            else:
                clean_data = sanitize_data(InventoryItem, item_data)
                db.session.add(InventoryItem(**clean_data))

        # 2. Sync Ledger
        for entry_data in data.get('ledger', []):
            if not db.session.get(LedgerEntry, entry_data.get('id')):
                clean_data = sanitize_data(LedgerEntry, entry_data)
                db.session.add(LedgerEntry(**clean_data))

        # 3. Sync Sales
        sales_count = 0
        for sale_data in data.get('sales', []):
            if not db.session.get(SalesTransaction, sale_data.get('id')):
                clean_data = sanitize_data(SalesTransaction, sale_data)
                db.session.add(SalesTransaction(**clean_data))
                sales_count += 1

        db.session.commit()
        print(f"✅ Synced: {len(data.get('inventory', []))} items, {len(data.get('ledger', []))} khata, {sales_count} sales.")
        return jsonify({"status": "success", "message": "Database updated"}), 200

    except Exception as e:
        db.session.rollback()
        print("❌ SYNC CRASHED!")
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


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
def upload_invoice():
    file_key = 'file' if 'file' in request.files else ('invoice' if 'invoice' in request.files else None)
    
    if not file_key:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files[file_key]
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    # STAGE 1: Try Fast Gemini Cloud Engine (Strict Schema)
    try:
        print("\n📸 Invoice received! Optimizing image for AI...")
        image = Image.open(file.stream)
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
                    "properties": {
                        "extracted_data": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
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
            file.stream.seek(0)
            raw_donut_json = process_invoice_image(file.stream)
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
    email = data.get('email')
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
    email = data.get('email')
    password = data.get('password')

    user = User.query.filter_by(email=email).first()
    
    if not user:
        return jsonify({"error": "Invalid email or password"}), 401

    if user.password_hash == "GOOGLE_SSO_USER":
        return jsonify({
            "error": "This account uses Google Login. Tap 'Continue with Google', or tap 'Forgot Password' to create a password for this account."
        }), 400

    if not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid email or password"}), 401

    access_token = create_access_token(identity=email)
    
    return jsonify({
        "access_token": access_token,
        "shop_name": user.shop_name
    }), 200


@app.route('/api/v1/auth/forgot-password', methods=['POST'])
def forgot_password():
    data = request.get_json() or {}
    email = data.get('email')

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
    
    CLIENT_ID = "106180836013-ve839dtddc46540n1pi6q3gfjd97ol3p.apps.googleusercontent.com"

    if not token:
        return jsonify({"error": "Google token is missing"}), 400

    try:
        # 1. Verify token with Google's servers
        idinfo = id_token.verify_oauth2_token(token, requests.Request(), CLIENT_ID)
        
        email = idinfo['email']
        name = idinfo.get('name', 'My Shop')
        
        # 2. Check if user exists
        user = User.query.filter_by(email=email).first()
        
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
        
        return jsonify({
            "message": "Authenticated successfully",
            "access_token": access_token,
            "shop_name": user.shop_name,
            "email": user.email
        }), 200

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
        
    # 🚀 FIX 1: Safely return phone, address, and upi_id if columns exist
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
    
    # 🚀 FIX 2: Save address and upi_id from mobile request
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
        # 🚀 FIX 3: Convert string/email user_id into valid Integer foreign key
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
    ADMIN_EMAIL = "superadmin@gmail.com" 
    
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


if __name__ == '__main__':
    debug_mode = os.getenv('FLASK_DEBUG', '0') == '1'
    app.run(host='0.0.0.0', port=5050, debug=debug_mode)