const fs = require('fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}
function need(text, value, label) {
  if (!text.includes(value)) throw new Error('[phone-photo-mode] ' + label + ': missing ' + value);
}
function forbid(text, value, label) {
  if (text.includes(value)) throw new Error('[phone-photo-mode] ' + label + ': forbidden ' + value);
}

const app = read('App.js');
const photo = read('PhotoPhoneScreen.js');
const photoButton = read('PhotoButton.js');
const icons = read('MetraCvcIcons.js');
const parser = read('photoModeData.js');
const missionPlugin = read('plugins/withMetraMissionTools.js');
const nativeOcr = read('native/metra-mission-tools/MetraOcrModule.kt');

need(app, "phoneMode === 'photo'", 'phone chooser must expose dedicated photo mode');
need(app, 'PhotoPhoneScreen', 'photo screen must be wired into App');
need(app, 'compact={phoneIntegralMode}', 'phone home button must use compact mode');

for (const token of [
  'buildCompanionVisitSnapshot',
  'importCompanionPhoto',
  'reconnaitreTexteImageLocale',
  'extraireValeurOcr',
  'extraireChampsPlaque',
  'ajouterRemarqueVisite',
  'demarrerDicteeLocale',
  "module.id === 'equipment'",
  "module.id === 'remarks'",
  'Plaque signalétique',
  'Nouvelle remarque'
])
  need(photo, token, 'photo mode runtime');

need(parser, 'extraireValeurOcr', 'local OCR value parser');
need(parser, 'extraireChampsPlaque', 'nameplate parser');
need(photoButton, 'useWindowDimensions', 'photo button must adapt to phone');
need(photoButton, "<CvcIcon name={hasPhotos ? 'eye' : 'camera'}", 'phone photo control must be icon-first');
forbid(photoButton, '📷 Photo', 'legacy emoji photo label must be removed');
forbid(photoButton, '📷 Reprendre', 'legacy emoji retake label must be removed');

for (const icon of ["key === 'home'", "key === 'plate'", "key === 'microphone'", "key === 'trash'"]) {
  need(icons, icon, 'vector icon family');
}

need(missionPlugin, 'com.google.mlkit:text-recognition:16.0.1', 'offline ML Kit OCR must remain bundled');
need(nativeOcr, 'TextRecognition.getClient', 'native OCR must stay local');
need(nativeOcr, 'TextRecognizerOptions.DEFAULT_OPTIONS', 'latin OCR model must stay configured');

console.log('[phone-photo-mode] OK');
