from flask import Flask, json, request, jsonify
from google import genai
from PIL import Image
from google.genai import types
from models import db, InventoryItem, LedgerEntry, SalesTransaction, User
from ai_service import process_invoice_image 
import os
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import JWTManager, create_access_token
import traceback
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from datetime import timedelta
from src.schemas import ParsedReceipt
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Ensure an 'uploads' directory exists
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# PostgreSQL credentials
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://storemate_admin:secretpassword123@localhost:5433/storemate_dev'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# 🔐 Setup JWT Authentication
app.config['JWT_SECRET_KEY'] = 'storemate-super-secret-key-2026-v2' # Now it is safely over 32 characters!
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=30) # ✅ NEW: Keeps users logged in for 30 days
ai_client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))


jwt = JWTManager(app)

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

# 🛠️ Temporary fake database for testing users (Move this to models.py later!)
users_db = {}


@app.route("/")
def home():
    return {
        "status": "running",
        "service": "StoreMate Backend",
        "version": "1.0"
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
        # Helper function to prevent SQLAlchemy crashes from unknown fields
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
# 🤖 AI INVOICE SCANNER ROUTE
# ==========================================

@app.route('/api/v1/invoices/upload', methods=['POST'])
def upload_invoice():
    file_key = 'file' if 'file' in request.files else ('invoice' if 'invoice' in request.files else None)
    
    if not file_key:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files[file_key]
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    try:
        print("\n📸 Image received! Sending to Gemini 2.5 Flash...")
        image = Image.open(file.stream)

        # 🚀 UPGRADED: Smart Bulk-to-Retail AI Prompt
        response = ai_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[
                image,
                """Extract ONLY purchased line items from this wholesale bill. 
                CRITICAL MATH RULE FOR RETAIL:
                Wholesalers sell in bulk sacks, but this shop sells per 1 KG. IF an item indicates a bulk loose weight in its name (e.g., 'CHANA 50 KG', 'SOYABEAN 15 KG'):
                1. Multiply the billed quantity by the package weight to get the total base `quantity` in KGs (e.g., 2 sacks of 15 KG = 30). 
                2. Divide the total item amount by this new total quantity to get the `purchase_price` PER 1 KG (e.g., ₹2760 / 50 KG = ₹55.20). 
                3. Rename the item to indicate it is loose (e.g., rename 'CHANA 50 KG' to 'CHANA (Per KG)').
                
                IF an item is a standard packaged good (e.g., 'BESAN 500 GM', 'PARLE-G', 'OIL 1 KG'):
                Leave the name alone, extract the exact billed quantity (Pieces/Packets), and extract the per-packet rate as the `purchase_price`.
                
                Do not guess the MRP if missing (leave null)."""
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ParsedReceipt, 
            ),
        )

        raw_json = json.loads(response.text)
        
        # 🟢 Print exactly what Gemini saw to your terminal
        print("🧠 GEMINI SUCCESSFULLY EXTRACTED:")
        print(json.dumps(raw_json, indent=2)) 
        
        items_list = raw_json.get("items", [])

        return jsonify({
            "extracted_data": items_list,
            "status": "SUCCESS"
        }), 200

    except Exception as e:
        print("\n❌ GEMINI ERROR:")
        traceback.print_exc()
        return jsonify({"error": "Gemini Extraction Failed", "details": str(e)}), 500


@app.route('/health', methods=['GET'])
def health_check():
    return {"status": "online"}, 200

# ==========================================
# 🔐 AUTHENTICATION ROUTES (PostgreSQL Version)
# ==========================================

@app.route('/api/v1/auth/register', methods=['POST'])
def register():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    shop_name = data.get('shop_name')

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400
    
    # Check if user exists in the database
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "User already exists"}), 400

    # Securely hash the password and save to DB
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
    data = request.json
    email = data.get('email')
    password = data.get('password')

    # Find the user in the database
    user = User.query.filter_by(email=email).first()
    
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid email or password"}), 401

    access_token = create_access_token(identity=email)
    
    return jsonify({
        "access_token": access_token,
        "shop_name": user.shop_name
    }), 200


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
        "phone": user.phone or ""
    }), 200


@app.route('/api/v1/auth/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    current_user_email = get_jwt_identity()
    user = User.query.filter_by(email=current_user_email).first()
    
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    data = request.json
    
    # Update the database record
    user.shop_name = data.get('shop_name', user.shop_name)
    user.phone = data.get('phone', user.phone)
    
    db.session.commit()
    
    return jsonify({
        "message": "Profile updated successfully", 
        "shop_name": user.shop_name,
        "phone": user.phone
    }), 200


# ==========================================
# 👑 SUPER ADMIN ROUTES
# ==========================================

@app.route('/api/v1/admin/users', methods=['GET'])
@jwt_required()
def get_all_users():
    current_user_email = get_jwt_identity()
    
    # 🛑 SECURITY: Only allow your specific email to access this data
    ADMIN_EMAIL = "superadmin@gmail.com" 
    
    if current_user_email != ADMIN_EMAIL:
        return jsonify({"error": "Access Denied. Super Admins only."}), 403

    # Fetch all users, newest first
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
    app.run(host='0.0.0.0', port=5050, debug=True)