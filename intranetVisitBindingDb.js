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

/**
 * Résout la trame Symfony à utiliser quand un local Intranet n'a encore
 * aucune visite. Le référentiel de structure expose les trames disponibles ;
 * METRA n'en choisit une automatiquement que si la correspondance avec la
 * trame locale est unique. Aucune identité serveur n'est inventée.
 */
function normalizeTrameName(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function resolveFirstVisitRemoteTrame(referential, localTrameId, visitTrameName = null) {
  const trames = (Array.isArray(referential?.trames) ? referential.trames : [])
    .filter((trame) => validApiId(trame?.id))
    .map((trame) => ({ id: clean(trame.id), nom: clean(trame.nom) || null }));

  // La valeur affichée dans Informations > « Trame utilisée » est renseignée
  // au moment où le technicien choisit le type de visite. Elle est donc le
  // discriminant prioritaire pour retrouver la trame Symfony, avant tout
  // classement heuristique par famille (ICPE/chaufferie/sous-station...).
  const requestedName = clean(visitTrameName);
  if (requestedName) {
    const requestedKey = normalizeTrameName(requestedName);
    const named = trames.filter((trame) => normalizeTrameName(trame.nom) === requestedKey);
    if (named.length === 1) {
      return { remoteTrameId: named[0].id, remoteTrameName: named[0].nom, candidates: named, matchedBy: 'visit_field' };
    }
    if (!named.length) {
      // "Réseau de chaleur" and "TRAME RÉSEAU DE CHALEUR" may be
      // different names for the same server family. Only use an explicit,
      // unique match: never send RCU under an ICPE model.
      const candidates = trames.filter((trame) => mapRemoteTrameToLocal(trame) === localTrameId);
      if (mapRemoteTrameToLocal({ nom: requestedName }) === localTrameId && candidates.length === 1) {
        return { remoteTrameId: candidates[0].id, remoteTrameName: candidates[0].nom, candidates, matchedBy: 'unique_family' };
      }
      throw bindingError(
        `Aucune trame Intranet compatible nommée « ${requestedName} » pour cette visite. Vérifie les trames disponibles dans le référentiel du client ; METRA ne remplacera pas Réseau de chaleur par ICPE.`,
        'intranet_first_visit_trame_name_missing',
        { localTrameId, visitTrameName: requestedName, candidates: trames }
      );
    }
    throw bindingError(
      `Plusieurs trames Intranet portent le nom « ${requestedName} ». METRA refuse d'en choisir une au hasard.`,
      'intranet_first_visit_trame_name_ambiguous',
      { localTrameId, visitTrameName: requestedName, candidates: named }
    );
  }

  // Compatibilité avec d'anciennes visites où le champ n'aurait jamais été
  // matérialisé : on conserve le comportement historique uniquement si une
  // seule correspondance de famille est possible.
  const candidates = trames.filter((trame) => mapRemoteTrameToLocal(trame) === localTrameId);
  if (candidates.length === 1) {
    return { remoteTrameId: candidates[0].id, remoteTrameName: candidates[0].nom, candidates, matchedBy: 'legacy_family' };
  }
  if (!candidates.length) {
    throw bindingError(
      `La valeur « Trame utilisée » est absente et aucune trame Intranet ne correspond de façon sûre à la trame METRA « ${localTrameId || 'inconnue'} ».`,
      'intranet_first_visit_trame_missing',
      { localTrameId, candidates: [] }
    );
  }
  throw bindingError(
    `La valeur « Trame utilisée » est absente et plusieurs trames Intranet correspondent à la trame METRA « ${localTrameId} ». Ouvre l'onglet Informations pour vérifier la trame de la visite.`,
    'intranet_first_visit_trame_ambiguous',
    { localTrameId, candidates }
  );
}

async function loadVisit(db, visiteId) {
  return db.getFirstAsync(`SELECT v.*,s.client_id,s.nom_site,c.nom AS nom_client,c.code_exploitant AS client_code
    FROM visites v JOIN sites s ON s.id=v.site_id JOIN clients c ON c.id=s.client_id WHERE v.id=?`, [String(visiteId)]);
}

async function loadVisitTrameUsedName(db, visiteId) {
  const row = await db.getFirstAsync(`SELECT valeur
    FROM champs_visite
    WHERE visite_id=? AND cle='Trame utilisée'
      AND valeur IS NOT NULL AND trim(valeur)<>''
    ORDER BY rowid DESC LIMIT 1`, [String(visiteId)]);
  return clean(row?.valeur) || null;
}

function localBindingState(local, trameId, selectedReference = null) {
  const reference = selectedReference || parseJson(local?.reference_json);
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

async function frozenVisitReference(db, visite) {
  const expectedId = clean(visite?.api_remote_trame_id);
  if (!expectedId || !clean(visite?.api_remote_local_id)) return null;
  const rows = await db.getAllAsync(`SELECT details_json FROM provenances WHERE entite_type='visite' AND entite_id=? AND origine='api_symfony' ORDER BY importe_le DESC`, [visite.id]);
  for (const row of rows) {
    const details = parseJson(row.details_json);
    if (['preparation_visite','remar_upload_preselection'].includes(details?.sourceType) &&
        clean(details?.trame?.id) === expectedId &&
        clean(details?.local?.id) === clean(visite.api_remote_local_id)) return details;
  }
  return null;
}

async function resolveImportedLocalId(db, visite, remoteClientId, remoteSiteId) {
  const rows = await db.getAllAsync(`SELECT remote_local_id,remote_site_id,local_installation_id,designation,remote_trame_id,remote_trame_nom,
      derniere_visite_id,derniere_visite_date,criteria_count,material_count,reference_json
    FROM api_local_links WHERE remote_site_id=? AND remote_present=1 ORDER BY designation,remote_local_id`, [remoteSiteId]);
  const frozen = await frozenVisitReference(db, visite);
  const locals = rows.map((row) => ({ ...row, ...localBindingState(row, visite.trame_id,
    frozen && clean(frozen.local?.id) === clean(row.remote_local_id) ? frozen : null) }));
  const sendable = locals.filter((row) => row.compatible);
  // L'identité du local importé prévaut TOUJOURS sur la compatibilité
  // de la trame. Si la trame n'est plus valable, on répare la référence du
  // MÊME local : on ne cherche jamais un autre local à trame compatible.
  const verifyKnownLocal = (id, origin) => {
    const known = locals.find((row) => clean(row.remote_local_id) === clean(id));
    if (!known) throw bindingError(
      `Le local Intranet ${id}, déjà lié à cette visite via ${origin}, n'est plus présent sur son site. Actualise le référentiel du client sans déplacer la visite.`,
      'intranet_reference_refresh_required', { remoteClientId, remoteLocalId: id }
    );
    if (!known.compatible) throw bindingError(
      `Le local Intranet ${known.designation || id} (ID ${id}) est bien identifié, mais sa trame ou sa préparation ne permet pas l'envoi : ${known.compatibilityReason}. Actualise la trame de CE local, sans choisir un autre local.`,
      'intranet_reference_refresh_required', { remoteClientId, remoteLocalId: id }
    );
    return clean(known.remote_local_id);
  };
  const frozenLocalId = clean(visite.api_remote_local_id);
  if (frozenLocalId) return verifyKnownLocal(frozenLocalId, 'la visite');

  // Des visites créées à partir d'une référence importée peuvent avoir perdu
  // leur colonne api_remote_local_id au fil d'anciennes migrations. Leur
  // provenance contient toutefois l'identité originale, immuable et complète
  // du local ET du site Intranet. Cette preuve suffit, contrairement au nom.
  const savedReferences = await db.getAllAsync(`SELECT details_json FROM provenances
    WHERE entite_type='visite' AND entite_id=? AND origine='api_symfony'
    ORDER BY importe_le DESC`, [String(visite.id)]);
  const sourcedIds = new Set();
  for (const entry of savedReferences) {
    const details = parseJson(entry.details_json);
    if (!['preparation_visite','remar_upload_preselection'].includes(details?.sourceType)) continue;
    const site = clean(details?.site?.id);
    const id = clean(details?.local?.id);
    const source = clean(details?.remoteLocalId);
    if (site === clean(remoteSiteId) && validApiId(id) && (!source || source === id))
      sourcedIds.add(id);
  }
  if (sourcedIds.size > 1) {
    throw bindingError('Cette visite conserve plusieurs identifiants de locaux Intranet dans ses anciennes préparations. Aucune réaffectation automatique.',
      'imported_local_identity_conflict', { remoteClientId });
  }
  if (sourcedIds.size === 1) return verifyKnownLocal([...sourcedIds][0], 'sa préparation Intranet d’origine');

  if (clean(visite.installation_id)) {
    const installed = locals.filter((row) => clean(row.local_installation_id) === clean(visite.installation_id));
    if (installed.length === 1) return verifyKnownLocal(installed[0].remote_local_id, 'son installation METRA');
    if (installed.length > 1) {
      throw bindingError('Plusieurs locaux Intranet sont liés à la même installation METRA. METRA refuse de choisir au hasard.', 'imported_local_ambiguous', { remoteClientId });
    }

    // Récupération d'une liaison durable précédente lorsque api_local_links
    // a perdu son local_installation_id. On exige la provenance d'identité
    // Symfony de CETTE installation, pas une égalité de nom (D2/D3).
    const provenances = await db.getAllAsync(
      `SELECT DISTINCT reference_externe FROM provenances
       WHERE entite_type='installation' AND entite_id=?
         AND origine='api_symfony' AND reference_externe IS NOT NULL
         AND trim(reference_externe)<>''`, [String(visite.installation_id)]
    );
    // Une ancienne visite du MEME identifiant d'installation constitue une
    // autre preuve forte de son ID Symfony. Le nom « D2 » n'est jamais
    // consulté. Plusieurs IDs différents = conflit, pas de déduction.
    const anciennesVisites = await db.getAllAsync(
      `SELECT DISTINCT api_remote_local_id AS reference_externe FROM visites
       WHERE installation_id=? AND api_remote_local_id IS NOT NULL
         AND trim(api_remote_local_id)<>''`,
      [String(visite.installation_id)]
    );
    const referenceIds = [...new Set([...provenances, ...anciennesVisites]
      .map(p => clean(p.reference_externe)).filter(Boolean))];
    if (referenceIds.length > 1) {
      throw bindingError('Cette installation conserve plusieurs identités de locaux Intranet différentes. Un choix explicite du local est indispensable.',
        'imported_local_identity_conflict', { remoteClientId });
    }
    if (referenceIds.length === 1) {
      const evidenced = locals.find(row => clean(row.remote_local_id) === referenceIds[0]);
      if (evidenced && clean(evidenced.local_installation_id) &&
          clean(evidenced.local_installation_id) !== clean(visite.installation_id)) {
        throw bindingError('Ce local Intranet est déjà attribué à une autre installation METRA. Vérifie les identifiants avant toute modification.', 'imported_local_identity_conflict', { remoteClientId });
      }
      return verifyKnownLocal(referenceIds[0], 'la provenance de cette installation');
    }
    // Dès lors que l'installation physique est connue, choisir l'unique
    // « local compatible » d'un site ne prouve pas l'identité. C'était une
    // source de mélanges silencieux sur les sites à plusieurs locaux.
    throw bindingError('Cette visite a une installation METRA précise, mais la correspondance Intranet n’est pas encore retrouvée. Réimporte le local puis vérifie ses identifiants ; aucun autre local ne sera choisi automatiquement.',
      'imported_local_ambiguous', { remoteClientId });
  }
  // Pour une visite historique SANS installation, seulement si le site n'a
  // qu'un seul local réellement compatible et aucun identifiant contradictoire.
  if (sendable.length === 1) return clean(sendable[0].remote_local_id);
  if (!sendable.length) {
    const reasons = [...new Set(locals.map((row) => row.compatibilityReason).filter(Boolean))];
    throw bindingError(reasons[0] || 'Aucun local Intranet compatible n’est relié à ce site importé.', 'intranet_reference_refresh_required', { remoteClientId });
  }
  throw bindingError(
    clean(visite.installation_id)
      ? 'Cette visite est liée à un local METRA, mais son identifiant Intranet n’est pas établi. Choisis explicitement le local Intranet de cette visite (sans changer le site ni la trame).'
      : 'Plusieurs locaux Intranet compatibles existent et cette visite historique n’a aucun local METRA. Choisis explicitement son local Intranet.',
    'imported_local_ambiguous', { remoteClientId });
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
    const frozen = await frozenVisitReference(db, visite);
    locals = rawLocals.map((row) => ({ ...row, ...localBindingState(row, visite.trame_id,
      frozen && clean(frozen.local?.id) === clean(row.remote_local_id) ? frozen : null) }));
    suggestedLocalId = await resolveImportedLocalId(db, visite, selectedClientId, selectedSiteId).catch(() => null);
  }
  const visitTrameName = await loadVisitTrameUsedName(db, visite.id);
  return { visite, visitTrameName, clients, sites, locals, selectedClientId, selectedSiteId, suggestedLocalId };
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
  // Une sélection explicite ne peut jamais déplacer silencieusement une
  // installation, son matériel ou ses anciennes visites vers un autre local.
  const oldVisitLocal = clean(visite.api_remote_local_id);
  if (oldVisitLocal && oldVisitLocal !== localId)
    throw bindingError('Cette visite possède déjà un identifiant Intranet différent. Rattachement modifiable uniquement après audit des identités.', 'imported_local_identity_conflict');
  if (clean(visite.installation_id)) {
    const installationId = clean(visite.installation_id);
    if (clean(local.local_installation_id) && clean(local.local_installation_id) !== installationId)
      throw bindingError('Ce local Intranet est déjà associé à une autre installation METRA. Aucun mélange de patrimoine autorisé.', 'imported_local_identity_conflict');
    const links = await db.getAllAsync(`SELECT remote_local_id FROM api_local_links
      WHERE local_installation_id=? AND remote_present=1`, [installationId]);
    if (links.some(link => clean(link.remote_local_id) !== localId))
      throw bindingError('Cette installation METRA est déjà associée à un autre local Intranet. Aucune modification automatique.', 'imported_local_identity_conflict');
    const provenances = await db.getAllAsync(`SELECT DISTINCT reference_externe FROM provenances
      WHERE entite_type='installation' AND entite_id=? AND origine='api_symfony'
        AND reference_externe IS NOT NULL AND trim(reference_externe)<>''`, [installationId]);
    if (provenances.some(source => clean(source.reference_externe) !== localId))
      throw bindingError('La provenance d’origine de cette installation est un autre local Intranet. Aucun transfert automatique.', 'imported_local_identity_conflict');
    const existingVisitLocals = await db.getAllAsync(`SELECT DISTINCT api_remote_local_id
      FROM visites WHERE installation_id=? AND api_remote_local_id IS NOT NULL
        AND trim(api_remote_local_id)<>''`, [installationId]);
    if (existingVisitLocals.some(ref => clean(ref.api_remote_local_id) !== localId))
      throw bindingError('Une ancienne visite de cette installation est liée à un autre local Intranet. Aucun changement automatique de son identité.', 'imported_local_identity_conflict');
  }

  const frozen = await frozenVisitReference(db, visite);
  if (frozen && (clean(frozen.local?.id) !== localId || clean(frozen.site?.id) !== siteId)) {
    throw bindingError('La preparation selectionnee ne correspond plus au local ou site de cette visite.', 'selected_trame_binding_mismatch');
  }
  const state = localBindingState(local, visite.trame_id, frozen);
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
    if (clean(visite.installation_id)) {
      await db.runAsync(`UPDATE api_local_links SET local_installation_id=?
        WHERE remote_local_id=? AND (local_installation_id IS NULL OR local_installation_id='' OR local_installation_id=?)`,
        [visite.installation_id, localId, visite.installation_id]);
      // Conserver la correspondance d'identité : les futures visites du même
      // local ne nécessiteront plus de sélection manuelle ni de nom heuristique.
      const existing = await db.getFirstAsync(`SELECT id FROM provenances
        WHERE entite_type='installation' AND entite_id=? AND origine='api_symfony'
          AND reference_externe=? LIMIT 1`, [visite.installation_id, localId]);
      if (!existing?.id) await db.runAsync(
        `INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json)
         VALUES(?,?,?,?,?,?)`,
        [createId(), 'installation', visite.installation_id, 'api_symfony', localId,
          JSON.stringify({ sourceType: 'local', remoteLocalId: localId, remoteSiteId: siteId, explicitTechnicianBinding: true })]);
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
    trameName: frozenTrame.nom || null,
  };
}


/**
 * Une alternative REMAR n'est épinglée qu'après GET authentifié de sa
 * préparation, couverture complète et unique de chaque destination.
 * Cette opération ne fabrique ni visite Symfony ni envoiId, et ne touche
 * jamais une file d'envoi existante (même en échec). Les autres trames
 * et les visites historiques conservent leur binding précédent.
 */
export async function pinVerifiedRemarTrameForUpload(visiteId, {
  remoteClientId,remoteSiteId,remoteLocalId,reference,
}={}) {
  const clientId=clean(remoteClientId),siteId=clean(remoteSiteId);
  const localId=clean(remoteLocalId),trameId=clean(reference?.trame?.id);
  if(![clientId,siteId,localId,trameId].every(validApiId))
    throw bindingError('Référence REMAR distante incomplète ou non validée.','remar_trame_preselection_invalid');
  if(clean(reference?.site?.id)!==siteId || clean(reference?.local?.id)!==localId ||
     clean(reference?.trame?.id)!==trameId)
    throw bindingError('La préparation REMAR ne correspond pas au site, local et trame choisis.',
      'remar_trame_preselection_mismatch');
  const db=await getDb(),visite=await loadVisit(db,visiteId);
  if(!visite || visite.trame_id!=='remar_v1'||Number(visite.api_is_historical)===1)
    throw bindingError('La présélection est réservée à une visite REMAR courante.',
      'remar_trame_preselection_wrong_visit');
  const queued=await db.getFirstAsync('SELECT status FROM api_visit_outbox WHERE visite_id=? LIMIT 1',[String(visiteId)]);
  if(queued)throw bindingError('La visite possède un envoi figé : impossible de changer sa trame.',
    'remar_trame_preselection_outbox');
  const client=await db.getFirstAsync(
    'SELECT remote_client_id FROM api_client_links WHERE remote_client_id=? AND local_client_id=? AND autorise=1',
    [clientId,visite.client_id]);
  const site=await db.getFirstAsync(
    'SELECT cs.remote_site_id FROM api_client_site_links cs JOIN api_site_links s ON s.remote_site_id=cs.remote_site_id WHERE cs.remote_client_id=? AND cs.remote_site_id=? AND cs.remote_present=1 AND s.remote_present=1 AND COALESCE(s.local_site_id,cs.local_site_id)=?',
    [clientId,siteId,visite.site_id]);
  const local=await db.getFirstAsync(
    'SELECT * FROM api_local_links WHERE remote_local_id=? AND remote_site_id=? AND remote_present=1',
    [localId,siteId]);
  if(!client||!site||!local)
    throw bindingError('Préparation REMAR hors du client, site ou local Intranet importé.',
      'remar_trame_preselection_wrong_target');
  const frozen=await frozenVisitReference(db,visite);
  if(frozen && (clean(frozen.local?.id)!==localId||clean(frozen.site?.id)!==siteId))
    throw bindingError('Ancienne préparation figée sur un autre local : sélection REMAR interdite.',
      'remar_trame_preselection_frozen_target');
  const previousLatest=clean(frozen?.derniereVisite?.id) ||
    clean(visite.api_source_remote_visit_id) || clean(local?.derniere_visite_id);
  const currentLatest=clean(reference?.derniereVisite?.id);
  if(previousLatest!==currentLatest)
    throw bindingError('Une visite plus récente ou une référence différente existe côté Symfony. Actualise puis compare les visites.',
      'remar_trame_preselection_latest_conflict');
  const state=localBindingState(local,visite.trame_id,reference);
  if(!state.compatible)
    throw bindingError(state.compatibilityReason,'remar_trame_preselection_incompatible');
  const older=await db.getAllAsync(
    "SELECT id,details_json FROM provenances WHERE entite_type='visite' AND entite_id=? AND origine='api_symfony'",
    [String(visiteId)]);
  const removable=older.filter(x=>parseJson(x.details_json)?.sourceType==='remar_upload_preselection')
    .map(x=>x.id);
  const pinned={...reference,sourceType:'remar_upload_preselection',
    provenance:'unique_full_remar_criteria_and_same_imported_client',
    remoteLocalId:localId,remoteClientId:clientId};
  await db.withTransactionAsync(async()=>{
    // Conserver l'historique de première préparation ; ne remplacer que
    // la présélection REMAR non envoyée précédemment.
    for(const id of removable)await db.runAsync('DELETE FROM provenances WHERE id=?',[id]);
    await db.runAsync(
      "INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json) VALUES(?,?,?,?,?,?)",
      [createId(),'visite',String(visiteId),'api_symfony',localId,JSON.stringify(pinned)]);
    await db.runAsync(
      "UPDATE visites SET api_remote_client_id=?,api_remote_local_id=?,api_remote_trame_id=?,api_source_remote_visit_id=?,modifie_le=datetime('now') WHERE id=?",
      [clientId,localId,trameId,currentLatest||null,String(visiteId)]);
  });
  return {remoteClientId:clientId,remoteSiteId:siteId,remoteLocalId:localId,
    remoteTrameId:trameId,remoteTrameName:clean(reference?.trame?.nom)};
}
