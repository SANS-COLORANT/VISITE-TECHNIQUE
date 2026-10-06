import { createId } from './database/ids.js';
import { DEFAULT_TRAME_ID, obtenirTrame } from './trameRegistry.js';
import { construireIndexSemantiqueTrame } from './trameSemanticMesh.js';

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

async function collectSemanticSnapshot(db, sourceVisits) {
  const latest = new Map();
  for (const visit of sourceVisits) {
    let sourceTrame;
    try { sourceTrame = obtenirTrame(visit.trame_id || DEFAULT_TRAME_ID); } catch { continue; }
    const sourceIndex = construireIndexSemantiqueTrame(sourceTrame);

    const fields = await db.getAllAsync(
      `SELECT section_code,cle,valeur FROM champs_visite
       WHERE visite_id=? AND valeur IS NOT NULL AND trim(valeur)<>''`,
      [visit.id]
    );
    for (const row of fields || []) {
      const semantic = sourceIndex.byStorage.get(`${row.section_code}||${row.cle}`)?.semanticKey;
      if (!semantic) continue;
      const item = latest.get(semantic) || {};
      if (!item.textValue) {
        item.textValue = clean(row.valeur) || null;
        item.textSourceVisitId = visit.id;
        item.textSourceTrameId = visit.trame_id;
      }
      latest.set(semantic, item);
    }

    const controls = await db.getAllAsync(
      `SELECT section_code,cle,avis,commentaire FROM controles_visite
       WHERE visite_id=? AND (avis IS NOT NULL OR commentaire IS NOT NULL)`,
      [visit.id]
    );
    for (const row of controls || []) {
      const semantic = sourceIndex.byStorage.get(`${row.section_code}||${row.cle}`)?.semanticKey;
      if (!semantic) continue;
      const item = latest.get(semantic) || {};
      const avis = clean(row.avis) || null;
      const commentaire = clean(row.commentaire) || null;
      if (!item.avis && avis) {
        item.avis = avis;
        item.controlSourceVisitId = visit.id;
        item.controlSourceTrameId = visit.trame_id;
      }
      if (!item.commentaire && commentaire) {
        item.commentaire = commentaire;
        item.commentSourceVisitId = visit.id;
        item.commentSourceTrameId = visit.trame_id;
      }
      // Les mesures historiques ICPE/RCU sont souvent stockées dans le
      // commentaire d'un contrôle. Elles peuvent alimenter un champ équivalent
      // dans une autre trame.
      if (!item.textValue && commentaire) {
        item.textValue = commentaire;
        item.textSourceVisitId = visit.id;
        item.textSourceTrameId = visit.trame_id;
      }
      latest.set(semantic, item);
    }
  }
  return latest;
}

async function copyReusableFields(db, visiteId, semanticSnapshot, trame) {
  const targetIndex = construireIndexSemantiqueTrame(trame);
  let copied = 0;
  for (const targets of targetIndex.bySemantic.values()) {
    for (const target of targets) {
      if (target.type !== 'champ' || !canCarryField(trame, target.field)) continue;
      const source = semanticSnapshot.get(target.semanticKey);
      if (!source || !clean(source.textValue)) continue;
      const result = await db.runAsync(
        `INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)
         ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur
         WHERE champs_visite.valeur IS NULL OR trim(champs_visite.valeur)=''`,
        [visiteId, target.sectionCode, target.field.cle, String(source.textValue)]
      );
      if (Number(result?.changes || 0) > 0) copied += 1;
    }
  }
  return copied;
}

async function copyReusableControls(db, visiteId, semanticSnapshot, trame) {
  // Les essais de Pré-allumage doivent être refaits à chaque visite : leur
  // historique reste maillé et consultable, mais n'est pas validé à la place
  // du technicien.
  if (trame.id === 'pre_allumage') return 0;

  const targetIndex = construireIndexSemantiqueTrame(trame);
  let copied = 0;
  for (const targets of targetIndex.bySemantic.values()) {
    for (const target of targets) {
      if (target.type !== 'controle') continue;
      const source = semanticSnapshot.get(target.semanticKey);
      if (!source) continue;
      const avis = clean(source.avis) || null;
      // Si la donnée vient d'un champ d'une autre trame, elle est proposée en
      // commentaire/référence mais aucun avis S/N.S n'est inventé.
      const commentaire = clean(source.commentaire) || clean(source.textValue) || null;
      if (!avis && !commentaire) continue;
      const result = await db.runAsync(
        `INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire)
         VALUES(?,?,?,?,?)
         ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET
           avis=excluded.avis,
           commentaire=excluded.commentaire
         WHERE (controles_visite.avis IS NULL OR trim(controles_visite.avis)='')
           AND (controles_visite.commentaire IS NULL OR trim(controles_visite.commentaire)='')`,
        [visiteId, target.sectionCode, target.field.cle, avis, commentaire]
      );
      if (Number(result?.changes || 0) > 0) copied += 1;
    }
  }
  return copied;
}

async function copyUnresolvedReserves(db, visiteId, sourceVisits) {
  const seen = new Set();
  let copied = 0;

  for (const visit of sourceVisits) {
    const rows = await db.getAllAsync(
      `SELECT r.*,v.date_visite AS date_source,v.trame_id AS trame_source
       FROM remarques r JOIN visites v ON v.id=r.visite_id
       WHERE r.visite_id=?
       ORDER BY r.criticite DESC,r.cree_le,r.id`,
      [visit.id]
    );

    for (const row of rows || []) {
      const lineageId = row.reference_type === 'reserve_historique' && clean(row.reference_id)
        ? clean(row.reference_id)
        : row.id;
      if (seen.has(lineageId)) continue;
      seen.add(lineageId);

      // La dernière occurrence de la lignée fait foi. Une réserve déjà levée ou
      // annulée dans une trame ultérieure ne doit pas ressusciter.
      if (['Terminé', 'Annulé'].includes(clean(row.intranet_etat_avancement))) continue;

      const existing = await db.getFirstAsync(
        `SELECT id FROM remarques
         WHERE visite_id=? AND reference_type='reserve_historique' AND reference_id=?
         LIMIT 1`,
        [visiteId, lineageId]
      );
      if (existing?.id) continue;

      const id = createId();
      const origineSource = clean(row.origine);
      const origine = origineSource
        ? `Reprise historique · ${origineSource}`
        : 'Reprise historique';
      await db.runAsync(
        `INSERT INTO remarques(
           id,visite_id,controle_key,poste,prestation,delai,estimatif,origine,
           reference_onglet,reference_type,reference_id,reference_libelle,
           criticite,criticite_defaut,criticite_modifiee,
           intranet_date_reserve,intranet_delai,intranet_etat_avancement,perimetre
         ) VALUES(?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id, visiteId,
          row.poste ?? null, row.prestation ?? null, row.delai ?? null, row.estimatif ?? null, origine,
          null, 'reserve_historique', lineageId,
          row.reference_libelle || row.poste || 'Réserve reprise',
          row.criticite ?? 2, row.criticite_defaut ?? row.criticite ?? 2, row.criticite_modifiee ?? 0,
          row.intranet_date_reserve || row.date_source || null,
          row.intranet_delai ?? null, row.intranet_etat_avancement ?? null, row.perimetre ?? null,
        ]
      );
      copied += 1;
    }
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
     WHERE site_id=? AND id<>? AND installation_id IS NOT NULL
     ORDER BY COALESCE(date_visite,'') DESC,modifie_le DESC`,
    [contexte.site_id, visiteId]
  );
  const installationIds = [...new Set((history || []).map((row) => clean(row.installation_id)).filter(Boolean))];

  if (installationIds.length > 1) {
    // Plusieurs locaux existent dans l'historique du site, toutes trames
    // confondues : il faut un choix explicite de local, sinon aucune donnée
    // locale ne peut être maillée sans risque.
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

async function listPriorLocalVisits(db, visiteId, contexte) {
  if (contexte.installation_id) {
    return db.getAllAsync(
      `SELECT id,trame_id,date_visite,modifie_le FROM visites
       WHERE id<>? AND installation_id=?
       ORDER BY COALESCE(date_visite,'') DESC,modifie_le DESC,rowid DESC`,
      [visiteId, contexte.installation_id]
    );
  }
  return db.getAllAsync(
    `SELECT id,trame_id,date_visite,modifie_le FROM visites
     WHERE id<>? AND site_id=? AND installation_id IS NULL
     ORDER BY COALESCE(date_visite,'') DESC,modifie_le DESC,rowid DESC`,
    [visiteId, contexte.site_id]
  );
}

async function latestVisitWithRows(db, sourceVisits, table) {
  const allowed = new Set(['reseaux', 'compteurs']);
  if (!allowed.has(table)) return null;
  for (const visit of sourceVisits) {
    const row = await db.getFirstAsync(`SELECT 1 AS ok FROM ${table} WHERE visite_id=? LIMIT 1`, [visit.id]);
    if (row?.ok) return visit;
  }
  return null;
}

export async function carryForwardPreviousVisit(db, visiteId, contexte) {
  // Le report automatique n'est déclenché que pour une nouvelle visite active.
  // Ouvrir une ancienne visite terminée/importée ne doit jamais la modifier à
  // partir d'une autre visite historique.
  if (clean(contexte?.statut) !== 'en_cours') {
    return { contexte, previousVisitId: null, copiedFields: 0, copiedControls: 0, copiedReserves: 0, copiedNetworks: 0, copiedMeters: 0, skippedHistoricalVisit: true };
  }

  const trame = obtenirTrame(contexte.trame_id || DEFAULT_TRAME_ID);
  if (trame.id === 'reseau_chaleur_v1') await bindLegacyExcelVisits(db, contexte.site_id, trame.id);
  const resolution = await inferUniqueInstallation(db, contexte, visiteId, trame.id);
  const resolved = resolution.contexte;
  if (!resolution.canCarry) {
    return { contexte: resolved, previousVisitId: null, copiedFields: 0, copiedControls: 0, copiedReserves: 0, copiedNetworks: 0, copiedMeters: 0, ambiguousLocal: true };
  }
  if (trame.id === 'reseau_chaleur_v1') await seedRcuLocalStructure(db, visiteId, resolved.installation_id);

  const sourceVisits = await listPriorLocalVisits(db, visiteId, resolved);
  const previous = sourceVisits[0] || null;
  if (!previous?.id) return { contexte: resolved, previousVisitId: null, copiedFields: 0, copiedControls: 0, copiedReserves: 0, copiedNetworks: 0, copiedMeters: 0 };

  const semanticSnapshot = await collectSemanticSnapshot(db, sourceVisits);
  const copiedFields = await copyReusableFields(db, visiteId, semanticSnapshot, trame);
  const copiedControls = await copyReusableControls(db, visiteId, semanticSnapshot, trame);
  const copiedReserves = await copyUnresolvedReserves(db, visiteId, sourceVisits);
  const porteReseaux = trame.id === DEFAULT_TRAME_ID || trame.id === 'reseau_chaleur_v1';
  const referenceOnly = false;
  const networkSource = porteReseaux ? await latestVisitWithRows(db, sourceVisits, 'reseaux') : null;
  const meterSource = porteReseaux ? await latestVisitWithRows(db, sourceVisits, 'compteurs') : null;
  const copiedNetworks = networkSource ? await copyNetworkValues(db, visiteId, networkSource.id, referenceOnly) : 0;
  const copiedMeters = meterSource ? await copyMeterValues(db, visiteId, meterSource.id, referenceOnly) : 0;

  return {
    contexte: resolved,
    previousVisitId: previous.id,
    copiedFields,
    copiedControls,
    copiedReserves,
    copiedNetworks,
    copiedMeters,
    ambiguousLocal: false,
  };
}
