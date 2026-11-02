import { getDb } from './db.js';
import { obtenirTrame } from './trameRegistry.js';
import { construireRemarDynamiquePourRapport, remarDynamicOwnsMapping } from './remarDynamicExportDb.js';
import { formaterReleves, formaterTemperatureGroupee } from './releveMultiligne.js';

export const INTRANET_MAX_BODY_BYTES = 5 * 1024 * 1024;
export const INTRANET_AVIS = Object.freeze(['S.O', 'S', 'N.S', 'N.R', 'N.V']);
export const INTRANET_PROGRESS = Object.freeze(['Non réalisé', 'Devis émis', 'En cours', 'Terminé', 'Annulé']);
export const INTRANET_MATERIAL_STATES = Object.freeze(['Hors service', 'Vétuste', 'Moyen', 'Bon', 'Neuf']);

function clean(value) { return value == null ? '' : String(value).trim(); }
function nullable(value) { const v = clean(value); return v || null; }
function normalize(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
// Les panneaux spécialisés écrivent leurs champs sous des codes métier stables
// différents des slugs de l'interface. Utilisés par ICPE, RCU et trames futures
// reprenant ces panneaux, sans exception sur le nom de trame.
const SPECIAL_SECTION_STORAGE_CODES = Object.freeze({
  'p-releves': Object.freeze({
    'releves des compteurs et manometres': 'releves.compteurs',
    'temperatures et ph': 'releves.temperatures',
  }),
  'p-regulation': Object.freeze({
    'cascade chaudieres': 'regulation.cascade',
    'reseau ecs': 'regulation.reseau_ecs',
  }),
});
function genericSectionCode(panelId, section) {
  return panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
}
function sectionCode(panelId, section) {
  return SPECIAL_SECTION_STORAGE_CODES[panelId]?.[normalize(section)] ||
    genericSectionCode(panelId, section);
}
function candidateStorageCodes(definition, panelId, section, field) {
  // Le modèle Excel peut déclarer le code de stockage historique : on le
  // conserve comme compatibilité sans remplacer la clé utilisée par l'écran.
  const excelCodes = (definition?.excel?.fieldMappings || [])
    .filter((mapping) => mapping.panelId === panelId && mapping.section === section &&
      mapping.cle === field.cle && mapping.type === (field.type || 'champ'))
    .map((mapping) => mapping.sectionCode).filter(Boolean);
  return [...new Set([sectionCode(panelId, section), ...excelCodes,
    genericSectionCode(panelId, section)])];
}
function candidateStoredValue(store, candidate, issues, path) {
  const codes = candidate?.storageCodes || [candidate?.sectionCode];
  const present = codes.map((code) => ({ code, value: store.get(`${code}||${candidate.cle}`) }))
    .filter((item) => item.value != null);
  // Deux versions de la même rubrique ne doivent jamais s'écraser entre elles.
  const significant = present.filter(({ value }) =>
    typeof value === 'object'
      ? clean(value.avis) !== '' || (clean(value.commentaire) !== '' && clean(value.commentaire) !== '/')
      : clean(value) !== '' && clean(value) !== '/');
  const fingerprints = [...new Set(significant.map(({ value }) =>
    typeof value === 'object' ? JSON.stringify([clean(value.avis), clean(value.commentaire)])
      : clean(value)))];
  if (fingerprints.length > 1) {
    issues.push(`${path} : valeurs divergentes pour la même rubrique MÉTRA (${significant.map((x) => x.code).join(' / ')}). Vérifie la source avant envoi.`);
    return null;
  }
  return significant[0]?.value ?? present[0]?.value ?? null;
}
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

/**
 * P0 avant l'API Symfony V2 : le POST historique remplace intégralement
 * ListingMateriel. Vérification par multiensemble de TOUTES les colonnes
 * métier de la préparation figée, pas par simple nombre de lignes.
 * Les champs id ne sont volontairement pas utilisés : l'API POST V1 ne
 * transporte pas les IDs et Symfony les régénère.
 */
const MATERIAL_SNAPSHOT_FIELDS = Object.freeze([
  'categorie', 'nombre', 'designation', 'numeroMateriel', 'reseauDesservi',
  'marque', 'modele', 'caracteristiques', 'annee', 'etat',
]);
const MATERIAL_SNAPSHOT_ALIASES = Object.freeze({
  numeroMateriel: 'numero_materiel', reseauDesservi: 'reseau_desservi',
});
function materialSnapshotValue(row, key) {
  return clean(row?.[key] ?? row?.[MATERIAL_SNAPSHOT_ALIASES[key]]).normalize('NFC');
}
function materialSnapshotSignature(row) {
  return JSON.stringify(MATERIAL_SNAPSHOT_FIELDS.map((key) => materialSnapshotValue(row, key)));
}

/**
 * Correction non destructive des anciennes importations : le catalogue
 * a parfois canonisé GRUNDFOS -> Grundfos dans la ligne de visite.
 * Reprendre STRICTEMENT la graphie d'origine Intranet si les neuf autres
 * colonnes métier sont identiques et si la marque ne diffère que par une
 * variante typographique (casse/accents). Aucune modification SQLite.
 * Une véritable modification de modèle, état, quantité, numéro ou marque
 * reste bloquante jusqu'à la mutation V2 par ID stable.
 */
export function restoreReferenceEquivalentBrands(reference, outgoing) {
  if (!Array.isArray(reference) || !Array.isArray(outgoing)) return outgoing;
  const available = new Map();
  reference.forEach((row, i) => {
    const signature = materialSnapshotSignature(row);
    if (!available.has(signature)) available.set(signature, []);
    available.get(signature).push(i);
  });
  const consumed = new Set();
  const exactMatches = new Set();
  outgoing.forEach((row, i) => {
    const candidates = available.get(materialSnapshotSignature(row)) || [];
    const refIndex = candidates.find((index) => !consumed.has(index));
    if (refIndex !== undefined) { consumed.add(refIndex); exactMatches.add(i); }
  });
  const signatureSansMarque = (row) => JSON.stringify([
    ...MATERIAL_SNAPSHOT_FIELDS.filter((key) => key !== 'marque').map((key) => materialSnapshotValue(row, key)),
    normalize(materialSnapshotValue(row, 'marque')),
  ]);
  const compatible = new Map();
  reference.forEach((row, index) => {
    if (consumed.has(index) || !materialSnapshotValue(row, 'marque')) return;
    const key = signatureSansMarque(row);
    if (!compatible.has(key)) compatible.set(key, []);
    compatible.get(key).push(index);
  });
  return outgoing.map((row, index) => {
    if (exactMatches.has(index)) return row;
    const candidates = compatible.get(signatureSansMarque(row)) || [];
    const refIndex = candidates.find((i) => !consumed.has(i));
    if (refIndex === undefined) return row;
    const brand = materialSnapshotValue(reference[refIndex], 'marque');
    if (!brand || normalize(brand) !== normalize(materialSnapshotValue(row, 'marque'))) return row;
    consumed.add(refIndex);
    return { ...row, marque: brand };
  });
}
export function inspectIntranetMaterialSnapshot(reference, outgoing, declaredCount = null) {
  const issues = [];
  if (!Array.isArray(reference)) {
    issues.push('Matériel Intranet : liste de référence complète absente. Actualise la préparation du local ; envoi bloqué pour éviter un effacement.');
    return { safe: false, issues, referenceCount: null, outgoingCount: Array.isArray(outgoing) ? outgoing.length : null };
  }
  if (!Array.isArray(outgoing)) {
    issues.push('Matériel Intranet : liste à envoyer absente ou invalide.');
    return { safe: false, issues, referenceCount: reference.length, outgoingCount: null };
  }
  if (declaredCount != null && String(declaredCount).trim() !== '') {
    const declared = Number(declaredCount);
    if (!Number.isSafeInteger(declared) || declared < 0 || declared !== reference.length) {
      issues.push('Matériel Intranet : quantité de référence incohérente ; actualise la préparation avant envoi.');
    }
  }
  const remaining = new Map();
  for (const row of reference) {
    const fingerprint = materialSnapshotSignature(row);
    remaining.set(fingerprint, (remaining.get(fingerprint) || 0) + 1);
  }
  const unmatchedOutgoing = [];
  for (const row of outgoing) {
    const fingerprint = materialSnapshotSignature(row);
    const left = remaining.get(fingerprint) || 0;
    if (left > 0) remaining.set(fingerprint, left - 1);
    else unmatchedOutgoing.push(row);
  }
  const missingRows = reference.filter((row) => {
    const fingerprint = materialSnapshotSignature(row);
    const left = remaining.get(fingerprint) || 0;
    if (!left) return false;
    remaining.set(fingerprint, left - 1);
    return true;
  });
  const missing = missingRows.length;
  const samples = missingRows.slice(0, 3).map((row) => {
    const identity = [row.designation, row.numeroMateriel || row.numero_materiel, row.marque].map(clean).filter(Boolean).join(' · ') || 'Équipement sans désignation';
    const number = materialSnapshotValue(row, 'numeroMateriel');
    const candidates = number
      ? unmatchedOutgoing.filter((candidate) => materialSnapshotValue(candidate, 'numeroMateriel') === number)
      : [];
    const exactCandidate = candidates.length === 1 ? candidates[0] : null;
    const changed = exactCandidate ? MATERIAL_SNAPSHOT_FIELDS.filter((field) =>
      materialSnapshotValue(row, field) !== materialSnapshotValue(exactCandidate, field)) : [];
    return `« ${identity} »${changed.length ? ` (écart : ${changed.join(', ')})` : ' (absent ou identité différente)'}`;
  });
  if (missing) {
    issues.push(`Matériel Intranet : ${missing}/${reference.length} ligne(s) anciennes absentes ou modifiées parmi ${outgoing.length} envoyées. ${samples.join(' ; ')}. L'API V1 remplace le patrimoine complet : envoi bloqué jusqu'au contrat serveur de mutation par identifiant stable.`);
  }
  // Une liste V1 peut être complète mais contenir des répétitions supplémentaires
  // du même équipement historique. Le contrôle précédent n'y voyait aucun
  // manque et laissait partir 28 références devenues 81 lignes. Ne jamais
  // fusionner ni supprimer sans identité stable : refuser le POST dangereux.
  // Seule la casse / les accents de la marque sont neutralisés, jamais la
  // désignation, le numéro, la quantité, l'état ou le modèle.
  const comparable = (row) => JSON.stringify(MATERIAL_SNAPSHOT_FIELDS.map((field) =>
    field === 'marque' ? normalize(materialSnapshotValue(row, field)) : materialSnapshotValue(row, field)));
  const referenceCounts = new Map();
  const outgoingCounts = new Map();
  for (const row of reference) {
    const key = comparable(row);
    referenceCounts.set(key, (referenceCounts.get(key) || 0) + 1);
  }
  for (const row of outgoing) {
    const key = comparable(row);
    if (!outgoingCounts.has(key)) outgoingCounts.set(key, { count: 0, row });
    outgoingCounts.get(key).count += 1;
  }
  const repeated = [];
  let duplicateCount = 0;
  for (const [key, group] of outgoingCounts.entries()) {
    const expected = referenceCounts.get(key) || 0;
    const maxAllowed = Math.max(1, expected); // une ligne nouvelle distincte reste admissible
    if (group.count > maxAllowed) {
      duplicateCount += group.count - maxAllowed;
      repeated.push(`« ${clean(group.row.designation) || 'Équipement sans désignation'} » ×${group.count} (référence : ${expected})`);
    }
  }
  if (duplicateCount) {
    issues.push(`Matériel Intranet : ${duplicateCount} ligne(s) répétées en supplément de la référence, dont ${repeated.slice(0, 3).join(' ; ')}. Refus avant POST pour éviter une multiplication des équipements dans l'Intranet. Nettoyage uniquement après rapprochement des identifiants physiques.`);
  }
  return { safe: issues.length === 0, issues, referenceCount: reference.length, outgoingCount: outgoing.length, missing, samples, duplicateCount };
}

/** Contrôle des anciennes files d'attente avant leur éventuel premier POST.
 * Ne modifie JAMAIS payload_json ni envoiId : le rejeu demeure octet-identique.
 */
export async function validateQueuedVisitMaterialSnapshot(visiteId, serializedPayload) {
  const db = await getDb();
  const visit = await db.getFirstAsync('SELECT id,api_remote_local_id FROM visites WHERE id=?', [String(visiteId)]);
  const frozen = visit ? await frozenContext(db, visit) : null;
  let parsed = null;
  try { parsed = JSON.parse(serializedPayload); } catch {}
  const wire = Array.isArray(parsed?.visites) && parsed.visites.length === 1 ? parsed.visites[0] : null;
  const issues = [];
  if (!visit || frozen?.historical || !frozen?.details)
    issues.push('Matériel Intranet : référence figée de la visite absente ou historique.');
  if (!wire || String(wire.localId) !== String(visit?.api_remote_local_id))
    issues.push('Matériel Intranet : le local du JSON gelé ne correspond plus au local de la visite.');
  if (frozen?.details && wire) {
    const checked = inspectIntranetMaterialSnapshot(
      frozen.details.materiels, wire.materiels, frozen.details?.preparationMeta?.materialCount
    );
    issues.push(...checked.issues);
  }
  if (issues.length) {
    const error = new IntranetVisitValidationError(issues);
    error.code = 'material_snapshot_unsafe';
    error.status = 422; // Bloquage local, jamais une réponse HTTP serveur.
    throw error;
  }
  return true;
}

/**
 * Les dix « Opération à effectuer » du réseau de chaleur sont des synthèses
 * de réserves (Primaire/Secondaire × P2/P3/Conformité/Amélioration/Remarque),
 * et non des champs de saisie. Respecter le regroupement de l'Excel RCU.
 */
// Les libellés de présentation Symfony peuvent changer sans changer la
// catégorie métier. Alias stricts, cantonnés à la branche de synthèse RCU
// déclarée par le référentiel de trame (pas de fuzzy matching global).
const HEAT_SUMMARY_CRITERION_ALIASES = Object.freeze({
  P2: Object.freeze(['P2', 'Entretien P2', 'Entretien']),
  P3: Object.freeze(['P3', 'Travaux P3', 'Garantie totale']),
  Conformite: Object.freeze(['Conformité', 'Mise en conformité', 'Travaux de conformité']),
  Amelioration: Object.freeze(['Amélioration', 'Améliorations', 'Travaux d’amélioration']),
  Remarque: Object.freeze([
    'Remarque', 'Remarques', 'Remarque particulière', 'Remarques particulières',
    'Observation', 'Observations', 'Remarque générale', 'Remarques générales',
  ]),
});
function resumeReseauCategorie(criterionName, summaryRows) {
  const nom = normalize(criterionName);
  if (!nom || !summaryRows) return null;
  const matches = Object.keys(summaryRows).filter((key) =>
    (HEAT_SUMMARY_CRITERION_ALIASES[key] || [key]).some((alias) => normalize(alias) === nom));
  return matches.length === 1 ? matches[0] : null;
}
function categorieResumeReseau(poste) {
  // Même classement et même ordre de priorité que dans excelExport.js.
  const p = normalize(poste);
  if (p.includes('p2') || p.includes('entretien')) return 'P2';
  if (p.includes('p3') || p.includes('garantie totale')) return 'P3';
  if (p.includes('conform')) return 'Conformite';
  if (p.includes('amelior')) return 'Amelioration';
  return 'Remarque';
}
function criterionResumeReseau(definition, criterionName, categoryName, subCategoryName) {
  // Chemin serveur réel : « P2 » [REMARQUES SUR LE PRIMAIRE > Opération à effectuer].
  const sub = normalize(subCategoryName);
  if (sub !== 'operation a effectuer' && sub !== 'operations a effectuer') return null;
  const match = normalize(categoryName).match(/^remarques? (?:sur le|du) (primaire|secondaire)$/);
  if (!match) return null;
  const perimetre = match[1] === 'primaire' ? 'Primaire' : 'Secondaire';
  const summaryRows = definition?.excel?.heatNetwork?.summaryRows?.[perimetre];
  const categorie = resumeReseauCategorie(criterionName, summaryRows);
  // Seul le modèle métier explicitement publié autorise le rapprochement.
  if (!categorie || !Number.isInteger(summaryRows?.[categorie])) return null;
  return { perimetre, categorie };
}
function valueResumeReseau(remarques, mapping) {
  const textes = (remarques || [])
    .filter((r) => r.perimetre === mapping.perimetre && categorieResumeReseau(r.poste) === mapping.categorie)
    .map((r) => clean(r.prestation)).filter(Boolean);
  return { avis: textes.length ? 'N.S' : 'S.O',
    commentaire: textes.length ? textes.join('\n\n') : 'Sans Objet.' };
}

/**
 * Le référentiel de trame, et non son id, déclare les sous-systèmes disponibles.
 * La même règle fonctionne pour une trame intégrée, nouvelle ou personnalisée.
 */
function mappingCapabilities(definition) {
  const specials = new Set(definition?.ui?.specialPanels || []);
  const dynamic = new Set(Object.values(definition?.ui?.dynamicPanels || {}));
  const fields = Object.values(definition?.ui?.panels || {}).flatMap((sections) =>
    Object.values(sections || {}).flatMap((items) => Array.isArray(items) ? items : []));
  return {
    networks: Boolean(definition?.intranet?.networks === true ||
      definition?.excel?.networks?.exportOffsets || specials.has('p-regulation') ||
      dynamic.has('networks')),
    meters: Boolean(definition?.intranet?.meters === true || specials.has('p-releves') ||
      dynamic.has('meters') ||
      fields.some((field) => field?.numericIndex === true || field?.intranetSource === 'compteur')),
  };
}
export function inspectIntranetTrameCapabilities(trameId) {
  return mappingCapabilities(obtenirTrame(trameId));
}

function buildStaticCandidates(localTrameId) {
  const definition = obtenirTrame(localTrameId);
  const candidates = [];
  const specialPanels = new Set(definition?.ui?.specialPanels || []);
  for (const [panelId, sections] of Object.entries(definition?.ui?.panels || {})) {
    for (const [section, fields] of Object.entries(sections || {})) {
      for (const field of fields || []) {
        if (!field?.cle || field.hiddenInApp === true) continue;
        const aliases = [field.label, ...(Array.isArray(field.intranetAliases) ? field.intranetAliases : [])]
          .filter((value) => typeof value === 'string').map(normalize).filter(Boolean);
        const storageCodes = candidateStorageCodes(definition, panelId, section, field);
        candidates.push({ panelId, section, sectionCode: storageCodes[0], storageCodes, cle: field.cle,
          label: field.label || field.cle, type: field.type || 'champ', key: normalize(field.cle),
          aliases: [...new Set(aliases)], numericIndex: field.numericIndex === true,
          meterSource: field.intranetSource === 'compteur',
          specialPanel: specialPanels.has(panelId) || definition?.ui?.dynamicPanels?.[panelId] === 'meters',
          temperature: normalize(field.numeric?.unit) === 'c' || /temperature/.test(normalize(section)),
          sectionKey: normalize(section), panelKey: normalize(definition?.ui?.labels?.[panelId] || panelId) });
      }
    }
  }
  return candidates;
}

async function buildCandidates(db, visite) {
  const candidates = buildStaticCandidates(visite.trame_id);
  const definition = obtenirTrame(visite.trame_id);
  // Les formulaires à rubriques modulaires sont reconnus par leur structure.
  if (!Object.keys(definition?.ui?.panels || {}).some((id) => id.startsWith('p-pa-'))) return candidates;
  const rows = await db.getAllAsync(`
    SELECT r.panel_id,r.section_code,r.nom AS section_name,c.cle_stockage,c.libelle,c.type_code
    FROM pre_allumage_champs c JOIN pre_allumage_rubriques r ON r.id=c.rubrique_id
    WHERE r.visite_id=? ORDER BY r.ordre,c.ordre`, [visite.id]);
  for (const row of rows || []) {
    candidates.push({ panelId: row.panel_id, section: row.section_name, sectionCode: row.section_code,
      cle: row.cle_stockage, label: row.libelle, type: row.type_code || 'champ', key: normalize(row.libelle || row.cle_stockage),
      sectionKey: normalize(row.section_name), panelKey: normalize(definition?.ui?.labels?.[row.panel_id] || row.panel_id),
      storageCodes: [row.section_code], dynamic: true });
  }
  return candidates;
}

const PANEL_CATEGORY_CONTEXTS = Object.freeze({
  'p-conf-local': ['local'],
  'p-conf-energie': ['energie'],
  'p-conf-chauffage': ['chauffage'],
  'p-conf-ecs': ['ecs', 'eau chaude sanitaire', 'sanitaire'],
  'p-conf-adouc': ['adoucisseur', 'adoucissement'],
});

function categoryPanelBonus(candidate, categoryName) {
  const tokens = PANEL_CATEGORY_CONTEXTS[candidate?.panelId];
  if (!tokens?.length) return 0;
  const category = normalize(categoryName);
  if (!category) return 0;
  return tokens.some((token) => category.includes(normalize(token))) ? 40 : 0;
}

function preferredType(criterion) { return criterion?.avisApplicable === true ? 'controle' : 'champ'; }
function candidateScore(candidate, criterion, categoryName, subCategoryName) {
  let score = candidate.type === preferredType(criterion) ? 8 : 0;
  // Des panneaux métier de différentes trames peuvent partager un libellé
  // (chauffage, ECS, etc.). La catégorie
  // Intranet est alors le discriminant métier fort. En son absence on conserve
  // le fail-safe historique et METRA refuse de deviner.
  score += categoryPanelBonus(candidate, categoryName);
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
/**
 * REMAR CLASSIQUE (Symfony 16) expose les reseaux chauffage sous
 * « INFORMATION GENERALE CHAUFFERIE / Réseaux / Réseau 1..5 ».
 * Les mêmes noms existent dans la production de froid de METRA : la
 * sous-catégorie « Réseaux » ne suffit PAS à désambiguïser, seule la
 * catégorie métier distante permet de décider sans deviner.
 */
function scopeRemarNumberedNetworkCandidates(matches, criterionKey, categoryName, subCategoryName) {
  if(!/^reseau [1-5]$/.test(criterionKey)) return matches;
  const heating=matches.filter(c=>c.panelId==='p-remar-reseaux');
  const cooling=matches.filter(c=>c.panelId==='p-remar-froid');
  if(!heating.length||!cooling.length)return matches;
  const category=normalize(categoryName);
  const section=normalize(subCategoryName);
  if(/(?:^| )(?:chaufferie|chauffage)(?: |$)/.test(category) ||
    section==='reseaux chauffage')return heating;
  if(/(?:^| )(?:froid|climatisation)(?: |$)/.test(category) ||
    section==='reseaux froid')return cooling;
  // Ne pas choisir au score une case frigorifique pour un chauffage.
  return [];
}
function findCandidate(candidates, criterion, categoryName, subCategoryName) {
  const key = normalize(criterion?.nom);
  if (!key) return null;
  const exact = candidates.filter((candidate) => candidate.key === key);
  // Priorité aux clés exactes. En leur absence, seuls les alias explicites
  // sont autorisés : jamais de rapprochement flou ou arbitraire.
  const matches = exact.length ? exact : candidates.filter((candidate) => candidate.aliases?.includes(key));
  const scoped=scopeRemarNumberedNetworkCandidates(matches,key,categoryName,subCategoryName);
  if (!scoped.length) return null;
  const ranked = scoped.map((candidate) => ({ candidate, score: candidateScore(candidate, criterion, categoryName, subCategoryName) }))
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 1 || ranked[0].score > ranked[1].score) return ranked[0].candidate;
  const same = ranked.filter((r) => r.score === ranked[0].score);
  const identity = new Set(same.map((r) => `${r.candidate.sectionCode}||${r.candidate.cle}||${r.candidate.type}`));
  return identity.size === 1 ? same[0].candidate : null;
}

export function inspectIntranetCriterionCandidate(localTrameId, criterion, categoryName, subCategoryName) {
  const candidates = buildStaticCandidates(localTrameId);
  const key = normalize(criterion?.nom);
  const exact = candidates.filter((candidate) => candidate.key === key);
  const matches = exact.length ? exact : candidates.filter((candidate) => candidate.aliases?.includes(key));
  const ranked = matches.map((candidate) => ({
    panelId: candidate.panelId,
    section: candidate.section,
    sectionCode: candidate.sectionCode,
    cle: candidate.cle,
    type: candidate.type,
    score: candidateScore(candidate, criterion, categoryName, subCategoryName),
  })).sort((a, b) => b.score - a.score);
  const resolved = findCandidate(candidates, criterion, categoryName, subCategoryName);
  return {
    resolved: resolved ? { panelId: resolved.panelId, section: resolved.section, sectionCode: resolved.sectionCode, cle: resolved.cle, type: resolved.type } : null,
    candidates: ranked,
  };
}

const NETWORK_COLUMNS = Object.freeze({
  't ext c': 't_ext_c', 't ext': 't_ext_c', 'temperature exterieure': 't_ext_c',
  't dep c': 't_dep_c', 't dep': 't_dep_c', 'temperature depart': 't_dep_c',
  'nom reseau': 'nom_reseau', 'nom du reseau': 'nom_reseau',
  'courbe de chauffe': 'courbe_de_chauffe', tnc: 'tnc',
  'consigne et programme horaire': 'consigne_programme_horaire',
  'consigne programme horaire': 'consigne_programme_horaire',
});
function networkColumn(name) { return NETWORK_COLUMNS[normalize(name)] || null; }
// Sous REMAR V1, les paramètres d'un réseau peuvent rester dans la même
// case « Réseau n » que son nom : aucune courbe/TNC n'est jetée.
// Les métadonnées de visite utilisent déjà les IDs et la date du POST :
// elles ne doivent pas exiger un deuxième critère dans le tableau Symfony.
function remarVisitMetadataCovered(definition,mapping) {
  if(mapping?.panelId!=='p-infos'||mapping?.type!=='champ')return false;
  const field=definition?.ui?.panels?.[mapping.panelId]?.[mapping.section]
    ?.find(f=>f.cle===mapping.cle&&f.type===mapping.type);
  return ['client','site','local','type','dateVisite'].includes(field?.meta);
}

// Destination de repli autorisée uniquement lorsqu'elle est nommée
// explicitement « Réseaux de chauffage » (ou synonyme métier exact),
// de type texte, et unique dans le référentiel réellement reçu de Symfony.
function remarNetworkSummaryTarget(categories) {
  const names=new Set(['reseaux','reseaux de chauffage','reseau chauffage',
    'circuits de chauffage','reseaux chauffage']);
  const matches=[];
  for(const cat of categories||[])for(const sub of cat.sousCategories||[])
    for(const c of sub.criteres||[]) {
      const label=normalize(c.nom);
      const context=normalize(clean(cat.nom)+' '+clean(sub.nom));
      // « Réseaux » seul est insuffisant sans contexte chauffage/distribution.
      const contextOk=label!=='reseaux' || /reseau|chauffage|circuit|distribution/.test(context);
      if(c.avisApplicable!==true && names.has(label) && contextOk)
        matches.push({criterion:c,category:cat,subCategory:sub});
    }
  return matches.length===1?matches[0]:null;
}

function remarNetworkText(row,index) {
  const title=clean(row?.nom_reseau)||'Réseau '+index;
  const attrs=[
    ['t_ext_c','T° extérieure','°C'],['t_dep_c','T° départ','°C'],
    ['courbe_de_chauffe','Courbe de chauffe',''],['tnc','TNC','°C'],
    ['consigne_programme_horaire','Consigne / programme',''],
  ].filter(([field])=>meaningfulRemote(row?.[field])!==null)
    .map(([field,label,unite])=>label+' : '+clean(row[field])+(unite?' '+unite:''));
  return [title,...attrs].join('\n');
}
function fixedRegulation(name) { const n = normalize(name); return n === 'cascade chaudieres' || n === 'reseau ecs'; }
function isNetworkGroup(subCategory) {
  if (fixedRegulation(subCategory?.nom)) return false;
  const criteria = Array.isArray(subCategory?.criteres) ? subCategory.criteres : [];
  const count = criteria.filter((criterion) => networkColumn(criterion?.nom)).length;
  return count >= 2 || (count >= 1 && /^(circuit|reseau)(\s|$)/.test(normalize(subCategory?.nom)));
}
function cleanCounterLabel(value) { return normalize(String(value || '').replace(/\s*\([^)]*\)\s*$/, '')); }
function isMeterCandidate(candidate, capabilities) {
  return capabilities.meters && candidate?.type === 'champ' &&
    (candidate.numericIndex === true || candidate.meterSource === true ||
      (candidate.specialPanel && /^(index|compteur|pression)\b/.test(candidate.key)));
}
function isTemperatureCandidate(candidate) {
  return candidate?.temperature === true || /temperature/.test(candidate?.sectionKey || '');
}
// Les compteurs REMAR supplémentaires ne rejoignent une destination officielle
// que lorsque nom ET unité en désignent sans ambiguïté une seule famille.
function destinationCompteurRemar(counter, destinations) {
  const stated=clean(counter?.destination);
  if (destinations.includes(stated)) return stated;
  if (stated && stated!=='supplementaire') return null;
  const label=normalize(counter?.label);
  const unit=normalize(clean(counter?.unite).replace(/[³]/g,'3'));
  const volume=unit==='m3', energy=unit==='mwh';
  const matches=[];
  const push=(name,ok)=>{if(ok&&destinations.includes(name))matches.push(name);};
  push('Compteur Gaz (m³)',/\bgaz\b/.test(label)&&volume);
  push("Compteur d'énergie (MWh)",/\b(energie|calorie|calorifique)\b/.test(label)&&energy);
  push('Compteur ECS (m³)',/\b(ecs|sanitaire)\b/.test(label)&&volume);
  push('Compteur appoint (m³)',/\bappoint\b/.test(label)&&volume);
  return matches.length===1?matches[0]:null;
}
function counterValue(counters, criterion, candidate) {
  const keys = new Set([cleanCounterLabel(criterion?.nom), cleanCounterLabel(candidate?.label), cleanCounterLabel(candidate?.cle)].filter(Boolean));
  // Destination explicite (migration 045) prioritaire : un compteur renommé
  // reste rattaché à son critère ; « supplementaire » n'est jamais envoyé.
  // Sans destination, la correspondance historique par libellé s'applique.
  const exact = counters.filter((counter) => {
    const destination = String(counter?.destination || '').trim();
    if (destination) return destination !== 'supplementaire' && destination === candidate?.cle;
    return keys.has(cleanCounterLabel(counter.label));
  });
  if (exact.length === 1) return { status: 'matched', value: exact[0].valeur };
  if (exact.length === 0) return { status: 'missing', value: null };
  // Plusieurs compteurs du même type : une seule cellule, une ligne
  // « nom : index unité » par compteur (lignes sans index ignorées).
  return { status: 'matched', value: formaterReleves(exact) || null };
}

function applicableAvis(value, issues, path) {
  const current = nullable(value);
  // Une conformité non renseignée n'est pas une erreur de structure : le
  // contrat Intranet prévoit explicitement N.V (non vérifié). Cela permet
  // l'envoi d'une visite partielle sans inventer un avis favorable ou défavorable.
  if (current == null) return 'N.V';
  if (!INTRANET_AVIS.includes(current)) {
    issues.push(`${path} : avis « ${current} » invalide (${INTRANET_AVIS.join(', ')}).`);
    return null;
  }
  return current;
}
function remoteNetworkKey(categoryId, subCategoryId) { return `${clean(categoryId)}:${clean(subCategoryId)}`; }
function numberedNetwork(name) {
  const match = normalize(name).match(/^(?:reseau|circuit) (?:n |no |numero )?([1-9]\d*)$/);
  return match ? Number(match[1]) : null;
}
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
    const expectedName = normalize(group.subCategory?.nom);
    const expectedNumber = numberedNetwork(group.subCategory?.nom);
    const matches = networks.filter((network) => !used.has(network.id) &&
      (normalize(network.nom_reseau) === expectedName ||
        (expectedNumber !== null && numberedNetwork(network.nom_reseau) === expectedNumber)));
    if (matches.length === 1) { assignments.set(key, matches[0]); used.add(matches[0].id); }
    else if (matches.length > 1) issues.push(`Réseau « ${clean(group.subCategory?.nom) || key} » : plusieurs noms de réseaux locaux correspondent.`);
  }
  const remainingGroups = groups.filter((group) => !assignments.has(remoteNetworkKey(group.category?.id, group.subCategory?.id)));
  const remainingNetworks = networks.filter((network) => !used.has(network.id));
  // Plusieurs réseaux de noms inconnus ne doivent jamais être associés
  // d'après leur simple position. Une seule paire restante reste univoque.
  if (remainingNetworks.length === 1 && remainingGroups.length === 1) {
    assignments.set(remoteNetworkKey(remainingGroups[0].category?.id, remainingGroups[0].subCategory?.id), remainingNetworks[0]);
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


/**
 * Symfony V1 a une seule case par critère : une collection de matériels ou
 * relevés de même rubrique devient un TEXTE multiligne, jamais plusieurs
 * critères avec le même identifiant distant. Les IDs restent en SQLite.
 * Les avis d'origines différentes restent visibles ligne par ligne.
 *
 * La matrice est tirée de REMAR_DETAIL (source multi-instance de la visite),
 * et non des « replacements » Excel limités à l'équipement de référence.
 */
function groupRemarDetailsForIntranet(projection, definition, issues) {
  if(!Array.isArray(projection?.details)||!projection.details.length)return null;
  const mappings=new Map((definition?.excel?.fieldMappings||[])
    .map(m=>[[m.panelId,m.section,m.cle].join('||'),m]));
  const parents=new Map(),children=new Map(),rows=[],groups=new Map();
  const key=(p,s,c)=>[p,s,c].join('||');
  const has=row=>[row.valeur,row.avis,row.commentaire].some(v=>meaningfulRemote(v)!==null);
  const report=(label,reason)=>issues.push('REMAR / '+label+' : '+reason);
  const add=(p,s,c,entry)=>{
    const mapping=mappings.get(key(p,s,c));
    if(!mapping){report(entry.label,'aucune case officielle pour '+p+' / '+s+' / '+c);return;}
    if(!has(entry)&&!entry.force)return;
    const identity=key(p,s,c);
    if(!groups.has(identity))groups.set(identity,{mapping,entries:[]});
    groups.get(identity).entries.push(entry);
  };
  for(const line of projection.details) {
    const row={family:clean(line[0]),parentId:clean(line[2]),parentName:clean(line[1]),
      name:clean(line[3]),id:clean(line[4]),type:clean(line[5]),
      panel:clean(line[6]),section:clean(line[7]),cle:clean(line[8]),
      valeur:clean(line[9]),avis:clean(line[10]),commentaire:clean(line[11]),
      inherited:line[13]==='Historique à confirmer',unite:clean(line[14])};
    if(!row.id||!row.type)continue;
    if(row.type==='equipement'){
      if(row.cle==='Identité patrimoine')parents.set(row.id,{name:row.name,family:row.family});
      else rows.push(row);
    }else if(['filtre_cta','mesure_cta','reseau_froid','temperature_chaufferie'].includes(row.type)){
      const childKey=row.type+'||'+row.id;
      if(!children.has(childKey))children.set(childKey,{
        type:row.type,name:row.name,id:row.id,parentId:row.parentId,
        family:row.family,unite:row.unite,values:new Map()});
      if(row.cle!=='Type / presence')children.get(childKey).values.set(row.cle,row);
    }else if(has(row) && !row.inherited)report(row.name,'type de donnée supplémentaire non associé à un champ officiel');
  }

  // Le nom de chaque CTA reste vérifiable, même lorsqu'aucun champ
  // technique n'est renseigné sur la CTA supplémentaire.
  const cta=[...parents].filter(([,p])=>p.family==='cta');
  const vmc=[...parents].filter(([,p])=>p.family==='vmc');
  const froid=[...parents].filter(([,p])=>p.family==='froid');
  cta.forEach(([,p])=>add('p-remar-cta','Informations techniques',
    'Désignation CTA',{label:p.name,valeur:p.name,force:true}));
  if(vmc.length) {
    const count=vmc.length;
    add('p-remar-vmc','Informations générales','Nombre de caissons',{
      label:'VMC',valeur:count===1?'1':count+' caissons : '+vmc.map(([,p])=>p.name).join(' ; '),force:true});
  }
  // Pour le froid, le champ Production froid porte déjà les observations
  // de chaque groupe ; si aucune n'existe, y préserver au moins son nom.
  for(const [id,p] of froid){
    const observed=rows.some(r=>r.id===id&&r.panel==='p-remar-froid'&&r.cle==='Production froid'&&!r.inherited&&has(r));
    if(!observed)add('p-remar-froid','Informations du site','Production froid',{
      label:p.name,valeur:'Équipement déclaré, production non renseignée',force:true});
  }

  for(const row of rows) {
    if(row.inherited||!has(row))continue;
    if(row.panel==='p-remar-vmc'&&row.cle==='Nombre de caissons')continue;
    if(row.panel==='p-remar-cta'&&row.cle==='Désignation CTA')continue;
    if(row.panel==='p-remar-froid'&&/^Réseau [1-9]\d*$/.test(row.cle))continue;
    const parent=parents.get(row.id);
    const label=parent?.name||row.name||row.id;
    if(!mappings.has(key(row.panel,row.section,row.cle))){
      report(label,'champ additionnel '+row.cle+' absent du modèle REMAR officiel');
      continue;
    }
    add(row.panel,row.section,row.cle,{...row,label});
  }

  const measureTargets={
    'air neuf':['Températures','Air neuf'],
    'apres recuperation':['Températures','Après récupération'],
    'soufflage':['Températures','Soufflage'],
    'extraction reprise':['Températures','Extraction / Reprise'],
    'vitesse soufflage':['Variation de vitesse','Soufflage'],
    'vitesse extraction':['Variation de vitesse','Extraction / Reprise'],
    'consigne soufflage':['Consignes','Soufflage'],
    'consigne extraction':['Consignes','Extraction / Reprise'],
    'pression':['Consignes','Pression'],
  };
  const temperatureTargets={
    'chauffage aller':'Chauffage aller (°C)',
    'chauffage retour':'Chauffage retour (°C)',
    'ecs depart':'ECS départ (°C)','ecs bouclage':'ECS bouclage (°C)',
    'ecs stockage':'ECS stockage (°C)',
  };
  const counters=new Map();
  for(const item of children.values()) {
    const parent=parents.get(item.parentId);
    const label=parent?parent.name+' / '+item.name:item.name;
    const ordinalKey=item.parentId+'||'+item.type;
    const position=(counters.get(ordinalKey)||0)+1;
    counters.set(ordinalKey,position);
    const read=(cle)=>item.values.get(cle);
    const current=(cle)=>{const row=read(cle);return row&&!row.inherited?row:null;};
    const allowed=new Set();
    if(item.type==='filtre_cta'){
      const section='Filtre n°'+Math.min(position,3);
      const classe=current('Classe de filtration'),etat=current('Etat du filtre');
      allowed.add('Classe de filtration');allowed.add('Etat du filtre');
      add('p-remar-filtres',section,'Type de filtre',{
        label,valeur:classe?.valeur||item.name,
        avis:classe?.avis,commentaire:classe?.commentaire,force:true});
      if(!etat?.avis && !etat?.commentaire)
        report(label,'état du filtre non confirmé : choisir un avis avant synchronisation');
      else add('p-remar-filtres',section,'Etat du filtre',{
        label,avis:etat?.avis,commentaire:etat?.commentaire,force:true});
    }else if(item.type==='mesure_cta'){
      const dest=measureTargets[normalize(item.name)];
      const v=current('Valeur');allowed.add('Valeur');
      if(dest) {
        if(v&&has(v))add('p-remar-cta-mesures',dest[0],dest[1],{...v,label,unite:item.unite});
      }else if(v&&has(v))report(label,'mesure supplémentaire sans destination précise dans la trame Symfony');
    }else if(item.type==='reseau_froid'){
      const section='Réseaux',field='Réseau '+Math.min(position,3);
      const observations=[...item.values.values()].filter(r=>!r.inherited&&has(r))
        .map(r=>r.cle+' : '+[r.valeur,r.avis,r.commentaire].filter(Boolean).join(' / '));
      item.values.forEach((v,k)=>allowed.add(k));
      add('p-remar-froid',section,field,{
        label,valeur:item.name+(observations.length?' — '+observations.join(' ; '):''),force:true});
    }else if(item.type==='temperature_chaufferie'){
      const dest=temperatureTargets[normalize(item.name)];
      const v=current('Valeur');allowed.add('Valeur');
      if(dest && v && has(v))
        add('p-remar-releves','Température chaufferie',dest,{...v,label,unite:item.unite});
      else if(!dest && v && has(v))
        report(label,'température sans case officielle compatible');
    }
    for(const [cle,r] of item.values){
      if(!allowed.has(cle)&&!r.inherited&&has(r))
        report(label,'observation supplémentaire non rattachable : '+cle);
    }
  }

  // En présence de plusieurs CTA, une case regroupée ne doit pas
  // sous-entendre que les contrôles d'une deuxième CTA ont été réalisés.
  // Mêmes exigences de confirmation que pour une CTA seule.
  if(cta.length>1){
    for(const [id,parent] of cta){
      for(const panel of ['p-remar-cta','p-remar-cta-energie']){
        for(const [section,items] of Object.entries(definition?.ui?.panels?.[panel]||{})){
          for(const item of items.filter(x=>x.type==='controle')){
            const target=key(panel,section,item.cle);
            const rowsForParent=groups.get(target)?.entries.filter(x=>x.id===id)||[];
            if(!rowsForParent.some(x=>['S','N.S','N.R','S.O','N.V'].includes(x.avis)))
              report(parent.name+' / '+item.cle,'avis non confirmé lors de cette visite');
          }
        }
      }
    }
  }

  const result=new Map();
  const priority=['N.S','N.R','N.V','S','S.O'];
  const displayValue=e=>{
    const raw=e.valeur||(!e.valeur&&['N.R','N.V','S.O'].includes(e.avis)?e.avis:'');
    const unit=raw&&e.unite&&!['N.R','N.V','S.O'].includes(raw)?' '+e.unite:'';
    return raw+unit;
  };
  for(const [target,group] of groups){
    const {mapping,entries}=group;
    const family=mapping.panelId.includes('cta')||mapping.panelId==='p-remar-filtres'?'cta'
      :mapping.panelId==='p-remar-vmc'?'vmc'
      :mapping.panelId==='p-remar-froid'?'froid':null;
    const familyCount=family==='cta'?cta.length:family==='vmc'?vmc.length:family==='froid'?froid.length:0;
    const multiline=entries.length>1||familyCount>1;
    if(mapping.type==='controle'){
      const valid=entries.filter(e=>['S','N.S','N.R','S.O','N.V'].includes(e.avis));
      if(valid.length!==entries.length){
        for(const e of entries.filter(e=>!['S','N.S','N.R','S.O','N.V'].includes(e.avis)))
          report(e.label+' / '+mapping.cle,'avis absent ou non confirmé pour un contrôle');
      }
      const avis=priority.find(s=>valid.some(e=>e.avis===s))||null;
      for(const e of valid) {
        if(e.avis==='N.S'&&(!clean(e.commentaire)||/^(anomalie|défaut).*(à préciser|intervention à préciser)/i.test(clean(e.commentaire))))
          report(e.label+' / '+mapping.cle,'constat N.S non caractérisé');
      }
      const commentaire=multiline?entries.map(e=>{
        const status=e.avis||'Non renseigné';
        return e.label+' : ['+status+']'+(e.commentaire?' '+e.commentaire:'');
      }).join('\n'):entries[0]?.commentaire||'';
      result.set(target,{type:'controle',avis,commentaire});
    }else{
      const value=multiline?entries.map(e=>{
        const v=displayValue(e);
        return e.label+' : '+v+(e.commentaire?' — '+e.commentaire:'')+
          (e.avis&&v!==e.avis?' ['+e.avis+']':'');
      }).join('\n'):entries.length===1?displayValue(entries[0])+
        (entries[0].commentaire?' — '+entries[0].commentaire:''):'';
      result.set(target,{type:'champ',valeur:value});
    }
  }
  return result;
}

async function buildCriteria(db, visite, details, issues) {
  const remoteTrame = details?.trame;
  const categories = Array.isArray(remoteTrame?.categories) ? remoteTrame.categories : [];
  if (!categories.length) { issues.push('Trame Intranet : aucun critère de référence figé pour cette visite.'); return []; }
  const [candidates, fields, controls, networks, counters, networkProvenances, measurePoints] = await Promise.all([
    buildCandidates(db, visite),
    db.getAllAsync(`SELECT section_code,cle,valeur FROM champs_visite WHERE visite_id=?`, [visite.id]),
    db.getAllAsync(`SELECT section_code,cle,avis,commentaire FROM controles_visite WHERE visite_id=?`, [visite.id]),
    db.getAllAsync(`SELECT * FROM reseaux WHERE visite_id=? ORDER BY ordre,id`, [visite.id]),
    db.getAllAsync(`SELECT * FROM compteurs WHERE visite_id=? ORDER BY id`, [visite.id]),
    db.getAllAsync(`SELECT p.entite_id,p.details_json FROM provenances p JOIN reseaux r ON r.id=p.entite_id WHERE p.entite_type='reseau' AND p.origine='api_symfony' AND r.visite_id=? ORDER BY p.importe_le DESC`, [visite.id]),
    db.getAllAsync(`SELECT libelle,valeur,unite FROM points_mesure_visite WHERE visite_id=? ORDER BY cree_le,id`, [visite.id]).catch(() => []),
  ]);
  const definition = obtenirTrame(visite.trame_id);
  const capabilities = mappingCapabilities(definition);
  const heatSummaryEnabled = Boolean(definition?.excel?.heatNetwork?.summaryRows);
  const heatRemarks = heatSummaryEnabled
    ? await db.getAllAsync('SELECT id,poste,prestation,perimetre FROM remarques WHERE visite_id=? ORDER BY cree_le,id', [visite.id])
    : [];
  // Une réserve générale/historique sans périmètre reste présente dans
  // visites[].remarques (buildRemarks ci-dessous). Elle n'entre pas dans
  // les 10 critères de synthèse Primaire/Secondaire : ne jamais lui inventer
  // un périmètre, mais ne pas bloquer son envoi pour ce seul motif.
  // Les critères inconnus, informations invalides ou perdues restent bloquants.
  const isTemperature = isTemperatureCandidate;
  const fieldMap = new Map(fields.map((row) => [`${row.section_code}||${row.cle}`, row.valeur]));
  const controlMap = new Map(controls.map((row) => [`${row.section_code}||${row.cle}`, row]));
  // REMAR multi-instance: injecter seulement les fiches identifiees sans
  // ambiguite dans les anciennes destinations officielles. Les autres points
  // sont exposes dans l'annexe Excel mais NE DOIVENT PAS etre perdus lors d'un
  // envoi Intranet : bloquer cet envoi tant que Symfony ne fournit pas de route
  // structuree pour les instances supplementaires.
  const isRemar=(definition?.familyId || definition?.id)==='remar_v1';
  let remarGrouped=null;
  if (isRemar) {
    const remap = await construireRemarDynamiquePourRapport(visite.id,definition);
    if (remap.hasDynamic) {
      // Une seule politique pour Excel et Intranet : aucun ancien champ plat
      // ne peut prendre la place d'une fiche CTA, VMC, froid ou température.
      for (const map of definition?.excel?.fieldMappings || []) {
        if (!remarDynamicOwnsMapping(map,remap)) continue;
        const key=`${map.sectionCode}||${map.cle}`;
        if (map.type==='controle') controlMap.set(key,{avis:null,commentaire:null});
        else fieldMap.set(key,null);
      }
      remarGrouped=groupRemarDetailsForIntranet(remap,definition,issues);
      // Les avertissements de projection Excel « 2 CTA / 1 cellule » ne
      // s'appliquent plus si le détail est transmis sur plusieurs lignes.
      // Le regroupement vérifie indépendamment toutes les données rejetées.
      if(!remarGrouped) {
        for(const warning of [...remap.ambiguous,...remap.unsupported])
          issues.push('REMAR dynamique non transmissible sans perte : '+warning);
      }
      // Contrat A2: un avis non saisi ne doit PAS devenir silencieusement N.V
      // (non visible) dans le POST. Le technicien doit choisir S/N.S/N.R/S.O/N.V.
      if (remap.familyCounts?.cta && (!remarGrouped||remap.familyCounts.cta===1) &&
          !remap.ambiguous.some(x=>/^CTA\b/.test(x))) {
        for (const m of definition?.excel?.fieldMappings || []) {
          if (m.type !== 'controle') continue;
          const cellKey=[m.panelId,m.section,m.cle].join('||');
          const row=remap.replacements.get(cellKey);
          const isMain=['p-remar-cta','p-remar-cta-energie'].includes(m.panelId);
          const activeFilter=m.panelId==='p-remar-filtres' &&
            m.cle==='Etat du filtre' &&
            remap.replacements.has([m.panelId,m.section,'Type de filtre'].join('||'));
          if (isMain||activeFilter) {
            if(!row||row.inherited||!['S','N.S','N.R','S.O','N.V'].includes(row.avis)) {
              issues.push(`REMAR CTA / ${m.section} / ${m.cle} : avis non confirmé pendant cette visite. Sélectionne S, N.S, N.R (non vérifié), S.O ou N.V avant l'envoi ; aucun avis n'est inventé.`);
            } else if(row.avis==='N.S' &&
              (!String(row.commentaire||'').trim() ||
               /^(?:anomalie|défaut) (?:constaté[ea]?[,;:]?\s*)?(?:à préciser|intervention à préciser)/i.test(String(row.commentaire).trim()) ||
               /: anomalie constatée[,;:]?\s*(?:intervention |description )?à préciser/i.test(String(row.commentaire)))) {
              issues.push(`REMAR CTA / ${m.section} / ${m.cle} : l'avis N.S doit préciser un défaut observé. Choisis une proposition technique ou décris le constat avant l'envoi Intranet.`);
            }
          }
        }
      }
      const byOfficial = new Map((definition?.excel?.fieldMappings||[])
        .map(m=>[[m.panelId,m.section,m.cle].join('||'),m]));
      for (const [key,value] of remap.replacements) {
        const mapping = byOfficial.get(key);
        if (!mapping) {
          issues.push(`REMAR : correspondance officielle introuvable pour ${key}.`);
          continue;
        }
        const storageKey = `${mapping.sectionCode}||${mapping.cle}`;
        const confirmed=value.inherited!==true;
        if (mapping.type==='controle') {
          controlMap.set(storageKey,{avis:confirmed?(value.avis??null):null,
            commentaire:confirmed?(value.commentaire??null):null});
        } else {
          fieldMap.set(storageKey,confirmed?(value.valeur??null):null);
        }
      }
      // Pour Symfony seulement : les lignes de toutes les CTA/caissons
      // écrasent la vue Excel centrée sur une seule référence.
      if(remarGrouped) {
        const byOfficial=new Map((definition?.excel?.fieldMappings||[])
          .map(m=>[[m.panelId,m.section,m.cle].join('||'),m]));
        for(const [key,group] of remarGrouped){
          const mapping=byOfficial.get(key);
          if(!mapping){issues.push('REMAR : destination regroupée introuvable : '+key);continue;}
          const storage=mapping.sectionCode+'||'+mapping.cle;
          if(group.type==='controle')
            controlMap.set(storage,{avis:group.avis,commentaire:group.commentaire});
          else fieldMap.set(storage,group.valeur);
        }
      }
    }
  }
  const remoteNetworkGroups = capabilities.networks
    ? categories.flatMap((category) => (Array.isArray(category?.sousCategories) ? category.sousCategories : []).filter(isNetworkGroup).map((subCategory) => ({ category, subCategory }))) : [];
  // REMAR V1 représente ses réseaux dans cinq champs nommés « Réseau 1..5 »,
  // et non dans les sous-catégories de régulation ICPE/RCU. Ne jamais envoyer
  // ces cinq noms comme "/" ni exiger des groupes serveur inexistants.
  const remarFixedNetworks=isRemar && remoteNetworkGroups.length===0;
  const directRemarNetworkSlots=remarFixedNetworks ? categories.flatMap(cat=>
    (cat.sousCategories||[]).flatMap(sub=>(sub.criteres||[])
      .map(criterion=>findCandidate(candidates,criterion,cat.nom,sub.nom))
      .filter(candidate=>candidate?.panelId==='p-remar-reseaux' &&
        /^Réseau [1-5]$/.test(candidate.cle)))) : [];
  // Aucun doublon : un résumé n'est utilisable que si AUCUNE des cinq
  // cases du référentiel officiel n'est présente dans la trame distante.
  const remarNetworkSummary=remarFixedNetworks && directRemarNetworkSlots.length===0
    ? remarNetworkSummaryTarget(categories) : null;
  const networkAssignments = capabilities.networks && !remarFixedNetworks
    ? mapNetworksToRemoteGroups(networks, remoteNetworkGroups, networkProvenances, issues)
    : new Map();
  if (remarFixedNetworks && networks.length>0) {
    const remoteSlots=new Set(categories.flatMap(category=>
      (category.sousCategories||[]).flatMap(subCategory=>
        (subCategory.criteres||[]).map(criterion=>
          findCandidate(candidates,criterion,category.nom,subCategory.nom))
        .filter(candidate=>candidate?.panelId==='p-remar-reseaux')
        .map(candidate=>candidate.cle))));
    if(!remarNetworkSummary) {
      for (let i=0;i<Math.min(networks.length,5);i++) {
        if (!remoteSlots.has(`Réseau ${i+1}`))
          issues.push(`Réseau REMAR ${i+1} : aucun critère Intranet officiel correspondant à cette case.`);
      }
    }
    // Les réseaux 6+ partagent la cinquième case, en conservant chaque
    // numéro, nom et paramètre sur sa propre ligne. La taille est validée
    // par exactComment() avant l'envoi, sans troncature.

  }
  let countersForWire=counters;
  if(isRemar && counters.length){
    // Le texte d'un compteur sans destination peut encore être conservé en
    // annexe Excel, mais aucun critère de l'Intranet ne l'acceptera
    // automatiquement. Refus au lieu d'une suppression silencieuse.
    const destinations=(definition?.excel?.fieldMappings||[])
      .filter(m=>m.panelId==='p-remar-releves' && m.section==='Compteur')
      .map(m=>m.cle);
    countersForWire=counters.map(counter=>{
      const destination=destinationCompteurRemar(counter,destinations);
      if(meaningfulRemote(counter.valeur)&&!destination)
        issues.push('Compteur REMAR « '+(clean(counter.label)||counter.id)+
          ' » : destination Intranet ambiguë ou inconnue. Choisis la famille officielle du compteur avant envoi.');
      return {...counter,destination:destination||'supplementaire'};
    });
  }
  const result = [];
  const seenRemoteBranches = new Set();
  const seenSummaryTargets = new Set();
  const mappedLocalRemar = new Map();
  let ordinal = 0;
  for (const category of categories) {
    for (const subCategory of Array.isArray(category?.sousCategories) ? category.sousCategories : []) {
      const networkGroup = capabilities.networks && isNetworkGroup(subCategory);
      const network = networkGroup ? networkAssignments.get(remoteNetworkKey(category?.id, subCategory?.id)) : null;
      for (const criterion of Array.isArray(subCategory?.criteres) ? subCategory.criteres : []) {
        const criterionName = clean(criterion?.nom) || criterion?.id || ordinal + 1;
        const categoryName = clean(category?.nom) || `catégorie ${category?.id || '?'}`;
        const subCategoryName = clean(subCategory?.nom) || `sous-catégorie ${subCategory?.id || '?'}`;
        const path = `Critère « ${criterionName} » [${categoryName} > ${subCategoryName}]`;
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
        const heatSummary = criterionResumeReseau(definition, criterion?.nom, category?.nom, subCategory?.nom);
        const candidate = column || heatSummary ? null : findCandidate(candidates, criterion, category?.nom, subCategory?.nom);
        const remarSummaryHere=remarNetworkSummary &&
          criterion===remarNetworkSummary.criterion &&
          category===remarNetworkSummary.category &&
          subCategory===remarNetworkSummary.subCategory;
        if(isRemar && candidate){
          const storage=[candidate.panelId,candidate.section,candidate.cle].join('||');
          const previous=mappedLocalRemar.get(storage);
          if(previous)issues.push(`REMAR : le point « ${candidate.cle} » (${candidate.panelId} / ${candidate.section}) est associé à plusieurs critères Intranet (${previous} et ${path}). Vérifie les IDs métier avant envoi.`);
          else mappedLocalRemar.set(storage,path);
        }

        if (heatSummary) {
          const semanticTarget = `${heatSummary.perimetre}:${heatSummary.categorie}`;
          if (seenSummaryTargets.has(semanticTarget)) {
            issues.push(`${path} : synthèse RCU « ${semanticTarget} » déjà mappée à un autre critère. Confirme les critères Intranet avant envoi.`);
          }
          seenSummaryTargets.add(semanticTarget);
          const summary = valueResumeReseau(heatRemarks, heatSummary);
          avis = applicable ? summary.avis : null;
          commentaire = exactComment(summary.commentaire, issues, `${path} / commentaire`);
        } else if (column) {
          if (network) commentaire = exactComment(network[column], issues, `${path} / commentaire`);
          if (applicable) issues.push(`${path} : critère réseau déclaré avec avis, mapping non supporté sans ambiguïté.`);
        } else if (remarSummaryHere) {
          const selected=networks.length?networks:
            (definition?.excel?.fieldMappings||[])
              .filter(m=>m.panelId==='p-remar-reseaux'&&/^Réseau [1-9]\d*$/.test(m.cle))
              .map((m,i)=>({nom_reseau:fieldMap.get(m.sectionCode+'||'+m.cle),ordre:i+1}))
              .filter(row=>meaningfulRemote(row.nom_reseau)!==null);
          const lines=selected.map((network,index)=>
            'Réseau '+(index+1)+' : '+remarNetworkText(network,index+1));
          commentaire=exactComment(lines.join('\n')||null,issues,path+' / commentaire');
        } else if (!candidate) {
          issues.push(`${path} : aucun champ METRA correspondant de façon sûre.`);
        } else if (isRemar && applicable && candidate.panelId==='p-remar-releves' &&
                   candidate.type==='champ') {
          // Symfony CLASSIQUE 16 marque Compteur énergie/ECS/appoint et les
          // températures « avisApplicable=oui », tandis que METRA les saisit
          // comme champs techniques. L'ancien if(applicable) ignorait la
          // valeur du compteur et envoyait N.V / « / » : perte silencieuse !
          // Conserver l'avis non vérifié par défaut, sans inventer « S »,
          // MAIS transmettre la mesure exacte dans le commentaire.
          const control=candidateStoredValue(controlMap,candidate,issues,path);
          avis=applicableAvis(control?.avis,issues,`${path} / avis`);
          let value;
          if(isMeterCandidate(candidate,capabilities)){
            const counter=counterValue(countersForWire,criterion,candidate);
            value=counter.status==='missing' && counters.length===0
              ?candidateStoredValue(fieldMap,candidate,issues,path):counter.value;
          }else{
            value=candidateStoredValue(fieldMap,candidate,issues,path);
            if(isTemperature(candidate))
              value=formaterTemperatureGroupee(candidate.cle,value,measurePoints);
          }
          commentaire=exactComment(meaningfulRemote(value) ?? control?.commentaire,
            issues,`${path} / commentaire`);
        } else if (applicable) {
          const control = candidateStoredValue(controlMap, candidate, issues, path);
          avis = applicableAvis(control?.avis, issues, `${path} / avis`);
          const temperature = isTemperature(candidate)
            ? formaterTemperatureGroupee(candidate.cle, control?.commentaire, measurePoints) : control?.commentaire;
          commentaire = exactComment(temperature, issues, `${path} / commentaire`);
        } else {
          let value;
          const remarNetworkSlot=remarFixedNetworks && candidate.panelId==='p-remar-reseaux'
            ? /^Réseau ([1-5])$/i.exec(String(candidate.cle||'')) : null;
          if (remarNetworkSlot && networks.length) {
            const slot=Number(remarNetworkSlot[1]);
            const selected=slot===5?networks.slice(4):networks.slice(slot-1,slot);
            value=selected.length===1?remarNetworkText(selected[0],slot):
              selected.length>1?selected.map((row,index)=>
                'Réseau '+(slot+index)+' : '+remarNetworkText(row,slot+index)).join('\n'):null;
          } else if (isMeterCandidate(candidate, capabilities)) {
            const counter = counterValue(isRemar ? countersForWire : counters, criterion, candidate);
            // Dans les panneaux spécialisés, l'index courant remplace
            // l'ancienne valeur de préremplissage. Les champs génériques
            // restent utilisables s'ils n'ont aucun compteur dynamique.
            const manualFallback = (!candidate.specialPanel || candidate.panelId === 'p-remar-releves' || /^pression\b/.test(candidate.key)) &&
              !(isRemar && candidate.panelId==='p-remar-releves' && counters.length>0);
            value = counter.status === 'missing' && manualFallback
              ? candidateStoredValue(fieldMap, candidate, issues, path) : counter.value;
          } else {
            value = candidateStoredValue(fieldMap, candidate, issues, path);
            if (isTemperature(candidate)) value = formaterTemperatureGroupee(candidate.cle, value, measurePoints);
          }
          commentaire = exactComment(value, issues, `${path} / commentaire`);
        }
        result.push({ categorieId, sousCategorieId, critereId, avis: applicable ? avis : null, commentaire });
        ordinal += 1;
      }
    }
  }
  if (!result.length) issues.push('Trame Intranet : la liste des critères est vide.');
  if(isRemar){
    // Une correspondance par critère distant ne suffit pas : l'ancien moteur
    // pouvait réussir le POST en ignorant une saisie locale présente, comme
    // lors de l'incident A2. Refaire la vérification dans l'autre sens.
    for(const mapping of definition?.excel?.fieldMappings||[]){
      const dataKey=`${mapping.sectionCode}||${mapping.cle}`;
      const destination=[mapping.panelId,mapping.section,mapping.cle].join('||');
      const data=mapping.type==='controle' ? controlMap.get(dataKey) : fieldMap.get(dataKey);
      const present=mapping.type==='controle'
        ? meaningfulRemote(data?.avis)||meaningfulRemote(data?.commentaire)
        : meaningfulRemote(data);
      const networkCovered=remarNetworkSummary &&
        mapping.panelId==='p-remar-reseaux' && /^Réseau [1-9]\d*$/.test(mapping.cle);
      if(present && !mappedLocalRemar.has(destination) &&
         !remarVisitMetadataCovered(definition,mapping) && !networkCovered)
        issues.push(`REMAR : saisie locale « ${mapping.cle} » (${mapping.panelId} / ${mapping.section}) non couverte par les critères de la trame Symfony. Envoi refusé pour conserver la donnée.`);
    }
  }
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
      (SELECT a.valeur FROM attributs_libres a WHERE a.entite_type='equipement' AND a.entite_id=m.equipement_id
       AND a.cle IN ('api_symfony.etat_reference','api_symfony.etat')
       ORDER BY CASE WHEN a.cle='api_symfony.etat_reference' THEN 0 ELSE 1 END, a.modifie_le DESC LIMIT 1) AS intranet_reference_state
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

/**
 * Export de diagnostic volontaire (bouton Partager), sans données terrain,
 * identifiants d'authentification, photos ou valeurs individuelles. Permet
 * de confronter le vrai référentiel Symfony aux 141 points locaux, au lieu
 * de refaire les tests contre un catalogue synthétique toujours complet.
 */
function frozenRemarCriteriaDiagnostic(trame) {
  if(!trame)return '';
  const rows=[
    'Catalogue de la trame Intranet effectivement liée à cette visite :',
    'Trame : '+clean(trame.nom||'?')+' (id : '+clean(trame.id||'?')+')',
  ];
  for(const category of trame.categories||[]){
    for(const sub of category.sousCategories||[]){
      for(const criterion of sub.criteres||[]){
        rows.push([
          'cat '+clean(category.id)+' : '+clean(category.nom),
          'sous-cat '+clean(sub.id)+' : '+clean(sub.nom),
          'crit '+clean(criterion.id)+' : '+clean(criterion.nom),
          'avisApplicable='+(criterion.avisApplicable===true?'oui':'non'),
        ].join(' | '));
      }
    }
  }
  return rows.join('\n');
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
  // Ne jamais écraser une vraie modification terrain. Ne rétablir la graphie
  // serveur d'une marque que si les neuf autres attributs sont inchangés.
  const outgoingMaterials = restoreReferenceEquivalentBrands(details?.materiels, materialData.materiels);
  const checkedMaterials = inspectIntranetMaterialSnapshot(
    details?.materiels, outgoingMaterials,
    details?.preparationMeta?.materialCount ?? sourceMaterials
  );
  issues.push(...checkedMaterials.issues);
  const expectedCriteria = countRemoteCriteria(details?.trame);
  if (criteres.length !== expectedCriteria) issues.push(`Critères : ${criteres.length}/${expectedCriteria}, la trame Intranet doit être envoyée intégralement.`);
  if (criteres.length > 2000) issues.push(`Critères : ${criteres.length}, maximum 2000 par visite.`);
  if (remarques.length > 500) issues.push(`Réserves : ${remarques.length}, maximum 500 par visite.`);
  if (materialData.materiels.length > 1000) issues.push(`Matériels : ${materialData.materiels.length}, maximum 1000 par visite.`);
  if (notes.length > 100) issues.push(`Notes : ${notes.length}, maximum 100 par visite.`);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(envoiId || ''))) issues.push('envoiId : UUID v4 requis.');

  const visitWire = { localId, trameId, derniereVisiteIdSource, date, statut: status, criteres, remarques, materiels: outgoingMaterials, notes };
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
    remoteCriteriaDiagnostic: visite.trame_id==='remar_v1' &&
      issues.some(issue=>/non couverte par les critères|Réseau REMAR .*aucun critère/.test(issue))
      ? frozenRemarCriteriaDiagnostic(details?.trame) : null,
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
