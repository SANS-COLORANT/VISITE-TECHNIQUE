package com.metra.dpop

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
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
}
