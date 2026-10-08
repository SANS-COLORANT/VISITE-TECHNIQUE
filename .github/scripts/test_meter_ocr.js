const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const src=fs.readFileSync(path.join(root,'photoModeData.js'),'utf8').replace(/export /g,'');
const {extraireValeurOcr}=new Function(src+'; return {extraireValeurOcr};')();
const decoder=fs.readFileSync(path.join(root,'native/metra-mission-tools/MeterImageDecoder.java'),'utf8');
const bridge=fs.readFileSync(path.join(root,'native/metra-mission-tools/MetraOcrModule.kt'),'utf8');
assert.ok(decoder.includes('options.inSampleSize = 1;'),'initialize Android sample size before arithmetic');
assert.ok(bridge.includes('MeterImageDecoder.decode(context.contentResolver, uri)'),'the real bridge must use the tested decoder');
const meter={kind:'meter',unit:'MWh'};
assert.equal(extraireValeurOcr('MULTICAL 601\n2350 54\nTHWh\n7238502\nProg\n44478478\nCfa 21015272700',meter),null);
assert.equal(extraireValeurOcr('15 203 B 293\nD9289\nMULTICAL\n74679398\n2031',{kind:'meter',unit:'m³'}),null);
assert.equal(extraireValeurOcr('CF 800\nH71\n06067868\n9558n\nACTARIS',meter),null);
for(const [text,unit,value] of [['23501.54 MWh','MWh','23501.54'],['07928.519 m³','m³','07928.519'],['955.67 MWh','MWh','955.67']]){
 assert.equal(extraireValeurOcr(text,{kind:'meter',unit}).value,value);
}
assert.equal(extraireValeurOcr('955.67 MWh',{kind:'meter',unit:'m³'}).unitMismatch,true);
assert.equal(extraireValeurOcr('23501.54MWh',meter).value,'23501.54');
// Synthetic geometry reproduces a unit glyph read as a digit; no private image.
for (const glyph of ['1Wh', '7Wh']) {
 const main = {text:'86420', box:{left:40,top:40,right:290,bottom:100}};
 const unit = {text:glyph, box:{left:200,top:120,right:280,bottom:145}};
 assert.equal(extraireValeurOcr({passes:[
  {lines:[main,{...unit,text:'HWh'}]}, {lines:[unit]}, {lines:[unit]}
 ]},meter),null,'a small corrupted unit below large digits is not a separate index');
}
assert.equal(extraireValeurOcr({lines:[{text:'1Wh',box:{left:40,top:40,right:180,bottom:100}}]},
 {kind:'meter',unit:'Wh'}).value,'1','a genuine small index remains readable');
assert.equal(extraireValeurOcr({lines:[
 {text:'984321',box:{left:40,top:10,right:180,bottom:30}},
 {text:'42.5 MWh',box:{left:40,top:50,right:290,bottom:110}}
]},meter).value,'42.5','a smaller serial above the actual display does not hide its index');

assert.equal(extraireValeurOcr({passes:[{text:'23501.54MWh'},{text:'23501.54MWh'}]},meter).value,'23501.54');
assert.equal(extraireValeurOcr({passes:[{text:'23501.54 MWh'},{text:''},{text:''}]},meter).value,'23501.54', 'a clear full-photo reading survives empty enhancements');
assert.equal(extraireValeurOcr({passes:[{text:''},{text:'23501.54 MWh'}]},meter),null,'a lone enhanced reading stays unconfirmed');
assert.equal(extraireValeurOcr('23501.54 THWh',meter),null,'do not mistake the suffix of a damaged unit for Wh');
assert.equal(extraireValeurOcr({passes:[{text:'23501.54MWh'},{text:'73501.54MWh'}]},meter),null);
assert.equal(extraireValeurOcr({passes:[{text:'23501.54 MWh'},{text:'23501.54 MWh'},
 {crop:{left:150,top:0,right:1000,bottom:500},lines:[{text:'3501.54 MWh',box:{left:151,top:100,right:900,bottom:200}}]}]},meter).value,'23501.54');
assert.equal(extraireValeurOcr('S/N 7238502\nCfg 21015272700\n10 m³/h',meter),null);
assert.equal(extraireValeurOcr('42.1 MWh\n43.1 MWh',meter),null);
assert.equal(extraireValeurOcr({passes:[{text:'42.1 MWh'},{text:'42.1 MWh'},{text:'42.1 MWh'},{text:'43.1 MWh'}]},meter).value,'42.1');
assert.equal(extraireValeurOcr('72.5 °C',{kind:'temperature',unit:'°C'}).value,'72.5');
assert.equal(extraireValeurOcr('2.4 bar',{kind:'pressure',unit:'bar'}).value,'2.4');
const captures=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/meter-ocr-android-captures.json'),'utf8'));
let exactPhotos=0;
for(const capture of captures){
 const found=extraireValeurOcr(capture,{kind:'meter',unit:capture.unit});
 if(capture.realPhoto){
  assert.ok(!found || found.value===capture.expected,`${capture.image}: never suggest a wrong index`);
  if(found?.value===capture.expected)exactPhotos++;
 }else assert.equal(found?.value,capture.expected,`${capture.image}: native ML Kit clear-display control`);
}
console.log(`Actual Android captures: ${exactPhotos}/6 exact photo readings; 6/6 wrong-index safeguards; 3/3 clear-display controls.`);
if(process.argv.includes('--require-exact-photos')) assert.equal(exactPhotos,6,'BLOCKED: one-photo acceptance criterion is not yet met');
console.log('Meter OCR: captured failures rejected, exact indexes retained, ambiguity and units checked, temperature/pressure preserved.');
