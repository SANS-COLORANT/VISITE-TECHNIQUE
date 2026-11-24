import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPilotageCanvasModel} from '../pilotageCanvasModel.js';
test('all 10001 locals and every category retained, no source records crossing bridge',()=>{
 const categories=Array.from({length:19},(_,i)=>({key:'c'+i,label:'Category '+i}));
 const cells={c18:{state:'red',s:1,ns:3,nr:0,nv:0,so:0,total:4,records:['private'],issues:['private']}};
 const site={id:'a',nom_site:'Site A',cells,locals:Array.from({length:10001},(_,i)=>({id:'l'+i,nom:'Local '+i,cells}))};
 const model=buildPilotageCanvasModel([site],categories);
 const data=JSON.parse(model.json);
 assert.equal(data.rows.length,10002);assert.equal(data.columns.length,19);
 assert.deepEqual(data.rows.at(-1).cells.at(-1),[3,1,3,0,0,0,4]);
 assert.ok(!model.json.includes('private'));
 assert.equal(model.lookup.get('l:a:l10000').local,site.locals.at(-1));
 assert.equal(JSON.parse(buildPilotageCanvasModel([site],categories,{a:true}).json).rows.length,1);
});
test('native viewport draws only visible rows/columns; independent axes and pinch use focal point',()=>{
 const s=readFileSync('native/metra-mission-tools/MetraPilotageViewManager.kt','utf8');
 for(const x of ['ScaleGestureDetector','OverScroller','for(i in r0 until r1)','for(j in c0 until c1)','x+=distanceX;y+=distanceY','scaleTo(zoom*detector.scaleFactor','parent?.requestDisallowInterceptTouchEvent(true)','c.clipRect(left,head','emit("cell",row.key,c.key)'])assert.ok(s.includes(x),x);
 const p=readFileSync('plugins/withMetraMissionTools.js','utf8');
 assert.ok(p.includes('MetraPilotageViewManager.kt'));
 const a=readFileSync('ClientPilotageScreen.js','utf8');
 assert.ok(a.includes('<NativeCanvas')&&a.includes('AccessibilityInfo.isScreenReaderEnabled')&&a.includes('<TactileTechnicalMatrix sites={sites}'));
});
