/**
 * Pure geometry for the client patrimoine matrix. Shared across phone/tablet,
 * portrait/landscape and testable without React Native or SQLite.
 * The comfort profile preserves the historical row/column dimensions.
 */
export const PILOTAGE_DENSITY = Object.freeze({
  compact: 'compact',
  comfortable: 'comfortable',
});

const GEOMETRY = Object.freeze({
  compact: Object.freeze({ rowHeight: 48, headerHeight: 42, cellWidth: 84, cellInset: 2 }),
  comfortable: Object.freeze({ rowHeight: 72, headerHeight: 58, cellWidth: 98, cellInset: 3 }),
});

export function getPilotageMatrixGeometry({ mode = 'compact', screenWidth = 390, screenHeight = 800, rowCount = 0 } = {}) {
  const compact = mode !== PILOTAGE_DENSITY.comfortable;
  const profile = compact ? GEOMETRY.compact : GEOMETRY.comfortable;
  const width = Number.isFinite(Number(screenWidth)) ? Math.max(280, Number(screenWidth)) : 390;
  const height = Number.isFinite(Number(screenHeight)) ? Math.max(400, Number(screenHeight)) : 800;
  const rows = Number.isFinite(Number(rowCount)) ? Math.max(0, Math.floor(Number(rowCount))) : 0;
  const phone = width < 650;
  const leftWidth = compact ? (width < 390 ? 144 : (phone ? 164 : 190)) : 210;
  // Reserve room for Android's safe header, filters/actions and the bottom dock.
  // The matrix itself owns vertical scrolling; column headers stay in place.
  const ceiling = compact ? Math.max(240, height - (phone ? 284 : 318)) : 610;
  const matrixHeight = Math.min(ceiling, Math.max(compact ? 154 : 166, profile.headerHeight + rows * profile.rowHeight));
  return { ...profile, leftWidth, matrixHeight };
}

/** Viewport-sized columns: no clipped last column and no invisible fixed-width
 * scroll region. On a narrow phone, expose every category via page controls. */
export function getPilotageColumnWindow({width=390,fontScale=1,count=0,page=0}={}) {
  const w=Math.max(1,Math.floor(Number(width)||390));
  const n=Math.max(0,Math.floor(Number(count)||0));
  const scale=Math.min(1.35,Math.max(1,Number(fontScale)||1));
  const leftWidth=Math.min(Math.floor(w*.43),Math.max(110,Math.min(w>=650?210:152,Math.floor(w*.38))));
  const available=Math.max(1,w-leftWidth);
  const capacity=Math.max(1,Math.floor(available/Math.ceil(85*scale)));
  const pageSize=Math.max(1,Math.min(n||1,capacity));
  const pages=Math.max(1,Math.ceil(n/pageSize));
  const current=Math.min(pages-1,Math.max(0,Math.floor(Number(page)||0)));
  const start=current*pageSize,end=Math.min(n,start+pageSize);
  const cellWidth=Math.floor(available/pageSize);
  return {leftWidth,cellWidth,pageSize,pages,page:current,start,end};
}

/** A continuous viewport in dp. One shared horizontal offset controls every
 * row, including the sticky header. Widths change with physical zoom; the
 * compact label column uses at most 23% of the matrix viewport. Expanded
 * labels are an explicit temporary reading mode, independent of table zoom. */
export const PILOTAGE_ZOOM_MIN=.38;
export const PILOTAGE_ZOOM_MAX=1.65;
export function clampPilotageZoom(scale){
  const n=Number(scale);return Math.max(PILOTAGE_ZOOM_MIN,Math.min(PILOTAGE_ZOOM_MAX,Number.isFinite(n)?n:1));
}
export function getPilotagePanGeometry({width=360,zoom=1,count=0,fontScale=1,labelMode='compact'}={}){
  const w=Math.max(1,Math.floor(Number(width)||360)),z=clampPilotageZoom(zoom),n=Math.max(0,Math.floor(Number(count)||0));
  const fs=Math.min(1.35,Math.max(1,Number(fontScale)||1));
  const expanded=labelMode==='expanded',tablet=w>=650;
  const labelRatio=expanded ? .36 : .23;
  const labelBase=expanded?(tablet?208:145):(tablet?132:92);
  const leftWidth=Math.max(1,Math.min(Math.floor(w*labelRatio),Math.max(expanded?48:32,Math.round(labelBase*z*fs))));
  // Spreadsheet text scales with pinch zoom, not twice with system font size.
  // Narrow phones prioritize three readable categories at normal zoom.
  const cellWidth=Math.max(34,Math.round((tablet?100:75)*z*Math.min(fs,1.12))),categoryViewport=Math.max(1,w-leftWidth-2);
  const contentWidth=cellWidth*n;
  return {zoom:z,width:w,leftWidth,cellWidth,categoryViewport,contentWidth,maxOffset:Math.max(0,contentWidth-categoryViewport),count:n,rowHeight:Math.max(24,Math.round(60*z)),headerHeight:Math.max(23,Math.round(45*z))};
}
export function clampPilotageOffset(offset,g){
  return Math.max(0,Math.min(g.maxOffset,Number(offset)||0));
}
export function visiblePilotageColumns(offset,g){
  if(!g.count)return {start:0,end:0};
  const x=clampPilotageOffset(offset,g);
  return {start:Math.floor(x/g.cellWidth),end:Math.min(g.count,Math.ceil((x+g.categoryViewport)/g.cellWidth))};
}
export function rescalePilotageOffset(offset,oldGeometry,nextGeometry,anchor=.5){
  const fraction=Math.max(0,Math.min(1,Number(anchor)||0));
  const logical=(clampPilotageOffset(offset,oldGeometry)+oldGeometry.categoryViewport*fraction)/oldGeometry.cellWidth;
  return clampPilotageOffset(logical*nextGeometry.cellWidth-nextGeometry.categoryViewport*fraction,nextGeometry);
}
export function fitPilotageZoom(width,count,fontScale=1,labelMode='compact'){
  if(!count)return 1;
  const fits=zoom=>getPilotagePanGeometry({width,count,fontScale,labelMode,zoom}).maxOffset===0;
  if(fits(1))return 1;
  if(!fits(PILOTAGE_ZOOM_MIN))return PILOTAGE_ZOOM_MIN;
  let low=PILOTAGE_ZOOM_MIN,high=1;
  for(let i=0;i<16;i++){
    const mid=(low+high)/2;
    if(fits(mid))low=mid;else high=mid;
  }
  return low;
}
