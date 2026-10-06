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
  // ICPE, VMC, Réseau de chaleur et les futures trames classiques repartent
  // de la dernière saisie connue du même local/trame. Les valeurs sont un
  // préremplissage immédiatement modifiable, jamais une validation du jour.
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
  const rows = trame.id === 'reseau_chaleur_v1' ? await db.getAllAsync(
    `SELECT c.section_code,c.cle,c.valeur FROM champs_visite c JOIN visites v ON v.id=c.visite_id
     WHERE v.id<>? AND v.trame_id=? AND v.installation_id=(SELECT installation_id FROM visites WHERE id=?)
       AND c.valeur IS NOT NULL AND trim(c.valeur)<>''
     ORDER BY COALESCE(v.date_visite,'') DESC,v.modifie_le DESC`, [visiteId, trame.id, visiteId]
  ) : await db.getAllAsync(
    `SELECT section_code,cle,valeur FROM champs_visite
     WHERE visite_id=? AND valeur IS NOT NULL AND trim(valeur)<>''`,
    [previousVisitId]
  );
  let copied = 0;

  if (trame.id !== 'pre_allumage' && trame.id !== 'reseau_chaleur_v1') {
    // Chemin critique d'ouverture : recopier tous les champs réutilisables en
    // une seule instruction SQLite au lieu d'une écriture JS par champ.
    const metadata = [...CURRENT_METADATA_KEYS];
    const placeholders = metadata.map(() => '?').join(',');
    const result = await db.runAsync(
      `INSERT INTO champs_visite(visite_id,section_code,cle,valeur)
       SELECT ?,section_code,cle,valeur
       FROM champs_visite
       WHERE visite_id=?
         AND valeur IS NOT NULL AND trim(valeur)<>''
         AND section_code IS NOT NULL AND trim(section_code)<>''
         AND cle IS NOT NULL AND trim(cle)<>''
         AND cle NOT IN (${placeholders})
       ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur
       WHERE champs_visite.valeur IS NULL OR trim(champs_visite.valeur)=''`,
      [visiteId, previousVisitId, ...metadata]
    );
    return Number(result?.changes || 0);
  }

  const previous = new Map();
  for (const row of rows || []) {
    const key = `${row.section_code}||${row.cle}`;
    if (!previous.has(key)) previous.set(key, row.valeur);
  }
  for (const [panelId, sections] of Object.entries(trame.ui?.panels || {})) {
    for (const [section, fields] of Object.entries(sections || {})) {
      const code = trame.excel?.fieldMappings?.find((m) => m.panelId === panelId && m.section === section)?.sectionCode || sectionCode(panelId, section);
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
    // Le commentaire fait partie de la dernière saisie connue du contrôle et
    // doit donc être proposé avec l'avis. Il reste modifiable dans la nouvelle
    // visite et aucune réserve historique n'est dupliquée.
    const commentaire = previousComment;
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

async function copyNetworkValues(db, visiteId, previousVisitId, referenceOnly = false) {
  const existing = await db.getFirstAsync(`SELECT COUNT(*) AS n FROM reseaux WHERE visite_id=?`, [visiteId]);
  if (Number(existing?.n || 0) > 0) return 0;

  const previous = await db.getAllAsync(
    `SELECT id,ordre,nom_reseau,t_ext_c,t_dep_c,courbe_de_chauffe,tnc,consigne_programme_horaire,reseau_site_id
     FROM reseaux WHERE visite_id=? ORDER BY ordre,id`,
    [previousVisitId]
  );
  let copied = 0;
  for (const row of previous || []) {
    const newId = createId();
    await db.runAsync(
      `INSERT INTO reseaux(id,visite_id,ordre,nom_reseau,t_ext_c,t_dep_c,courbe_de_chauffe,tnc,consigne_programme_horaire,reseau_site_id)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [newId, visiteId, Number(row.ordre || 0), row.nom_reseau || 'Réseau', referenceOnly ? null : row.t_ext_c ?? null,
        referenceOnly ? null : row.t_dep_c ?? null, row.courbe_de_chauffe ?? null, row.tnc ?? null,
        row.consigne_programme_horaire ?? null, row.reseau_site_id || null]
    );
    const provenance = await db.getAllAsync(`SELECT reference_externe,details_json FROM provenances WHERE entite_type='reseau' AND entite_id=? AND origine='api_symfony' ORDER BY importe_le`, [row.id]);
    for (const source of provenance || []) {
      await db.runAsync(`INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json) VALUES(?, 'reseau', ?, 'api_symfony', ?, ?)`,
        [createId(), newId, source.reference_externe ?? null, source.details_json ?? null]);
    }
    copied += 1;
  }
  return copied;
}

async function copyMeterValues(db, visiteId, previousVisitId, referenceOnly = false) {
  const existing = await db.getFirstAsync(`SELECT COUNT(*) AS n FROM compteurs WHERE visite_id=?`, [visiteId]);
  if (Number(existing?.n || 0) > 0) return 0;

  const previous = await db.getAllAsync(
    `SELECT label,valeur,unite,compteur_site_id,destination FROM compteurs WHERE visite_id=? ORDER BY id`,
    [previousVisitId]
  );
  let copied = 0;
  for (const row of previous || []) {
    await db.runAsync(
      `INSERT INTO compteurs(id,visite_id,label,valeur,unite,compteur_site_id,destination) VALUES(?,?,?,?,?,?,?)`,
      [createId(), visiteId, row.label || 'Compteur', referenceOnly ? null : row.valeur ?? null, row.unite || null, row.compteur_site_id || null, row.destination || null]
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

// Répare les imports anciens uniquement lorsque les objets liés prouvent un
// local unique. Aucune déduction à partir du premier local du site.
async function bindLegacyExcelVisits(db, siteId, trameId) {
  const imports = await db.getAllAsync(`SELECT v.id FROM visites v
    WHERE v.site_id=? AND v.trame_id=? AND v.installation_id IS NULL
      AND EXISTS(SELECT 1 FROM provenances p WHERE p.entite_type='visite' AND p.entite_id=v.id AND p.origine='import_excel')`, [siteId, trameId]);
  for (const visite of imports) {
    const locaux = await db.getAllAsync(`SELECT DISTINCT i.id FROM installations i JOIN (
      SELECT e.installation_id FROM materiel m JOIN equipements e ON e.id=m.equipement_id WHERE m.visite_id=?
      UNION SELECT r.installation_id FROM reseaux n JOIN reseaux_site r ON r.id=n.reseau_site_id WHERE n.visite_id=?
      UNION SELECT c.installation_id FROM compteurs n JOIN compteurs_site c ON c.id=n.compteur_site_id WHERE n.visite_id=?
    ) linked ON linked.installation_id=i.id WHERE i.site_id=?`, [visite.id, visite.id, visite.id, siteId]);
    if (locaux.length === 1) await db.runAsync('UPDATE visites SET installation_id=? WHERE id=? AND installation_id IS NULL', [locaux[0].id, visite.id]);
    const materiels = await db.getAllAsync('SELECT equipement_id,nombre,numero_materiel,reseau_desservi,caracteristiques FROM materiel WHERE visite_id=? AND equipement_id IS NOT NULL', [visite.id]);
    for (const m of materiels) {
      for (const cle of ['nombre','numero_materiel','reseau_desservi','caracteristiques']) {
        if (!clean(m[cle])) continue;
        await db.runAsync(`INSERT INTO attributs_libres(id,entite_type,entite_id,cle,valeur) VALUES(?,'equipement',?,?,?)
          ON CONFLICT(entite_type,entite_id,cle) DO NOTHING`, [createId(), m.equipement_id, `patrimoine.${cle}`, String(m[cle])]);
      }
    }
  }
}

async function seedRcuLocalStructure(db, visiteId, installationId) {
  if (!installationId) return;
  const reseaux = await db.getAllAsync(`SELECT s.id,COALESCE(NULLIF(r.nom_reseau,''),s.nom) AS nom,s.ordre,r.courbe_de_chauffe,r.tnc,r.consigne_programme_horaire
    FROM reseaux_site s LEFT JOIN reseaux r ON r.id=(
      SELECT n.id FROM reseaux n JOIN visites v ON v.id=n.visite_id
      WHERE n.reseau_site_id=s.id AND v.id<>? AND v.trame_id='reseau_chaleur_v1'
      ORDER BY COALESCE(v.date_visite,'') DESC,v.modifie_le DESC LIMIT 1)
    WHERE s.installation_id=? AND s.actif=1
      AND NOT EXISTS(SELECT 1 FROM reseaux n WHERE n.visite_id=? AND n.reseau_site_id=s.id)`, [visiteId, installationId, visiteId]);
  for (const r of reseaux) {
    await db.runAsync(`INSERT INTO reseaux(id,visite_id,reseau_site_id,ordre,nom_reseau,courbe_de_chauffe,tnc,consigne_programme_horaire)
      VALUES(?,?,?,?,?,?,?,?)`, [createId(), visiteId, r.id, r.ordre, r.nom, r.courbe_de_chauffe, r.tnc, r.consigne_programme_horaire]);
  }
  const compteurs = await db.getAllAsync(`SELECT s.* FROM compteurs_site s WHERE s.installation_id=? AND s.actif=1
    AND NOT EXISTS(SELECT 1 FROM compteurs c WHERE c.visite_id=? AND c.compteur_site_id=s.id)`, [installationId, visiteId]);
  for (const c of compteurs) {
    await db.runAsync('INSERT INTO compteurs(id,visite_id,compteur_site_id,label,unite,destination) VALUES(?,?,?,?,?,?)', [createId(), visiteId, c.id, c.libelle, c.unite, c.destination || null]);
  }
}

export async function carryForwardPreviousVisit(db, visiteId, contexte) {
  // Le report automatique n'est déclenché que pour une nouvelle visite active.
  // Ouvrir une ancienne visite terminée/importée ne doit jamais la modifier à
  // partir d'une autre visite historique.
  if (clean(contexte?.statut) !== 'en_cours') {
    return { contexte, previousVisitId: null, copiedFields: 0, copiedControls: 0, copiedNetworks: 0, copiedMeters: 0, skippedHistoricalVisit: true };
  }

  const trame = obtenirTrame(contexte.trame_id || DEFAULT_TRAME_ID);
  if (trame.id === 'reseau_chaleur_v1') await bindLegacyExcelVisits(db, contexte.site_id, trame.id);
  const resolution = await inferUniqueInstallation(db, contexte, visiteId, trame.id);
  const resolved = resolution.contexte;
  if (!resolution.canCarry) {
    return { contexte: resolved, previousVisitId: null, copiedFields: 0, copiedControls: 0, copiedNetworks: 0, copiedMeters: 0, ambiguousLocal: true };
  }
  if (trame.id === 'reseau_chaleur_v1') await seedRcuLocalStructure(db, visiteId, resolved.installation_id);

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
  const porteReseaux = trame.id === DEFAULT_TRAME_ID || trame.id === 'reseau_chaleur_v1';
  const referenceOnly = false;
  const copiedNetworks = porteReseaux ? await copyNetworkValues(db, visiteId, previous.id, referenceOnly) : 0;
  const copiedMeters = porteReseaux ? await copyMeterValues(db, visiteId, previous.id, referenceOnly) : 0;

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
