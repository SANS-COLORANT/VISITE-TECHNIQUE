import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { mapRemoteTrameToLocal } from './apiVisitPreparationDb.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function normalize(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function parseJson(value) { try { return JSON.parse(value || 'null'); } catch { return null; } }
function unique(rows) { return rows.length === 1 ? rows[0] : null; }

async function loadVisit(db, visiteId) {
  return db.getFirstAsync(`SELECT v.*,s.client_id,s.nom_site,c.nom AS nom_client,c.code_exploitant AS client_code
    FROM visites v JOIN sites s ON s.id=v.site_id JOIN clients c ON c.id=s.client_id WHERE v.id=?`, [String(visiteId)]);
}

function compatibleLocal(local, trameId) {
  const mapped = mapRemoteTrameToLocal({ id: local.remote_trame_id, nom: local.remote_trame_nom });
  return !mapped || mapped === trameId;
}

export async function getVisitIntranetBindingOptions(visiteId, { remoteClientId = null, remoteSiteId = null } = {}) {
  const db = await getDb();
  const visite = await loadVisit(db, visiteId);
  if (!visite) throw new Error('Visite METRA introuvable.');
  if (Number(visite.api_is_historical) === 1) throw new Error('Une visite historique Intranet ne peut pas être renvoyée comme nouvelle visite.');

  const clients = await db.getAllAsync(`SELECT remote_client_id,local_client_id,nom,code_everwin,ville,agence_libelle
    FROM api_client_links WHERE autorise=1 ORDER BY nom,remote_client_id`);
  const requestedClient = clean(remoteClientId);
  const visitClient = clean(visite.api_remote_client_id);
  let selectedClientId = clients.some((row) => clean(row.remote_client_id) === requestedClient) ? requestedClient : null;
  if (!selectedClientId && clients.some((row) => clean(row.remote_client_id) === visitClient)) selectedClientId = visitClient;
  if (!selectedClientId) {
    const linked = clients.filter((row) => clean(row.local_client_id) === clean(visite.client_id));
    selectedClientId = clean(unique(linked)?.remote_client_id) || null;
  }
  if (!selectedClientId && clean(visite.client_code)) {
    const byCode = clients.filter((row) => normalize(row.code_everwin) === normalize(visite.client_code));
    selectedClientId = clean(unique(byCode)?.remote_client_id) || null;
  }
  if (!selectedClientId) {
    const byName = clients.filter((row) => normalize(row.nom) === normalize(visite.nom_client));
    selectedClientId = clean(unique(byName)?.remote_client_id) || null;
  }
  if (!selectedClientId && clients.length === 1) selectedClientId = clean(clients[0].remote_client_id);

  let sites = [];
  let selectedSiteId = null;
  if (selectedClientId) {
    sites = await db.getAllAsync(`SELECT s.remote_site_id,cs.remote_client_id,COALESCE(s.local_site_id,cs.local_site_id) AS local_site_id,s.nom,s.synced_at
      FROM api_client_site_links cs JOIN api_site_links s ON s.remote_site_id=cs.remote_site_id
      WHERE cs.remote_client_id=? AND cs.remote_present=1 AND s.remote_present=1 ORDER BY s.nom,s.remote_site_id`, [selectedClientId]);
    const requestedSite = clean(remoteSiteId);
    if (sites.some((row) => clean(row.remote_site_id) === requestedSite)) selectedSiteId = requestedSite;
    if (!selectedSiteId) {
      const linkedSites = sites.filter((row) => clean(row.local_site_id) === clean(visite.site_id));
      selectedSiteId = clean(unique(linkedSites)?.remote_site_id) || null;
    }
    if (!selectedSiteId) {
      const byName = sites.filter((row) => normalize(row.nom) === normalize(visite.nom_site));
      selectedSiteId = clean(unique(byName)?.remote_site_id) || null;
    }
    if (!selectedSiteId && sites.length === 1) selectedSiteId = clean(sites[0].remote_site_id);
  }

  let locals = [];
  let suggestedLocalId = null;
  if (selectedSiteId) {
    locals = await db.getAllAsync(`SELECT remote_local_id,remote_site_id,local_installation_id,designation,remote_trame_id,remote_trame_nom,
        derniere_visite_id,derniere_visite_date,criteria_count,material_count,reference_json
      FROM api_local_links WHERE remote_site_id=? AND remote_present=1 ORDER BY designation,remote_local_id`, [selectedSiteId]);
    const visitLocal = clean(visite.api_remote_local_id);
    if (locals.some((row) => clean(row.remote_local_id) === visitLocal)) suggestedLocalId = visitLocal;
    if (!suggestedLocalId && clean(visite.installation_id)) {
      const linkedLocals = locals.filter((row) => clean(row.local_installation_id) === clean(visite.installation_id));
      suggestedLocalId = clean(unique(linkedLocals)?.remote_local_id) || null;
    }
    if (!suggestedLocalId) {
      const compatible = locals.filter((row) => compatibleLocal(row, visite.trame_id));
      suggestedLocalId = clean(unique(compatible)?.remote_local_id) || null;
    }
    if (!suggestedLocalId && locals.length === 1) suggestedLocalId = clean(locals[0].remote_local_id);
  }

  return {
    visite: {
      id: visite.id,
      trameId: visite.trame_id,
      nomClient: visite.nom_client,
      nomSite: visite.nom_site,
      clientCode: visite.client_code || null,
      apiRemoteClientId: visite.api_remote_client_id || null,
      apiRemoteLocalId: visite.api_remote_local_id || null,
    },
    clients,
    sites,
    locals: locals.map((row) => ({ ...row, compatible: compatibleLocal(row, visite.trame_id) })),
    selectedClientId,
    selectedSiteId,
    suggestedLocalId,
  };
}

export async function bindVisitToIntranetTarget(visiteId, { remoteClientId, remoteSiteId, remoteLocalId } = {}) {
  const clientId = clean(remoteClientId);
  const siteId = clean(remoteSiteId);
  const localId = clean(remoteLocalId);
  if (!clientId || !siteId || !localId) throw new Error('Choisis le client, le site et le local Intranet avant de continuer.');

  const db = await getDb();
  const visite = await loadVisit(db, visiteId);
  if (!visite) throw new Error('Visite METRA introuvable.');
  if (Number(visite.api_is_historical) === 1) throw new Error('Une visite historique Intranet ne peut pas être renvoyée comme nouvelle visite.');
  const queued = await db.getFirstAsync(`SELECT status FROM api_visit_outbox WHERE visite_id=?`, [String(visiteId)]);
  if (queued) throw new Error('Cette visite possède déjà un envoi Intranet. La destination ne peut plus être changée pour cet envoi.');

  const client = await db.getFirstAsync(`SELECT * FROM api_client_links WHERE remote_client_id=? AND autorise=1`, [clientId]);
  if (!client) throw new Error('Client introuvable dans les clients Intranet autorisés sur cette tablette. Actualise la connexion Intranet.');
  const site = await db.getFirstAsync(`SELECT s.*,cs.local_site_id AS relation_local_site_id FROM api_client_site_links cs
    JOIN api_site_links s ON s.remote_site_id=cs.remote_site_id
    WHERE cs.remote_client_id=? AND cs.remote_site_id=? AND cs.remote_present=1 AND s.remote_present=1`, [clientId, siteId]);
  if (!site) throw new Error('Site introuvable pour ce client dans la préparation Intranet. Actualise le client ou choisis un autre site.');
  const local = await db.getFirstAsync(`SELECT * FROM api_local_links WHERE remote_local_id=? AND remote_site_id=? AND remote_present=1`, [localId, siteId]);
  if (!local) throw new Error('Local introuvable sur ce site dans la préparation Intranet. Actualise les données du client.');

  const reference = parseJson(local.reference_json);
  if (!reference?.local?.id || !reference?.site?.id || !reference?.trame?.id) {
    throw new Error('Référence de préparation Intranet incomplète pour ce local. Actualise les données avant l’envoi.');
  }
  if (clean(reference.site.id) !== siteId || clean(reference.local.id) !== localId) {
    throw new Error('La référence Intranet du local ne correspond plus au site sélectionné. Actualise la préparation.');
  }
  const mappedTrame = mapRemoteTrameToLocal(reference.trame);
  if (mappedTrame && mappedTrame !== visite.trame_id) {
    throw new Error(`Trame incompatible : la visite METRA utilise « ${visite.trame_id} » et le local Intranet utilise « ${reference.trame.nom || reference.trame.id} ».`);
  }
  const categories = Array.isArray(reference?.trame?.categories) ? reference.trame.categories : [];
  if (!categories.length) throw new Error('La trame Intranet de ce local ne contient aucun critère de préparation. Actualise les données du client.');

  const existingProvenances = await db.getAllAsync(`SELECT details_json FROM provenances WHERE entite_type='visite' AND entite_id=? AND origine='api_symfony' ORDER BY importe_le DESC`, [String(visiteId)]);
  for (const row of existingProvenances) {
    const details = parseJson(row.details_json);
    if (details?.sourceType === 'imported_latest_visit') throw new Error('Une visite historique Intranet ne peut pas être réutilisée comme nouvelle visite.');
  }

  const details = {
    ...reference,
    schemaVersion: 4,
    sourceType: 'upload_binding',
    remoteLocalId: localId,
    binding: { remoteClientId: clientId, remoteSiteId: siteId, remoteLocalId: localId, boundAt: new Date().toISOString() },
  };

  await db.withTransactionAsync(async () => {
    await db.runAsync(`UPDATE visites SET api_remote_client_id=?,api_remote_local_id=?,api_remote_trame_id=?,api_source_remote_visit_id=?,modifie_le=datetime('now') WHERE id=?`,
      [clientId, localId, clean(reference.trame.id), clean(reference?.derniereVisite?.id) || null, String(visiteId)]);
    await db.runAsync(`UPDATE api_client_links SET local_client_id=COALESCE(local_client_id,?) WHERE remote_client_id=?`, [visite.client_id, clientId]);
    await db.runAsync(`UPDATE api_site_links SET local_site_id=COALESCE(local_site_id,?) WHERE remote_site_id=?`, [visite.site_id, siteId]);
    await db.runAsync(`UPDATE api_client_site_links SET local_site_id=COALESCE(local_site_id,?) WHERE remote_client_id=? AND remote_site_id=?`, [visite.site_id, clientId, siteId]);
    if (clean(visite.installation_id)) {
      await db.runAsync(`UPDATE api_local_links SET local_installation_id=COALESCE(local_installation_id,?) WHERE remote_local_id=?`, [visite.installation_id, localId]);
    }
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
    trameName: reference?.trame?.nom || null,
  };
}
