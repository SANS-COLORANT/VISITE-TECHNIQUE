const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
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

const visit = read('VisiteScreen.js');
// Le Mode Photo s'active pendant la visite (barre d'actions), plus au démarrage.
need(visit, "require('./PhotoPhoneScreen.js')", 'photo mode must open from the visit');
need(visit, 'photoLabel="Mode Photo"', 'visit action bar must expose the photo mode');
need(photo, 'visiteId: visiteInitiale', 'photo mode must open directly on the current visit');
forbid(app, 'PhoneModeChooser', 'phone must start on the full app, no mode chooser');
need(app, "label: 'Compagnon de la tablette'", 'home must expose the companion mode');
need(app, 'compact={phoneIntegralMode}', 'phone home button must use compact mode');

for (const token of [
  'buildCompanionVisitSnapshot',
  'importCompanionPhoto',
  'reconnaitreTexteImageLocale',
  'extraireChampsPlaque',
  'ajouterRemarqueVisite',
  'demarrerDicteeLocale',
  "module.id === 'equipment'",
  "module.id === 'remarks'",
  'Plaque signalétique',
  'Nouvelle remarque',
  'ajouterCompteur',
  'ajouterMateriel',
  'QuickValueRow',
]) need(photo, token, 'photo mode runtime');

need(parser, 'extraireChampsPlaque', 'nameplate parser');
// Lecture automatique des index retirée (docs/DECISION_OCR_COMPTEURS.md) : compteurs et températures = photo + saisie.
forbid(parser, 'extraireValeurOcr', 'meter/temperature OCR parser must stay removed');
forbid(parser, 'extraireIndexCompteur', 'meter index parser must stay removed');
forbid(photo, 'extraireValeurOcr', 'photo mode must not read meter/temperature values');
need(photo, 'const ocrPromise = plaque ?', 'only the nameplate may be read');
forbid(read('PhotoOcrReview.js'), 'extraireValeurOcr', 'review sheet must not read meter/temperature values');
need(read('PhotoOcrReview.js'), "if (kind !== 'plate') {", 'meters/temperatures must skip automatic reading');
forbid(read('missionNativeTools.js'), 'recognizeMeter', 'no native meter reader');
forbid(nativeOcr, 'recognizeMeter', 'no native meter reader');
forbid(missionPlugin, 'MeterOcrProcessor', 'meter OCR sources must not be packaged');
forbid(missionPlugin, 'SevenSegment', 'seven-segment reader must not be packaged');
need(photoButton, 'useWindowDimensions', 'photo button must adapt to phone');
need(photoButton, '<CvcIcon name={hasPhotos ? \'eye\' : \'camera\'}', 'phone photo control must be icon-first');
forbid(photoButton, '📷 Photo', 'legacy emoji photo label must be removed');
forbid(photoButton, '📷 Reprendre', 'legacy emoji retake label must be removed');

for (const icon of ["key === 'home'", "key === 'plate'", "key === 'microphone'", "key === 'trash'"]) {
  need(icons, icon, 'vector icon family');
}

need(missionPlugin, "com.google.mlkit:text-recognition:16.0.1", 'offline ML Kit OCR must remain bundled');
need(nativeOcr, 'TextRecognition.getClient', 'native OCR must stay local');
need(nativeOcr, 'TextRecognizerOptions.DEFAULT_OPTIONS', 'latin OCR model must stay configured');

console.log('[phone-photo-mode] OK');
