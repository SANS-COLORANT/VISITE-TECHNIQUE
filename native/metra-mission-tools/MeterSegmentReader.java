package com.metra.missiontools;

import android.graphics.Bitmap;
import android.graphics.Rect;
import com.google.mlkit.vision.text.Text;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Second opinion for LCD meters: ML Kit finds WHERE the digit line is (its line
 * boxes are reliable even when its digits are not), SevenSegmentReader decides
 * WHICH digits are lit. Offline, no service, no meter identity, one photograph.
 */
public final class MeterSegmentReader {
  private MeterSegmentReader() {}

  public static final class Candidate {
    public final SevenSegmentReader.Result result;
    /** Line box in photo pixels (the area handed to the reader). */
    public final Rect lineBox;
    /** Digits ML Kit itself counted on that line, to cross-check the structure. */
    public final int mlKitDigitCount;
    public final String mlKitText;
    Candidate(SevenSegmentReader.Result result, Rect lineBox, int mlKitDigitCount, String mlKitText) {
      this.result = result; this.lineBox = lineBox; this.mlKitDigitCount = mlKitDigitCount; this.mlKitText = mlKitText;
    }
  }

  private static boolean technical(String text) {
    return text.toLowerCase(Locale.ROOT).matches(".*\\b(s/?n|serial|type|cfg|cfa|prog|classe|multical|pt100|h71|position|poids|coefficient)\\b.*");
  }

  static int digitCount(String text) {
    int count = 0;
    for (int i = 0; i < text.length(); i++) if (Character.isDigit(text.charAt(i))) count++;
    return count;
  }

  /** Lines of the full-photo pass that could be a display row, tallest first. */
  static List<Text.Line> displayLines(Text fullPass) {
    List<Text.Line> lines = new ArrayList<>();
    for (Text.TextBlock block : fullPass.getTextBlocks()) {
      for (Text.Line line : block.getLines()) {
        Rect box = line.getBoundingBox();
        if (box == null || box.height() < 14 || box.width() < box.height()) continue;
        String text = line.getText();
        if (technical(text) || digitCount(text) < 2) continue;
        lines.add(line);
      }
    }
    lines.sort((a, b) -> Integer.compare(b.getBoundingBox().height(), a.getBoundingBox().height()));
    return lines;
  }

  public static List<Candidate> read(Bitmap image, Text fullPass, int maxCandidates) {
    List<Candidate> out = new ArrayList<>();
    List<Rect> used = new ArrayList<>();
    for (Text.Line line : displayLines(fullPass)) {
      if (out.size() >= maxCandidates) break;
      Rect box = line.getBoundingBox();
      boolean duplicate = false;
      for (Rect other : used) if (Rect.intersects(other, box)) duplicate = true;
      if (duplicate) continue;
      Candidate candidate = readLine(image, box, line.getText());
      if (candidate != null) { out.add(candidate); used.add(box); }
    }
    return out;
  }

  static Candidate readLine(Bitmap image, Rect box, String mlKitText) {
    int[] crop = SevenSegmentReader.cropFor(box.left, box.top, box.right, box.bottom, image.getWidth(), image.getHeight());
    if (crop == null) return null;
    int cw = crop[2] - crop[0], ch = crop[3] - crop[1];
    int[] pixels = new int[cw * ch];
    image.getPixels(pixels, 0, cw, crop[0], crop[1], cw, ch);
    int[] gray = new int[pixels.length];
    for (int i = 0; i < pixels.length; i++) {
      int p = pixels[i];
      gray[i] = (((p >> 16) & 255) * 30 + ((p >> 8) & 255) * 59 + (p & 255) * 11) / 100;
    }
    SevenSegmentReader.Result result = SevenSegmentReader.readCropped(gray, crop, box.left, box.top, box.right, box.bottom);
    if (result == null || result.cells.size() < 2) return null;
    return new Candidate(result, box, digitCount(mlKitText), mlKitText);
  }
}
