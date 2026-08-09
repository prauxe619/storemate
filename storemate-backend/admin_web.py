from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify
from functools import wraps
from models import db, User, SalesTransaction, LedgerEntry
from datetime import datetime, timedelta
from werkzeug.security import check_password_hash

# 🚀 FIX: Set template folder to 'templates' to match your root directory structure
admin_web_bp = Blueprint('admin_web', __name__, template_folder='templates')

def superadmin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        admin_email = session.get('admin_email')
        if not admin_email or admin_email != 'connect.manim@gmail.com':
            flash("Unauthorized access. Please log in as Super Admin.", "danger")
            return redirect(url_for('admin_web.login'))
        return f(*args, **kwargs)
    return decorated_function


@admin_web_bp.route('/admin/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')

        # Authenticate superadmin
        user = User.query.filter_by(email=email).first()
        
        # Verify the password securely
        if user and user.email == 'connect.manim@gmail.com' and check_password_hash(user.password_hash, password):
            session['admin_email'] = user.email
            session['admin_id'] = user.id
            return redirect(url_for('admin_web.dashboard'))
        
        flash("Invalid admin credentials.", "error")
        
    return render_template('login.html')


@admin_web_bp.route('/admin/logout')
def logout():
    session.pop('admin_email', None)
    session.pop('admin_id', None)
    return redirect(url_for('admin_web.login'))


@admin_web_bp.route('/admin/dashboard')
@superadmin_required
def dashboard():
    # 1. Total Metrics
    total_merchants = User.query.filter(User.email != 'connect.manim@gmail.com').count()
    
    # Calculate Total Network Sales (GMV)
    total_gmv_result = db.session.query(db.func.sum(SalesTransaction.total_amount)).scalar()
    total_gmv = total_gmv_result or 0.0

    # 🚀 FIX: Use .filter() explicitly pointing to LedgerEntry, and use snake_case 'entry_type'
    credit_given = db.session.query(db.func.sum(LedgerEntry.amount)).filter(LedgerEntry.entry_type == 'CREDIT').scalar() or 0.0
    payments_received = db.session.query(db.func.sum(LedgerEntry.amount)).filter(LedgerEntry.entry_type == 'PAYMENT').scalar() or 0.0
    total_khata = max(0.0, credit_given - payments_received)

    # 2. Recent Merchants List
    # 🚀 FIX: Removed the .order_by() so it doesn't crash looking for a missing column
    merchants = User.query.filter(User.email != 'connect.manim@gmail.com')\
                          .limit(20).all()

    return render_template(
        'dashboard.html',
        total_merchants=total_merchants,
        total_gmv=total_gmv,
        total_khata=total_khata,
        merchants=merchants
    )


@admin_web_bp.route('/admin/merchant/<int:user_id>/toggle-status', methods=['POST'])
@superadmin_required
def toggle_merchant_status(user_id):
    user = User.query.get_or_404(user_id)
    user.is_active = not getattr(user, 'is_active', True)
    db.session.commit()
    flash(f"Updated status for {user.shop_name or user.email}", "success")
    return redirect(url_for('admin_web.dashboard'))