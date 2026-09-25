package com.metra.companion

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.integration.android.IntentIntegrator
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.util.Collections
import java.util.UUID
import java.util.concurrent.Executors

class MetraCompanionModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context), ActivityEventListener {
  private val executor = Executors.newCachedThreadPool()
  @Volatile private var serverSocket: ServerSocket? = null
  @Volatile private var socket: Socket? = null
  @Volatile private var output: DataOutputStream? = null
  @Volatile private var hostSessionId: String? = null
  @Volatile private var hostToken: String? = null
  @Volatile private var role: String? = null
  private val writeLock = Any()
  @Volatile private var scanPromise: Promise? = null

  init {
    context.addActivityEventListener(this)
  }

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

  private data class LanRoute(
    val network: Network,
    val address: Inet4Address,
    val prefixLength: Int
  )

  private fun lanRoutes(): List<LanRoute> {
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return emptyList()
    val result = mutableListOf<LanRoute>()

    for (network in manager.allNetworks) {
      val capabilities = manager.getNetworkCapabilities(network) ?: continue
      val isLanTransport =
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
          capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
      if (!isLanTransport) continue

      val properties = manager.getLinkProperties(network) ?: continue
      for (link in properties.linkAddresses) {
        val address = link.address
        if (address is Inet4Address && !address.isLoopbackAddress && address.isSiteLocalAddress) {
          result.add(LanRoute(network, address, link.prefixLength.coerceIn(0, 32)))
        }
      }
    }
    return result
  }

  private fun sameIpv4Subnet(local: Inet4Address, remote: Inet4Address, prefixLength: Int): Boolean {
    if (prefixLength <= 0) return true
    val localBytes = local.address
    val remoteBytes = remote.address
    var bits = prefixLength
    for (index in 0 until 4) {
      if (bits <= 0) break
      val take = minOf(8, bits)
      val mask = (0xFF shl (8 - take)) and 0xFF
      if ((localBytes[index].toInt() and mask) != (remoteBytes[index].toInt() and mask)) return false
      bits -= take
    }
    return true
  }

  private fun selectLanRoute(host: String? = null): LanRoute? {
    val routes = lanRoutes()
    if (routes.isEmpty()) return null
    if (!host.isNullOrBlank()) {
      try {
        val remote = InetAddress.getByName(host)
        if (remote is Inet4Address) {
          routes.firstOrNull { sameIpv4Subnet(it.address, remote, it.prefixLength) }?.let { return it }
        }
      } catch (_: Exception) {}
    }
    return routes.firstOrNull()
  }

  private fun matchingInterfaceAddress(host: String): Inet4Address? {
    val remote = try { InetAddress.getByName(host) as? Inet4Address } catch (_: Exception) { null } ?: return null
    val enumeration = NetworkInterface.getNetworkInterfaces() ?: return null
    for (networkInterface in Collections.list(enumeration)) {
      if (!networkInterface.isUp || networkInterface.isLoopback) continue
      for (interfaceAddress in networkInterface.interfaceAddresses) {
        val local = interfaceAddress.address
        if (local !is Inet4Address || local.isLoopbackAddress || !local.isSiteLocalAddress) continue
        val prefixLength = interfaceAddress.networkPrefixLength.toInt().coerceIn(0, 32)
        if (sameIpv4Subnet(local, remote, prefixLength)) return local
      }
    }
    return null
  }

  private fun localIpv4(): String {
    // Toujours privilégier une vraie interface Wi-Fi/Ethernet. Android peut
    // conserver le réseau cellulaire/VPN comme réseau par défaut même quand le
    // téléphone est connecté au même Wi-Fi que la tablette.
    selectLanRoute()?.address?.hostAddress?.let { return it }

    val enumeration = NetworkInterface.getNetworkInterfaces()
      ?: throw IllegalStateException("Aucun réseau local actif. Active le Wi-Fi sur la tablette.")
    val interfaces = Collections.list(enumeration)
    for (network in interfaces) {
      if (!network.isUp || network.isLoopback) continue
      for (address in Collections.list(network.inetAddresses)) {
        if (address is Inet4Address && !address.isLoopbackAddress && address.isSiteLocalAddress) {
          return address.hostAddress ?: continue
        }
      }
    }
    throw IllegalStateException("Aucun réseau local joignable. Active le Wi-Fi sur la tablette et le téléphone.")
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
        val lanRoute = selectLanRoute(host)
        val client = lanRoute?.network?.socketFactory?.createSocket() ?: Socket().apply {
          // Cas partage de connexion : le téléphone qui fournit le hotspot
          // n'expose pas toujours son interface SoftAP comme un Network Android.
          // On lie alors explicitement la socket à l'IPv4 locale qui appartient
          // au même sous-réseau que la tablette, au lieu de laisser Android
          // choisir le réseau cellulaire/CLAT (ex. 192.0.0.4).
          matchingInterfaceAddress(host)?.let { local ->
            bind(InetSocketAddress(local, 0))
          }
        }
        client.connect(InetSocketAddress(host, port), 5000)
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
        val matrix = QRCodeWriter().encode(
          payload,
          BarcodeFormat.QR_CODE,
          targetSize,
          targetSize,
          mapOf(EncodeHintType.CHARACTER_SET to "UTF-8", EncodeHintType.MARGIN to 1)
        )
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
    if (scanPromise != null) {
      promise.reject("METRA_COMPANION_SCAN_BUSY", "Un scan QR est déjà en cours")
      return
    }
    try {
      scanPromise = promise
      IntentIntegrator(activity)
        .setDesiredBarcodeFormats(IntentIntegrator.QR_CODE)
        .setPrompt("Scanner le QR MÉTRA")
        .setBeepEnabled(false)
        .setBarcodeImageEnabled(false)
        .setOrientationLocked(false)
        .initiateScan()
    } catch (e: Exception) {
      scanPromise = null
      promise.reject("METRA_COMPANION_SCAN_ERROR", e.message, e)
    }
  }

  override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != IntentIntegrator.REQUEST_CODE) return
    val promise = scanPromise ?: return
    scanPromise = null
    try {
      val result = IntentIntegrator.parseActivityResult(requestCode, resultCode, data)
      promise.resolve(result?.contents ?: "")
    } catch (e: Exception) {
      promise.reject("METRA_COMPANION_SCAN_ERROR", e.message, e)
    }
  }

  override fun onNewIntent(intent: Intent?) {}

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
    scanPromise?.resolve("")
    scanPromise = null
    context.removeActivityEventListener(this)
    stopInternal()
    executor.shutdownNow()
    super.invalidate()
  }
}
