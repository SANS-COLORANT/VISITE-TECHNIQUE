package com.metra.missiontools

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class MetraSpeechModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var recognizer: SpeechRecognizer? = null
  private var pendingPromise: Promise? = null

  override fun getName() = "MetraSpeech"

  private fun cleanup() {
    recognizer?.destroy()
    recognizer = null
    pendingPromise = null
  }

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(SpeechRecognizer.isRecognitionAvailable(context))
  }

  @ReactMethod
  fun start(locale: String?, promise: Promise) {
    if (!SpeechRecognizer.isRecognitionAvailable(context)) {
      promise.reject("METRA_SPEECH_UNAVAILABLE", "La reconnaissance vocale Android n'est pas disponible sur cet appareil.")
      return
    }
    if (pendingPromise != null) {
      promise.reject("METRA_SPEECH_BUSY", "Une dictée est déjà en cours.")
      return
    }
    pendingPromise = promise
    context.runOnUiQueueThread {
      try {
        recognizer = SpeechRecognizer.createSpeechRecognizer(context)
        recognizer?.setRecognitionListener(object : RecognitionListener {
          override fun onReadyForSpeech(params: Bundle?) {}
          override fun onBeginningOfSpeech() {}
          override fun onRmsChanged(rmsdB: Float) {}
          override fun onBufferReceived(buffer: ByteArray?) {}
          override fun onEndOfSpeech() {}
          override fun onPartialResults(partialResults: Bundle?) {}
          override fun onEvent(eventType: Int, params: Bundle?) {}

          override fun onError(error: Int) {
            val p = pendingPromise
            cleanup()
            p?.reject("METRA_SPEECH_ERROR", "Reconnaissance vocale interrompue (code $error).")
          }

          override fun onResults(results: Bundle?) {
            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: arrayListOf()
            val payload = Arguments.createMap()
            payload.putString("text", matches.firstOrNull() ?: "")
            val alternatives = Arguments.createArray()
            matches.forEach { alternatives.pushString(it) }
            payload.putArray("alternatives", alternatives)
            val p = pendingPromise
            cleanup()
            p?.resolve(payload)
          }
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
          putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
          putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale ?: "fr-FR")
          putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
          putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
          putExtra(RecognizerIntent.EXTRA_PROMPT, "Dictée METRA")
        }
        recognizer?.startListening(intent)
      } catch (error: Exception) {
        val p = pendingPromise
        cleanup()
        p?.reject("METRA_SPEECH_START_ERROR", error.message, error)
      }
    }
  }

  @ReactMethod
  fun cancel(promise: Promise) {
    context.runOnUiQueueThread {
      recognizer?.cancel()
      cleanup()
      promise.resolve(true)
    }
  }

  override fun invalidate() {
    cleanup()
    super.invalidate()
  }
}
