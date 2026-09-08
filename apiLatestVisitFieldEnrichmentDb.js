import { createId } from './database/ids.js';
import { DEFAULT_TRAME_ID, obtenirTrame } from './trameRegistry.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function text(value) { const valueText = clean(value); return valueText || null; }
function normalize(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function remoteId(value) { const valueText = clean(value); return valueText || null; }
function sectionCode(panelId, section) {
  return panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function buildFieldCandidates(trameId) {
  const definition = obtenirTrame(trameId || DEFAULT_TRAME_ID);
  const candidates = [];
  for (const [panelId, sections] of Object.entries(definition?.ui?.panels || {})) {
    for (const [section, fields] of Object.entries(sections || {})) {
      for (const field of fields || []) {
        if (!field?.cle) continue;
        candidates.push({
          panelId,
          section,
          sectionCode: sectionCode(panelId, section),
          cle: field.cle,
          type: field.type || 'champ',
          key: normalize(field.cle),
          sectionKey: normalize(section),
          panelKey: normalize(definition?.ui?.labels?.[panelId] || panelId),
        });
      }
    }
  }
  return candidates;
}

function preferredType(criterion) {
  if (criterion?.avisApplicable === true) return 'controle';
  if (criterion?.avisApplicable === false) return 'champ';
  const avis = normalize(criterion?.avis).replace(/\s+/g, '');
  if (['s', 'ns', 'so', 'nv', 'nr'].includes(avis)) return 'controle';
  return null;
}

function findFieldCandidate(candidates, criterion, categoryName, subCategoryName) {
  const key = normalize(criterion?.nom);
  if (!key) return null;
  const exact = candidates.filter((candidate) => candidate.key === key);
  if (!exact.length) return null;
  if (exact.length === 1) return exact[0];

  const context = [normalize(subCategoryName), normalize(categoryName)].filter(Boolean);
  const wantedType = preferredType(criterion);
  const scored = exact.map((candidate) => {
    let score = wantedType && candidate.type === wantedType ? 6 : 0;
    for (const token of context) {
      if (candidate.sectionKey === token) score += 10;
      else if (candidate.sectionKey && (candidate.sectionKey.includes(token) || token.includes(candidate.sectionKey))) score += 5;
      if (candidate.panelKey === token) score += 4;
      else if (candidate.panelKey && (candidate.panelKey.includes(token) || token.includes(candidate.panelKey))) score += 2;
    }
    return { candidate, score };
  }).sort((a, b) => b.score - a.score);

  if (scored.length === 1) return scored[0].candidate;
  if (scored[0].score > scored[1].score) return scored[0].candidate;
  const preferred = wantedType ? scored.filter((row) => row.candidate.type === wantedType) : [];
  return preferred.length === 1 ? preferred[0].candidate : null;
}

function criterionValue(criterion) {
  const comment = text(criterion?.commentaire);
  if (comment != null) return comment;
  if (criterion?.avisApplicable === false) return text(criterion?.avis);
  return null;
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

async function upsertField(db, visiteId, target, value) {
  const finalValue = text(value);
  if (finalValue == null) return false;
  await db.runAsync(
    `INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)
     ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur`,
    [visiteId, target.sectionCode, target.cle, finalValue]
  );
  return true;
}

async function importMetadataFields(db, visiteId, siteId, remoteVisitId, ref, candidates) {
  const site = await db.getFirstAsync(
    `SELECT s.nom_site,s.adresse,c.nom AS nom_client FROM sites s LEFT JOIN clients c ON c.id=s.client_id WHERE s.id=? LIMIT 1`,
    [siteId]
  );
  const wanted = [
    ['p-infos', 'Général', 'Nom du client', site?.nom_client],
    ['p-infos', 'Général', 'Nom du site', site?.nom_site || ref?.site?.nom],
    ['p-infos', 'Général', 'Nom du local', ref?.local?.designation],
    ['p-infos', 'Général', 'Trame utilisée', ref?.trame?.nom],
    ['p-infos', 'Général', 'Date de la visite', ref?.derniereVisite?.date],
    ['p-infos', 'Informations générales', 'Date de visite', ref?.derniereVisite?.date],
    ['p-infos', 'Informations générales', 'Nom du site', site?.nom_site || ref?.site?.nom],
    ['p-infos', 'Informations générales', 'Adresse', site?.adresse],
  ];
  let count = 0;
  for (const [panelId, section, key, value] of wanted) {
    if (text(value) == null) continue;
    const target = candidates.find((candidate) => candidate.panelId === panelId && candidate.section === section && candidate.cle === key);
    if (!target) continue;
    if (await upsertField(db, visiteId, target, value)) count += 1;
  }
  if (count) {
    await upsertProvenance(db, 'visite_champs_meta', visiteId, remoteVisitId, {
      sourceType: 'latest_remote_visit_metadata', fieldCount: count,
    });
  }
  return count;
}

const NETWORK_COLUMNS = Object.freeze({
  't ext c': 't_ext_c',
  't dep c': 't_dep_c',
  'nom reseau': 'nom_reseau',
  'courbe de chauffe': 'courbe_de_chauffe',
  tnc: 'tnc',
  'consigne et programme horaire': 'consigne_programme_horaire',
});

function networkColumn(name) { return NETWORK_COLUMNS[normalize(name)] || null; }
function isFixedRegulationGroup(name) {
  const normalized = normalize(name);
  return normalized === 'cascade chaudieres' || normalized === 'reseau ecs';
}
function looksLikeNetworkGroup(name, criteria) {
  if (isFixedRegulationGroup(name)) return false;
  const normalized = normalize(name);
  const matching = criteria.filter((criterion) => networkColumn(criterion?.nom));
  return matching.length >= 2 || (matching.length >= 1 && /^(circuit|reseau)(\s|$)/.test(normalized));
}

async function importNetworks(db, visiteId, remoteVisitId, ref) {
  if ((ref?.trame?.categories || []).length === 0) return { count: 0, refs: new Set() };
  const groups = [];
  const networkCriterionRefs = new Set();

  for (const category of ref.trame.categories || []) {
    const subCategories = Array.isArray(category?.sousCategories) ? category.sousCategories : [];
    for (const subCategory of subCategories) {
      const criteria = (Array.isArray(subCategory?.criteres) ? subCategory.criteres : []).filter((criterion) =>
        remoteId(criterion?.visiteSourceId) === remoteVisitId && criterionValue(criterion) != null
      );
      const groupName = text(subCategory?.nom) || text(category?.nom) || '';
      if (!looksLikeNetworkGroup(groupName, criteria)) continue;
      groups.push({ category, subCategory, groupName, criteria });
      for (const criterion of criteria) if (networkColumn(criterion?.nom)) networkCriterionRefs.add(remoteId(criterion?.id) || `${normalize(groupName)}:${normalize(criterion?.nom)}`);
    }
  }

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const syntheticRef = `${remoteVisitId}:network:${remoteId(group.category?.id) || normalize(group.category?.nom)}:${remoteId(group.subCategory?.id) || normalize(group.subCategory?.nom)}`;
    const linked = await db.getFirstAsync(
      `SELECT r.id FROM provenances p JOIN reseaux r ON r.id=p.entite_id
       WHERE p.entite_type='reseau' AND p.origine='api_symfony' AND p.reference_externe=?
       ORDER BY p.importe_le DESC LIMIT 1`,
      [syntheticRef]
    );
    const values = {
      nom_reseau: text(group.groupName) || `Réseau ${index + 1}`,
      t_ext_c: null,
      t_dep_c: null,
      courbe_de_chauffe: null,
      tnc: null,
      consigne_programme_horaire: null,
    };
    for (const criterion of group.criteria) {
      const column = networkColumn(criterion?.nom);
      const value = criterionValue(criterion);
      if (column && value != null) values[column] = value;
    }
    const reseauId = linked?.id || createId();
    if (linked?.id) {
      await db.runAsync(
        `UPDATE reseaux SET visite_id=?,ordre=?,nom_reseau=?,t_ext_c=?,t_dep_c=?,courbe_de_chauffe=?,tnc=?,consigne_programme_horaire=? WHERE id=?`,
        [visiteId, index, values.nom_reseau, values.t_ext_c, values.t_dep_c, values.courbe_de_chauffe, values.tnc, values.consigne_programme_horaire, reseauId]
      );
    } else {
      await db.runAsync(
        `INSERT INTO reseaux(id,visite_id,ordre,nom_reseau,t_ext_c,t_dep_c,courbe_de_chauffe,tnc,consigne_programme_horaire)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        [reseauId, visiteId, index, values.nom_reseau, values.t_ext_c, values.t_dep_c, values.courbe_de_chauffe, values.tnc, values.consigne_programme_horaire]
      );
    }
    await upsertProvenance(db, 'reseau', reseauId, syntheticRef, {
      sourceType: 'latest_remote_visit_network', remoteVisitId,
      remoteCategoryId: remoteId(group.category?.id), remoteSubCategoryId: remoteId(group.subCategory?.id),
      payload: group,
    });
  }
  return { count: groups.length, refs: networkCriterionRefs };
}

function meterUnit(fieldName) {
  const normalized = normalize(fieldName);
  if (normalized.includes('mwh')) return 'MWh';
  if (clean(fieldName).includes('m³') || normalized.includes('m3')) return 'm³';
  if (normalized.includes('kwh')) return 'kWh';
  if (normalized.includes('fioul')) return 'L';
  return null;
}
function meterLabel(fieldName) {
  return clean(fieldName).replace(/\s*\([^)]*\)\s*$/, '').trim();
}

async function upsertMeterFromField(db, visiteId, remoteVisitId, criterion, target, value) {
  if (target.panelId !== 'p-releves' || !/^index/i.test(target.cle)) return false;
  const label = meterLabel(target.cle);
  let row = await db.getFirstAsync(
    `SELECT id FROM compteurs WHERE visite_id=? AND lower(trim(COALESCE(label,'')))=lower(trim(?)) ORDER BY id LIMIT 1`,
    [visiteId, label]
  );
  if (!row?.id) {
    const reference = `${remoteVisitId}:meter:${remoteId(criterion?.id) || normalize(target.cle)}`;
    row = await db.getFirstAsync(
      `SELECT c.id FROM provenances p JOIN compteurs c ON c.id=p.entite_id
       WHERE p.entite_type='compteur' AND p.origine='api_symfony' AND p.reference_externe=?
       ORDER BY p.importe_le DESC LIMIT 1`,
      [reference]
    );
  }
  const compteurId = row?.id || createId();
  const unite = meterUnit(target.cle);
  if (row?.id) {
    await db.runAsync(`UPDATE compteurs SET visite_id=?,label=?,valeur=?,unite=? WHERE id=?`, [visiteId, label, value, unite, compteurId]);
  } else {
    await db.runAsync(`INSERT INTO compteurs(id,visite_id,label,valeur,unite) VALUES(?,?,?,?,?)`, [compteurId, visiteId, label, value, unite]);
  }
  await upsertProvenance(db, 'compteur', compteurId, `${remoteVisitId}:meter:${remoteId(criterion?.id) || normalize(target.cle)}`, {
    sourceType: 'latest_remote_visit_meter', remoteVisitId, criterion,
  });
  return true;
}

export async function enrichLatestImportedVisitFields({ db, visiteId, siteId, remoteVisitId, trameId, ref }) {
  const candidates = buildFieldCandidates(trameId);
  const networkImport = trameId === DEFAULT_TRAME_ID
    ? await importNetworks(db, visiteId, remoteVisitId, ref)
    : { count: 0, refs: new Set() };
  const metadataFields = await importMetadataFields(db, visiteId, siteId, remoteVisitId, ref, candidates);

  let mappedFields = 0;
  let importedMeters = 0;
  let skippedAmbiguous = 0;
  const imported = [];

  for (const category of Array.isArray(ref?.trame?.categories) ? ref.trame.categories : []) {
    for (const subCategory of Array.isArray(category?.sousCategories) ? category.sousCategories : []) {
      for (const criterion of Array.isArray(subCategory?.criteres) ? subCategory.criteres : []) {
        if (remoteId(criterion?.visiteSourceId) !== remoteVisitId) continue;
        const value = criterionValue(criterion);
        if (value == null) continue;
        const criterionRef = remoteId(criterion?.id) || `${normalize(subCategory?.nom)}:${normalize(criterion?.nom)}`;
        if (networkImport.refs.has(criterionRef)) continue;

        const target = findFieldCandidate(candidates, criterion, category?.nom, subCategory?.nom);
        if (!target) { skippedAmbiguous += 1; continue; }
        if (target.type !== 'champ') continue;
        if (await upsertField(db, visiteId, target, value)) {
          mappedFields += 1;
          imported.push({ remoteCriterionId: remoteId(criterion?.id), remoteName: criterion?.nom, target: `${target.sectionCode}||${target.cle}` });
          if (await upsertMeterFromField(db, visiteId, remoteVisitId, criterion, target, value)) importedMeters += 1;
        }
      }
    }
  }

  await upsertProvenance(db, 'visite_champs', visiteId, remoteVisitId, {
    sourceType: 'latest_remote_visit_non_control_fields',
    remoteVisitId,
    mappedFields,
    metadataFields,
    importedNetworks: networkImport.count,
    importedMeters,
    skippedAmbiguous,
    imported,
    rule: 'only values whose visiteSourceId matches derniereVisite are imported as historical visit fields',
  });

  return {
    mappedFields,
    metadataFields,
    importedNetworks: networkImport.count,
    importedMeters,
    skippedAmbiguous,
  };
}
