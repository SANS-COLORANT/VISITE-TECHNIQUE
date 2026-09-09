import { createId } from './database/ids.js';
import { DEFAULT_TRAME_ID, obtenirTrame } from './trameRegistry.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function sectionCode(panelId, section) {
  return panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

const CURRENT_METADATA_KEYS = new Set([
  'Nom du client',
  'Nom du site',
  'Nom du local',
  'Nom du local / adresse',
  'Trame utilisée',
  'Date de la visite',
  'Date de visite',
  'Heure de visite',
  'Adresse',
]);

function canCarryField(trame, field) {
  if (!field?.cle || field.type !== 'champ') return false;
  if (CURRENT_METADATA_KEYS.has(field.cle)) return false;

  // Pré-allumage est volontairement l'exception : seules les informations
  // durables explicitement marquées stable/carryForward sont reprises.
  if (trame.id === 'pre_allumage') return Boolean(field.stable || field.carryForward);

  // ICPE, VMC et les futures trames classiques repartent de la dernière
  // visite du même local/trame. Les valeurs restent immédiatement modifiables.
  return true;
}

function technicalControlKeys(trame) {
  const keys = new Set();
  // Dans l'ICPE, les contrôles du panneau Relevés portent aussi la mesure métier
  // dans commentaire (pH, températures...). Cette valeur doit survivre au report.
  if (trame.id !== DEFAULT_TRAME_ID) return keys;
  const panelId = 'p-releves';
  for (const [section, fields] of Object.entries(trame.ui?.panels?.[panelId] || {})) {
    const code = sectionCode(panelId, section);
    for (const field of fields || []) {
      if (field?.type === 'controle' && field?.cle) keys.add(`${code}||${field.cle}`);
    }
  }
  return keys;
}

async function isImportedHistoricalVisit(db, visiteId) {
  const row = await db.getFirstAsync(
    `SELECT id FROM provenances
     WHERE entite_type='visite' AND entite_id=? AND origine='api_symfony'
       AND details_json LIKE '%\"sourceType\":\"imported_latest_visit\"%'
     ORDER BY importe_le DESC LIMIT 1`,
    [visiteId]
  );
  return Boolean(row?.id);
}

async function copyReusableFields(db, visiteId, previousVisitId, trame) {
  const rows = await db.getAllAsync(
    `SELECT section_code,cle,valeur FROM champs_visite
     WHERE visite_id=? AND valeur IS NOT NULL AND trim(valeur)<>''`,
    [previousVisitId]
  );
  let copied = 0;

  if (trame.id !== 'pre_allumage') {
    // Reprendre aussi les champs techniques hors registre UI (ex. vmc.config)
    // afin de conserver le nombre réel et le nom des caissons.
    for (const row of rows || []) {
      if (!row?.section_code || !row?.cle || CURRENT_METADATA_KEYS.has(row.cle)) continue;
      const result = await db.runAsync(
        `INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)
         ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur
         WHERE champs_visite.valeur IS NULL OR trim(champs_visite.valeur)=''`,
        [visiteId, row.section_code, row.cle, String(row.valeur)]
      );
      if (Number(result?.changes || 0) > 0) copied += 1;
    }
    return copied;
  }

  const previous = new Map((rows || []).map((row) => [`${row.section_code}||${row.cle}`, row.valeur]));
  for (const [panelId, sections] of Object.entries(trame.ui?.panels || {})) {
    for (const [section, fields] of Object.entries(sections || {})) {
      const code = sectionCode(panelId, section);
      for (const field of fields || []) {
        if (!canCarryField(trame, field)) continue;
        const value = previous.get(`${code}||${field.cle}`);
        if (value == null || clean(value) === '') continue;
        const result = await db.runAsync(
          `INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)
           ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur
           WHERE champs_visite.valeur IS NULL OR trim(champs_visite.valeur)=''`,
          [visiteId, code, field.cle, String(value)]
        );
        if (Number(result?.changes || 0) > 0) copied += 1;
      }
    }
  }
  return copied;
}

async function copyReusableControls(db, visiteId, previousVisitId, trame) {
  // Les essais de Pré-allumage doivent être refaits à chaque visite.
  if (trame.id === 'pre_allumage') return 0;

  const importedHistory = await isImportedHistoricalVisit(db, previousVisitId);
  const technicalKeys = importedHistory ? technicalControlKeys(trame) : new Set();
  const rows = await db.getAllAsync(
    `SELECT section_code,cle,avis,commentaire FROM controles_visite
     WHERE visite_id=?
       AND (avis IS NOT NULL OR commentaire IS NOT NULL)`,
    [previousVisitId]
  );
  let copied = 0;
  for (const row of rows || []) {
    if (!row?.section_code || !row?.cle) continue;
    const key = `${row.section_code}||${row.cle}`;
    const avis = clean(row.avis) || null;
    const previousComment = clean(row.commentaire) || null;
    // Une visite historique Intranet sert de photographie de départ : on reprend
    // l'avis S/N.S/etc., mais pas son commentaire de conformité. Les mesures du
    // panneau Relevés restent conservées car leur valeur métier est portée par
    // commentaire dans le modèle Symfony.
    const commentaire = importedHistory && !technicalKeys.has(key) ? null : previousComment;
    if (!avis && !commentaire) continue;
    const result = await db.runAsync(
      `INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire)
       VALUES(?,?,?,?,?)
       ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET
         avis=excluded.avis,
         commentaire=excluded.commentaire
       WHERE (controles_visite.avis IS NULL OR trim(controles_visite.avis)='')
         AND (controles_visite.commentaire IS NULL OR trim(controles_visite.commentaire)='')`,
      [visiteId, row.section_code, row.cle, avis, commentaire]
    );
    if (Number(result?.changes || 0) > 0) copied += 1;
  }
  return copied;
}

async function copyNetworkValues(db, visiteId, previousVisitId) {
  const existing = await db.getFirstAsync(`SELECT COUNT(*) AS n FROM reseaux WHERE visite_id=?`, [visiteId]);
  if (Number(existing?.n || 0) > 0) return 0;

  const previous = await db.getAllAsync(
    `SELECT ordre,nom_reseau,t_ext_c,t_dep_c,courbe_de_chauffe,tnc,consigne_programme_horaire,reseau_site_id
     FROM reseaux WHERE visite_id=? ORDER BY ordre,id`,
    [previousVisitId]
  );
  let copied = 0;
  for (const row of previous || []) {
    await db.runAsync(
      `INSERT INTO reseaux(id,visite_id,ordre,nom_reseau,t_ext_c,t_dep_c,courbe_de_chauffe,tnc,consigne_programme_horaire,reseau_site_id)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [createId(), visiteId, Number(row.ordre || 0), row.nom_reseau || 'Réseau', row.t_ext_c ?? null,
        row.t_dep_c ?? null, row.courbe_de_chauffe ?? null, row.tnc ?? null,
        row.consigne_programme_horaire ?? null, row.reseau_site_id || null]
    );
    copied += 1;
  }
  return copied;
}

async function copyMeterValues(db, visiteId, previousVisitId) {
  const existing = await db.getFirstAsync(`SELECT COUNT(*) AS n FROM compteurs WHERE visite_id=?`, [visiteId]);
  if (Number(existing?.n || 0) > 0) return 0;

  const previous = await db.getAllAsync(
    `SELECT label,valeur,unite,compteur_site_id FROM compteurs WHERE visite_id=? ORDER BY id`,
    [previousVisitId]
  );
  let copied = 0;
  for (const row of previous || []) {
    await db.runAsync(
      `INSERT INTO compteurs(id,visite_id,label,valeur,unite,compteur_site_id) VALUES(?,?,?,?,?,?)`,
      [createId(), visiteId, row.label || 'Compteur', row.valeur ?? null, row.unite || null, row.compteur_site_id || null]
    );
    copied += 1;
  }
  return copied;
}

async function remoteLocalForInstallation(db, installationId) {
  if (!installationId) return null;
  const link = await db.getFirstAsync(
    `SELECT remote_local_id FROM api_local_links WHERE local_installation_id=? AND remote_present=1 ORDER BY synced_at DESC LIMIT 1`,
    [installationId]
  );
  return clean(link?.remote_local_id) || null;
}

async function bindInstallation(db, contexte, visiteId, installationId, remoteLocalId = null) {
  const finalRemoteLocalId = clean(remoteLocalId) || await remoteLocalForInstallation(db, installationId);
  const installation = await db.getFirstAsync(`SELECT nom FROM installations WHERE id=? LIMIT 1`, [installationId]);
  await db.runAsync(
    `UPDATE visites SET installation_id=?,api_remote_local_id=COALESCE(api_remote_local_id,?),modifie_le=datetime('now') WHERE id=?`,
    [installationId, finalRemoteLocalId, visiteId]
  );
  return {
    ...contexte,
    installation_id: installationId,
    api_remote_local_id: contexte.api_remote_local_id || finalRemoteLocalId,
    nom_installation: contexte.nom_installation || installation?.nom || null,
  };
}

async function inferUniqueInstallation(db, contexte, visiteId, trameId) {
  if (contexte.installation_id) {
    const enriched = contexte.api_remote_local_id
      ? contexte
      : await bindInstallation(db, contexte, visiteId, contexte.installation_id, null);
    return { contexte: enriched, canCarry: true };
  }

  const history = await db.getAllAsync(
    `SELECT id,installation_id,api_remote_local_id,date_visite,modifie_le
     FROM visites
     WHERE site_id=? AND id<>? AND COALESCE(trame_id, ?) = ? AND installation_id IS NOT NULL
     ORDER BY COALESCE(date_visite,'') DESC,modifie_le DESC`,
    [contexte.site_id, visiteId, DEFAULT_TRAME_ID, trameId]
  );
  const installationIds = [...new Set((history || []).map((row) => clean(row.installation_id)).filter(Boolean))];

  if (installationIds.length > 1) {
    // Plusieurs locaux portent des visites de cette trame : il faut un choix
    // explicite de local, sinon aucune donnée locale n'est reportée.
    return { contexte, canCarry: false };
  }

  if (installationIds.length === 1) {
    const installationId = installationIds[0];
    const remoteLocalId = clean((history || []).find((row) => clean(row.installation_id) === installationId && clean(row.api_remote_local_id))?.api_remote_local_id) || null;
    return { contexte: await bindInstallation(db, contexte, visiteId, installationId, remoteLocalId), canCarry: true };
  }

  const installations = await db.getAllAsync(
    `SELECT id FROM installations WHERE site_id=? AND actif=1 ORDER BY cree_le,id`,
    [contexte.site_id]
  );
  if (installations.length > 1) return { contexte, canCarry: false };
  if (installations.length === 1) {
    return { contexte: await bindInstallation(db, contexte, visiteId, installations[0].id, null), canCarry: true };
  }

  // Ancien patrimoine sans notion de local : on conserve le report historique
  // au niveau du site pour ne pas casser les visites existantes.
  return { contexte, canCarry: true };
}

export async function carryForwardPreviousVisit(db, visiteId, contexte) {
  // Le report automatique n'est déclenché que pour une nouvelle visite active.
  // Ouvrir une ancienne visite terminée/importée ne doit jamais la modifier à
  // partir d'une autre visite historique.
  if (clean(contexte?.statut) !== 'en_cours') {
    return { contexte, previousVisitId: null, copiedFields: 0, copiedControls: 0, copiedNetworks: 0, copiedMeters: 0, skippedHistoricalVisit: true };
  }

  const trame = obtenirTrame(contexte.trame_id || DEFAULT_TRAME_ID);
  const resolution = await inferUniqueInstallation(db, contexte, visiteId, trame.id);
  const resolved = resolution.contexte;
  if (!resolution.canCarry) {
    return { contexte: resolved, previousVisitId: null, copiedFields: 0, copiedControls: 0, copiedNetworks: 0, copiedMeters: 0, ambiguousLocal: true };
  }

  const previous = await db.getFirstAsync(
    `SELECT id FROM visites
     WHERE site_id=? AND id<>? AND COALESCE(trame_id, ?) = ?
       AND (? IS NULL OR installation_id=?)
     ORDER BY COALESCE(date_visite,'') DESC,modifie_le DESC LIMIT 1`,
    [resolved.site_id, visiteId, DEFAULT_TRAME_ID, trame.id, resolved.installation_id, resolved.installation_id]
  );
  if (!previous?.id) return { contexte: resolved, previousVisitId: null, copiedFields: 0, copiedControls: 0, copiedNetworks: 0, copiedMeters: 0 };

  const copiedFields = await copyReusableFields(db, visiteId, previous.id, trame);
  const copiedControls = await copyReusableControls(db, visiteId, previous.id, trame);
  const copiedNetworks = trame.id === DEFAULT_TRAME_ID ? await copyNetworkValues(db, visiteId, previous.id) : 0;
  const copiedMeters = trame.id === DEFAULT_TRAME_ID ? await copyMeterValues(db, visiteId, previous.id) : 0;

  return {
    contexte: resolved,
    previousVisitId: previous.id,
    copiedFields,
    copiedControls,
    copiedNetworks,
    copiedMeters,
    ambiguousLocal: false,
  };
}
