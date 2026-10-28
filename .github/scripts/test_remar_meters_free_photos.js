/**
 * Runtime regression tests for REMAR meters and free photo privacy.
 * Node 24 built-in SQLite runs the real additive migration and production
 * caption/visibility/outbox functions. No network or tablet is required.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
let checks = 0;
function ok(condition, label) {
  assert.ok(condition, label);
  checks++;
  console.log('OK ' + checks + ': ' + label);
}
function load(file, dependencies, names) {
  const code = read(file)
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/export\s*\{[^}]+\};?/g, '')
    .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g, '');
  return new Function(...Object.keys(dependencies), code + '\nreturn {' + names.join(',') + '};')(...Object.values(dependencies));
}
async function run() {
  const mapper = load('releveMultiligne.js', { pictoTemperature: () => ({}) },
    ['lignesReleve', 'compteursDepuisCellule', 'formaterReleves']);
  const rawCell = 'Gaz chaudière A : 12 345,6 m³\n\nGaz chaudière B : 987 m³\r\n';
  const parsed = mapper.compteursDepuisCellule({
    base: 'Compteur Gaz', destination: 'Compteur Gaz (m³)', unite: 'm³', texte: rawCell,
  });
  ok(parsed.length === 2, 'blank lines in REMAR meter cell do not create empty meters');
  ok(parsed[0].label === 'Gaz chaudière A' && parsed[1].label === 'Gaz chaudière B',
    'each new line restores its own meter label');
  ok(parsed.every((p) => p.destination === 'Compteur Gaz (m³)'),
    'all imported meters retain the same Excel/Intranet destination');
  ok(mapper.formaterReleves(parsed) === 'Gaz chaudière A : 12345,6 m³\nGaz chaudière B : 987 m³',
    'two REMAR meter readings share a single newline-separated export cell');
  const legacy = mapper.compteursDepuisCellule({
    base: 'Compteur Gaz', destination: 'Compteur Gaz (m³)', unite: 'm³', texte: '52',
  });
  ok(legacy.length === 1 && legacy[0].valeur === '52', 'single historic meter remains readable');

  const importExcel = read('excelImport.js'), exportExcel = read('excelExport.js');
  const intranet = read('intranetVisitPayload.js'), apiLatest = read('apiLatestVisitFieldEnrichmentDb.js');
  ok(importExcel.includes("mapping.panelId === 'p-remar-releves' && mapping.section === 'Compteur'"),
    'native Excel import recognizes REMAR meter cells');
  ok(exportExcel.includes("m.panelId === 'p-remar-releves' && m.section === 'Compteur'") &&
    exportExcel.includes('formaterReleves(liste, { avecNomSeul: true })'),
    'native Excel export groups multiple REMAR meters in original mapped cell');
  // L'export Intranet est maintenant commun aux trames déclarant la capacité
  // compteur ; la conservation de l'ancien champ REMAR reste obligatoire.
  ok(intranet.includes("const manualFallback = !candidate.specialPanel || candidate.panelId === 'p-remar-releves' || /^pression\\b/.test(candidate.key)") &&
    intranet.includes('counterValue(counters, criterion, candidate)') &&
    intranet.includes("counter.status === 'missing' && manualFallback"),
    'Intranet preserves historical REMAR fallback ONLY when a current meter is unavailable');
  ok(apiLatest.includes('compteursDepuisCellule') && apiLatest.includes('totalLines: readings.length'),
    'Intranet multiline import creates independent provenance-linked meter rows');

  const api = load('apiVisitPreparationDb.js', {}, ['mapRemoteTrameToLocal']);
  ok(api.mapRemoteTrameToLocal({ nom: 'TRAME REMAR' }) === 'remar_v1',
    'Intranet reference explicitly recognizes TRAME REMAR instead of defaulting to ICPE');
  ok(api.mapRemoteTrameToLocal({ nom: 'TRAME REMAR CLASSIQUE' }) === 'remar_v1',
    'historic REMAR server label is mapped conservatively');
  ok(api.mapRemoteTrameToLocal({ nom: 'ICPE Chaufferie' }) === 'icpe_v1' &&
    api.mapRemoteTrameToLocal({ nom: 'Réseau de chaleur' }) === 'reseau_chaleur_v1',
    'ICPE and RCU Intranet families remain isolated');


  // Real migration from the previous photo schema: previously general photos
  // are made private even if their photo was already queued for upload.
  const sql = new DatabaseSync(':memory:');
  sql.exec("PRAGMA foreign_keys=ON");
  sql.exec("CREATE TABLE photos(id TEXT PRIMARY KEY,visite_id TEXT,entite_key TEXT,uri TEXT,label TEXT,cree_le TEXT DEFAULT (datetime('now')))");
  sql.exec("CREATE TABLE visites(id TEXT PRIMARY KEY,trame_id TEXT)");
  sql.exec("CREATE TABLE provenances(entite_type TEXT,entite_id TEXT,origine TEXT,details_json TEXT,importe_le TEXT)");
  sql.exec("CREATE TABLE api_visit_outbox(visite_id TEXT PRIMARY KEY,remote_client_id TEXT,remote_visit_id TEXT,status TEXT)");
  sql.exec("CREATE TABLE api_visit_photo_outbox(photo_id TEXT PRIMARY KEY,visite_id TEXT,envoi_photo_id TEXT,remote_client_id TEXT,remote_visit_id TEXT,uri TEXT,description TEXT,ordre INTEGER,grand_format INTEGER,categorie_id TEXT,sous_categorie_id TEXT,critere_id TEXT,status TEXT,attempt_count INTEGER DEFAULT 0,next_attempt_at TEXT,queued_at TEXT DEFAULT (datetime('now')),updated_at TEXT DEFAULT (datetime('now')),error_code TEXT,error_message TEXT)");
  sql.exec("INSERT INTO visites(id,trame_id) VALUES('visit','remar_v1')");
  sql.exec("INSERT INTO api_visit_outbox(visite_id,remote_client_id,remote_visit_id,status) VALUES('visit','11','200','synced')");
  for (const [id, key, label] of [
    ['free-private', null, 'Libre||camera.jpg'],
    ['free-synced', null, 'Ancienne libre'],
    ['linked', 'controle||Pompe', 'Pompe||archive.jpg'],
    ['free-optin', null, 'À intégrer'],
  ]) sql.prepare('INSERT INTO photos(id,visite_id,entite_key,uri,label) VALUES(?,?,?,?,?)')
    .run(id, 'visit', key, 'file:///' + id + '.jpg', label);
  sql.exec("INSERT INTO api_visit_photo_outbox(photo_id,visite_id,status,description,uri) VALUES('free-private','visit','pending','Libre','file:///free-private.jpg')");
  sql.exec("INSERT INTO api_visit_photo_outbox(photo_id,visite_id,status,description,uri) VALUES('free-synced','visit','synced','Ancienne libre','file:///free-synced.jpg')");
  sql.exec("INSERT INTO api_visit_photo_outbox(photo_id,visite_id,status,description,uri) VALUES('linked','visit','pending','Pompe','file:///linked.jpg')");

  const migration = read('database/migrations/048_photo_local_visibility.js').split(String.fromCharCode(96))[1];
  sql.exec(migration);
  const flags = sql.prepare('SELECT id,inclure_export FROM photos ORDER BY id').all();
  ok(flags.filter((p) => p.id.startsWith('free-')).every((p) => p.inclure_export === 0),
    'migration makes ALL historical free photos local-only');
  ok(flags.find((p) => p.id === 'linked').inclure_export === 1,
    'migration preserves export of equipment/control photos');
  ok(sql.prepare("SELECT COUNT(*) n FROM api_visit_photo_outbox WHERE photo_id='free-private'").get().n === 0,
    'migration deletes a previously queued but unsent private photo upload');
  ok(sql.prepare("SELECT COUNT(*) n FROM api_visit_photo_outbox WHERE photo_id='free-synced'").get().n === 1,
    'migration preserves server upload history without erasing evidence');

  const policy = load('photoExportPolicy.js', {}, ['estPhotoLibre', 'photoIncluseDansExports', 'photoLabelAvecNomFichier', 'legendePhotoEditable']);
  const local = sql.prepare("SELECT * FROM photos WHERE id='free-private'").get();
  ok(!policy.photoIncluseDansExports(local) && policy.estPhotoLibre(local),
    'free photo is excluded from both report and upload by default');
  ok(!policy.photoIncluseDansExports({ entite_key: null }) &&
    policy.photoIncluseDansExports({ entite_key: 'controle||Pompe' }),
    'photos without metadata fail closed while linked photos retain legacy behavior');

  const db = {
    getFirstAsync: async (query, args = []) => sql.prepare(query).get(...args) || null,
    getAllAsync: async (query, args = []) => sql.prepare(query).all(...args),
    runAsync: async (query, args = []) => sql.prepare(query).run(...args),
  };
  const repository = load('photoDb.js', {
    openAppDatabase: async () => db,
    require: (name) => {
      if (name === './photoExportPolicy.js') return policy;
      throw new Error('Unexpected require: ' + name);
    },
  }, ['renommerPhotoVisite', 'reglerPublicationPhotoLibre']);

  const renamed = await repository.renommerPhotoVisite('visit', 'linked', 'Nouvelle légende terrain');
  ok(renamed.label === 'Nouvelle légende terrain||archive.jpg',
    'renaming preserves physical photo filename metadata');
  ok(sql.prepare("SELECT libelle_personnalise FROM photos WHERE id='linked'").get().libelle_personnalise === 1,
    'an explicitly edited caption is identified without reinterpreting historic photo captions');
  ok(sql.prepare("SELECT libelle_personnalise FROM photos WHERE id='free-optin'").get().libelle_personnalise === 0,
    'unedited photo labels remain historically consistent');
  ok(read('reportBuilder.js').includes('Number(photo.libelle_personnalise || 0) === 1'),
    'report only overrides an inferred legacy caption after a real user edit');
  ok(sql.prepare("SELECT description FROM api_visit_photo_outbox WHERE photo_id='linked'").get().description === 'Nouvelle légende terrain',
    'renaming updates queued Intranet caption before upload');
  const labelPrivate = await repository.renommerPhotoVisite('visit', 'free-private', 'Vue générale du local');
  ok(labelPrivate.label.startsWith('Vue générale du local||'),
    'free-photo caption is editable and persists in SQLite');

  await repository.reglerPublicationPhotoLibre('visit', 'free-optin', true);
  ok(sql.prepare("SELECT inclure_export FROM photos WHERE id='free-optin'").get().inclure_export === 1,
    'opt-in allows a free photo to be published');

  const report = read('reportBuilder.js');
  const fnStart = report.indexOf('export function preparerPhotosRapport(');
  const fnEnd = report.indexOf('\nasync function ', fnStart);
  ok(fnStart >= 0 && fnEnd > fnStart, 'report photo selection source exists');
  const prep = new Function('libellePhoto', report.slice(fnStart, fnEnd)
    .replace('export function preparerPhotosRapport', 'function preparerPhotosRapport') +
    '\nreturn preparerPhotosRapport;')((photo) => policy.legendePhotoEditable(photo));
  const selection = prep({ visite: { id: 'visit', site_id: 's', nom_site: 'S' },
    photos: sql.prepare('SELECT * FROM photos ORDER BY id').all() });
  ok(selection.find((p) => p.id === 'free-private').include === false,
    'private photo is not included in the professional PDF/Word report');
  ok(selection.find((p) => p.id === 'free-optin').include === true,
    'the explicitly enabled free photo can appear in the report');
  ok(selection.find((p) => p.id === 'linked').label === 'Nouvelle légende terrain',
    'professional report prefers the photo caption edited in the gallery');
  ok(prep({ visite: { id: 'visit', site_id: 's' }, photos: [local] },
    [{ id: 'free-private', include: true }])[0].include === false,
    'report editor cannot override the persistent private photo policy');

  let remoteRequests = 0, issuedIds = 0;
  const outbox = load('intranetVisitPhotoOutboxDb.js', {
    FileSystem: { getInfoAsync: async () => ({ exists: true, size: 256 }) },
    getDb: async () => db,
    inspectIntranetCriterionCandidate: () => ({ resolved: null }),
    createIntranetUploadId: async () => 'upload-' + ++issuedIds,
    protectedRequest: async () => { remoteRequests++; throw new Error('No network in QA'); },
  }, ['queueMissingVisitPhotos', 'processVisitPhotoOutbox', 'getVisitPhotoUploadSummary']);
  const newQueued = await outbox.queueMissingVisitPhotos('visit');
  ok(newQueued === 1, 'only the explicitly opted-in free photo is newly queued');
  const privateOutbox = sql.prepare("SELECT COUNT(*) n FROM api_visit_photo_outbox WHERE photo_id='free-private'").get();
  ok(privateOutbox.n === 0, 'local-only photo never enters Intranet upload queue');
  const includedOutbox = sql.prepare("SELECT status,description FROM api_visit_photo_outbox WHERE photo_id='free-optin'").get();
  ok(includedOutbox.status === 'pending' && includedOutbox.description === 'À intégrer',
    'included photo queues its edited caption');

  await repository.reglerPublicationPhotoLibre('visit', 'free-optin', false);
  ok(sql.prepare("SELECT COUNT(*) n FROM api_visit_photo_outbox WHERE photo_id='free-optin'").get().n === 0,
    'reverting opt-in removes an untransmitted queued photo');
  await assert.rejects(() => repository.reglerPublicationPhotoLibre('visit', 'linked', false),
    /Seules les photos libres/);
  ok(true, 'linked evidence cannot accidentally be made private through free-photo control');
  await assert.rejects(() => repository.reglerPublicationPhotoLibre('visit', 'free-synced', false),
    /déjà envoyée/);
  ok(true, 'an already-uploaded photo cannot be falsely declared unpublished');

  // Simulate a stale private job left by a previous build: the processor must
  // not issue an HTTP request under any circumstance.
  sql.exec("UPDATE api_visit_photo_outbox SET status='synced' WHERE photo_id='linked'");
  sql.exec("INSERT INTO api_visit_photo_outbox(photo_id,visite_id,status,description,uri) VALUES('free-private','visit','pending','Old','file:///private.jpg')");
  const result = await outbox.processVisitPhotoOutbox({ visiteId: 'visit', limit: 10 });
  ok(result.length === 0 && remoteRequests === 0,
    'Intranet worker cannot send stale queued private photos even after restart');
  ok(read('VisiteScreen.js').includes('photoLabel="Photo libre"') &&
    !read('VisiteScreen.js').includes("require('./PhotoPhoneScreen.js')"),
    'visit bottom bar replaces Mode Photo with a direct Photo libre action');
  ok(read('OptimizedPhotoPanel.js').includes('renommerPhotoVisite') &&
    read('OptimizedPhotoPanel.js').includes('reglerPublicationPhotoLibre'),
    'Photos viewer offers caption editing and explicit per-photo inclusion');

  sql.close();
  console.log('\n' + checks + ' REMAR meters/photo privacy regressions passed with real SQLite.');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
