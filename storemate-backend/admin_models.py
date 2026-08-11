import datetime
from models import db

class AnalyticsEvent(db.Model):
    __tablename__ = 'analytics_events'
    __table_args__ = {'extend_existing': True} # 🚀 FIX: Prevent double-registration crashes
    
    id = db.Column(db.BigInteger, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    event_type = db.Column(db.String(64), nullable=False, index=True)
    feature = db.Column(db.String(32), nullable=False, index=True)
    payload = db.Column(db.JSON, nullable=True)
    app_version = db.Column(db.String(16), nullable=True)
    device_model = db.Column(db.String(64), nullable=True)
    os_version = db.Column(db.String(32), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, index=True)

class ErrorLog(db.Model):
    __tablename__ = 'error_logs'
    __table_args__ = {'extend_existing': True}
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)
    severity = db.Column(db.String(16), nullable=False, default='ERROR')
    feature = db.Column(db.String(32), nullable=False)
    error_message = db.Column(db.Text, nullable=False)
    stack_trace = db.Column(db.Text, nullable=True)
    device_info = db.Column(db.JSON, nullable=True)
    app_version = db.Column(db.String(16), nullable=True)
    is_resolved = db.Column(db.Boolean, default=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, index=True)

class VoiceLog(db.Model):
    __tablename__ = 'voice_logs'
    __table_args__ = {'extend_existing': True}
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    command_text = db.Column(db.Text, nullable=False)
    expected_intent = db.Column(db.String(64), nullable=True)
    actual_intent = db.Column(db.String(64), nullable=True)
    confidence_score = db.Column(db.Float, nullable=True)
    status = db.Column(db.String(16), nullable=False)
    failure_reason = db.Column(db.String(128), nullable=True)
    latency_ms = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, index=True)

class AiLog(db.Model):
    __tablename__ = 'ai_logs'
    __table_args__ = {'extend_existing': True}
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    feature = db.Column(db.String(32), nullable=False) 
    prompt_tokens = db.Column(db.Integer, default=0)
    completion_tokens = db.Column(db.Integer, default=0)
    latency_ms = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(16), nullable=False) 
    estimated_cost_usd = db.Column(db.Float, default=0.0)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, index=True)

class OcrLog(db.Model):
    __tablename__ = 'ocr_logs'
    __table_args__ = {'extend_existing': True}
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    scan_type = db.Column(db.String(32), default='wholesale_invoice')
    status = db.Column(db.String(16), nullable=False)
    failure_reason = db.Column(db.String(64), nullable=True)
    latency_ms = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, index=True)

class SyncTelemetryLog(db.Model):
    __tablename__ = 'sync_telemetry_logs'
    __table_args__ = {'extend_existing': True}
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    records_pushed = db.Column(db.Integer, default=0)
    records_pulled = db.Column(db.Integer, default=0)
    conflicts_count = db.Column(db.Integer, default=0)
    status = db.Column(db.String(16), nullable=False)
    duration_ms = db.Column(db.Integer, nullable=False)
    error_details = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, index=True)

class SupportTicket(db.Model):
    __tablename__ = 'support_tickets'
    __table_args__ = {'extend_existing': True}
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    subject = db.Column(db.String(128), nullable=False)
    description = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(32), default='GENERAL')
    status = db.Column(db.String(16), default='OPEN', index=True)
    screenshot_url = db.Column(db.String(256), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
