package com.metra.missiontools;

import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.file.Files;
import java.util.Random;
import javax.imageio.ImageIO;

/**
 * JVM regression for SevenSegmentReader (no Android needed).
 *
 *   java SevenSegmentReaderCheck synthetic
 *       Renders LCD rows (ghost segments, slant, blur, noise, reflection) and checks them.
 *   java SevenSegmentReaderCheck real cases.tsv
 *       Local-only: reads private photo crops listed as "path top bottom left right label"
 *       (coordinates in working pixels) and prints per-digit / exact-index accuracy.
 */
public final class SevenSegmentReaderCheck {
  public static void main(String[] args) throws Exception {
    if (args.length > 0 && args[0].equals("real")) { real(new File(args[1])); return; }
    if (args.length > 0 && args[0].equals("photo")) { photo(new File(args[1])); return; }
    synthetic();
  }

  // ------------------------------------------------------------------ synthetic

  static final int[][] PAT = SevenSegmentReader.PAT;

  /** Renders digits right-aligned in cells. dot>=0 draws a decimal point after that digit. */
  static BufferedImage render(String digits, int dotAfter, int height, double slant, int ghostLevel, Random rnd, int noise) {
    int dw = (int) (0.55 * height), pitch = (int) (0.80 * height);
    int pad = height, widthPx = pad * 2 + pitch * (digits.length() + 2);
    int heightPx = height * 2;
    int[] pix = new int[widthPx * heightPx];
    java.util.Arrays.fill(pix, 188);
    int top = height / 2, thick = Math.max(2, (int) (0.14 * height));
    for (int i = 0; i < digits.length() + 2; i++) {
      // two leading unlit positions show only ghost segments
      char c = i < 2 ? ' ' : digits.charAt(i - 2);
      int idx = c == ' ' ? SevenSegmentReader.BLANK : SevenSegmentReader.KEYS.indexOf(c);
      int x0 = pad + i * pitch;
      for (int s = 0; s < 7; s++) {
        boolean lit = PAT[idx][s] == 1;
        int value = lit ? 52 : ghostLevel;
        int ax, ay, aw, ah;
        switch (s) {
          case 0: ax = x0 + thick / 2; ay = top; aw = dw - thick; ah = thick; break;
          case 1: ax = x0 + dw - thick; ay = top + thick / 2; aw = thick; ah = height / 2 - thick; break;
          case 2: ax = x0 + dw - thick; ay = top + height / 2 + thick / 2; aw = thick; ah = height / 2 - thick; break;
          case 3: ax = x0 + thick / 2; ay = top + height - thick; aw = dw - thick; ah = thick; break;
          case 4: ax = x0; ay = top + height / 2 + thick / 2; aw = thick; ah = height / 2 - thick; break;
          case 5: ax = x0; ay = top + thick / 2; aw = thick; ah = height / 2 - thick; break;
          default: ax = x0 + thick / 2; ay = top + height / 2 - thick / 2; aw = dw - thick; ah = thick; break;
        }
        paint(pix, widthPx, heightPx, ax, ay, aw, ah, value, slant, top + height / 2);
      }
      if (i >= 2 && dotAfter == i - 2) paint(pix, widthPx, heightPx, x0 + dw + thick / 2, top + height - thick, thick, thick, 52, slant, top + height / 2);
    }
    // LCD frame (bright bezel), a bracket reflection line and unit text blob
    paint(pix, widthPx, heightPx, 4, 4, widthPx - 8, 3, 70, 0, 0);
    paint(pix, widthPx, heightPx, 4, heightPx - 8, widthPx - 8, 3, 70, 0, 0);
    // soften (3x3 box) and add noise
    int[] soft = new int[pix.length];
    for (int y = 0; y < heightPx; y++) for (int x = 0; x < widthPx; x++) {
      int sum = 0, n = 0;
      for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
        int xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < widthPx && yy < heightPx) { sum += pix[yy * widthPx + xx]; n++; }
      }
      soft[y * widthPx + x] = Math.max(0, Math.min(255, sum / n + (noise > 0 ? rnd.nextInt(2 * noise + 1) - noise : 0)));
    }
    BufferedImage img = new BufferedImage(widthPx, heightPx, BufferedImage.TYPE_INT_RGB);
    for (int y = 0; y < heightPx; y++) for (int x = 0; x < widthPx; x++) { int v = soft[y * widthPx + x]; img.setRGB(x, y, (v << 16) | (v << 8) | v); }
    return img;
  }

  static void paint(int[] pix, int w, int h, int x, int y, int rw, int rh, int value, double slant, int pivotY) {
    for (int yy = y; yy < y + rh; yy++) {
      int shift = (int) Math.round(slant * (pivotY - yy));
      for (int xx = x; xx < x + rw; xx++) {
        int px = xx + shift;
        if (px >= 0 && px < w && yy >= 0 && yy < h) pix[yy * w + px] = value;
      }
    }
  }

  static int[] gray(BufferedImage img) {
    int[] out = new int[img.getWidth() * img.getHeight()];
    for (int y = 0; y < img.getHeight(); y++) for (int x = 0; x < img.getWidth(); x++) out[y * img.getWidth() + x] = img.getRGB(x, y) & 255;
    return out;
  }

  static void synthetic() {
    String[] numbers = {"3141592", "27182", "804913", "1234567", "90871", "6502", "1357", "246802", "50816", "7719", "06983", "4471830"};
    Random rnd = new Random(7);
    int total = 0, exact = 0, dotsOk = 0, dotCases = 0;
    for (int n = 0; n < numbers.length; n++) {
      String number = numbers[n];
      int dot = number.length() >= 5 ? number.length() - 3 : -1;     // two decimals
      for (int variant = 0; variant < 3; variant++) {
        int height = 70 + variant * 25;
        double slant = new double[]{0.0, 0.10, 0.18}[variant];
        int ghost = new int[]{150, 128, 140}[variant];
        BufferedImage img = render(number, dot, height, slant, ghost, rnd, variant == 2 ? 6 : 2);
        SevenSegmentReader.Prepared prepared = SevenSegmentReader.prepare(gray(img), img.getWidth(), img.getHeight());
        double s = prepared.scale;
        int pad = height, pitch = (int) (0.80 * height);
        int left = (int) ((pad + 2 * pitch - 0.2 * pitch) * s), right = (int) ((pad + (number.length() + 2) * pitch) * s);
        int top = (int) ((height / 2) * s), bottom = (int) ((height / 2 + height) * s);
        // The caller (ML Kit line box / framing) is only approximate: jitter the band by 10 %.
        int jitter = (int) (0.10 * (bottom - top));
        SevenSegmentReader.Result r = SevenSegmentReader.readBox(prepared, top + jitter, bottom + jitter, left, right);
        String got = r == null ? "" : r.digits();
        total++;
        if (got.equals(number)) exact++;
        else System.out.println("  MISS expected " + number + " got " + got + " (h=" + height + ", slant=" + slant + ")");
        if (dot >= 0 && r != null) { dotCases++; if (r.dotAfter == dot) dotsOk++; }
      }
    }
    System.out.println("Synthetic LCD rows: " + exact + "/" + total + " exact; decimal point " + dotsOk + "/" + dotCases);
    if (exact < total) { System.err.println("FAILED: synthetic rows must be read exactly"); System.exit(1); }
    // Blank, noise-only and over-exposed crops must not invent digits.
    BufferedImage blank = new BufferedImage(400, 160, BufferedImage.TYPE_INT_RGB);
    java.awt.Graphics2D g = blank.createGraphics(); g.setColor(new java.awt.Color(180, 180, 180)); g.fillRect(0, 0, 400, 160); g.dispose();
    SevenSegmentReader.Prepared p = SevenSegmentReader.prepare(gray(blank), 400, 160);
    SevenSegmentReader.Result none = SevenSegmentReader.readBox(p, 20, 120, 20, 600);
    if (none != null && none.cells.size() >= 3 && none.score > 12) { System.err.println("FAILED: blank crop produced " + none.digits()); System.exit(1); }
    System.out.println("Blank crop: no digits invented");
  }

  // ---------------------------------------------------------------------- photo

  /** Local-only: whole photos with a detected line box "path left top right bottom label" (photo pixels). */
  static void photo(File cases) throws Exception {
    int digitsOk = 0, digitsTotal = 0, exact = 0, n = 0, flaggedWrong = 0, silentWrong = 0;
    java.util.Map<String, BufferedImage> cache = new java.util.HashMap<>();
    for (String line : Files.readAllLines(cases.toPath())) {
      if (line.isBlank()) continue;
      String[] f = line.split("\t");
      BufferedImage img = cache.computeIfAbsent(f[0], k -> { try { return ImageIO.read(new File(cases.getParentFile(), k)); } catch (Exception e) { throw new RuntimeException(e); } });
      int bl = Integer.parseInt(f[1]), bt = Integer.parseInt(f[2]), br = Integer.parseInt(f[3]), bb = Integer.parseInt(f[4]);
      int[] crop = SevenSegmentReader.cropFor(bl, bt, br, bb, img.getWidth(), img.getHeight());
      SevenSegmentReader.Result r = null;
      if (crop != null) {
        int cw = crop[2] - crop[0], ch = crop[3] - crop[1];
        int[] gray = new int[cw * ch];
        for (int y = 0; y < ch; y++) for (int x = 0; x < cw; x++) { int p = img.getRGB(crop[0] + x, crop[1] + y); gray[y * cw + x] = (((p >> 16) & 255) * 30 + ((p >> 8) & 255) * 59 + (p & 255) * 11) / 100; }
        r = SevenSegmentReader.readCropped(gray, crop, bl, bt, br, bb);
      }
      String got = r == null ? "" : r.digits(), label = f[5];
      n++; digitsTotal += label.length();
      for (int i = 1; i <= Math.min(got.length(), label.length()); i++) if (got.charAt(got.length() - i) == label.charAt(label.length() - i)) digitsOk++;
      if (got.equals(label)) exact++;
      if (r != null && got.length() == label.length()) {
        for (int i = 0; i < got.length(); i++) if (got.charAt(i) != label.charAt(i)) { if (r.cells.get(i).uncertain()) flaggedWrong++; else silentWrong++; }
      }
      System.out.println(f[0] + " expected " + label + " got " + got + (got.equals(label) ? " OK" : ""));
    }
    System.out.println("photo lines: digits " + digitsOk + "/" + digitsTotal + " exact " + exact + "/" + n
        + "; wrong digits flagged " + flaggedWrong + ", silent " + silentWrong);
  }

  // ----------------------------------------------------------------------- real

  static void real(File cases) throws Exception {
    int digitsOk = 0, digitsTotal = 0, exact = 0, n = 0;
    java.util.Map<String, SevenSegmentReader.Prepared> cache = new java.util.HashMap<>();
    for (String line : Files.readAllLines(cases.toPath())) {
      if (line.isBlank()) continue;
      String[] f = line.split("\t");
      File image = new File(cases.getParentFile(), f[0]);
      SevenSegmentReader.Prepared prepared = cache.get(f[0]);
      if (prepared == null) {
        BufferedImage img = ImageIO.read(image);
        prepared = SevenSegmentReader.prepare(gray(img), img.getWidth(), img.getHeight());
        cache.put(f[0], prepared);
      }
      SevenSegmentReader.Result r = SevenSegmentReader.readBox(prepared, Integer.parseInt(f[1]), Integer.parseInt(f[2]),
          Integer.parseInt(f[3]), Integer.parseInt(f[4]));
      String got = r == null ? "" : r.digits(), label = f[5];
      int ok = 0;
      for (int i = 1; i <= Math.min(got.length(), label.length()); i++) if (got.charAt(got.length() - i) == label.charAt(label.length() - i)) ok++;
      digitsOk += ok; digitsTotal += label.length(); n++;
      if (got.equals(label)) exact++;
      System.out.println(f[0] + " expected " + label + " got " + got + (got.equals(label) ? " OK" : "") + (r != null && r.plausible() ? " plausible" : " IMPLAUSIBLE")
          + " reg=" + (r == null ? "-" : String.format("%.2f", r.regularity)));
      if (r != null && got.length() == label.length()) {
        for (int i = 0; i < got.length(); i++) {
          SevenSegmentReader.Cell c = r.cells.get(i);
          System.out.println("DIGIT " + (got.charAt(i) == label.charAt(i) ? 1 : 0) + " " + String.format("%.2f %.2f", c.margin, c.evidence));
        }
      }
    }
    System.out.println("digits " + digitsOk + "/" + digitsTotal + " exact " + exact + "/" + n);
  }
}
