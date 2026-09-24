package com.metra.companion

import android.graphics.Bitmap
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.codescanner.GmsBarcodeScanning
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.Executors

class MetraCompanionModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newCachedThreadPool()
  @Volatile private var serverSocket: ServerSocket? = null
  @Volatile private var socket: Socket? = null
  @Volatile private var output: DataOutputStream? = null
  @Volatile private var hostSessionId: String? = null
  @Volatile private var hostToken: String? = null
  @Volatile private var role: String? = null
  private val writeLock = Any()

  override fun getName() = "MetraCompanion"

  private fun emit(type: String, extras: Map<String, Any?> = emptyMap()) {
    val payload = Arguments.createMap()
    payload.putString("type", type)
    for ((key, value) in extras) {
      when (value) {
        null -> payload.putNull(key)
        is String -> payload.putString(key, value)
        is Int -> payload.putInt(key, value)
        is Double -> payload.putDouble(key, value)
        is Boolean -> payload.putBoolean(key, value)
        else -> payload.putString(key, value.toString())
      }
    }
    context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("MetraCompanionEvent", payload)
  }

  private fun localIpv4(): String {
    val interfaces = NetworkInterface.getNetworkInterfaces()?.toList() ?: emptyList()
    for (network in interfaces) {
      if (!network.isUp || network.isLoopback) continue
      for (address in network.inetAddresses.toList()) {
        if (address is Inet4Address && !address.isLoopbackAddress && address.isSiteLocalAddress) {
          return address.hostAddress ?: continue
        }
      }
    }
    throw IllegalStateException("Aucune adresse réseau locale disponible")
  }

  private fun writeFrame(header: JSONObject, payloadFile: File? = null) {
    val out = output ?: throw IllegalStateException("Aucune connexion compagnon active")
    val headerBytes = header.toString().toByteArray(StandardCharsets.UTF_8)
    synchronized(writeLock) {
      out.writeInt(headerBytes.size)
      out.write(headerBytes)
      val length = payloadFile?.length() ?: 0L
      out.writeLong(length)
      if (payloadFile != null && length > 0) {
        BufferedInputStream(payloadFile.inputStream()).use { input ->
          val buffer = ByteArray(64 * 1024)
          var read: Int
          while (input.read(buffer).also { read = it } > 0) out.write(buffer, 0, read)
        }
      }
      out.flush()
    }
  }

  private fun authenticateServer(client: Socket, input: DataInputStream, out: DataOutputStream): Boolean {
    val headerLength = input.readInt()
    if (headerLength <= 0 || headerLength > 256 * 1024) return false
    val bytes = ByteArray(headerLength)
    input.readFully(bytes)
    val header = JSONObject(String(bytes, StandardCharsets.UTF_8))
    val payloadLength = input.readLong()
    if (payloadLength > 0) {
      var remaining = payloadLength
      val buffer = ByteArray(32 * 1024)
      while (remaining > 0) {
        val read = input.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
        if (read < 0) break
        remaining -= read
      }
    }
    val valid = header.optString("kind") == "auth" &&
      header.optString("sessionId") == hostSessionId &&
      header.optString("token") == hostToken
    if (!valid) {
      try { client.close() } catch (_: Exception) {}
      return false
    }
    output = out
    socket = client
    role = "host"
    emit("status", mapOf("status" to "connected", "role" to "host"))
    return true
  }

  private fun readerLoop(client: Socket, input: DataInputStream) {
    try {
      while (!client.isClosed) {
        val headerLength = input.readInt()
        if (headerLength <= 0 || headerLength > 2 * 1024 * 1024) throw IllegalStateException("Trame compagnon invalide")
        val headerBytes = ByteArray(headerLength)
        input.readFully(headerBytes)
        val header = JSONObject(String(headerBytes, StandardCharsets.UTF_8))
        val payloadLength = input.readLong()
        when (header.optString("kind")) {
          "message" -> {
            var remaining = payloadLength
            val buffer = ByteArray(32 * 1024)
            while (remaining > 0) {
              val read = input.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
              if (read < 0) break
              remaining -= read
            }
            emit("message", mapOf("messageJson" to header.optString("messageJson", "{}")))
          }
          "file" -> {
            if (payloadLength < 0 || payloadLength > 200L * 1024L * 1024L) throw IllegalStateException("Fichier compagnon trop volumineux")
            val folder = File(context.cacheDir, "metra-companion")
            folder.mkdirs()
            val safeName = header.optString("name", "photo.jpg").replace(Regex("[^A-Za-z0-9._-]"), "_")
            val destination = File(folder, UUID.randomUUID().toString() + "_" + safeName)
            BufferedOutputStream(FileOutputStream(destination)).use { fileOut ->
              var remaining = payloadLength
              val buffer = ByteArray(64 * 1024)
              while (remaining > 0) {
                val wanted = minOf(buffer.size.toLong(), remaining).toInt()
                val read = input.read(buffer, 0, wanted)
                if (read < 0) throw IllegalStateException("Transfert compagnon interrompu")
                fileOut.write(buffer, 0, read)
                remaining -= read
              }
            }
            emit("fileReceived", mapOf(
              "uri" to Uri.fromFile(destination).toString(),
              "metaJson" to header.optString("metaJson", "{}"),
              "size" to payloadLength.toDouble()
            ))
          }
          else -> {
            var remaining = payloadLength
            val buffer = ByteArray(32 * 1024)
            while (remaining > 0) {
              val read = input.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
              if (read < 0) break
              remaining -= read
            }
          }
        }
      }
    } catch (_: Exception) {
    } finally {
      if (socket === client) {
        socket = null
        output = null
      }
      try { client.close() } catch (_: Exception) {}
      emit("status", mapOf("status" to "disconnected", "role" to (role ?: "unknown")))
    }
  }

  private fun acceptLoop(server: ServerSocket) {
    executor.execute {
      while (!server.isClosed) {
        try {
          val client = server.accept()
          client.tcpNoDelay = true
          val input = DataInputStream(BufferedInputStream(client.getInputStream()))
          val out = DataOutputStream(BufferedOutputStream(client.getOutputStream()))
          if (!authenticateServer(client, input, out)) continue
          readerLoop(client, input)
        } catch (_: Exception) {
          if (!server.isClosed) emit("status", mapOf("status" to "error", "role" to "host"))
        }
      }
    }
  }

  @ReactMethod
  fun startHost(contextJson: String, promise: Promise) {
    executor.execute {
      try {
        stopInternal()
        val sessionId = UUID.randomUUID().toString()
        val token = UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "")
        val server = ServerSocket(0)
        server.reuseAddress = true
        serverSocket = server
        hostSessionId = sessionId
        hostToken = token
        role = "host"
        acceptLoop(server)
        val result = Arguments.createMap()
        result.putString("host", localIpv4())
        result.putInt("port", server.localPort)
        result.putString("sessionId", sessionId)
        result.putString("token", token)
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("METRA_COMPANION_HOST_ERROR", e.message, e)
      }
    }
  }

  @ReactMethod
  fun connect(host: String, port: Int, sessionId: String, token: String, promise: Promise) {
    executor.execute {
      try {
        disconnectInternal()
        val client = Socket(host, port)
        client.tcpNoDelay = true
        client.soTimeout = 0
        val out = DataOutputStream(BufferedOutputStream(client.getOutputStream()))
        val input = DataInputStream(BufferedInputStream(client.getInputStream()))
        socket = client
        output = out
        role = "client"
        writeFrame(JSONObject().put("kind", "auth").put("sessionId", sessionId).put("token", token))
        emit("status", mapOf("status" to "connected", "role" to "client"))
        executor.execute { readerLoop(client, input) }
        promise.resolve(true)
      } catch (e: Exception) {
        disconnectInternal()
        promise.reject("METRA_COMPANION_CONNECT_ERROR", e.message, e)
      }
    }
  }

  @ReactMethod
  fun sendMessage(messageJson: String, promise: Promise) {
    executor.execute {
      try {
        writeFrame(JSONObject().put("kind", "message").put("messageJson", messageJson))
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("METRA_COMPANION_SEND_ERROR", e.message, e)
      }
    }
  }

  @ReactMethod
  fun sendFile(metaJson: String, uri: String, promise: Promise) {
    executor.execute {
      try {
        val parsed = Uri.parse(uri)
        val file = if (parsed.scheme == "file") File(parsed.path ?: "") else File(uri)
        if (!file.exists()) throw IllegalArgumentException("Fichier photo introuvable")
        val header = JSONObject()
          .put("kind", "file")
          .put("metaJson", metaJson)
          .put("name", file.name)
        writeFrame(header, file)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("METRA_COMPANION_FILE_ERROR", e.message, e)
      }
    }
  }

  @ReactMethod
  fun generateQr(payload: String, size: Int, promise: Promise) {
    executor.execute {
      try {
        val targetSize = size.coerceIn(256, 1400)
        val matrix = QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, targetSize, targetSize)
        val bitmap = Bitmap.createBitmap(targetSize, targetSize, Bitmap.Config.ARGB_8888)
        for (x in 0 until targetSize) for (y in 0 until targetSize) {
          bitmap.setPixel(x, y, if (matrix[x, y]) 0xFF111111.toInt() else 0xFFFFFFFF.toInt())
        }
        val file = File(context.cacheDir, "metra_companion_qr_" + UUID.randomUUID().toString() + ".png")
        FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
        promise.resolve(Uri.fromFile(file).toString())
      } catch (e: Exception) {
        promise.reject("METRA_COMPANION_QR_ERROR", e.message, e)
      }
    }
  }

  @ReactMethod
  fun decodeQr(uri: String, promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject("METRA_COMPANION_SCAN_ERROR", "Activité Android indisponible")
      return
    }
    try {
      val scanner = GmsBarcodeScanning.getClient(activity)
      scanner.startScan()
        .addOnSuccessListener { barcode -> promise.resolve(barcode.rawValue ?: "") }
        .addOnCanceledListener { promise.resolve("") }
        .addOnFailureListener { e -> promise.reject("METRA_COMPANION_SCAN_ERROR", e.message, e) }
    } catch (e: Exception) {
      promise.reject("METRA_COMPANION_SCAN_ERROR", e.message, e)
    }
  }

  private fun disconnectInternal() {
    try { socket?.close() } catch (_: Exception) {}
    socket = null
    output = null
  }

  private fun stopInternal() {
    disconnectInternal()
    try { serverSocket?.close() } catch (_: Exception) {}
    serverSocket = null
    hostSessionId = null
    hostToken = null
    role = null
  }

  @ReactMethod
  fun disconnect(promise: Promise) {
    disconnectInternal()
    promise.resolve(true)
  }

  @ReactMethod
  fun stop(promise: Promise) {
    stopInternal()
    promise.resolve(true)
  }

  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}

  override fun invalidate() {
    stopInternal()
    executor.shutdownNow()
    super.invalidate()
  }
}
