import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from '../config/api';


/* ============================================================
   TELEMETRY STORAGE KEYS
   ============================================================ */

const STORAGE_KEYS = {
  EVENTS: '@storemate_telemetry_events',
  ERRORS: '@storemate_telemetry_errors',
  VOICE_LOGS: '@storemate_telemetry_voice_logs',
};


/* ============================================================
   TELEMETRY SERVICE
   ============================================================ */

class TelemetryService {

  constructor() {

    /* ========================================================
       IN-MEMORY QUEUES
       ======================================================== */

    this.events = [];
    this.errors = [];
    this.voice_logs = [];


    /* ========================================================
       CONFIGURATION
       ======================================================== */

    this.app_version = '1.0.0';

    this.authToken = null;

    this.baseUrl = BASE_URL;

    this.isFlushing = false;

    this.isReady = false;


    /* ========================================================
       INITIALIZATION
       ======================================================== */

    this.readyPromise = this.initialize();


    /* ========================================================
       AUTOMATIC FLUSH
       ========================================================

       Try every 30 seconds.

       IMPORTANT:

       This does NOT delete anything if the server fails.
       ======================================================== */

    this.flushInterval = setInterval(
      () => {
        this.flush();
      },
      30000
    );
  }


  /* ==========================================================
     INITIALIZE LOCAL QUEUES
     ========================================================== */

  async initialize() {

    try {

      const [
        storedEvents,
        storedErrors,
        storedVoiceLogs,
      ] = await Promise.all([

        AsyncStorage.getItem(
          STORAGE_KEYS.EVENTS
        ),

        AsyncStorage.getItem(
          STORAGE_KEYS.ERRORS
        ),

        AsyncStorage.getItem(
          STORAGE_KEYS.VOICE_LOGS
        ),

      ]);


      /* ======================================================
         RESTORE EVENTS
         ====================================================== */

      if (storedEvents) {

        try {

          const parsed =
            JSON.parse(
              storedEvents
            );

          if (Array.isArray(parsed)) {

            this.events =
              parsed;

          }

        } catch (error) {

          console.warn(
            'Telemetry events restore failed:',
            error
          );

        }

      }


      /* ======================================================
         RESTORE ERRORS
         ====================================================== */

      if (storedErrors) {

        try {

          const parsed =
            JSON.parse(
              storedErrors
            );

          if (Array.isArray(parsed)) {

            this.errors =
              parsed;

          }

        } catch (error) {

          console.warn(
            'Telemetry errors restore failed:',
            error
          );

        }

      }


      /* ======================================================
         RESTORE VOICE LOGS
         ====================================================== */

      if (storedVoiceLogs) {

        try {

          const parsed =
            JSON.parse(
              storedVoiceLogs
            );

          if (Array.isArray(parsed)) {

            this.voice_logs =
              parsed;

          }

        } catch (error) {

          console.warn(
            'Telemetry voice logs restore failed:',
            error
          );

        }

      }


      this.isReady = true;


      console.log(
        'TelemetryService initialized:',
        {
          events:
            this.events.length,

          errors:
            this.errors.length,

          voice_logs:
            this.voice_logs.length,
        }
      );


    } catch (error) {

      console.warn(
        'TelemetryService initialization failed:',
        error
      );

      this.isReady = true;
    }
  }


  /* ==========================================================
     WAIT UNTIL STORAGE INITIALIZATION IS COMPLETE
     ========================================================== */

  async waitUntilReady() {

    try {

      await this.readyPromise;

    } catch (error) {

      console.warn(
        'TelemetryService ready error:',
        error
      );

    }
  }


  /* ==========================================================
     SET JWT TOKEN
     ========================================================== */

  setAuthToken(token) {

    this.authToken =
      token || null;


    /*
     * If a token has just been supplied,
     * immediately try sending pending telemetry.
     */

    if (this.authToken) {

      this.flush();

    }
  }


  /* ==========================================================
     CLEAR JWT TOKEN
     ========================================================== */

  clearAuthToken() {

    this.authToken =
      null;
  }


  /* ==========================================================
     GET DEVICE INFORMATION
     ========================================================== */

  getDeviceInfo() {

    return {

      platform:
        Platform.OS,

      os_version:
        String(
          Platform.Version
        ),

      model:
        Platform.OS === 'android'
          ? 'Android Device'
          : 'iOS Device',

    };
  }


  /* ==========================================================
     PERSIST EVENTS
     ========================================================== */

  async persistEvents() {

    try {

      await AsyncStorage.setItem(

        STORAGE_KEYS.EVENTS,

        JSON.stringify(
          this.events
        )

      );

    } catch (error) {

      console.warn(
        'Failed to persist telemetry events:',
        error
      );

    }
  }


  /* ==========================================================
     PERSIST ERRORS
     ========================================================== */

  async persistErrors() {

    try {

      await AsyncStorage.setItem(

        STORAGE_KEYS.ERRORS,

        JSON.stringify(
          this.errors
        )

      );

    } catch (error) {

      console.warn(
        'Failed to persist telemetry errors:',
        error
      );

    }
  }


  /* ==========================================================
     PERSIST VOICE LOGS
     ========================================================== */

  async persistVoiceLogs() {

    try {

      await AsyncStorage.setItem(

        STORAGE_KEYS.VOICE_LOGS,

        JSON.stringify(
          this.voice_logs
        )

      );

    } catch (error) {

      console.warn(
        'Failed to persist telemetry voice logs:',
        error
      );

    }
  }


  /* ==========================================================
     TRACK GENERAL APP ACTIVITY
     ========================================================== */

  trackEvent(
    eventType,
    feature,
    payload = {}
  ) {

    const event = {

      event_type:
        String(
          eventType || 'unknown'
        ),

      feature:
        String(
          feature || 'unknown'
        ),

      payload:
        payload || {},

      client_timestamp:
        new Date().toISOString(),

    };


    this.events.push(
      event
    );


    /*
     * Persist immediately.

     * IMPORTANT:
     * Do not await this because existing callers
     * may call trackEvent() synchronously.
     */

    this.persistEvents();


    /*
     * Prevent unlimited local storage growth.

     * Keep the newest 1000 events.
     */

    if (
      this.events.length > 1000
    ) {

      this.events =
        this.events.slice(
          -1000
        );

      this.persistEvents();
    }
  }


  /* ==========================================================
     TRACK ERRORS
     ========================================================== */

  logError(
    feature,
    message,
    stackTrace = null,
    severity = 'ERROR'
  ) {

    const errorLog = {

      severity:
        String(
          severity || 'ERROR'
        ),

      feature:
        String(
          feature || 'unknown'
        ),

      message:
        String(
          message || 'Unknown error'
        ),

      stack_trace:
        stackTrace
          ? String(
              stackTrace
            )
          : null,

      client_timestamp:
        new Date().toISOString(),

    };


    this.errors.push(
      errorLog
    );


    this.persistErrors();


    /*
     * Keep maximum 500 errors locally.
     */

    if (
      this.errors.length > 500
    ) {

      this.errors =
        this.errors.slice(
          -500
        );

      this.persistErrors();
    }
  }


  /* ==========================================================
     TRACK VOICE ACTIVITY
     ========================================================== */

  logVoice(
    commandText,
    expectedIntent,
    actualIntent,
    status,
    latencyMs,
    failureReason = null,
    confidence = 0.0
  ) {

    const voiceLog = {

      command_text:
        String(
          commandText || ''
        ),

      expected_intent:
        expectedIntent
          ? String(
              expectedIntent
            )
          : null,

      actual_intent:
        actualIntent
          ? String(
              actualIntent
            )
          : null,

      status:
        String(
          status || 'UNKNOWN'
        ),

      latency_ms:
        Number.isFinite(
          Number(
            latencyMs
          )
        )
          ? Number(
              latencyMs
            )
          : 0,

      failure_reason:
        failureReason
          ? String(
              failureReason
            )
          : null,

      confidence:
        Number.isFinite(
          Number(
            confidence
          )
        )
          ? Number(
              confidence
            )
          : 0,

      client_timestamp:
        new Date().toISOString(),

    };


    this.voice_logs.push(
      voiceLog
    );


    this.persistVoiceLogs();


    /*
     * Keep maximum 500 voice logs locally.
     */

    if (
      this.voice_logs.length > 500
    ) {

      this.voice_logs =
        this.voice_logs.slice(
          -500
        );

      this.persistVoiceLogs();
    }
  }


  /* ==========================================================
     FLUSH TELEMETRY
     ========================================================== */

  async flush() {

    /*
     * Wait for AsyncStorage initialization.
     */

    await this.waitUntilReady();


    /* ========================================================
       AUTH CHECK
       ======================================================== */

    if (!this.authToken) {

      return;
    }


    /* ========================================================
       PREVENT SIMULTANEOUS FLUSHES
       ======================================================== */

    if (
      this.isFlushing
    ) {

      return;
    }


    /* ========================================================
       NOTHING TO SEND
       ======================================================== */

    if (

      this.events.length === 0 &&

      this.errors.length === 0 &&

      this.voice_logs.length === 0

    ) {

      return;
    }


    this.isFlushing =
      true;


    /*
     * IMPORTANT:

     * Create snapshots.

     * We DO NOT clear the original queues yet.

     * If the request fails, everything remains available
     * for the next retry.
     */

    const eventsToSend =
      [...this.events];

    const errorsToSend =
      [...this.errors];

    const voiceLogsToSend =
      [...this.voice_logs];


    /* ========================================================
       DEVICE INFO
       ======================================================== */

    const deviceInfo =
      this.getDeviceInfo();


    /* ========================================================
       REQUEST PAYLOAD
       ======================================================== */

    const payload = {

      app_version:
        this.app_version,

      device_info:
        deviceInfo,

      events:
        eventsToSend,

      errors:
        errorsToSend,

      voice_logs:
        voiceLogsToSend,

    };


    try {

      const response =
        await fetch(

          `${this.baseUrl}/api/v1/telemetry/events`,

          {

            method:
              'POST',

            headers: {

              'Content-Type':
                'application/json',

              Accept:
                'application/json',

              Authorization:
                `Bearer ${this.authToken}`,

            },

            body:
              JSON.stringify(
                payload
              ),

          }

        );


      /* ======================================================
         SERVER REJECTED REQUEST
         ====================================================== */

      if (
        !response.ok
      ) {

        console.warn(
          'Telemetry flush failed, status:',
          response.status
        );

        /*
         * DO NOT CLEAR QUEUES.
         *
         * They will retry later.
         */

        return;
      }


      /* ======================================================
         SUCCESS
         ====================================================== */

      /*
       * Only remove the exact events that were successfully
       * included in this request.
       *
       * New events may have been generated while the request
       * was running, so don't blindly clear everything.
       */

      this.events =
        this.removeSentItems(
          this.events,
          eventsToSend
        );


      this.errors =
        this.removeSentItems(
          this.errors,
          errorsToSend
        );


      this.voice_logs =
        this.removeSentItems(
          this.voice_logs,
          voiceLogsToSend
        );


      /*
       * Persist the remaining queues.
       */

      await Promise.all([

        this.persistEvents(),

        this.persistErrors(),

        this.persistVoiceLogs(),

      ]);


      console.log(
        'Telemetry flush successful:',
        {
          events:
            eventsToSend.length,

          errors:
            errorsToSend.length,

          voice_logs:
            voiceLogsToSend.length,
        }
      );


    } catch (error) {

      /*
       * Network failure.

       * DO NOT DELETE ANYTHING.
       */

      console.warn(
        'Telemetry flush network error:',
        error?.message || error
      );

    } finally {

      this.isFlushing =
        false;
    }
  }


  /* ==========================================================
     REMOVE SUCCESSFULLY SENT ITEMS
     ========================================================== */

  removeSentItems(
    original,
    sent
  ) {

    if (
      !Array.isArray(original) ||
      !Array.isArray(sent) ||
      sent.length === 0
    ) {

      return original;
    }


    /*
     * Remove exactly the number of matching objects
     * that were sent.
     */

    const remaining =
      [...original];


    for (
      const item of sent
    ) {

      const index =
        remaining.findIndex(
          existing =>
            JSON.stringify(
              existing
            ) ===
            JSON.stringify(
              item
            )
        );


      if (
        index !== -1
      ) {

        remaining.splice(
          index,
          1
        );

      }
    }


    return remaining;
  }


  /* ==========================================================
     FORCE FLUSH
     ========================================================== */

  async flushNow() {

    await this.flush();
  }


  /* ==========================================================
     GET QUEUE STATUS
     ========================================================== */

  getQueueStatus() {

    return {

      events:
        this.events.length,

      errors:
        this.errors.length,

      voice_logs:
        this.voice_logs.length,

      total:
        this.events.length +
        this.errors.length +
        this.voice_logs.length,

      is_flushing:
        this.isFlushing,

    };
  }


  /* ==========================================================
     CLEAR LOCAL TELEMETRY
     ==========================================================
     
     This is mainly useful for logout/privacy cleanup.

     WARNING:
     This permanently removes unsent telemetry.
     ========================================================== */

  async clearLocalTelemetry() {

    this.events = [];
    this.errors = [];
    this.voice_logs = [];


    try {

      await Promise.all([

        AsyncStorage.removeItem(
          STORAGE_KEYS.EVENTS
        ),

        AsyncStorage.removeItem(
          STORAGE_KEYS.ERRORS
        ),

        AsyncStorage.removeItem(
          STORAGE_KEYS.VOICE_LOGS
        ),

      ]);

    } catch (error) {

      console.warn(
        'Failed to clear local telemetry:',
        error
      );

    }
  }
}


/* ============================================================
   SINGLETON
   ============================================================ */

export default new TelemetryService();