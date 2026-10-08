const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../../missionNativeTools.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
function reader(native) {
  return new Function('NativeModules','Platform','PermissionsAndroid', source + ';return reconnaitreTexteImageLocale;')(
    {MetraOcr:native},{OS:'android'},{});
}
(async () => {
  let ordinary = 0;
  const fallback = {text:'12345.67 MWh',blocks:[]};
  const recognize = async () => { ordinary++; return fallback; };
  const direct = {text:'12345.67 MWh',passes:[{text:'12345.67 MWh'}]};
  assert.equal(await reader({recognize,recognizeMeter:async()=>direct})('photo',{meter:true}),direct);
  assert.equal(ordinary,0);
  const partial = {text:'',passes:[{text:'MULTICAL 601'}]};
  assert.equal(await reader({recognize,recognizeMeter:async()=>partial})('photo',{meter:true}),partial);
  assert.equal(ordinary,0,'keep recognised text from later passes');
  for (const specialized of [async()=>{throw new Error('decode failed');},async()=>({text:'',passes:[]})]) {
    const out = await reader({recognize,recognizeMeter:specialized})('photo',{meter:true});
    assert.equal(out.text,fallback.text);assert.equal(out.meterFallback,true);
  }
  assert.equal(ordinary,2,'one ordinary attempt per failed specialized read');
  const blank = {text:'',passes:[{text:''}]};
  assert.equal(await reader({recognize:async()=>({text:''}),recognizeMeter:async()=>blank})('photo',{meter:true}),blank);
  let failures = 0;
  await assert.rejects(reader({recognize:async()=>{failures++;throw new Error('missing photo');},recognizeMeter:async()=>{throw new Error('decode failed');}})('missing',{meter:true}),/missing photo/);
  assert.equal(failures,1,'do not repeat a failing fallback');
  assert.equal(await reader({recognize})('photo'),fallback,'plate/temperature reader stays unchanged');
  assert.equal((await reader({})('photo',{meter:true})).unavailable,true);
  console.log('Offline OCR fallback: failed decoding, empty outputs, partial passes, and ordinary-reader errors verified.');
})().catch(error=>{console.error(error);process.exitCode=1;});
