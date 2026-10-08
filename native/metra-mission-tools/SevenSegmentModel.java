package com.metra.missiontools;

/**
 * Small digit classifier for seven-segment cells (24x40 darkness patch -> 0-9 or "not a digit").
 * Trained offline on rendered LCD digits (ghost segments, blur, slant, noise, neighbours, frames);
 * weights are int8-quantised in {@link SevenSegmentWeights}. Pure Java, no dependency, no network.
 */
final class SevenSegmentModel {
  private SevenSegmentModel() {}

  static final int PATCH_WIDTH = 24, PATCH_HEIGHT = 40;
  private static float[][] layers;

  private static synchronized float[][] layers() {
    if (layers != null) return layers;
    byte[] raw = decodeBase64(SevenSegmentWeights.data());
    float[][] out = new float[6][];
    int offset = 0;
    for (int i = 0; i < 6; i++) {
      out[i] = new float[SevenSegmentWeights.SIZES[i]];
      for (int j = 0; j < out[i].length; j++) out[i][j] = raw[offset + j] * SevenSegmentWeights.SCALES[i];
      offset += out[i].length;
    }
    layers = out;
    return out;
  }

  /** Normalises a patch the way the training data was, then returns log-probabilities for the 11 classes. */
  static double[] logProbabilities(float[] patch) {
    float[][] w = layers();
    float[] sorted = patch.clone();
    java.util.Arrays.sort(sorted);
    float scale = Math.max(sorted[(int) Math.ceil(0.98 * (sorted.length - 1))], 0.25f);
    float[] x = new float[patch.length];
    for (int i = 0; i < x.length; i++) x[i] = Math.max(0f, Math.min(1.5f, patch[i] / scale));
    float[] h1 = dense(x, w[0], w[1], SevenSegmentWeights.INPUTS, SevenSegmentWeights.HIDDEN1, true);
    float[] h2 = dense(h1, w[2], w[3], SevenSegmentWeights.HIDDEN1, SevenSegmentWeights.HIDDEN2, true);
    float[] o = dense(h2, w[4], w[5], SevenSegmentWeights.HIDDEN2, SevenSegmentWeights.OUTPUTS, false);
    double max = o[0];
    for (float v : o) max = Math.max(max, v);
    double sum = 0;
    for (float v : o) sum += Math.exp(v - max);
    double[] log = new double[o.length];
    for (int i = 0; i < o.length; i++) log[i] = o[i] - max - Math.log(sum);
    return log;
  }

  private static float[] dense(float[] x, float[] weights, float[] bias, int in, int out, boolean relu) {
    float[] y = new float[out];
    for (int j = 0; j < out; j++) y[j] = bias[j];
    for (int i = 0; i < in; i++) {
      float v = x[i];
      if (v == 0f) continue;
      int base = i * out;
      for (int j = 0; j < out; j++) y[j] += v * weights[base + j];
    }
    if (relu) for (int j = 0; j < out; j++) if (y[j] < 0f) y[j] = 0f;
    return y;
  }

  /** Minimal Base64 (java.util.Base64 needs Android API 26; this app targets older tablets too). */
  private static byte[] decodeBase64(String text) {
    int[] table = new int[128];
    java.util.Arrays.fill(table, -1);
    String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (int i = 0; i < alphabet.length(); i++) table[alphabet.charAt(i)] = i;
    int padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
    byte[] out = new byte[text.length() / 4 * 3 - padding];
    int o = 0, buffer = 0, bits = 0;
    for (int i = 0; i < text.length() && o < out.length; i++) {
      char c = text.charAt(i);
      if (c == '=' || c >= 128 || table[c] < 0) continue;
      buffer = (buffer << 6) | table[c];
      bits += 6;
      if (bits >= 8) { bits -= 8; out[o++] = (byte) ((buffer >> bits) & 255); }
    }
    return out;
  }
}
