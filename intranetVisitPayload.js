import { getDb } from './db.js';
import { obtenirTrame } from './trameRegistry.js';

export const INTRANET_MAX_BODY_BYTES = 5 * 1024 * 1024;
export const INTRANET_AVIS = Object.freeze(['S.O', 'S', 'N.S', 'N.R', 'N.V']);
export const INTRANET_PROGRESS = Object.freeze(['Non réalisé', 'Devis émis', 'En cours', 'Terminé', 'Annulé']);
export const INTRANET_MATERIAL_STATES = Object.freeze(['Hors service', 'Vétuste', 'Moyen', 'Bon', 'Neuf']);

function clean(value) { return value == null ? '' : String(value).trim(); }
function nullable(value) { const v = clean(value); return v || null; }
function normalize(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function sectionCode(panelId, section) { return panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
function dateOnly(value) { const v = clean(value); const m = v.match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null; }
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [y, m, d] = String(value).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
function apiId(value, label, issues) {
  const raw = clean(value);
  if (!/^\d+$/.test(raw)) { issues.push(`${label} : identifiant Intranet invalide.`); return null; }
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) { issues.push(`${label} : identifiant Intranet hors plage.`); return null; }
  return n;
}
function utf8ByteLength(value) {
  let bytes = 0;
  const s = String(value || '');
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xDC00 && s.charCodeAt(i + 1) <= 0xDFFF) { bytes += 4; i += 1; }
    else bytes += 3;
  }
  return bytes;
}
function limited(value, max, path, issues, { required = false } = {}) {
  const v = nullable(value);
  if (required && !v) issues.push(`${path} : valeur obligatoire.`);
  if (v && v.length > max) issues.push(`${path} : ${v.length} caractères, maximum ${max}.`);
  return v;
}
function exactComment(value, issues, path) {
  const v = clean(value);
  if (v.length > 1500) issues.push(`${path} : ${v.length} caractères, maximum 1500.`);
  // Le serveur accepte commentaire:null mais ne crée alors pas LocalCritere.
  // Une chaîne non nulle est donc systématique afin de ne perdre aucun avis.
  return v || '/';
}
function meaningfulRemote(value) { const v = clean(value); return !v || v === '/' ? null : v; }

function buildStaticCandidates(localTrameId) {
  const definition = obtenirTrame(localTrameId);
  const candidates = [];
  for (const [panelId, sections] of Object.entries(definition?.ui?.panels || {})) {
    for (const [section, fields] of Object.entries(sections || {})) {
      for (const field of fields || []) {
        if (!field?.cle || field.hiddenInApp === true) continue;
        candidates.push({ panelId, section, sectionCode: sectionCode(panelId, section), cle: field.cle,
          label: field.cle, type: field.type || 'champ', key: normalize(field.cle),
          sectionKey: normalize(section), panelKey: normalize(definition?.ui?.labels?.[panelId] || panelId) });
      }
    }
  }
  return candidates;
}

async function buildCandidates(db, visite) {
  const candidates = buildStaticCandidates(visite.trame_id);
  if (visite.trame_id !== 'pre_allumage') return candidates;
  const rows = await db.getAllAsync(`
    SELECT r.panel_id,r.section_code,r.nom AS section_name,c.cle_stockage,c.libelle,c.type_code
    FROM pre_allumage_champs c JOIN pre_allumage_rubriques r ON r.id=c.rubrique_id
    WHERE r.visite_id=? ORDER BY r.ordre,c.ordre`, [visite.id]);
  const definition = obtenirTrame(visite.trame_id);
  for (const row of rows || []) {
    candidates.push({ panelId: row.panel_id, section: row.section_name, sectionCode: row.section_code,
      cle: row.cle_stockage, label: row.libelle, type: row.type_code || 'champ', key: normalize(row.libelle || row.cle_stockage),
      sectionKey: normalize(row.section_name), panelKey: normalize(definition?.ui?.labels?.[row.panel_id] || row.panel_id), dynamic: true });
  }
  return candidates;
}

function preferredType(criterion) { return criterion?.avisApplicable === true ? 'controle' : 'champ'; }
function candidateScore(candidate, criterion, categoryName, subCategoryName) {
  let score = candidate.type === preferredType(criterion) ? 8 : 0;
  const contexts = [normalize(subCategoryName), normalize(categoryName)].filter(Boolean);
  for (const token of contexts) {
    if (candidate.sectionKey === token) score += 20;
    else if (candidate.sectionKey && (candidate.sectionKey.includes(token) || token.includes(candidate.sectionKey))) score += 9;
    if (candidate.panelKey === token) score += 7;
    else if (candidate.panelKey && (candidate.panelKey.includes(token) || token.includes(candidate.panelKey))) score += 3;
  }
  if (candidate.dynamic) score += 1;
  return score;
}
function findCandidate(candidates, criterion, categoryName, subCategoryName) {
  const key = normalize(criterion?.nom);
  if (!key) return null;
  const exact = candidates.filter((candidate) => candidate.key === key);
  if (!exact.length) return null;
  const ranked = exact.map((candidate) => ({ candidate, score: candidateScore(candidate, criterion, categoryName, subCategoryName) }))
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 1 || ranked[0].score > ranked[1].score) return ranked[0].candidate;
  const same = ranked.filter((r) => r.score === ranked[0].score);
  const identity = new Set(same.map((r) => `${r.candidate.sectionCode}||${r.candidate.cle}||${r.candidate.type}`));
  return identity.size === 1 ? same[0].candidate : null;
}

const NETWORK_COLUMNS = Object.freeze({
  't ext c': 't_ext_c', 't dep c': 't_dep_c', 'nom reseau': 'nom_reseau',
  'courbe de chauffe': 'courbe_de_chauffe', tnc: 'tnc', 'consigne et programme horaire': 'consigne_programme_horaire',
});
function networkColumn(name) { return NETWORK_COLUMNS[normalize(name)] || null; }
function fixedRegulation(name) { const n = normalize(name); return n === 'cascade chaudieres' || n === 'reseau ecs'; }
function isNetworkGroup(subCategory) {
  if (fixedRegulation(subCategory?.nom)) return false;
  const criteria = Array.isArray(subCategory?.criteres) ? subCategory.criteres : [];
  const count = criteria.filter((criterion) => networkColumn(criterion?.nom)).length;
  return count >= 2 || (count >= 1 && /^(circuit|reseau)(\s|$)/.test(normalize(subCategory?.nom)));
}
function cleanCounterLabel(value) { return normalize(String(value || '').replace(/\s*\([^)]*\)\s*$/, '')); }
function counterValue(counters, criterion, candidate) {
  const keys = new Set([cleanCounterLabel(criterion?.nom), cleanCounterLabel(candidate?.label), cleanCounterLabel(candidate?.cle)].filter(Boolean));
  const exact = counters.filter((counter) => keys.has(cleanCounterLabel(counter.label)));
  if (exact.length === 1) return exact[0].valeur;
  return undefined;
}
function remoteNetworkKey(categoryId, subCategoryId) { return `${clean(categoryId)}:${clean(subCategoryId)}`; }
function mapNetworksToRemoteGroups(networks, groups, provenanceRows, issues) {
  const assignments = new Map();
  const used = new Set();
  const provenanceByRemote = new Map();
  for (const row of provenanceRows || []) {
    let details = null;
    try { details = JSON.parse(row.details_json || 'null'); } catch {}
    const key = remoteNetworkKey(details?.remoteCategoryId, details?.remoteSubCategoryId);
    if (key === ':') continue;
    if (!provenanceByRemote.has(key)) provenanceByRemote.set(key, []);
    provenanceByRemote.get(key).push(row.entite_id);
  }
  for (const group of groups) {
    const key = remoteNetworkKey(group.category?.id, group.subCategory?.id);
    const ids = [...new Set(provenanceByRemote.get(key) || [])];
    const matches = networks.filter((network) => ids.includes(network.id));
    if (matches.length === 1 && !used.has(matches[0].id)) { assignments.set(key, matches[0]); used.add(matches[0].id); }
    else if (matches.length > 1) issues.push(`Réseau « ${clean(group.subCategory?.nom) || key} » : plusieurs réseaux locaux portent la même référence Intranet.`);
  }
  for (const group of groups) {
    const key = remoteNetworkKey(group.category?.id, group.subCategory?.id);
    if (assignments.has(key)) continue;
    const matches = networks.filter((network) => !used.has(network.id) && normalize(network.nom_reseau) === normalize(group.subCategory?.nom));
    if (matches.length === 1) { assignments.set(key, matches[0]); used.add(matches[0].id); }
  }
  const remainingGroups = groups.filter((group) => !assignments.has(remoteNetworkKey(group.category?.id, group.subCategory?.id)));
  const remainingNetworks = networks.filter((network) => !used.has(network.id));
  if (remainingNetworks.length && remainingNetworks.length === remainingGroups.length) {
    remainingGroups.forEach((group, index) => assignments.set(remoteNetworkKey(group.category?.id, group.subCategory?.id), remainingNetworks[index]));
    remainingNetworks.length = 0;
  }
  if (remainingNetworks.length) {
    issues.push(`${remainingNetworks.length} réseau(x) METRA ne peuvent pas être rattachés sans ambiguïté à la trame Intranet. Reprépare la visite depuis l’Intranet.`);
  }
  return assignments;
}

async function frozenContext(db, visite) {
  const rows = await db.getAllAsync(`SELECT details_json,reference_externe,importe_le FROM provenances
    WHERE entite_type='visite' AND entite_id=? AND origine='api_symfony' ORDER BY importe_le DESC`, [visite.id]);
  let preparedContext = null;
  for (const row of rows || []) {
    try {
      const details = JSON.parse(row.details_json || 'null');
      if (details?.sourceType === 'imported_latest_visit') return { historical: true, details };
      // An explicit send-time destination must win over an older preparation
      // reference, including when SQLite timestamps fall in the same second.
      if (details?.sourceType === 'upload_binding') return { historical: false, details };
      if (details?.sourceType === 'preparation_visite' && !preparedContext) preparedContext = { historical: false, details };
    } catch {}
  }
  return preparedContext;
}

async function resolveRemoteClientId(db, visite, details, issues) {
  if (nullable(visite.api_remote_client_id)) return apiId(visite.api_remote_client_id, 'Client', issues);
  const remoteSiteId = nullable(details?.site?.id);
  if (!remoteSiteId) { issues.push('Client : site Intranet d’origine absent de la référence figée.'); return null; }
  const own = await db.getAllAsync(`
    SELECT cs.remote_client_id FROM api_client_site_links cs
    JOIN api_client_links c ON c.remote_client_id=cs.remote_client_id
    JOIN sites s ON s.id=?
    WHERE cs.remote_site_id=? AND c.local_client_id=s.client_id AND cs.remote_present=1`, [visite.site_id, remoteSiteId]);
  const rows = own.length === 1 ? own : await db.getAllAsync(
    `SELECT remote_client_id FROM api_client_site_links WHERE remote_site_id=? AND remote_present=1`, [remoteSiteId]);
  if (rows.length !== 1) { issues.push('Client : association Intranet ambiguë. Reprépare cette visite depuis le client Intranet.'); return null; }
  return apiId(rows[0].remote_client_id, 'Client', issues);
}

function sourceVisitId(visite, details, issues) {
  const raw = nullable(visite.api_source_remote_visit_id) ?? nullable(details?.derniereVisite?.id);
  if (raw == null) return null;
  return apiId(raw, 'Dernière visite source', issues);
}
function remoteTrameId(visite, details, issues) {
  return apiId(nullable(visite.api_remote_trame_id) ?? nullable(details?.trame?.id), 'Trame', issues);
}
function countRemoteCriteria(trame) {
  return (Array.isArray(trame?.categories) ? trame.categories : []).reduce((total, category) => {
    const subs = Array.isArray(category?.sousCategories) ? category.sousCategories : [];
    return total + subs.reduce((subtotal, subCategory) => subtotal + (Array.isArray(subCategory?.criteres) ? subCategory.criteres.length : 0), 0);
  }, 0);
}

async function buildCriteria(db, visite, details, issues) {
  const remoteTrame = details?.trame;
  const categories = Array.isArray(remoteTrame?.categories) ? remoteTrame.categories : [];
  if (!categories.length) { issues.push('Trame Intranet : aucun critère de référence figé pour cette visite.'); return []; }
  const [candidates, fields, controls, networks, counters, networkProvenances] = await Promise.all([
    buildCandidates(db, visite),
    db.getAllAsync(`SELECT section_code,cle,valeur FROM champs_visite WHERE visite_id=?`, [visite.id]),
    db.getAllAsync(`SELECT section_code,cle,avis,commentaire FROM controles_visite WHERE visite_id=?`, [visite.id]),
    db.getAllAsync(`SELECT * FROM reseaux WHERE visite_id=? ORDER BY ordre,id`, [visite.id]),
    db.getAllAsync(`SELECT * FROM compteurs WHERE visite_id=? ORDER BY id`, [visite.id]),
    db.getAllAsync(`SELECT p.entite_id,p.details_json FROM provenances p JOIN reseaux r ON r.id=p.entite_id WHERE p.entite_type='reseau' AND p.origine='api_symfony' AND r.visite_id=? ORDER BY p.importe_le DESC`, [visite.id]),
  ]);
  const fieldMap = new Map(fields.map((row) => [`${row.section_code}||${row.cle}`, row.valeur]));
  const controlMap = new Map(controls.map((row) => [`${row.section_code}||${row.cle}`, row]));
  const remoteNetworkGroups = visite.trame_id === 'icpe_v1'
    ? categories.flatMap((category) => (Array.isArray(category?.sousCategories) ? category.sousCategories : []).filter(isNetworkGroup).map((subCategory) => ({ category, subCategory }))) : [];
  const networkAssignments = mapNetworksToRemoteGroups(networks, remoteNetworkGroups, networkProvenances, issues);
  const result = [];
  const seenRemoteBranches = new Set();
  let ordinal = 0;
  for (const category of categories) {
    for (const subCategory of Array.isArray(category?.sousCategories) ? category.sousCategories : []) {
      const networkGroup = visite.trame_id === 'icpe_v1' && isNetworkGroup(subCategory);
      const network = networkGroup ? networkAssignments.get(remoteNetworkKey(category?.id, subCategory?.id)) : null;
      for (const criterion of Array.isArray(subCategory?.criteres) ? subCategory.criteres : []) {
        const path = `Critère « ${clean(criterion?.nom) || criterion?.id || ordinal + 1} »`;
        const categorieId = apiId(category?.id, `${path} / catégorie`, issues);
        const sousCategorieId = apiId(subCategory?.id, `${path} / sous-catégorie`, issues);
        const critereId = apiId(criterion?.id, `${path} / identifiant`, issues);
        if (categorieId && sousCategorieId && critereId) {
          const remoteBranch = `${categorieId}:${sousCategorieId}:${critereId}`;
          if (seenRemoteBranches.has(remoteBranch)) issues.push(`${path} : branche Intranet dupliquée (${remoteBranch}). Actualise la préparation avant l’envoi.`);
          else seenRemoteBranches.add(remoteBranch);
        }
        const applicable = criterion?.avisApplicable === true;
        let avis = null;
        let commentaire = '/';
        const column = networkGroup ? networkColumn(criterion?.nom) : null;
        const candidate = column ? null : findCandidate(candidates, criterion, category?.nom, subCategory?.nom);

        if (column) {
          if (network) commentaire = exactComment(network[column], issues, `${path} / commentaire`);
          if (applicable) issues.push(`${path} : critère réseau déclaré avec avis, mapping non supporté sans ambiguïté.`);
        } else if (!candidate) {
          issues.push(`${path} : aucun champ METRA correspondant de façon sûre.`);
        } else if (applicable) {
          const control = controlMap.get(`${candidate.sectionCode}||${candidate.cle}`);
          const currentAvis = nullable(control?.avis);
          if (!INTRANET_AVIS.includes(currentAvis)) issues.push(`${path} : avis obligatoire (${INTRANET_AVIS.join(', ')}).`);
          else avis = currentAvis;
          commentaire = exactComment(control?.commentaire, issues, `${path} / commentaire`);
        } else {
          let value;
          if (visite.trame_id === 'icpe_v1' && candidate.panelId === 'p-releves' && /^index\b/.test(normalize(candidate.label))) {
            value = counterValue(counters, criterion, candidate);
            if (value === undefined) issues.push(`${path} : compteur correspondant introuvable ou ambigu.`);
          } else value = fieldMap.get(`${candidate.sectionCode}||${candidate.cle}`);
          commentaire = exactComment(value, issues, `${path} / commentaire`);
        }
        result.push({ categorieId, sousCategorieId, critereId, avis: applicable ? avis : null, commentaire });
        ordinal += 1;
      }
    }
  }
  if (!result.length) issues.push('Trame Intranet : la liste des critères est vide.');
  return result;
}

async function buildRemarks(db, visiteId, issues) {
  const rows = await db.getAllAsync(`SELECT * FROM remarques WHERE visite_id=? ORDER BY cree_le,id`, [visiteId]);
  return rows.map((row, index) => {
    const prefix = `Réserve ${index + 1}`;
    const explicitDateReserve = nullable(row.intranet_date_reserve);
    const dateReserve = explicitDateReserve || dateOnly(row.cree_le);
    if (!dateReserve || !validDate(dateReserve)) issues.push(`${prefix} / date réserve : date YYYY-MM-DD requise.`);
    const delai = nullable(row.intranet_delai);
    if (delai && !validDate(delai)) issues.push(`${prefix} / échéance : format YYYY-MM-DD requis.`);
    const progress = nullable(row.intranet_etat_avancement);
    if (progress && !INTRANET_PROGRESS.includes(progress)) issues.push(`${prefix} / état d’avancement invalide.`);
    return {
      poste: limited(row.poste, 50, `${prefix} / poste`, issues, { required: true }),
      prestation: limited(row.prestation, 765, `${prefix} / prestation`, issues, { required: true }),
      dateReserve,
      delai,
      etatAvancement: progress,
      estimatif: limited(row.estimatif, 128, `${prefix} / estimatif`, issues),
    };
  });
}

async function buildMaterials(db, visiteId, sourceMaterialCount, issues) {
  const rows = await db.getAllAsync(`SELECT m.*,
      (SELECT a.valeur FROM attributs_libres a WHERE a.entite_type='equipement' AND a.entite_id=m.equipement_id AND a.cle='api_symfony.etat_reference' ORDER BY a.modifie_le DESC LIMIT 1) AS intranet_reference_state
    FROM materiel m WHERE m.visite_id=? ORDER BY m.cree_le,m.id`, [visiteId]);
  const result = rows.map((row, index) => {
    const prefix = `Matériel ${index + 1}`;
    const currentState = nullable(row.etat);
    const referenceState = nullable(row.intranet_reference_state);
    const state = currentState || (INTRANET_MATERIAL_STATES.includes(referenceState) ? referenceState : null);
    if (state && !INTRANET_MATERIAL_STATES.includes(state)) {
      issues.push(`${prefix} / état « ${state} » non accepté par l’Intranet. Choisir ${INTRANET_MATERIAL_STATES.join(', ')} ou laisser vide.`);
    }
    return {
      categorie: limited(row.categorie, 255, `${prefix} / catégorie`, issues, { required: true }),
      nombre: limited(row.nombre, 255, `${prefix} / nombre`, issues, { required: true }),
      designation: limited(row.designation, 255, `${prefix} / désignation`, issues, { required: true }),
      numeroMateriel: limited(row.numero_materiel, 255, `${prefix} / numéro matériel`, issues),
      reseauDesservi: limited(row.reseau_desservi, 255, `${prefix} / réseau desservi`, issues),
      marque: limited(row.marque, 255, `${prefix} / marque`, issues),
      modele: limited(row.modele, 255, `${prefix} / modèle`, issues),
      caracteristiques: limited(row.caracteristiques, 255, `${prefix} / caractéristiques`, issues),
      annee: limited(row.annee, 128, `${prefix} / année`, issues),
      etat: state && INTRANET_MATERIAL_STATES.includes(state) ? state : state,
    };
  });
  const sourceCount = Number(sourceMaterialCount || 0);
  const removedSourceMaterialCount = Math.max(0, sourceCount - result.length);
  return {
    materiels: result,
    destructiveMaterialChange: removedSourceMaterialCount > 0,
    destructiveMaterialClear: result.length === 0 && sourceCount > 0,
    removedSourceMaterialCount,
    sourceMaterialCount: sourceCount,
  };
}

async function buildNotes(db, visiteId, issues) {
  const row = await db.getFirstAsync(`SELECT contenu FROM notes WHERE visite_id=?`, [visiteId]);
  const value = nullable(row?.contenu);
  if (!value) return [];
  if (value.length > 1000) issues.push(`Note : ${value.length} caractères, maximum 1000.`);
  return [{ contenu: value }];
}

export class IntranetVisitValidationError extends Error {
  constructor(issues, details = {}) {
    super(issues.length === 1 ? issues[0] : `${issues.length} éléments empêchent l’envoi vers l’Intranet.`);
    this.name = 'IntranetVisitValidationError';
    this.code = 'local_validation_failed';
    this.issues = issues;
    Object.assign(this, details);
  }
}

export async function buildIntranetVisitPayload(visiteId, envoiId) {
  const issues = [];
  const db = await getDb();
  const visite = await db.getFirstAsync(`SELECT v.*,s.client_id FROM visites v JOIN sites s ON s.id=v.site_id WHERE v.id=?`, [visiteId]);
  if (!visite) throw new IntranetVisitValidationError(['Visite introuvable.']);
  if (!visite.api_remote_local_id) throw new IntranetVisitValidationError(['Cette visite n’est pas encore rattachée à une destination Intranet. Choisis le client, le site et le local depuis le bloc Synchronisation Intranet.']);
  const context = await frozenContext(db, visite);
  if (context?.historical) throw new IntranetVisitValidationError(['Une visite historique importée depuis l’Intranet ne peut jamais être renvoyée comme nouvelle visite.']);
  if (!context?.details) throw new IntranetVisitValidationError(['Référence Intranet figée absente. Associe ou réassocie cette visite à un local Intranet disposant d’une préparation à jour.']);
  const details = context.details;
  if (visite.trame_id === 'pre_allumage') {
    const localCount = await db.getFirstAsync(`SELECT COUNT(*) AS n FROM pre_allumage_locaux WHERE visite_id=?`, [visite.id]);
    if (Number(localCount?.n || 0) > 1) issues.push('Pré-allumage : cette visite METRA contient plusieurs locaux alors que l’API Intranet exige une visite par local. Aucun rapprochement automatique n’est effectué.');
  }
  const remoteClientId = await resolveRemoteClientId(db, visite, details, issues);
  const localId = apiId(visite.api_remote_local_id, 'Local', issues);
  const trameId = remoteTrameId(visite, details, issues);
  const derniereVisiteIdSource = sourceVisitId(visite, details, issues);
  const date = dateOnly(visite.date_visite);
  if (!date || !validDate(date)) issues.push('Date de visite : format YYYY-MM-DD requis.');
  const status = visite.statut === 'terminee' || visite.statut === 'exportee' ? 'Terminé' : 'En cours';
  const sourceMaterials = Array.isArray(details?.materiels)
    ? details.materiels.length
    : Number(details?.preparationMeta?.materialCount ?? ((await db.getFirstAsync(
      `SELECT material_count FROM api_local_links WHERE remote_local_id=?`, [String(visite.api_remote_local_id)]
    ))?.material_count ?? 0));
  const [criteres, remarques, materialData, notes] = await Promise.all([
    buildCriteria(db, visite, details, issues), buildRemarks(db, visite.id, issues),
    buildMaterials(db, visite.id, sourceMaterials, issues), buildNotes(db, visite.id, issues),
  ]);
  const expectedCriteria = countRemoteCriteria(details?.trame);
  if (criteres.length !== expectedCriteria) issues.push(`Critères : ${criteres.length}/${expectedCriteria}, la trame Intranet doit être envoyée intégralement.`);
  if (criteres.length > 2000) issues.push(`Critères : ${criteres.length}, maximum 2000 par visite.`);
  if (remarques.length > 500) issues.push(`Réserves : ${remarques.length}, maximum 500 par visite.`);
  if (materialData.materiels.length > 1000) issues.push(`Matériels : ${materialData.materiels.length}, maximum 1000 par visite.`);
  if (notes.length > 100) issues.push(`Notes : ${notes.length}, maximum 100 par visite.`);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(envoiId || ''))) issues.push('envoiId : UUID v4 requis.');

  const visitWire = { localId, trameId, derniereVisiteIdSource, date, statut: status, criteres, remarques, materiels: materialData.materiels, notes };
  const payload = { envoiId: String(envoiId || ''), visites: [visitWire] };
  const serialized = JSON.stringify(payload);
  const payloadBytes = utf8ByteLength(serialized);
  if (payloadBytes > INTRANET_MAX_BODY_BYTES) issues.push(`Envoi trop volumineux : ${(payloadBytes / 1048576).toFixed(2)} Mio, maximum 5 Mio.`);
  if (issues.length) throw new IntranetVisitValidationError(issues, {
    destructiveMaterialChange: materialData.destructiveMaterialChange,
    destructiveMaterialClear: materialData.destructiveMaterialClear,
    removedSourceMaterialCount: materialData.removedSourceMaterialCount,
    sourceMaterialCount: materialData.sourceMaterialCount,
    remoteClientId,
  });
  return {
    remoteClientId: String(remoteClientId), payload, serialized, payloadBytes,
    destructiveMaterialChange: materialData.destructiveMaterialChange,
    destructiveMaterialClear: materialData.destructiveMaterialClear,
    removedSourceMaterialCount: materialData.removedSourceMaterialCount,
    sourceMaterialCount: materialData.sourceMaterialCount,
    summary: { criteria: criteres.length, remarks: remarques.length, materials: materialData.materiels.length, notes: notes.length,
      photosExcluded: true, conclusionExcluded: true },
  };
}

export function inspectIntranetVisitWirePayload(serialized) {
  const parsed = JSON.parse(serialized);
  return { parsed, payloadBytes: utf8ByteLength(serialized) };
}
