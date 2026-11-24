import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getPilotageColumnWindow,getPilotagePanGeometry,clampPilotageZoom,clampPilotageOffset,rescalePilotageOffset,visiblePilotageColumns,fitPilotageZoom} from '../pilotageDensity.js';
import {rootSwipeProgress,rootSwipePosition,rootSwipeTarget} from '../rootTabSwipe.js';
const source=name=>readFileSync(name,'utf8');
test('all categories visible in complete viewport-sized columns, phone/tablet and font scaling',()=>{
 for(const width of [250,290,330,360,390,720,1100])for(const fontScale of [1,1.2,1.35,1.7])for(const count of [1,2,7,19]){
   const first=getPilotageColumnWindow({width,fontScale,count});
   assert.ok(first.leftWidth+first.cellWidth*first.pageSize<=width);
   const all=[];
   for(let page=0;page<first.pages;page++){
     const g=getPilotageColumnWindow({width,fontScale,count,page});
     for(let i=g.start;i<g.end;i++)all.push(i);
   }
   assert.deepEqual(all,Array.from({length:count},(_,i)=>i));
   assert.equal(getPilotageColumnWindow({width,fontScale,count,page:999}).page,first.pages-1);
 }
});
test('single page progress is bounded, synchronized, reversible',()=>{
 assert.equal(rootSwipeProgress(-180,360),.5);
 assert.equal(rootSwipePosition('clients',-180,360),1.5);
 assert.equal(rootSwipePosition('clients',180,360),.5);
 assert.equal(rootSwipePosition('home',180,360),0);
 assert.equal(rootSwipePosition('settings',-180,360),2);
 assert.equal(rootSwipeTarget('clients',-90,.8),null);
 assert.equal(rootSwipeTarget('clients',-90,-.8),'settings');
});
test('single vertical pilotage list and header; no competing synchronized list',()=>{
 const s=source('ClientPilotageScreen.js');
 assert.ok(s.includes('stickyHeaderIndices={rows.length?[1]:[]}'));
 assert.ok(s.includes('ListHeaderComponent={header} ListFooterComponent={footer}'));
 assert.ok(!s.includes('synchronize(rightRef)'));
 assert.ok(!s.includes('synchronize(leftRef)'));
 assert.match(s,/maxToRenderPerBatch=\{8\}/,'large-client render batch limit');
 assert.match(s,/initialNumToRender=\{8\}/,'bounded initial mount');
});
test('catalogue controls scroll with brand lists and settings header is passed through',()=>{
 const s=source('EquipmentCatalogueBrowser.js'),p=source('ParametresScreen.js'),v=source('visual-packs/runtime/VisualPacksSettingsScreen.js');
 assert.ok(s.includes('ListHeaderComponent={listHeader}'));
 assert.ok(p.includes('header={equipmentHeader}'));
 assert.ok(v.includes('<ParametresScreen topContent={topContent}/>'));
});
test('pager and dock driven by the same absolute animated value',()=>{
 const a=source('App.js'),b=source('BottomTabBar.js');
 assert.ok(a.includes('transform:[{translateX:rootPagerTranslate}]'));
 assert.ok(a.includes('swipeProgress={tabSwipeProgress}'));
 assert.ok(b.includes('inputRange:[0,1,2]'));
 assert.ok(!b.includes('deltaToNext'));
});

test('continuous pilotage zoom and horizontal pan cover every column without losing label column',()=>{
 for(const width of [250,330,360,600,1000])for(const count of [1,7,19]){
   const g=getPilotagePanGeometry({width,count,zoom:1});
   const small=getPilotagePanGeometry({width,count,zoom:.38});
   assert.ok(g.leftWidth<=width*.44&&small.leftWidth<=g.leftWidth);
   assert.ok(small.cellWidth<=g.cellWidth);
   assert.equal(clampPilotageOffset(-50,g),0);
   assert.equal(clampPilotageOffset(1e5,g),g.maxOffset);
   assert.equal(visiblePilotageColumns(g.maxOffset,g).end,count);
   const target=rescalePilotageOffset(g.maxOffset/2,g,small,.5);
   assert.ok(target>=0&&target<=small.maxOffset);
   assert.ok(fitPilotageZoom(width,count)>=.38);
 }
 assert.equal(clampPilotageZoom(5),1.65);
 assert.equal(clampPilotageZoom(.01),.38);
 const s=source('ClientPilotageScreen.js');
 assert.ok(s.includes('onStartShouldSetPanResponderCapture')&&s.includes('distance/s.distance'));
 assert.ok(s.includes('transform:[{translateX:animatedX}]')&&s.includes('scrollEnabled={!gesturing}'));
 assert.ok(s.includes('Réduire le zoom')&&s.includes('Agrandir le zoom'));
});
