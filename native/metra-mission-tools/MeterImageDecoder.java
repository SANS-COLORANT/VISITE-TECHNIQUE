package com.metra.missiontools;

import android.content.ContentResolver;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import java.io.InputStream;
import java.io.IOException;

/** Shared by the React Native bridge and the Android OCR regression harness. */
public final class MeterImageDecoder {
  private MeterImageDecoder() {}

  public static BitmapFactory.Options optionsFor(int width, int height) {
    if (width <= 0 || height <= 0) throw new IllegalArgumentException("Image illisible");
    BitmapFactory.Options options = new BitmapFactory.Options();
    // BitmapFactory.Options defaults to ZERO: initialize before any division.
    options.inSampleSize = 1;
    int longest = Math.max(width, height);
    while ((long) longest > 3200L * options.inSampleSize) options.inSampleSize *= 2;
    return options;
  }

  public static Bitmap decode(ContentResolver resolver, Uri uri) throws IOException {
    BitmapFactory.Options bounds = new BitmapFactory.Options();
    bounds.inJustDecodeBounds = true;
    try (InputStream input = resolver.openInputStream(uri)) {
      if (input == null) throw new IOException("Photo inaccessible");
      BitmapFactory.decodeStream(input, null, bounds);
    }
    BitmapFactory.Options options = optionsFor(bounds.outWidth, bounds.outHeight);
    try (InputStream input = resolver.openInputStream(uri)) {
      if (input == null) throw new IOException("Photo inaccessible");
      Bitmap bitmap = BitmapFactory.decodeStream(input, null, options);
      if (bitmap == null) throw new IOException("Image illisible");
      return bitmap;
    }
  }
}
