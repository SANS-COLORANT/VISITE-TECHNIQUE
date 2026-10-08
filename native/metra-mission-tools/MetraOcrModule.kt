package com.metra.missiontools

import android.net.Uri
import android.graphics.BitmapFactory
import android.graphics.Bitmap
import android.graphics.Matrix
import androidx.exifinterface.media.ExifInterface
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
  private val meterExecutor = java.util.concurrent.Executors.newSingleThreadExecutor()

  override fun invalidate() { meterExecutor.shutdown(); super.invalidate() }

  @ReactMethod
  fun recognizeMeter(fileUri: String, promise: Promise) {
    meterExecutor.execute {
      val started = System.currentTimeMillis()
      var bitmap: Bitmap? = null
      try {
        val uri = Uri.parse(fileUri)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
        val options = BitmapFactory.Options()
        while (maxOf(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 3200) options.inSampleSize *= 2
        bitmap = context.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, options) }
          ?: throw IllegalArgumentException("Image illisible")
        val orientation = context.contentResolver.openInputStream(uri).use { input ->
          if (input == null) ExifInterface.ORIENTATION_NORMAL else ExifInterface(input).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        }
        val matrix = Matrix()
        when (orientation) {
          ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
          ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
          ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
          ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
          ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
          ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.postRotate(90f); matrix.postScale(-1f, 1f) }
          ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.postRotate(270f); matrix.postScale(-1f, 1f) }
        }
        if (!matrix.isIdentity) {
          val rotated = Bitmap.createBitmap(bitmap!!, 0, 0, bitmap!!.width, bitmap!!.height, matrix, true)
          if (rotated !== bitmap) bitmap!!.recycle()
          bitmap = rotated
        }
        val passes = Arguments.createArray()
        val results = MeterOcrProcessor.read(bitmap!!)
        results.forEach { pass ->
          val item = Arguments.createMap()
          item.putString("text", pass.result.text)
          val crop = Arguments.createMap()
          crop.putInt("left", pass.crop.left); crop.putInt("top", pass.crop.top)
          crop.putInt("right", pass.crop.right); crop.putInt("bottom", pass.crop.bottom)
          item.putMap("crop", crop)
          val lines = Arguments.createArray()
          pass.result.textBlocks.forEach { block -> block.lines.forEach { line ->
            val row = Arguments.createMap(); row.putString("text", line.text)
            line.boundingBox?.let { box ->
              val rect = Arguments.createMap()
              rect.putDouble("left", pass.crop.left + box.left / pass.scale)
              rect.putDouble("top", pass.crop.top + box.top / pass.scale)
              rect.putDouble("right", pass.crop.left + box.right / pass.scale)
              rect.putDouble("bottom", pass.crop.top + box.bottom / pass.scale)
              row.putMap("box", rect)
            }
            lines.pushMap(row)
          } }
          item.putArray("lines", lines); passes.pushMap(item)
        }
        val payload = Arguments.createMap()
        payload.putString("text", results.firstOrNull()?.result?.text ?: "")
        payload.putArray("passes", passes)
        payload.putDouble("durationMs", (System.currentTimeMillis() - started).toDouble())
        promise.resolve(payload)
      } catch (error: Exception) { promise.reject("METRA_METER_OCR_ERROR", error.message, error) }
      finally { bitmap?.recycle() }
    }
  }

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
