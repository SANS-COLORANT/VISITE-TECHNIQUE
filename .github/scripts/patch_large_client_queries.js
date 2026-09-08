const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, text) { fs.writeFileSync(path, text); }
function replaceOnce(text, from, to, label) {
  if (text.includes(to)) return text;
  if (!text.includes(from)) throw new Error(`${label}: anchor not found`);
  return text.replace(from, to);
}

function patchDbCounts() {
  const path = 'db.js';
  let text = read(path);
  const old = "async function listerVisitesEnCours(){return(await getDb()).getAllAsync(`SELECT v.id, v.date_visite, v.progression_pct, s.nom_site, c.nom AS nom_client FROM visites v JOIN sites s ON s.id=v.site_id JOIN clients c ON c.id=s.client_id WHERE v.statut='en_cours' ORDER BY v.modifie_le DESC`);} async function listerVisitesSite(siteId){return(await getDb()).getAllAsync(`SELECT * FROM visites WHERE site_id=? ORDER BY date_visite DESC, modifie_le DESC`,[siteId]);} async function compterVisites(){const db=await getDb(),a=await db.getFirstAsync(`SELECT COUNT(*) n FROM visites WHERE statut='en_cours'`),b=await db.getFirstAsync(`SELECT COUNT(*) n FROM visites WHERE statut='terminee'`);return{enCours:a.n,terminees:b.n};}";
  const next = "async function listerVisitesEnCours(){return(await getDb()).getAllAsync(`SELECT v.id, v.date_visite, v.progression_pct, s.nom_site, c.nom AS nom_client FROM visites v JOIN sites s ON s.id=v.site_id JOIN clients c ON c.id=s.client_id WHERE v.statut='en_cours' ORDER BY v.modifie_le DESC`);} async function listerVisitesSite(siteId){return(await getDb()).getAllAsync(`SELECT * FROM visites WHERE site_id=? ORDER BY date_visite DESC, modifie_le DESC`,[siteId]);} async function compterVisites(){const row=await(await getDb()).getFirstAsync(`SELECT SUM(CASE WHEN statut='en_cours' THEN 1 ELSE 0 END) en_cours,SUM(CASE WHEN statut='terminee' THEN 1 ELSE 0 END) terminees FROM visites`);return{enCours:Number(row?.en_cours||0),terminees:Number(row?.terminees||0)};}";
  text = replaceOnce(text, old, next, 'db visit counts');
  write(path, text);
}

function patchPatrimoine() {
  const path = 'patrimoineDb.js';
  let text = read(path);
  const bulkSyncMarker = 'async function synchroniserReservesClient(clientId) {';
  if (!text.includes(bulkSyncMarker)) {
    const anchor = '}\n\nexport async function listerReservesSite(siteId, options = {}) {';
    const index = text.indexOf(anchor);
    if (index < 0) throw new Error('patrimoine bulk sync anchor not found');
    const bulk = `}\n\nasync function synchroniserReservesClient(clientId) {\n  const base = await db();\n  const sources = await base.getAllAsync(\n    \`SELECT r.id,r.visite_id,r.poste,r.prestation,r.cree_le,v.date_visite,v.site_id\n     FROM remarques r\n     JOIN visites v ON v.id=r.visite_id\n     JOIN sites s ON s.id=v.site_id\n     WHERE s.client_id=?\n       AND NOT EXISTS(SELECT 1 FROM reserves_suivi rs WHERE rs.source_remarque_id=r.id)\n     ORDER BY v.site_id,COALESCE(v.date_visite,''),r.cree_le,r.id\`,\n    [clientId]\n  );\n  if (!sources.length) return;\n  await base.withTransactionAsync(async () => {\n    for (const r of sources) {\n      const reserveId = createId();\n      const date = r.date_visite || r.cree_le || maintenant();\n      await base.runAsync(\n        \`INSERT OR IGNORE INTO reserves_suivi\n         (id,site_id,source_visite_id,source_remarque_id,poste,prestation,statut,cree_le,modifie_le)\n         VALUES(?,?,?,?,?,?,'ouverte',?,?)\`,\n        [reserveId, r.site_id, r.visite_id, r.id, r.poste || 'Observation', r.prestation || '', date, maintenant()]\n      );\n      const creee = await base.getFirstAsync(\`SELECT id FROM reserves_suivi WHERE source_remarque_id=?\`, [r.id]);\n      if (creee?.id === reserveId) {\n        await base.runAsync(\n          \`INSERT INTO historique_reserves\n           (id,reserve_id,type_evenement,date_evenement,nouveau_statut,commentaire,source_visite_id)\n           VALUES(?,?, 'creation', ?, 'ouverte', ?, ?)\`,\n          [createId(), reserveId, date, 'Créée depuis une réserve de visite', r.visite_id]\n        );\n      }\n    }\n  });\n}\n\nexport async function listerReservesSite(siteId, options = {}) {`;
    text = text.slice(0, index) + bulk + text.slice(index + anchor.length);
  }

  const oldClient = `export async function getStatsClientPatrimoine(clientId) {\n  const base = await db();\n  const sites = await base.getAllAsync(\`SELECT id FROM sites WHERE client_id=?\`, [clientId]);\n  for (const s of sites) await synchroniserReservesSite(s.id);\n  const r = await base.getFirstAsync(\n    \`SELECT COUNT(*) AS total,\n      SUM(CASE WHEN r.statut='ouverte' THEN 1 ELSE 0 END) AS ouvertes,\n      SUM(CASE WHEN r.statut='levee' THEN 1 ELSE 0 END) AS levees\n     FROM reserves_suivi r JOIN sites s ON s.id=r.site_id WHERE s.client_id=?\`, [clientId]\n  );\n  const e = await base.getFirstAsync(\n    \`SELECT COUNT(*) AS total,\n      SUM(CASE WHEN e.statut='actif' THEN 1 ELSE 0 END) AS actifs,\n      SUM(CASE WHEN e.statut='remplace' THEN 1 ELSE 0 END) AS remplaces\n     FROM equipements e JOIN installations i ON i.id=e.installation_id JOIN sites s ON s.id=i.site_id WHERE s.client_id=?\`, [clientId]\n  );\n  return {\n    sites: sites.length,\n    reserves: { total: Number(r?.total || 0), ouvertes: Number(r?.ouvertes || 0), levees: Number(r?.levees || 0) },\n    equipements: { total: Number(e?.total || 0), actifs: Number(e?.actifs || 0), remplaces: Number(e?.remplaces || 0) },\n  };\n}`;
  const newClient = `export async function getStatsSitesPatrimoine(clientId) {\n  await synchroniserReservesClient(clientId);\n  const base = await db();\n  const [sites, reserves, equipements] = await Promise.all([\n    base.getAllAsync(\`SELECT id FROM sites WHERE client_id=?\`, [clientId]),\n    base.getAllAsync(\`SELECT r.site_id,COUNT(*) AS total,\n      SUM(CASE WHEN r.statut='ouverte' THEN 1 ELSE 0 END) AS ouvertes,\n      SUM(CASE WHEN r.statut='levee' THEN 1 ELSE 0 END) AS levees\n      FROM reserves_suivi r JOIN sites s ON s.id=r.site_id\n      WHERE s.client_id=? GROUP BY r.site_id\`, [clientId]),\n    base.getAllAsync(\`SELECT i.site_id,COUNT(*) AS total,\n      SUM(CASE WHEN e.statut='actif' THEN 1 ELSE 0 END) AS actifs,\n      SUM(CASE WHEN e.statut='remplace' THEN 1 ELSE 0 END) AS remplaces,\n      SUM(CASE WHEN COALESCE(\n        (SELECT h.etat_apres FROM historique_equipements h WHERE h.equipement_id=e.id AND h.etat_apres IS NOT NULL ORDER BY h.date_evenement DESC LIMIT 1),\n        (SELECT o.etat FROM observations_equipement o JOIN visites v ON v.id=o.visite_id WHERE o.equipement_id=e.id ORDER BY COALESCE(v.date_visite,'') DESC,o.observe_le DESC LIMIT 1),'')\n        IN ('Vétuste','Dégradé','Hors service','À surveiller') THEN 1 ELSE 0 END) AS a_surveiller\n      FROM equipements e JOIN installations i ON i.id=e.installation_id JOIN sites s ON s.id=i.site_id\n      WHERE s.client_id=? GROUP BY i.site_id\`, [clientId]),\n  ]);\n  const map = new Map((sites || []).map((site) => [site.id, {\n    reserves: { total: 0, ouvertes: 0, levees: 0 },\n    equipements: { total: 0, actifs: 0, remplaces: 0, aSurveiller: 0 },\n  }]));\n  for (const row of reserves || []) {\n    const current = map.get(row.site_id); if (!current) continue;\n    current.reserves = { total: Number(row.total || 0), ouvertes: Number(row.ouvertes || 0), levees: Number(row.levees || 0) };\n  }\n  for (const row of equipements || []) {\n    const current = map.get(row.site_id); if (!current) continue;\n    current.equipements = { total: Number(row.total || 0), actifs: Number(row.actifs || 0), remplaces: Number(row.remplaces || 0), aSurveiller: Number(row.a_surveiller || 0) };\n  }\n  return map;\n}\n\nexport async function getStatsClientPatrimoine(clientId) {\n  const stats = await getStatsSitesPatrimoine(clientId);\n  const total = {\n    sites: stats.size,\n    reserves: { total: 0, ouvertes: 0, levees: 0 },\n    equipements: { total: 0, actifs: 0, remplaces: 0 },\n  };\n  for (const value of stats.values()) {\n    total.reserves.total += Number(value.reserves?.total || 0);\n    total.reserves.ouvertes += Number(value.reserves?.ouvertes || 0);\n    total.reserves.levees += Number(value.reserves?.levees || 0);\n    total.equipements.total += Number(value.equipements?.total || 0);\n    total.equipements.actifs += Number(value.equipements?.actifs || 0);\n    total.equipements.remplaces += Number(value.equipements?.remplaces || 0);\n  }\n  return total;\n}`;
  text = replaceOnce(text, oldClient, newClient, 'patrimoine bulk stats');
  write(path, text);
}

function patchSiteHealth() {
  const path = 'siteHealth.js';
  let text = read(path);
  const helperMarker = 'async function mapHealthAvecConcurrence(items, limite, worker) {';
  if (!text.includes(helperMarker)) {
    const anchor = "const clampScore = (value) => {\n";
    if (!text.includes(anchor)) throw new Error('siteHealth helper anchor not found');
    const helper = `async function mapHealthAvecConcurrence(items, limite, worker) {\n  const resultats = new Array(items.length); let curseur = 0;\n  const workers = Array.from({ length: Math.min(Math.max(1, limite), items.length) }, async () => {\n    while (true) { const index = curseur++; if (index >= items.length) return; resultats[index] = await worker(items[index], index); }\n  });\n  await Promise.all(workers); return resultats;\n}\n\n`;
    text = text.replace(anchor, helper + anchor);
  }
  text = replaceOnce(text,
    'export async function computeAutomaticSiteHealth(siteId, forcedVisitId = null) {\n  const db = await getDb();\n  const [visite, patrimoine] = await Promise.all([\n    latestVisit(db, siteId, forcedVisitId),\n    getStatsSitePatrimoine(siteId),\n  ]);',
    'export async function computeAutomaticSiteHealth(siteId, forcedVisitId = null, patrimoineOverride = null) {\n  const db = await getDb();\n  const [visite, patrimoine] = await Promise.all([\n    latestVisit(db, siteId, forcedVisitId),\n    patrimoineOverride ? Promise.resolve(patrimoineOverride) : getStatsSitePatrimoine(siteId),\n  ]);',
    'siteHealth patrimoine override'
  );
  text = replaceOnce(text,
    "export async function getSiteHealth(siteId, forcedVisitId = null) {\n  const [automatic, settings] = await Promise.all([\n    computeAutomaticSiteHealth(siteId, forcedVisitId),",
    "export async function getSiteHealth(siteId, forcedVisitId = null, patrimoineOverride = null) {\n  const [automatic, settings] = await Promise.all([\n    computeAutomaticSiteHealth(siteId, forcedVisitId, patrimoineOverride),",
    'siteHealth override forwarding'
  );
  const oldClient = `export async function getClientHealth(clientId) {\n  const db = await getDb();\n  const sites = await db.getAllAsync(\`SELECT id,nom_site,adresse FROM sites WHERE client_id=? ORDER BY nom_site COLLATE NOCASE\`, [clientId]);\n  const health = [];\n  for (const site of sites) {\n    const item = await getSiteHealth(site.id);\n    health.push({ ...item, siteName: site.nom_site || 'Site', address: site.adresse || '' });\n  }\n  return { ...aggregateSiteHealth(health), items: health };\n}`;
  const newClient = `export async function getClientHealth(clientId, statsBySite = null) {\n  const db = await getDb();\n  const sites = await db.getAllAsync(\`SELECT id,nom_site,adresse FROM sites WHERE client_id=? ORDER BY nom_site COLLATE NOCASE\`, [clientId]);\n  const health = await mapHealthAvecConcurrence(sites || [], 6, async (site) => {\n    const override = statsBySite?.get ? statsBySite.get(site.id) : null;\n    const item = await getSiteHealth(site.id, null, override || null);\n    return { ...item, siteName: site.nom_site || 'Site', address: site.adresse || '' };\n  });\n  return { ...aggregateSiteHealth(health), items: health };\n}`;
  text = replaceOnce(text, oldClient, newClient, 'siteHealth bounded client load');
  write(path, text);
}

function patchClientPatrimoine() {
  const path = 'ClientPatrimoineScreen.js';
  let text = read(path);
  text = replaceOnce(text,
    "import { getStatsClientPatrimoine, getStatsSitePatrimoine } from './patrimoineDb.js';",
    "import { getStatsSitesPatrimoine } from './patrimoineDb.js';",
    'ClientPatrimoine bulk stats import'
  );
  const oldLoad = `      const [liste, resumeClient, enabled] = await Promise.all([\n        listerSitesClient(clientId),\n        getStatsClientPatrimoine(clientId),\n        getLabFeatureEnabled('health_dashboard'),\n      ]);\n      const lignes = [];\n      for (const site of liste) lignes.push({ ...site, stats: await getStatsSitePatrimoine(site.id) });\n      setResume(resumeClient);\n      setSites(lignes);\n      setHealthEnabled(enabled);\n      setClientHealth(enabled ? await getClientHealth(clientId) : null);`;
  const newLoad = `      const [liste, statsBySite, enabled] = await Promise.all([\n        listerSitesClient(clientId),\n        getStatsSitesPatrimoine(clientId),\n        getLabFeatureEnabled('health_dashboard'),\n      ]);\n      const lignes = (liste || []).map((site) => ({ ...site, stats: statsBySite.get(site.id) || { reserves: {}, equipements: {} } }));\n      const resumeClient = { sites: lignes.length, reserves: { total: 0, ouvertes: 0, levees: 0 }, equipements: { total: 0, actifs: 0, remplaces: 0 } };\n      for (const site of lignes) {\n        const r = site.stats?.reserves || {}, e = site.stats?.equipements || {};\n        resumeClient.reserves.total += Number(r.total || 0); resumeClient.reserves.ouvertes += Number(r.ouvertes || 0); resumeClient.reserves.levees += Number(r.levees || 0);\n        resumeClient.equipements.total += Number(e.total || 0); resumeClient.equipements.actifs += Number(e.actifs || 0); resumeClient.equipements.remplaces += Number(e.remplaces || 0);\n      }\n      setResume(resumeClient);\n      setSites(lignes);\n      setHealthEnabled(enabled);\n      setLoading(false);\n      setClientHealth(enabled ? await getClientHealth(clientId, statsBySite) : null);`;
  text = replaceOnce(text, oldLoad, newLoad, 'ClientPatrimoine bulk loader');
  const listAnchor = `  return <FlatList\n    data={sites}\n    keyExtractor={(item) => item.id}\n    contentContainerStyle={styles.content}`;
  const listNew = `  return <FlatList\n    style={{ flex: 1 }}\n    data={sites}\n    keyExtractor={(item) => item.id}\n    initialNumToRender={12}\n    maxToRenderPerBatch={10}\n    updateCellsBatchingPeriod={24}\n    windowSize={7}\n    removeClippedSubviews={false}\n    contentContainerStyle={[styles.content, { paddingBottom: 34 }]}`;
  text = replaceOnce(text, listAnchor, listNew, 'ClientPatrimoine FlatList tuning');
  write(path, text);
}

function patchPilotageBulk() {
  const path = 'ClientPilotageScreen.js';
  let text = read(path);
  text = replaceOnce(text,
    "import { getStatsSitePatrimoine } from './patrimoineDb.js';",
    "import { getStatsSitesPatrimoine } from './patrimoineDb.js';",
    'Pilotage bulk stats import'
  );
  text = replaceOnce(text,
    `      const statsEntries = await mapAvecConcurrence(m?.sites || [], 6, async (site) => [site.id, await getStatsSitePatrimoine(site.id)]);\n      const nextStats = new Map(statsEntries);`,
    `      const nextStats = await getStatsSitesPatrimoine(clientId);`,
    'Pilotage bulk stats query'
  );
  text = replaceOnce(text,
    `    const map = {};\n    for (const issue of cell.issues || []) map[issueKey(issue)] = await getMatrixCellPhotos(issue);\n    setPhotos(map);`,
    `    const entries = await mapAvecConcurrence(cell.issues || [], 4, async (issue) => [issueKey(issue), await getMatrixCellPhotos(issue)]);\n    setPhotos(Object.fromEntries(entries));`,
    'Pilotage photo concurrency'
  );
  write(path, text);
}

function patchTechnicalMatrix() {
  const path = 'clientTechnicalMatrix.js';
  let text = read(path);
  if (!text.includes('const controlsByVisit = new Map();')) {
    const old = `  const rows = [];\n  for (const visit of latest.values()) {\n    const [controls, remarks] = await Promise.all([\n      db.getAllAsync(\`SELECT section_code,cle,avis,commentaire FROM controles_visite WHERE visite_id=? ORDER BY section_code,cle\`, [visit.id]),\n      db.getAllAsync(\`SELECT id remarque_id,controle_key,poste,prestation,delai,estimatif,origine,reference_type,reference_id,reference_libelle,COALESCE(criticite,2) criticite,COALESCE(criticite_defaut,2) criticite_defaut,COALESCE(criticite_modifiee,0) criticite_modifiee,cree_le FROM remarques WHERE visite_id=? ORDER BY criticite DESC,cree_le,id\`, [visit.id]),\n    ]);`;
    const next = `  const rows = [];\n  const latestVisits = [...latest.values()];\n  const controlsByVisit = new Map();\n  const remarksByVisit = new Map();\n  const ids = latestVisits.map((visit) => visit.id);\n  if (ids.length) {\n    const placeholders = ids.map(() => '?').join(',');\n    const [allControls, allRemarks] = await Promise.all([\n      db.getAllAsync(\`SELECT visite_id,section_code,cle,avis,commentaire FROM controles_visite WHERE visite_id IN (\${placeholders}) ORDER BY visite_id,section_code,cle\`, ids),\n      db.getAllAsync(\`SELECT visite_id,id remarque_id,controle_key,poste,prestation,delai,estimatif,origine,reference_type,reference_id,reference_libelle,COALESCE(criticite,2) criticite,COALESCE(criticite_defaut,2) criticite_defaut,COALESCE(criticite_modifiee,0) criticite_modifiee,cree_le FROM remarques WHERE visite_id IN (\${placeholders}) ORDER BY visite_id,criticite DESC,cree_le,id\`, ids),\n    ]);\n    for (const row of allControls || []) { if (!controlsByVisit.has(row.visite_id)) controlsByVisit.set(row.visite_id, []); controlsByVisit.get(row.visite_id).push(row); }\n    for (const row of allRemarks || []) { if (!remarksByVisit.has(row.visite_id)) remarksByVisit.set(row.visite_id, []); remarksByVisit.get(row.visite_id).push(row); }\n  }\n  for (const visit of latestVisits) {\n    const controls = controlsByVisit.get(visit.id) || [];\n    const remarks = remarksByVisit.get(visit.id) || [];`;
    if (!text.includes(old)) throw new Error('technical matrix N+1 anchor not found');
    text = text.replace(old, next);
  }
  write(path, text);
}

patchDbCounts();
patchPatrimoine();
patchSiteHealth();
patchClientPatrimoine();
patchPilotageBulk();
patchTechnicalMatrix();
console.log('Large-client query patch applied: bulk patrimoine stats, bounded health work and batched technical matrix reads.');
