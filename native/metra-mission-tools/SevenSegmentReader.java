package com.metra.missiontools;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Offline reader for seven-segment LCD digits (heat and water meters).
 *
 * <p>ML Kit is a scene-text recogniser: it confuses lit and unlit ("ghost") LCD
 * segments (0/8, 4/9, 1/7) and drops the decimal point. This reader works from
 * the segments themselves. It is given an approximate bounding box of the digit
 * row (ML Kit line box or the user's framing), refines it, and decides each digit
 * by comparing the seven segment intensities with the ten digit patterns.
 *
 * <p>Pure Java (no Android classes) so it runs on the JVM for regression tests.
 * It never uses previous readings, serial numbers or meter identity.
 */
public final class SevenSegmentReader {
  private SevenSegmentReader() {}

  /** Pattern order: a(top) b(top-right) c(bottom-right) d(bottom) e(bottom-left) f(top-left) g(middle). */
  static final String KEYS = "0123456789 ";
  static final int[][] PAT = {
    {1,1,1,1,1,1,0}, {0,1,1,0,0,0,0}, {1,1,0,1,1,0,1}, {1,1,1,1,0,0,1}, {0,1,1,0,0,1,1},
    {1,0,1,1,0,1,1}, {1,0,1,1,1,1,1}, {1,1,1,0,0,0,0}, {1,1,1,1,1,1,1}, {1,1,1,1,0,1,1}, {0,0,0,0,0,0,0}};
  static final int BLANK = 10;
  /** Likelihood model, tuned on the labelled photo set (docs/QA_OCR_SEVEN_SEGMENT.md). */
  static final double GHOST = 0.2, SD_LIT = 0.55, SD_UNLIT = 0.5;
  static final int WORK_WIDTH = 700;
  /** Trained digit classifier: opt-in (-Dseg.model=true) until it is calibrated; see docs/QA_OCR_SEVEN_SEGMENT.md. */
  static final boolean USE_MODEL = Boolean.getBoolean("seg.model");
  static final double[] SHEARS = {-0.05, 0.0, 0.05, 0.1, 0.15, 0.2, 0.3};
  static final double[] COARSE_STEPS = {-1, 0, 1};
  static final double[] FINE_STEPS = {-1, -0.66, -0.33, 0, 0.33, 0.66, 1};
  static final double SPAN = 0.3;
  /** A digit whose best/second-best likelihood gap is below this must be confirmed by the user. */
  public static final double UNCERTAIN_MARGIN = 1.0;

  public static final class Cell {
    public final char key;
    public final double margin, evidence;
    public final int left, right;
    /** Digits ordered by likelihood (best first), for review/correction. */
    public final String alternatives;
    Cell(char key, double margin, double evidence, int left, int right, String alternatives) {
      this.key = key; this.margin = margin; this.evidence = evidence;
      this.left = left; this.right = right; this.alternatives = alternatives;
    }
    public boolean uncertain() { return margin < UNCERTAIN_MARGIN; }
  }

  public static final class Result {
    public final List<Cell> cells;
    public final double score;
    /** Index of the cell after which a decimal point is most likely, or -1. */
    public final int dotAfter;
    /** Strength of that point relative to a lit segment (0..1+). */
    public final double dotStrength;
    public final int top, bottom;
    public final double shear;
    /** 0..1: how regular the digit widths and spacing are (a real display row is very regular). */
    public final double regularity;
    Result(List<Cell> cells, double score, int dotAfter, double dotStrength, int top, int bottom, double shear, double regularity) {
      this.cells = cells; this.score = score; this.dotAfter = dotAfter; this.dotStrength = dotStrength;
      this.top = top; this.bottom = bottom; this.shear = shear; this.regularity = regularity;
    }
    /** Plausible structure: 3-10 digits laid out regularly. Otherwise nothing should be proposed. */
    public boolean plausible() { return cells.size() >= 3 && cells.size() <= 10 && regularity >= 0.55; }
    public String digits() {
      StringBuilder out = new StringBuilder();
      for (Cell cell : cells) out.append(cell.key);
      return out.toString();
    }
  }

  /** A crop reduced to a normalised "darkness" map at a fixed working width. */
  public static final class Prepared {
    final float[] dark; final int width, height;
    /** Working pixels per source pixel. */
    public final double scale;
    Prepared(float[] dark, int width, int height, double scale) {
      this.dark = dark; this.width = width; this.height = height; this.scale = scale;
    }
    public int width() { return width; }
    public int height() { return height; }
  }


  // ------------------------------------------------- line boxes from a text detector

  /**
   * Crop to cut around a detected digit line {left, top, right, bottom} (photo pixels),
   * with room for ghost digits, the decimal point and the unit; null if unusable.
   */
  public static int[] cropFor(int boxLeft, int boxTop, int boxRight, int boxBottom, int imageWidth, int imageHeight) {
    int height = boxBottom - boxTop;
    int left = Math.max(0, boxLeft - (int) (0.8 * height)), top = Math.max(0, boxTop - (int) (0.6 * height));
    int right = Math.min(imageWidth, boxRight + (int) (1.0 * height)), bottom = Math.min(imageHeight, boxBottom + (int) (0.6 * height));
    if (height < 14 || right - left < 40 || bottom - top < 30) return null;
    return new int[]{left, top, right, bottom};
  }

  /** Reads the line given the crop from {@link #cropFor}; the box is in photo pixels, the crop origin is subtracted here. */
  public static Result readCropped(int[] cropGray, int[] crop, int boxLeft, int boxTop, int boxRight, int boxBottom) {
    int cw = crop[2] - crop[0], ch = crop[3] - crop[1], height = boxBottom - boxTop;
    Prepared prepared = prepare(cropGray, cw, ch);
    double scale = prepared.scale;
    int top = (int) ((boxTop - crop[1]) * scale), bottom = (int) ((boxBottom - crop[1]) * scale);
    int left = (int) ((boxLeft - crop[0] - 0.15 * height) * scale), right = (int) ((boxRight - crop[0] + 0.35 * height) * scale);
    return readBox(prepared, top, bottom, left, Math.max(left + 1, right));
  }

  // ------------------------------------------------------------------ preparation

  public static Prepared prepare(int[] gray, int srcW, int srcH) {
    if (srcW < 8 || srcH < 8 || gray.length < srcW * srcH) throw new IllegalArgumentException("Crop too small");
    double scale = WORK_WIDTH / (double) srcW;
    int w = WORK_WIDTH, h = Math.max(8, (int) Math.round(srcH * scale));
    float[] g = resize(gray, srcW, srcH, w, h);
    float[] bg = g.clone();
    boxBlur3(bg, w, h, Math.max(w, h) / 10.0);
    float[] n = new float[w * h];
    for (int i = 0; i < n.length; i++) n[i] = g[i] / (bg[i] + 1f);
    int k = Math.max(15, (int) (Math.min(h, w) * 0.16)) | 1;
    float[] closed = morph(morph(n, w, h, k, true), w, h, k, false);   // dilate then erode
    float[] bh = new float[n.length];
    for (int i = 0; i < n.length; i++) bh[i] = Math.max(0f, closed[i] - n[i]);
    blurSmall(bh, w, h);
    float p99 = percentile(bh, 0.99f);
    float norm = Math.max(1e-6f, p99);
    for (int i = 0; i < bh.length; i++) bh[i] = Math.min(1.3f, bh[i] / norm);
    return new Prepared(bh, w, h, scale);
  }

  private static float[] resize(int[] src, int sw, int sh, int dw, int dh) {
    float[] out = new float[dw * dh];
    double fx = sw / (double) dw, fy = sh / (double) dh;
    for (int y = 0; y < dh; y++) {
      for (int x = 0; x < dw; x++) {
        if (fx > 1 || fy > 1) {          // area average when shrinking
          int x0 = (int) Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.min(sw, (int) Math.ceil((x + 1) * fx)));
          int y0 = (int) Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.min(sh, (int) Math.ceil((y + 1) * fy)));
          double sum = 0; int count = 0;
          for (int yy = y0; yy < y1; yy++) for (int xx = x0; xx < x1; xx++) { sum += src[yy * sw + xx]; count++; }
          out[y * dw + x] = (float) (sum / count);
        } else {                          // bicubic (a = -0.75, as OpenCV) when enlarging
          double sx = (x + 0.5) * fx - 0.5, sy = (y + 0.5) * fy - 0.5;
          int x0 = (int) Math.floor(sx), y0 = (int) Math.floor(sy);
          double[] wx = cubic(sx - x0), wy = cubic(sy - y0);
          double sum = 0;
          for (int j = 0; j < 4; j++) {
            int yy = Math.min(sh - 1, Math.max(0, y0 - 1 + j));
            double row = 0;
            for (int i = 0; i < 4; i++) row += wx[i] * src[yy * sw + Math.min(sw - 1, Math.max(0, x0 - 1 + i))];
            sum += wy[j] * row;
          }
          out[y * dw + x] = (float) Math.max(0, Math.min(255, sum));
        }
      }
    }
    return out;
  }

  private static double[] cubic(double t) {
    final double a = -0.75;
    double[] w = new double[4];
    w[0] = ((a * (t + 1) - 5 * a) * (t + 1) + 8 * a) * (t + 1) - 4 * a;
    w[1] = ((a + 2) * t - (a + 3)) * t * t + 1;
    w[2] = ((a + 2) * (1 - t) - (a + 3)) * (1 - t) * (1 - t) + 1;
    w[3] = 1 - w[0] - w[1] - w[2];
    return w;
  }

  /** Gaussian-like blur from three box passes (edge replicated). */
  private static void boxBlur3(float[] a, int w, int h, double sigma) {
    int size = Math.max(1, (int) Math.round(Math.sqrt(12 * sigma * sigma / 3 + 1)));
    int radius = Math.max(1, size / 2);
    float[] tmp = new float[Math.max(w, h)];
    for (int pass = 0; pass < 3; pass++) {
      for (int y = 0; y < h; y++) boxLine(a, y * w, 1, w, radius, tmp);
      for (int x = 0; x < w; x++) boxLine(a, x, w, h, radius, tmp);
    }
  }

  private static void boxLine(float[] a, int start, int stride, int n, int radius, float[] tmp) {
    double sum = 0;
    for (int i = -radius; i <= radius; i++) sum += a[start + Math.min(n - 1, Math.max(0, i)) * stride];
    for (int i = 0; i < n; i++) {
      tmp[i] = (float) (sum / (2 * radius + 1));
      sum += a[start + Math.min(n - 1, i + radius + 1) * stride] - a[start + Math.max(0, i - radius) * stride];
    }
    for (int i = 0; i < n; i++) a[start + i * stride] = tmp[i];
  }

  private static void blurSmall(float[] a, int w, int h) {
    final float[] kernel = {0.054f, 0.244f, 0.403f, 0.244f, 0.054f};
    float[] tmp = new float[Math.max(w, h)];
    for (int y = 0; y < h; y++) convolveLine(a, y * w, 1, w, kernel, tmp);
    for (int x = 0; x < w; x++) convolveLine(a, x, w, h, kernel, tmp);
  }

  private static void convolveLine(float[] a, int start, int stride, int n, float[] kernel, float[] tmp) {
    int r = kernel.length / 2;
    for (int i = 0; i < n; i++) {
      float sum = 0;
      for (int j = -r; j <= r; j++) sum += kernel[j + r] * a[start + Math.min(n - 1, Math.max(0, i + j)) * stride];
      tmp[i] = sum;
    }
    for (int i = 0; i < n; i++) a[start + i * stride] = tmp[i];
  }

  /** Separable square-window min/max (van Herk / Gil-Werman); out-of-image pixels are ignored. */
  private static float[] morph(float[] src, int w, int h, int k, boolean max) {
    int r = k / 2;
    float[] out = new float[src.length];
    float[] line = new float[Math.max(w, h)], res = new float[Math.max(w, h)];
    float[] rows = new float[src.length];
    for (int y = 0; y < h; y++) {
      System.arraycopy(src, y * w, line, 0, w);
      slide(line, w, r, max, res);
      System.arraycopy(res, 0, rows, y * w, w);
    }
    for (int x = 0; x < w; x++) {
      for (int y = 0; y < h; y++) line[y] = rows[y * w + x];
      slide(line, h, r, max, res);
      for (int y = 0; y < h; y++) out[y * w + x] = res[y];
    }
    return out;
  }

  private static void slide(float[] in, int n, int r, boolean max, float[] out) {
    int k = 2 * r + 1, padded = n + 2 * r;
    float neutral = max ? -Float.MAX_VALUE : Float.MAX_VALUE;
    float[] p = new float[padded + k], pre = new float[padded + k], suf = new float[padded + k];
    Arrays.fill(p, neutral);
    System.arraycopy(in, 0, p, r, n);
    for (int i = 0; i < padded + k; i++) {
      pre[i] = (i % k == 0) ? p[i] : (max ? Math.max(pre[i - 1], p[i]) : Math.min(pre[i - 1], p[i]));
    }
    for (int i = padded + k - 1; i >= 0; i--) {
      suf[i] = (i == padded + k - 1 || (i + 1) % k == 0) ? p[i] : (max ? Math.max(suf[i + 1], p[i]) : Math.min(suf[i + 1], p[i]));
    }
    for (int i = 0; i < n; i++) {
      int a = i, b = i + k - 1;
      out[i] = max ? Math.max(suf[a], pre[b]) : Math.min(suf[a], pre[b]);
    }
  }

  private static float percentile(float[] values, float q) {
    float max = 0;
    for (float v : values) if (v > max) max = v;
    if (max <= 0) return 0;
    int bins = 2048;
    int[] histogram = new int[bins + 1];
    for (float v : values) histogram[Math.min(bins, (int) (v / max * bins))]++;
    long target = (long) Math.ceil(q * values.length), seen = 0;
    for (int i = 0; i <= bins; i++) { seen += histogram[i]; if (seen >= target) return (i + 1) / (float) bins * max; }
    return max;
  }

  // ------------------------------------------------------------------- decoding

  /**
   * Reads one digit row. Coordinates are in {@link Prepared} working pixels:
   * the approximate row band (top..bottom) and the horizontal limits of the digits.
   */
  public static Result readBox(Prepared prepared, int top, int bottom, int left, int right) {
    int w = prepared.width, h = prepared.height;
    if (bottom - top < 8 || right <= left) return null;
    double baseHeight = bottom - top;
    // Stage 1: find the slant (and a rough band) with a coarse grid for every shear.
    double[] shearScore = new double[SHEARS.length];
    float[][] maps = new float[SHEARS.length][];
    double[][] integrals = new double[SHEARS.length][];
    Result best = null;
    for (int i = 0; i < SHEARS.length; i++) {
      maps[i] = SHEARS[i] == 0 ? prepared.dark : shearMap(prepared.dark, w, h, SHEARS[i]);
      integrals[i] = integral(maps[i], w, h);
      Result r = scan(maps[i], integrals[i], w, h, top, bottom, left, right, baseHeight, COARSE_STEPS, SHEARS[i]);
      shearScore[i] = r == null ? -1 : r.score;
      if (r != null && (best == null || r.score > best.score)) best = r;
    }
    // Stage 2: fine band search on the two best slants.
    Integer[] order = new Integer[SHEARS.length];
    for (int i = 0; i < order.length; i++) order[i] = i;
    Arrays.sort(order, (p, q) -> Double.compare(shearScore[q], shearScore[p]));
    for (int k = 0; k < Math.min(2, order.length); k++) {
      int i = order[k];
      if (shearScore[i] < 0) continue;
      Result r = scan(maps[i], integrals[i], w, h, top, bottom, left, right, baseHeight, FINE_STEPS, SHEARS[i]);
      if (r != null && (best == null || r.score > best.score)) best = r;
    }
    return best;
  }

  private static Result scan(float[] dark, double[] integral, int w, int h, int top, int bottom, int left, int right,
      double baseHeight, double[] steps, double shear) {
    Result best = null;
    for (double a : steps) for (double b : steps) {
      int t = (int) (top + a * SPAN * baseHeight), bt = (int) (bottom + b * SPAN * baseHeight);
      if (bt - t < 0.5 * baseHeight || t < 0 || bt > h) continue;
      Result r = decodeBand(dark, integral, w, h, t, bt, left, right, shear);
      if (r != null && (best == null || r.score > best.score)) best = r;
    }
    return best;
  }

  private static float[] shearMap(float[] src, int w, int h, double s) {
    float[] out = new float[src.length];
    for (int y = 0; y < h; y++) {
      double shift = s * (y - h / 2.0);
      for (int x = 0; x < w; x++) {
        double sx = x - shift;
        int x0 = (int) Math.floor(sx);
        if (x0 < 0 || x0 >= w - 1) { if (x0 == w - 1 && sx == x0) out[y * w + x] = src[y * w + x0]; continue; }
        double f = sx - x0;
        out[y * w + x] = (float) (src[y * w + x0] * (1 - f) + src[y * w + x0 + 1] * f);
      }
    }
    return out;
  }

  private static double[] integral(float[] a, int w, int h) {
    double[] out = new double[(w + 1) * (h + 1)];
    for (int y = 0; y < h; y++) {
      double row = 0;
      for (int x = 0; x < w; x++) { row += a[y * w + x]; out[(y + 1) * (w + 1) + x + 1] = out[y * (w + 1) + x + 1] + row; }
    }
    return out;
  }

  private static double mean(double[] integral, int w, int h, int xa, int xb, int ya, int yb) {
    xa = Math.max(0, xa); ya = Math.max(0, ya);
    xb = Math.min(w, Math.max(xb, xa + 1)); yb = Math.min(h, Math.max(yb, ya + 1));
    if (xb <= xa || yb <= ya) return 0;
    double sum = integral[yb * (w + 1) + xb] - integral[ya * (w + 1) + xb] - integral[yb * (w + 1) + xa] + integral[ya * (w + 1) + xa];
    return sum / ((double) (xb - xa) * (yb - ya));
  }

  private static double[] segmentValues(double[] integral, int w, int h, double xl, double xr, int top, int bot) {
    double height = bot - top, width = xr - xl;
    int t = Math.max(2, (int) (.16 * height)), tw = Math.max(2, (int) (.20 * width)), m = (int) (.12 * width);
    double[][] boxes = {
      {xl + m, xr - m, 0, t}, {xr - tw, xr, .05 * height, .47 * height}, {xr - tw, xr, .53 * height, .95 * height},
      {xl + m, xr - m, height - t, height}, {xl, xl + tw, .53 * height, .95 * height}, {xl, xl + tw, .05 * height, .47 * height},
      {xl + m, xr - m, .5 * height - t / 2.0, .5 * height + t / 2.0}};
    double[] out = new double[7];
    for (int i = 0; i < 7; i++) {
      double[] b = boxes[i];
      out[i] = mean(integral, w, h, (int) b[0], (int) b[1], (int) (top + b[2]), (int) (top + b[3]));
    }
    return out;
  }


  /** 24x40 area-averaged darkness patch of the cell (+-10 % sides, +-8 % rows), classified by the trained model. */
  private static double[] modelLogProbabilities(double[] integral, int w, int h, double xa, double xb, int top, int bot) {
    double cell = xb - xa, height = bot - top;
    double x0 = xa - 0.1 * cell, x1 = xb + 0.1 * cell, y0 = top - 0.08 * height, y1 = bot + 0.08 * height;
    int pw = SevenSegmentModel.PATCH_WIDTH, ph = SevenSegmentModel.PATCH_HEIGHT;
    int[][] xs = patchEdges(x0, x1, pw, w), ys = patchEdges(y0, y1, ph, h);
    float[] patch = new float[pw * ph];
    for (int j = 0; j < ph; j++) for (int i = 0; i < pw; i++) {
      int xl = xs[0][i], xh = xs[1][i], yl = ys[0][j], yh = ys[1][j];
      double sum = integral[yh * (w + 1) + xh] - integral[yl * (w + 1) + xh] - integral[yh * (w + 1) + xl] + integral[yl * (w + 1) + xl];
      patch[j * pw + i] = (float) (sum / ((double) (xh - xl) * (yh - yl)));
    }
    return SevenSegmentModel.logProbabilities(patch);
  }

  private static int[][] patchEdges(double a, double b, int n, int limit) {
    int[][] out = new int[2][n];
    for (int i = 0; i < n; i++) {
      int lo = (int) (a + i * (b - a) / n), hi = (int) (a + (i + 1) * (b - a) / n);
      lo = Math.max(0, Math.min(limit, lo)); hi = Math.max(0, Math.min(limit, hi));
      if (hi <= lo) { if (lo >= limit) lo = limit - 1; hi = lo + 1; }
      out[0][i] = lo; out[1][i] = hi;
    }
    return out;
  }

  private static double[] likelihoods(double[] values, double lit) {
    double ghost = GHOST * lit, sdLit = SD_LIT * lit, sdUnlit = SD_UNLIT * lit;
    double[] ll = new double[PAT.length];
    for (int d = 0; d < PAT.length; d++) {
      double sum = 0;
      for (int s = 0; s < 7; s++) {
        double mu = PAT[d][s] == 1 ? lit : ghost, sd = PAT[d][s] == 1 ? sdLit : sdUnlit;
        double z = (values[s] - mu) / sd;
        sum += -z * z / 2;
      }
      ll[d] = sum;
    }
    return ll;
  }

  private static Result decodeBand(float[] dark, double[] integral, int w, int h, int top, int bot,
      int left, int right, double shear) {
    top = Math.max(0, top); bot = Math.min(h, bot);
    int height = bot - top;
    if (height < 12) return null;
    // Column ink of the lit mask inside the band.
    boolean[] isDot = new boolean[w * h];
    List<double[]> dots = findDots(dark, w, top, bot, height, isDot);
    int[] col = new int[w];
    for (int y = top; y < bot; y++) for (int x = 0; x < w; x++) if (dark[y * w + x] > 0.4f && !isDot[y * w + x]) col[x]++;
    List<int[]> merged = new ArrayList<>();
    double threshold = 0.06 * height;
    int start = -1;
    for (int x = 0; x <= w; x++) {
      boolean on = x < w && col[x] > threshold;
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        if (!merged.isEmpty() && start - merged.get(merged.size() - 1)[1] < 0.07 * height) merged.get(merged.size() - 1)[1] = x;
        else merged.add(new int[]{start, x});
        start = -1;
      }
    }
    double lit = 0.8 * bandPercentile(dark, w, top, bot, 0.96f);
    if (lit <= 1e-4) return null;
    List<Cell> cells = new ArrayList<>();
    // Digit width differs a lot between displays (0.5 H on a MULTICAL 601, 0.75 H on a MULTICAL 21):
    // take it from the clusters that look like single digits instead of assuming it.
    List<Double> plausibleWidths = new ArrayList<>();
    for (int[] run : merged) {
      double span = run[1] - run[0], center = (run[0] + run[1]) / 2.0;
      if (center >= left && center <= right && span >= 0.38 * height && span <= 0.95 * height) plausibleWidths.add(span);
    }
    java.util.Collections.sort(plausibleWidths);
    double digitWidth = plausibleWidths.isEmpty() ? 0.55 * height : plausibleWidths.get(plausibleWidths.size() / 2);
    for (int[] run0 : merged) {
      int[] run = run0;
      double center = (run[0] + run[1]) / 2.0;
      if (center < left || center > right) continue;
      double span = run[1] - run[0];
      if (span < 0.08 * height) continue;
      List<double[]> parts = new ArrayList<>();
      if (span > 1.45 * digitWidth) {
        int n = Math.max(2, (int) Math.round(span / (1.12 * digitWidth)));
        double step = span / n;
        for (int i = 0; i < n; i++) parts.add(new double[]{run[0] + i * step, run[0] + (i + 1) * step});
      } else parts.add(new double[]{run[0], run[1]});
      for (double[] part : parts) {
        double xa = part[0], xb = part[1], wd = xb - xa;
        // Unit letters (MWh, m3) and reflections are much shorter than a digit.
        int firstInk = -1, lastInk = -1;
        for (int y = top; y < bot; y++) {
          boolean ink = false;
          for (int x = (int) xa; x < (int) xb && x < w && !ink; x++) ink = x >= 0 && dark[y * w + x] > 0.4f && !isDot[y * w + x];
          if (ink) { if (firstInk < 0) firstInk = y; lastInk = y; }
        }
        if (firstInk < 0 || lastInk - firstInk < 0.55 * height) continue;
        // A thin "1" that keeps going above or below the row is the LCD frame or a ghost bracket.
        if (wd < 0.3 * height) {
          int above = 0, below = 0;
          for (int y = Math.max(0, (int) (top - 0.3 * height)); y < top - 0.02 * height; y++) {
            for (int x = (int) xa; x < (int) xb && x < w; x++) if (x >= 0 && dark[y * w + x] > 0.4f) { above++; break; }
          }
          for (int y = (int) (bot + 0.02 * height); y < Math.min(h, (int) (bot + 0.3 * height)); y++) {
            for (int x = (int) xa; x < (int) xb && x < w; x++) if (x >= 0 && dark[y * w + x] > 0.4f) { below++; break; }
          }
          if (above >= 0.12 * height || below >= 0.12 * height) continue;
        }
        if (wd < 0.78 * digitWidth || wd > 1.3 * digitWidth) xa = xb - digitWidth;
        double[] ll = USE_MODEL ? modelLogProbabilities(integral, w, h, xa, xb, top, bot)
            : likelihoods(segmentValues(integral, w, h, xa, xb, top, bot), lit);
        Integer[] order = new Integer[ll.length];
        for (int i = 0; i < order.length; i++) order[i] = i;
        final double[] scores = ll;
        Arrays.sort(order, (p, q) -> Double.compare(scores[q], scores[p]));
        if (order[0] == BLANK) continue;
        StringBuilder alternatives = new StringBuilder();
        for (int i = 0; i < 3; i++) if (order[i] != BLANK) alternatives.append(KEYS.charAt(order[i]));
        cells.add(new Cell(KEYS.charAt(order[0]), ll[order[0]] - ll[order[1]], ll[order[0]] - ll[BLANK],
            (int) xa, (int) xb, alternatives.toString()));
        // A thin fragment fully inside the previous cell is a frame or reflection, not a digit.
        int count = cells.size();
        if (count > 1) {
          Cell previous = cells.get(count - 2), current = cells.get(count - 1);
          if (current.left < previous.right - 0.5 * (current.right - current.left) && wd < 0.3 * height) cells.remove(count - 1);
        }
      }
    }
    if (cells.isEmpty()) return null;
    // Consistency of cell widths and spacing: a real digit row is regular.
    List<Double> widths = new ArrayList<>(), gaps = new ArrayList<>();
    for (Cell c : cells) if (c.right - c.left > 0.3 * height) widths.add((double) (c.right - c.left));
    for (int i = 1; i < cells.size(); i++) gaps.add((double) (cells.get(i).right - cells.get(i - 1).right));
    double cvW = widths.size() > 1 ? coefficientOfVariation(widths) : 0.5;
    double cvS = gaps.size() > 1 ? coefficientOfVariation(gaps) : 0.5;
    double consistency = 1 / (1 + 2 * cvW + 1.5 * cvS);
    double evidence = 0, margins = 0;
    for (Cell c : cells) { evidence += Math.min(c.evidence, 8); margins += Math.min(c.margin, 3); }
    evidence /= cells.size(); margins /= cells.size();
    double score = (evidence + 0.8 * margins) * consistency * cells.size();
    // Decimal point: the strongest baseline blob that sits between two digits (or after the last one).
    int dotAfter = -1; double strength = 0;
    double bestArea = 0;
    for (double[] dot : dots) {
      for (int i = 0; i < cells.size() - 1; i++) {
        Cell c = cells.get(i), next = cells.get(i + 1);
        if (dot[0] >= c.right - 0.12 * height && dot[0] <= next.left + 0.12 * height && dot[1] > bestArea) {
          bestArea = dot[1]; dotAfter = i; strength = 1;
        }
      }
    }
    if (dotAfter < 0) {
      double dotBest = 0;
      for (int i = 0; i < cells.size() - 1; i++) {
        Cell c = cells.get(i), next = cells.get(i + 1);
        int xa = c.right, xb = (int) Math.max(xa + 3, Math.min(c.right + 0.25 * height, next.left + 0.1 * height));
        double value = mean(integral, w, h, xa, xb, (int) (bot - 0.14 * height), (int) Math.min(h, bot + 0.04 * height));
        if (value > dotBest) { dotBest = value; dotAfter = i; }
      }
      strength = dotBest / lit * 0.5;   // weaker evidence than an isolated dot
    }
    return new Result(cells, score, dotAfter, strength, top, bot, shear, consistency);
  }

  /** Small blobs near the baseline are decimal points; they must not widen or merge digit clusters. */
  private static List<double[]> findDots(float[] dark, int w, int top, int bot, int height, boolean[] isDot) {
    int bandH = bot - top;
    int[] label = new int[w * bandH];
    List<double[]> dots = new ArrayList<>();
    int[] stack = new int[w * bandH];
    int next = 0;
    for (int sy = 0; sy < bandH; sy++) for (int sx = 0; sx < w; sx++) {
      if (label[sy * w + sx] != 0 || dark[(top + sy) * w + sx] <= 0.4f) continue;
      next++;
      int sp = 0, area = 0, minX = sx, maxX = sx, minY = sy, maxY = sy;
      long sumX = 0;
      stack[sp++] = sy * w + sx; label[sy * w + sx] = next;
      List<Integer> members = new ArrayList<>();
      while (sp > 0) {
        int idx = stack[--sp], x = idx % w, y = idx / w;
        area++; sumX += x; members.add(idx);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        int[][] nb = {{x - 1, y}, {x + 1, y}, {x, y - 1}, {x, y + 1}};
        for (int[] n : nb) {
          if (n[0] < 0 || n[1] < 0 || n[0] >= w || n[1] >= bandH) continue;
          int ni = n[1] * w + n[0];
          if (label[ni] == 0 && dark[(top + n[1]) * w + n[0]] > 0.4f) { label[ni] = next; stack[sp++] = ni; }
        }
      }
      int bw = maxX - minX + 1, bh = maxY - minY + 1;
      boolean small = bw <= 0.24 * height && bh <= 0.26 * height && area >= 0.004 * height * height;
      boolean atBaseline = minY >= 0.6 * bandH;
      if (small && atBaseline) {
        for (int idx : members) isDot[(top + idx / w) * w + idx % w] = true;
        dots.add(new double[]{sumX / (double) area, area});
      }
    }
    return dots;
  }


  private static double coefficientOfVariation(List<Double> values) {
    double mean = 0;
    for (double v : values) mean += v;
    mean /= values.size();
    double variance = 0;
    for (double v : values) variance += (v - mean) * (v - mean);
    return mean <= 0 ? 1 : Math.sqrt(variance / values.size()) / mean;
  }

  private static double bandPercentile(float[] dark, int w, int top, int bot, float q) {
    int bins = 512; int[] histogram = new int[bins + 1]; long total = 0;
    for (int y = top; y < bot; y++) for (int x = 0; x < w; x++) {
      histogram[Math.min(bins, (int) (Math.min(1.3f, dark[y * w + x]) / 1.3f * bins))]++; total++;
    }
    long target = (long) Math.ceil(q * total), seen = 0;
    for (int i = 0; i <= bins; i++) { seen += histogram[i]; if (seen >= target) return (i + 0.5) / bins * 1.3; }
    return 1.3;
  }
}
