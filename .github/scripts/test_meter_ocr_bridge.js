const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const rows=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/meter-ocr-bridge-controls.json'),'utf8'));
const source=fs.readFileSync(path.join(root,'photoModeData.js'),'utf8').replace(/export /g,'');
const {extraireValeurOcr}=new Function(source+';return {extraireValeurOcr};')();
let controls=0;
for(const row of rows){
 if(row.image==='missing'){assert.equal(row.error.code,'METRA_METER_OCR_ERROR');continue;}
 assert.ok(row.result,'the actual bridge must resolve rather than reject');
 const found=extraireValeurOcr(row.result,{kind:'meter',unit:row.unit});
 if(row.image==='ocr-bridge-blank.jpg'){assert.equal(found,null);continue;}
 controls++;assert.equal(found?.value,row.expected,row.image+': complete bridge plus parser reading');
}
assert.equal(controls,3);assert.equal(rows.length,5);
console.log('Actual Kotlin bridge controls: 3/3 exact readings through file decoding, native OCR, and parser; blank and missing images handled.');
