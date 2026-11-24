import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument,PDFName,PDFDict,PDFHexString} from 'pdf-lib';
import {projectReportMaterials,fullReportLabel,formatReportMeasurement,assertReportPhotoIds,ensureReportA4,A4_REPORT_POINTS} from '../reportFidelity.js';
import {REPORT_COVER,REPORT_LOGO,REPORT_OPQIBI} from '../reportBrandAssets.js';
import {installReportNavigation,reportMarker} from '../reportPdfNavigation.js';
import {pagesPhotosRapport} from '../reportPdfFragments.js';
import {uniqueImportedMaterialRows} from '../intranetMaterialImportReconcile.js';
test('official embedded PNGs equal original binary assets and pdf-lib decodes them',async()=>{
 const pdf=await PDFDocument.create();
 for(const [data,path] of [[REPORT_COVER,'cover-building.png'],[REPORT_LOGO,'brand-logo.png'],[REPORT_OPQIBI,'Image21.png']]){
   assert.ok(data.startsWith('data:image/png;base64,'));
   const bytes=Buffer.from(data.split(',')[1],'base64');
   assert.deepEqual(bytes,readFileSync('assets/report/'+path));
   const image=await pdf.embedPng(bytes);assert.ok(image.width>0&&image.height>0);
 }
});
test('confirmed remote duplicate removed only in projection; independent twins and disagreements retained',()=>{
 const row={visite_id:'V',categorie:'Production',nombre:'1',designation:'Pompe',marque:'WILO',modele:'M',annee:'2020'};
 const material=[{...row,id:'a',equipement_id:'e1'},{...row,id:'b',equipement_id:'e2',marque:'Wilo'},
 {...row,id:'c',equipement_id:'e3'},{...row,id:'d',equipement_id:'e2',nombre:'2'},
 {...row,id:'e',equipement_id:null},{...row,id:'f',equipement_id:null}];
 const provenance=(entite_id,id)=>({entite_id,reference_externe:id,details_json:JSON.stringify({sourceType:'listing_materiel',remoteMaterialId:id})});
 const result=projectReportMaterials(material,[provenance('e1','r1'),provenance('e2','r1'),provenance('e3','r2')]);
 assert.equal(result.removed,1);assert.equal(result.conflicts,1);assert.deepEqual(result.rows.map(m=>m.id),['a','c','d','e','f']);
 assert.equal(material.length,6);
});
test('same explicit remote id never multiplied; conflicts fail; no-ID twins preserved',()=>{
 const a={id:'1',designation:'Pompe',nombre:'1'},b={...a},c={...a,id:'2'};
 assert.equal(uniqueImportedMaterialRows([a,b,c,{designation:'P'},{designation:'P'}]).length,4);
 assert.throws(()=>uniqueImportedMaterialRows([a,{...a,nombre:'2'}]),/incohérent/);
});
test('multiline values, mixed units and status; full labels keep punctuation',()=>{
 assert.equal(formatReportMeasurement('Compteur A : 3817,54MWh MWh','MWh'),'Compteur A : 3817,54 MWh');
 assert.equal(formatReportMeasurement('4,003m3 m³','m³'),'4,003 m³');
 assert.equal(formatReportMeasurement('S.O m³','m³'),'S.O');
 assert.equal(formatReportMeasurement('Sans objet','m³'),'Sans objet');
 assert.equal(formatReportMeasurement('0','bar'),'0 bar');
 assert.equal(formatReportMeasurement('A : 10 kWh\nB : 20 MWh','MWh'),'A : 10 kWh\nB : 20 MWh');
 assert.equal(fullReportLabel('A5 Prod E.C.S.'),'A5 Prod E.C.S.');
});
test('six standard images per page, missing/duplicate IDs fail',()=>{
 assert.deepEqual(pagesPhotosRapport(Array.from({length:10},(_,i)=>({id:i,size:'medium'}))).map(p=>p.length),[6,4]);
 assert.equal(assertReportPhotoIds('<div data-photo-id="p1"></div><div data-photo-id="p2"></div>',['p1','p2']),2);
 assert.throws(()=>assertReportPhotoIds('<div data-photo-id="p1"></div>',['p1','p2']),/incohérence/);
 assert.throws(()=>assertReportPhotoIds('<div data-photo-id="p1"></div><div data-photo-id="p1"></div>',['p1','p2']),/incohérence/);
});
test('PDF A4 and internal navigation: local marker links replaced, no external marker remains',async()=>{
 const p=await PDFDocument.create();
 const a=p.addPage([595,842]),b=p.addPage([595,842]),c=p.addPage([595,842]);
 const ann=(page,kind,id)=>{
   const d=p.context.obj({Type:'Annot',Subtype:'Link',Rect:[0,0,100,20],A:{S:'URI',URI:PDFHexString.fromText(reportMarker(kind,id))}});
   const ref=p.context.register(d);page.node.set(PDFName.of('Annots'),p.context.obj([ref]));return d;
 };
 const toc=ann(a,'toc','v1');ann(b,'local','v1');ann(c,'toc','missing');
 p.getPages().forEach(ensureReportA4);assert.throws(()=>ensureReportA4({getSize:()=>({width:612,height:792})}),/format incorrect/);
 const stats=installReportNavigation(p,[{index:1,locals:[{id:'v1',label:'A5 Prod E.C.S.'}]}]);
 assert.equal(stats.exact,1);assert.equal(stats.bookmarks,2);
 assert.ok(toc.has(PDFName.of('Dest')));assert.ok(!toc.has(PDFName.of('A')));
 assert.ok(p.catalog.has(PDFName.of('Outlines')));
 const reopened=await PDFDocument.load(await p.save());assert.equal(reopened.getPageCount(),3);
});
