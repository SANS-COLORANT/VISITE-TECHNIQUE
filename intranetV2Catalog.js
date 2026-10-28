/**
 * Contrat côté MÉTRA pour un FUTUR catalogue Symfony V2.
 * Aucun endpoint V2 n'est actif tant que Symfony ne le publie pas.
 * Ne déduit jamais l'identité d'un modèle à partir de son libellé.
 */
const KEY = /^[a-z][a-z0-9_.-]*$/;
const SHA = /^sha256:[0-9a-f]{64}$/;
const TYPES = new Set(['champ', 'controle', 'mesure', 'synthese', 'reseau', 'compteur']);
const STATES = new Set(['active', 'deprecated', 'retired']);
function string(value) { return String(value ?? '').trim(); }
function positiveInteger(value) { const n = Number(value); return Number.isSafeInteger(n) && n > 0; }
function stableKey(value) { return KEY.test(string(value)); }

/** La validation est exhaustive et sans effet de bord (compatible offline). */
export function inspectV2TrameCatalog(catalog) {
  const issues = [];
  if (Number(catalog?.schemaVersion) !== 2) issues.push('Catalogue : schemaVersion=2 requis.');
  if (!Array.isArray(catalog?.trames)) {
    issues.push('Catalogue : trames[] absent.');
    return { valid: false, issues };
  }
  const seenModels = new Set();
  for (const [index, model] of catalog.trames.entries()) {
    const path = 'trames[' + index + ']';
    const code = string(model?.cleMetierStable);
    if (!positiveInteger(model?.idSymfony)) issues.push(path + ': idSymfony invalide.');
    if (!stableKey(code)) issues.push(path + ': cleMetierStable invalide.');
    if (code && seenModels.has(code)) issues.push(path + ': cleMetierStable dupliquée.');
    seenModels.add(code);
    if (!positiveInteger(model?.version)) issues.push(path + ': version obligatoire.');
    if (!SHA.test(string(model?.empreinte))) issues.push(path + ': empreinte SHA-256 absente/invalide.');
    if (!STATES.has(string(model?.statut))) issues.push(path + ': statut inconnu.');
    if (!Array.isArray(model?.criteres)) {
      issues.push(path + ': criteres[] absent.');
      continue;
    }
    const seenBranches = new Set(), seenKeys = new Set();
    for (const [i, criterion] of model.criteres.entries()) {
      const base = path + '.criteres[' + i + ']';
      const branch = string(criterion?.brancheId), key = string(criterion?.cleMetierStable);
      if (!/^\d+:\d+:\d+$/.test(branch) || branch.split(':').some((s) => !positiveInteger(s)))
        issues.push(base + ': brancheId doit être le triplet numérique complet.');
      if (!stableKey(key)) issues.push(base + ': clé de critère invalide.');
      if (!TYPES.has(string(criterion?.type))) issues.push(base + ': type de critère non déclaré.');
      if (seenBranches.has(branch)) issues.push(base + ': branche de critère dupliquée.');
      if (seenKeys.has(key)) issues.push(base + ': clé métier de critère dupliquée.');
      seenBranches.add(branch); seenKeys.add(key);
      if (typeof criterion?.obligatoire !== 'boolean') issues.push(base + ': obligatoire doit être booléen.');
      if (typeof criterion?.avis?.applicable !== 'boolean') issues.push(base + ': avis.applicable doit être booléen.');
    }
  }
  return { valid: issues.length === 0, issues };
}

/**
 * Prévalidation offline stricte : aucune correspondance par nom/ordre.
 * Un catalogue invalide, obsolète, sans affectation locale explicite
 * ou avec des critères obligatoires non mappés ne peut pas être envoyé.
 */
export function inspectV2TrameCompatibility(catalog, {
  cleMetierStable, version, empreinte, localId, tramesAutorisees, mappedCriterionKeys,
} = {}) {
  const { valid, issues: catalogIssues } = inspectV2TrameCatalog(catalog);
  const issues = [...catalogIssues];
  if (!valid) return { compatible: false, issues, model: null };
  const model = catalog.trames.find((t) => t.cleMetierStable === cleMetierStable) || null;
  if (!model) issues.push('Trame inconnue du catalogue serveur : usage local/export uniquement.');
  else {
    if (model.statut !== 'active') issues.push('Trame serveur non active : aucune création de visite.');
    if (Number(model.version) !== Number(version) || model.empreinte !== empreinte)
      issues.push('Version ou empreinte de trame différente : préparer une nouvelle visite ou migrer explicitement.');
    if (!positiveInteger(localId)) issues.push('Identifiant local Symfony requis.');
    if (!Array.isArray(tramesAutorisees) || !tramesAutorisees.some((x) => x.cleMetierStable === cleMetierStable &&
      Number(x.version) === Number(version) && x.empreinte === empreinte))
      issues.push('Trame non déclarée compatible avec ce local.');
    const mapping = new Set(Array.isArray(mappedCriterionKeys) ? mappedCriterionKeys : []);
    const missing = model.criteres.filter((c) => c.obligatoire && !mapping.has(c.cleMetierStable));
    if (missing.length) issues.push(missing.length + ' critère(s) obligatoires sans mapping explicite : ' +
      missing.slice(0, 8).map((m) => m.cleMetierStable).join(', '));
  }
  return { compatible: issues.length === 0, issues, model };
}
