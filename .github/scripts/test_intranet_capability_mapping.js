/** Vérification multi-trames du sérialiseur Intranet, sans modifier SQLite. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(root, 'intranetVisitPayload.js'), 'utf8')
  .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  .replace(/export\s*\{[^}]+\};?/g, '')
  .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g, '');
const standardNetwork = (id) => ({
  id, nom: id, ui: { specialPanels: ['p-regulation', 'p-releves'], panels: {} },
  excel: { networks: { exportOffsets: { nom_reseau: 2, tnc: 4 } } },
});
const defs = {
  icpe_v1: standardNetwork('icpe_v1'),
  reseau_chaleur_v1: standardNetwork('reseau_chaleur_v1'),
  local_reseaux: { id: 'local_reseaux', excel: { networks: { exportOffsets: { nom_reseau: 2 } } }, ui: { panels: {} } },
  trame_autre_reseaux: { id: 'trame_autre_reseaux', intranet: { networks: true }, ui: { panels: {} } },
  trame_remar_dynamique: { id: 'trame_remar_dynamique', ui: {
    dynamicPanels: { 'p-remar-reseaux': 'networks', 'p-remar-releves': 'meters' },
    panels: { 'p-remar-releves': { 'Compteur': [
      { cle: 'Compteur Gaz (m³)', type: 'champ', intranetAliases: ['Compteur principal gaz'] },
    ] } },
  } },
  trame_sans_reseaux: { id: 'trame_sans_reseaux', ui: { panels: { 'p-test': { 'Controle': [
    { cle: 'Contrôle A', type: 'champ' },
  ] } } } },
  trame_compteurs: { id: 'trame_compteurs', ui: { panels: { 'p-compteur': { 'Comptage': [
    { cle: 'Index Gaz (m³)', type: 'champ', numericIndex: true, intranetAliases: ['Compteur principal gaz'] },
    { cle: 'Température départ (°C)', type: 'champ', numeric: { unit: '°C' } },
  ] } } } },
  trame_alias_ambigu: { id: 'trame_alias_ambigu', ui: { panels: {
    'p-a': { A: [{ cle: 'Index gaz', type: 'champ', intranetAliases: ['Index général'] }] },
    'p-b': { B: [{ cle: 'Index eau', type: 'champ', intranetAliases: ['Index général'] }] },
  } } },
};
defs.reseau_chaleur_v1.excel.heatNetwork = {
  summaryRows: { Primaire: { P2: 362, P3: 363, Conformite: 364, Amelioration: 365, Remarque: 366 },
    Secondaire: { P2: 373, P3: 374, Conformite: 375, Amelioration: 376, Remarque: 377 } },
};
let checks = 0;
function check(condition, label) {
  assert.ok(condition, label);
  checks += 1;
  console.log('OK ' + checks + ': ' + label);
}
const payload = new Function('getDb', 'obtenirTrame', 'formaterReleves', 'formaterTemperatureGroupee',
  script + '\nreturn { buildCriteria, buildRemarks, inspectIntranetTrameCapabilities, inspectIntranetCriterionCandidate };')(
    async () => { throw new Error('getDb not needed by this test'); },
    (id) => { if (!defs[id]) throw new Error('Unknown test trame ' + id); return defs[id]; },
    (items) => items.map((x) => String(x.label) + ': ' + String(x.valeur) + ' ' + String(x.unite || '')).join('\n'),
    (_field, value) => value
  );
function networkSub(id, name) {
  return { id, nom: name, criteres: [
    { id: id * 10 + 1, nom: 'Nom réseau', avisApplicable: false },
    { id: id * 10 + 2, nom: 'Courbe de chauffe', avisApplicable: false },
    { id: id * 10 + 3, nom: 'TNC', avisApplicable: false },
  ] };
}
const networkRemote = { categories: [{ id: 10, nom: 'Paramètres de régulation',
  sousCategories: [networkSub(21, 'Réseau n°1'), networkSub(22, 'Réseau n°2')] }] };
const networks = [
  { id: 'n1', nom_reseau: 'Réseau 1', courbe_de_chauffe: '0.8', tnc: '18' },
  { id: 'n2', nom_reseau: 'Réseau 2', courbe_de_chauffe: '1.0', tnc: '20' },
];
function fakeDb(data) {
  return { getAllAsync: async (sql) => {
    if (sql.includes('FROM remarques')) return data.remarks || [];
    if (sql.includes('FROM champs_visite')) return data.fields || [];
    if (sql.includes('FROM controles_visite')) return data.controls || [];
    if (sql.includes('FROM reseaux')) return data.networkRows || [];
    if (sql.includes('FROM compteurs')) return data.meters || [];
    if (sql.includes('FROM provenances')) return data.provenances || [];
    if (sql.includes('FROM points_mesure_visite')) return data.measures || [];
    throw new Error('Unexpected query: ' + sql);
  } };
}
async function build(id, remote, data = {}) {
  const issues = [];
  const values = await payload.buildCriteria(fakeDb(data), { id: 'test', trame_id: id }, { trame: remote }, issues);
  return { values, issues };
}
async function main() {
  for (const id of ['icpe_v1', 'reseau_chaleur_v1', 'local_reseaux', 'trame_autre_reseaux']) {
    check(payload.inspectIntranetTrameCapabilities(id).networks === true, 'network capability: ' + id);
    const result = await build(id, networkRemote, { networkRows: networks });
    check(result.issues.length === 0 && result.values.length === 6 &&
      result.values[0].commentaire === 'Réseau 1' && result.values[3].commentaire === 'Réseau 2' &&
      result.values[1].commentaire === '0.8' && result.values[4].commentaire === '1.0',
      'numbered networks map correctly without trame ID exceptions: ' + id);
  }
  // La structure reproduit les dix blocages constatés sur la visite des Ulis :
  // catégorie = REMARQUES SUR LE PRIMAIRE/SECONDAIRE ;
  // sous-catégorie = Opération à effectuer ; critère = P2/P3/etc.
  const summaryLabels = ['P2', 'P3', 'Conformité', 'Amélioration', 'Remarque'];
  const rcuSummaryRemote = { categories: ['PRIMAIRE', 'SECONDAIRE'].map((scope, i) => ({
    id: 80 + i, nom: 'REMARQUES SUR LE ' + scope,
    sousCategories: [{ id: 90 + i, nom: 'Opération à effectuer',
      criteres: summaryLabels.map((nom, j) => ({
        id: 100 + i * 10 + j, nom, avisApplicable: j % 2 === 0,
      })),
    }],
  })) };
  const summaryRemarks = [
    { id: 'r1', poste: 'Entretien P2', prestation: 'Nettoyer les filtres', perimetre: 'Primaire' },
    { id: 'r2', poste: 'Entretien P2', prestation: 'Purger la boucle', perimetre: 'Primaire' },
    { id: 'r3', poste: 'Conformité', prestation: 'Rétablir la sécurité', perimetre: 'Primaire' },
    { id: 'r4', poste: 'Travaux P3', prestation: 'Remplacer le circulateur', perimetre: 'Secondaire' },
    { id: 'r5', poste: 'Amélioration', prestation: 'Installer une sonde', perimetre: 'Secondaire' },
    { id: 'r6', poste: 'Observation', prestation: 'Vérifier le compteur', perimetre: 'Secondaire' },
  ];
  const rcuSummary = await build('reseau_chaleur_v1', rcuSummaryRemote, { remarks: summaryRemarks });
  check(rcuSummary.issues.length === 0 && rcuSummary.values.length === 10,
    'RCU: ten real Intranet synthesis criteria mapped without errors');
  check(rcuSummary.values[0].commentaire === ['Nettoyer les filtres', 'Purger la boucle'].join('\\n\\n'.replace(/\\n/g, '\n')) &&
    rcuSummary.values[0].avis === 'N.S' && rcuSummary.values[2].commentaire === 'Rétablir la sécurité',
    'RCU: primary P2 and conformity preserve multiple reserve descriptions, order and applicable opinion');
  check(rcuSummary.values[6].commentaire === 'Remplacer le circulateur' &&
    rcuSummary.values[8].commentaire === 'Installer une sonde' &&
    rcuSummary.values[9].commentaire === 'Vérifier le compteur',
    'RCU: secondary P3, improvements and miscellaneous remarks remain in their own categories');
  check(rcuSummary.values[1].commentaire === 'Sans Objet.' &&
    rcuSummary.values[4].avis === 'S.O' && rcuSummary.values[5].avis === 'S.O',
    'RCU: empty synthesis cells match Excel without inventing observations');
  // Chaque variante homologuée passe par la même matrice métier
  // Primaire/Secondaire × P2/P3/Conformité/Amélioration/Remarque.
  // Les nouveaux libellés ne doivent pas générer de nouveaux correctifs ad hoc.
  const rcuAliasRemote = structuredClone(rcuSummaryRemote);
  for (const category of rcuAliasRemote.categories) {
    category.nom = category.nom.replace('SUR LE', 'DU');
    category.sousCategories[0].nom = 'Opérations à effectuer';
    ['Entretien P2', 'Travaux P3', 'Mise en conformité',
      'Travaux d’amélioration', 'Remarque particulière'].forEach((nom, index) => {
      category.sousCategories[0].criteres[index].nom = nom;
    });
  }
  const rcuAlias = await build('reseau_chaleur_v1', rcuAliasRemote, { remarks: summaryRemarks });
  check(rcuAlias.issues.length === 0 && rcuAlias.values.length === 10 &&
    rcuAlias.values[2].commentaire === 'Rétablir la sécurité' &&
    rcuAlias.values[6].commentaire === 'Remplacer le circulateur' &&
    rcuAlias.values[9].commentaire === 'Vérifier le compteur',
    'RCU: all ten primary/secondary synthesis cells accept safely declared semantic aliases');
  const rcuPluralRemote = structuredClone(rcuSummaryRemote);
  rcuPluralRemote.categories.forEach((category) => {
    category.sousCategories[0].criteres[4].nom = 'Remarques particulières';
  });
  const rcuPlural = await build('reseau_chaleur_v1', rcuPluralRemote, { remarks: summaryRemarks });
  check(rcuPlural.issues.length === 0 && rcuPlural.values[9].commentaire === 'Vérifier le compteur',
    'RCU: plural particular remarks map to the same canonical summary');
  const rcuDuplicate = structuredClone(rcuSummaryRemote);
  rcuDuplicate.categories[0].sousCategories[0].criteres.push({
    id: 5001, nom: 'Remarque particulière', avisApplicable: false,
  });
  const duplicate = await build('reseau_chaleur_v1', rcuDuplicate, { remarks: summaryRemarks });
  check(duplicate.issues.some((x) => /déjà mappée à un autre critère/.test(x)),
    'RCU: duplicate semantically equivalent remote criteria fail closed');
  const rcuUnpublished = structuredClone(rcuSummaryRemote);
  rcuUnpublished.categories[0].sousCategories[0].criteres[4].nom = 'Critère métier nouveau non publié';
  const unknownSummary = await build('reseau_chaleur_v1', rcuUnpublished);
  check(unknownSummary.issues.some((x) => /Critère métier nouveau non publié.*aucun champ METRA/.test(x)),
    'RCU: never guess semantic mapping for unknown future criteria');
  const rcuEmpty = await build('reseau_chaleur_v1', rcuSummaryRemote);
  check(rcuEmpty.issues.length === 0 && rcuEmpty.values.every((x) => x.commentaire === 'Sans Objet.'),
    'RCU: an existing visit with no reserves can still serialize all ten synthesis criteria');
  const generalRemark = { id: 'r-general', poste: 'Sécurité incendie',
    prestation: 'Vérifier les extincteurs', perimetre: null, intranet_date_reserve: '2026-10-28' };
  const rcuUnclassified = await build('reseau_chaleur_v1', rcuSummaryRemote, {
    remarks: [generalRemark],
  });
  check(rcuUnclassified.issues.length === 0 &&
    rcuUnclassified.values.every((x) => x.commentaire === 'Sans Objet.'),
    'RCU: general legacy reserve does not fabricate a primary/secondary summary or block it');
  const remarksIssues = [];
  const generalWire = await payload.buildRemarks(fakeDb({ remarks: [generalRemark] }), 'test', remarksIssues);
  check(remarksIssues.length === 0 && generalWire.length === 1 &&
    generalWire[0].poste === 'Sécurité incendie' &&
    generalWire[0].prestation === 'Vérifier les extincteurs',
    'RCU: general reserve is still transmitted in the independent Intranet remarques[] array');
  const mixed = await build('reseau_chaleur_v1', rcuSummaryRemote, {
    remarks: [summaryRemarks[0], generalRemark],
  });
  check(mixed.issues.length === 0 && mixed.values[0].commentaire === 'Nettoyer les filtres' &&
    mixed.values[4].commentaire === 'Sans Objet.',
    'RCU: classified reserve reaches exactly its summary and general reserve remains independent');
  const rcuOversized = await build('reseau_chaleur_v1', rcuSummaryRemote, {
    remarks: [{ id: 'r-long', poste: 'P2', prestation: 'x'.repeat(1501), perimetre: 'Primaire' }],
  });
  check(rcuOversized.issues.some((x) => /maximum 1500/.test(x)),
    'RCU: oversized grouped comments are rejected without truncation');
  const invalidSummaryRemote = structuredClone(rcuSummaryRemote);
  invalidSummaryRemote.categories[0].sousCategories[0].criteres[0].nom = 'Critère inconnu';
  const invalidSummary = await build('reseau_chaleur_v1', invalidSummaryRemote);
  check(invalidSummary.issues.some((x) => /Critère inconnu.*aucun champ METRA/.test(x)),
    'RCU: unknown remote criterion remains blocked');
  const wrongTemplate = await build('icpe_v1', rcuSummaryRemote);
  check(wrongTemplate.issues.length === 10,
    'RCU synthesis mapping does not leak into ICPE');
  const remarCaps = payload.inspectIntranetTrameCapabilities('trame_remar_dynamique');
  check(remarCaps.networks === true && remarCaps.meters === true,
    'REMAR-style dynamic panels enable network and meter capabilities without whitelist');
  const remarNetwork = await build('trame_remar_dynamique', networkRemote, { networkRows: networks });
  check(remarNetwork.issues.length === 0 && remarNetwork.values[0].commentaire === 'Réseau 1',
    'REMAR-style dynamic network values serialize into the correct Intranet group');
  const remarMeterRemote = { categories: [{ id: 11, nom: 'Relevés', sousCategories: [
    { id: 23, nom: 'Compteur', criteres: [
      { id: 110, nom: 'Compteur principal gaz', avisApplicable: false },
    ] },
  ] }] };
  const remarCounter = await build('trame_remar_dynamique', remarMeterRemote, {
    fields: [{ section_code: 'remar-releves.compteur', cle: 'Compteur Gaz (m³)', valeur: '9999' }],
    meters: [{ label: 'Compteur gaz', destination: 'Compteur Gaz (m³)', valeur: '2468', unite: 'm³' }],
  });
  check(remarCounter.issues.length === 0 && remarCounter.values[0].commentaire === '2468',
    'REMAR-style meter takes fresh index, never the outdated generic prefill');
  const remarFallback = await build('trame_remar_dynamique', remarMeterRemote, {
    fields: [{ section_code: 'remar-releves.compteur', cle: 'Compteur Gaz (m³)', valeur: '9999' }],
  });
  check(remarFallback.issues.length === 0 && remarFallback.values[0].commentaire === '9999',
    'REMAR retains a manual legacy meter reading only when no dynamic counter exists');
    check(payload.inspectIntranetTrameCapabilities('trame_sans_reseaux').networks === false,
    'trame without network capability does not acquire it');
  const renamed = networks.map((row, i) => ({ ...row, nom_reseau: 'Bâtiment ' + (i + 1) }));
  const ambiguous = await build('local_reseaux', networkRemote, { networkRows: renamed });
  check(ambiguous.issues.some((x) => /2 réseau\(x\).*sans ambiguïté/.test(x)),
    'multiple networks without proof remain blocked instead of being swapped by row order');
  const provenances = [
    { entite_id: 'n1', details_json: JSON.stringify({ remoteCategoryId: 10, remoteSubCategoryId: 21 }) },
    { entite_id: 'n2', details_json: JSON.stringify({ remoteCategoryId: 10, remoteSubCategoryId: 22 }) },
  ];
  const linked = await build('local_reseaux', networkRemote, { networkRows: renamed, provenances });
  check(linked.issues.length === 0 &&
    linked.values[0].commentaire === 'Bâtiment 1' && linked.values[3].commentaire === 'Bâtiment 2',
    'network provenance overrides renamed local labels');
  const unrelatedRemote = { categories: [{ id: 10, nom: 'Contrôles', sousCategories: [
    { id: 20, nom: 'Controle', criteres: [{ id: 30, nom: 'Contrôle A', avisApplicable: false }] },
  ] }] };
  const unrelated = await build('trame_sans_reseaux', unrelatedRemote, {
    networkRows: networks,
    fields: [{ section_code: 'test.controle', cle: 'Contrôle A', valeur: 'Oui' }],
  });
  check(unrelated.issues.length === 0 && unrelated.values[0].commentaire === 'Oui',
    'unrelated trame ignores non-applicable legacy network data');
  const meterRemote = { categories: [{ id: 11, nom: 'Comptage', sousCategories: [
    { id: 23, nom: 'Comptage', criteres: [
      { id: 110, nom: 'Compteur principal gaz', avisApplicable: false },
      { id: 111, nom: 'Température départ (°C)', avisApplicable: false },
    ] },
  ] }] };
  const withMeter = await build('trame_compteurs', meterRemote, {
    fields: [
      { section_code: 'compteur.comptage', cle: 'Index Gaz (m³)', valeur: '9999' },
      { section_code: 'compteur.comptage', cle: 'Température départ (°C)', valeur: '46' },
    ],
    meters: [{ label: 'Index Gaz', destination: 'Index Gaz (m³)', valeur: '1234', unite: 'm³' }],
  });
  check(payload.inspectIntranetTrameCapabilities('trame_compteurs').meters === true,
    'numericIndex activates metering without a predefined trame ID');
  check(withMeter.issues.length === 0 && withMeter.values[0].commentaire === '1234' &&
    withMeter.values[1].commentaire === '46',
    'generic meter exports current index instead of stale prefill, preserving temperature');
  const manual = await build('trame_compteurs', meterRemote, {
    fields: [{ section_code: 'compteur.comptage', cle: 'Index Gaz (m³)', valeur: '42' }],
  });
  check(manual.issues.length === 0 && manual.values[0].commentaire === '42',
    'manual generic index is preserved if no permanent meter matches');
  const collision = payload.inspectIntranetCriterionCandidate('trame_alias_ambigu',
    { nom: 'Index général', avisApplicable: false }, '', '');
  check(collision.resolved === null && collision.candidates.length === 2,
    'ambiguous field aliases remain unassignable');
  const unknown = payload.inspectIntranetCriterionCandidate('trame_sans_reseaux',
    { nom: 'Critère totalement inconnu', avisApplicable: false }, '', '');
  check(unknown.resolved === null, 'unknown server criterion remains blocked');
  console.log('\n' + checks + ' Intranet cross-trame capability checks passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
