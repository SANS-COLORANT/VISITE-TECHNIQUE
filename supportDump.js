import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getDb } from './db.js';
import { DATABASE_SCHEMA_VERSION } from './database/constants.js';
import { listerTramesDisponibles, normaliserSectionCode } from './trameRegistry.js';

const SUPPORT_DUMP_FORMAT = 'metra-support-dump';
const SUPPORT_DUMP_VERSION = 1;
const MAX_LINKED_VISITS = 100;
const MAX_PREPARATIONS = 50;
const MAX_OUTBOX_ROWS = 100;

const SENSITIVE_KEY = /(access[_-]?token|refresh[_-]?token|token[_-]?type|password|mot[_-]?de[_-]?passe|secret|authorization|cookie|private[_-]?key|dpop[_-]?(key|private)|client[_-]?secret|jwt)/i;

function timestamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
}

function sanitizeDeep(value) {
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeDeep(child);
    }
    return result;
  }
  if (typeof value === 'string') {
    if (/^\s*(Bearer|DPoP)\s+[A-Za-z0-9._~-]+\s*$/i.test(value)) return '[REDACTED]';
    if (/^[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}$/.test(value)) return '[REDACTED]';
  }
  return value;
}

function parseJsonColumn(value) {
  if (value == null || value === '') return null;
  try { return sanitizeDeep(JSON.parse(String(value))); }
  catch { return { parseError: true, raw: sanitizeDeep(String(value)) }; }
}

function sanitizeRows(rows) {
  return (rows || []).map((row) => {
    const result = {};
    for (const [key, value] of Object.entries(row || {})) {
      if (SENSITIVE_KEY.test(key)) result[key] = '[REDACTED]';
      else if (/_json$/i.test(key)) result[key] = parseJsonColumn(value);
      else result[key] = sanitizeDeep(value);
    }
    return result;
  });
}

async function safeRows(db, sql, params = []) {
  try { return { rows: sanitizeRows(await db.getAllAsync(sql, params)), error: null }; }
  catch (error) { return { rows: [], error: String(error?.message || error) }; }
}

function summarizeLocalTrames() {
  return listerTramesDisponibles().map((trame) => ({
    id: trame.id,
    version: trame.version,
    nom: trame.nom,
    panels: Object.entries(trame?.ui?.panels || {}).map(([panelId, sections]) => ({
      panelId,
      label: trame?.ui?.labels?.[panelId] || panelId,
      sections: Object.entries(sections || {}).map(([section, fields]) => ({
        section,
        sectionCode: normaliserSectionCode(panelId, section),
        fields: (fields || []).filter((field) => field?.hiddenInApp !== true).map((field) => ({
          cle: field?.cle || null,
          type: field?.type || 'champ',
        })),
      })),
    })),
  }));
}

async function linkedVisitData(db) {
  const visitsResult = await safeRows(db, `SELECT v.id,v.site_id,v.installation_id,v.date_visite,v.statut,v.trame_id,
      v.api_remote_local_id,v.api_remote_client_id,v.api_remote_trame_id,v.api_source_remote_visit_id,v.cree_le,v.modifie_le,
      s.nom_site,c.id AS client_id,c.nom AS client_nom
    FROM visites v
    JOIN sites s ON s.id=v.site_id
    JOIN clients c ON c.id=s.client_id
    WHERE v.api_remote_local_id IS NOT NULL OR v.api_remote_client_id IS NOT NULL
      OR EXISTS(SELECT 1 FROM provenances p WHERE p.entite_type='visite' AND p.entite_id=v.id AND p.origine='api_symfony')
    ORDER BY COALESCE(v.modifie_le,v.cree_le) DESC,v.date_visite DESC
    LIMIT ?`, [MAX_LINKED_VISITS]);
  const visits = visitsResult.rows;
  const ids = visits.map((row) => row.id).filter(Boolean);
  if (!ids.length) return { visits, visitsError: visitsResult.error, controls: [], fields: [], networks: [], counters: [], remarks: [], materials: [], provenance: [] };
  const placeholders = ids.map(() => '?').join(',');
  const [controls, fields, networks, counters, remarks, materials, provenance] = await Promise.all([
    safeRows(db, `SELECT visite_id,section_code,cle,avis,commentaire,modifie_le FROM controles_visite WHERE visite_id IN (${placeholders}) ORDER BY visite_id,section_code,cle`, ids),
    safeRows(db, `SELECT visite_id,section_code,cle,valeur FROM champs_visite WHERE visite_id IN (${placeholders}) ORDER BY visite_id,section_code,cle`, ids),
    safeRows(db, `SELECT id,visite_id,ordre,nom_reseau,t_ext_c,t_dep_c,courbe_de_chauffe,tnc,consigne_programme_horaire FROM reseaux WHERE visite_id IN (${placeholders}) ORDER BY visite_id,ordre,id`, ids),
    safeRows(db, `SELECT id,visite_id,label,unite,valeur FROM compteurs WHERE visite_id IN (${placeholders}) ORDER BY visite_id,id`, ids),
    safeRows(db, `SELECT id,visite_id,poste,prestation,delai,estimatif,origine,intranet_date_reserve,intranet_delai,intranet_etat_avancement,cree_le FROM remarques WHERE visite_id IN (${placeholders}) ORDER BY visite_id,cree_le,id`, ids),
    safeRows(db, `SELECT id,visite_id,equipement_id,categorie,nombre,designation,numero_materiel,reseau_desservi,marque,modele,caracteristiques,annee,etat,cree_le FROM materiel WHERE visite_id IN (${placeholders}) ORDER BY visite_id,cree_le,id`, ids),
    safeRows(db, `SELECT id,entite_type,entite_id,origine,reference_externe,details_json,importe_le FROM provenances WHERE origine='api_symfony' AND ((entite_type='visite' AND entite_id IN (${placeholders})) OR entite_type<>'visite') ORDER BY importe_le DESC LIMIT 1000`, ids),
  ]);
  return {
    visits,
    visitsError: visitsResult.error,
    controls: controls.rows,
    controlsError: controls.error,
    fields: fields.rows,
    fieldsError: fields.error,
    networks: networks.rows,
    networksError: networks.error,
    counters: counters.rows,
    countersError: counters.error,
    remarks: remarks.rows,
    remarksError: remarks.error,
    materials: materials.rows,
    materialsError: materials.error,
    provenance: provenance.rows,
    provenanceError: provenance.error,
  };
}

export async function construireSupportDump() {
  const db = await getDb();
  const [integrity, foreignKeys, syncState, clients, clientSites, sites, locals, preparations, outbox, linked] = await Promise.all([
    safeRows(db, 'PRAGMA integrity_check'),
    safeRows(db, 'PRAGMA foreign_key_check'),
    safeRows(db, 'SELECT id,base_url,tablette_id,last_clients_sync_at,last_success_at,last_error,modifie_le FROM api_sync_state'),
    safeRows(db, 'SELECT remote_client_id,local_client_id,nom,categorie,code_everwin,ville,agence_id,agence_libelle,autorise,cree_localement,synced_at FROM api_client_links ORDER BY synced_at DESC'),
    safeRows(db, 'SELECT remote_client_id,remote_site_id,local_site_id,remote_present FROM api_client_site_links ORDER BY remote_client_id,remote_site_id'),
    safeRows(db, 'SELECT remote_site_id,remote_client_id,local_site_id,nom,cree_localement,remote_present,synced_at FROM api_site_links ORDER BY synced_at DESC'),
    safeRows(db, 'SELECT remote_local_id,remote_site_id,local_installation_id,designation,remote_trame_id,remote_trame_nom,derniere_visite_id,derniere_visite_date,derniere_visite_statut,remote_present,criteria_count,historical_criteria_count,remark_count,material_count,reference_json,synced_at FROM api_local_links ORDER BY synced_at DESC'),
    safeRows(db, 'SELECT remote_client_id,payload_json,synced_at FROM api_preparation_cache ORDER BY synced_at DESC LIMIT ?', [MAX_PREPARATIONS]),
    safeRows(db, 'SELECT envoi_id,visite_id,remote_client_id,payload_json,payload_bytes,status,attempt_count,last_attempt_at,next_attempt_at,http_status,error_code,error_message,violations_json,remote_visit_id,replayed,queued_at,synced_at,updated_at FROM api_visit_outbox ORDER BY updated_at DESC LIMIT ?', [MAX_OUTBOX_ROWS]),
    linkedVisitData(db),
  ]);

  return sanitizeDeep({
    format: SUPPORT_DUMP_FORMAT,
    formatVersion: SUPPORT_DUMP_VERSION,
    createdAt: new Date().toISOString(),
    schemaVersion: DATABASE_SCHEMA_VERSION,
    privacy: {
      containsBusinessData: true,
      containsPhotos: false,
      containsDatabaseFile: false,
      credentialsIncluded: false,
      redaction: 'Les clés et valeurs ressemblant à des jetons, secrets, mots de passe, cookies, clés privées ou en-têtes Authorization sont masquées automatiquement.',
    },
    limits: { linkedVisits: MAX_LINKED_VISITS, preparations: MAX_PREPARATIONS, outboxRows: MAX_OUTBOX_ROWS },
    database: {
      integrity: integrity.rows,
      integrityError: integrity.error,
      foreignKeys: foreignKeys.rows,
      foreignKeysError: foreignKeys.error,
    },
    intranet: {
      syncState: syncState.rows,
      syncStateError: syncState.error,
      clients: clients.rows,
      clientsError: clients.error,
      clientSites: clientSites.rows,
      clientSitesError: clientSites.error,
      sites: sites.rows,
      sitesError: sites.error,
      locals: locals.rows,
      localsError: locals.error,
      preparations: preparations.rows,
      preparationsError: preparations.error,
      outbox: outbox.rows,
      outboxError: outbox.error,
    },
    linkedVisitData: linked,
    localTrames: summarizeLocalTrames(),
  });
}

export async function exporterSupportDump() {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Le partage de fichiers est indisponible sur cet appareil.');
  const dump = await construireSupportDump();
  const dir = `${FileSystem.cacheDirectory}metra-support/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const uri = `${dir}METRA_DUMP_SUPPORT_${timestamp()}.json`;
  try {
    await FileSystem.writeAsStringAsync(uri, JSON.stringify(dump, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
    await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Partager le DUMP support METRA' });
    return { nom: uri.split('/').pop(), formatVersion: SUPPORT_DUMP_VERSION };
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}

export { sanitizeDeep as assainirSupportDump };
