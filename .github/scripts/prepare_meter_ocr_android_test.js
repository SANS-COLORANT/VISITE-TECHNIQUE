// Test packaging ONLY, run after Expo prebuild. No runtime source mutation.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const source=path.join(root,'native/metra-mission-tools/tests/MeterOcrBridgeInstrumentation.java');
const target=path.join(root,'android/app/src/debug/java/com/metra/missiontools/MeterOcrBridgeInstrumentation.java');
fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
const manifest=path.join(root,'android/app/src/debug/AndroidManifest.xml');
let xml=fs.readFileSync(manifest,'utf8');
if(!xml.includes('MeterOcrBridgeInstrumentation'))xml=xml.replace('</manifest>','  <instrumentation android:name="com.metra.missiontools.MeterOcrBridgeInstrumentation" android:targetPackage="com.visitetechnique.tablet" />\n</manifest>');
fs.writeFileSync(manifest,xml);
console.log('Prepared offline OCR bridge instrumentation in debug source set.');
