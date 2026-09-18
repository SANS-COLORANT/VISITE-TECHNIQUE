package com.metra.missiontools

import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

class MetraOcrModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "MetraOcr"

  @ReactMethod
  fun recognize(fileUri: String, promise: Promise) {
    val started = System.currentTimeMillis()
    try {
      val image = InputImage.fromFilePath(context, Uri.parse(fileUri))
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      recognizer.process(image)
        .addOnSuccessListener { result ->
          val payload = Arguments.createMap()
          payload.putString("text", result.text)
          payload.putDouble("durationMs", (System.currentTimeMillis() - started).toDouble())
          val blocks = Arguments.createArray()
          result.textBlocks.forEach { block ->
            val item = Arguments.createMap()
            item.putString("text", block.text)
            val box = block.boundingBox
            if (box != null) {
              val rect = Arguments.createMap()
              rect.putInt("left", box.left)
              rect.putInt("top", box.top)
              rect.putInt("right", box.right)
              rect.putInt("bottom", box.bottom)
              item.putMap("box", rect)
            }
            blocks.pushMap(item)
          }
          payload.putArray("blocks", blocks)
          recognizer.close()
          promise.resolve(payload)
        }
        .addOnFailureListener { error ->
          recognizer.close()
          promise.reject("METRA_OCR_ERROR", error.message, error)
        }
    } catch (error: Exception) {
      promise.reject("METRA_OCR_INPUT_ERROR", error.message, error)
    }
  }
}
