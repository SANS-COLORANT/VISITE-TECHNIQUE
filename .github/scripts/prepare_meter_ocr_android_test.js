// Test packaging ONLY, run after Expo prebuild. No runtime source mutation.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const manifest = path.join(root, 'android/app/src/debug/AndroidManifest.xml');
let xml = fs.readFileSync(manifest, 'utf8');
for (const name of ['MeterOcrBridgeInstrumentation', 'MeterOcrEnhancementInstrumentation']) {
  const source = path.join(root, `native/metra-mission-tools/tests/${name}.java`);
  const target = path.join(root, `android/app/src/debug/java/com/metra/missiontools/${name}.java`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  if (!xml.includes(name)) xml = xml.replace('</manifest>',
    `  <instrumentation android:name="com.metra.missiontools.${name}" android:targetPackage="com.visitetechnique.tablet" />\n</manifest>`);
}
fs.writeFileSync(manifest, xml);
console.log('Prepared offline OCR bridge and enhancement instrumentation in debug source set.');
