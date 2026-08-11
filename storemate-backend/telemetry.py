import os
import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, User
from admin_models import AnalyticsEvent, ErrorLog, VoiceLog, AiLog, OcrLog, SyncTelemetryLog
from geo_utils import get_client_ip, resolve_ip_location

telemetry_bp = Blueprint('telemetry', __name__)

@telemetry_bp.route('/api/v1/telemetry/events', methods=['POST'])
@jwt_required()
def ingest_telemetry():
    current_user_email = get_jwt_identity()
    user = User.query.filter_by(email=current_user_email).first()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    payload = request.get_json() or {}
    
    # 📍 Resolve & Save Location automatically
    ip_addr = get_client_ip(request)
    if not user.city or user.city == 'Unknown City' or user.last_ip != ip_addr:
        loc_data = resolve_ip_location(ip_addr)
        user.last_ip = ip_addr
        user.city = loc_data['city']
        user.state = loc_data['state']
        user.country = loc_data['country']
    events = payload.get('events', [])
    errors = payload.get('errors', [])
    voice_logs = payload.get('voice_logs', [])
    
    device_info = payload.get('device_info', {})
    app_version = payload.get('app_version', '1.0.0')

    try:
        # Update User Heartbeat & Version Metadata
        user.last_active = datetime.datetime.utcnow()
        if hasattr(user, 'app_version'):
            user.app_version = app_version
        if hasattr(user, 'device_model'):
            user.device_model = device_info.get('model', 'Unknown')
        if hasattr(user, 'os_version'):
            user.os_version = device_info.get('os_version', 'Unknown')

        # 1. Process System Events
        for ev in events:
            db.session.add(AnalyticsEvent(
                user_id=user.id,
                event_type=ev.get('event_type'),
                feature=ev.get('feature', 'general'),
                payload=ev.get('payload'),
                app_version=app_version,
                device_model=device_info.get('model'),
                os_version=device_info.get('os_version')
            ))

        # 2. Process Client Errors
        for err in errors:
            db.session.add(ErrorLog(
                user_id=user.id,
                severity=err.get('severity', 'ERROR'),
                feature=err.get('feature', 'unknown'),
                error_message=err.get('message', 'Unspecified error'),
                stack_trace=err.get('stack_trace'),
                device_info=device_info,
                app_version=app_version
            ))

        # 3. Process Voice Diagnostics
        for vl in voice_logs:
            db.session.add(VoiceLog(
                user_id=user.id,
                command_text=vl.get('command_text', ''),
                expected_intent=vl.get('expected_intent'),
                actual_intent=vl.get('actual_intent'),
                confidence_score=vl.get('confidence', 0.0),
                status=vl.get('status', 'FAILED'),
                failure_reason=vl.get('failure_reason'),
                latency_ms=vl.get('latency_ms', 0)
            ))

        db.session.commit()
        return jsonify({"status": "success", "processed_events": len(events)}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Failed to log telemetry", "details": str(e)}), 500