package com.metra.missiontools;

import android.app.Instrumentation;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Bundle;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.util.List;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/** Actual Android Text result; injected failures exercise the production loop. */
public class MeterOcrEnhancementInstrumentation extends Instrumentation {
  @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }

  @Override public void onStart() {
    Bundle status = new Bundle();
    Bitmap image = Bitmap.createBitmap(1600, 600, Bitmap.Config.ARGB_8888);
    TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
    try {
      Canvas canvas = new Canvas(image); canvas.drawColor(Color.WHITE);
      Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG); paint.setColor(Color.BLACK); paint.setTextSize(140);
      canvas.drawText("34567.89 MWh", 100, 300, paint);
      Text control = Tasks.await(recognizer.process(InputImage.fromBitmap(image, 0)), 10, TimeUnit.SECONDS);
      if (!control.getText().contains("34567.89 MWh")) throw new AssertionError("Control OCR failed");

      for (int failureAt : new int[]{2, 3, 4, 5}) {
        for (boolean timeout : new boolean[]{false, true}) {
          AtomicInteger calls = new AtomicInteger();
          List<MeterOcrProcessor.Pass> passes = MeterOcrProcessor.read(image, (source, waitMs) -> {
            int call = calls.incrementAndGet();
            if (waitMs <= 0 || waitMs > (call == 1 ? 8000 : 5000)) throw new AssertionError("Unbounded wait");
            if (call == failureAt) {
              if (timeout) throw new TimeoutException("Injected optional timeout");
              throw new IllegalStateException("Injected optional reader failure");
            }
            return control;
          }, 25000);
          if (passes.size() != failureAt - 1 || calls.get() != failureAt)
            throw new AssertionError("Discarded passes or repeated failed enhancement");
          for (MeterOcrProcessor.Pass pass : passes) if (pass.result != control)
            throw new AssertionError("First successful OCR result changed");
          if (image.isRecycled()) throw new AssertionError("Caller-owned photo recycled");
        }
      }

      AtomicInteger calls = new AtomicInteger();
      List<MeterOcrProcessor.Pass> budget = MeterOcrProcessor.read(image, (source, waitMs) -> {
        calls.incrementAndGet(); return control;
      }, 100);
      if (calls.get() != 1 || budget.size() != 1) throw new AssertionError("Budget expiry discarded full read");

      try {
        MeterOcrProcessor.read(image, (source, waitMs) -> { throw new IllegalStateException("Full read failed"); }, 25000);
        throw new AssertionError("Full read error suppressed");
      } catch (IllegalStateException expected) {
        if (!"Full read failed".equals(expected.getMessage())) throw expected;
      }
      status.putString("stream", "PASS: optional error/timeout at four stages; successful passes retained; deadline and initial error checked\n");
      finish(-1, status);
    } catch (Throwable error) {
      status.putString("stream", "FAIL: " + error + "\n"); finish(0, status);
    } finally { recognizer.close(); image.recycle(); }
  }
}
