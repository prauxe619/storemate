package com.storemate_mobile

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class StoreMateSpeechModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), RecognitionListener {

    private var speechRecognizer: SpeechRecognizer? = null
    private var isListening = false

    override fun getName(): String {
        return "StoreMateSpeech"
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun startListening(promise: Promise) {
        UiThreadUtil.runOnUiThread {
            try {
                if (speechRecognizer == null) {
                    speechRecognizer = SpeechRecognizer.createSpeechRecognizer(reactApplicationContext)
                    speechRecognizer?.setRecognitionListener(this)
                }

                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                // 🚀 NEW: Force the engine to use Indian English / Hinglish
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "en-IN")
                }

                speechRecognizer?.startListening(intent)
                isListening = true
                promise.resolve("Listening started")
            } catch (e: Exception) {
                promise.reject("START_FAILED", e.message)
            }
        }
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        UiThreadUtil.runOnUiThread {
            try {
                speechRecognizer?.stopListening()
                isListening = false
                promise.resolve("Listening stopped")
            } catch (e: Exception) {
                promise.reject("STOP_FAILED", e.message)
            }
        }
    }

    override fun onReadyForSpeech(params: Bundle?) {
        sendEvent("onSpeechStart", Arguments.createMap())
    }

    override fun onPartialResults(partialResults: Bundle?) {
        val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        if (!matches.isNullOrEmpty()) {
            val event = Arguments.createMap().apply { putString("text", matches[0]) }
            sendEvent("onSpeechPartial", event)
        }
    }

    override fun onResults(results: Bundle?) {
        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
        if (!matches.isNullOrEmpty()) {
            val event = Arguments.createMap().apply { putString("text", matches[0]) }
            sendEvent("onSpeechFinal", event)
        }
        isListening = false
    }

    override fun onError(error: Int) {
        val event = Arguments.createMap().apply { putInt("code", error) }
        sendEvent("onSpeechError", event)
        isListening = false
    }

    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onEvent(eventType: Int, params: Bundle?) {}
}