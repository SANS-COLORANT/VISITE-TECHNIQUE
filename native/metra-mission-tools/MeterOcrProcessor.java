package com.metra.missiontools;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.graphics.Rect;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/** Bounded offline passes on ONE photograph. No previous readings or meter IDs. */
public final class MeterOcrProcessor {
  public static final class Pass {
    public final Text result;
    public final Rect crop;
    public final double scale;
    public Pass(Text result, Rect crop, double scale) {
      this.result = result; this.crop = crop; this.scale = scale;
    }
  }

  private static boolean technical(String text) {
    return text.toLowerCase(java.util.Locale.ROOT).matches(".*\\b(s/?n|serial|type|cfg|cfa|prog|classe|multical|pt100|h71|position|poids|coefficient)\\b.*");
  }

  public static List<Pass> read(Bitmap image) throws Exception {
    TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
    List<Pass> passes = new ArrayList<>();
    long deadline = System.currentTimeMillis() + 25000;
    try {
      Rect full = new Rect(0, 0, image.getWidth(), image.getHeight());
      Text first = Tasks.await(recognizer.process(InputImage.fromBitmap(image, 0)), 8, TimeUnit.SECONDS);
      passes.add(new Pass(first, full, 1));
      List<Rect> crops = new ArrayList<>();
      // Large numeric lines and unit anchors help locate the LCD even when its
      // seven-segment digits were damaged during the full-photo pass.
      List<Text.Line> anchors = new ArrayList<>();
      for (Text.TextBlock block : first.getTextBlocks()) {
        for (Text.Line line : block.getLines()) {
          String s = line.getText();
          if (!technical(s) && (s.matches(".*[0-9].*[0-9].*[0-9].*")
              || s.matches("(?i).*([km]?wh|m[³3]).*")) && line.getBoundingBox() != null) anchors.add(line);
        }
      }
      anchors.sort((a, b) -> Integer.compare(b.getBoundingBox().height(), a.getBoundingBox().height()));
      for (Text.Line line : anchors) {
        if (crops.size() >= 6) break;
        Rect box = line.getBoundingBox();
        int h = Math.max(box.height(), 12);
        Rect crop = new Rect(box.left - 3*h, box.top - 2*h, box.right + 4*h, box.bottom + 2*h);
        crop.intersect(full);
        if (crop.width() < 20 || crop.height() < 20) continue;
        boolean duplicate = false;
        for (Rect old : crops) {
          Rect intersection = new Rect(old);
          if (intersection.intersect(crop) && (double)intersection.width()*intersection.height()
              > .75 * Math.min((double)old.width()*old.height(), (double)crop.width()*crop.height())) duplicate = true;
        }
        if (!duplicate) crops.add(crop);
      }
      // Fallback windows do not assume a brand or a specific fixture's layout.
      crops.add(new Rect(image.getWidth()/10, image.getHeight()/4, image.getWidth()*9/10, image.getHeight()*3/4));
      for (Rect crop : crops) {
        if (System.currentTimeMillis() > deadline) break;
        Bitmap cut = Bitmap.createBitmap(image, crop.left, crop.top, crop.width(), crop.height());
        double scale = Math.min(4, Math.min(1600.0/cut.getWidth(), 1000.0/cut.getHeight()));
        Bitmap enlarged = Bitmap.createScaledBitmap(cut, Math.max(1, (int)(cut.getWidth()*scale)), Math.max(1, (int)(cut.getHeight()*scale)), true);
        try {
          Text plain = Tasks.await(recognizer.process(InputImage.fromBitmap(enlarged, 0)), 5, TimeUnit.SECONDS);
          passes.add(new Pass(plain, crop, scale));
          for (int offset : new int[]{5, 12}) {
            if (System.currentTimeMillis() > deadline) break;
            Bitmap binary = threshold(enlarged, offset);
            try { passes.add(new Pass(Tasks.await(recognizer.process(InputImage.fromBitmap(binary, 0)), 5, TimeUnit.SECONDS), crop, scale)); }
            finally { binary.recycle(); }
          }
          if (System.currentTimeMillis() > deadline) break;
          Bitmap contrast = Bitmap.createBitmap(enlarged.getWidth(), enlarged.getHeight(), Bitmap.Config.ARGB_8888);
          try {
            Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG);
            ColorMatrix gray = new ColorMatrix(); gray.setSaturation(0);
            ColorMatrix stretch = new ColorMatrix(new float[]{1.8f,0,0,0,-65, 0,1.8f,0,0,-65, 0,0,1.8f,0,-65, 0,0,0,1,0});
            gray.postConcat(stretch); paint.setColorFilter(new ColorMatrixColorFilter(gray));
            new Canvas(contrast).drawBitmap(enlarged, 0, 0, paint);
            Text boosted = Tasks.await(recognizer.process(InputImage.fromBitmap(contrast, 0)), 5, TimeUnit.SECONDS);
            passes.add(new Pass(boosted, crop, scale));
          } finally { contrast.recycle(); }
        } finally {
          if (enlarged != cut) enlarged.recycle();
          if (cut != image) cut.recycle();
        }
      }
      return passes;
    } finally { recognizer.close(); }
  }

  private static Bitmap threshold(Bitmap source, int offset) {
    int w=source.getWidth(), h=source.getHeight();
    int[] pixels=new int[w*h]; source.getPixels(pixels,0,w,0,0,w,h);
    int[] gray=new int[w*h]; long[] sum=new long[(w+1)*(h+1)];
    for(int y=0;y<h;y++) {long row=0; for(int x=0;x<w;x++) {
      int p=pixels[y*w+x]; int v=(((p>>16)&255)*30+((p>>8)&255)*59+(p&255)*11)/100;
      gray[y*w+x]=v; row+=v;sum[(y+1)*(w+1)+x+1]=sum[y*(w+1)+x+1]+row;
    }}
    int radius=Math.max(12,Math.min(50,w/20));
    for(int y=0;y<h;y++)for(int x=0;x<w;x++){
      int l=Math.max(0,x-radius),r=Math.min(w,x+radius+1),t=Math.max(0,y-radius),b=Math.min(h,y+radius+1);
      long local=sum[b*(w+1)+r]-sum[b*(w+1)+l]-sum[t*(w+1)+r]+sum[t*(w+1)+l];
      pixels[y*w+x]=gray[y*w+x]<(local/((r-l)*(b-t)))-offset ? 0xff000000 : 0xffffffff;
    }
    Bitmap out=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);out.setPixels(pixels,0,w,0,0,w,h);return out;
  }
}
