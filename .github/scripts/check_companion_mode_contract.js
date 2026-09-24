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
const clientSites = read('ClientSitesScreen.js');
const phone = read('CompanionPhoneScreen.js');
const tablet = read('CompanionTabletModal.js');
const data = read('companionData.js');
const protocol = read('companionProtocol.js');
const native = read('native/metra-companion/MetraCompanionModule.kt');
const plugin = read('plugins/withMetraCompanion.js');
const config = read('app.config.js');

expect(app.includes("phoneMode === 'companion'"), 'App.js doit exposer le mode téléphone Compagnon.');
expect(app.includes("phoneMode === 'integral'"), 'App.js doit exposer la version téléphone intégrale.');
expect(visit.includes('CompanionTabletModal') && visit.includes('Téléphone'), 'La visite tablette doit ouvrir l’appairage téléphone.');
expect(tablet.includes('buildCompanionQrPayload') && tablet.includes('startCompanionHost'), 'La tablette doit créer une session locale et un QR.');
expect(tablet.includes("scope === 'client'") && tablet.includes('buildCompanionClientSnapshot'), 'Le QR doit pouvoir associer un client complet, pas seulement une visite.');
expect(clientSites.includes('QR client') && clientSites.includes('CompanionTabletModal'), 'La fiche client doit exposer directement le QR Compagnon.');
expect(data.includes('buildCompanionClientSnapshot') && data.includes('assertVisitBelongsToCompanionClient'), 'Le périmètre client doit transmettre les sites/visites et empêcher les rattachements hors client.');
expect(protocol.includes("['scope', scope || 'visit']") && protocol.includes("['v', '2']"), 'Le protocole QR doit transporter explicitement le périmètre client/visite.');
expect(phone.includes('decodeCompanionQr') && phone.includes('enqueueCompanionPhoto'), 'Le téléphone doit scanner le QR et conserver les photos avant accusé de réception.');
expect(phone.includes("message.type === 'clientSnapshot'") && phone.includes("type: 'selectVisit'"), 'Le téléphone doit naviguer Client → Site → Visite sans rescanner.');
expect(phone.includes('withTimeout(') && phone.includes('isCompanionNativeAvailable'), 'Le mode Compagnon ne doit jamais mouliner indéfiniment si le module ou le réseau local est indisponible.');
expect(phone.includes('getRuntimeAccent') && !phone.includes("backgroundColor: '#10384B'"), 'La DA téléphone Compagnon doit suivre le pack visuel actif.');
for (const moduleId of ['equipment','meters','temperatures','locals','distribution','regulation','remarks','controls','photos']) {
  expect(data.includes(`id: '${moduleId}'`), `Module compagnon manquant : ${moduleId}`);
}
expect(data.includes('companion_transfer_'), 'Les transferts photo doivent être idempotents.');
expect(native.includes('ServerSocket') && native.includes('sendFile') && native.includes('GmsBarcodeScanning'), 'Le module Android doit fournir transport local, transfert fichier et scan QR.');
expect(native.includes('InetSocketAddress') && native.includes('5000'), 'La connexion réseau Compagnon doit avoir un délai maximum explicite.');
expect(plugin.includes('play-services-code-scanner') && plugin.includes('com.google.zxing:core'), 'Le plugin Android doit embarquer scan et génération QR.');
expect(config.includes('./plugins/withMetraCompanion'), 'Le plugin compagnon doit être activé par la configuration Expo.');

console.log('[companion-contract] OK');
