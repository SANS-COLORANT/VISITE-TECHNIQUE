/**
 * Contrat côté MÉTRA pour un FUTUR catalogue Symfony V2.
 * Aucun endpoint V2 n'est actif tant que Symfony ne le publie pas.
 * Ne déduit jamais l'identité d'un modèle à partir de son libellé.
 */
const KEY = /^[a-z][a-z0-9_.-]*$/;
const SHA = /^sha256:[0-9a-f]{64}$/;
const TYPES = new Set(['champ', 'controle', 'mesure', 'synthese', 'reseau', 'compteur']);
const STATES = new Set(['active', 'deprecated', 'retired']);
const CAPABILITIES = new Set(['criteres', 'reserves', 'materiels', 'photos', 'reseaux', 'compteurs', 'regulations', 'notes', 'conclusion']);
function string(value) { return String(value ?? '').trim(); }
function positiveInteger(value) { const n = Number(value); return Number.isSafeInteger(n) && n > 0; }
function stableKey(value) { return KEY.test(string(value)); }

/** La validation est exhaustive et sans effet de bord (compatible offline). */
export function inspectV2TrameCatalog(catalog) {
  const issues = [];
  if (catalog?.schemaVersion !== 2) issues.push('Catalogue : schemaVersion=2 requis.');
  if (!Array.isArray(catalog?.trames)) {
    issues.push('Catalogue : trames[] absent.');
    return { valid: false, issues };
  }
  const seenModels = new Set(), remoteIdOwners = new Map();
  for (const [index, model] of catalog.trames.entries()) {
    const path = 'trames[' + index + ']';
    const code = string(model?.cleMetierStable);
    if (!positiveInteger(model?.idSymfony)) issues.push(path + ': idSymfony invalide.');
    if (!stableKey(code)) issues.push(path + ': cleMetierStable invalide.');
    const versionIdentity = code + '@' + String(model?.version);
    if (code && seenModels.has(versionIdentity)) issues.push(path + ': couple cleMetierStable/version dupliqué.');
    seenModels.add(versionIdentity);
    if (positiveInteger(model?.idSymfony) && code) {
      const remoteId = String(model.idSymfony);
      if (remoteIdOwners.has(remoteId) && remoteIdOwners.get(remoteId) !== code)
        issues.push(path + ': idSymfony partagé entre deux clés métier distinctes.');
      remoteIdOwners.set(remoteId, code);
    }
    if (!positiveInteger(model?.version)) issues.push(path + ': version obligatoire.');
    if (!SHA.test(string(model?.empreinte))) issues.push(path + ': empreinte SHA-256 absente/invalide.');
    if (!STATES.has(string(model?.statut))) issues.push(path + ': statut inconnu.');
    if (model?.acceptsExistingOfflineVisits != null && typeof model.acceptsExistingOfflineVisits !== 'boolean')
      issues.push(path + ': acceptsExistingOfflineVisits doit être booléen.');
    if (!Array.isArray(model?.capabilities)) issues.push(path + ': capabilities[] absent.');
    else {
      const seenCapabilities = new Set();
      for (const capability of model.capabilities) {
        if (!CAPABILITIES.has(capability) || seenCapabilities.has(capability))
          issues.push(path + ': capacité inconnue ou dupliquée : ' + string(capability));
        seenCapabilities.add(capability);
      }
      if (!seenCapabilities.has('criteres')) issues.push(path + ': capacité criteres obligatoire.');
    }
    if (!Array.isArray(model?.criteres)) {
      issues.push(path + ': criteres[] absent.');
      continue;
    }
    if (!model.criteres.length || model.criteres.length > 2000)
      issues.push(path + ': nombre de critères vide ou excessif.');
    const seenBranches = new Set(), seenKeys = new Set();
    for (const [i, criterion] of model.criteres.entries()) {
      const base = path + '.criteres[' + i + ']';
      const branch = string(criterion?.brancheId), key = string(criterion?.cleMetierStable);
      if (!/^[1-9]\d*:[1-9]\d*:[1-9]\d*$/.test(branch) || branch.split(':').some((s) => !positiveInteger(s)))
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
  cleMetierStable, version, empreinte, localId, tramesAutorisees,
  mappedCriteria, supportedCapabilities, mode = 'new_visit',
} = {}) {
  const { valid, issues: catalogIssues } = inspectV2TrameCatalog(catalog);
  const issues = [...catalogIssues];
  if (!valid) return { compatible: false, issues, model: null };
  // Do not silently choose the first version of the same business trame.
  const model = catalog.trames.find((t) =>
    t.cleMetierStable === cleMetierStable && String(t.version) === String(version)) || null;
  if (!model) {
    issues.push('Version de trame absente du catalogue : saisie locale possible, envoi interdit.');
    return { compatible: false, issues, model: null };
  }
  if (model.empreinte !== empreinte)
    issues.push('Empreinte de trame différente : aucune migration automatique.');
  if (!['new_visit', 'existing_offline_visit'].includes(mode))
    issues.push('Mode de préparation inconnu.');
  const offlineDeprecated = mode === 'existing_offline_visit' &&
    model.statut === 'deprecated' && model.acceptsExistingOfflineVisits === true;
  if (model.statut !== 'active' && !offlineDeprecated)
    issues.push('Version de trame non active : aucune nouvelle visite, sauf accord serveur explicite sur un ancien envoi offline.');
  if (!positiveInteger(localId)) issues.push('Identifiant local Symfony requis.');
  if (!Array.isArray(tramesAutorisees) || !tramesAutorisees.some((x) =>
    x?.cleMetierStable === cleMetierStable && Number(x.version) === Number(version) &&
    x.empreinte === empreinte))
    issues.push('Cette version/empreinte n est pas autorisée sur ce local.');
  if (!Array.isArray(supportedCapabilities)) issues.push('Capacités moteur METRA non renseignées.');
  else {
    const capabilities = new Set(supportedCapabilities);
    const unsupported = model.capabilities.filter((c) => !capabilities.has(c));
    if (unsupported.length) issues.push('Capacités non implémentées : ' + unsupported.join(', '));
  }
  // An alias, remote name or criterion key alone is NOT a mapping.
  // Verify every branch, including optional criteria, and a real local source.
  const expected = new Map(model.criteres.map((c) => [c.cleMetierStable, c.brancheId]));
  if (!Array.isArray(mappedCriteria)) issues.push('Mappings par clé, triplet ET source locale absents.');
  else {
    const covered = new Set();
    for (const [i, mapping] of mappedCriteria.entries()) {
      const p = 'mappedCriteria[' + i + ']';
      if (!stableKey(mapping?.cleMetierStable) || !stableKey(mapping?.sourceKey) ||
          !/^[1-9]\d*:[1-9]\d*:[1-9]\d*$/.test(string(mapping?.brancheId))) {
        issues.push(p + ': mapping invalide (cleMetierStable, brancheId, sourceKey).');
        continue;
      }
      if (!expected.has(mapping.cleMetierStable) || expected.get(mapping.cleMetierStable) !== mapping.brancheId)
        issues.push(p + ': branche de critère inconnue ou erronée.');
      if (covered.has(mapping.cleMetierStable)) issues.push(p + ': mapping dupliqué.');
      covered.add(mapping.cleMetierStable);
    }
    const missing = [...expected.keys()].filter((key) => !covered.has(key));
    if (missing.length) issues.push(missing.length + ' critère(s) sans source locale explicite, y compris facultatifs : ' +
      missing.slice(0, 8).join(', '));
  }
  return { compatible: issues.length === 0, issues, model };
}
