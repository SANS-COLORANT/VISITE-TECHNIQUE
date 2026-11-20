package com.metra.dpop

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Arguments
import android.net.Uri
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okio.BufferedSink
import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException
import com.facebook.react.bridge.ReadableMap
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.Locale
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import java.math.BigInteger
import java.nio.charset.StandardCharsets
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.util.UUID

class MetraDpopModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  companion object {
    // Ne jamais versionner cet alias avec la version de METRA : il identifie
    // l'installation de l'application sur la tablette pendant toute sa durée de vie.
    private const val KEY_ALIAS = "metra_dpop_p256_v1"
  }

  override fun getName() = "MetraDpop"

  private fun b64(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

  private fun unsigned32(value: BigInteger): ByteArray {
    val raw = value.toByteArray()
    val out = ByteArray(32)
    val src = if (raw.size > 32) raw.copyOfRange(raw.size - 32, raw.size) else raw
    System.arraycopy(src, 0, out, 32 - src.size, src.size)
    return out
  }

  private fun keyStore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

  private fun ensureKey() {
    val store = keyStore()
    if (store.containsAlias(KEY_ALIAS)) return

    val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
    val spec = KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_SIGN)
      .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
      .setDigests(KeyProperties.DIGEST_SHA256)
      .build()
    generator.initialize(spec)
    generator.generateKeyPair()
  }

  private fun publicKey(): ECPublicKey {
    ensureKey()
    return keyStore().getCertificate(KEY_ALIAS).publicKey as ECPublicKey
  }

  private fun joseSignature(der: ByteArray): ByteArray {
    var p = 0
    if ((der[p++].toInt() and 0xff) != 0x30) throw IllegalArgumentException("Signature DER invalide")
    var seqLen = der[p++].toInt() and 0xff
    if ((seqLen and 0x80) != 0) {
      val n = seqLen and 0x7f
      seqLen = 0
      repeat(n) { seqLen = (seqLen shl 8) or (der[p++].toInt() and 0xff) }
    }

    fun readInteger(): ByteArray {
      if ((der[p++].toInt() and 0xff) != 0x02) throw IllegalArgumentException("Entier DER invalide")
      var len = der[p++].toInt() and 0xff
      if ((len and 0x80) != 0) {
        val n = len and 0x7f
        len = 0
        repeat(n) { len = (len shl 8) or (der[p++].toInt() and 0xff) }
      }
      var value = der.copyOfRange(p, p + len)
      p += len
      while (value.size > 32 && value[0].toInt() == 0) value = value.copyOfRange(1, value.size)
      if (value.size > 32) throw IllegalArgumentException("Entier ECDSA trop long")
      return ByteArray(32).also { System.arraycopy(value, 0, it, 32 - value.size, value.size) }
    }

    val r = readInteger()
    val s = readInteger()
    return r + s
  }

  @ReactMethod
  fun hasKey(promise: Promise) {
    try {
      promise.resolve(keyStore().containsAlias(KEY_ALIAS))
    } catch (e: Exception) {
      promise.reject("METRA_DPOP_KEY_STATUS_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun randomUuid(promise: Promise) {
    try {
      promise.resolve(UUID.randomUUID().toString())
    } catch (e: Exception) {
      promise.reject("METRA_UUID_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun createProof(method: String, htu: String, accessToken: String?, promise: Promise) {
    try {
      ensureKey()
      val pub = publicKey()
      val jwk = JSONObject()
        .put("kty", "EC")
        .put("crv", "P-256")
        .put("x", b64(unsigned32(pub.w.affineX)))
        .put("y", b64(unsigned32(pub.w.affineY)))
      val header = JSONObject().put("typ", "dpop+jwt").put("alg", "ES256").put("jwk", jwk)
      val payload = JSONObject()
        .put("jti", UUID.randomUUID().toString())
        .put("htm", method.uppercase())
        .put("htu", htu)
        .put("iat", System.currentTimeMillis() / 1000L)
      if (!accessToken.isNullOrBlank()) {
        payload.put(
          "ath",
          b64(MessageDigest.getInstance("SHA-256").digest(accessToken.toByteArray(StandardCharsets.US_ASCII)))
        )
      }

      val signingInput = b64(header.toString().toByteArray(StandardCharsets.UTF_8)) + "." + b64(payload.toString().toByteArray(StandardCharsets.UTF_8))
      val entry = keyStore().getEntry(KEY_ALIAS, null) as KeyStore.PrivateKeyEntry
      val signer = Signature.getInstance("SHA256withECDSA")
      signer.initSign(entry.privateKey)
      signer.update(signingInput.toByteArray(StandardCharsets.US_ASCII))
      promise.resolve(signingInput + "." + b64(joseSignature(signer.sign())))
    } catch (e: Exception) {
      promise.reject("METRA_DPOP_ERROR", e.message, e)
    }
  }

  // All Intranet requests must be performed by this module, never by RN fetch.
  // OkHttp's default redirect handling may otherwise forward a DPoP proof.
  private val noRedirectClient: OkHttpClient = OkHttpClient.Builder()
    .followRedirects(false)
    .followSslRedirects(false)
    .retryOnConnectionFailure(false)
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(65, TimeUnit.SECONDS)
    .callTimeout(95, TimeUnit.SECONDS)
    .build()

  private fun protectedHttpUrl(value: String): HttpUrl {
    val target = value.toHttpUrlOrNull() ?: throw IllegalArgumentException("URL Intranet invalide")
    if (
      target.scheme != "https" ||
      target.host != "intranet-energieetservice.com" ||
      target.port != 443 ||
      target.username.isNotEmpty() ||
      target.password.isNotEmpty() ||
      target.fragment != null
    ) {
      throw IllegalArgumentException("Origine Intranet non autorisée")
    }
    return target
  }

  // Do not use ResponseBody.bytes(): it can allocate without an upper bound.
  private fun boundedResponseBytes(response: Response): ByteArray {
    val entity = response.body ?: return ByteArray(0)
    val limit = 64L * 1024L * 1024L
    if (entity.contentLength() > limit) throw IOException("Réponse Intranet dépassant 64 Mio")
    return entity.byteStream().use { input ->
      ByteArrayOutputStream().use { output ->
        val buffer = ByteArray(16384)
        var total = 0L
        while (true) {
          val read = input.read(buffer)
          if (read < 0) break
          total += read.toLong()
          if (total > limit) throw IOException("Réponse Intranet dépassant 64 Mio")
          output.write(buffer, 0, read)
        }
        output.toByteArray()
      }
    }
  }

  private fun enqueueHttpRequest(request: Request, responseFormat: String, promise: Promise) {
    noRedirectClient.newCall(request).enqueue(object : Callback {
      override fun onFailure(call: Call, error: IOException) {
        promise.reject("METRA_INTRANET_NETWORK_ERROR", "Connexion HTTPS Intranet indisponible", error)
      }

      override fun onResponse(call: Call, response: Response) {
        response.use { result ->
          try {
            // Explicitly fail closed for 301, 302, 303, 307 and 308, including
            // redirect responses to the exact same HTTPS origin.
            if (result.code in 300..399) {
              // Return the original 3xx code without following Location. JS can
              // then mark this upload as a permanent, visible refusal, not
              // as a transient offline network error.
              val blocked = Arguments.createMap()
              blocked.putInt("status", result.code)
              blocked.putString("text", "")
              blocked.putMap("headers", Arguments.createMap())
              promise.resolve(blocked)
            } else {
              val bytes = boundedResponseBytes(result)
              val payload = Arguments.createMap()
              val headerMap = Arguments.createMap()
              payload.putInt("status", result.code)
              for (name in result.headers.names()) {
                if (name.lowercase(Locale.ROOT) != "set-cookie") {
                  headerMap.putString(name.lowercase(Locale.ROOT), result.header(name))
                }
              }
              payload.putMap("headers", headerMap)
              if (result.isSuccessful && responseFormat == "base64") {
                payload.putString("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
              } else {
                payload.putString("text", String(bytes, StandardCharsets.UTF_8))
              }
              promise.resolve(payload)
            }
          } catch (error: Exception) {
            promise.reject("METRA_INTRANET_RESPONSE_ERROR", "Réponse HTTPS Intranet non traitable", error)
          }
        }
      }
    })
  }
  @ReactMethod
  fun secureHttpRequest(
    method: String, url: String, headers: ReadableMap, body: String?,
    responseFormat: String, promise: Promise
  ) {
    try {
      val target = protectedHttpUrl(url)
      val verb = method.uppercase(Locale.ROOT)
      if (verb != "GET" && verb != "POST") {
        throw IllegalArgumentException("Méthode HTTP non autorisée pour le client Intranet")
      }
      if (verb == "GET" && body != null) {
        throw IllegalArgumentException("GET ne doit pas transmettre de corps")
      }
      if (responseFormat != "text" && responseFormat != "base64") {
        throw IllegalArgumentException("Format de réponse Intranet non autorisé")
      }

      val builder = Request.Builder().url(target)
      for ((name, rawValue) in headers.toHashMap()) {
        val forbidden = setOf(
          "host", "cookie", "proxy-authorization", "connection",
          "transfer-encoding", "content-length", "location", "referer"
        )
        if (name.lowercase(Locale.ROOT) in forbidden) {
          throw IllegalArgumentException("En-tête HTTP non autorisé")
        }
        val value = rawValue as? String ?: throw IllegalArgumentException("En-tête HTTP invalide")
        builder.header(name, value)
      }
      val requestBody = if (verb == "POST") (body ?: "").toRequestBody(null) else null
      val request = builder.method(verb, requestBody).build()

      enqueueHttpRequest(request, responseFormat, promise)
    } catch (error: Exception) {
      promise.reject("METRA_INTRANET_REQUEST_ERROR", "Requête sécurisée Intranet invalide", error)
    }
  }

  // Keep upload bytes out of the React Native FormData -> String bridge.
  // The file is read in 16 KiB slices from an Android-private URI.
  @ReactMethod
  fun secureMultipartPhotoUpload(
    url: String, headers: ReadableMap, fields: ReadableMap,
    localUri: String, fileName: String, mimeType: String, promise: Promise
  ) {
    try {
      val target = protectedHttpUrl(url)
      if (!Regex("^/api/clients/[^/]+/visites/[^/]+/photos$").matches(target.encodedPath)
        || target.query != null) {
        throw IllegalArgumentException("Chemin de transmission photo Intranet interdit")
      }
      if (fileName !in setOf("photo.jpg", "photo.png", "photo.webp", "photo.gif")) {
        throw IllegalArgumentException("Nom de photo non autorisé")
      }
      if (mimeType !in setOf("image/jpeg", "image/png", "image/webp", "image/gif")) {
        throw IllegalArgumentException("Type de photo non autorisé")
      }
      val location = Uri.parse(localUri)
      if (location.scheme != "file" && location.scheme != "content") {
        throw IllegalArgumentException("Le fichier photo doit provenir d'un URI local")
      }
      val privatePhoto = if (location.scheme == "file") {
        val file = File(location.path ?: throw FileNotFoundException("Chemin photo absent")).canonicalFile
        val roots = listOf(reactApplicationContext.filesDir, reactApplicationContext.cacheDir) +
          reactApplicationContext.getExternalFilesDirs(null).filterNotNull()
        if (roots.none { root ->
            val base = root.canonicalFile.path
            file.path.startsWith(base + File.separator)
          }) {
          throw IllegalArgumentException("Le fichier photo doit rester dans le stockage privé METRA")
        }
        if (!file.isFile || file.length() <= 0 || file.length() > 10L * 1024L * 1024L) {
          throw IllegalArgumentException("Fichier photo absent ou trop volumineux")
        }
        file
      } else null

      val uploadBody = object : RequestBody() {
        override fun contentType() = mimeType.toMediaTypeOrNull()
        override fun contentLength(): Long = privatePhoto?.length() ?: -1L
        override fun writeTo(sink: BufferedSink) {
          val input = if (privatePhoto != null) FileInputStream(privatePhoto)
            else reactApplicationContext.contentResolver.openInputStream(location)
              ?: throw FileNotFoundException("URI photo non accessible")
          input.use { stream ->
            val bytes = ByteArray(16384)
            var total = 0L
            while (true) {
              val length = stream.read(bytes)
              if (length < 0) break
              total += length.toLong()
              if (total > 10L * 1024L * 1024L) throw IOException("Photo dépassant 10 Mio")
              sink.write(bytes, 0, length)
            }
          }
        }
      }

      val form = MultipartBody.Builder().setType(MultipartBody.FORM)
      val allowedFields = setOf(
        "envoiPhotoId", "description", "ordre", "grandFormat",
        "categorieId", "sousCategorieId", "critereId"
      )
      val data = fields.toHashMap()
      if (!data.keys.all { it in allowedFields }
        || !data.containsKey("envoiPhotoId")
        || data["envoiPhotoId"].toString().isBlank()) {
        throw IllegalArgumentException("Champs de photo Intranet invalides")
      }
      for ((name, value) in data) {
        val textValue = value as? String ?: throw IllegalArgumentException("Valeur de photo non textuelle")
        if (textValue.length > 4096) throw IllegalArgumentException("Valeur de photo trop longue")
        form.addFormDataPart(name, textValue)
      }
      form.addFormDataPart("fichier", fileName, uploadBody)

      val builder = Request.Builder().url(target)
      val blockedHeaders = setOf(
        "host", "cookie", "proxy-authorization", "connection",
        "transfer-encoding", "content-length", "content-type", "location", "referer"
      )
      for ((name, value) in headers.toHashMap()) {
        if (name.lowercase(Locale.ROOT) in blockedHeaders) {
          throw IllegalArgumentException("En-tête photo HTTP interdit")
        }
        builder.header(name, value as? String ?: throw IllegalArgumentException("En-tête photo non textuel"))
      }
      enqueueHttpRequest(builder.post(form.build()).build(), "text", promise)
    } catch (error: Exception) {
      promise.reject("METRA_INTRANET_MULTIPART_ERROR", "Envoi photo HTTPS non disponible", error)
    }
  }

}
