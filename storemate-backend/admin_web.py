from flask import Blueprint, render_template, request, redirect, url_for, session, flash
from functools import wraps
from models import db, User, SalesTransaction, LedgerEntry, AuditLog, Subscription
from werkzeug.security import check_password_hash
from flask_jwt_extended import create_access_token
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from admin_analytics_bp import is_super_admin, log_admin_action

limiter = Limiter(key_func=get_remote_address, storage_uri="memory://")
admin_web_bp = Blueprint('admin_web', __name__, template_folder='templates')

def roles_required(*roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            admin_email = session.get('admin_email')
            admin_role = session.get('admin_role')
            
            if not admin_email or not admin_role:
                flash("Unauthorized access. Please log in.", "error")
                return redirect(url_for('admin_web.login'))
                
            if admin_role not in roles:
                flash("Insufficient privileges for this action.", "error")
                # 🚀 FIX: Redirect to login, NOT dashboard, to break the infinite loop!
                return redirect(url_for('admin_web.login')) 
                
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def log_audit_action(action, target_id=None):
    admin_id = session.get('admin_id')
    ip = request.remote_addr
    log = AuditLog(admin_id=admin_id, action=action, target_id=target_id, ip_address=ip)
    db.session.add(log)
    db.session.commit()


@admin_web_bp.route('/login', methods=['GET', 'POST'])
@limiter.limit("5 per minute")
def login():
    if request.method == 'GET':
        return render_template('login.html')

    email = request.form.get('email')
    password = request.form.get('password')

    user = User.query.filter_by(email=email).first()

    if user and check_password_hash(user.password_hash, password) and is_super_admin(email):
        # 1. Set Session Cookies for HTML Templates
        session['admin_email'] = email
        session['admin_id'] = user.id
        session['admin_role'] = user.role  # 🚀 FIX: Save the role to the session
        
        # 2. Log Action
        log_admin_action(admin_email=email, action="ADMIN_LOGGED_IN", target_type="User", target_id=user.id)
        
        # 3. Create JWT for API-based Telemetry
        access_token = create_access_token(identity=email)
        
        # Flash success message and redirect
        flash("Successfully authenticated as Super Admin", "success")
        response = redirect(url_for('admin_web.dashboard'))
        response.set_cookie('jwt_token', access_token) # Store JWT in cookie for API calls
        return response

    flash("Invalid credentials or non-admin account.", "error")
    return redirect(url_for('admin_web.login'))

@admin_web_bp.route('/logout')
def logout():
    session.clear()
    flash("Logged out successfully.", "info")
    response = redirect(url_for('admin_web.login'))
    response.delete_cookie('jwt_token')
    return response

@admin_web_bp.route('/admin/dashboard')
@roles_required('SUPERADMIN', 'ADMIN') # 🚀 FIX: Matched exactly to the database role string
def dashboard():
    total_merchants = User.query.filter(~User.role.in_(['SUPERADMIN', 'ADMIN'])).count()
    
    total_gmv_result = db.session.query(db.func.sum(SalesTransaction.total_amount)).scalar()
    total_gmv = total_gmv_result or 0.0

    credit_given = db.session.query(db.func.sum(LedgerEntry.amount)).filter(LedgerEntry.entry_type == 'CREDIT').scalar() or 0.0
    payments_received = db.session.query(db.func.sum(LedgerEntry.amount)).filter(LedgerEntry.entry_type == 'PAYMENT').scalar() or 0.0
    total_khata = max(0.0, credit_given - payments_received)

    # 🚀 PHASE 2: Financial MRR & ARR Calculations
    mrr_result = db.session.query(db.func.sum(Subscription.monthly_price))\
                           .filter(Subscription.status == 'ACTIVE').scalar()
    mrr = mrr_result or 0.0
    arr = mrr * 12

    merchants = User.query.filter(~User.role.in_(['SUPERADMIN', 'ADMIN'])).limit(20).all()

    return render_template(
        'admin/dashboard.html',
        total_merchants=total_merchants,
        total_gmv=total_gmv,
        total_khata=total_khata,
        mrr=mrr,
        arr=arr,
        merchants=merchants
    )

# 🚀 PHASE 2: Detailed Merchant CRM Inspection Drawer
@admin_web_bp.route('/admin/merchant/<int:user_id>')
@roles_required('SUPERADMIN', 'ADMIN')
def merchant_detail(user_id):
    merchant = User.query.get_or_404(user_id)
    
    # Calculate store metrics using the newly added user_id column
    merchant_sales = db.session.query(db.func.sum(SalesTransaction.total_amount))\
                               .filter(SalesTransaction.user_id == user_id).scalar() or 0.0
                               
    transaction_count = SalesTransaction.query.filter_by(user_id=user_id).count()
    
    # Fetch recent audit logs for this store
    logs = AuditLog.query.filter_by(target_id=str(user_id)).order_by(AuditLog.created_at.desc()).limit(10).all()

    return render_template(
        'merchant_detail.html',
        merchant=merchant,
        merchant_sales=merchant_sales,
        transaction_count=transaction_count,
        logs=logs
    )

@admin_web_bp.route('/admin/merchant/<int:user_id>/toggle-status', methods=['POST'])
@roles_required('SUPERADMIN')
def toggle_merchant_status(user_id):
    user = User.query.get_or_404(user_id)
    if user.id == session.get('admin_id'):
        flash("You cannot suspend your own account.", "error")
        return redirect(url_for('admin_web.dashboard'))

    new_status = not getattr(user, 'is_active', True)
    user.is_active = new_status
    
    action = "MERCHANT_REACTIVATED" if new_status else "MERCHANT_SUSPENDED"
    log_audit_action(action, target_id=str(user.id))
    
    flash(f"Updated status for {user.shop_name or user.email}", "success")
    return redirect(url_for('admin_web.dashboard'))