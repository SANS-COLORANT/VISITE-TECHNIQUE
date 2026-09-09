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
        });
      }
    }
  }
  return candidates;
}

function findControlCandidate(candidates, criterionName, categoryName, subCategoryName) {
  const key = normalize(criterionName);
  if (!key) return null;
  const exact = candidates.filter((candidate) => candidate.key === key);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const context = [normalize(subCategoryName), normalize(categoryName)].filter(Boolean);
    const scored = exact.map((candidate) => ({
      candidate,
      score: context.reduce((score, token) => score + (candidate.sectionKey === token ? 3 : 0) + (candidate.panelKey === token ? 2 : 0), 0),
    })).sort((a, b) => b.score - a.score);
    if (scored[0]?.score > (scored[1]?.score || -1)) return scored[0].candidate;
  }
  return null;
}

function latestVisitStatus(sourceStatus) {
  const status = normalize(sourceStatus);
  if (status.includes('complet')) return 'a_completer';
  return 'terminee';
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
  const latest = ref?.derniereVisite;
  const remoteVisitId = remoteId(latest?.id);
  if (!remoteVisitId) return { imported: false, reason: 'no_latest_visit' };

  const installationId = await ensureInstallation(db, siteId, remoteLocalId, ref);
  const trameId = mapRemoteTrameToLocal(ref?.trame) || DEFAULT_TRAME_ID;
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
  for (const category of Array.isArray(ref?.trame?.categories) ? ref.trame.categories : []) {
    for (const subCategory of Array.isArray(category?.sousCategories) ? category.sousCategories : []) {
      for (const criterion of Array.isArray(subCategory?.criteres) ? subCategory.criteres : []) {
        if (remoteId(criterion?.visiteSourceId) !== remoteVisitId) continue;
        if (criterion?.avis == null && criterion?.commentaire == null) continue;
        sourceCriteria += 1;
        const target = findControlCandidate(candidates, criterion?.nom, category?.nom, subCategory?.nom);
        if (!target) continue;
        await db.runAsync(
          `INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES(?,?,?,?,?)
           ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET avis=excluded.avis,commentaire=excluded.commentaire`,
          [visiteId, target.sectionCode, target.cle, meaningfulRemoteValue(criterion?.avis), meaningfulRemoteValue(criterion?.commentaire)]
        );
        mappedCriteria += 1;
      }
    }
  }

  const fieldImport = await enrichLatestImportedVisitFields({
    db, visiteId, siteId, remoteVisitId, trameId, ref,
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
        `UPDATE remarques SET visite_id=?,poste=?,prestation=?,delai=?,estimatif=?,origine='Intranet',reference_type='api_symfony',reference_id=?,reference_libelle=? WHERE id=?`,
        [visiteId, text(remark.poste) || 'Observation', text(remark.prestation) || '', text(remark.delai), remark.estimatif ?? null, remoteRemarkId, text(remark.poste) || 'Réserve Intranet', remarqueId]
      );
    } else {
      await db.runAsync(
        `INSERT INTO remarques(id,visite_id,poste,prestation,delai,estimatif,origine,reference_type,reference_id,reference_libelle)
         VALUES(?,?,?,?,?,?,'Intranet','api_symfony',?,?)`,
        [remarqueId, visiteId, text(remark.poste) || 'Observation', text(remark.prestation) || '', text(remark.delai), remark.estimatif ?? null, remoteRemarkId, text(remark.poste) || 'Réserve Intranet']
      );
    }
    await upsertProvenance(db, 'remarque', remarqueId, remoteRemarkId, { sourceType: 'latest_remote_visit_remark', remoteVisitId, payload: remark });
    importedRemarks += 1;
  }

  await upsertProvenance(db, 'visite', visiteId, remoteVisitId, {
    schemaVersion: 1,
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
      mappedCriteria,
      fieldImport,
      importedRemarks,
      criteriaRule: 'only_criteria_whose_visiteSourceId_matches_derniereVisite',
      placeholderRule: 'slash_is_empty',
      materialsRule: 'current_patrimoine_not_historical_visit',
    },
  });

  return { imported: true, visiteId, remoteVisitId, mappedCriteria, sourceCriteria, importedRemarks, fieldImport, created: !existing?.id };
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
