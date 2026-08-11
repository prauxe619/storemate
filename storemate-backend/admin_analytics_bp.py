import os
import datetime
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func, desc, or_
from models import db, User, InventoryItem, LedgerEntry, SalesTransaction, Feedback, AuditLog
from admin_models import (
    AnalyticsEvent, ErrorLog, VoiceLog, AiLog, OcrLog, 
    SyncTelemetryLog, SupportTicket
)

admin_analytics_bp = Blueprint('admin_analytics', __name__)

def is_super_admin(email):
    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "connect.manim@gmail.com")
    return email == ADMIN_EMAIL

def log_admin_action(admin_email, action, target_type=None, target_id=None, details=None):
    try:
        audit = AuditLog(
            admin_email=admin_email,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id else None,
            details=details
        )
        db.session.add(audit)
        db.session.commit()
    except Exception as e:
        db.session.rollback()

# ==========================================
# 1. MAIN OVERVIEW DASHBOARD
# ==========================================
@admin_analytics_bp.route('/api/v1/admin/overview', methods=['GET'])
@jwt_required()
def get_overview_metrics():
    email = get_jwt_identity()
    if not is_super_admin(email):
        return jsonify({"error": "Unauthorized"}), 403

    now = datetime.datetime.utcnow()
    today_start = datetime.datetime(now.year, now.month, now.day)
    yesterday_start = today_start - datetime.timedelta(days=1)

    total_shops = User.query.count()
    active_shops_today = db.session.query(func.count(func.distinct(AnalyticsEvent.user_id)))\
        .filter(AnalyticsEvent.created_at >= today_start).scalar() or 0

    # Today's Sales & Bills
    today_sales = db.session.query(
        func.count(SalesTransaction.id).label('bills'),
        func.coalesce(func.sum(SalesTransaction.total_amount), 0.0).label('revenue')
    ).filter(SalesTransaction.created_at >= today_start).first()

    # Yesterday's Sales & Bills
    yesterday_sales = db.session.query(
        func.count(SalesTransaction.id).label('bills'),
        func.coalesce(func.sum(SalesTransaction.total_amount), 0.0).label('revenue')
    ).filter(SalesTransaction.created_at >= yesterday_start, SalesTransaction.created_at < today_start).first()

    # Calculate Percentage Deltas
    bill_delta = (((today_sales.bills - yesterday_sales.bills) / (yesterday_sales.bills or 1)) * 100)
    rev_delta = (((today_sales.revenue - yesterday_sales.revenue) / (yesterday_sales.revenue or 1.0)) * 100)

    # Activity Counts Today
    products_added_today = InventoryItem.query.filter(InventoryItem.updated_at >= today_start).count()
    voice_commands_today = VoiceLog.query.filter(VoiceLog.created_at >= today_start).count()
    ai_requests_today = AiLog.query.filter(AiLog.created_at >= today_start).count()
    errors_today = ErrorLog.query.filter(ErrorLog.created_at >= today_start).count()

    # Sync Success Calculation Today
    sync_stats = db.session.query(
        func.count(SyncTelemetryLog.id).label('total'),
        func.sum(func.case((SyncTelemetryLog.status == 'SUCCESS', 1), else_=0)).label('success')
    ).filter(SyncTelemetryLog.created_at >= today_start).first()

    sync_rate = round(((sync_stats.success or 0) / (sync_stats.total or 1)) * 100, 1)

    return jsonify({
        "overview": {
            "active_shops": f"{active_shops_today} / {total_shops}",
            "bills_created": today_sales.bills,
            "sales_recorded": round(today_sales.revenue, 2),
            "products_added": products_added_today,
            "sync_success_rate": f"{sync_rate}%",
            "voice_commands": voice_commands_today,
            "ai_requests": ai_requests_today,
            "errors": errors_today
        },
        "comparisons": {
            "bills": {"today": today_sales.bills, "yesterday": yesterday_sales.bills, "delta_pct": round(bill_delta, 1)},
            "sales": {"today": round(today_sales.revenue, 2), "yesterday": round(yesterday_sales.revenue, 2), "delta_pct": round(rev_delta, 1)}
        }
    }), 200

# ==========================================
# 2. SHOP/BUSINESS TRACKING
# ==========================================
@admin_analytics_bp.route('/api/v1/admin/shops', methods=['GET'])
@jwt_required()
def get_shops_list():
    email = get_jwt_identity()
    if not is_super_admin(email):
        return jsonify({"error": "Unauthorized"}), 403

    users = User.query.order_by(User.id.desc()).all()
    now = datetime.datetime.utcnow()
    shops = []

    for u in users:
        last_event = AnalyticsEvent.query.filter_by(user_id=u.id).order_by(AnalyticsEvent.created_at.desc()).first()
        last_active = last_event.created_at if last_event else getattr(u, 'created_at', now)
        minutes_ago = (now - last_active).total_seconds() / 60.0

        # Status rules: 🟢 Active <= 30m, 🟠 Warning <= 2 days, 🔴 Inactive > 2 days
        if minutes_ago <= 30:
            status = "🟢"
            status_text = f"{int(minutes_ago)} min ago" if minutes_ago >= 1 else "Just now"
        elif minutes_ago <= 2880:
            status = "🟠"
            status_text = f"{round(minutes_ago / 60, 1)} hrs ago"
        else:
            status = "🔴"
            status_text = f"{int(minutes_ago / 1440)} days ago"

        shops.append({
            "id": u.id,
            "shop_name": u.shop_name,
            "owner": getattr(u, 'owner_name', u.email.split('@')[0]),
            "city": getattr(u, 'city', 'Unknown'),
            "last_active": status_text,
            "status": status,
            "app_version": getattr(u, 'app_version', '1.0.0')
        })

    return jsonify({"shops": shops}), 200

@admin_analytics_bp.route('/api/v1/admin/shops/<int:shop_id>', methods=['GET'])
@jwt_required()
def get_shop_profile(shop_id):
    email = get_jwt_identity()
    if not is_super_admin(email):
        return jsonify({"error": "Unauthorized"}), 403

    user = User.query.get(shop_id)
    if not user:
        return jsonify({"error": "Shop not found"}), 404

    # Business Activity Aggregate Counts
    products_count = InventoryItem.query.filter_by(user_id=user.id).count()
    bills_count = SalesTransaction.query.filter_by(user_id=user.id).count()
    sales_total = db.session.query(func.coalesce(func.sum(SalesTransaction.total_amount), 0.0))\
        .filter_by(user_id=user.id).scalar()
    khata_count = LedgerEntry.query.filter_by(user_id=user.id).count()

    # Feature Usage Breakdown (% of total events)
    total_events = AnalyticsEvent.query.filter_by(user_id=user.id).count() or 1
    feature_counts = db.session.query(
        AnalyticsEvent.feature, func.count(AnalyticsEvent.id)
    ).filter_by(user_id=user.id).group_by(AnalyticsEvent.feature).all()

    feature_usage = {
        f: round((count / total_events) * 100, 1) for f, count in feature_counts
    }

    return jsonify({
        "owner": {
            "id": user.id,
            "shop_name": user.shop_name,
            "email": user.email,
            "phone": getattr(user, 'phone', 'N/A'),
            "city": getattr(user, 'city', 'N/A'),
            "joined_date": getattr(user, 'created_at', datetime.datetime.utcnow()).strftime('%Y-%m-%d'),
            "device": f"{getattr(user, 'device_model', 'Android')} (Android {getattr(user, 'os_version', '14')})",
            "app_version": getattr(user, 'app_version', '1.0.0')
        },
        "business_activity": {
            "products": products_count,
            "bills": bills_count,
            "sales_recorded": round(sales_total, 2),
            "khata_entries": khata_count
        },
        "feature_usage_percentages": feature_usage
    }), 200

# ==========================================
# 3. VOICE & AI ANALYTICS ENGINE
# ==========================================
@admin_analytics_bp.route('/api/v1/admin/analytics/voice', methods=['GET'])
@jwt_required()
def get_voice_analytics():
    email = get_jwt_identity()
    if not is_super_admin(email):
        return jsonify({"error": "Unauthorized"}), 403

    now = datetime.datetime.utcnow()
    today_start = datetime.datetime(now.year, now.month, now.day)

    total_today = VoiceLog.query.filter(VoiceLog.created_at >= today_start).count()
    successful = VoiceLog.query.filter(VoiceLog.created_at >= today_start, VoiceLog.status == 'SUCCESS').count()
    failed = total_today - successful

    avg_latency = db.session.query(func.avg(VoiceLog.latency_ms)).filter(VoiceLog.created_at >= today_start).scalar() or 0.0

    # Intent Classification Metrics
    intent_counts = db.session.query(
        VoiceLog.actual_intent, func.count(VoiceLog.id)
    ).filter(VoiceLog.created_at >= today_start).group_by(VoiceLog.actual_intent).all()

    # Recent Failures Log
    recent_failures = VoiceLog.query.filter_by(status='FAILED').order_by(VoiceLog.created_at.desc()).limit(10).all()
    failed_list = [{
        "command": f.command_text,
        "expected": f.expected_intent,
        "reason": f.failure_reason,
        "shop_id": f.user_id,
        "time": f.created_at.strftime('%H:%M:%S')
    } for f in recent_failures]

    return jsonify({
        "summary": {
            "total_today": total_today,
            "successful": successful,
            "failed": failed,
            "success_rate_pct": round((successful / (total_today or 1)) * 100, 1),
            "avg_latency_sec": round(avg_latency / 1000.0, 2)
        },
        "command_breakdown": {intent or "unknown": count for intent, count in intent_counts},
        "recent_failed_commands": failed_list
    }), 200

# ==========================================
# 4. ERROR CENTER & MAINTENANCE
# ==========================================
@admin_analytics_bp.route('/api/v1/admin/errors', methods=['GET'])
@jwt_required()
def get_errors():
    email = get_jwt_identity()
    if not is_super_admin(email):
        return jsonify({"error": "Unauthorized"}), 403

    unresolved_errors = ErrorLog.query.filter_by(is_resolved=False).order_by(ErrorLog.created_at.desc()).all()
    error_data = []

    for err in unresolved_errors:
        user = User.query.get(err.user_id) if err.user_id else None
        error_data.append({
            "id": err.id,
            "severity": err.severity,
            "shop_name": user.shop_name if user else "System",
            "feature": err.feature,
            "message": err.error_message,
            "stack_trace": err.stack_trace,
            "app_version": err.app_version,
            "time": err.created_at.strftime('%Y-%m-%d %H:%M:%S')
        })

    return jsonify({"unresolved_errors": error_data}), 200

@admin_analytics_bp.route('/api/v1/admin/errors/<int:error_id>/resolve', methods=['POST'])
@jwt_required()
def resolve_error(error_id):
    email = get_jwt_identity()
    if not is_super_admin(email):
        return jsonify({"error": "Unauthorized"}), 403

    err = ErrorLog.query.get(error_id)
    if err:
        err.is_resolved = True
        db.session.commit()
        log_admin_action(email, "RESOLVED_ERROR", "ErrorLog", error_id)

    return jsonify({"status": "success", "message": "Error marked as resolved"}), 200


# ==========================================
# 📍 LOCATION & CITY DISTRIBUTION ANALYTICS
# ==========================================
@admin_analytics_bp.route('/api/v1/admin/analytics/locations', methods=['GET'])
@jwt_required()
def get_location_analytics():
    email = get_jwt_identity()
    if not is_super_admin(email):
        return jsonify({"error": "Unauthorized"}), 403

    # Aggregate active stores grouped by City & State
    city_stats = db.session.query(
        User.city,
        User.state,
        func.count(User.id).label('total_shops')
    ).filter(User.role != 'SUPERADMIN')\
     .group_by(User.city, User.state)\
     .order_by(desc('total_shops')).all()

    locations = [{
        "city": c.city or "Unknown",
        "state": c.state or "Unknown",
        "shop_count": c.total_shops
    } for c in city_stats]

    return jsonify({"locations": locations}), 200