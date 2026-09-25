package com.metra.missiontools

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream

class MetraPdfModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "MetraPdf"

  private fun openDescriptor(fileUri: String): ParcelFileDescriptor? {
    val uri = Uri.parse(fileUri)
    return if (uri.scheme == "content") {
      context.contentResolver.openFileDescriptor(uri, "r")
    } else {
      val path = uri.path ?: fileUri.removePrefix("file://")
      ParcelFileDescriptor.open(File(path), ParcelFileDescriptor.MODE_READ_ONLY)
    }
  }

  @ReactMethod
  fun renderPage(fileUri: String, pageIndex: Int, maxWidth: Int, promise: Promise) {
    try {
      val descriptor = openDescriptor(fileUri) ?: throw IllegalArgumentException("PDF inaccessible")
      val renderer = PdfRenderer(descriptor)
      if (renderer.pageCount <= 0) throw IllegalArgumentException("PDF sans page")
      val safeIndex = pageIndex.coerceIn(0, renderer.pageCount - 1)
      val page = renderer.openPage(safeIndex)
      val targetWidth = maxWidth.coerceIn(320, 2200)
      val scale = targetWidth.toFloat() / page.width.toFloat()
      val targetHeight = (page.height * scale).toInt().coerceAtLeast(1)
      val bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
      bitmap.eraseColor(Color.WHITE)
      page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

      val outFile = File(context.cacheDir, "metra_pdf_" + System.currentTimeMillis() + "_" + safeIndex + ".png")
      FileOutputStream(outFile).use { stream ->
        bitmap.compress(Bitmap.CompressFormat.PNG, 95, stream)
      }
      bitmap.recycle()
      val payload = Arguments.createMap()
      payload.putString("uri", Uri.fromFile(outFile).toString())
      payload.putInt("width", targetWidth)
      payload.putInt("height", targetHeight)
      payload.putInt("pageIndex", safeIndex)
      payload.putInt("pageCount", renderer.pageCount)
      page.close()
      renderer.close()
      descriptor.close()
      promise.resolve(payload)
    } catch (error: Exception) {
      promise.reject("METRA_PDF_RENDER_ERROR", error.message, error)
    }
  }
}
