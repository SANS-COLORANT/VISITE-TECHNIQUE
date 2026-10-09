/**
 * Non-régression : destination d'export des compteurs (migration 045).
 *
 * 1. Excel ICPE et Réseau de chaleur générés avec les VRAIS modèles : pour des
 *    compteurs historiques (sans destination), le classeur produit est
 *    identique cellule par cellule à celui du code d'avant la migration
 *    (fichier de référence passé en argument, sinon la version Git HEAD~).
 * 2. Un compteur renommé portant une destination reste exporté sur sa ligne ;
 *    « supplementaire » n'est jamais écrit dans la trame.
 * 3. Intranet : correspondance par destination, ambiguïté toujours bloquante.
 * 4. SQLite réel : migration 045 additive, reprise de visite conservant la
 *    destination.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const readline = require('node:readline');
const root = path.resolve(__dirname, '../..');
let checks = 0;
function check(condition, label) { assert.ok(condition, label); checks += 1; console.log(`OK ${checks}: ${label}`); }

function loadSource(source, dependencies = {}) {
  const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map((m) => m[1]);
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) names.push(...match[1].split(',').map((s) => s.trim()).filter(Boolean));
  const script = source.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/export\s*\{[^}]+\};?/g, '').replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g, '');
  return new Function(...Object.keys(dependencies), `${script}\nreturn {${[...new Set(names)].join(',')}};`)(...Object.values(dependencies));
}
const load = (file, deps) => loadSource(fs.readFileSync(path.join(root, file), 'utf8'), deps);

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `fonction ${name} introuvable`);
  let depth = 0; let i = source.indexOf('{', start);
  for (; i < source.length; i += 1) { if (source[i] === '{') depth += 1; else if (source[i] === '}') { depth -= 1; if (depth === 0) break; } }
  return source.slice(start, i + 1);
}

function databaseProcess(filename) {
  const child = spawn(process.env.PYTHON || 'python3', [path.join(__dirname, 'photo_sqlite_harness.py'), filename]);
  const pending = new Map(); let seq = 0;
  child.stderr.pipe(process.stderr);
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const response = JSON.parse(line); const waiter = pending.get(response.id); pending.delete(response.id);
    if (response.error) waiter.reject(new Error(response.error)); else waiter.resolve(response.result);
  });
  const send = (method, sql = '', params = []) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, method, sql, params }) + '\n');
  });
  const db = { getAllAsync: (sql, params) => send('all', sql, params), getFirstAsync: async (sql, params) => (await send('all', sql, params))[0] || null,
    runAsync: (sql, params) => send('run', sql, params), execAsync: (sql) => send('exec', sql) };
  return { db, send, close: () => new Promise((resolve) => { child.once('exit', resolve); child.stdin.end(); }) };
}

// Référence « avant 045 » : fichier passé en argument ou révision Git
// (METER_BASELINE_REF). En CI (clone partiel) elle peut manquer : les
// comparaisons avec l'ancien code sont alors remplacées par des valeurs figées.
function baselineExcelSource() {
  const fromArg = process.argv[2];
  if (fromArg) return fs.readFileSync(fromArg, 'utf8');
  try { return execFileSync('git', ['show', `${process.env.METER_BASELINE_REF || 'ef7e15b'}:excelExport.js`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (_) { return null; }
}

async function main() {
  const XLSX = require('xlsx');
  const data = load('data.js');
  const { TEMPLATE_EXCEL_BASE64 } = load('templateExcel.js');
  const { TEMPLATE_RESEAU_CHALEUR_BASE64 } = load('templateExcelReseauChaleur.js');
  const rcu = load('reseauChaleurTrame.js', { TRAME_DATA: data.TRAME_DATA, TEMPLATE_RESEAU_CHALEUR_BASE64 });
  const registry = load('trameRegistry.js', { ...data, ...rcu, TEMPLATE_EXCEL_BASE64,
    ...load('vmcTrame.js', { XLSX }), ...load('preAllumageTrame.js', { XLSX }), ...load('trameValidation.js') });

  function exporter(source) {
    let state = { trameId: 'icpe_v1', compteurs: [] };
    const deps = { ...load('releveMultiligne.js', { pictoTemperature: load('relevePictos.js').pictoTemperature }), XLSX, FileSystem: {}, Sharing: {}, obtenirTrame: registry.obtenirTrame, DEFAULT_TRAME_ID: 'icpe_v1',
      getDb: async () => ({ getAllAsync: async (sql) => sql.includes('champs_visite') ? state.fields || [] : sql.includes('points_mesure_visite') ? state.points || [] : [], getFirstAsync: async () => null }),
      getVisite: async () => ({ id: 'v', trame_id: state.trameId, nom_client: 'Client', nom_site: 'Site', adresse: 'Adresse', date_visite: '2026-10-06' }),
      listerReseaux: async () => [], listerMateriel: async () => [], listerRemarques: async () => [],
      listerCompteurs: async () => state.compteurs, getNote: async () => null,
      libelleChamp: (x) => x, libelleSection: (x) => x, listerAliasesPreAllumage: async () => ({}), chargerPreAllumageModulaire: async () => null,
      creerFichierSaf: async () => null, dossierVisiteMetra: async () => null };
    const mod = loadSource(source, deps);
    return async (trameId, compteurs, fields = [], points = []) => {
      state = { trameId, compteurs, fields, points };
      const { wb, trame } = await mod.construireClasseur('v');
      const sheet = wb.Sheets[trame.excel.mainSheet];
      const values = {};
      for (const [ref, cell] of Object.entries(sheet)) if (!ref.startsWith('!')) values[ref] = cell?.v;
      return { values, sheet, annex: wb.Sheets.MESURES_COMPLEMENTAIRES };
    };
  }
  const baseline = baselineExcelSource();
  const avant = baseline ? exporter(baseline) : null;
  if (!avant) console.log('Référence avant 045 indisponible : contrôle par valeurs figées.');
  const apres = exporter(fs.readFileSync(path.join(root, 'excelExport.js'), 'utf8'));
  // Compteurs du même type : un saut de ligne remplace l'ancien séparateur « | ».
  const unifier = (v) => String(v ?? '').replace(/\n/g, ' | ');
  const diff = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => unifier(a[k]) !== unifier(b[k]));

  // Compteurs historiques : libellés réels produits par l'application avant 045.
  const historiques = [
    { label: 'Index compteur(s) gaz(m³)/Cuve fioul', valeur: '418532', unite: 'm³' },
    { label: 'Index compteur énergie', valeur: '2712', unite: 'MWh' },
    { label: 'Index compteur d’appoint eau chauffage', valeur: '1204', unite: 'm³' },
    { label: 'Index compteur alimentation EF ECS', valeur: '8377', unite: 'm³' },
    { label: 'Compteur gaz', valeur: '1', unite: 'm³' }, { label: 'Compteur énergie chauffage', valeur: '2', unite: 'MWh' },
    { label: 'Compteur eau appoint chauffage', valeur: '3', unite: 'm³' }, { label: 'Compteur eau froide ECS', valeur: '4', unite: 'm³' },
    { label: 'Compteur électrique', valeur: '5', unite: 'kWh' }, { label: 'Compteur fioul', valeur: '6', unite: 'L' },
    { label: 'Manomètre chauffage', valeur: '1,8', unite: 'bar' }, { label: 'Manomètre ECS', valeur: '3', unite: 'bar' },
    { label: 'Compteur volumétrique', valeur: '7', unite: 'm³' }, { label: 'Sans correspondance', valeur: '9', unite: '' },
  ];
  // Valeurs figées produites par le code d'avant 045 (build 650) pour ces compteurs.
  const FIGE_ICPE = {
    C134: 'Index compteur(s) gaz(m³)/Cuve fioul : 418532 m³\nCompteur gaz : 1 m³\nCompteur fioul : 6 L',
    C135: 'Index compteur énergie : 2712 MWh\nCompteur énergie chauffage : 2 MWh\nCompteur électrique : 5 kWh',
    C136: 'Index compteur d’appoint eau chauffage : 1204 m³\nCompteur eau appoint chauffage : 3 m³',
    C137: 'Index compteur alimentation EF ECS : 8377 m³\nCompteur eau froide ECS : 4 m³\nCompteur volumétrique : 7 m³',
    C138: 'Manomètre chauffage : 1,8 bar', C139: 'Manomètre ECS : 3 bar',
  };
  const icpeHisto = await apres('icpe_v1', historiques);
  check(Object.entries(FIGE_ICPE).every(([ref, v]) => icpeHisto.values[ref] === v), 'ICPE : compteurs historiques sur leurs lignes habituelles (valeurs du build 650)');
  const rcuHisto = await apres('reseau_chaleur_v1', historiques);
  check(rcuHisto.values.C60 === '418532 m³' && rcuHisto.values.C61 === '2712 MWh' && rcuHisto.values.C62 === '1204 m³' && rcuHisto.values.C63 === '8377 m³', 'Réseau de chaleur : compteurs historiques sur leurs lignes habituelles');
  if (avant) {
    for (const trameId of ['icpe_v1', 'reseau_chaleur_v1']) {
      const a = await avant(trameId, historiques); const b = await apres(trameId, historiques);
      check(diff(a.values, b.values).length === 0, `${trameId} : compteurs historiques, classeur identique cellule par cellule à l'ancien code`);
      check(diff((await avant(trameId, [])).values, (await apres(trameId, [])).values).length === 0, `${trameId} : visite sans compteur, classeur identique`);
    }
    const reseauAvant = await avant('icpe_v1', [{ label: 'Compteur appoint réseau', valeur: '55', unite: 'm³' }]);
    check(String(reseauAvant.values.C137 || '').includes('55'), 'ancien code : « réseau » envoyé à tort sur EF ECS (bug reproduit)');
  }
  check(!(await apres('icpe_v1', [{ label: 'Compteur appoint réseau', valeur: '55', unite: 'm³' }])).values.C137, 'nouveau code : « réseau » n’est plus envoyé sur EF ECS');

  const GAZ = 'Index compteur(s) gaz(m³)/Cuve fioul (litres ou %)';
  const NRJ = 'Index compteur énergie (MWh)';
  const renommes = [
    { label: 'Chaudière 1', valeur: '419816', unite: 'm³', destination: GAZ },
    { label: 'Sous-station bât. B', valeur: '2841', unite: 'MWh', destination: NRJ },
    { label: 'Compteur gaz cuisine', valeur: '12', unite: 'm³', destination: 'supplementaire' },
  ];
  const icpe = await apres('icpe_v1', renommes);
  if (avant) check(!String((await avant('icpe_v1', renommes)).values.C134 || '').includes('419816'), 'ancien code : compteur renommé « Chaudière 1 » perdu (bug reproduit)');
  check(icpe.values.C134 === 'Chaudière 1 : 419816 m³', 'ICPE : compteur renommé exporté sur sa ligne gaz (C134)');
  check(icpe.values.C135 === 'Sous-station bât. B : 2841 MWh', 'ICPE : compteur renommé exporté sur sa ligne énergie (C135)');
  check(!Object.values(icpe.values).some((v) => String(v).includes('cuisine')), 'ICPE : compteur supplémentaire jamais écrit dans la trame, même si son nom contient « gaz »');
  const rcuApres = await apres('reseau_chaleur_v1', renommes);
  check(rcuApres.values.C60 === '419816 m³' && rcuApres.values.E60 === '419816 m³', 'Réseau de chaleur : compteur renommé exporté sur C60/E60');
  check(rcuApres.values.C61 === '2841 MWh', 'Réseau de chaleur : destination énergie respectée');
  const ecrites = diff((await apres('icpe_v1', [])).values, icpe.values).filter((k) => !['C134', 'C135'].includes(k));
  check(ecrites.length === 0, 'ICPE : aucune autre cellule touchée par les destinations');
  const PRESSION = 'Pression réseau de chauffage (bar)';
  const pressionMapping = registry.obtenirTrame('reseau_chaleur_v1').excel.fieldMappings.find((m) => m.cle === PRESSION);
  check((await apres('reseau_chaleur_v1', [{ label: 'Manomètre primaire', valeur: '1,8', unite: 'bar', destination: PRESSION }])).values[pressionMapping.valueCell] === '1,8 bar', 'RCU : destination pression exportée');
  const multiples = await apres('reseau_chaleur_v1', [{ label: 'A', valeur: '1', destination: GAZ }, { label: 'B', valeur: '2', destination: GAZ }]);
  check(multiples.values.C60 === 'A : 1\nB : 2', 'RCU : tous les compteurs d’une destination sont conservés dans Excel');
  check(!(await apres('icpe_v1', [{ label: 'Compteur gaz', valeur: '666', destination: 'inconnue' }])).values.C134, 'destination inconnue : aucun repli vers un libellé trompeur');
  for (const trameId of ['icpe_v1', 'reseau_chaleur_v1']) {
    const mapping = registry.obtenirTrame(trameId).excel.fieldMappings.find((m) => m.cle === GAZ);
    const fields = [{ section_code: mapping.sectionCode, cle: GAZ, valeur: 'ANCIEN INDEX' }];
    for (const counter of [{ label: 'Compteur gaz', valeur: '', destination: GAZ }, { label: 'Compteur gaz', valeur: '12', destination: 'supplementaire' }]) {
      check(!(await apres(trameId, [counter], fields)).values[mapping.valueCell], `${trameId} : ancien index importé absent après effacement ou réaffectation`);
    }
  }
  const meterHelpers = load('meterDestinations.js');
  check(Number.isNaN(meterHelpers.nombreIndex('9'.repeat(400))), 'index non fini refusé');
  const withPoint=await apres('reseau_chaleur_v1',[],[],[{libelle:'Primaire · départ',valeur:'72',unite:'°C'}]);
  check(withPoint.annex?.A2?.v==='Primaire · départ' && withPoint.annex?.B2?.v==='72', 'mesure complémentaire conservée dans une annexe Excel');
  check(diff(withPoint.values,(await apres('reseau_chaleur_v1',[])).values).length===0, 'annexe mesures : aucune cellule standard modifiée');

  // Intranet : fonctions de production extraites de intranetVisitPayload.js.
  const payloadSource = fs.readFileSync(path.join(root, 'intranetVisitPayload.js'), 'utf8');
  const groupSource = `${fs.readFileSync(path.join(root, 'relevePictos.js'), 'utf8')}\n${fs.readFileSync(path.join(root, 'releveMultiligne.js'), 'utf8').replace(/^import .*$/m, '')}`.replace(/export /g, '');
  const { counterValue } = new Function(`${groupSource}\n${extractFunction(payloadSource, 'clean')}\n${extractFunction(payloadSource, 'normalize')}\n${extractFunction(payloadSource, 'cleanCounterLabel')}\n${extractFunction(payloadSource, 'counterValue')}\nreturn { counterValue };`)();
  const candidate = { cle: GAZ, label: GAZ };
  const criterion = { nom: 'Index compteur(s) gaz(m³)/Cuve fioul (litres ou %)' };
  check(counterValue([{ label: 'Index compteur(s) gaz(m³)/Cuve fioul', valeur: '1' }], criterion, candidate).value === '1', 'Intranet : compteur historique toujours trouvé par son libellé');
  check(counterValue([{ label: 'Chaudière 1', valeur: '419816', destination: GAZ }], criterion, candidate).value === '419816', 'Intranet : compteur renommé trouvé par sa destination');
  check(counterValue([{ label: 'Index compteur(s) gaz(m³)/Cuve fioul', valeur: '1', destination: 'supplementaire' }], criterion, candidate).status === 'missing', 'Intranet : compteur supplémentaire jamais envoyé');
  check(counterValue([{ label: 'A', valeur: '1', unite: 'm³', destination: GAZ }, { label: 'B', valeur: '2', unite: 'm³', destination: GAZ }], criterion, candidate).value === 'A : 1 m³\nB : 2 m³', 'Intranet : deux compteurs du même type sont regroupés dans une cellule, une ligne chacun');
  check(counterValue([{ label: 'Index compteur(s) gaz(m³)/Cuve fioul', valeur: '1', destination: NRJ }], criterion, candidate).status === 'missing', 'Intranet : la destination prime sur un libellé trompeur');
  const criteriaModule = loadSource(payloadSource + '\nexport { buildCriteria };', { obtenirTrame: registry.obtenirTrame, getDb: async () => null });
  const remote = { trame: { categories: [{ id: 1, nom: 'Relevés', sousCategories: [{ id: 2, nom: 'Relevés des compteurs et manomètres', criteres: [{ id: 3, nom: GAZ, avisApplicable: false }, { id: 4, nom: PRESSION, avisApplicable: false }] }] }] } };
  for (const trameId of ['icpe_v1', 'reseau_chaleur_v1']) {
    const issues = [];
    const rows = await criteriaModule.buildCriteria({ getAllAsync: async (sql) => sql.includes('FROM compteurs') ? [renommes[0], { label: 'Primaire', valeur: '1,8', destination: PRESSION }] : [] }, { id: 'v', trame_id: trameId }, remote, issues);
    check(!issues.length && rows[0].commentaire === '419816' && rows[1].commentaire === '1,8', `${trameId} : sérialisation réelle des critères Intranet par destination`);
  }

  // SQLite réel : migration 045 additive + reprise de visite.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-meter-'));
  const server = databaseProcess(path.join(dir, 'meter.db'));
  try {
    await server.send('migrate', '', [0, 44]);
    await server.db.execAsync(`INSERT INTO clients(id,nom) VALUES('c','Client');
      INSERT INTO sites(id,client_id,nom_site) VALUES('s','c','Site');
      INSERT INTO installations(id,site_id,type_code,nom) VALUES('i','s','chaufferie','Chaufferie');
      INSERT INTO visites(id,site_id,date_visite,statut,trame_id,installation_id) VALUES('v1','s','2026-03-01','terminee','icpe_v1','i');
      INSERT INTO compteurs_site(id,installation_id,type_code,libelle,unite) VALUES('cs1','i','compteur','Compteur gaz','m³');
      INSERT INTO compteurs(id,visite_id,label,valeur,unite,compteur_site_id) VALUES('k1','v1','Compteur gaz','418532','m³','cs1');`);
    await server.send('migrate', '', [44, 45]);
    const ancien = await server.db.getFirstAsync(`SELECT label,valeur,destination FROM compteurs WHERE id='k1'`);
    check(ancien.label === 'Compteur gaz' && ancien.valeur === '418532' && ancien.destination === null, 'migration 044 -> 045 conserve les compteurs existants sans rien réinterpréter');
    check((await server.db.getAllAsync('PRAGMA foreign_key_check')).length === 0, 'migration 045 préserve les clés étrangères');
    await server.db.runAsync(`UPDATE compteurs SET label='Chaudière 1',destination=? WHERE id='k1'`, [GAZ]);
    await server.db.runAsync(`UPDATE compteurs_site SET libelle='Chaudière 1',destination=? WHERE id='cs1'`, [GAZ]);
    await server.db.execAsync(`INSERT INTO visites(id,site_id,date_visite,statut,trame_id,installation_id) VALUES('v2','s','2026-10-06','en_cours','icpe_v1','i');`);
    let n = 0; const semantic = load('trameSemanticMesh.js');
    const carry = load('visitCarryForwardDb.js', { createId: () => `id-${++n}`, DEFAULT_TRAME_ID: 'icpe_v1', obtenirTrame: registry.obtenirTrame, construireIndexSemantiqueTrame: semantic.construireIndexSemantiqueTrame });
    const contexte = await server.db.getFirstAsync(`SELECT * FROM visites WHERE id='v2'`);
    const result = await carry.carryForwardPreviousVisit(server.db, 'v2', contexte);
    const repris = await server.db.getFirstAsync(`SELECT label,destination,valeur FROM compteurs WHERE visite_id='v2'`);
    check(result.copiedMeters === 1 && repris.label === 'Chaudière 1' && repris.destination === GAZ, 'nouvelle visite : compteur renommé repris avec sa destination');
    await server.db.execAsync(`INSERT OR REPLACE INTO _meta(key,value) VALUES('demo_seeded','1'),('biblio_seeded','1'),('equip_biblio_seeded','1');
      INSERT INTO visites(id,site_id,date_visite,statut,trame_id,installation_id) VALUES('future','s','2027-01-01','terminee','icpe_v1','i');
      INSERT INTO releves_compteur(id,compteur_site_id,visite_id,valeur_texte,releve_le) VALUES('r1','cs1','v1','418532','2028-01-01'),('rf','cs1','future','999999','2027-01-01');`);
    const repository = load('db.js', { openAppDatabase: async () => server.db, createId: () => `db-${++n}` });
    const listed = await repository.listerCompteurs('v2');
    check(listed[0].valeur_precedente === '418532', 'relevé précédent : la date de visite prime et les visites futures sont exclues');
  } finally { await server.close(); }
  console.log(`${checks} meter destination checks passed (real templates, real SQLite).`);
}

main().catch((error) => { console.error(error); process.exit(1); });
