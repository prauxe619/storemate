import datetime

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import db, User
from admin_models import (
    AnalyticsEvent,
    ErrorLog,
    VoiceLog,
    AiLog,
    OcrLog,
    SyncTelemetryLog,
)

from geo_utils import (
    get_client_ip,
    resolve_ip_location,
)


telemetry_bp = Blueprint(
    'telemetry',
    __name__
)


# ============================================================
# HELPERS
# ============================================================

def safe_string(value, default=None):
    """
    Convert incoming telemetry values safely to strings.
    """

    if value is None:
        return default

    try:
        value = str(value).strip()
    except Exception:
        return default

    return value if value else default


def safe_number(value, default=0):
    """
    Safely convert telemetry numeric values.
    """

    try:
        number = float(value)

        if number != number:  # NaN
            return default

        return number

    except (
        TypeError,
        ValueError,
    ):
        return default


def safe_dict(value):
    """
    Always return a dictionary for JSON payload fields.
    """

    return value if isinstance(value, dict) else {}


def safe_list(value):
    """
    Always return a list for telemetry queues.
    """

    return value if isinstance(value, list) else []


# ============================================================
# TELEMETRY INGESTION
# ============================================================

@telemetry_bp.route(
    '/api/v1/telemetry/events',
    methods=['POST']
)
@jwt_required()
def ingest_telemetry():

    # ========================================================
    # AUTHENTICATED USER
    # ========================================================

    current_user_email = get_jwt_identity()

    user = (
        User.query
        .filter_by(
            email=current_user_email
        )
        .first()
    )

    if not user:

        return jsonify({
            "error": "Unauthorized"
        }), 401


    # ========================================================
    # REQUEST PAYLOAD
    # ========================================================

    payload = request.get_json(
        silent=True
    ) or {}

    if not isinstance(payload, dict):

        return jsonify({
            "error": "Invalid telemetry payload"
        }), 400


    # ========================================================
    # TELEMETRY QUEUES
    # ========================================================

    events = safe_list(
        payload.get(
            'events'
        )
    )

    errors = safe_list(
        payload.get(
            'errors'
        )
    )

    voice_logs = safe_list(
        payload.get(
            'voice_logs'
        )
    )


    # ========================================================
    # DEVICE INFORMATION
    # ========================================================

    device_info = safe_dict(
        payload.get(
            'device_info'
        )
    )

    app_version = safe_string(
        payload.get(
            'app_version'
        ),
        '1.0.0'
    )


    device_model = safe_string(
        device_info.get(
            'model'
        ),
        'Unknown'
    )


    os_version = safe_string(
        device_info.get(
            'os_version'
        ),
        'Unknown'
    )


    # ========================================================
    # OPTIONAL SAFETY LIMIT
    # ========================================================
    #
    # Prevent a broken client from sending an enormous request.
    #

    MAX_EVENTS = 1000
    MAX_ERRORS = 500
    MAX_VOICE_LOGS = 500

    events = events[:MAX_EVENTS]
    errors = errors[:MAX_ERRORS]
    voice_logs = voice_logs[:MAX_VOICE_LOGS]


    # ========================================================
    # IP / LOCATION
    # ========================================================

    try:

        ip_addr = get_client_ip(
            request
        )

        if (
            not user.city
            or user.city == 'Unknown City'
            or user.last_ip != ip_addr
        ):

            loc_data = (
                resolve_ip_location(
                    ip_addr
                )
            )

            if isinstance(
                loc_data,
                dict
            ):

                user.last_ip = ip_addr

                user.city = (
                    loc_data.get(
                        'city'
                    )
                    or user.city
                    or 'Unknown City'
                )

                user.state = (
                    loc_data.get(
                        'state'
                    )
                    or user.state
                    or 'Unknown State'
                )

                user.country = (
                    loc_data.get(
                        'country'
                    )
                    or user.country
                    or 'Unknown Country'
                )

    except Exception as location_error:

        # Location must NEVER prevent telemetry from being saved.

        print(
            "Telemetry location error:",
            location_error
        )


    # ========================================================
    # USER HEARTBEAT
    # ========================================================

    user.last_active = (
        datetime.datetime.utcnow()
    )


    if hasattr(
        user,
        'app_version'
    ):

        user.app_version = (
            app_version
        )


    if hasattr(
        user,
        'device_model'
    ):

        user.device_model = (
            device_model
        )


    if hasattr(
        user,
        'os_version'
    ):

        user.os_version = (
            os_version
        )


    # ========================================================
    # COUNTERS
    # ========================================================

    processed_events = 0
    processed_errors = 0
    processed_voice_logs = 0


    try:

        # ====================================================
        # 1. GENERAL APP EVENTS
        # ====================================================

        for ev in events:

            if not isinstance(
                ev,
                dict
            ):
                continue


            event_type = safe_string(
                ev.get(
                    'event_type'
                ),
                'unknown'
            )


            feature = safe_string(
                ev.get(
                    'feature'
                ),
                'general'
            )


            event_payload = safe_dict(
                ev.get(
                    'payload'
                )
            )


            db.session.add(
                AnalyticsEvent(

                    user_id=user.id,

                    event_type=event_type,

                    feature=feature,

                    payload=event_payload,

                    app_version=app_version,

                    device_model=device_model,

                    os_version=os_version,

                )
            )


            processed_events += 1


        # ====================================================
        # 2. CLIENT ERRORS
        # ====================================================

        for err in errors:

            if not isinstance(
                err,
                dict
            ):
                continue


            severity = safe_string(
                err.get(
                    'severity'
                ),
                'ERROR'
            )


            feature = safe_string(
                err.get(
                    'feature'
                ),
                'unknown'
            )


            message = safe_string(
                err.get(
                    'message'
                ),
                'Unspecified error'
            )


            stack_trace = safe_string(
                err.get(
                    'stack_trace'
                )
            )


            db.session.add(
                ErrorLog(

                    user_id=user.id,

                    severity=severity,

                    feature=feature,

                    error_message=message,

                    stack_trace=stack_trace,

                    device_info=device_info,

                    app_version=app_version,

                )
            )


            processed_errors += 1


        # ====================================================
        # 3. VOICE DIAGNOSTICS
        # ====================================================

        for vl in voice_logs:

            if not isinstance(
                vl,
                dict
            ):
                continue


            command_text = safe_string(
                vl.get(
                    'command_text'
                ),
                ''
            )


            expected_intent = safe_string(
                vl.get(
                    'expected_intent'
                )
            )


            actual_intent = safe_string(
                vl.get(
                    'actual_intent'
                )
            )


            status = safe_string(
                vl.get(
                    'status'
                ),
                'FAILED'
            )


            failure_reason = safe_string(
                vl.get(
                    'failure_reason'
                )
            )


            confidence = safe_number(
                vl.get(
                    'confidence'
                ),
                0.0
            )


            latency_ms = safe_number(
                vl.get(
                    'latency_ms'
                ),
                0
            )


            db.session.add(
                VoiceLog(

                    user_id=user.id,

                    command_text=command_text,

                    expected_intent=expected_intent,

                    actual_intent=actual_intent,

                    confidence_score=confidence,

                    status=status,

                    failure_reason=failure_reason,

                    latency_ms=latency_ms,

                )
            )


            processed_voice_logs += 1


        # ====================================================
        # COMMIT
        # ====================================================

        db.session.commit()


        # ====================================================
        # RESPONSE
        # ====================================================

        return jsonify({

            "status": "success",

            "processed": {

                "events":
                    processed_events,

                "errors":
                    processed_errors,

                "voice_logs":
                    processed_voice_logs,

            },

            "total_processed":
                (
                    processed_events
                    +
                    processed_errors
                    +
                    processed_voice_logs
                ),

        }), 200


    except Exception as e:

        db.session.rollback()


        print(
            "Telemetry ingestion failed:",
            repr(e)
        )


        return jsonify({

            "error":
                "Failed to log telemetry",

            "details":
                str(e),

        }), 500