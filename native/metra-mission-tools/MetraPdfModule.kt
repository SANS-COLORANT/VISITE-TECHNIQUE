package com.metra.missiontools

import android.app.ActivityManager
import android.content.Context
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
import java.util.concurrent.Executors

class MetraPdfModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "MetraPdf"
  private val reportIo = Executors.newSingleThreadExecutor()

  @ReactMethod
  fun reportMemoryProfile(promise: Promise) {
    try {
      val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val info = ActivityManager.MemoryInfo()
      am.getMemoryInfo(info)
      val out = Arguments.createMap()
      out.putBoolean("lowRam", am.isLowRamDevice || info.lowMemory)
      out.putInt("memoryClassMb", am.memoryClass)
      out.putDouble("availableBytes", info.availMem.toDouble())
      promise.resolve(out)
    } catch (error: Exception) { promise.reject("METRA_PDF_MEMORY", error.message, error) }
  }

  @ReactMethod
  fun copyReportToDocument(sourceUri: String, destinationUri: String, promise: Promise) {
    reportIo.execute {
      try {
        val source = Uri.parse(sourceUri)
        val destination = Uri.parse(destinationUri)
        require(source.scheme == "file" && destination.scheme == "content") { "URI de rapport invalide" }
        val file = File(source.path ?: throw IllegalArgumentException("PDF introuvable")).canonicalFile
        require(file.path.startsWith(context.cacheDir.canonicalPath + File.separator) && file.isFile && file.length() > 0L) { "PDF temporaire invalide" }
        val expected = file.length()
        val count = file.inputStream().use { input ->
          val output = context.contentResolver.openOutputStream(destination, "w") ?: throw IllegalArgumentException("Destination PDF inaccessible")
          output.use { input.copyTo(it, 128 * 1024) }
        }
        check(count == expected && file.length() == expected) { "Copie PDF incomplète" }
        val verified = context.contentResolver.openInputStream(destination)?.use { input ->
          val buffer = ByteArray(128 * 1024)
          var total = 0L
          while (true) { val n = input.read(buffer); if (n < 0) break; total += n }
          total
        } ?: throw IllegalStateException("Vérification du PDF impossible")
        check(verified == expected) { "Taille du PDF final incorrecte" }
        promise.resolve(count.toDouble())
      } catch (error: Exception) { promise.reject("METRA_PDF_COPY", error.message, error) }
    }
  }

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
