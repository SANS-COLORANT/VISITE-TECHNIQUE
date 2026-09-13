package com.metra.velvet

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class MetraVelvetManager : SimpleViewManager<MetraVelvetView>() {
  override fun getName() = "MetraVelvetView"
  override fun createViewInstance(context: ThemedReactContext) = MetraVelvetView(context)
  @ReactProp(name = "mode")
  fun setMode(view: MetraVelvetView, mode: String?) = view.setMediaMode(mode)
  @ReactProp(name = "targetDiameter", defaultFloat = 176f)
  fun setDiameter(view: MetraVelvetView, value: Float) = view.setTargetDiameter(value)
  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> = mutableMapOf(
    "topMediaReady" to mapOf("registrationName" to "onMediaReady"),
    "topMediaFinished" to mapOf("registrationName" to "onMediaFinished")
  )
  override fun onDropViewInstance(view: MetraVelvetView) { view.dispose(); super.onDropViewInstance(view) }
}
