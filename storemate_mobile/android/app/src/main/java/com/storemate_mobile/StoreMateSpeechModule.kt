package com.storemate_mobile

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class StoreMateSpeechModule(
    reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext), RecognitionListener {

    private var speechRecognizer: SpeechRecognizer? = null
    private var isListening = false
    private var listenerCount = 0

    override fun getName(): String {
        return "StoreMateSpeech"
    }

    /*
     * ============================================================
     * React Native NativeEventEmitter SUPPORT
     * ============================================================
     *
     * NativeEventEmitter requires these methods to exist on the
     * native module when the module is passed to:
     *
     * new NativeEventEmitter(StoreMateSpeech)
     *
     * They are lifecycle bookkeeping methods. The actual events
     * are emitted through DeviceEventManagerModule below.
     * ============================================================
     */

    @ReactMethod
    fun addListener(eventName: String) {
        listenerCount++
    }

    @ReactMethod
    fun removeListeners(count: Double) {
        listenerCount =
            (listenerCount - count.toInt()).coerceAtLeast(0)
    }

    private fun sendEvent(
        eventName: String,
        params: WritableMap?
    ) {
        if (!reactApplicationContext.hasActiveCatalystInstance()) {
            return
        }

        reactApplicationContext
            .getJSModule(
                DeviceEventManagerModule.RCTDeviceEventEmitter::class.java
            )
            .emit(
                eventName,
                params
            )
    }

    @ReactMethod
    fun startListening(
        promise: Promise
    ) {
        UiThreadUtil.runOnUiThread {
            try {
                if (!SpeechRecognizer.isRecognitionAvailable(
                        reactApplicationContext
                    )
                ) {
                    promise.reject(
                        "SPEECH_UNAVAILABLE",
                        "Speech recognition is not available on this device."
                    )
                    return@runOnUiThread
                }

                if (speechRecognizer == null) {
                    speechRecognizer =
                        SpeechRecognizer.createSpeechRecognizer(
                            reactApplicationContext
                        )

                    speechRecognizer?.setRecognitionListener(
                        this
                    )
                }

                /*
                 * Prevent multiple simultaneous recognition
                 * sessions.
                 */
                if (isListening) {
                    try {
                        speechRecognizer?.cancel()
                    } catch (_: Exception) {
                    }

                    isListening = false
                }

                val intent =
                    Intent(
                        RecognizerIntent.ACTION_RECOGNIZE_SPEECH
                    ).apply {

                        putExtra(
                            RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                            RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
                        )

                        putExtra(
                            RecognizerIntent.EXTRA_PARTIAL_RESULTS,
                            true
                        )

                        putExtra(
                            RecognizerIntent.EXTRA_MAX_RESULTS,
                            1
                        )

                        /*
                         * Indian English / Hinglish.
                         */
                        putExtra(
                            RecognizerIntent.EXTRA_LANGUAGE,
                            "en-IN"
                        )

                        putExtra(
                            RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE,
                            "en-IN"
                        )
                    }

                speechRecognizer?.startListening(
                    intent
                )

                isListening = true

                promise.resolve(
                    "Listening started"
                )

            } catch (error: Exception) {

                isListening = false

                promise.reject(
                    "START_FAILED",
                    error.message,
                    error
                )
            }
        }
    }

    @ReactMethod
    fun stopListening(
        promise: Promise
    ) {
        UiThreadUtil.runOnUiThread {
            try {

                if (speechRecognizer != null) {
                    try {
                        speechRecognizer?.stopListening()
                    } catch (_: Exception) {
                    }
                }

                isListening = false

                promise.resolve(
                    "Listening stopped"
                )

            } catch (error: Exception) {

                isListening = false

                promise.reject(
                    "STOP_FAILED",
                    error.message,
                    error
                )
            }
        }
    }

    @ReactMethod
    fun cancelListening(
        promise: Promise
    ) {
        UiThreadUtil.runOnUiThread {
            try {

                speechRecognizer?.cancel()

                isListening = false

                promise.resolve(
                    "Listening cancelled"
                )

            } catch (error: Exception) {

                isListening = false

                promise.reject(
                    "CANCEL_FAILED",
                    error.message,
                    error
                )
            }
        }
    }

    override fun onReadyForSpeech(
        params: Bundle?
    ) {
        sendEvent(
            "onSpeechStart",
            Arguments.createMap()
        )
    }

    override fun onPartialResults(
        partialResults: Bundle?
    ) {

        val matches =
            partialResults?.getStringArrayList(
                SpeechRecognizer.RESULTS_RECOGNITION
            )

        if (!matches.isNullOrEmpty()) {

            val text =
                matches[0]

            if (text.isNotBlank()) {

                val event =
                    Arguments.createMap().apply {
                        putString(
                            "text",
                            text
                        )
                    }

                sendEvent(
                    "onSpeechPartial",
                    event
                )
            }
        }
    }

    override fun onResults(
        results: Bundle?
    ) {

        val matches =
            results?.getStringArrayList(
                SpeechRecognizer.RESULTS_RECOGNITION
            )

        if (!matches.isNullOrEmpty()) {

            val text =
                matches[0]

            if (text.isNotBlank()) {

                val event =
                    Arguments.createMap().apply {
                        putString(
                            "text",
                            text
                        )
                    }

                sendEvent(
                    "onSpeechFinal",
                    event
                )
            }
        }

        isListening = false
    }

    override fun onError(
        error: Int
    ) {

        val event =
            Arguments.createMap().apply {
                putInt(
                    "code",
                    error
                )
            }

        sendEvent(
            "onSpeechError",
            event
        )

        isListening = false
    }

    override fun onBeginningOfSpeech() {
    }

    override fun onRmsChanged(
        rmsdB: Float
    ) {
    }

    override fun onBufferReceived(
        buffer: ByteArray?
    ) {
    }

    override fun onEndOfSpeech() {
        isListening = false
    }

    override fun onEvent(
        eventType: Int,
        params: Bundle?
    ) {
    }

    override fun invalidate() {

        UiThreadUtil.runOnUiThread {

            try {
                speechRecognizer?.cancel()
            } catch (_: Exception) {
            }

            try {
                speechRecognizer?.destroy()
            } catch (_: Exception) {
            }

            speechRecognizer = null
            isListening = false
            listenerCount = 0
        }

        super.invalidate()
    }
}