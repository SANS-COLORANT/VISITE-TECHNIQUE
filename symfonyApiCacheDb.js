import { openAppDatabase } from './database/index.js';
import { createId } from './database/ids.js';

const DEFAULT_BASE_URL = 'https://intranet-energieetservice.com';
const clean = (v) => String(v ?? '').trim();
const normalize = (v) => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const json = (value) => JSON.stringify(value ?? null);
const has = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const list = (value) => Array.isArray(value) ? value : [];
const nullableString = (value) => value == null || value === '' ? null : String(value);
const remoteId = (value) => value == null || value === '' ? null : clean(value);
const boolValue = (value) => value === true || value === 1 || value === '1' || normalize(value) === 'true';
const orderValue = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : (1000000 + fallback);
};

async function db() { return openAppDatabase(); }

function ordered(items, mapper) {
  return list(items)
    .map((item, index) => ({ value: mapper(item || {}, index), index }))
    .sort((a, b) => orderValue(a.value?.ordre, a.index) - orderValue(b.value?.ordre, b.index))
    .map((entry) => entry.value);
}

function normalizeCriterion(criterion, categoryId, subCategoryId, index) {
  const id = remoteId(criterion?.id);
  const visiteSourceId = remoteId(criterion?.visiteSourceId ?? criterion?.visite_source_id);
  return {
    ...criterion,
    id,
    nom: nullableString(criterion?.nom ?? criterion?.nom_critere),
    ordre: criterion?.ordre ?? index,
    avisApplicable: boolValue(criterion?.avisApplicable ?? criterion?.avis_applicable ?? false),
    avis: nullableString(criterion?.avis),
    commentaire: nullableString(criterion?.commentaire),
    visiteSourceId,
    // Une même entité critère peut être réutilisée dans plusieurs branches de
    // trame. Le chemin complet évite de fusionner deux occurrences distinctes.
    referencePath: [categoryId, subCategoryId, id].map((v) => v || '?').join(':'),
  };
}

function normalizeSubCategory(subCategory, categoryId, index) {
  const id = remoteId(subCategory?.id);
  return {
    ...subCategory,
    id,
    nom: nullableString(subCategory?.nom),
    ordre: subCategory?.ordre ?? index,
    criteres: ordered(subCategory?.criteres, (criterion, criterionIndex) => normalizeCriterion(criterion, categoryId, id, criterionIndex)),
  };
}

function normalizeCategory(category, index) {
  const id = remoteId(category?.id);
  return {
    ...category,
    id,
    nom: nullableString(category?.nom),
    ordre: category?.ordre ?? index,
    sousCategories: ordered(category?.sousCategories ?? category?.sous_categories, (subCategory, subIndex) => normalizeSubCategory(subCategory, id, subIndex)),
  };
}

function normalizeTrame(trame) {
  if (!trame || typeof trame !== 'object') return null;
  return {
    ...trame,
    id: remoteId(trame.id),
    nom: nullableString(trame.nom),
    categories: ordered(trame.categories, normalizeCategory),
  };
}

function normalizeRemark(remark) {
  return {
    ...remark,
    id: remoteId(remark?.id),
    poste: nullableString(remark?.poste),
    prestation: nullableString(remark?.prestation),
    dateReserve: nullableString(remark?.dateReserve ?? remark?.date_reserve),
    delai: nullableString(remark?.delai),
    etatAvancement: nullableString(remark?.etatAvancement ?? remark?.etat_avancement),
    estimatif: nullableString(remark?.estimatif),
  };
}

function normalizeMaterial(material) {
  return {
    ...material,
    id: remoteId(material?.id),
    categorie: nullableString(material?.categorie),
    nombre: nullableString(material?.nombre),
    designation: nullableString(material?.designation),
    numeroMateriel: nullableString(material?.numeroMateriel ?? material?.numero_materiel),
    reseauDesservi: nullableString(material?.reseauDesservi ?? material?.reseau_desservi),
    marque: nullableString(material?.marque),
    modele: nullableString(material?.modele),
    caracteristiques: nullableString(material?.caracteristiques),
    // Dans Symfony ces deux colonnes sont des chaînes : ne pas les convertir
    // implicitement en numéro/série pendant la préparation.
    annee: nullableString(material?.annee),
    etat: nullableString(material?.etat),
  };
}

function normalizeLatestVisit(visit) {
  if (!visit || typeof visit !== 'object') return null;
  return {
    ...visit,
    id: remoteId(visit.id),
    date: nullableString(visit.date),
    statut: nullableString(visit.statut),
  };
}

function countCriteria(trame) {
  return list(trame?.categories).reduce((total, category) => total + list(category?.sousCategories).reduce((subtotal, subCategory) => subtotal + list(subCategory?.criteres).length, 0), 0);
}

function countOlderCriterionSources(trame, latestVisitId) {
  const latest = remoteId(latestVisitId);
  let total = 0;
  for (const category of list(trame?.categories)) {
    for (const subCategory of list(category?.sousCategories)) {
      for (const criterion of list(subCategory?.criteres)) {
        const source = remoteId(criterion?.visiteSourceId);
        if (source && (!latest || source !== latest)) total += 1;
      }
    }
  }
  return total;
}

export function normalizePreparationPayload(payload = {}) {
  const normalizedVisits = list(payload?.visites).map((entry) => {
    const local = entry?.local && typeof entry.local === 'object' ? {
      ...entry.local,
      id: remoteId(entry.local.id),
      designation: nullableString(entry.local.designation),
    } : null;
    const site = entry?.site && typeof entry.site === 'object' ? {
      ...entry.site,
      id: remoteId(entry.site.id),
      nom: nullableString(entry.site.nom),
    } : null;
    const latestVisit = normalizeLatestVisit(entry?.derniereVisite ?? entry?.derniere_visite);
    const trame = normalizeTrame(entry?.trame);
    const remarques = list(entry?.remarques).map(normalizeRemark);
    const materiels = list(entry?.materiels).map(normalizeMaterial);
    const notes = list(entry?.notes);
    return {
      ...entry,
      local,
      site,
      derniereVisite: latestVisit,
      trame,
      remarques,
      materiels,
      notes,
      preparationMeta: {
        criteriaCount: countCriteria(trame),
        historicalCriteriaCount: countOlderCriterionSources(trame, latestVisit?.id),
        remarkCount: remarques.length,
        materialCount: materiels.length,
        criteriaAreReferenceOnly: true,
        remarksAreLatestVisitReferenceOnly: true,
        materialsAreCurrentLocalPatrimoine: true,
        historicalPhotosAvailable: false,
        historicalNotesAvailable: false,
        historicalConclusionAvailable: false,
      },
    };
  }).filter((entry) => entry.local?.id && entry.site?.id);

  return {
    ...payload,
    client: payload?.client && typeof payload.client === 'object' ? {
      ...payload.client,
      id: remoteId(payload.client.id),
      nom: nullableString(payload.client.nom),
    } : null,
    visites: normalizedVisits,
  };
}

export async function getApiSyncState() {
  const database = await db();
  return (await database.getFirstAsync(`SELECT * FROM api_sync_state WHERE id=1`)) || { id: 1, base_url: DEFAULT_BASE_URL };
}

export async function updateApiSyncState(patch = {}) {
  const database = await db();
  const current = await getApiSyncState();
  await database.runAsync(
    `INSERT INTO api_sync_state(id,base_url,tablette_id,last_clients_sync_at,last_success_at,last_error,modifie_le)
     VALUES(1,?,?,?,?,?,datetime('now'))
     ON CONFLICT(id) DO UPDATE SET base_url=excluded.base_url,tablette_id=excluded.tablette_id,
       last_clients_sync_at=excluded.last_clients_sync_at,last_success_at=excluded.last_success_at,
       last_error=excluded.last_error,modifie_le=datetime('now')`,
    [has(patch, 'base_url') ? patch.base_url : (current.base_url ?? DEFAULT_BASE_URL),
      has(patch, 'tablette_id') ? patch.tablette_id : (current.tablette_id ?? null),
      has(patch, 'last_clients_sync_at') ? patch.last_clients_sync_at : (current.last_clients_sync_at ?? null),
      has(patch, 'last_success_at') ? patch.last_success_at : (current.last_success_at ?? null),
      has(patch, 'last_error') ? patch.last_error : (current.last_error ?? null)]
  );
}

export async function cacheAuthorizedClients(clients = []) {
  const database = await db();
  await database.withTransactionAsync(async () => {
    await database.runAsync(`UPDATE api_client_links SET autorise=0`);
    for (const client of clients || []) {
      const id = clean(client?.id); if (!id) continue;
      const agence = client?.agence_energie_et_service || null;
      await database.runAsync(
        `INSERT INTO api_client_links(remote_client_id,local_client_id,nom,categorie,code_everwin,adresse_postale,ville,agence_id,agence_libelle,autorise,payload_json,synced_at)
         VALUES(?,?,?,?,?,?,?,?,?,1,?,datetime('now'))
         ON CONFLICT(remote_client_id) DO UPDATE SET nom=excluded.nom,categorie=excluded.categorie,code_everwin=excluded.code_everwin,
           adresse_postale=excluded.adresse_postale,ville=excluded.ville,agence_id=excluded.agence_id,agence_libelle=excluded.agence_libelle,
           autorise=1,payload_json=excluded.payload_json,synced_at=datetime('now')`,
        [id, null, clean(client?.nom) || `Client ${id}`, client?.categorie ?? null, client?.code_everwin ?? null,
          client?.adresse_postale ?? null, client?.ville ?? null, agence?.id != null ? clean(agence.id) : null,
          agence?.libelle ?? null, json(client)]
      );
    }
  });
  await updateApiSyncState({ last_clients_sync_at: new Date().toISOString(), last_success_at: new Date().toISOString(), last_error: null });
}

export async function cachePreparation(remoteClientId, payload) {
  const clientId = clean(remoteClientId); if (!clientId) throw new Error('Client API requis');
  const database = await db();
  const normalized = normalizePreparationPayload(payload);
  const visites = normalized.visites;
  const siteIds = [...new Set(visites.map((visite) => remoteId(visite?.site?.id)).filter(Boolean))];

  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `INSERT INTO api_preparation_cache(remote_client_id,payload_json,synced_at) VALUES(?,?,datetime('now'))
       ON CONFLICT(remote_client_id) DO UPDATE SET payload_json=excluded.payload_json,synced_at=datetime('now')`, [clientId, json(normalized)]
    );

    // Le schéma Symfony passe par LOT <-> SITE : la relation client/site est
    // donc stockée séparément de l'identité globale du site. Une synchro d'un
    // client ne peut plus effacer/réaffecter un site partagé par un autre.
    await database.runAsync(`UPDATE api_client_site_links SET remote_present=0 WHERE remote_client_id=?`, [clientId]);

    // LOCAL appartient directement à SITE. Pour chaque site réellement présent
    // dans cette réponse complète, on marque d'abord son ancien listing local
    // comme absent, puis les locaux reçus sont réactivés ci-dessous.
    for (const siteId of siteIds) {
      await database.runAsync(`UPDATE api_local_links SET remote_present=0 WHERE remote_site_id=?`, [siteId]);
    }

    for (const visite of visites) {
      const siteId = remoteId(visite?.site?.id); if (!siteId) continue;
      await database.runAsync(
        `INSERT INTO api_site_links(remote_site_id,remote_client_id,nom,remote_present,payload_json,synced_at) VALUES(?,?,?,?,?,datetime('now'))
         ON CONFLICT(remote_site_id) DO UPDATE SET nom=excluded.nom,remote_present=1,payload_json=excluded.payload_json,synced_at=datetime('now')`,
        [siteId, clientId, clean(visite?.site?.nom) || `Site ${siteId}`, 1, json(visite?.site)]
      );
      await database.runAsync(
        `INSERT INTO api_client_site_links(remote_client_id,remote_site_id,remote_present,synced_at)
         VALUES(?,?,1,datetime('now'))
         ON CONFLICT(remote_client_id,remote_site_id) DO UPDATE SET remote_present=1,synced_at=datetime('now')`,
        [clientId, siteId]
      );

      const localId = remoteId(visite?.local?.id); if (!localId) continue;
      const meta = visite.preparationMeta || {};
      await database.runAsync(
        `INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,remote_trame_id,remote_trame_nom,derniere_visite_id,derniere_visite_date,derniere_visite_statut,reference_json,remote_present,criteria_count,historical_criteria_count,remark_count,material_count,synced_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
         ON CONFLICT(remote_local_id) DO UPDATE SET remote_site_id=excluded.remote_site_id,designation=excluded.designation,
           remote_trame_id=excluded.remote_trame_id,remote_trame_nom=excluded.remote_trame_nom,derniere_visite_id=excluded.derniere_visite_id,
           derniere_visite_date=excluded.derniere_visite_date,derniere_visite_statut=excluded.derniere_visite_statut,reference_json=excluded.reference_json,
           remote_present=1,criteria_count=excluded.criteria_count,historical_criteria_count=excluded.historical_criteria_count,
           remark_count=excluded.remark_count,material_count=excluded.material_count,synced_at=datetime('now')`,
        [localId, siteId, visite?.local?.designation ?? null, visite?.trame?.id ?? null,
          visite?.trame?.nom ?? null, visite?.derniereVisite?.id ?? null,
          visite?.derniereVisite?.date ?? null, visite?.derniereVisite?.statut ?? null, json(visite), 1,
          Number(meta.criteriaCount || 0), Number(meta.historicalCriteriaCount || 0), Number(meta.remarkCount || 0), Number(meta.materialCount || 0)]
      );
    }
  });
  await updateApiSyncState({ last_success_at: new Date().toISOString(), last_error: null });
}

export async function searchCachedDirectory(query = '') {
  const database = await db();
  const q = normalize(query);
  const clients = await database.getAllAsync(`SELECT * FROM api_client_links WHERE autorise=1 ORDER BY nom`);
  const sites = await database.getAllAsync(`
    SELECT s.remote_site_id, cs.remote_client_id, COALESCE(s.local_site_id,cs.local_site_id) AS local_site_id,
      s.cree_localement, s.nom, s.payload_json, s.synced_at,
      c.nom AS client_nom, c.ville AS client_ville, c.code_everwin AS client_code_everwin,
      COUNT(l.remote_local_id) AS local_count,
      MAX(l.derniere_visite_date) AS derniere_visite_date,
      GROUP_CONCAT(DISTINCT l.remote_trame_nom) AS trames,
      GROUP_CONCAT(l.designation, ' ') AS local_designations,
      COALESCE(SUM(l.material_count),0) AS material_count,
      COALESCE(SUM(l.remark_count),0) AS remark_count
    FROM api_client_site_links cs
    JOIN api_site_links s ON s.remote_site_id=cs.remote_site_id
    JOIN api_client_links c ON c.remote_client_id=cs.remote_client_id
    LEFT JOIN api_local_links l ON l.remote_site_id=s.remote_site_id AND l.remote_present=1
    WHERE c.autorise=1 AND cs.remote_present=1
    GROUP BY cs.remote_client_id,s.remote_site_id
    ORDER BY c.nom,s.nom`);
  if (!q) return { clients, sites };
  return {
    clients: clients.filter((c) => normalize([c.nom,c.categorie,c.code_everwin,c.ville,c.agence_libelle,c.adresse_postale].join(' ')).includes(q)),
    sites: sites.filter((s) => normalize([s.nom,s.client_nom,s.client_ville,s.client_code_everwin,s.trames,s.local_designations].join(' ')).includes(q)),
  };
}

export async function getCachedClient(remoteClientId) {
  return (await db()).getFirstAsync(`SELECT * FROM api_client_links WHERE remote_client_id=?`, [clean(remoteClientId)]);
}

export async function listCachedSites(remoteClientId) {
  return (await db()).getAllAsync(`
    SELECT s.remote_site_id, cs.remote_client_id, COALESCE(s.local_site_id,cs.local_site_id) AS local_site_id,
      s.cree_localement, s.nom, s.payload_json, s.synced_at,
      COUNT(l.remote_local_id) AS local_count, MAX(l.derniere_visite_date) AS derniere_visite_date,
      GROUP_CONCAT(DISTINCT l.remote_trame_nom) AS trames,
      COALESCE(SUM(l.material_count),0) AS material_count,
      COALESCE(SUM(l.remark_count),0) AS remark_count
    FROM api_client_site_links cs
    JOIN api_site_links s ON s.remote_site_id=cs.remote_site_id
    LEFT JOIN api_local_links l ON l.remote_site_id=s.remote_site_id AND l.remote_present=1
    WHERE cs.remote_client_id=? AND cs.remote_present=1
    GROUP BY cs.remote_client_id,s.remote_site_id
    ORDER BY s.nom`, [clean(remoteClientId)]);
}

export async function listCachedLocals(remoteSiteId) {
  return (await db()).getAllAsync(`SELECT * FROM api_local_links WHERE remote_site_id=? AND remote_present=1 ORDER BY designation`, [clean(remoteSiteId)]);
}

export async function getCachedLocalReference(remoteLocalId) {
  const row = await (await db()).getFirstAsync(`SELECT reference_json FROM api_local_links WHERE remote_local_id=? AND remote_present=1`, [clean(remoteLocalId)]);
  if (!row?.reference_json) return null;
  try { return JSON.parse(row.reference_json); } catch { return null; }
}

export async function setCachedLocalInstallation(remoteLocalId, localInstallationId) {
  const localId = clean(remoteLocalId);
  const installationId = clean(localInstallationId);
  if (!localId || !installationId) throw new Error('Association local / installation incomplète');
  await (await db()).runAsync(`UPDATE api_local_links SET local_installation_id=?,synced_at=synced_at WHERE remote_local_id=?`, [installationId, localId]);
}

export async function materializeCachedClient(remoteClientId) {
  const database = await db();
  const remote = await database.getFirstAsync(`SELECT * FROM api_client_links WHERE remote_client_id=?`, [clean(remoteClientId)]);
  if (!remote) throw new Error('Client API absent du cache local');
  if (remote.local_client_id) return remote.local_client_id;

  let existing = null;
  if (clean(remote.code_everwin)) {
    existing = await database.getFirstAsync(`SELECT id FROM clients WHERE lower(trim(COALESCE(code_exploitant,'')))=lower(trim(?)) LIMIT 1`, [clean(remote.code_everwin)]);
  }
  if (!existing && clean(remote.nom)) {
    existing = await database.getFirstAsync(`SELECT id FROM clients WHERE lower(trim(nom))=lower(trim(?)) LIMIT 1`, [clean(remote.nom)]);
  }
  if (existing?.id) {
    await database.runAsync(`UPDATE api_client_links SET local_client_id=?,cree_localement=0 WHERE remote_client_id=?`, [existing.id, remote.remote_client_id]);
    return existing.id;
  }

  const id = createId();
  const adresse = [remote.adresse_postale, remote.ville].filter(Boolean).join(' ');
  await database.runAsync(`INSERT INTO clients(id,nom,code_exploitant,adresse) VALUES(?,?,?,?)`, [id, remote.nom, remote.code_everwin || null, adresse || null]);
  await database.runAsync(`UPDATE api_client_links SET local_client_id=?,cree_localement=1 WHERE remote_client_id=?`, [id, remote.remote_client_id]);
  return id;
}

export async function materializeCachedSite(remoteSiteId, remoteClientId = null) {
  const database = await db();
  const siteRemoteId = clean(remoteSiteId);
  const requestedClientId = clean(remoteClientId);
  const remote = await database.getFirstAsync(`SELECT * FROM api_site_links WHERE remote_site_id=?`, [siteRemoteId]);
  if (!remote) throw new Error('Site API absent du cache local');

  let relation = null;
  if (requestedClientId) {
    relation = await database.getFirstAsync(
      `SELECT * FROM api_client_site_links WHERE remote_client_id=? AND remote_site_id=? LIMIT 1`,
      [requestedClientId, siteRemoteId]
    );
  }
  if (!relation) {
    relation = await database.getFirstAsync(
      `SELECT * FROM api_client_site_links WHERE remote_site_id=? AND remote_present=1 ORDER BY synced_at DESC LIMIT 1`,
      [siteRemoteId]
    );
  }

  // SITE est une identité physique globale dans Symfony. Même s'il apparaît
  // via plusieurs LOT/CLIENT, METRA conserve un seul patrimoine pour ce site.
  if (remote.local_site_id) {
    await database.runAsync(`UPDATE api_client_site_links SET local_site_id=? WHERE remote_site_id=?`, [remote.local_site_id, siteRemoteId]);
    return remote.local_site_id;
  }

  const relationClientId = relation?.remote_client_id || requestedClientId || remote.remote_client_id;
  if (!relationClientId) throw new Error('Client du site API introuvable');
  const clientId = await materializeCachedClient(relationClientId);
  const existing = await database.getFirstAsync(`SELECT id FROM sites WHERE client_id=? AND lower(trim(nom_site))=lower(trim(?)) LIMIT 1`, [clientId, clean(remote.nom)]);
  const localSiteId = existing?.id || createId();
  const createdLocally = existing?.id ? 0 : 1;
  if (!existing?.id) {
    await database.runAsync(`INSERT INTO sites(id,client_id,nom_site,statut) VALUES(?,?,?,'Actif')`, [localSiteId, clientId, remote.nom]);
  }

  await database.runAsync(
    `UPDATE api_site_links SET local_site_id=?,cree_localement=? WHERE remote_site_id=?`,
    [localSiteId, createdLocally, siteRemoteId]
  );
  await database.runAsync(
    `UPDATE api_client_site_links SET local_site_id=?,cree_localement=? WHERE remote_site_id=?`,
    [localSiteId, createdLocally, siteRemoteId]
  );
  return localSiteId;
}

export async function markApiError(error) {
  await updateApiSyncState({ last_error: String(error?.message || error || 'Erreur API') });
}
