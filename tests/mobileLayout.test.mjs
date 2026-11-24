import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getPilotageColumnWindow} from '../pilotageDensity.js';
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
