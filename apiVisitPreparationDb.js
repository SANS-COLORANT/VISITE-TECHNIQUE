import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { getCachedLocalReference } from './symfonyApiCacheDb.js';

function normalize(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function text(v) { return v == null || v === '' ? null : String(v).trim() || null; }
function sourceId(v) { return v == null || v === '' ? null : String(v).trim() || null; }
function yearAsInteger(v) {
  const raw = text(v);
  if (!raw || !/^\d{4}$/.test(raw)) return null;
  const year = Number(raw);
  return year >= 1900 && year <= 2200 ? year : null;
}

export function mapRemoteTrameToLocal(remote) {
  const t = normalize(remote?.nom || '');
  if (!t) return null;
  if (t.includes('vmc') || t.includes('ventilation')) return 'vmc';
  if (t.includes('pre') && t.includes('allum')) return 'pre_allumage';
  if (t.includes('chauffer') || t.includes('sous-station') || t.includes('sous station') || t.includes('icpe')) return 'icpe_v1';
  return null;
}

async function upsertProvenance(db, entiteType, entiteId, referenceExterne, details) {
  const ref = sourceId(referenceExterne);
  const existing = await db.getFirstAsync(
    `SELECT id FROM provenances WHERE entite_type=? AND entite_id=? AND origine='api_symfony' AND COALESCE(reference_externe,'')=COALESCE(?,'') ORDER BY importe_le DESC LIMIT 1`,
    [entiteType, entiteId, ref]
  );
  if (existing?.id) {
    await db.runAsync(`UPDATE provenances SET details_json=?,importe_le=datetime('now') WHERE id=?`, [JSON.stringify(details ?? null), existing.id]);
    return existing.id;
  }
  const id = createId();
  await db.runAsync(
    `INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json) VALUES(?,?,?,?,?,?)`,
    [id, entiteType, entiteId, 'api_symfony', ref, JSON.stringify(details ?? null)]
  );
  return id;
}

async function upsertAttribute(db, entiteType, entiteId, key, value) {
  const v = text(value);
  if (v == null) return;
  await db.runAsync(
    `INSERT INTO attributs_libres(id,entite_type,entite_id,cle,valeur,type_valeur) VALUES(?,?,?,?,?,'texte')
     ON CONFLICT(entite_type,entite_id,cle) DO UPDATE SET valeur=excluded.valeur,modifie_le=datetime('now')`,
    [createId(), entiteType, entiteId, key, v]
  );
}

async function findMappedInstallation(db, siteId, remoteLocalId) {
  const mapped = await db.getFirstAsync(
    `SELECT i.id FROM api_local_links l JOIN installations i ON i.id=l.local_installation_id
     WHERE l.remote_local_id=? AND i.site_id=? AND i.actif=1 LIMIT 1`,
    [remoteLocalId, siteId]
  );
  if (mapped?.id) return mapped.id;

  const provenance = await db.getFirstAsync(
    `SELECT i.id FROM provenances p
     JOIN installations i ON i.id=p.entite_id
     WHERE p.entite_type='installation' AND p.origine='api_symfony' AND p.reference_externe=?
       AND i.site_id=? AND i.actif=1
     ORDER BY p.importe_le DESC LIMIT 1`,
    [remoteLocalId, siteId]
  );
  return provenance?.id || null;
}

async function ensureInstallationForRemoteLocal(db, siteId, remoteLocalId, ref) {
  let installationId = await findMappedInstallation(db, siteId, remoteLocalId);
  const designation = text(ref?.local?.designation) || 'Local technique';

  if (!installationId) {
    const sameName = await db.getAllAsync(
      `SELECT id FROM installations WHERE site_id=? AND actif=1 AND lower(trim(COALESCE(nom,'')))=lower(trim(?)) ORDER BY cree_le`,
      [siteId, designation]
    );
    if (sameName.length === 1) installationId = sameName[0].id;
  }

  if (!installationId) {
    installationId = createId();
    await db.runAsync(
      `INSERT INTO installations(id,site_id,type_code,nom,description,actif) VALUES(?,?,?,?,?,1)`,
      [installationId, siteId, 'installation_technique', designation, 'Local technique associé au patrimoine Intranet']
    );
  }

  await db.runAsync(`UPDATE api_local_links SET local_installation_id=? WHERE remote_local_id=?`, [installationId, remoteLocalId]);
  await upsertProvenance(db, 'installation', installationId, remoteLocalId, {
    sourceType: 'local',
    remoteLocalId,
    remoteSiteId: sourceId(ref?.site?.id),
    designation: text(ref?.local?.designation),
    remoteTrameId: sourceId(ref?.trame?.id),
    remoteTrameNom: text(ref?.trame?.nom),
  });
  return installationId;
}

async function findEquipmentByRemoteId(db, siteId, installationId, remoteMaterialId) {
  if (!remoteMaterialId) return null;
  const row = await db.getFirstAsync(
    `SELECT e.id,e.installation_id FROM provenances p
     JOIN equipements e ON e.id=p.entite_id
     JOIN installations i ON i.id=e.installation_id
     WHERE p.entite_type='equipement' AND p.origine='api_symfony' AND p.reference_externe=?
       AND i.site_id=? AND e.statut<>'retire'
     ORDER BY CASE WHEN e.installation_id=? THEN 0 ELSE 1 END,p.importe_le DESC LIMIT 1`,
    [remoteMaterialId, siteId, installationId]
  );
  return row || null;
}

async function findConservativeEquipmentMatch(db, installationId, material) {
  const number = text(material?.numeroMateriel);
  if (number) {
    const byNumber = await db.getAllAsync(
      `SELECT id FROM equipements WHERE installation_id=? AND statut<>'retire' AND lower(trim(COALESCE(numero_serie,'')))=lower(trim(?))`,
      [installationId, number]
    );
    if (byNumber.length === 1) return byNumber[0].id;
  }

  const designation = text(material?.designation);
  if (!designation) return null;
  const marque = text(material?.marque) || '';
  const modele = text(material?.modele) || '';
  const fingerprint = await db.getAllAsync(
    `SELECT id FROM equipements WHERE installation_id=? AND statut<>'retire'
       AND lower(trim(COALESCE(designation,'')))=lower(trim(?))
       AND lower(trim(COALESCE(marque,'')))=lower(trim(?))
       AND lower(trim(COALESCE(modele,'')))=lower(trim(?))`,
    [installationId, designation, marque, modele]
  );
  return fingerprint.length === 1 ? fingerprint[0].id : null;
}

async function ensureEquipmentFromCurrentListing(db, siteId, installationId, material) {
  const remoteMaterialId = sourceId(material?.id);
  const linked = await findEquipmentByRemoteId(db, siteId, installationId, remoteMaterialId);
  let equipmentId = linked?.id || null;
  const wasRemoteLinked = Boolean(equipmentId);

  if (equipmentId && linked.installation_id !== installationId) {
    await db.runAsync(`UPDATE equipements SET installation_id=?,modifie_le=datetime('now') WHERE id=?`, [installationId, equipmentId]);
  }

  if (!equipmentId) equipmentId = await findConservativeEquipmentMatch(db, installationId, material);

  if (!equipmentId) {
    equipmentId = createId();
    await db.runAsync(
      `INSERT INTO equipements(id,installation_id,type_code,designation,marque,modele,numero_serie,annee,statut)
       VALUES(?,?,?,?,?,?,?,?, 'actif')`,
      [equipmentId, installationId, text(material?.categorie) || 'equipement', text(material?.designation) || 'Équipement',
        text(material?.marque), text(material?.modele), text(material?.numeroMateriel), yearAsInteger(material?.annee)]
    );
  } else if (wasRemoteLinked) {
    await db.runAsync(
      `UPDATE equipements SET
         type_code=COALESCE(?,type_code),designation=COALESCE(?,designation),marque=COALESCE(?,marque),
         modele=COALESCE(?,modele),numero_serie=COALESCE(?,numero_serie),annee=COALESCE(?,annee),modifie_le=datetime('now')
       WHERE id=?`,
      [text(material?.categorie), text(material?.designation), text(material?.marque), text(material?.modele),
        text(material?.numeroMateriel), yearAsInteger(material?.annee), equipmentId]
    );
  }

  await upsertProvenance(db, 'equipement', equipmentId, remoteMaterialId, {
    sourceType: 'listing_materiel',
    remoteMaterialId,
    remoteLocalId: sourceId(material?.remoteLocalId),
    currentLocalListing: true,
    payload: material,
  });
  await upsertAttribute(db, 'equipement', equipmentId, 'api_symfony.annee_source', material?.annee);
  await upsertAttribute(db, 'equipement', equipmentId, 'api_symfony.nombre', material?.nombre);
  await upsertAttribute(db, 'equipement', equipmentId, 'api_symfony.reseau_desservi', material?.reseauDesservi);
  await upsertAttribute(db, 'equipement', equipmentId, 'api_symfony.caracteristiques', material?.caracteristiques);
  return equipmentId;
}

async function linkEquipmentToVisit(db, visiteId, equipmentId, material) {
  const existing = await db.getFirstAsync(`SELECT id FROM materiel WHERE visite_id=? AND equipement_id=?`, [visiteId, equipmentId]);
  if (existing?.id) return existing.id;
  const id = createId();
  await db.runAsync(
    `INSERT INTO materiel(id,visite_id,categorie,nombre,designation,numero_materiel,reseau_desservi,marque,modele,caracteristiques,annee,etat,equipement_id)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, visiteId, text(material?.categorie), text(material?.nombre), text(material?.designation), text(material?.numeroMateriel),
      text(material?.reseauDesservi), text(material?.marque), text(material?.modele), text(material?.caracteristiques),
      text(material?.annee), text(material?.etat), equipmentId]
  );
  return id;
}

function buildReferenceDetails(ref, remoteLocalId) {
  return {
    schemaVersion: 2,
    sourceType: 'preparation_visite',
    remoteLocalId,
    local: ref?.local || null,
    site: ref?.site || null,
    derniereVisite: ref?.derniereVisite || null,
    trame: ref?.trame || null,
    remarquesDerniereVisite: Array.isArray(ref?.remarques) ? ref.remarques : [],
    notes: Array.isArray(ref?.notes) ? ref.notes : [],
    preparationMeta: ref?.preparationMeta || null,
    semantics: {
      criteriaAreHistoricalReferenceOnly: true,
      remarksBelongToLatestRemoteVisitOnly: true,
      materialsAreCurrentLocalPatrimoine: true,
      previousCriteriaMustNotSeedCurrentVisit: true,
      previousRemarksMustNotSeedCurrentVisit: true,
    },
    unavailableHistory: {
      photographies: true,
      notes: true,
      conclusion: true,
    },
  };
}

export async function importApiReferenceForVisit(visiteId, remoteLocalId) {
  const remoteId = sourceId(remoteLocalId);
  if (!remoteId) return null;
  const ref = await getCachedLocalReference(remoteId);
  if (!ref) return null;

  const db = await getDb();
  const visit = await db.getFirstAsync(`SELECT id,site_id,trame_id FROM visites WHERE id=?`, [visiteId]);
  if (!visit) return null;

  let result = null;
  await db.withTransactionAsync(async () => {
    const installationId = await ensureInstallationForRemoteLocal(db, visit.site_id, remoteId, ref);
    await db.runAsync(`UPDATE visites SET installation_id=?,api_remote_local_id=?,modifie_le=datetime('now') WHERE id=?`, [installationId, remoteId, visiteId]);
    let importedMaterials = 0;

    for (const sourceMaterial of Array.isArray(ref?.materiels) ? ref.materiels : []) {
      const material = { ...sourceMaterial, remoteLocalId: remoteId };
      const equipmentId = await ensureEquipmentFromCurrentListing(db, visit.site_id, installationId, material);
      await db.runAsync(
        `INSERT INTO equipement_trames(equipement_id,trame_id,actif) VALUES(?,?,1)
         ON CONFLICT(equipement_id,trame_id) DO UPDATE SET actif=1,modifie_le=datetime('now')`,
        [equipmentId, visit.trame_id]
      );
      await linkEquipmentToVisit(db, visiteId, equipmentId, material);
      importedMaterials += 1;
    }

    // Critères et remarques de l'API sont uniquement des références historiques.
    // Ils ne sont jamais écrits dans controles, mesures, champs_visite ou remarques de la visite du jour.
    await upsertProvenance(db, 'visite', visiteId, remoteId, buildReferenceDetails(ref, remoteId));

    result = {
      installationId,
      importedMaterials,
      remoteLocalId: remoteId,
      suggestedTrameId: mapRemoteTrameToLocal(ref?.trame),
      latestRemoteVisitId: sourceId(ref?.derniereVisite?.id),
    };
  });

  return result;
}
