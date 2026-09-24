const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function loadOfflineQrModule() {
  const file = path.join(ROOT, 'companionOfflineQr.js');
  let source = fs.readFileSync(file, 'utf8');
  source = source.replace(
    /export\s*\{([\s\S]*?)\};\s*$/,
    (_match, names) => 'module.exports = {' + names + '};'
  );
  const module = { exports: {} };
  const fn = new Function('module', 'exports', 'require', '__filename', '__dirname', source);
  fn(module, module.exports, require, file, path.dirname(file));
  return module.exports;
}

function expect(condition, message) {
  if (!condition) throw new Error('[companion-offline-qr] ' + message);
}

const {
  OFFLINE_CLIENT_PREFIX,
  buildOfflineClientQrBatch,
  decodeOfflineClientQrFrame,
  mergeOfflineClientQrFrames,
} = loadOfflineQrModule();

function visit(siteIndex, visitIndex) {
  return {
    id: `visit-${siteIndex}-${visitIndex}`,
    installationId: `local-${siteIndex}-${visitIndex % 2}`,
    date: `2026-09-${String((visitIndex % 25) + 1).padStart(2, '0')}`,
    status: visitIndex % 3 ? 'terminee' : 'en_cours',
    template: visitIndex % 2 ? 'vmc' : 'icpe_v1',
    progress: (visitIndex * 17) % 101,
    local: `Sous-station ${visitIndex % 2 + 1}`,
  };
}

function site(index, visits = 2, locals = 2) {
  return {
    id: `site-${index}`,
    name: `Résidence Énergie ${index}`,
    address: `${index} avenue des Érables, 750${String(index % 20).padStart(2, '0')} Paris`,
    locals: Array.from({ length: locals }, (_, i) => ({
      id: `local-${index}-${i}`,
      name: `Chaufferie n°${i + 1}`,
      type: i ? 'sous_station' : 'chaufferie',
    })),
    visits: Array.from({ length: visits }, (_, i) => visit(index, i)),
  };
}

const snapshot = {
  type: 'clientSnapshot',
  client: { id: 'client-énergie', name: 'Bailleur Énergie & Services', code: 'E&S-01', address: '12 rue de l’Énergie' },
  sites: Array.from({ length: 36 }, (_, i) => site(i + 1)),
};

const maxChars = 1100;
const batch = buildOfflineClientQrBatch(snapshot, { maxFrameChars: maxChars });
expect(batch.totalSites === 36, 'le nombre de sites doit être conservé');
expect(batch.totalFrames > 1, 'le client doit être découpé en plusieurs QR');
expect(batch.frames.every((frame) => frame.payload.startsWith(OFFLINE_CLIENT_PREFIX)), 'chaque trame doit porter le préfixe METRA');
expect(batch.frames.every((frame) => frame.payload.length <= maxChars), 'chaque QR doit rester sous la taille cible');
expect(batch.frames.every((frame) => frame.title === `QR ${frame.index}/${frame.total}`), 'la pagination QR x/y doit être stable');
expect(batch.frames.some((frame) => frame.description.includes('Résidence Énergie')), 'les QR doivent décrire les sites contenus');

const decoded = decodeOfflineClientQrFrame(batch.frames[0].payload);
expect(decoded.b === batch.batchId && decoded.i === 1 && decoded.n === batch.totalFrames, 'le QR doit conserver lot/index/total');

const halfway = Math.max(1, Math.floor(batch.frames.length / 2));
const partial = mergeOfflineClientQrFrames(batch.frames.slice(0, halfway).map((frame) => frame.payload));
expect(partial.offlineProgress.scanned === halfway, 'la progression partielle doit compter les QR reçus');
expect(!partial.offlineProgress.complete, 'un lot partiel ne doit jamais être marqué complet');
expect(partial.counts.sites > 0 && partial.counts.sites <= 36, 'les sites déjà reçus doivent rester consultables');

const reversed = mergeOfflineClientQrFrames(batch.frames.slice().reverse().map((frame) => frame.payload));
expect(reversed.offlineProgress.complete, 'le lot doit être reconstituable dans n’importe quel ordre');
expect(reversed.counts.sites === 36, 'tous les sites doivent être reconstitués');
expect(new Set(reversed.sites.map((item) => item.id)).size === 36, 'aucun site ne doit être dupliqué');

const duplicate = mergeOfflineClientQrFrames([
  batch.frames[0].payload,
  batch.frames[0].payload,
  ...batch.frames.slice(1).map((frame) => frame.payload),
]);
expect(duplicate.counts.sites === 36, 'rescanner un QR ne doit pas dupliquer les sites');
expect(duplicate.offlineProgress.scanned === batch.totalFrames, 'la progression doit compter les numéros de QR uniques');

const hugeSnapshot = {
  type: 'clientSnapshot',
  client: { id: 'huge-client', name: 'Client grand patrimoine', code: '', address: '' },
  sites: [site(999, 75, 30)],
};
const hugeBatch = buildOfflineClientQrBatch(hugeSnapshot, { maxFrameChars: 1200 });
expect(hugeBatch.totalFrames > 1, 'un site très riche doit pouvoir être fragmenté');
const hugeMerged = mergeOfflineClientQrFrames(hugeBatch.frames.map((frame) => frame.payload));
expect(hugeMerged.counts.sites === 1, 'les fragments d’un même site doivent être fusionnés');
expect(hugeMerged.sites[0].locals.length === 30, 'tous les locaux du site fragmenté doivent revenir');
expect(hugeMerged.sites[0].visits.length === 75, 'toutes les références de visite doivent revenir');

const fieldReadySnapshot = {
  ...snapshot,
  offlineVisitSnapshots: {
    'visit-1-0': {
      version: 1,
      type: 'visitSnapshot',
      visit: { id: 'visit-1-0', siteId: 'site-1', client: 'Bailleur Énergie & Services', site: 'Résidence Énergie 1', date: '2026-09-01', template: 'icpe_v1' },
      modules: [
        {
          id: 'equipment',
          label: 'Équipements',
          icon: 'tools',
          count: 2,
          targets: [
            { id: 'eq-1', label: 'Chaudière 1', targetKey: 'equipement||eq-1' },
            { id: 'eq-2', label: 'Pompe primaire', targetKey: 'equipement||eq-2' },
          ],
        },
        {
          id: 'meters',
          label: 'Compteurs',
          icon: 'meter',
          count: 1,
          targets: [{ id: 'm-1', label: 'Compteur gaz', targetKey: 'compteur||m-1', value: '12345', unit: 'm3' }],
        },
      ],
      generatedAt: '2026-09-24T20:00:00.000Z',
    },
  },
};
const fieldBatch = buildOfflineClientQrBatch(fieldReadySnapshot, { maxFrameChars: 1100 });
expect(fieldBatch.totalDetailedVisits === 1, 'le lot doit annoncer la visite terrain embarquée');
expect(fieldBatch.frames.some((frame) => frame.visitIds?.includes('visit-1-0')), 'les détails de visite doivent être répartis dans les QR');
const fieldMerged = mergeOfflineClientQrFrames(fieldBatch.frames.map((frame) => frame.payload));
const fieldVisit = fieldMerged.sites.find((item) => item.id === 'site-1')?.visits.find((item) => item.id === 'visit-1-0');
expect(fieldVisit?.offlineReady === true, 'la visite scannée doit devenir ouvrable hors connexion');
expect(fieldVisit?.offlineSnapshot?.modules?.[0]?.targets?.[0]?.targetKey === 'equipement||eq-1', 'les cibles photo de la visite doivent être conservées dans le QR');
expect(fieldMerged.counts.offlineReadyVisits === 1, 'le client doit compter les visites prêtes hors connexion');

const detailFrames = fieldBatch.frames.filter((frame) => frame.visitIds?.includes('visit-1-0'));
const fieldPartialPayloads = fieldBatch.frames
  .filter((frame) => !detailFrames.includes(frame) || frame === detailFrames[0])
  .slice(0, Math.max(1, fieldBatch.frames.length - 1))
  .map((frame) => frame.payload);
const fieldPartial = mergeOfflineClientQrFrames(fieldPartialPayloads);
expect(fieldPartial?.offlineProgress?.complete === false || fieldBatch.totalFrames === 1, 'un lot détail incomplet doit rester reprenable');

const other = buildOfflineClientQrBatch({
  type: 'clientSnapshot',
  client: { id: 'other-client', name: 'Autre client' },
  sites: [site(500)],
}, { maxFrameChars: 1100 });

let mixedRejected = false;
try {
  mergeOfflineClientQrFrames([batch.frames[0].payload, other.frames[0].payload]);
} catch {
  mixedRejected = true;
}
expect(mixedRejected, 'deux lots ou clients différents ne doivent pas être fusionnés');

console.log(
  '[companion-offline-qr] OK —',
  batch.totalSites + ' sites / ' + batch.totalFrames + ' QR,',
  'reprise partielle, ordre libre, déduplication et site fragmenté validés.'
);
