const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

const root = path.resolve(__dirname, '../..');
let checks = 0;
function check(condition, label) { assert.ok(condition, label); checks += 1; console.log(`OK ${checks}: ${label}`); }

function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map((m) => m[1]);
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) names.push(...match[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean));
  const script = source
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/export\s*\{[^}]+\};?/g, '')
    .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g, '');
  return new Function(...Object.keys(dependencies), `${script}\nreturn {${[...new Set(names)].join(',')}};`)(...Object.values(dependencies));
}

function databaseProcess(filename) {
  const child = spawn('python3', [path.join(__dirname, 'photo_sqlite_harness.py'), filename], { stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = new Map(); let seq = 0;
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const response = JSON.parse(line), waiter = pending.get(response.id); if (!waiter) return; pending.delete(response.id);
    if (response.error) waiter.reject(new Error(response.error)); else waiter.resolve(response.result);
  });
  const send = (method, sql = '', params = []) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, method, sql, params }) + '\n');
  });
  const db = {
    getAllAsync: (sql, params) => send('all', sql, params),
    getFirstAsync: async (sql, params) => (await send('all', sql, params))[0] || null,
    runAsync: (sql, params) => send('run', sql, params),
    execAsync: (sql) => send('exec', sql),
  };
  return { db, send, close: () => child.stdin.end() };
}

const localTrame = {
  id: 'icpe_v1', version: 1, nom: 'ICPE',
  ui: {
    labels: { 'p-conf-chauffage': 'Conf. Chauffage', 'p-conf-ecs': 'Conf. ECS' },
    panels: {
      'p-conf-chauffage': { 'Disconnection et alimentation eau froide': [
        { cle: 'Type de disconnection', type: 'controle' },
        { cle: "Compteur d'eau: Présence", type: 'controle' },
      ] },
      'p-conf-ecs': { 'Disconnection et alimentation eau froide': [
        { cle: 'Type de disconnection', type: 'controle' },
        { cle: "Compteur d'eau: Présence", type: 'controle' },
      ] },
    },
  },
};
const normaliserSectionCode = (panelId, section) => panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');

async function main() {
  const payload = load('intranetVisitPayload.js', {
    getDb: async () => { throw new Error('not used'); },
    obtenirTrame: () => localTrame,
  });
  const criterion = { id: 305, nom: 'Type de disconnection', avisApplicable: true };
  const heat = payload.inspectIntranetCriterionCandidate('icpe_v1', criterion, 'CONFORMITÉ CHAUFFAGE', 'Disconnection et alimentation eau froide');
  check(heat.resolved?.panelId === 'p-conf-chauffage', 'duplicate disconnection criterion resolves to Chauffage from the remote category');
  check(heat.candidates[0].score > heat.candidates[1].score, 'Chauffage category creates a strict score winner instead of a tie');

  const ecs = payload.inspectIntranetCriterionCandidate('icpe_v1', criterion, 'CONFORMITÉ ECS', 'Disconnection et alimentation eau froide');
  check(ecs.resolved?.panelId === 'p-conf-ecs', 'same duplicate criterion resolves to ECS from the remote category');

  const ambiguous = payload.inspectIntranetCriterionCandidate('icpe_v1', criterion, 'CONFORMITÉ', 'Disconnection et alimentation eau froide');
  check(ambiguous.resolved === null, 'mapping still fails safe when the server category has no Chauffage/ECS discriminator');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-support-dump-'));
  const server = databaseProcess(path.join(dir, 'dump.db'));
  try {
    await server.send('migrate', '', [0, 35]);
    await server.db.execAsync(`
      INSERT INTO clients(id,nom) VALUES('client-local','Client support');
      INSERT INTO sites(id,client_id,nom_site) VALUES('site-local','client-local','Site support');
      INSERT INTO installations(id,site_id,type_code,nom) VALUES('installation-local','site-local','installation_technique','Chaufferie support');
      INSERT INTO visites(id,site_id,installation_id,date_visite,statut,trame_id,api_remote_local_id,api_remote_client_id,api_remote_trame_id)
        VALUES('visit-local','site-local','installation-local','2026-09-11','terminee','icpe_v1','501','12','3');
      INSERT INTO api_client_links(remote_client_id,local_client_id,nom,payload_json) VALUES('12','client-local','Client support','{}');
      INSERT INTO api_site_links(remote_site_id,remote_client_id,local_site_id,nom,payload_json) VALUES('45','12','site-local','Site support','{}');
      INSERT INTO api_client_site_links(remote_client_id,remote_site_id,local_site_id) VALUES('12','45','site-local');
      INSERT INTO api_local_links(remote_local_id,remote_site_id,local_installation_id,designation,remote_trame_id,remote_trame_nom,reference_json)
        VALUES('501','45','installation-local','Chaufferie support','3','ICPE','{"local":{"id":501},"trame":{"id":3,"categories":[{"id":10,"nom":"CONFORMITÉ CHAUFFAGE"}]},"private_key":"do-not-export"}');
      INSERT INTO api_preparation_cache(remote_client_id,payload_json) VALUES('12','{"client":{"id":12},"access_token":"do-not-export","sites":[{"site":{"id":45},"locaux":[]}]}');
      INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json)
        VALUES('prov','visite','visit-local','api_symfony','501','{"authorization":"DPoP do-not-export","remoteCategoryId":"10"}');
    `);
    const support = load('supportDump.js', {
      FileSystem: {}, Sharing: {}, getDb: async () => server.db, DATABASE_SCHEMA_VERSION: 35,
      listerTramesDisponibles: () => [localTrame], normaliserSectionCode,
    });
    const dump = await support.construireSupportDump();
    check(dump.format === 'metra-support-dump' && dump.schemaVersion === 35, 'support dump carries an explicit format and schema version');
    check(dump.intranet.preparations[0].payload_json.access_token === '[REDACTED]', 'access token-like preparation field is redacted recursively');
    check(dump.intranet.locals[0].reference_json.private_key === '[REDACTED]', 'private key-like local reference field is redacted recursively');
    check(dump.linkedVisitData.provenance[0].details_json.authorization === '[REDACTED]', 'Authorization-like provenance field is redacted recursively');
    check(dump.intranet.preparations[0].payload_json.client.id === 12, 'non-sensitive Intranet preparation structure remains available for diagnosis');
    check(dump.localTrames[0].panels.some((panel) => panel.panelId === 'p-conf-chauffage'), 'dump contains the local trame field catalogue used for mapping comparison');
    check(dump.privacy.containsPhotos === false && dump.privacy.credentialsIncluded === false, 'dump explicitly excludes photos and credentials');
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }

  const settings = fs.readFileSync(path.join(root, 'ParametresScreen.js'), 'utf8');
  const dumpSource = fs.readFileSync(path.join(root, 'supportDump.js'), 'utf8');
  check(settings.includes('onLongPress={deverrouillerSupport}') && settings.includes('Exporter le DUMP support'), 'support dump is hidden behind a long press in Settings > Data');
  check(!dumpSource.includes("from './symfonyApi.js'") && !dumpSource.includes('SecureStore'), 'dump implementation never imports authentication storage or transport secrets');

  console.log(`\n${checks} mapping/support dump checks passed.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });