import { Platform } from 'react-native';
import { BASE_URL } from '../config/api';

class TelemetryService {
  constructor() {
    // In-memory queues
    this.events = [];
    this.errors = [];
    this.voice_logs = [];

    // Configuration
    this.app_version = '1.0.0';
    this.authToken = null;
    this.baseUrl = BASE_URL;

    // Automatically flush data every 30 seconds
    this.flushInterval = setInterval(() => this.flush(), 30000);
  }

  /**
   * Set the JWT token when the user logs in
   */
  setAuthToken(token) {
    this.authToken = token;
  }

  /**
   * Track general app usage
   */
  trackEvent(eventType, feature, payload = {}) {
    this.events.push({
      event_type: eventType,
      feature: feature,
      payload: payload,
    });
  }

  /**
   * Track app crashes & API errors
   */
  logError(
    feature,
    message,
    stackTrace = null,
    severity = 'ERROR'
  ) {
    this.errors.push({
      severity,
      feature,
      message,
      stack_trace: stackTrace
        ? String(stackTrace)
        : null,
    });
  }

  /**
   * Track voice & microphone diagnostics
   */
  logVoice(
    commandText,
    expectedIntent,
    actualIntent,
    status,
    latencyMs,
    failureReason = null,
    confidence = 0.0
  ) {
    this.voice_logs.push({
      command_text: commandText,
      expected_intent: expectedIntent,
      actual_intent: actualIntent,
      status,
      latency_ms: latencyMs,
      failure_reason: failureReason,
      confidence,
    });
  }

  /**
   * Send batched telemetry to Flask backend
   */
  async flush() {
    if (
      !this.authToken ||
      (
        this.events.length === 0 &&
        this.errors.length === 0 &&
        this.voice_logs.length === 0
      )
    ) {
      return;
    }

    const deviceInfo = {
      model:
        Platform.OS === 'android'
          ? 'Android Device'
          : 'iOS Device',
      os_version: String(Platform.Version),
    };

    const payload = {
      app_version: this.app_version,
      device_info: deviceInfo,
      events: [...this.events],
      errors: [...this.errors],
      voice_logs: [...this.voice_logs],
    };

    // Clear queues before sending to prevent duplicate sends
    this.events = [];
    this.errors = [];
    this.voice_logs = [];

    try {
      const response = await fetch(
        `${this.baseUrl}/api/v1/telemetry/events`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.authToken}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        console.warn(
          'Telemetry flush failed, status:',
          response.status
        );
      }
    } catch (error) {
      console.warn(
        'Telemetry flush network error:',
        error
      );
    }
  }
}

export default new TelemetryService();