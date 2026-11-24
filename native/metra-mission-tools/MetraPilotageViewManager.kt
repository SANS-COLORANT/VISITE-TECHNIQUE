package com.metra.missiontools

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.TextPaint
import android.text.TextUtils
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.widget.OverScroller
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.RCTEventEmitter
import org.json.JSONObject
import kotlin.math.*

/** Read-only Android matrix. No JS work or SQLite calls on touch frames.
 * Canvas draws only the viewport plus fixed headers. All gestures use px
 * coordinates in one native surface, with independent X/Y bounds. */
class MetraPilotageCanvas(context: Context) : View(context) {
  private data class Column(val key:String,val label:String)
  private data class Row(val key:String,val label:String,val site:Boolean,val collapsed:Boolean,val cells:List<IntArray>)
  private var columns=emptyList<Column>()
  private var rows=emptyList<Row>()
  private val d=resources.displayMetrics.density
  private val scroller=OverScroller(context)
  private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
  private val textPaint=TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val rect=RectF()
  private var zoom=1f
  private var x=0f
  private var y=0f
  private var wide=false
  private var multi=false
  private var lastFocusX=0f
  private var lastFocusY=0f
  private var lastCommand=-1
  private var moving=false
  private val fills=intArrayOf(0xfff8f8f8.toInt(),0xffe8f5e9.toInt(),0xfffff3e0.toInt(),0xfffdecec.toInt(),0xfff2f4f7.toInt(),0xfff7f7f7.toInt())
  private val inks=intArrayOf(0xff98a2b3.toInt(),0xff1b5e20.toInt(),0xff9a4e00.toInt(),0xffb42318.toInt(),0xff475467.toInt(),0xff667085.toInt())
  private val symbols=arrayOf("—","✓","!","!","?","·")
  private val bold=Typeface.create("sans-serif",Typeface.BOLD)
  private val normal=Typeface.create("sans-serif",Typeface.NORMAL)
  private fun dp(v:Float)=v*d
  private fun left()=min(width*(if(wide)0.36f else 0.23f),max(dp(32f),dp((if(wide)145f else 92f)*zoom)))
  private fun cw()=max(dp(30f),dp((if(width/d>=650f)100f else 75f)*zoom))
  private fun rh()=max(dp(20f),dp(56f*zoom))
  private fun hh()=max(dp(24f),dp(46f*zoom))
  private fun maxX()=max(0f,cw()*columns.size-(width-left()))
  private fun maxY()=max(0f,rh()*rows.size-(height-hh()))
  private fun bound(){x=x.coerceIn(0f,maxX());y=y.coerceIn(0f,maxY())}
  private fun stop(){scroller.forceFinished(true);moving=false}
  private fun describe(){
    contentDescription="Tableau pilotage tactile; zoom "+(zoom*100).roundToInt()+"%; x "+(x/d).roundToInt()+"; y "+(y/d).roundToInt()+"; colonne "+(left()/d).roundToInt()+" dp"
  }
  fun setModel(value:String?){
    if(value==null)return
    val oldIndex=if(rows.isEmpty())0 else (y/rh()).toInt().coerceIn(0,rows.lastIndex)
    val oldKey=rows.getOrNull(oldIndex)?.key
    val fraction=if(rh()>0)(y/rh())%1f else 0f
    try{
      val obj=JSONObject(value)
      val cs=obj.getJSONArray("columns")
      val rs=obj.getJSONArray("rows")
      val nextColumns=List(cs.length()){i->val c=cs.getJSONObject(i);Column(c.getString("key"),c.getString("label"))}
      val nextRows=List(rs.length()){i->
        val r=rs.getJSONObject(i);val a=r.getJSONArray("cells")
        val cells=List(nextColumns.size){j->val c=a.optJSONArray(j);IntArray(7){k->c?.optInt(k,0)?:0}}
        Row(r.getString("key"),r.getString("label"),r.optBoolean("site"),r.optBoolean("collapsed"),cells)
      }
      stop()
      columns=nextColumns;rows=nextRows
      val index=if(oldKey==null)-1 else rows.indexOfFirst{it.key==oldKey}
      if(index>=0)y=(index+fraction)*rh()
      bound();describe();invalidate()
    }catch(e:Exception){
      // No partial data replacement on malformed projection.
      emit("error","","")
    }
  }
  fun command(c:ReadableMap?){
    if(c==null||!c.hasKey("seq")||!c.hasKey("action"))return
    val seq=c.getInt("seq");if(seq==lastCommand)return;lastCommand=seq
    when(c.getString("action")){
      "fit"->{stop();var lo=0.38f;var hi=1f
        repeat(16){val mid=(lo+hi)/2;zoom=mid;if(maxX()<=0.5f)lo=mid else hi=mid}
        zoom=lo;x=0f;bound();describe();invalidate()}
      "reset"->{stop();scaleTo(1f,width/2f,height/2f,width/2f,height/2f);describe()}
      "in"->{stop();scaleTo(zoom*1.22f,width/2f,height/2f,width/2f,height/2f);describe()}
      "out"->{stop();scaleTo(zoom/1.22f,width/2f,height/2f,width/2f,height/2f);describe()}
    }
  }
  private fun scaleTo(z:Float,fromX:Float,fromY:Float,toX:Float,toY:Float){
    val column=(x+(fromX-left()).coerceIn(0f,max(0f,width-left())))/cw()
    val row=(y+(fromY-hh()).coerceIn(0f,max(0f,height-hh())))/rh()
    zoom=z.coerceIn(0.38f,1.65f)
    x=column*cw()-(toX-left()).coerceIn(0f,max(0f,width-left()))
    y=row*rh()-(toY-hh()).coerceIn(0f,max(0f,height-hh()))
    bound();invalidate()
  }
  private val scale=ScaleGestureDetector(context,object:ScaleGestureDetector.SimpleOnScaleGestureListener(){
    override fun onScaleBegin(detector:ScaleGestureDetector):Boolean{
      stop();multi=true;lastFocusX=detector.focusX;lastFocusY=detector.focusY;return true
    }
    override fun onScale(detector:ScaleGestureDetector):Boolean{
      scaleTo(zoom*detector.scaleFactor,lastFocusX,lastFocusY,detector.focusX,detector.focusY)
      lastFocusX=detector.focusX;lastFocusY=detector.focusY
      return true
    }
    override fun onScaleEnd(detector:ScaleGestureDetector){describe()}
  }).apply{isQuickScaleEnabled=false;isStylusScaleEnabled=false}
  private val gestures=GestureDetector(context,object:GestureDetector.SimpleOnGestureListener(){
    override fun onDown(e:MotionEvent):Boolean{stop();return true}
    override fun onScroll(e1:MotionEvent?,e2:MotionEvent,distanceX:Float,distanceY:Float):Boolean{
      if(!multi&&!scale.isInProgress){x+=distanceX;y+=distanceY;bound();invalidate()}
      return true
    }
    override fun onFling(e1:MotionEvent?,e2:MotionEvent,velocityX:Float,velocityY:Float):Boolean{
      if(multi||scale.isInProgress)return false
      scroller.fling(x.roundToInt(),y.roundToInt(),(-velocityX).roundToInt(),(-velocityY).roundToInt(),0,maxX().roundToInt(),0,maxY().roundToInt())
      moving=true;postInvalidateOnAnimation();return true
    }
    override fun onSingleTapConfirmed(e:MotionEvent):Boolean{
      if(!multi){hit(e.x,e.y,false);performClick()}
      return true
    }
    override fun onLongPress(e:MotionEvent){if(!multi)hit(e.x,e.y,true)}
    override fun onDoubleTap(e:MotionEvent):Boolean{
      if(!multi){stop();scaleTo(if(zoom>1.2f)0.8f else zoom*1.45f,e.x,e.y,e.x,e.y);describe()}
      return true
    }
  })
  init{isFocusable=true;isClickable=true;importantForAccessibility=IMPORTANT_FOR_ACCESSIBILITY_YES;setBackgroundColor(Color.WHITE);describe()}
  override fun performClick():Boolean{super.performClick();return true}
  override fun onTouchEvent(e:MotionEvent):Boolean{
    when(e.actionMasked){
      MotionEvent.ACTION_DOWN->{multi=false;stop();parent?.requestDisallowInterceptTouchEvent(true)}
      MotionEvent.ACTION_POINTER_DOWN->{multi=true}
    }
    scale.onTouchEvent(e);gestures.onTouchEvent(e)
    if(e.actionMasked==MotionEvent.ACTION_UP||e.actionMasked==MotionEvent.ACTION_CANCEL){
      parent?.requestDisallowInterceptTouchEvent(false);if(!moving)describe()
    }
    return true
  }
  override fun computeScroll(){
    if(scroller.computeScrollOffset()){
      x=scroller.currX.toFloat();y=scroller.currY.toFloat();bound();postInvalidateOnAnimation()
    }else if(moving){moving=false;describe()}
  }
  override fun onSizeChanged(w:Int,h:Int,oldw:Int,oldh:Int){super.onSizeChanged(w,h,oldw,oldh);stop();bound();describe()}
  override fun onDetachedFromWindow(){stop();super.onDetachedFromWindow()}
  private fun emit(kind:String,row:String,column:String){
    if(id==NO_ID)return
    val event=Arguments.createMap().apply{putString("kind",kind);putString("row",row);putString("column",column)}
    @Suppress("DEPRECATION")
    (context as ThemedReactContext).getJSModule(RCTEventEmitter::class.java).receiveEvent(id,"topMatrixAction",event)
  }
  private fun hit(px:Float,py:Float,long:Boolean){
    if(py<hh()){
      if(px<left()){wide=!wide;bound();describe();invalidate()}
      return
    }
    val row=rows.getOrNull(floor((py-hh()+y)/rh()).toInt())?:return
    if(px<left()){emit(if(long)"name" else "label",row.key,"");return}
    val col=floor((px-left()+x)/cw()).toInt()
    val c=columns.getOrNull(col)?:return
    if((row.cells.getOrNull(col)?.getOrNull(6)?:0)>0)emit("cell",row.key,c.key)
  }
  private fun box(c:Canvas,l:Float,t:Float,r:Float,b:Float,color:Int,round:Float=0f){
    paint.color=color;paint.style=Paint.Style.FILL;rect.set(l,t,r,b)
    if(round>0)c.drawRoundRect(rect,round,round,paint) else c.drawRect(rect,paint)
  }
  private fun line(c:Canvas,x1:Float,y1:Float,x2:Float,y2:Float){
    paint.color=0xffe2dfda.toInt();paint.strokeWidth=dp(0.6f);c.drawLine(x1,y1,x2,y2,paint)
  }
  private fun label(c:Canvas,s:String,l:Float,t:Float,w:Float,h:Float,size:Float,color:Int,heavy:Boolean,center:Boolean=true){
    if(w<=0||h<=0)return
    textPaint.color=color;textPaint.textSize=dp(size);textPaint.typeface=if(heavy)bold else normal
    val text=TextUtils.ellipsize(s,textPaint,max(0f,w-dp(4f)),TextUtils.TruncateAt.END).toString()
    val tx=if(center)l+(w-textPaint.measureText(text))/2 else l+dp(2f)
    val base=t+h/2-(textPaint.ascent()+textPaint.descent())/2
    c.drawText(text,tx,base,textPaint)
  }
  // Keep long category/local names readable on two lines at normal zoom.
  // The complete name is always available through a long touch.
  private fun wrappedLabel(c:Canvas,s:String,l:Float,t:Float,w:Float,h:Float,size:Float,color:Int,center:Boolean=true){
    textPaint.textSize=dp(size);textPaint.typeface=bold
    val available=max(0f,w-dp(4f))
    if(available<=0f)return
    if(textPaint.measureText(s)<=available||zoom<0.7f){label(c,s,l,t,w,h,size,color,true,center);return}
    val limit=textPaint.breakText(s,true,available,null)
    if(limit<=0||limit>=s.length){label(c,s,l,t,w,h,size,color,true,center);return}
    val space=s.lastIndexOf(' ',limit-1)
    val cut=if(space>limit/2)space else limit
    label(c,s.substring(0,cut).trimEnd(),l,t,w,h/2,size,color,true,center)
    label(c,s.substring(cut).trimStart(),l,t+h/2,w,h/2,size,color,true,center)
  }
  override fun onDraw(c:Canvas){
    super.onDraw(c)
    val left=left();val head=hh();val colW=cw();val rowH=rh()
    val r0=floor(y/rowH).toInt().coerceAtLeast(0);val r1=min(rows.size,ceil((y+height-head)/rowH).toInt()+1)
    val c0=floor(x/colW).toInt().coerceAtLeast(0);val c1=min(columns.size,ceil((x+width-left)/colW).toInt()+1)
    if(rows.isEmpty()||columns.isEmpty()){
      label(c,"Aucun constat dans cette vue",0f,0f,width.toFloat(),height.toFloat(),12f,0xff666666.toInt(),false);return
    }
    // Draw data cells first, then frozen labels and header; no offscreen views.
    c.save();c.clipRect(left,head,width.toFloat(),height.toFloat())
    for(i in r0 until r1){
      val row=rows[i];val top=head+i*rowH-y
      if(row.site)box(c,left,top,width.toFloat(),top+rowH,0xfffff4e9.toInt())
      for(j in c0 until c1){
        val l=left+j*colW-x;val v=row.cells[j];val state=v[0].coerceIn(0,5)
        val count=when(state){1->v[1];2,3->v[2];4->v[3]+v[4];5->v[5];else->0}
        val inset=dp(max(1f,2.5f*zoom))
        box(c,l+inset,top+inset,l+colW-inset,top+rowH-inset,fills[state],dp(max(2f,6f*zoom)))
        val title=symbols[state]+if(count>0)" "+count else ""
        label(c,title,l,top,colW,if(zoom>=0.7f)rowH*0.62f else rowH,max(8f,14f*zoom),inks[state],true)
        if(zoom>=0.7f&&v[6]>0)label(c,v[1].toString()+" S · "+v[2]+" N.S",l,top+rowH*0.58f,colW,rowH*0.35f,max(6.5f,8f*zoom),inks[state],false)
        line(c,l+colW,top,l+colW,top+rowH)
      }
      line(c,left,top+rowH,width.toFloat(),top+rowH)
    }
    c.restore()
    c.save();c.clipRect(0f,head,left,height.toFloat())
    for(i in r0 until r1){
      val row=rows[i];val top=head+i*rowH-y
      box(c,0f,top,left,top+rowH,if(row.site)0xfffff0e2.toInt() else Color.WHITE)
      val prefix=if(row.site){if(row.collapsed)"▸ " else "▾ "}else "↳ "
      val color=if(row.site)0xffb75420.toInt() else 0xff34312e.toInt()
      wrappedLabel(c,prefix+row.label,dp(3f),top,left-dp(5f),rowH,max(7f,10.5f*zoom),color,false)
      line(c,0f,top+rowH,left,top+rowH)
    }
    c.restore()
    box(c,0f,0f,width.toFloat(),head,0xfff4f1ec.toInt())
    c.save();c.clipRect(left,0f,width.toFloat(),head)
    for(j in c0 until c1){val l=left+j*colW-x;wrappedLabel(c,columns[j].label,l,0f,colW,head,max(7f,10f*zoom),0xff36322d.toInt());line(c,l+colW,0f,l+colW,head)}
    c.restore()
    box(c,0f,0f,left,head,0xffeee9e2.toInt())
    wrappedLabel(c,"Sites / locaux",0f,0f,left,head,max(7f,10f*zoom),0xff36322d.toInt())
    line(c,left,0f,left,height.toFloat());line(c,0f,head,width.toFloat(),head)
    // Thin proportional scroll indicators, no visible counters or page navigation.
    if(maxX()>0){val span=width-left;val thumb=max(dp(12f),span*span/(colW*columns.size));val start=left+(span-thumb)*x/maxX();box(c,start,height-dp(3f),start+thumb,height.toFloat(),0xffdb682c.toInt(),dp(1.5f))}
    if(maxY()>0){val span=height-head;val thumb=max(dp(12f),span*span/(rowH*rows.size));val start=head+(span-thumb)*y/maxY();box(c,width-dp(3f),start,width.toFloat(),start+thumb,0xffdb682c.toInt(),dp(1.5f))}
  }
}

class MetraPilotageViewManager : SimpleViewManager<MetraPilotageCanvas>() {
  override fun getName()="MetraPilotageCanvas"
  override fun createViewInstance(reactContext:ThemedReactContext)=MetraPilotageCanvas(reactContext)
  @ReactProp(name="model")
  fun setModel(view:MetraPilotageCanvas,value:String?){view.setModel(value)}
  @ReactProp(name="viewportCommand")
  fun setCommand(view:MetraPilotageCanvas,value:ReadableMap?){view.command(value)}
  override fun getExportedCustomDirectEventTypeConstants():MutableMap<String,Any> =
    mutableMapOf("topMatrixAction" to mapOf("registrationName" to "onMatrixAction"))
}
