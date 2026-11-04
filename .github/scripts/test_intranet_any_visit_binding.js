/** Executable regression tests for automatic same-imported-client Intranet binding. */
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
  const script = source.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/export\s*\{[^}]+\};?/g, '').replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g, '');
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
  const db = { getAllAsync: (sql, params) => send('all', sql, params), getFirstAsync: async (sql, params) => (await send('all', sql, params))[0] || null,
    runAsync: (sql, params) => send('run', sql, params), execAsync: (sql) => send('exec', sql) };
  db.withExclusiveTransactionAsync = async (fn) => { await send('run', 'BEGIN'); try { const result = await fn(db); await send('run', 'COMMIT'); return result; } catch (e) { await send('run', 'ROLLBACK'); throw e; } };
  db.withTransactionAsync = (fn) => db.withExclusiveTransactionAsync(() => fn());
  return { db, send, close: () => child.stdin.end() };
}

const localTrame = { id: 'icpe_v1', ui: { labels: { 'p-test': 'Contrôles' }, panels: {
  'p-test': { Sous: [{ cle: 'Contrôle A', type: 'controle' }] },
} } };
const remoteTrame = { id: '3', nom: 'ICPE', categories: [{ id: '10', nom: 'Contrôles', sousCategories: [{ id: '20', nom: 'Sous', criteres: [
  { id: '100', nom: 'Contrôle A', avisApplicable: true },
] }] }] };
function reference(localId, designation = 'Chaufferie', trame = remoteTrame) {
  return { local: { id: String(localId), designation }, site: { id: '45', nom: 'Site Alpha' },
    derniereVisite: { id: '812', date: '2026-09-01', statut: 'Terminé' }, trame, materiels: [], remarques: [], notes: [] };
}
function mapRemoteTrameToLocal(remote) {
  const value = String(remote?.nom || '').toLowerCase();
  if (value.includes('remar')) return 'remar_v1';
  if (value.includes('vmc') || value.includes('ventilation')) return 'vmc';
  if (value.includes('pre') && value.includes('allum')) return 'pre_allumage';
  if (value.includes('icpe') || value.includes('chauffer') || value.includes('sous-station')) return 'icpe_v1';
  return null;
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-binding-test-'));
  const server = databaseProcess(path.join(dir, 'binding.db'));
  try {
    await server.send('migrate', '', [0, 33]);
    await server.db.execAsync(`
      INSERT INTO clients(id,nom,code_exploitant) VALUES('local-client','Client Alpha','CL-100');
      INSERT INTO clients(id,nom,code_exploitant) VALUES('other-local-client','Autre client importé','ZZ-999');
      INSERT INTO clients(id,nom,code_exploitant) VALUES('pure-local-client','Client local seul','LOCAL-1');
      INSERT INTO sites(id,client_id,nom_site) VALUES('local-site','local-client','Site Alpha');
      INSERT INTO sites(id,client_id,nom_site) VALUES('other-local-site','other-local-client','Autre site importé');
      INSERT INTO sites(id,client_id,nom_site) VALUES('pure-local-site','pure-local-client','Site local seul');
      INSERT INTO visites(id,site_id,date_visite,statut,trame_id) VALUES('ordinary-visit','local-site','2026-09-10','terminee','icpe_v1');
      INSERT INTO visites(id,site_id,date_visite,statut,trame_id) VALUES('unimported-visit','pure-local-site','2026-09-10','terminee','icpe_v1');
      INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES('ordinary-visit','test.sous','Contrôle A','S','Fonctionnement satisfaisant');
      INSERT INTO materiel(id,visite_id,categorie,nombre,designation,etat) VALUES('ordinary-material','ordinary-visit','PRODUCTION CHAUD','1','Chaudière','Bon');

      INSERT INTO api_client_links(remote_client_id,local_client_id,nom,code_everwin,autorise,payload_json) VALUES('12','local-client','Client Alpha','CL-100',1,'{}');
      INSERT INTO api_client_links(remote_client_id,local_client_id,nom,code_everwin,autorise,payload_json) VALUES('99','other-local-client','Autre client importé','ZZ-999',1,'{}');
      INSERT INTO api_site_links(remote_site_id,remote_client_id,local_site_id,nom,payload_json) VALUES('45','12','local-site','Site Alpha','{}');
      INSERT INTO api_client_site_links(remote_client_id,remote_site_id,local_site_id) VALUES('12','45','local-site');
    `);
    await server.db.runAsync(`INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,remote_trame_id,remote_trame_nom,derniere_visite_id,derniere_visite_date,criteria_count,reference_json)
      VALUES('501','45','Chaufferie','3','ICPE','812','2026-09-01',1,?)`, [JSON.stringify(reference('501'))]);
    await server.db.runAsync(`INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,remote_trame_id,remote_trame_nom,criteria_count,reference_json)
      VALUES('503','45','Local sans trame',NULL,NULL,0,?)`, [JSON.stringify(reference('503', 'Local sans trame', null))]);

    let ids = 0;
    const binding = load('intranetVisitBindingDb.js', {
      getDb: async () => server.db,
      createId: () => `binding-prov-${++ids}`,
      mapRemoteTrameToLocal,
    });

    const options = await binding.getVisitIntranetBindingOptions('ordinary-visit');
    check(options.clients.length === 1 && options.clients[0].remote_client_id === '12', 'visit only sees the Intranet client imported into its METRA client');
    check(options.selectedClientId === '12', 'same imported client is resolved automatically');
    check(options.selectedSiteId === '45', 'same imported site is resolved from the durable local site link');
    check(options.suggestedLocalId === '501', 'sole compatible local is resolved automatically');
    check(options.locals.find((row) => row.remote_local_id === '503')?.compatible === false, 'local without a usable remote trame remains non-sendable before first-visit preparation');

    const firstVisitTrame = binding.resolveFirstVisitRemoteTrame(
      { trames: [remoteTrame, { ...remoteTrame, id: '4', nom: 'ICPE Chaufferie' }] },
      'icpe_v1',
      'ICPE'
    );
    check(firstVisitTrame.remoteTrameId === '3' && firstVisitTrame.matchedBy === 'visit_field',
      'first visit uses Informations > Trame utilisée to disambiguate several ICPE-family Intranet trames');
    assert.throws(
      () => binding.resolveFirstVisitRemoteTrame(
        { trames: [remoteTrame, { ...remoteTrame, id: '4', nom: 'ICPE' }] },
        'icpe_v1',
        'ICPE'
      ),
      /Plusieurs trames Intranet portent le nom/
    );
    checks++; console.log(`OK ${checks}: first visit still refuses duplicate exact Intranet trame names`);

    // Simule la réponse de preparation-visites?trame=3 pour un local qui n'a
    // encore aucune visite Intranet : trame + critères sont présents, mais
    // derniereVisite reste null.
    const firstReference = {
      local: { id: '503', designation: 'Local sans trame' },
      site: { id: '45', nom: 'Site Alpha' },
      derniereVisite: null,
      trame: remoteTrame,
      materiels: [],
      remarques: [],
      notes: [],
    };
    await server.db.execAsync(`
      INSERT INTO installations(id,site_id,type_code,nom,actif)
        VALUES('installation-first','local-site','installation_technique','Local première visite',1);
      UPDATE api_local_links
        SET local_installation_id='installation-first',remote_trame_id='3',remote_trame_nom='ICPE',
            criteria_count=1,reference_json='${JSON.stringify(firstReference).replace(/'/g, "''")}'
        WHERE remote_local_id='503';
      INSERT INTO visites(id,site_id,installation_id,date_visite,statut,trame_id)
        VALUES('first-visit','local-site','installation-first','2026-09-10','terminee','icpe_v1');
      INSERT INTO champs_visite(visite_id,section_code,cle,valeur)
        VALUES('first-visit','p-infos.general','Trame utilisée','ICPE');
      INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire)
        VALUES('first-visit','test.sous','Contrôle A','S','Première visite');
    `);
    const firstOptions = await binding.getVisitIntranetBindingOptions('first-visit');
    check(firstOptions.visitTrameName === 'ICPE',
      'binding reads the actual Informations > Trame utilisée value stored on the visit');
    const firstTarget = await binding.bindVisitToImportedClientTarget('first-visit');
    check(firstTarget.remoteLocalId === '503', 'first visit binds to the imported local after filtered trame preparation even without historical visit');
    const firstVisitRow = await server.db.getFirstAsync(`SELECT api_remote_trame_id,api_source_remote_visit_id FROM visites WHERE id='first-visit'`);
    check(firstVisitRow.api_remote_trame_id === '3' && firstVisitRow.api_source_remote_visit_id == null,
      'first visit freezes remote trame id while keeping derniereVisiteIdSource null');

    // Rétablit le fixture initial pour les scénarios historiques ci-dessous :
    // la première visite reste autonome grâce à sa référence figée en provenance.
    await server.db.runAsync(`
      UPDATE api_local_links
      SET local_installation_id=NULL,remote_trame_id=NULL,remote_trame_nom=NULL,criteria_count=0,reference_json=?
      WHERE remote_local_id='503'
    `, [JSON.stringify(reference('503', 'Local sans trame', null))]);

    await assert.rejects(() => binding.bindVisitToIntranetTarget('ordinary-visit', { remoteClientId: '99', remoteSiteId: '45', remoteLocalId: '501' }), /ayant été importé|client Intranet/i);
    checks++; console.log(`OK ${checks}: explicit cross-client upload is rejected even when another imported client is authorized on the tablet`);

    await assert.rejects(() => binding.bindVisitToImportedClientTarget('unimported-visit'), /n’a pas été importé depuis l’Intranet/);
    checks++; console.log(`OK ${checks}: a purely local client cannot be silently redirected to an arbitrary authorized Intranet client`);

    const before = {
      controls: await server.db.getFirstAsync(`SELECT COUNT(*) AS n FROM controles_visite WHERE visite_id='ordinary-visit'`),
      materials: await server.db.getFirstAsync(`SELECT COUNT(*) AS n FROM materiel WHERE visite_id='ordinary-visit'`),
    };
    const target = await binding.bindVisitToImportedClientTarget('ordinary-visit');
    check(target.remoteClientId === '12' && target.remoteSiteId === '45' && target.remoteLocalId === '501', 'one automatic action binds visit to its original imported client/site/local');
    const visit = await server.db.getFirstAsync(`SELECT api_remote_client_id,api_remote_local_id,api_remote_trame_id,api_source_remote_visit_id FROM visites WHERE id='ordinary-visit'`);
    check(visit.api_remote_client_id === '12' && visit.api_remote_local_id === '501' && visit.api_remote_trame_id === '3' && visit.api_source_remote_visit_id === '812', 'server identity is frozen on the visit before upload');
    const provenance = await server.db.getFirstAsync(`SELECT details_json FROM provenances WHERE entite_type='visite' AND entite_id='ordinary-visit' ORDER BY importe_le DESC LIMIT 1`);
    const details = JSON.parse(provenance.details_json);
    check(details.sourceType === 'upload_binding' && details.binding?.policy === 'same_imported_client', 'binding provenance records the same-imported-client policy');
    const after = {
      controls: await server.db.getFirstAsync(`SELECT COUNT(*) AS n FROM controles_visite WHERE visite_id='ordinary-visit'`),
      materials: await server.db.getFirstAsync(`SELECT COUNT(*) AS n FROM materiel WHERE visite_id='ordinary-visit'`),
    };
    check(Number(before.controls.n) === Number(after.controls.n) && Number(before.materials.n) === Number(after.materials.n), 'automatic binding does not rewrite visit observations');

    const payload = load('intranetVisitPayload.js', { getDb: async () => server.db, obtenirTrame: () => localTrame });
    const prepared = await payload.buildIntranetVisitPayload('ordinary-visit', '11111111-1111-4111-8111-111111111111');
    check(prepared.remoteClientId === '12' && prepared.payload.visites[0].localId === 501 && prepared.payload.visites[0].trameId === 3, 'wire payload stays on the imported client/local after automatic binding');
    check(prepared.payload.visites[0].criteres[0].avis === 'S' && prepared.payload.visites[0].criteres[0].commentaire === 'Fonctionnement satisfaisant', 'wire payload sends current METRA observation');

    const firstPrepared = await payload.buildIntranetVisitPayload('first-visit', '22222222-2222-4222-8222-222222222222');
    check(firstPrepared.payload.visites[0].localId === 503 && firstPrepared.payload.visites[0].trameId === 3,
      'first-visit wire payload uses the resolved Intranet local and trame');
    check(firstPrepared.payload.visites[0].derniereVisiteIdSource === null,
      'first-visit wire payload explicitly keeps derniereVisiteIdSource null when no Intranet visit exists');

    await server.db.execAsync(`
      INSERT INTO visites(id,site_id,date_visite,statut,trame_id) VALUES('ambiguous-visit','local-site','2026-09-10','terminee','icpe_v1');
      INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES('ambiguous-visit','test.sous','Contrôle A','S','OK');
    `);
    await server.db.runAsync(`INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,remote_trame_id,remote_trame_nom,criteria_count,reference_json)
      VALUES('505','45','Sous-station','3','ICPE',1,?)`, [JSON.stringify(reference('505', 'Sous-station'))]);
    await assert.rejects(() => binding.bindVisitToImportedClientTarget('ambiguous-visit'),
      /Choisis explicitement son local Intranet/);
    checks++; console.log(`OK ${checks}: multiple compatible locals are never guessed when the visit has no installation link`);

    // Cas réel D2 / D3 : la visite a une installation précise, mais le cache
    // Intranet a perdu local_installation_id. Ne réparer que par provenance
    // Symfony du MEME local, jamais par similarité du nom.
    await server.db.execAsync(`
      INSERT INTO installations(id,site_id,type_code,nom,actif)
      VALUES('installation-d3','local-site','installation_technique','D3',1);
      INSERT INTO visites(id,site_id,installation_id,date_visite,statut,trame_id)
      VALUES('d3-visit','local-site','installation-d3','2026-11-04','terminee','icpe_v1');
      INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json)
      VALUES('prov-d3-install','installation','installation-d3','api_symfony','505',
        '{"sourceType":"local","remoteLocalId":"505","remoteSiteId":"45"}');
    `);
    const d3Target = await binding.bindVisitToImportedClientTarget('d3-visit');
    check(d3Target.remoteLocalId === '505', 'D3 recovers exact remote local 505 only from persisted physical installation provenance');
    const durableD3 = await server.db.getFirstAsync(
      "SELECT local_installation_id FROM api_local_links WHERE remote_local_id='505'");
    check(durableD3.local_installation_id === 'installation-d3',
      'restored physical local association is saved for subsequent visits');

    await server.db.execAsync(`
      INSERT INTO installations(id,site_id,type_code,nom,actif)
      VALUES('installation-d2','local-site','installation_technique','D2',1);
      INSERT INTO visites(id,site_id,installation_id,date_visite,statut,trame_id)
      VALUES('d2-visit','local-site','installation-d2','2026-11-04','terminee','icpe_v1');
    `);
    await assert.rejects(() => binding.bindVisitToImportedClientTarget('d2-visit'),
      /correspondance Intranet n’est pas encore retrouvée/);
    check((await server.db.getFirstAsync(
      "SELECT api_remote_local_id FROM visites WHERE id='d2-visit'")).api_remote_local_id == null,
      'D2 without source identity remains unchanged and never uploads to another local');
    const explicitD2 = await binding.bindVisitToIntranetTarget('d2-visit', {
      remoteClientId:'12', remoteSiteId:'45', remoteLocalId:'501',
    });
    check(explicitD2.remoteLocalId === '501', 'technician explicit selection links D2 to the intended server local');
    const linkD2 = await server.db.getFirstAsync(
      "SELECT local_installation_id FROM api_local_links WHERE remote_local_id='501'");
    check(linkD2.local_installation_id === 'installation-d2',
      'explicit selection persists durable 1:1 physical local identity');
    await assert.rejects(() => binding.bindVisitToIntranetTarget('d2-visit', {
      remoteClientId:'12', remoteSiteId:'45', remoteLocalId:'505',
    }), /déjà un identifiant Intranet|identifiant Intranet différent|déjà associé/i);
    checks++; console.log(`OK ${checks}: moving D2 to D3 after binding is rejected, with no cross-local mixing`);

    // Un local correct importé peut temporairement porter une trame
    // différente du modèle de la visite (révision, cache partiel, REMAR).
    // Cette incompatibilité ne doit JAMAIS faire choisir D2 ou 501.
    const vmcRef=reference('505','D3',{
      id:'9',nom:'VMC',categories:[{id:'90',nom:'VMC',sousCategories:[
        {id:'91',nom:'Conformités',criteres:[{id:'92',nom:'Contrôle VMC'}]}]}],
    });
    await server.db.runAsync(`UPDATE api_local_links
      SET remote_trame_id='9',remote_trame_nom='VMC',reference_json=?
      WHERE remote_local_id='505'`, [JSON.stringify(vmcRef)]);
    await assert.rejects(
      () => binding.bindVisitToImportedClientTarget('d3-visit'),
      /local Intranet D3.*bien identifié, mais sa trame|bien identifié, mais sa trame/
    );
    check((await server.db.getFirstAsync(
      "SELECT api_remote_local_id FROM visites WHERE id='d3-visit'")).api_remote_local_id === '505',
      'incompatible remote trame cannot silently retarget imported D3 to another compatible local');
    await server.db.runAsync(`UPDATE api_local_links
      SET remote_trame_id='3',remote_trame_nom='ICPE',reference_json=?
      WHERE remote_local_id='505'`, [JSON.stringify(reference('505','D3'))]);

    // Les anciennes importations peuvent avoir perdu la colonne
    // api_remote_local_id tout en conservant la référence originale dans
    // la provenance de CETTE visite. Réparer sur IDs exacts de site + local.
    const referenceD5 = reference('507', 'D5');
    await server.db.runAsync(`INSERT INTO api_local_links(
      remote_local_id,remote_site_id,designation,remote_trame_id,remote_trame_nom,criteria_count,reference_json)
      VALUES('507','45','D5','3','ICPE',1,?)`, [JSON.stringify(referenceD5)]);
    await server.db.execAsync(`
      INSERT INTO installations(id,site_id,type_code,nom,actif)
      VALUES('installation-d5','local-site','installation_technique','D5',1);
      INSERT INTO visites(id,site_id,installation_id,date_visite,statut,trame_id)
      VALUES('d5-prepared','local-site','installation-d5','2026-11-04','terminee','icpe_v1');
    `);
    await server.db.runAsync(`INSERT INTO provenances(
      id,entite_type,entite_id,origine,reference_externe,details_json)
      VALUES('prov-d5-prepared','visite','d5-prepared','api_symfony','507',?)`,
      [JSON.stringify({...referenceD5,sourceType:'preparation_visite',remoteLocalId:'507'})]);
    const d5 = await binding.bindVisitToImportedClientTarget('d5-prepared');
    check(d5.remoteLocalId === '507', 'original imported visit provenance restores D5 without remote visit column or name guessing');
    check((await server.db.getFirstAsync(
      "SELECT api_remote_local_id FROM visites WHERE id='d5-prepared'")).api_remote_local_id === '507',
      'restored Intranet local ID is permanently pinned to its visit');
    check((await server.db.getFirstAsync(
      "SELECT local_installation_id FROM api_local_links WHERE remote_local_id='507'"
    )).local_installation_id === 'installation-d5',
      'restored local belongs to the same physical METRA installation');

    // La visite D4 n'a pas de remoteLocalId, mais une visite ancienne de
    // la MEME installation porte déjà un ID Symfony : récupération sans nom.
    await server.db.runAsync(`INSERT INTO api_local_links(
      remote_local_id,remote_site_id,designation,remote_trame_id,remote_trame_nom,criteria_count,reference_json)
      VALUES('506','45','D4','3','ICPE',1,?)`, [JSON.stringify(reference('506','D4'))]);
    await server.db.execAsync(`
      INSERT INTO installations(id,site_id,type_code,nom,actif)
      VALUES('installation-d4','local-site','installation_technique','D4',1);
      INSERT INTO visites(id,site_id,installation_id,date_visite,statut,trame_id,api_remote_local_id)
      VALUES('d4-older','local-site','installation-d4','2026-10-10','exportee','icpe_v1','506');
      INSERT INTO visites(id,site_id,installation_id,date_visite,statut,trame_id)
      VALUES('d4-current','local-site','installation-d4','2026-11-04','terminee','icpe_v1');
    `);
    const d4 = await binding.bindVisitToImportedClientTarget('d4-current');
    check(d4.remoteLocalId === '506', 'same-installation historical server local ID restores D4 without name matching');
    await assert.rejects(() => binding.bindVisitToIntranetTarget('d4-current', {
      remoteClientId:'12',remoteSiteId:'45',remoteLocalId:'501'
    }), /identifiant Intranet différent|autre local Intranet/);
    checks++; console.log(`OK ${checks}: previous local identity cannot be overwritten by a different ID`);

    // Vérifier la présélection REMAR sur une vraie SQLite avant tout POST.
    await server.db.execAsync(
      "INSERT INTO visites(id,site_id,date_visite,statut,trame_id,"+
      "api_remote_client_id,api_remote_local_id,api_remote_trame_id,api_source_remote_visit_id) "+
      "VALUES('remar-preselection','local-site','2026-11-02','terminee',"+
      "'remar_v1','12','501','16','812')");
    const classique={...reference('501'),trame:{id:'16',nom:'REMAR CLASSIQUE',
      categories:[{id:53,nom:'INFORMATION CHAUFFERIE',sousCategories:[
        {id:89,nom:'Réseaux',criteres:[{id:303,nom:'Réseau 1',avisApplicable:false}]}]}]}};
    const complete={...reference('501'),trame:{id:'92',nom:'REMAR TECHNIQUE COMPLET',
      categories:[{id:53,nom:'INFORMATION CHAUFFERIE',sousCategories:[
        {id:89,nom:'Réseaux',criteres:[{id:303,nom:'Réseau 1',avisApplicable:false}]}]}]}};
    await server.db.runAsync(
      "INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json) "+
      "VALUES('prior-remar','visite','remar-preselection','api_symfony','501',?)",
      [JSON.stringify({...classique,sourceType:'preparation_visite'})]);
    const mismatched={...complete,derniereVisite:{id:'999'}};
    await assert.rejects(
      () => binding.pinVerifiedRemarTrameForUpload('remar-preselection',{
        remoteClientId:'12',remoteSiteId:'45',remoteLocalId:'501',reference:mismatched,
      }),/visite plus récente|référence différente/i);
    checks++;console.log('OK '+checks+': stale last Symfony visit prevents wrong REMAR selection');
    await assert.rejects(
      () => binding.pinVerifiedRemarTrameForUpload('remar-preselection',{
        remoteClientId:'99',remoteSiteId:'45',remoteLocalId:'501',reference:complete,
      }),/client|site|local Intranet importé/i);
    checks++;console.log('OK '+checks+': REMAR alternative cannot cross imported client boundary');
    const badLocal={...complete,local:{id:'505'}};
    await assert.rejects(
      () => binding.pinVerifiedRemarTrameForUpload('remar-preselection',{
        remoteClientId:'12',remoteSiteId:'45',remoteLocalId:'501',reference:badLocal,
      }),/ne correspond pas/i);
    checks++;console.log('OK '+checks+': REMAR alternative never crosses local IDs');
    const pinned=await binding.pinVerifiedRemarTrameForUpload('remar-preselection',{
      remoteClientId:'12',remoteSiteId:'45',remoteLocalId:'501',reference:complete,
    });
    check(pinned.remoteTrameId==='92','fully proven REMAR version pinned before upload');
    const pinnedVisit=await server.db.getFirstAsync(
      "SELECT api_remote_trame_id,api_source_remote_visit_id FROM visites WHERE id='remar-preselection'");
    check(pinnedVisit.api_remote_trame_id==='92'&&pinnedVisit.api_source_remote_visit_id==='812',
      'new trame but stable optimistic last-visit lock');
    const localUnchanged=await server.db.getFirstAsync(
      "SELECT remote_trame_id FROM api_local_links WHERE remote_local_id='501'");
    check(localUnchanged.remote_trame_id==='3',
      'alternative REMAR does not overwrite default local cache');
    const retained=await server.db.getAllAsync(
      "SELECT details_json FROM provenances WHERE entite_type='visite' AND entite_id='remar-preselection'");
    check(retained.some(row=>JSON.parse(row.details_json).sourceType==='preparation_visite')&&
      retained.some(row=>JSON.parse(row.details_json).sourceType==='remar_upload_preselection'),
      'original visit provenance retained with verified REMAR preselection');
    const bound=await binding.bindVisitToImportedClientTarget('remar-preselection');
    check(bound.remoteLocalId==='501'&&bound.trameName==='REMAR TECHNIQUE COMPLET',
      'production binding uses new verified REMAR, not cached CLASSIQUE');
    const afterBinding=await server.db.getFirstAsync(
      "SELECT api_remote_trame_id,api_source_remote_visit_id FROM visites WHERE id='remar-preselection'");
    check(afterBinding.api_remote_trame_id==='92'&&afterBinding.api_source_remote_visit_id==='812',
      'outbound binding keeps new REMAR 92 and source visit 812');
    await server.db.runAsync(
      "INSERT INTO api_visit_outbox(envoi_id,visite_id,remote_client_id,payload_json,payload_bytes,status) "+
      "VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','remar-preselection','12','{}',2,'pending')");
    await assert.rejects(
      () => binding.pinVerifiedRemarTrameForUpload('remar-preselection',{
        remoteClientId:'12',remoteSiteId:'45',remoteLocalId:'501',reference:complete,
      }),/envoi figé|changer sa trame/i);
    checks++;console.log('OK '+checks+': REMAR selection impossible after envoiId freeze');

    await server.db.runAsync(`INSERT INTO api_visit_outbox(envoi_id,visite_id,remote_client_id,payload_json,payload_bytes,status) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ordinary-visit','12','{}',2,'pending')`);
    await assert.rejects(() => binding.bindVisitToImportedClientTarget('ordinary-visit'), /déjà un envoi|destination ne peut plus/i);
    checks++; console.log(`OK ${checks}: durable queued upload cannot be rebound after its idempotent payload is frozen`);

    check((await server.db.getAllAsync('PRAGMA foreign_key_check')).length === 0, 'binding leaves SQLite foreign keys valid');
    console.log(`\n${checks} imported-client binding checks passed (real SQLite, production binding/payload code).`);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
