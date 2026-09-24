const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}
function expect(condition, message) {
  if (!condition) {
    console.error('[companion-contract] ' + message);
    process.exit(1);
  }
}

const app = read('App.js');
const visit = read('VisiteScreen.js');
const phone = read('CompanionPhoneScreen.js');
const tablet = read('CompanionTabletModal.js');
const data = read('companionData.js');
const native = read('native/metra-companion/MetraCompanionModule.kt');
const plugin = read('plugins/withMetraCompanion.js');
const config = read('app.config.js');

expect(app.includes("phoneMode === 'companion'"), 'App.js doit exposer le mode téléphone Compagnon.');
expect(app.includes("phoneMode === 'integral'"), 'App.js doit exposer la version téléphone intégrale.');
expect(visit.includes('CompanionTabletModal') && visit.includes('Téléphone'), 'La visite tablette doit ouvrir l’appairage téléphone.');
expect(tablet.includes('buildCompanionQrPayload') && tablet.includes('startCompanionHost'), 'La tablette doit créer une session locale et un QR.');
expect(phone.includes('decodeCompanionQr') && phone.includes('enqueueCompanionPhoto'), 'Le téléphone doit scanner le QR et conserver les photos avant accusé de réception.');
for (const moduleId of ['equipment','meters','temperatures','locals','distribution','regulation','remarks','controls','photos']) {
  expect(data.includes(`id: '${moduleId}'`), `Module compagnon manquant : ${moduleId}`);
}
expect(data.includes('companion_transfer_'), 'Les transferts photo doivent être idempotents.');
expect(native.includes('ServerSocket') && native.includes('sendFile') && native.includes('GmsBarcodeScanning'), 'Le module Android doit fournir transport local, transfert fichier et scan QR.');
expect(plugin.includes('play-services-code-scanner') && plugin.includes('com.google.zxing:core'), 'Le plugin Android doit embarquer scan et génération QR.');
expect(config.includes('./plugins/withMetraCompanion'), 'Le plugin compagnon doit être activé par la configuration Expo.');

console.log('[companion-contract] OK');
