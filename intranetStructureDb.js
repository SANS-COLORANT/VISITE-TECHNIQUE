import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { createIntranetUploadId, protectedRequest, syncClientPreparation } from './symfonyApi.js';

const listeners = new Set();
let processorPromise = null;
let revision = 0;
const RETRYABLE_HTTP = new Set([500, 502, 503, 504]);
const LOCAL_AUTH_ERRORS = new Set(['reactivation_required', 'dpop_key_missing', 'invalid_grant']);
const TERMINAL_STATUSES = new Set(['conflict', 'validation_error', 'rejected']);

function clean(value) { return String(value ?? '').trim(); }
function json(value) { return JSON.stringify(value ?? null); }
function parseJson(value) { try { return JSON.parse(value || 'null'); } catch { return null; } }
function positiveInteger(value) { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : null; }
function nullable(value) { const v = clean(value); return v ? v : null; }
function notify() { revision += 1; for (const listener of listeners) { try { listener(revision); } catch {} } }
function isoAfter(ms) { return new Date(Date.now() + Math.max(1000, ms)).toISOString(); }
function retryAfterMs(value) {
  if (value == null || value === '') return 60_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1000, seconds * 1000);
  const at = Date.parse(String(value));
  return Number.isFinite(at) ? Math.max(1000, at - Date.now()) : 60_000;
}
function exponentialRetry(attempt) { return Math.min(15 * 60_000, Math.max(15_000, 15_000 * 2 ** Math.min(6, Math.max(0, attempt - 1)))); }
function violationsJson(error) { return error?.violations?.length ? JSON.stringify(error.violations) : null; }
function utf8ByteLength(value) {
  let bytes = 0;
  for (const char of String(value || '')) {
    const code = char.codePointAt(0);
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}
function localAddress(adresse, codePostal, ville) {
  return [nullable(adresse), [nullable(codePostal), nullable(ville)].filter(Boolean).join(' ') || null].filter(Boolean).join('\n') || null;
}
function structureError(message, code, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

export function subscribeStructureOutbox(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function getStructureOutboxRevision() { return revision; }

function validateSitePayload(payload, referential = null) {
  const violations = [];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(payload?.creationId))) violations.push('creationId UUID v4 invalide.');
  const lotId = positiveInteger(payload?.lotId); if (!lotId) violations.push('lotId invalide.');
  const nom = clean(payload?.nom); if (nom.length < 2 || nom.length > 100) violations.push('Le nom du site doit contenir 2 à 100 caractères.');
  if (!['Oui', 'Non'].includes(payload?.sitePrincipal)) violations.push('sitePrincipal doit être Oui ou Non.');
  if (payload?.adresse != null && String(payload.adresse).length > 255) violations.push('Adresse limitée à 255 caractères.');
  if (payload?.codePostal != null && !/^.{5}$/.test(String(payload.codePostal))) violations.push('Le code postal doit contenir exactement 5 caractères.');
  if (payload?.ville != null && String(payload.ville).length > 50) violations.push('Ville limitée à 50 caractères.');
  if (!clean(payload?.energie) || clean(payload.energie).length > 255) violations.push('Énergie requise (255 caractères maximum).');
  if (!clean(payload?.typeBatiment) || clean(payload.typeBatiment).length > 255) violations.push('Type de bâtiment requis (255 caractères maximum).');
  if (referential && lotId && !(referential?.lots || []).some((lot) => Number(lot?.id) === lotId)) violations.push('Le lot choisi n’appartient pas au référentiel de ce client.');
  if (violations.length) throw structureError(violations.join('\n'), 'local_validation', { violations: violations.map((message) => ({ path: 'local', message })) });
}

function validateLocalPayload(payload, referential = null) {
  const violations = [];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(payload?.creationId))) violations.push('creationId UUID v4 invalide.');
  const designation = clean(payload?.designation); if (designation.length < 1 || designation.length > 100) violations.push('Désignation requise (100 caractères maximum).');
  const type = clean(payload?.type); if (type.length < 1 || type.length > 255) violations.push('Type de local requis (255 caractères maximum).');
  const situation = clean(payload?.situation); if (situation.length < 2 || situation.length > 50) violations.push('Situation requise (2 à 50 caractères).');
  const trameId = positiveInteger(payload?.trameId); if (!trameId) violations.push('Trame Intranet obligatoire.');
  if (payload?.periodiciteVisite != null && !positiveInteger(payload.periodiciteVisite)) violations.push('La périodicité doit être un nombre entier de mois strictement positif.');
  if (referential && trameId && !(referential?.trames || []).some((trame) => Number(trame?.id) === trameId)) violations.push('La trame choisie n’existe plus dans le référentiel de ce client.');
  if (violations.length) throw structureError(violations.join('\n'), 'local_validation', { violations: violations.map((message) => ({ path: 'local', message })) });
}

export async function cacheStructureReferential(remoteClientId, payload) {
  const clientId = clean(remoteClientId);
  if (!positiveInteger(clientId)) throw new Error('Client Intranet invalide.');
  if (!payload || typeof payload !== 'object') throw new Error('Référentiel de structure invalide.');
  const db = await getDb();
  await db.runAsync(`INSERT INTO api_structure_referential(remote_client_id,payload_json,synced_at)
    VALUES(?,?,datetime('now')) ON CONFLICT(remote_client_id) DO UPDATE SET payload_json=excluded.payload_json,synced_at=datetime('now')`,
    [clientId, json(payload)]);
  notify();
  return payload;
}

export async function getCachedStructureReferential(remoteClientId) {
  const row = await (await getDb()).getFirstAsync(`SELECT * FROM api_structure_referential WHERE remote_client_id=?`, [clean(remoteClientId)]);
  return row ? { ...parseJson(row.payload_json), syncedAt: row.synced_at } : null;
}

export async function syncStructureReferential(remoteClientId) {
  const clientId = clean(remoteClientId);
  if (!positiveInteger(clientId)) throw new Error('Client Intranet invalide.');
  const payload = await protectedRequest('GET', `/api/clients/${encodeURIComponent(clientId)}/referentiel-structure`);
  return cacheStructureReferential(clientId, payload);
}

async function linkedRemoteClientsForLocalClient(localClientId) {
  return (await getDb()).getAllAsync(`SELECT remote_client_id,nom FROM api_client_links
    WHERE local_client_id=? AND autorise=1 ORDER BY remote_client_id`, [String(localClientId)]);
}

export async function getStructureContextForLocalClient(localClientId) {
  const rows = await linkedRemoteClientsForLocalClient(localClientId);
  if (!rows.length) return { linked: false, ambiguous: false, remoteClientId: null, referential: null };
  if (rows.length > 1) return { linked: true, ambiguous: true, remoteClientId: null, referential: null, remoteClients: rows };
  const remoteClientId = clean(rows[0].remote_client_id);
  return { linked: true, ambiguous: false, remoteClientId, referential: await getCachedStructureReferential(remoteClientId), remoteClient: rows[0] };
}

async function mappedRemoteSiteForLocalSite(db, localSiteId, remoteClientId) {
  return db.getFirstAsync(`SELECT s.remote_site_id,s.nom
    FROM api_client_site_links cs JOIN api_site_links s ON s.remote_site_id=cs.remote_site_id
    WHERE cs.remote_client_id=? AND cs.remote_present=1 AND s.remote_present=1
      AND COALESCE(s.local_site_id,cs.local_site_id)=? ORDER BY s.remote_site_id LIMIT 1`,
    [clean(remoteClientId), String(localSiteId)]);
}

export async function getSiteStructureContext(localSiteId) {
  const db = await getDb();
  const site = await db.getFirstAsync(`SELECT s.*,c.id AS local_client_id,c.nom AS client_nom FROM sites s JOIN clients c ON c.id=s.client_id WHERE s.id=?`, [String(localSiteId)]);
  if (!site) throw new Error('Site METRA introuvable.');
  const pendingSite = await db.getFirstAsync(`SELECT * FROM api_structure_outbox WHERE resource_type='site' AND local_site_id=? ORDER BY queued_at DESC LIMIT 1`, [String(localSiteId)]);
  const clientRows = await linkedRemoteClientsForLocalClient(site.local_client_id);
  let remoteClientId = pendingSite?.remote_client_id ? clean(pendingSite.remote_client_id) : null;
  if (!remoteClientId && clientRows.length === 1) remoteClientId = clean(clientRows[0].remote_client_id);
  const ambiguous = !pendingSite && clientRows.length > 1;
  const remoteSite = remoteClientId ? await mappedRemoteSiteForLocalSite(db, localSiteId, remoteClientId) : null;
  return {
    site,
    linked: Boolean(remoteClientId || clientRows.length),
    ambiguous,
    remoteClientId,
    remoteSiteId: remoteSite?.remote_site_id ? clean(remoteSite.remote_site_id) : (pendingSite?.status === 'synced' ? clean(pendingSite.remote_id) : null),
    siteOperation: pendingSite || null,
    referential: remoteClientId ? await getCachedStructureReferential(remoteClientId) : null,
  };
}

export async function listStructureOutbox({ remoteClientId = null, localSiteId = null, includeSynced = false } = {}) {
  const db = await getDb();
  const where = [];
  const params = [];
  if (remoteClientId) { where.push('remote_client_id=?'); params.push(clean(remoteClientId)); }
  if (localSiteId) { where.push('local_site_id=?'); params.push(String(localSiteId)); }
  if (!includeSynced) where.push("status<>'synced'");
  return db.getAllAsync(`SELECT * FROM api_structure_outbox ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY queued_at`, params);
}

export async function queueMetraSiteCreation({ localClientId, remoteClientId, lotId, nom, sitePrincipal = 'Non', adresse = null, codePostal = null, ville = null, energie, typeBatiment } = {}) {
  const clientId = clean(remoteClientId);
  if (!positiveInteger(clientId)) throw new Error('Client Intranet requis pour créer un site.');
  const referential = await getCachedStructureReferential(clientId);
  if (!referential) throw structureError('Le référentiel de création de ce client n’est pas encore disponible hors connexion. Actualise-le une première fois avec Internet.', 'structure_referential_required');
  const creationId = await createIntranetUploadId();
  const payload = {
    creationId,
    lotId: positiveInteger(lotId),
    nom: clean(nom),
    sitePrincipal,
    adresse: nullable(adresse),
    codePostal: nullable(codePostal),
    ville: nullable(ville),
    energie: clean(energie),
    typeBatiment: clean(typeBatiment),
  };
  validateSitePayload(payload, referential);
  const serialized = JSON.stringify(payload);
  const payloadBytes = utf8ByteLength(serialized);
  if (payloadBytes > 64 * 1024) throw structureError('La création du site dépasse la limite serveur de 64 Kio.', 'request_too_large');
  const localSiteId = createId();
  const operationId = createId();
  const db = await getDb();
  const localClient = await db.getFirstAsync(`SELECT id FROM clients WHERE id=?`, [String(localClientId)]);
  if (!localClient) throw new Error('Client METRA introuvable.');
  await db.withTransactionAsync(async () => {
    await db.runAsync(`INSERT INTO sites(id,client_id,nom_site,adresse,statut) VALUES(?,?,?,?, 'Actif')`,
      [localSiteId, String(localClientId), payload.nom, localAddress(payload.adresse, payload.codePostal, payload.ville)]);
    await db.runAsync(`INSERT INTO api_structure_outbox(operation_id,resource_type,creation_id,remote_client_id,local_site_id,payload_json,payload_bytes,status)
      VALUES(?,'site',?,?,?,?,?,'pending')`, [operationId, creationId, clientId, localSiteId, serialized, payloadBytes]);
  });
  notify();
  void processStructureOutbox({ limit: 2 }).catch(() => {});
  return { localSiteId, operationId, creationId, payload };
}

export async function queueMetraLocalCreation({ localSiteId, remoteClientId, designation, type, situation, trameId, periodiciteVisite = null } = {}) {
  const clientId = clean(remoteClientId);
  if (!positiveInteger(clientId)) throw new Error('Client Intranet requis pour créer un local.');
  const referential = await getCachedStructureReferential(clientId);
  if (!referential) throw structureError('Le référentiel de création de ce client n’est pas disponible. Actualise-le avant de créer un local.', 'structure_referential_required');
  const creationId = await createIntranetUploadId();
  const payload = {
    creationId,
    designation: clean(designation),
    type: clean(type),
    situation: clean(situation),
    trameId: positiveInteger(trameId),
    periodiciteVisite: periodiciteVisite == null || clean(periodiciteVisite) === '' ? null : positiveInteger(periodiciteVisite),
  };
  validateLocalPayload(payload, referential);
  const serialized = JSON.stringify(payload);
  const payloadBytes = utf8ByteLength(serialized);
  if (payloadBytes > 64 * 1024) throw structureError('La création du local dépasse la limite serveur de 64 Kio.', 'request_too_large');

  const db = await getDb();
  const site = await db.getFirstAsync(`SELECT id FROM sites WHERE id=?`, [String(localSiteId)]);
  if (!site) throw new Error('Site METRA introuvable.');
  const remoteSite = await mappedRemoteSiteForLocalSite(db, localSiteId, clientId);
  const siteOperation = await db.getFirstAsync(`SELECT * FROM api_structure_outbox WHERE resource_type='site' AND local_site_id=? AND remote_client_id=? ORDER BY queued_at DESC LIMIT 1`, [String(localSiteId), clientId]);
  if (!remoteSite && !siteOperation) throw structureError('Ce site METRA n’est pas encore relié à un site Intranet et aucune création de site n’est en attente.', 'remote_site_required');
  if (!remoteSite && siteOperation && TERMINAL_STATUSES.has(siteOperation.status)) throw structureError('La création Intranet du site est à corriger avant de pouvoir créer un local dessus.', 'site_creation_blocked');

  const localInstallationId = createId();
  const operationId = createId();
  const trame = (referential.trames || []).find((row) => Number(row?.id) === Number(payload.trameId));
  await db.withTransactionAsync(async () => {
    await db.runAsync(`INSERT INTO installations(id,site_id,type_code,nom,description,actif) VALUES(?,?,?,?,?,1)`,
      [localInstallationId, String(localSiteId), 'intranet_local', payload.designation, payload.situation]);
    const attrs = [
      ['intranet.type', payload.type],
      ['intranet.situation', payload.situation],
      ['intranet.periodicite_visite', payload.periodiciteVisite == null ? null : String(payload.periodiciteVisite)],
      ['intranet.remote_trame_id', String(payload.trameId)],
      ['intranet.remote_trame_nom', trame?.nom == null ? null : String(trame.nom)],
    ];
    for (const [cle, valeur] of attrs) {
      await db.runAsync(`INSERT INTO attributs_libres(id,entite_type,entite_id,cle,valeur,type_valeur) VALUES(?,?,?,?,?,'texte')`,
        [createId(), 'installation', localInstallationId, cle, valeur]);
    }
    await db.runAsync(`INSERT INTO api_structure_outbox(operation_id,resource_type,creation_id,remote_client_id,local_site_id,local_installation_id,depends_on_id,payload_json,payload_bytes,status)
      VALUES(?,'local',?,?,?,?,?,?,?,'pending')`,
      [operationId, creationId, clientId, String(localSiteId), localInstallationId, remoteSite ? null : siteOperation.operation_id, serialized, payloadBytes]);
  });
  notify();
  void processStructureOutbox({ limit: 3 }).catch(() => {});
  return { localInstallationId, operationId, creationId, payload, remoteSiteId: remoteSite?.remote_site_id || null };
}

export async function listSiteStructureLocals(localSiteId) {
  const db = await getDb();
  const context = await getSiteStructureContext(localSiteId);
  const localRows = await db.getAllAsync(`SELECT i.id AS local_installation_id,i.nom AS installation_nom,i.description AS installation_description,i.type_code,
      o.operation_id,o.status,o.error_code,o.error_message,o.remote_id,o.payload_json,
      l.remote_local_id,l.remote_trame_id,l.remote_trame_nom,l.designation,l.reference_json
    FROM installations i
    LEFT JOIN api_structure_outbox o ON o.local_installation_id=i.id AND o.resource_type='local'
    LEFT JOIN api_local_links l ON l.local_installation_id=i.id AND l.remote_present=1
    WHERE i.site_id=? AND (o.operation_id IS NOT NULL OR l.remote_local_id IS NOT NULL)
    ORDER BY i.cree_le,i.nom`, [String(localSiteId)]);
  const seenRemote = new Set(localRows.map((row) => clean(row.remote_local_id || row.remote_id)).filter(Boolean));
  const remoteRows = context.remoteSiteId ? await db.getAllAsync(`SELECT * FROM api_local_links WHERE remote_site_id=? AND remote_present=1 ORDER BY designation,remote_local_id`, [String(context.remoteSiteId)]) : [];
  const result = localRows.map((row) => {
    const payload = parseJson(row.payload_json) || {};
    return {
      ...row,
      designation: row.designation || row.installation_nom || payload.designation || 'Local technique',
      type: payload.type || null,
      situation: payload.situation || row.installation_description || null,
      periodiciteVisite: payload.periodiciteVisite ?? null,
      remoteLocalId: clean(row.remote_local_id || row.remote_id) || null,
      remoteTrameId: clean(row.remote_trame_id || payload.trameId) || null,
      remoteTrameNom: row.remote_trame_nom || (context.referential?.trames || []).find((t) => Number(t?.id) === Number(payload.trameId))?.nom || null,
      syncStatus: row.status || (row.remote_local_id ? 'synced' : null),
    };
  });
  for (const row of remoteRows) {
    if (seenRemote.has(clean(row.remote_local_id))) continue;
    const reference = parseJson(row.reference_json) || {};
    result.push({
      ...row,
      local_installation_id: row.local_installation_id || null,
      designation: row.designation || reference?.local?.designation || 'Local technique',
      type: reference?.local?.type || null,
      situation: reference?.local?.situation || null,
      periodiciteVisite: reference?.local?.periodiciteVisite ?? reference?.local?.periodicite_visite ?? null,
      remoteLocalId: clean(row.remote_local_id) || null,
      remoteTrameId: clean(row.remote_trame_id || reference?.trame?.id) || null,
      remoteTrameNom: row.remote_trame_nom || reference?.trame?.nom || null,
      syncStatus: 'synced',
    });
  }
  return { context, locals: result };
}

async function resolveRemoteSiteIdForOperation(db, row) {
  if (row.resource_type !== 'local') return null;
  const mapped = await mappedRemoteSiteForLocalSite(db, row.local_site_id, row.remote_client_id);
  if (mapped?.remote_site_id) return clean(mapped.remote_site_id);
  if (row.depends_on_id) {
    const parent = await db.getFirstAsync(`SELECT status,remote_id FROM api_structure_outbox WHERE operation_id=?`, [row.depends_on_id]);
    if (parent?.status === 'synced' && parent.remote_id) return clean(parent.remote_id);
  }
  return null;
}

async function markRetry(db, row, error, delay) {
  await db.runAsync(`UPDATE api_structure_outbox SET status='retry',next_attempt_at=?,http_status=?,error_code=?,error_message=?,violations_json=?,updated_at=datetime('now') WHERE operation_id=?`,
    [isoAfter(delay), error?.status || null, error?.code || null, String(error?.message || 'Connexion indisponible'), violationsJson(error), row.operation_id]);
}
async function markTerminal(db, row, status, error) {
  await db.runAsync(`UPDATE api_structure_outbox SET status=?,next_attempt_at=NULL,http_status=?,error_code=?,error_message=?,violations_json=?,updated_at=datetime('now') WHERE operation_id=?`,
    [status, error?.status || null, error?.code || null, String(error?.message || 'Création refusée'), violationsJson(error), row.operation_id]);
}

async function materializeSiteAck(db, row, response) {
  const remoteSite = response?.site || {};
  const remoteSiteId = clean(remoteSite.id);
  const payload = parseJson(row.payload_json) || {};
  await db.runAsync(`INSERT INTO api_site_links(remote_site_id,remote_client_id,local_site_id,nom,cree_localement,payload_json,synced_at,remote_present)
    VALUES(?,?,?,?,1,?,datetime('now'),1)
    ON CONFLICT(remote_site_id) DO UPDATE SET remote_client_id=excluded.remote_client_id,local_site_id=COALESCE(api_site_links.local_site_id,excluded.local_site_id),
      nom=excluded.nom,cree_localement=1,payload_json=excluded.payload_json,remote_present=1,synced_at=datetime('now')`,
    [remoteSiteId, row.remote_client_id, row.local_site_id, remoteSite.nom || payload.nom || `Site ${remoteSiteId}`, json(remoteSite)]);
  await db.runAsync(`INSERT INTO api_client_site_links(remote_client_id,remote_site_id,local_site_id,cree_localement,remote_present,synced_at)
    VALUES(?,?,?,1,1,datetime('now'))
    ON CONFLICT(remote_client_id,remote_site_id) DO UPDATE SET local_site_id=COALESCE(api_client_site_links.local_site_id,excluded.local_site_id),cree_localement=1,remote_present=1,synced_at=datetime('now')`,
    [row.remote_client_id, remoteSiteId, row.local_site_id]);
  return remoteSiteId;
}

async function materializeLocalAck(db, row, response, remoteSiteId) {
  const remoteLocal = response?.local || {};
  const remoteLocalId = clean(remoteLocal.id);
  const payload = parseJson(row.payload_json) || {};
  const referential = await getCachedStructureReferential(row.remote_client_id);
  const trame = (referential?.trames || []).find((item) => Number(item?.id) === Number(payload.trameId));
  const remoteTrameName = trame?.nom || null;
  const reference = {
    local: {
      id: remoteLocalId,
      designation: remoteLocal.designation || payload.designation,
      type: remoteLocal.type || payload.type,
      situation: remoteLocal.situation || payload.situation,
      periodiciteVisite: remoteLocal.periodiciteVisite ?? payload.periodiciteVisite ?? null,
      ordre: remoteLocal.ordre ?? null,
    },
    site: { id: clean(remoteLocal.siteId || remoteSiteId) },
    trame: { id: clean(remoteLocal.trameId || payload.trameId), nom: remoteTrameName, categories: [] },
    derniereVisite: null,
    remarques: [],
    materiels: [],
    notes: [],
  };
  await db.runAsync(`INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,remote_trame_id,remote_trame_nom,derniere_visite_id,derniere_visite_date,derniere_visite_statut,reference_json,synced_at,local_installation_id,remote_present,criteria_count,historical_criteria_count,remark_count,material_count)
    VALUES(?,?,?,?,?,NULL,NULL,NULL,?,datetime('now'),?,1,0,0,0,0)
    ON CONFLICT(remote_local_id) DO UPDATE SET remote_site_id=excluded.remote_site_id,designation=excluded.designation,remote_trame_id=excluded.remote_trame_id,
      remote_trame_nom=excluded.remote_trame_nom,reference_json=excluded.reference_json,local_installation_id=COALESCE(api_local_links.local_installation_id,excluded.local_installation_id),remote_present=1,synced_at=datetime('now')`,
    [remoteLocalId, remoteSiteId, remoteLocal.designation || payload.designation, clean(remoteLocal.trameId || payload.trameId), remoteTrameName, json(reference), row.local_installation_id]);
  if (row.local_installation_id) {
    await db.runAsync(`UPDATE visites SET api_remote_client_id=COALESCE(api_remote_client_id,?),api_remote_local_id=COALESCE(api_remote_local_id,?),api_remote_trame_id=COALESCE(api_remote_trame_id,?),modifie_le=datetime('now')
      WHERE installation_id=? AND (api_remote_local_id IS NULL OR trim(api_remote_local_id)='')`,
      [row.remote_client_id, remoteLocalId, clean(remoteLocal.trameId || payload.trameId), row.local_installation_id]);
  }
  return remoteLocalId;
}

async function sendRow(db, row) {
  if (row.depends_on_id) {
    const parent = await db.getFirstAsync(`SELECT status,remote_id,error_code,error_message FROM api_structure_outbox WHERE operation_id=?`, [row.depends_on_id]);
    if (!parent || parent.status !== 'synced') {
      if (parent && TERMINAL_STATUSES.has(parent.status)) {
        const error = structureError('La création du local est bloquée car la création de son site parent a échoué.', 'dependency_failed');
        await markTerminal(db, row, 'rejected', error); notify();
        return { status: 'error', row, error };
      }
      return { status: 'deferred', row };
    }
  }
  const remoteSiteId = await resolveRemoteSiteIdForOperation(db, row);
  if (row.resource_type === 'local' && !positiveInteger(remoteSiteId)) return { status: 'deferred', row };

  await db.runAsync(`UPDATE api_structure_outbox SET status='sending',attempt_count=attempt_count+1,last_attempt_at=datetime('now'),error_code=NULL,error_message=NULL,violations_json=NULL,updated_at=datetime('now') WHERE operation_id=?`, [row.operation_id]);
  notify();
  try {
    const path = row.resource_type === 'site'
      ? `/api/clients/${encodeURIComponent(row.remote_client_id)}/sites`
      : `/api/clients/${encodeURIComponent(row.remote_client_id)}/sites/${encodeURIComponent(remoteSiteId)}/locaux`;
    const response = await protectedRequest('POST', path, { body: row.payload_json, headers: { 'Content-Type': 'application/json' } });
    if (String(response?.creationId || '') !== String(row.creation_id)) throw structureError('Accusé Intranet incohérent : creationId différent.', 'invalid_ack');
    if (typeof response?.rejoue !== 'boolean') throw structureError('Accusé Intranet incomplet : indicateur rejoue absent.', 'invalid_ack');
    const resource = row.resource_type === 'site' ? response?.site : response?.local;
    if (!positiveInteger(resource?.id)) throw structureError(`Accusé Intranet incomplet : identifiant ${row.resource_type} absent.`, 'invalid_ack');
    const remoteId = row.resource_type === 'site'
      ? await materializeSiteAck(db, row, response)
      : await materializeLocalAck(db, row, response, remoteSiteId);
    await db.runAsync(`UPDATE api_structure_outbox SET status='synced',next_attempt_at=NULL,http_status=?,error_code=NULL,error_message=NULL,violations_json=NULL,remote_id=?,replayed=?,synced_at=datetime('now'),updated_at=datetime('now') WHERE operation_id=?`,
      [response.rejoue ? 200 : 201, remoteId, response.rejoue ? 1 : 0, row.operation_id]);
    notify();
    if (row.resource_type === 'site') void syncStructureReferential(row.remote_client_id).catch(() => {});
    else void syncClientPreparation(row.remote_client_id).catch(() => {});
    return { status: 'synced', row: { ...row, remote_id: remoteId }, response };
  } catch (error) {
    const status = Number(error?.status || 0);
    const localAuthFailure = LOCAL_AUTH_ERRORS.has(String(error?.code || ''));
    if (error?.code === 'invalid_ack') await markTerminal(db, row, 'rejected', error);
    else if (localAuthFailure || status === 401) await markTerminal(db, row, 'auth_error', error);
    else if (!status || RETRYABLE_HTTP.has(status)) await markRetry(db, row, error, exponentialRetry(Number(row.attempt_count || 0) + 1));
    else if (status === 429) await markRetry(db, row, error, retryAfterMs(error.retryAfter));
    else if (status === 409 && error?.code === 'idempotency_conflict') await markTerminal(db, row, 'conflict', error);
    else if (status === 422) await markTerminal(db, row, 'validation_error', error);
    else await markTerminal(db, row, 'rejected', error);
    notify();
    return { status: 'error', row, error };
  }
}

export async function recoverInterruptedStructureUploads() {
  const db = await getDb();
  const result = await db.runAsync(`UPDATE api_structure_outbox SET status='retry',next_attempt_at=datetime('now'),error_code='interrupted',error_message='Création interrompue avant confirmation : reprise idempotente avec le même creationId.',updated_at=datetime('now') WHERE status='sending'`);
  if (Number(result?.changes || 0) > 0) notify();
}

export async function processStructureOutbox({ limit = 4 } = {}) {
  if (processorPromise) return processorPromise;
  processorPromise = (async () => {
    const db = await getDb();
    await recoverInterruptedStructureUploads();
    const rows = await db.getAllAsync(`SELECT * FROM api_structure_outbox
      WHERE status IN ('pending','retry') AND (next_attempt_at IS NULL OR datetime(next_attempt_at)<=datetime('now'))
      ORDER BY CASE resource_type WHEN 'site' THEN 0 ELSE 1 END,queued_at LIMIT ?`, [Math.max(1, Math.min(8, Number(limit || 4)))]);
    const results = [];
    for (const row of rows) {
      const result = await sendRow(db, row);
      results.push(result);
      const http = Number(result?.error?.status || 0);
      const auth = LOCAL_AUTH_ERRORS.has(String(result?.error?.code || ''));
      if (result?.status === 'error' && (auth || !http || http === 401 || http === 429 || RETRYABLE_HTTP.has(http))) break;
    }
    return results;
  })().finally(() => { processorPromise = null; });
  return processorPromise;
}

export async function retryStructureOperation(operationId) {
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT * FROM api_structure_outbox WHERE operation_id=?`, [String(operationId)]);
  if (!row || row.status === 'synced' || row.status === 'sending' || row.status === 'conflict') return row;
  await db.runAsync(`UPDATE api_structure_outbox SET status='pending',next_attempt_at=NULL,error_code=NULL,error_message=NULL,violations_json=NULL,updated_at=datetime('now') WHERE operation_id=?`, [String(operationId)]);
  notify();
  await processStructureOutbox({ limit: 2 });
  return db.getFirstAsync(`SELECT * FROM api_structure_outbox WHERE operation_id=?`, [String(operationId)]);
}
