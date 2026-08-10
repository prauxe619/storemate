from flask import Blueprint, render_template, request, redirect, url_for, session, flash
from functools import wraps
from models import db, User, SalesTransaction, LedgerEntry, AuditLog, Subscription
from werkzeug.security import check_password_hash
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

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
                return redirect(url_for('admin_web.dashboard'))
                
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def log_audit_action(action, target_id=None):
    admin_id = session.get('admin_id')
    ip = request.remote_addr
    log = AuditLog(admin_id=admin_id, action=action, target_id=target_id, ip_address=ip)
    db.session.add(log)
    db.session.commit()

@admin_web_bp.route('/admin/login', methods=['GET', 'POST'])
@limiter.limit("5 per minute")
def login():
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        user = User.query.filter_by(email=email).first()
        
        if user and user.role in ['SUPER_ADMIN', 'ADMIN'] and check_password_hash(user.password_hash, password):
            if getattr(user, 'is_active', True) == False:
                flash("This admin account has been suspended.", "error")
                return render_template('login.html')

            session['admin_email'] = user.email
            session['admin_id'] = user.id
            session['admin_role'] = user.role 
            
            log_audit_action("ADMIN_LOGGED_IN")
            return redirect(url_for('admin_web.dashboard'))
        
        flash("Invalid admin credentials.", "error")
        
    return render_template('login.html')

@admin_web_bp.route('/admin/logout')
def logout():
    log_audit_action("ADMIN_LOGGED_OUT")
    session.clear()
    return redirect(url_for('admin_web.login'))

@admin_web_bp.route('/admin/dashboard')
@roles_required('SUPER_ADMIN', 'ADMIN')
def dashboard():
    total_merchants = User.query.filter(~User.role.in_(['SUPER_ADMIN', 'ADMIN'])).count()
    
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

    merchants = User.query.filter(~User.role.in_(['SUPER_ADMIN', 'ADMIN'])).limit(20).all()

    return render_template(
        'dashboard.html',
        total_merchants=total_merchants,
        total_gmv=total_gmv,
        total_khata=total_khata,
        mrr=mrr,
        arr=arr,
        merchants=merchants
    )

# 🚀 PHASE 2: Detailed Merchant CRM Inspection Drawer
@admin_web_bp.route('/admin/merchant/<int:user_id>')
@roles_required('SUPER_ADMIN', 'ADMIN')
def merchant_detail(user_id):
    merchant = User.query.get_or_404(user_id)
    
    # Calculate store metrics using the newly added user_id column
    merchant_sales = db.session.query(db.func.sum(SalesTransaction.total_amount))\
                               .filter(SalesTransaction.user_id == user_id).scalar() or 0.0
                               
    transaction_count = SalesTransaction.query.filter_by(user_id=user_id).count()
    
    # Fetch recent audit logs for this store
    logs = AuditLog.query.filter_by(target_id=user_id).order_by(AuditLog.timestamp.desc()).limit(10).all()

    return render_template(
        'merchant_detail.html',
        merchant=merchant,
        merchant_sales=merchant_sales,
        transaction_count=transaction_count,
        logs=logs
    )

@admin_web_bp.route('/admin/merchant/<int:user_id>/toggle-status', methods=['POST'])
@roles_required('SUPER_ADMIN')
def toggle_merchant_status(user_id):
    user = User.query.get_or_404(user_id)
    if user.id == session.get('admin_id'):
        flash("You cannot suspend your own account.", "error")
        return redirect(url_for('admin_web.dashboard'))

    new_status = not getattr(user, 'is_active', True)
    user.is_active = new_status
    
    action = "MERCHANT_REACTIVATED" if new_status else "MERCHANT_SUSPENDED"
    log_audit_action(action, target_id=user.id)
    
    flash(f"Updated status for {user.shop_name or user.email}", "success")
    return redirect(url_for('admin_web.dashboard'))