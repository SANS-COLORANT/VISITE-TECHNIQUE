/** Focused, non-destructive regressions for Pilotage, RCU and numeric UI. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
let checks = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  console.log('OK ' + ++checks + ': ' + message);
}
function read(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }
function load(file, deps, names) {
  const script = read(file)
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/export\s*\{[^}]+\};?/g, '')
    .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g, '');
  return new Function(...Object.keys(deps), script + '\nreturn {' + names.join(',') + '};')(...Object.values(deps));
}
async function run() {
  const mapper = load('apiVisitPreparationDb.js', {}, ['mapRemoteTrameToLocal']).mapRemoteTrameToLocal;
  for (const label of ['TRAME RÉSEAU DE CHALEUR', 'Réseau de chaleur urbain', 'RCU', 'Réseau de chauffage urbain'])
    ok(mapper({ nom: label }) === 'reseau_chaleur_v1', 'RCU mapping: ' + label);
  for (const [label, expected] of [['ICPE Chaufferie', 'icpe_v1'], ['Sous-station', 'icpe_v1'], ['VMC', 'vmc'], ['Pré-allumage', 'pre_allumage'], ['TRAME REMAR', null]])
    ok(mapper({ nom: label }) === expected, 'unrelated mapping unchanged: ' + label);

  const resolver = load('intranetVisitBindingDb.js', { mapRemoteTrameToLocal: mapper }, ['resolveFirstVisitRemoteTrame']).resolveFirstVisitRemoteTrame;
  const rcu = { id: '85', nom: 'TRAME RÉSEAU DE CHALEUR' };
  const icpe = { id: '86', nom: 'ICPE Chaufferie' };
  const catalogue = { trames: [rcu, icpe] };
  const exact = resolver(catalogue, 'reseau_chaleur_v1', rcu.nom);
  ok(exact.remoteTrameId === '85' && exact.matchedBy === 'visit_field', 'exact REMAR-era RCU model selected');
  const different = resolver(catalogue, 'reseau_chaleur_v1', 'Réseau de chaleur');
  ok(different.remoteTrameId === '85' && different.matchedBy === 'unique_family', 'unique RCU server variant matched');
  ok(resolver(catalogue, 'reseau_chaleur_v1').remoteTrameId === '85', 'legacy RCU visit resolved without a name');
  ok(resolver(catalogue, 'icpe_v1', 'ICPE Chaufferie').remoteTrameId === '86', 'ICPE remains mapped to ICPE');
  assert.throws(() => resolver({ trames: [icpe] }, 'reseau_chaleur_v1', 'Réseau de chaleur'), /Aucune trame Intranet/);
  ok(true, 'RCU cannot be sent under an ICPE model');
  assert.throws(() => resolver({ trames: [rcu, { id: '88', nom: 'Réseau de chaleur urbain' }] }, 'reseau_chaleur_v1', 'Réseau de chaleur'), /Aucune trame Intranet/);
  ok(true, 'two RCU templates remain ambiguous and are refused');

  // A deterministic fake enforces the Expo SDK 51 exclusive transaction API.
  // Two Pilotage loads read the same source rows and must write each once.
  let sequence = 0, exclusive = 0, shared = 0;
  let chain = Promise.resolve();
  const reserves = new Map();
  const events = new Map();
  const sources = [
    { id: 'remark-1', visite_id: 'v1', site_id: 'site-1', poste: 'Pompe', prestation: 'À contrôler', date_visite: '2026-10-01' },
    { id: 'remark-2', visite_id: 'v2', site_id: 'site-1', poste: 'Vanne', prestation: 'À réparer', date_visite: '2026-10-02' },
  ];
  const db = {
    getAllAsync: async (sql) => {
      if (sql.includes('FROM remarques r')) return sources.filter((r) => !reserves.has(r.id));
      if (sql.includes('SELECT id FROM sites WHERE client_id=')) return [{ id: 'site-1' }];
      if (sql.includes('FROM reserves_suivi r JOIN sites s')) return [{ site_id: 'site-1', total: reserves.size, ouvertes: reserves.size, levees: 0 }];
      if (sql.includes('FROM equipements e')) return [];
      throw new Error('Unexpected SQL read: ' + sql);
    },
    withTransactionAsync: async () => { shared++; throw new Error('cannot start a transaction within a transaction'); },
    runAsync: async () => { throw new Error('SQL write leaked to shared connection'); },
    getFirstAsync: async () => { throw new Error('SQL read leaked to shared connection'); },
    withExclusiveTransactionAsync: async (callback) => {
      exclusive++;
      const prior = chain;
      let unlock;
      chain = new Promise((resolve) => { unlock = resolve; });
      await prior;
      const tx = {
        runAsync: async (sql, params) => {
          if (sql.includes('INSERT OR IGNORE INTO reserves_suivi')) {
            const reserveId = params[0], remarkId = params[3];
            if (!reserves.has(remarkId)) reserves.set(remarkId, { id: reserveId });
            return;
          }
          if (sql.includes('INSERT INTO historique_reserves')) {
            const reserveId = params[1];
            if (events.has(reserveId)) throw new Error('Duplicate reserve creation event');
            events.set(reserveId, params[0]);
            return;
          }
          throw new Error('Unexpected SQL transaction write: ' + sql);
        },
        getFirstAsync: async (sql, params) => {
          if (sql.includes('SELECT id FROM reserves_suivi')) return reserves.get(params[0]) || null;
          throw new Error('Unexpected SQL transaction read: ' + sql);
        },
      };
      try { return await callback(tx); } finally { unlock(); }
    },
  };
  const pilotage = load('patrimoineDb.js', { openAppDatabase: async () => db, createId: () => 'test-id-' + ++sequence }, ['getStatsSitesPatrimoine']).getStatsSitesPatrimoine;
  const [first, second] = await Promise.all([pilotage('client-1'), pilotage('client-1')]);
  ok(exclusive === 2 && shared === 0, 'concurrent Pilotage loads use isolated transactions instead of shared BEGIN');
  ok(reserves.size === 2 && events.size === 2, 'both reservations are inserted with one history event each');
  ok(first.get('site-1').reserves.total === 2 && second.get('site-1').reserves.total === 2, 'both Pilotage matrices report all reservations');
  await pilotage('client-1');
  ok(reserves.size === 2 && events.size === 2, 'reserve migration remains idempotent');

  const kit = read('VisitKit.js');
  const counters = read('OptimizedRelevesPanel.js');
  const measurements = read('ExtraMeasurementCard.js');
  const regulation = read('OptimizedRegulationPanel.js');
  const fields = read('DurableChampGenerique.js');
  ok(/compactNumber\s*=\s*false/.test(kit) && /tileValueCompact:[^\n]*fontSize: 16/.test(kit), 'narrow numeric tiles use opt-in 16-point text');
  ok(/maxFontSizeMultiplier=\{compactNumber \? 1\.25 : undefined\}/.test(kit), 'font scaling of regular tiles stays unchanged');
  ok(/cptInput:[\s\S]{0,200}fontSize: 16/.test(counters) && /maxFontSizeMultiplier=\{1\.25\}/.test(counters), 'meter index input has a compact font');
  ok((measurements.match(/<ValueTile compactNumber/g) || []).length === 2, 'temperature and supplemental measurements use compact tiles');
  ok((regulation.match(/<ValueTile compactNumber/g) || []).length === 3, 'regulation numeric tiles use the same display adjustment');
  ok(fields.includes('<ValueTile compactNumber label={libelleCourt}'), 'generic compact numeric controls use the adjustment');
  ok(kit.includes('tileBtn: { width: 40, height: 40'), 'temperature stepper touch targets remain 40 pixels');
  console.log('\n' + checks + ' targeted regression checks passed.');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
