package com.metra.velvet

import android.animation.ValueAnimator
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.graphics.drawable.Animatable2
import android.graphics.drawable.AnimatedImageDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.view.animation.LinearInterpolator
import android.widget.ImageView
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.uimanager.PixelUtil
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter
import java.util.concurrent.Executors

/** Local assets only. No network, ImageView/Fresco animated-WebP dependency, or JS end timer. */
class MetraVelvetView(private val reactContext: ThemedReactContext) : ImageView(reactContext), LifecycleEventListener {
  companion object {
    private val decoder = Executors.newSingleThreadExecutor()
    @Volatile private var dockBitmap: Bitmap? = null
    private const val ROOT = "metra/velvet/"
  }
  private var mode = ""
  private var generation = 0
  private var disposed = false
  private var ended = false
  private var started = false
  private var targetDp = 176f
  private var movement = 0f
  private var motion: ValueAnimator? = null
  private var sourceDrawable: Drawable? = null

  init {
    setBackgroundColor(Color.TRANSPARENT)
    scaleType = ScaleType.MATRIX
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    reactContext.addLifecycleEventListener(this)
  }

  fun setTargetDiameter(value: Float) {
    targetDp = value.coerceIn(80f, 320f)
    updateTransform()
  }

  fun setMediaMode(value: String?) {
    val next = if (value == "intro") "intro" else "dock"
    if (next == mode || disposed) return
    stopDrawable()
    mode = next
    ended = false
    started = false
    movement = 0f
    val ticket = ++generation
    if (next == "intro" && Build.VERSION.SDK_INT < 28) {
      post { if (!disposed && ticket == generation) finish("unsupported-android") }
      return
    }
    decoder.execute {
      try {
        var bitmap = dockBitmap
        if (bitmap == null) {
          bitmap = reactContext.assets.open(ROOT + "spiral-dock.png").use { BitmapFactory.decodeStream(it) }
            ?: throw IllegalStateException("Velvet dock cannot be decoded")
          dockBitmap = bitmap
        }
        val decoded = if (next == "intro" && Build.VERSION.SDK_INT >= 28) {
          ImageDecoder.decodeDrawable(ImageDecoder.createSource(reactContext.assets, ROOT + "METRA_Spirale_Intro_V4.webp")) { decoder, info, _ ->
            require(info.size.width == 2048 && info.size.height == 1024) { "Unexpected velvet canvas" }
            decoder.setTargetSize(2048, 1024)
          }
        } else null
        post {
          if (!disposed && ticket == generation && !ended) {
            if (next == "dock") {
              scaleType = ScaleType.FIT_CENTER
              setImageBitmap(bitmap)
              emit("topMediaReady", "dock")
            } else if (Build.VERSION.SDK_INT >= 28 && decoded is AnimatedImageDrawable) {
              scaleType = ScaleType.MATRIX
              sourceDrawable = decoded
              decoded.repeatCount = 0 // Exactly one pass, irrespective of encoded loop count.
              decoded.registerAnimationCallback(object : Animatable2.AnimationCallback() {
                override fun onAnimationStart(drawable: Drawable?) {
                  post {
                    if (!disposed && ticket == generation && !ended) {
                      motion = ValueAnimator.ofFloat(0f, 1f).apply {
                        duration = 4900L
                        interpolator = LinearInterpolator()
                        addUpdateListener { movement = it.animatedValue as Float; updateTransform() }
                        start()
                      }
                    }
                  }
                }
                override fun onAnimationEnd(drawable: Drawable?) {
                  post {
                    if (!disposed && ticket == generation && !ended) {
                      movement = 1f
                      motion?.cancel()
                      updateTransform()
                      // Preserve the final native frame before asking React to transition.
                      postOnAnimation { if (!disposed && ticket == generation) finish("completed") }
                    }
                  }
                }
              })
              setImageDrawable(decoded)
              updateTransform()
              emit("topMediaReady", "intro")
              maybeStart()
            } else finish("not-animated")
          }
        }
      } catch (error: Exception) {
        post { if (!disposed && ticket == generation && !ended) finish("decode-error") }
      }
    }
  }

  private fun maybeStart() {
    if (Build.VERSION.SDK_INT >= 28 && mode == "intro" && isAttachedToWindow && width > 0 && height > 0 && !started && !ended) {
      val animation = sourceDrawable as? AnimatedImageDrawable ?: return
      started = true
      animation.start()
    }
  }

  private fun updateTransform() {
    if (mode != "intro" || width <= 0 || height <= 0) return
    val density = PixelUtil.toPixelFromDIP(1f)
    // Registration measured from the supplied V4 source, not a replacement animation.
    val finalScale = targetDp * density / 462f
    val initialDiameter = minOf(width * 0.58f, height * 0.40f, 264f * density)
    val initialScale = initialDiameter / 297f
    val t = ((movement * 4900f - 2900f) / 1500f).coerceIn(0f, 1f)
    val blend = t * t * (3f - 2f * t)
    val scale = initialScale + (finalScale - initialScale) * blend
    val fromX = width / 2f - 1012f * initialScale
    val fromY = height * 0.45f - 542f * initialScale
    val toX = width / 2f - 1023f * finalScale
    val toY = height - 1024f * finalScale
    imageMatrix = Matrix().apply {
      setScale(scale, scale)
      postTranslate(fromX + (toX - fromX) * blend, fromY + (toY - fromY) * blend)
    }
    invalidate()
  }

  private fun emit(event: String, reason: String) {
    if (disposed || id == NO_ID || !reactContext.hasActiveCatalystInstance()) return
    val data = Arguments.createMap().apply { putString("reason", reason); putString("mode", mode) }
    reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(id, event, data)
  }

  private fun finish(reason: String) {
    if (disposed || ended) return
    ended = true
    motion?.cancel()
    emit("topMediaFinished", reason)
  }

  private fun stopDrawable() {
    motion?.cancel()
    motion = null
    if (Build.VERSION.SDK_INT >= 28) (sourceDrawable as? AnimatedImageDrawable)?.let {
      it.clearAnimationCallbacks()
      it.stop()
    }
    sourceDrawable = null
  }

  override fun onAttachedToWindow() { super.onAttachedToWindow(); maybeStart() }
  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    updateTransform()
    maybeStart()
  }
  override fun onHostResume() { maybeStart() }
  override fun onHostPause() {
    if (mode == "intro" && !ended) { finish("interrupted"); stopDrawable() }
  }
  override fun onHostDestroy() { dispose() }
  fun dispose() {
    if (disposed) return
    disposed = true
    generation++
    stopDrawable()
    setImageDrawable(null)
    reactContext.removeLifecycleEventListener(this)
  }
}
