import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { getCachedLocalReference, listCachedLocals } from './symfonyApiCacheDb.js';
import { mapRemoteTrameToLocal } from './apiVisitPreparationDb.js';
import { DEFAULT_TRAME_ID, obtenirTrame } from './trameRegistry.js';
import { enrichLatestImportedVisitFields } from './apiLatestVisitFieldEnrichmentDb.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function text(value) { const v = clean(value); return v || null; }
function meaningfulRemoteValue(value) {
  const v = clean(value);
  return !v || v === '/' ? null : v;
}
function normalize(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function remoteId(value) { const v = clean(value); return v || null; }
function criterionSourceRelation(criterion, latestVisitId) {
  const sourceId = remoteId(criterion?.visiteSourceId);
  if (!sourceId) return 'without_source';
  return sourceId === remoteId(latestVisitId) ? 'latest_visit' : 'earlier_visit';
}

const CONTEXT_STOP_WORDS = new Set([
  'a', 'au', 'aux', 'de', 'des', 'du', 'd', 'et', 'la', 'le', 'les', 'l',
  'conf', 'conformite', 'conformites', 'relatif', 'relative', 'relatifs', 'relatives',
]);

function contextTokens(value) {
  return normalize(value).split(' ').filter((token) => token && !CONTEXT_STOP_WORDS.has(token));
}

function contextOverlap(left, right) {
  const a = new Set(contextTokens(left));
  const b = new Set(contextTokens(right));
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  return common;
}

function sanitizeRemoteReference(ref) {
  if (!ref || typeof ref !== 'object') return ref;
  const trame = ref.trame && typeof ref.trame === 'object' ? {
    ...ref.trame,
    categories: (Array.isArray(ref.trame.categories) ? ref.trame.categories : []).map((category) => ({
      ...category,
      sousCategories: (Array.isArray(category?.sousCategories) ? category.sousCategories : []).map((subCategory) => ({
        ...subCategory,
        criteres: (Array.isArray(subCategory?.criteres) ? subCategory.criteres : []).map((criterion) => ({
          ...criterion,
          avis: meaningfulRemoteValue(criterion?.avis),
          commentaire: meaningfulRemoteValue(criterion?.commentaire),
        })),
      })),
    })),
  } : ref.trame;
  return { ...ref, trame };
}

async function upsertProvenance(db, entiteType, entiteId, referenceExterne, details) {
  const ref = remoteId(referenceExterne);
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

async function ensureInstallation(db, siteId, remoteLocalId, ref) {
  const localLink = await db.getFirstAsync(
    `SELECT local_installation_id FROM api_local_links WHERE remote_local_id=? LIMIT 1`,
    [remoteLocalId]
  );
  if (localLink?.local_installation_id) {
    const linked = await db.getFirstAsync(`SELECT id FROM installations WHERE id=? AND site_id=? AND actif=1`, [localLink.local_installation_id, siteId]);
    if (linked?.id) return linked.id;
  }

  const byProvenance = await db.getFirstAsync(
    `SELECT i.id FROM provenances p JOIN installations i ON i.id=p.entite_id
     WHERE p.entite_type='installation' AND p.origine='api_symfony' AND p.reference_externe=?
       AND i.site_id=? AND i.actif=1 ORDER BY p.importe_le DESC LIMIT 1`,
    [remoteLocalId, siteId]
  );
  let installationId = byProvenance?.id || null;
  const designation = text(ref?.local?.designation) || 'Local technique';
  // Le libellé du local n'est jamais utilisé comme identité. Deux locaux
  // Intranet homonymes conservent deux installations METRA distinctes.

  if (!installationId) {
    installationId = createId();
    await db.runAsync(
      `INSERT INTO installations(id,site_id,type_code,nom,description,actif) VALUES(?,?,?,?,?,1)`,
      [installationId, siteId, 'installation_technique', designation, 'Local technique importé depuis l’Intranet']
    );
  }

  await db.runAsync(`UPDATE api_local_links SET local_installation_id=? WHERE remote_local_id=?`, [installationId, remoteLocalId]);
  await upsertProvenance(db, 'installation', installationId, remoteLocalId, {
    sourceType: 'local', remoteLocalId, remoteSiteId: remoteId(ref?.site?.id), designation,
  });
  return installationId;
}

function localControlCandidates(trameId) {
  const definition = obtenirTrame(trameId || DEFAULT_TRAME_ID);
  const candidates = [];
  for (const [panelId, sections] of Object.entries(definition?.ui?.panels || {})) {
    for (const [section, fields] of Object.entries(sections || {})) {
      const sectionCode = panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
      for (const field of fields || []) {
        if (field?.type !== 'controle' || !field?.cle) continue;
        candidates.push({
          panelId,
          section,
          sectionCode,
          cle: field.cle,
          key: normalize(field.cle),
          sectionKey: normalize(section),
          panelKey: normalize(definition?.ui?.labels?.[panelId] || panelId),
          panelIdKey: normalize(panelId),
        });
      }
    }
  }
  return candidates;
}

function contextScore(candidate, categoryName, subCategoryName) {
  const categoryKey = normalize(categoryName);
  const subCategoryKey = normalize(subCategoryName);
  let score = 0;

  if (candidate.sectionKey && candidate.sectionKey === subCategoryKey) score += 100;
  else score += contextOverlap(candidate.sectionKey, subCategoryKey) * 18;

  if (candidate.panelKey && candidate.panelKey === categoryKey) score += 45;
  else score += contextOverlap(candidate.panelKey, categoryKey) * 14;

  // Le panelId contient les familles métier stables (conf-local, conf-energie,
  // conf-chauffage, conf-ecs...). Cela départage les mêmes libellés réutilisés
  // dans plusieurs branches de la trame Intranet.
  score += contextOverlap(candidate.panelIdKey, categoryKey) * 12;
  return score;
}

function findControlCandidate(candidates, criterionName, categoryName, subCategoryName) {
  const key = normalize(criterionName);
  if (!key) return null;
  const exact = candidates.filter((candidate) => candidate.key === key);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const scored = exact
      .map((candidate) => ({ candidate, score: contextScore(candidate, categoryName, subCategoryName) }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    const second = scored[1];
    if (best?.score > (second?.score ?? -1)) return best.candidate;
  }
  return null;
}

function isTechnicalControlTarget(trameId, target) {
  // Dans l'ICPE, pH et températures sont des contrôles avec avis mais leur
  // mesure elle-même est stockée dans commentaire côté Symfony.
  return trameId === DEFAULT_TRAME_ID && target?.panelId === 'p-releves';
}

function remoteCriterionReference(category, subCategory, criterion) {
  return criterion?.referencePath || [remoteId(category?.id), remoteId(subCategory?.id), remoteId(criterion?.id)].map((v) => v || '?').join(':');
}

function latestVisitStatus(sourceStatus) {
  const status = normalize(sourceStatus);
  if (status.includes('complet')) return 'a_completer';
  return 'terminee';
}

function materialFallbackReference(remoteLocalId, material, index) {
  const fingerprint = [
    material?.categorie,
    material?.designation,
    material?.numeroMateriel,
    material?.marque,
    material?.modele,
  ].map(normalize).filter(Boolean).join('|');
  return `local:${remoteLocalId}:material:${fingerprint || index}`;
}

function materialYear(value) {
  const raw = clean(value);
  if (!raw) return null;
  const match = raw.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

async function upsertEquipmentAttribute(db, equipmentId, key, value) {
  const normalizedValue = value == null ? null : String(value);
  const existing = await db.getFirstAsync(
    `SELECT id FROM attributs_libres WHERE entite_type='equipement' AND entite_id=? AND cle=? LIMIT 1`,
    [equipmentId, key]
  );
  if (existing?.id) {
    await db.runAsync(
      `UPDATE attributs_libres SET valeur=?,modifie_le=datetime('now') WHERE id=?`,
      [normalizedValue, existing.id]
    );
    return;
  }
  await db.runAsync(
    `INSERT INTO attributs_libres(id,entite_type,entite_id,cle,valeur) VALUES(?,'equipement',?,?,?)`,
    [createId(), equipmentId, key, normalizedValue]
  );
}

async function importCurrentMaterialsForLocal(db, { ref, remoteLocalId, installationId, visiteId, trameId }) {
  const materials = Array.isArray(ref?.materiels) ? ref.materiels : [];
  if (!materials.length) return { sourceMaterials: 0, importedMaterials: 0, matchedCatalogBrands: 0 };

  const brandRows = await db.getAllAsync(
    `SELECT id,nom,logo_uri FROM marques_equipement WHERE actif=1 ORDER BY nom`
  );
  const brandsByKey = new Map(brandRows.map((row) => [normalize(row.nom), row]));
  let importedMaterials = 0;
  let matchedCatalogBrands = 0;

  for (let index = 0; index < materials.length; index += 1) {
    const material = materials[index] || {};
    const explicitRemoteId = remoteId(material.id);
    const externalReference = explicitRemoteId || materialFallbackReference(remoteLocalId, material, index);
    const catalogBrand = brandsByKey.get(normalize(material.marque)) || null;
    const brand = text(catalogBrand?.nom) || text(material.marque);
    if (catalogBrand) matchedCatalogBrands += 1;

    const typeCode = text(material.categorie) || 'Équipement';
    const designation = text(material.designation)
      || [brand, text(material.modele)].filter(Boolean).join(' ')
      || typeCode;
    const model = text(material.modele);
    const year = materialYear(material.annee);

    const linked = await db.getFirstAsync(
      `SELECT e.id FROM provenances p
       JOIN equipements e ON e.id=p.entite_id
       WHERE p.entite_type='equipement' AND p.origine='api_symfony'
         AND p.reference_externe=? AND e.installation_id=?
       ORDER BY p.importe_le DESC LIMIT 1`,
      [externalReference, installationId]
    );

    let equipmentId = linked?.id || null;
    if (!equipmentId && !explicitRemoteId) {
      const existing = await db.getFirstAsync(
        `SELECT id FROM equipements
         WHERE installation_id=? AND statut='actif'
           AND lower(trim(COALESCE(designation,'')))=lower(trim(?))
           AND lower(trim(COALESCE(marque,'')))=lower(trim(COALESCE(?,'')))
           AND lower(trim(COALESCE(modele,'')))=lower(trim(COALESCE(?,'')))
         ORDER BY cree_le LIMIT 1`,
        [installationId, designation, brand, model]
      );
      equipmentId = existing?.id || null;
    }

    if (equipmentId) {
      await db.runAsync(
        `UPDATE equipements
         SET installation_id=?,type_code=?,designation=?,marque=?,modele=?,annee=?,statut='actif',modifie_le=datetime('now')
         WHERE id=?`,
        [installationId, typeCode, designation, brand, model, year, equipmentId]
      );
    } else {
      equipmentId = createId();
      await db.runAsync(
        `INSERT INTO equipements(id,installation_id,type_code,designation,marque,modele,annee,statut)
         VALUES(?,?,?,?,?,?,?,'actif')`,
        [equipmentId, installationId, typeCode, designation, brand, model, year]
      );
    }

    await Promise.all([
      upsertEquipmentAttribute(db, equipmentId, 'api_symfony.nombre', text(material.nombre)),
      upsertEquipmentAttribute(db, equipmentId, 'api_symfony.numero_materiel', text(material.numeroMateriel)),
      upsertEquipmentAttribute(db, equipmentId, 'api_symfony.reseau_desservi', text(material.reseauDesservi)),
      upsertEquipmentAttribute(db, equipmentId, 'api_symfony.caracteristiques', text(material.caracteristiques)),
      upsertEquipmentAttribute(db, equipmentId, 'api_symfony.etat', text(material.etat)),
      upsertEquipmentAttribute(db, equipmentId, 'api_symfony.remote_local_id', remoteLocalId),
      upsertEquipmentAttribute(db, equipmentId, 'catalogue.marque_id', catalogBrand?.id || null),
      upsertEquipmentAttribute(db, equipmentId, 'catalogue.marque_logo_uri', catalogBrand?.logo_uri || null),
    ]);

    if (trameId) {
      await db.runAsync(
        `INSERT INTO equipement_trames(equipement_id,trame_id,actif) VALUES(?,?,1)
         ON CONFLICT(equipement_id,trame_id) DO UPDATE SET actif=1,modifie_le=datetime('now')`,
        [equipmentId, trameId]
      );
    }

    await upsertProvenance(db, 'equipement', equipmentId, externalReference, {
      schemaVersion: 1,
      sourceType: 'current_remote_local_patrimoine',
      remoteMaterialId: explicitRemoteId,
      remoteLocalId,
      remoteVisitId: remoteId(ref?.derniereVisite?.id),
      canonicalBrand: brand,
      catalogBrandId: catalogBrand?.id || null,
      payload: material,
    });

    // Le patrimoine Intranet est courant, pas un constat historique de la
    // dernière visite. Une ligne matériel n'est créée que si une visite de
    // référence existe ; l'équipement permanent, lui, est importé même sans
    // historique de visite.
    if (visiteId) {
      const materialRow = await db.getFirstAsync(
        `SELECT id FROM materiel WHERE visite_id=? AND equipement_id=? LIMIT 1`,
        [visiteId, equipmentId]
      );
      const quantity = text(material.nombre) || '1';
      if (materialRow?.id) {
        await db.runAsync(
          `UPDATE materiel SET categorie=?,nombre=?,designation=?,numero_materiel=?,reseau_desservi=?,marque=?,modele=?,caracteristiques=?,annee=?,etat=NULL
           WHERE id=?`,
          [
            typeCode, quantity, designation, text(material.numeroMateriel), text(material.reseauDesservi),
            brand, model, text(material.caracteristiques), text(material.annee), materialRow.id,
          ]
        );
      } else {
        await db.runAsync(
          `INSERT INTO materiel(id,visite_id,categorie,nombre,designation,numero_materiel,reseau_desservi,marque,modele,caracteristiques,annee,etat,equipement_id)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL,?)`,
          [
            createId(), visiteId, typeCode, quantity, designation, text(material.numeroMateriel),
            text(material.reseauDesservi), brand, model, text(material.caracteristiques),
            text(material.annee), equipmentId,
          ]
        );
      }
    }

    importedMaterials += 1;
  }

  return {
    sourceMaterials: materials.length,
    importedMaterials,
    matchedCatalogBrands,
  };
}

async function findImportedVisit(db, remoteVisitId) {
  return db.getFirstAsync(
    `SELECT v.id FROM provenances p JOIN visites v ON v.id=p.entite_id
     WHERE p.entite_type='visite' AND p.origine='api_symfony' AND p.reference_externe=?
     ORDER BY p.importe_le DESC LIMIT 1`,
    [remoteVisitId]
  );
}

async function importLatestVisitForLocal(db, siteId, remoteLocalId, sourceRef) {
  const ref = sanitizeRemoteReference(sourceRef);
  const installationId = await ensureInstallation(db, siteId, remoteLocalId, ref);
  const trameId = mapRemoteTrameToLocal(ref?.trame) || DEFAULT_TRAME_ID;
  const latest = ref?.derniereVisite;
  const remoteVisitId = remoteId(latest?.id);
  if (!remoteVisitId) {
    const materialImport = await importCurrentMaterialsForLocal(db, {
      ref, remoteLocalId, installationId, visiteId: null, trameId,
    });
    return { imported: false, reason: 'no_latest_visit', installationId, ...materialImport };
  }
  const visitDate = text(latest?.date)?.slice(0, 10) || null;
  const status = latestVisitStatus(latest?.statut);
  const existing = await findImportedVisit(db, remoteVisitId);
  const visiteId = existing?.id || createId();

  if (existing?.id) {
    await db.runAsync(
      `UPDATE visites SET site_id=?,date_visite=?,statut=?,progression_pct=100,trame_id=?,installation_id=?,api_remote_local_id=?,modifie_le=datetime('now') WHERE id=?`,
      [siteId, visitDate, status, trameId, installationId, remoteLocalId, visiteId]
    );
  } else {
    await db.runAsync(
      `INSERT INTO visites(id,site_id,date_visite,technicien,statut,progression_pct,mode_visite,trame_id,installation_id,api_remote_local_id)
       VALUES(?,?,?,?,?,100,'complete',?,?,?)`,
      [visiteId, siteId, visitDate, null, status, trameId, installationId, remoteLocalId]
    );
  }

  await db.runAsync(`INSERT OR IGNORE INTO notes(visite_id,contenu) VALUES(?, '')`, [visiteId]);

  const candidates = localControlCandidates(trameId);
  let mappedCriteria = 0;
  let sourceCriteria = 0;
  let sourceControlCriteria = 0;
  let unmappedControlCriteria = 0;
  let technicalCommentsPreserved = 0;
  let hiddenHistoricalControlComments = 0;
  let criteriaFromLatestVisit = 0;
  let criteriaFromEarlierVisits = 0;
  let criteriaWithoutSourceVisit = 0;
  const unmappedControlSample = [];

  for (const category of Array.isArray(ref?.trame?.categories) ? ref.trame.categories : []) {
    for (const subCategory of Array.isArray(category?.sousCategories) ? category.sousCategories : []) {
      for (const criterion of Array.isArray(subCategory?.criteres) ? subCategory.criteres : []) {
        // La route de préparation renvoie déjà, pour chaque critère, sa dernière
        // valeur connue. visiteSourceId est uniquement la provenance de cette
        // valeur et peut donc être antérieur à derniereVisite.id.
        if (criterion?.avis == null && criterion?.commentaire == null) continue;
        sourceCriteria += 1;
        const sourceRelation = criterionSourceRelation(criterion, remoteVisitId);
        if (sourceRelation === 'latest_visit') criteriaFromLatestVisit += 1;
        else if (sourceRelation === 'earlier_visit') criteriaFromEarlierVisits += 1;
        else criteriaWithoutSourceVisit += 1;

        const avis = meaningfulRemoteValue(criterion?.avis);
        if (!avis) continue;
        sourceControlCriteria += 1;

        const target = findControlCandidate(candidates, criterion?.nom, category?.nom, subCategory?.nom);
        if (!target) {
          unmappedControlCriteria += 1;
          if (unmappedControlSample.length < 25) {
            unmappedControlSample.push({
              referencePath: remoteCriterionReference(category, subCategory, criterion),
              category: text(category?.nom),
              subCategory: text(subCategory?.nom),
              criterion: text(criterion?.nom),
              avis,
            });
          }
          continue;
        }

        const rawComment = meaningfulRemoteValue(criterion?.commentaire);
        const preserveTechnicalComment = isTechnicalControlTarget(trameId, target);
        const commentaire = preserveTechnicalComment ? rawComment : null;
        if (preserveTechnicalComment && rawComment) technicalCommentsPreserved += 1;
        if (!preserveTechnicalComment && rawComment) hiddenHistoricalControlComments += 1;

        await db.runAsync(
          `INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES(?,?,?,?,?)
           ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET avis=excluded.avis,commentaire=excluded.commentaire`,
          [visiteId, target.sectionCode, target.cle, avis, commentaire]
        );
        mappedCriteria += 1;
      }
    }
  }

  const fieldImport = await enrichLatestImportedVisitFields({
    db, visiteId, siteId, remoteVisitId, trameId, ref,
  });
  const materialImport = await importCurrentMaterialsForLocal(db, {
    ref, remoteLocalId, installationId, visiteId, trameId,
  });

  let importedRemarks = 0;
  const remarks = Array.isArray(ref?.remarques) ? ref.remarques : [];
  for (let index = 0; index < remarks.length; index += 1) {
    const remark = remarks[index] || {};
    const remoteRemarkId = remoteId(remark.id) || `${remoteVisitId}:remark:${index}`;
    const linked = await db.getFirstAsync(
      `SELECT r.id FROM provenances p JOIN remarques r ON r.id=p.entite_id
       WHERE p.entite_type='remarque' AND p.origine='api_symfony' AND p.reference_externe=?
       ORDER BY p.importe_le DESC LIMIT 1`,
      [remoteRemarkId]
    );
    const remarqueId = linked?.id || createId();
    if (linked?.id) {
      await db.runAsync(
        `UPDATE remarques SET visite_id=?,poste=?,prestation=?,delai=?,estimatif=?,origine='Intranet',controle_key=NULL,reference_type='api_symfony',reference_id=?,reference_libelle=? WHERE id=?`,
        [visiteId, text(remark.poste) || 'Observation', text(remark.prestation) || '', text(remark.delai), remark.estimatif ?? null, remoteRemarkId, text(remark.poste) || 'Réserve Intranet', remarqueId]
      );
    } else {
      await db.runAsync(
        `INSERT INTO remarques(id,visite_id,controle_key,poste,prestation,delai,estimatif,origine,reference_type,reference_id,reference_libelle)
         VALUES(?,?,NULL,?,?,?,?, 'Intranet','api_symfony',?,?)`,
        [remarqueId, visiteId, text(remark.poste) || 'Observation', text(remark.prestation) || '', text(remark.delai), remark.estimatif ?? null, remoteRemarkId, text(remark.poste) || 'Réserve Intranet']
      );
    }
    await upsertProvenance(db, 'remarque', remarqueId, remoteRemarkId, {
      sourceType: 'latest_remote_visit_remark',
      remoteVisitId,
      summaryOnly: true,
      linkedToControl: false,
      payload: remark,
    });
    importedRemarks += 1;
  }

  await upsertProvenance(db, 'visite', visiteId, remoteVisitId, {
    schemaVersion: 4,
    sourceType: 'imported_latest_visit',
    remoteVisitId,
    remoteLocalId,
    remoteSiteId: remoteId(ref?.site?.id),
    remoteStatus: text(latest?.statut),
    remoteDate: text(latest?.date),
    trame: ref?.trame || null,
    remarques: remarks,
    notes: Array.isArray(ref?.notes) ? ref.notes : [],
    importSummary: {
      sourceCriteria,
      sourceControlCriteria,
      mappedCriteria,
      unmappedControlCriteria,
      unmappedControlSample,
      technicalCommentsPreserved,
      hiddenHistoricalControlComments,
      criteriaFromLatestVisit,
      criteriaFromEarlierVisits,
      criteriaWithoutSourceVisit,
      fieldImport,
      materialImport,
      importedRemarks,
      criteriaRule: 'preparation_values_are_latest_known_visiteSourceId_is_provenance_only',
      controlIdentityRule: 'remote_branch_is_category_subcategory_criterion_context_mapping',
      controlCommentRule: 'historical_conformity_comments_hidden_except_technical_measure_values',
      intranetRemarksRule: 'latest_remote_visit_summary_only_not_linked_to_controls',
      placeholderRule: 'slash_is_empty',
      materialsRule: 'current_patrimoine_not_historical_visit',
    },
  });

  return {
    imported: true,
    visiteId,
    remoteVisitId,
    mappedCriteria,
    sourceCriteria,
    sourceControlCriteria,
    unmappedControlCriteria,
    technicalCommentsPreserved,
    hiddenHistoricalControlComments,
    criteriaFromLatestVisit,
    criteriaFromEarlierVisits,
    criteriaWithoutSourceVisit,
    importedRemarks,
    importedMaterials: materialImport.importedMaterials,
    sourceMaterials: materialImport.sourceMaterials,
    matchedCatalogBrands: materialImport.matchedCatalogBrands,
    fieldImport,
    installationId,
    created: !existing?.id,
  };
}

export async function materializeCachedLocalForSite(siteId, remoteLocalId) {
  const localSiteId = clean(siteId);
  const remoteIdLocal = clean(remoteLocalId);
  if (!localSiteId || !remoteIdLocal) throw new Error('Site local / local Intranet requis pour matérialiser le local.');

  const ref = await getCachedLocalReference(remoteIdLocal);
  if (!ref) return null;
  const db = await getDb();
  let installationId = null;
  await db.withTransactionAsync(async () => {
    installationId = await ensureInstallation(db, localSiteId, remoteIdLocal, sanitizeRemoteReference(ref));
  });
  return installationId;
}

export async function importLatestApiVisitForLocal(siteId, remoteLocalId) {
  const localSiteId = clean(siteId);
  const remoteIdLocal = clean(remoteLocalId);
  if (!localSiteId || !remoteIdLocal) throw new Error('Site local / local Intranet requis pour importer la dernière visite.');

  const ref = await getCachedLocalReference(remoteIdLocal);
  if (!ref) return { imported: false, reason: 'no_cached_reference' };
  const db = await getDb();
  let result = { imported: false, reason: 'not_processed' };
  await db.withTransactionAsync(async () => {
    result = await importLatestVisitForLocal(db, localSiteId, remoteIdLocal, ref);
  });
  return result;
}

export async function importLatestApiVisitsForSite(siteId, remoteSiteId) {
  const localSiteId = clean(siteId);
  const remoteIdSite = clean(remoteSiteId);
  if (!localSiteId || !remoteIdSite) throw new Error('Site local / site Intranet requis pour importer la dernière visite.');

  const locals = await listCachedLocals(remoteIdSite);
  const db = await getDb();
  const results = [];
  await db.withTransactionAsync(async () => {
    for (const local of locals) {
      const remoteLocalId = clean(local?.remote_local_id);
      if (!remoteLocalId) continue;
      const ref = await getCachedLocalReference(remoteLocalId);
      if (!ref) continue;
      results.push(await importLatestVisitForLocal(db, localSiteId, remoteLocalId, ref));
    }
  });

  return {
    siteId: localSiteId,
    remoteSiteId: remoteIdSite,
    localCount: locals.length,
    importedCount: results.filter((result) => result.imported).length,
    createdCount: results.filter((result) => result.imported && result.created).length,
    updatedCount: results.filter((result) => result.imported && !result.created).length,
    results,
  };
}
