import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { mapRemoteTrameToLocal } from './apiVisitPreparationDb.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function parseJson(value) { try { return JSON.parse(value || 'null'); } catch { return null; } }
function unique(rows) { return rows.length === 1 ? rows[0] : null; }
function validApiId(value) {
  const raw = clean(value);
  if (!/^\d+$/.test(raw)) return false;
  const number = Number(raw);
  return Number.isSafeInteger(number) && number > 0;
}
function countReferenceCriteria(reference) {
  const categories = Array.isArray(reference?.trame?.categories) ? reference.trame.categories : [];
  return categories.reduce((total, category) => total + (Array.isArray(category?.sousCategories) ? category.sousCategories : [])
    .reduce((subtotal, subCategory) => subtotal + (Array.isArray(subCategory?.criteres) ? subCategory.criteres.length : 0), 0), 0);
}
function bindingError(message, code, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

async function loadVisit(db, visiteId) {
  return db.getFirstAsync(`SELECT v.*,s.client_id,s.nom_site,c.nom AS nom_client,c.code_exploitant AS client_code
    FROM visites v JOIN sites s ON s.id=v.site_id JOIN clients c ON c.id=s.client_id WHERE v.id=?`, [String(visiteId)]);
}

function localBindingState(local, trameId) {
  const reference = parseJson(local?.reference_json);
  if (!reference || typeof reference !== 'object') {
    return { compatible: false, compatibilityReason: 'Référence Intranet illisible pour ce local. Actualise les données du client.' };
  }
  const cachedLocalId = clean(local?.remote_local_id);
  const cachedSiteId = clean(local?.remote_site_id);
  const referenceLocalId = clean(reference?.local?.id);
  const referenceSiteId = clean(reference?.site?.id);
  if (![cachedLocalId, cachedSiteId, referenceLocalId, referenceSiteId].every(validApiId)) {
    return { compatible: false, compatibilityReason: 'Référence Intranet incomplète ou identifiants local/site invalides. Actualise les données du client.' };
  }
  if (referenceLocalId !== cachedLocalId || referenceSiteId !== cachedSiteId) {
    return { compatible: false, compatibilityReason: 'La référence Intranet ne correspond plus au local/site du cache. Actualise les données du client.' };
  }

  const remoteTrameId = clean(reference?.trame?.id) || clean(local?.remote_trame_id);
  if (!validApiId(remoteTrameId)) {
    return { compatible: false, compatibilityReason: 'Aucune trame Intranet exploitable n’est configurée pour ce local.' };
  }
  if (!countReferenceCriteria(reference)) {
    return { compatible: false, compatibilityReason: 'La trame Intranet de ce local ne contient aucun critère de préparation.' };
  }

  const trameForMapping = { ...(reference?.trame || {}), id: remoteTrameId, nom: reference?.trame?.nom || local?.remote_trame_nom || null };
  const mapped = mapRemoteTrameToLocal(trameForMapping);
  if (!mapped) return { compatible: false, compatibilityReason: `Trame Intranet non reconnue par METRA (${trameForMapping.nom || remoteTrameId}).` };
  if (mapped !== trameId) return { compatible: false, compatibilityReason: `Trame incompatible avec la visite METRA (${trameForMapping.nom || remoteTrameId}).` };

  const latestId = clean(reference?.derniereVisite?.id);
  if (latestId && !validApiId(latestId)) {
    return { compatible: false, compatibilityReason: 'Identifiant de dernière visite Intranet invalide. Actualise les données du client.' };
  }

  const seen = new Set();
  for (const category of Array.isArray(reference?.trame?.categories) ? reference.trame.categories : []) {
    if (!validApiId(category?.id)) return { compatible: false, compatibilityReason: 'La trame Intranet contient une catégorie sans identifiant valide. Actualise les données du client.' };
    for (const subCategory of Array.isArray(category?.sousCategories) ? category.sousCategories : []) {
      if (!validApiId(subCategory?.id)) return { compatible: false, compatibilityReason: 'La trame Intranet contient une sous-catégorie sans identifiant valide. Actualise les données du client.' };
      for (const criterion of Array.isArray(subCategory?.criteres) ? subCategory.criteres : []) {
        if (!validApiId(criterion?.id)) return { compatible: false, compatibilityReason: 'La trame Intranet contient un critère sans identifiant valide. Actualise les données du client.' };
        const key = `${clean(category.id)}:${clean(subCategory.id)}:${clean(criterion.id)}`;
        if (seen.has(key)) return { compatible: false, compatibilityReason: `La trame Intranet contient une branche de critère dupliquée (${key}). Actualise les données du client.` };
        seen.add(key);
      }
    }
  }
  return { compatible: true, compatibilityReason: null, remoteTrameId, reference };
}

async function linkedClientsForVisit(db, visite) {
  const rows = await db.getAllAsync(`SELECT remote_client_id,local_client_id,nom,code_everwin,ville,agence_libelle
    FROM api_client_links WHERE autorise=1 AND local_client_id=? ORDER BY remote_client_id`, [visite.client_id]);
  return rows.filter((row) => validApiId(row.remote_client_id));
}

async function resolveImportedClientId(db, visite) {
  const clients = await linkedClientsForVisit(db, visite);
  if (!clients.length) {
    throw bindingError('Ce client METRA n’a pas été importé depuis l’Intranet. La visite ne peut être renvoyée vers aucun autre client.', 'imported_client_required');
  }
  const frozen = clean(visite.api_remote_client_id);
  if (frozen && clients.some((row) => clean(row.remote_client_id) === frozen)) return frozen;
  if (clients.length === 1) return clean(clients[0].remote_client_id);

  const siteCandidates = await db.getAllAsync(`SELECT DISTINCT c.remote_client_id
    FROM api_client_links c
    JOIN api_client_site_links cs ON cs.remote_client_id=c.remote_client_id AND cs.remote_present=1
    JOIN api_site_links s ON s.remote_site_id=cs.remote_site_id AND s.remote_present=1
    WHERE c.autorise=1 AND c.local_client_id=? AND COALESCE(s.local_site_id,cs.local_site_id)=?`, [visite.client_id, visite.site_id]);
  const valid = siteCandidates.filter((row) => validApiId(row.remote_client_id));
  if (valid.length === 1) return clean(valid[0].remote_client_id);
  throw bindingError('Plusieurs identifiants Intranet sont liés à ce même client METRA. METRA refuse de choisir un autre client au hasard.', 'imported_client_ambiguous');
}

async function resolveImportedSiteId(db, visite, remoteClientId) {
  const rows = await db.getAllAsync(`SELECT DISTINCT s.remote_site_id
    FROM api_client_site_links cs
    JOIN api_site_links s ON s.remote_site_id=cs.remote_site_id
    WHERE cs.remote_client_id=? AND cs.remote_present=1 AND s.remote_present=1
      AND COALESCE(s.local_site_id,cs.local_site_id)=?`, [remoteClientId, visite.site_id]);
  const valid = rows.filter((row) => validApiId(row.remote_site_id));
  if (valid.length === 1) return clean(valid[0].remote_site_id);
  if (!valid.length) {
    throw bindingError('Ce site METRA n’est pas relié au client Intranet importé. Actualise ou réimporte ce client avant l’envoi.', 'imported_site_missing', { remoteClientId });
  }
  const frozenLocal = clean(visite.api_remote_local_id);
  if (frozenLocal) {
    const local = await db.getFirstAsync(`SELECT remote_site_id FROM api_local_links WHERE remote_local_id=? AND remote_present=1`, [frozenLocal]);
    const remoteSiteId = clean(local?.remote_site_id);
    if (valid.some((row) => clean(row.remote_site_id) === remoteSiteId)) return remoteSiteId;
  }
  throw bindingError('Plusieurs sites Intranet correspondent à ce site METRA pour le client importé. METRA refuse de deviner la destination.', 'imported_site_ambiguous', { remoteClientId });
}

async function resolveImportedLocalId(db, visite, remoteClientId, remoteSiteId) {
  const rows = await db.getAllAsync(`SELECT remote_local_id,remote_site_id,local_installation_id,designation,remote_trame_id,remote_trame_nom,
      derniere_visite_id,derniere_visite_date,criteria_count,material_count,reference_json
    FROM api_local_links WHERE remote_site_id=? AND remote_present=1 ORDER BY designation,remote_local_id`, [remoteSiteId]);
  const locals = rows.map((row) => ({ ...row, ...localBindingState(row, visite.trame_id) }));
  const sendable = locals.filter((row) => row.compatible);
  const frozen = clean(visite.api_remote_local_id);
  if (frozen && sendable.some((row) => clean(row.remote_local_id) === frozen)) return frozen;

  if (clean(visite.installation_id)) {
    const installed = sendable.filter((row) => clean(row.local_installation_id) === clean(visite.installation_id));
    if (installed.length === 1) return clean(installed[0].remote_local_id);
    if (installed.length > 1) {
      throw bindingError('Plusieurs locaux Intranet sont liés à la même installation METRA. METRA refuse de choisir au hasard.', 'imported_local_ambiguous', { remoteClientId });
    }
  }
  if (sendable.length === 1) return clean(sendable[0].remote_local_id);
  if (!sendable.length) {
    const reasons = [...new Set(locals.map((row) => row.compatibilityReason).filter(Boolean))];
    throw bindingError(reasons[0] || 'Aucun local Intranet compatible n’est relié à ce site importé.', 'intranet_reference_refresh_required', { remoteClientId });
  }
  throw bindingError('Plusieurs locaux Intranet compatibles existent sur ce site et la visite n’est liée à aucune installation précise. METRA refuse de deviner le local.', 'imported_local_ambiguous', { remoteClientId });
}

export async function getVisitIntranetBindingOptions(visiteId) {
  const db = await getDb();
  const visite = await loadVisit(db, visiteId);
  if (!visite) throw new Error('Visite METRA introuvable.');
  if (Number(visite.api_is_historical) === 1) throw new Error('Une visite historique Intranet ne peut pas être renvoyée comme nouvelle visite.');

  const clients = await linkedClientsForVisit(db, visite);
  const selectedClientId = await resolveImportedClientId(db, visite).catch(() => null);
  let sites = [];
  let selectedSiteId = null;
  let locals = [];
  let suggestedLocalId = null;
  if (selectedClientId) {
    sites = await db.getAllAsync(`SELECT s.remote_site_id,cs.remote_client_id,COALESCE(s.local_site_id,cs.local_site_id) AS local_site_id,s.nom,s.synced_at
      FROM api_client_site_links cs JOIN api_site_links s ON s.remote_site_id=cs.remote_site_id
      WHERE cs.remote_client_id=? AND cs.remote_present=1 AND s.remote_present=1 AND COALESCE(s.local_site_id,cs.local_site_id)=?
      ORDER BY s.nom,s.remote_site_id`, [selectedClientId, visite.site_id]);
    selectedSiteId = await resolveImportedSiteId(db, visite, selectedClientId).catch(() => null);
  }
  if (selectedSiteId) {
    const rawLocals = await db.getAllAsync(`SELECT remote_local_id,remote_site_id,local_installation_id,designation,remote_trame_id,remote_trame_nom,
      derniere_visite_id,derniere_visite_date,criteria_count,material_count,reference_json FROM api_local_links
      WHERE remote_site_id=? AND remote_present=1 ORDER BY designation,remote_local_id`, [selectedSiteId]);
    locals = rawLocals.map((row) => ({ ...row, ...localBindingState(row, visite.trame_id) }));
    suggestedLocalId = await resolveImportedLocalId(db, visite, selectedClientId, selectedSiteId).catch(() => null);
  }
  return { visite, clients, sites, locals, selectedClientId, selectedSiteId, suggestedLocalId };
}

export async function bindVisitToImportedClientTarget(visiteId) {
  const db = await getDb();
  const visite = await loadVisit(db, visiteId);
  if (!visite) throw new Error('Visite METRA introuvable.');
  if (Number(visite.api_is_historical) === 1) throw new Error('Une visite historique Intranet ne peut pas être renvoyée comme nouvelle visite.');
  const clientId = await resolveImportedClientId(db, visite);
  try {
    const siteId = await resolveImportedSiteId(db, visite, clientId);
    const localId = await resolveImportedLocalId(db, visite, clientId, siteId);
    return bindVisitToIntranetTarget(visiteId, { remoteClientId: clientId, remoteSiteId: siteId, remoteLocalId: localId });
  } catch (error) {
    if (!error.remoteClientId) error.remoteClientId = clientId;
    throw error;
  }
}

export async function bindVisitToIntranetTarget(visiteId, { remoteClientId, remoteSiteId, remoteLocalId } = {}) {
  const clientId = clean(remoteClientId);
  const siteId = clean(remoteSiteId);
  const localId = clean(remoteLocalId);
  if (![clientId, siteId, localId].every(validApiId)) throw new Error('Les identifiants client, site ou local Intranet sont invalides. Actualise les données avant de continuer.');

  const db = await getDb();
  const visite = await loadVisit(db, visiteId);
  if (!visite) throw new Error('Visite METRA introuvable.');
  if (Number(visite.api_is_historical) === 1) throw new Error('Une visite historique Intranet ne peut pas être renvoyée comme nouvelle visite.');
  const queued = await db.getFirstAsync(`SELECT status FROM api_visit_outbox WHERE visite_id=?`, [String(visiteId)]);
  if (queued) throw new Error('Cette visite possède déjà un envoi Intranet. La destination ne peut plus être changée pour cet envoi.');

  const client = await db.getFirstAsync(`SELECT * FROM api_client_links WHERE remote_client_id=? AND local_client_id=? AND autorise=1`, [clientId, visite.client_id]);
  if (!client) throw bindingError('La visite ne peut être envoyée que vers le client Intranet ayant été importé dans ce client METRA.', 'wrong_imported_client');
  const site = await db.getFirstAsync(`SELECT s.*,cs.local_site_id AS relation_local_site_id FROM api_client_site_links cs
    JOIN api_site_links s ON s.remote_site_id=cs.remote_site_id
    WHERE cs.remote_client_id=? AND cs.remote_site_id=? AND cs.remote_present=1 AND s.remote_present=1
      AND COALESCE(s.local_site_id,cs.local_site_id)=?`, [clientId, siteId, visite.site_id]);
  if (!site) throw bindingError('Ce site ne correspond pas au site importé pour ce client Intranet.', 'wrong_imported_site', { remoteClientId: clientId });
  const local = await db.getFirstAsync(`SELECT * FROM api_local_links WHERE remote_local_id=? AND remote_site_id=? AND remote_present=1`, [localId, siteId]);
  if (!local) throw bindingError('Local Intranet introuvable sur le site importé. Actualise les données du client.', 'intranet_reference_refresh_required', { remoteClientId: clientId });

  const state = localBindingState(local, visite.trame_id);
  if (!state.compatible) throw bindingError(state.compatibilityReason, 'intranet_reference_refresh_required', { remoteClientId: clientId });
  const reference = state.reference;
  const remoteTrameId = state.remoteTrameId;
  const mappedTrame = mapRemoteTrameToLocal({ ...(reference?.trame || {}), id: remoteTrameId, nom: reference?.trame?.nom || local.remote_trame_nom });
  if (!mappedTrame || mappedTrame !== visite.trame_id) throw new Error(`Trame incompatible : la visite METRA utilise « ${visite.trame_id} » et le local Intranet utilise « ${reference?.trame?.nom || remoteTrameId} ».`);

  const existingProvenances = await db.getAllAsync(`SELECT id,details_json FROM provenances WHERE entite_type='visite' AND entite_id=? AND origine='api_symfony' ORDER BY importe_le DESC`, [String(visiteId)]);
  const previousBindingIds = [];
  for (const row of existingProvenances) {
    const details = parseJson(row.details_json);
    if (details?.sourceType === 'imported_latest_visit') throw new Error('Une visite historique Intranet ne peut pas être réutilisée comme nouvelle visite.');
    if (details?.sourceType === 'upload_binding' && row.id) previousBindingIds.push(String(row.id));
  }

  const frozenTrame = { ...(reference?.trame || {}), id: remoteTrameId, nom: reference?.trame?.nom || local.remote_trame_nom || null };
  const details = {
    ...reference,
    trame: frozenTrame,
    schemaVersion: 5,
    sourceType: 'upload_binding',
    remoteLocalId: localId,
    binding: { remoteClientId: clientId, remoteSiteId: siteId, remoteLocalId: localId, boundAt: new Date().toISOString(), policy: 'same_imported_client' },
  };

  await db.withTransactionAsync(async () => {
    for (const provenanceId of previousBindingIds) await db.runAsync(`DELETE FROM provenances WHERE id=?`, [provenanceId]);
    await db.runAsync(`UPDATE visites SET api_remote_client_id=?,api_remote_local_id=?,api_remote_trame_id=?,api_source_remote_visit_id=?,modifie_le=datetime('now') WHERE id=?`,
      [clientId, localId, remoteTrameId, clean(reference?.derniereVisite?.id) || null, String(visiteId)]);
    await db.runAsync(`UPDATE api_site_links SET local_site_id=COALESCE(local_site_id,?) WHERE remote_site_id=?`, [visite.site_id, siteId]);
    await db.runAsync(`UPDATE api_client_site_links SET local_site_id=COALESCE(local_site_id,?) WHERE remote_client_id=? AND remote_site_id=?`, [visite.site_id, clientId, siteId]);
    if (clean(visite.installation_id)) await db.runAsync(`UPDATE api_local_links SET local_installation_id=COALESCE(local_installation_id,?) WHERE remote_local_id=?`, [visite.installation_id, localId]);
    await db.runAsync(`INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json) VALUES(?,?,?,?,?,?)`,
      [createId(), 'visite', String(visiteId), 'api_symfony', localId, JSON.stringify(details)]);
  });

  return {
    remoteClientId: clientId,
    remoteSiteId: siteId,
    remoteLocalId: localId,
    clientName: client.nom,
    siteName: site.nom,
    localName: local.designation || reference?.local?.designation || `Local ${localId}`,
    trameName: frozenTrame.nom || null,
  };
}
