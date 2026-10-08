package com.metra.missiontools;

import android.app.Instrumentation;
import android.os.Bundle;
import android.graphics.*;
import com.facebook.react.bridge.*;
import org.json.*;
import java.io.*;
import java.util.concurrent.*;

/** Executes the REAL Kotlin React Native bridge, including file decoding. */
public class MeterOcrBridgeInstrumentation extends Instrumentation {
  private Bundle arguments;
  @Override public void onCreate(Bundle args) { arguments=args; start(); }
  @Override public void onStart() {
    Bundle status=new Bundle(); MetraOcrModule module=null;
    try {
      if(new BitmapFactory.Options().inSampleSize!=0) throw new AssertionError("Unexpected Android default");
      for(int[] spec:new int[][]{{2560,1},{3200,1},{3201,2},{6400,2},{6401,4}})
        if(MeterImageDecoder.optionsFor(spec[0],1000).inSampleSize!=spec[1]) throw new AssertionError("Incorrect sample size");
      try {MeterImageDecoder.optionsFor(-1,-1);throw new AssertionError("Invalid dimensions accepted");}catch(IllegalArgumentException expected){}
      module=new MetraOcrModule(new ReactApplicationContext(getTargetContext()));
      JSONArray outputs=new JSONArray();
      for(String[] spec:new String[][]{{"energy","34567.89 MWh"},{"water","00042.123 m3"},{"power","7890.12 kWh"},{"blank",""}}) {
        File file=new File(getTargetContext().getFilesDir(),"ocr-bridge-"+spec[0]+".jpg");
        Bitmap image=Bitmap.createBitmap(1600,600,Bitmap.Config.ARGB_8888);
        Canvas canvas=new Canvas(image);canvas.drawColor(Color.WHITE);
        Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);paint.setColor(Color.BLACK);paint.setTextSize(140);
        canvas.drawText(spec[1],100,300,paint);
        try(OutputStream out=new FileOutputStream(file)){image.compress(Bitmap.CompressFormat.JPEG,100,out);}finally{image.recycle();}
        JSONObject row=read(module,file.getName(),file.toURI().toString(),false);
        if(!spec[1].isEmpty() && !row.getJSONObject("result").getString("text").contains(spec[1])) throw new AssertionError("Control not read: "+row);
        outputs.put(row);
      }
      outputs.put(read(module,"missing","file:///nonexistent-metra-ocr-test.jpg",true));
      String files=arguments==null?null:arguments.getString("photos");
      if(files!=null)for(String name:files.split(",")){
        File file=new File(getTargetContext().getFilesDir(),"ocr-test/"+name);
        JSONObject row=read(module,name,file.toURI().toString(),false);
        JSONArray passes=row.getJSONObject("result").getJSONArray("passes");boolean text=false;
        for(int i=0;i<passes.length();i++)text|=!passes.getJSONObject(i).getString("text").isEmpty();
        if(!text)throw new AssertionError("No OCR text from photo: "+name);
        outputs.put(row);
      }
      try(FileWriter out=new FileWriter(new File(getTargetContext().getFilesDir(),"meter-ocr-bridge-results.json"))){out.write(outputs.toString(2));}
      status.putString("stream","PASS: actual Kotlin bridge, file decoding, controls, blank image, missing file, and supplied photos\n");
      finish(-1,status);
    }catch(Throwable error){status.putString("stream","FAIL: "+error.toString()+"\n");finish(0,status);}
    finally{if(module!=null)module.invalidate();}
  }
  private JSONObject read(MetraOcrModule module,String name,String uri,boolean rejected) throws Exception {
    CountDownLatch done=new CountDownLatch(1);JSONObject row=new JSONObject();row.put("image",name);
    PromiseImpl promise=new PromiseImpl(args->{try{row.put("result",new JSONObject(((ReadableMap)args[0]).toHashMap()));}catch(Exception error){throw new RuntimeException(error);}finally{done.countDown();}},
      args->{try{row.put("error",new JSONObject(((ReadableMap)args[0]).toHashMap()));}catch(Exception error){throw new RuntimeException(error);}finally{done.countDown();}});
    module.recognizeMeter(uri,promise);
    if(!done.await(60,TimeUnit.SECONDS))throw new AssertionError("Bridge timed out: "+name);
    if(row.has("error")!=rejected)throw new AssertionError("Unexpected bridge result: "+row);
    return row;
  }
}
