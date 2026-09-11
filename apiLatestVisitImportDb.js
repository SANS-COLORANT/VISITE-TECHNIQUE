import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { getCachedLocalReference, listCachedLocals } from './symfonyApiCacheDb.js';
import { mapRemoteTrameToLocal } from './apiVisitPreparationDb.js';
import { DEFAULT_TRAME_ID, obtenirTrame } from './trameRegistry.js';
import { enrichLatestImportedVisitFields } from './apiLatestVisitFieldEnrichmentDb.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function text(value) { const v = clean(value); return v || null; }
function meaningfulRemoteValue(value) { const v = clean(value); return !v || v === '/' ? null : v; }
function normalize(value) { return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function remoteId(value) { const v = clean(value); return v || null; }
function criterionSourceRelation(criterion, latestVisitId) {
  const sourceId = remoteId(criterion?.visiteSourceId);
  if (!sourceId) return 'without_source';
  return sourceId === remoteId(latestVisitId) ? 'latest_visit' : 'earlier_visit';
}

const INTRANET_MATERIAL_STATES = new Set(['Hors service', 'Vétuste', 'Moyen', 'Bon', 'Neuf']);
const CONTEXT_STOP_WORDS = new Set(['a','au','aux','de','des','du','d','et','la','le','les','l','conf','conformite','conformites','relatif','relative','relatifs','relatives']);
function contextTokens(value) { return normalize(value).split(' ').filter((token) => token && !CONTEXT_STOP_WORDS.has(token)); }
function contextOverlap(left, right) {
  const a = new Set(contextTokens(left)), b = new Set(contextTokens(right));
  if (!a.size || !b.size) return 0;
  let common = 0; for (const token of a) if (b.has(token)) common += 1; return common;
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
  const existing = await db.getFirstAsync(`SELECT id FROM provenances WHERE entite_type=? AND entite_id=? AND origine='api_symfony' AND COALESCE(reference_externe,'')=COALESCE(?,'') ORDER BY importe_le DESC LIMIT 1`, [entiteType, entiteId, ref]);
  if (existing?.id) {
    await db.runAsync(`UPDATE provenances SET details_json=?,importe_le=datetime('now') WHERE id=?`, [JSON.stringify(details ?? null), existing.id]);
    return existing.id;
  }
  const id = createId();
  await db.runAsync(`INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json) VALUES(?,?,?,?,?,?)`, [id, entiteType, entiteId, 'api_symfony', ref, JSON.stringify(details ?? null)]);
  return id;
}

async function ensureInstallation(db, siteId, remoteLocalId, ref) {
  const localLink = await db.getFirstAsync(`SELECT local_installation_id FROM api_local_links WHERE remote_local_id=? LIMIT 1`, [remoteLocalId]);
  if (localLink?.local_installation_id) {
    const linked = await db.getFirstAsync(`SELECT id FROM installations WHERE id=? AND site_id=? AND actif=1`, [localLink.local_installation_id, siteId]);
    if (linked?.id) return linked.id;
  }
  const byProvenance = await db.getFirstAsync(`SELECT i.id FROM provenances p JOIN installations i ON i.id=p.entite_id WHERE p.entite_type='installation' AND p.origine='api_symfony' AND p.reference_externe=? AND i.site_id=? AND i.actif=1 ORDER BY p.importe_le DESC LIMIT 1`, [remoteLocalId, siteId]);
  let installationId = byProvenance?.id || null;
  const designation = text(ref?.local?.designation) || 'Local technique';
  if (!installationId) {
    const sameName = await db.getAllAsync(`SELECT id FROM installations WHERE site_id=? AND actif=1 AND lower(trim(COALESCE(nom,'')))=lower(trim(?)) ORDER BY cree_le`, [siteId, designation]);
    if (sameName.length === 1) installationId = sameName[0].id;
  }
  if (!installationId) {
    installationId = createId();
    await db.runAsync(`INSERT INTO installations(id,site_id,type_code,nom,description,actif) VALUES(?,?,?,?,?,1)`, [installationId, siteId, 'installation_technique', designation, 'Local technique importé depuis l’Intranet']);
  }
  await db.runAsync(`UPDATE api_local_links SET local_installation_id=? WHERE remote_local_id=?`, [installationId, remoteLocalId]);
  await upsertProvenance(db, 'installation', installationId, remoteLocalId, { sourceType: 'local', remoteLocalId, remoteSiteId: remoteId(ref?.site?.id), designation });
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
        candidates.push({ panelId, section, sectionCode, cle: field.cle, key: normalize(field.cle), sectionKey: normalize(section), panelKey: normalize(definition?.ui?.labels?.[panelId] || panelId), panelIdKey: normalize(panelId) });
      }
    }
  }
  return candidates;
}

function contextScore(candidate, categoryName, subCategoryName) {
  const categoryKey = normalize(categoryName), subCategoryKey = normalize(subCategoryName);
  let score = 0;
  if (candidate.sectionKey && candidate.sectionKey === subCategoryKey) score += 100; else score += contextOverlap(candidate.sectionKey, subCategoryKey) * 18;
  if (candidate.panelKey && candidate.panelKey === categoryKey) score += 45; else score += contextOverlap(candidate.panelKey, categoryKey) * 14;
  score += contextOverlap(candidate.panelIdKey, categoryKey) * 12;
  return score;
}
function findControlCandidate(candidates, criterionName, categoryName, subCategoryName) {
  const key = normalize(criterionName); if (!key) return null;
  const exact = candidates.filter((candidate) => candidate.key === key);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const scored = exact.map((candidate) => ({ candidate, score: contextScore(candidate, categoryName, subCategoryName) })).sort((a, b) => b.score - a.score);
    if (scored[0]?.score > (scored[1]?.score ?? -1)) return scored[0].candidate;
  }
  return null;
}
function isTechnicalControlTarget(trameId, target) { return trameId === DEFAULT_TRAME_ID && target?.panelId === 'p-releves'; }
function remoteCriterionReference(category, subCategory, criterion) { return criterion?.referencePath || [remoteId(category?.id), remoteId(subCategory?.id), remoteId(criterion?.id)].map((v) => v || '?').join(':'); }
function latestVisitStatus(sourceStatus) { return normalize(sourceStatus).includes('complet') ? 'a_completer' : 'terminee'; }
async function findImportedVisit(db, remoteVisitId) {
  return db.getFirstAsync(`SELECT v.id,v.api_content_revision,v.api_synced_revision FROM provenances p JOIN visites v ON v.id=p.entite_id WHERE p.entite_type='visite' AND p.origine='api_symfony' AND p.reference_externe=? AND p.details_json LIKE '%\"sourceType\":\"imported_latest_visit\"%' ORDER BY p.importe_le DESC LIMIT 1`, [remoteVisitId]);
}
function existingVisitIsDirty(existing) { return Boolean(existing?.id) && Number(existing.api_content_revision || 0) !== Number(existing.api_synced_revision || 0); }

async function upsertControlsBatch(db, rows) {
  for (let offset = 0; offset < rows.length; offset += 80) {
    const chunk = rows.slice(offset, offset + 80);
    const placeholders = chunk.map(() => '(?,?,?,?,?)').join(',');
    const params = chunk.flatMap((row) => [row.visiteId, row.sectionCode, row.cle, row.avis, row.commentaire]);
    await db.runAsync(`INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES ${placeholders} ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET avis=excluded.avis,commentaire=excluded.commentaire`, params);
  }
}

async function replaceHistoricalMaterialSnapshot(db, visiteId, sourceMaterials) {
  const materials = Array.isArray(sourceMaterials) ? sourceMaterials : [];
  await db.runAsync(`DELETE FROM materiel WHERE visite_id=?`, [visiteId]);
  for (let offset = 0; offset < materials.length; offset += 60) {
    const chunk = materials.slice(offset, offset + 60);
    const placeholders = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
    const params = [];
    for (const material of chunk) {
      const state = text(material?.etat);
      params.push(
        createId(), visiteId, text(material?.categorie), text(material?.nombre), text(material?.designation),
        text(material?.numeroMateriel), text(material?.reseauDesservi), text(material?.marque), text(material?.modele),
        text(material?.caracteristiques), text(material?.annee), state && INTRANET_MATERIAL_STATES.has(state) ? state : null, null
      );
    }
    await db.runAsync(`INSERT INTO materiel(id,visite_id,categorie,nombre,designation,numero_materiel,reseau_desservi,marque,modele,caracteristiques,annee,etat,equipement_id) VALUES ${placeholders}`, params);
  }
}

async function importLatestVisitForLocal(db, siteId, remoteLocalId, sourceRef) {
  const ref = sanitizeRemoteReference(sourceRef);
  const latest = ref?.derniereVisite;
  const remoteVisitId = remoteId(latest?.id);
  if (!remoteVisitId) return { imported: false, reason: 'no_latest_visit' };

  // Un rafraîchissement Intranet ne doit jamais écraser une visite importée que
  // le technicien a déjà modifiée localement et qui attend donc un nouvel envoi.
  const existing = await findImportedVisit(db, remoteVisitId);
  if (existingVisitIsDirty(existing)) {
    return { imported: false, reason: 'local_changes_pending', visiteId: existing.id, remoteVisitId, protectedLocalChanges: true };
  }

  const installationId = await ensureInstallation(db, siteId, remoteLocalId, ref);
  const trameId = mapRemoteTrameToLocal(ref?.trame) || DEFAULT_TRAME_ID;
  const visitDate = text(latest?.date)?.slice(0, 10) || null;
  const status = latestVisitStatus(latest?.statut);
  const visiteId = existing?.id || createId();

  if (existing?.id) {
    await db.runAsync(`UPDATE visites SET site_id=?,date_visite=?,statut=?,progression_pct=100,trame_id=?,installation_id=?,api_remote_local_id=?,api_remote_trame_id=?,api_source_remote_visit_id=?,modifie_le=datetime('now') WHERE id=?`, [siteId, visitDate, status, trameId, installationId, remoteLocalId, remoteId(ref?.trame?.id), remoteVisitId, visiteId]);
  } else {
    await db.runAsync(`INSERT INTO visites(id,site_id,date_visite,technicien,statut,progression_pct,mode_visite,trame_id,installation_id,api_remote_local_id,api_remote_trame_id,api_source_remote_visit_id) VALUES(?,?,?,?,?,100,'complete',?,?,?,?,?)`, [visiteId, siteId, visitDate, null, status, trameId, installationId, remoteLocalId, remoteId(ref?.trame?.id), remoteVisitId]);
  }
  await db.runAsync(`INSERT OR IGNORE INTO notes(visite_id,contenu) VALUES(?, '')`, [visiteId]);

  const candidates = localControlCandidates(trameId);
  let mappedCriteria = 0, sourceCriteria = 0, sourceControlCriteria = 0, unmappedControlCriteria = 0;
  let technicalCommentsPreserved = 0, hiddenHistoricalControlComments = 0;
  let criteriaFromLatestVisit = 0, criteriaFromEarlierVisits = 0, criteriaWithoutSourceVisit = 0;
  const unmappedControlSample = [], controlRows = [];

  for (const category of Array.isArray(ref?.trame?.categories) ? ref.trame.categories : []) {
    for (const subCategory of Array.isArray(category?.sousCategories) ? category.sousCategories : []) {
      for (const criterion of Array.isArray(subCategory?.criteres) ? subCategory.criteres : []) {
        if (criterion?.avis == null && criterion?.commentaire == null) continue;
        sourceCriteria += 1;
        const sourceRelation = criterionSourceRelation(criterion, remoteVisitId);
        if (sourceRelation === 'latest_visit') criteriaFromLatestVisit += 1; else if (sourceRelation === 'earlier_visit') criteriaFromEarlierVisits += 1; else criteriaWithoutSourceVisit += 1;
        const avis = meaningfulRemoteValue(criterion?.avis); if (!avis) continue;
        sourceControlCriteria += 1;
        const target = findControlCandidate(candidates, criterion?.nom, category?.nom, subCategory?.nom);
        if (!target) {
          unmappedControlCriteria += 1;
          if (unmappedControlSample.length < 25) unmappedControlSample.push({ referencePath: remoteCriterionReference(category, subCategory, criterion), category: text(category?.nom), subCategory: text(subCategory?.nom), criterion: text(criterion?.nom), avis });
          continue;
        }
        const rawComment = meaningfulRemoteValue(criterion?.commentaire);
        const preserveTechnicalComment = isTechnicalControlTarget(trameId, target);
        const commentaire = preserveTechnicalComment ? rawComment : null;
        if (preserveTechnicalComment && rawComment) technicalCommentsPreserved += 1;
        if (!preserveTechnicalComment && rawComment) hiddenHistoricalControlComments += 1;
        controlRows.push({ visiteId, sectionCode: target.sectionCode, cle: target.cle, avis, commentaire });
        mappedCriteria += 1;
      }
    }
  }
  if (controlRows.length) await upsertControlsBatch(db, controlRows);

  const fieldImport = await enrichLatestImportedVisitFields({ db, visiteId, siteId, remoteVisitId, trameId, ref });

  let importedRemarks = 0;
  const remarks = Array.isArray(ref?.remarques) ? ref.remarques : [];
  for (let index = 0; index < remarks.length; index += 1) {
    const remark = remarks[index] || {};
    const remoteRemarkId = remoteId(remark.id) || `${remoteVisitId}:remark:${index}`;
    const linked = await db.getFirstAsync(`SELECT r.id FROM provenances p JOIN remarques r ON r.id=p.entite_id WHERE p.entite_type='remarque' AND p.origine='api_symfony' AND p.reference_externe=? ORDER BY p.importe_le DESC LIMIT 1`, [remoteRemarkId]);
    const remarqueId = linked?.id || createId();
    if (linked?.id) {
      await db.runAsync(`UPDATE remarques SET visite_id=?,poste=?,prestation=?,delai=?,estimatif=?,origine='Intranet',controle_key=NULL,reference_type='api_symfony',reference_id=?,reference_libelle=? WHERE id=?`, [visiteId, text(remark.poste) || 'Observation', text(remark.prestation) || '', text(remark.delai), remark.estimatif ?? null, remoteRemarkId, text(remark.poste) || 'Réserve Intranet', remarqueId]);
    } else {
      await db.runAsync(`INSERT INTO remarques(id,visite_id,controle_key,poste,prestation,delai,estimatif,origine,reference_type,reference_id,reference_libelle) VALUES(?,?,NULL,?,?,?,?, 'Intranet','api_symfony',?,?)`, [remarqueId, visiteId, text(remark.poste) || 'Observation', text(remark.prestation) || '', text(remark.delai), remark.estimatif ?? null, remoteRemarkId, text(remark.poste) || 'Réserve Intranet']);
    }
    await upsertProvenance(db, 'remarque', remarqueId, remoteRemarkId, { sourceType: 'latest_remote_visit_remark', remoteVisitId, summaryOnly: true, linkedToControl: false, payload: remark });
    importedRemarks += 1;
  }

  // Le listing matériel de la préparation représente l'état courant du LOCAL.
  // On le garde sur la visite historique importée afin qu'une modification puis
  // un nouvel envoi ne transforme jamais implicitement un listing distant non
  // vide en liste vide. Cette photographie n'est pas reportée comme état du jour
  // lors de la création d'une nouvelle visite.
  await replaceHistoricalMaterialSnapshot(db, visiteId, ref?.materiels);

  await upsertProvenance(db, 'visite', visiteId, remoteVisitId, {
    schemaVersion: 4, sourceType: 'imported_latest_visit', remoteVisitId, remoteLocalId,
    remoteSiteId: remoteId(ref?.site?.id), remoteStatus: text(latest?.statut), remoteDate: text(latest?.date),
    trame: ref?.trame || null, materiels: Array.isArray(ref?.materiels) ? ref.materiels : [], remarques: remarks,
    notes: Array.isArray(ref?.notes) ? ref.notes : [],
    importSummary: {
      sourceCriteria, sourceControlCriteria, mappedCriteria, unmappedControlCriteria, unmappedControlSample,
      technicalCommentsPreserved, hiddenHistoricalControlComments, criteriaFromLatestVisit, criteriaFromEarlierVisits,
      criteriaWithoutSourceVisit, fieldImport, importedRemarks,
      criteriaRule: 'preparation_values_are_latest_known_visiteSourceId_is_provenance_only',
      controlIdentityRule: 'remote_branch_is_category_subcategory_criterion_context_mapping',
      controlCommentRule: 'historical_conformity_comments_hidden_except_technical_measure_values',
      intranetRemarksRule: 'latest_remote_visit_summary_only_not_linked_to_controls', placeholderRule: 'slash_is_empty',
      materialsRule: 'current_patrimoine_snapshot_for_safe_resend_not_carry_forward_state',
    },
  });

  await db.runAsync(`UPDATE visites SET api_content_revision=CASE WHEN api_content_revision<1 THEN 1 ELSE api_content_revision END WHERE id=?`, [visiteId]);
  await db.runAsync(`UPDATE visites SET api_synced_revision=api_content_revision WHERE id=?`, [visiteId]);

  return {
    imported: true, visiteId, remoteVisitId, mappedCriteria, sourceCriteria, sourceControlCriteria,
    unmappedControlCriteria, technicalCommentsPreserved, hiddenHistoricalControlComments,
    criteriaFromLatestVisit, criteriaFromEarlierVisits, criteriaWithoutSourceVisit, importedRemarks, fieldImport,
    created: !existing?.id,
  };
}

export async function importLatestApiVisitForLocal(siteId, remoteLocalId) {
  const localSiteId = clean(siteId), remoteIdLocal = clean(remoteLocalId);
  if (!localSiteId || !remoteIdLocal) throw new Error('Site local / local Intranet requis pour importer la dernière visite.');
  const ref = await getCachedLocalReference(remoteIdLocal);
  if (!ref) return { imported: false, reason: 'no_cached_reference' };
  const db = await getDb();
  let result = { imported: false, reason: 'not_processed' };
  await db.withTransactionAsync(async () => { result = await importLatestVisitForLocal(db, localSiteId, remoteIdLocal, ref); });
  return result;
}

export async function importLatestApiVisitsForSite(siteId, remoteSiteId) {
  const localSiteId = clean(siteId), remoteIdSite = clean(remoteSiteId);
  if (!localSiteId || !remoteIdSite) throw new Error('Site local / site Intranet requis pour importer la dernière visite.');
  const locals = await listCachedLocals(remoteIdSite);
  const prepared = await Promise.all((locals || []).map(async (local) => {
    const remoteLocalId = clean(local?.remote_local_id);
    return remoteLocalId ? { remoteLocalId, ref: await getCachedLocalReference(remoteLocalId) } : null;
  }));
  const db = await getDb();
  const results = [];
  await db.withTransactionAsync(async () => {
    for (const item of prepared.filter((x) => x?.ref)) results.push(await importLatestVisitForLocal(db, localSiteId, item.remoteLocalId, item.ref));
  });
  return {
    siteId: localSiteId, remoteSiteId: remoteIdSite, localCount: locals.length,
    importedCount: results.filter((result) => result.imported).length,
    createdCount: results.filter((result) => result.imported && result.created).length,
    updatedCount: results.filter((result) => result.imported && !result.created).length,
    protectedLocalChangesCount: results.filter((result) => result.protectedLocalChanges).length,
    results,
  };
}
