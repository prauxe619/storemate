import { Platform } from 'react-native';

class TelemetryService {
  constructor() {
    // In-memory queues
    this.events = [];
    this.errors = [];
    this.voice_logs = [];
    
    // Configuration
    this.app_version = '1.0.0'; // Update this when you release new APKs
    this.authToken = null;
    this.baseUrl = __DEV__ 
        ? 'http://192.168.31.65:5050' 
        : 'https://api.yourstoremate.com';

    // Automatically flush data to the backend every 30 seconds
    this.flushInterval = setInterval(() => this.flush(), 30000);
  }

  /**
   * Set the JWT token when the user logs in
   */
  setAuthToken(token) {
    this.authToken = token;
  }

  /**
   * 1. TRACK GENERAL APP USAGE
   * Ex: trackEvent('sale_created', 'pos', { total: 450, items: 3 })
   */
  trackEvent(eventType, feature, payload = {}) {
    this.events.push({
      event_type: eventType,
      feature: feature,
      payload: payload
    });
  }

  /**
   * 2. TRACK APP CRASHES & API ERRORS
   * Ex: logError('sync', 'Network timeout', err.stack)
   */
  logError(feature, message, stackTrace = null, severity = 'ERROR') {
    this.errors.push({
      severity: severity,
      feature: feature,
      message: message,
      stack_trace: stackTrace ? String(stackTrace) : null
    });
  }

  /**
   * 3. TRACK VOICE & MIC DIAGNOSTICS
   * Ex: logVoice('add cheeni', 'add_product', 'FAILED', 1200, 'Product not found')
   */
  logVoice(commandText, expectedIntent, actualIntent, status, latencyMs, failureReason = null, confidence = 0.0) {
    this.voice_logs.push({
      command_text: commandText,
      expected_intent: expectedIntent,
      actual_intent: actualIntent,
      status: status, // 'SUCCESS' or 'FAILED'
      latency_ms: latencyMs,
      failure_reason: failureReason,
      confidence: confidence
    });
  }

  /**
   * Send the batched data to the Flask Backend
   */
  async flush() {
    // Don't send if queues are empty or user isn't logged in
    if (!this.authToken || (this.events.length === 0 && this.errors.length === 0 && this.voice_logs.length === 0)) {
      return;
    }

    // Capture device info
    const deviceInfo = {
      model: Platform.OS === 'android' ? 'Android Device' : 'iOS Device', // Upgrade with react-native-device-info later
      os_version: String(Platform.Version)
    };

    // Prepare payload & clear local queues immediately to prevent duplicate sends
    const payload = {
      app_version: this.app_version,
      device_info: deviceInfo,
      events: [...this.events],
      errors: [...this.errors],
      voice_logs: [...this.voice_logs]
    };

    this.events = [];
    this.errors = [];
    this.voice_logs = [];

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/telemetry/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.warn("Telemetry flush failed, status:", response.status);
      }
    } catch (error) {
      console.warn("Telemetry flush network error:", error);
      // Optional V2 upgrade: Push items back into the queue if network is down
    }
  }
}

// Export as a Singleton so the whole app uses the exact same queues
export default new TelemetryService();