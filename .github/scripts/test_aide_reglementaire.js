/** Fiches d'aide par appui long : données, recherche des fiches, calculs d'aide, garde-fous. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const strip = (src) => src.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '').replace(/export\s+(?=(?:const|function|let)\s)/g, '');
const data = read('aideReglementaireData.js');
const logic = read('aideReglementaire.js');
const names = [...logic.matchAll(/export\s+(?:const|function)\s+(\w+)/g)].map((m) => m[1]);
const dnames = [...data.matchAll(/export\s+const\s+(\w+)/g)].map((m) => m[1]);
const A = new Function(`${strip(data)}\n${strip(logic)}\nreturn {${[...names, ...dnames].join(',')}};`)();

// Données : liaisons cohérentes, aucune fiche sans contrôle ni preuve.
const ids = Object.keys(A.AIDE_THEMES);
assert.equal(ids.length, 64, '64 fiches du dossier');
for (const id of ids) {
  const t = A.AIDE_THEMES[id];
  assert.ok(t.title && t.popup && t.detail, `${id} : textes`);
  assert.ok(Array.isArray(t.checks) && t.checks.length >= 2, `${id} : points à vérifier`);
  assert.ok(Array.isArray(t.evidence) && t.evidence.length >= 1, `${id} : preuves`);
  for (const sid of t.sources) assert.ok(A.AIDE_SOURCES[sid]?.url, `${id} : source ${sid} connue`);
}
let lignes = 0;
for (const [trame, panels] of Object.entries(A.AIDE_ONGLETS)) for (const [panel, liste] of Object.entries(panels)) for (const id of liste) assert.ok(A.AIDE_THEMES[id], `${trame}/${panel} : fiche ${id}`);
for (const [trame, map] of Object.entries(A.AIDE_LIGNES)) for (const [key, [id, a]] of Object.entries(map)) { assert.ok(A.AIDE_THEMES[id], `${trame} ${key}`); assert.ok(typeof A.AIDE_ACTIONS[a] === 'string'); lignes += 1; }
assert.equal(lignes, 904, '904 entrées rattachées');

// Recherche : onglet et ligne.
assert.equal(A.themesDeLOnglet('icpe_v1', 'p-conf-local').length, 18, 'Conf. Local : 18 règles');
assert.ok(A.themesDeLOnglet('icpe_v1', 'p-conf-local').some((t) => t.id === 'ventilation'));
assert.deepEqual(A.themesDeLOnglet('vmc', 'p-vmc-c4').map((t) => t.id), A.themesDeLOnglet('vmc', 'p-vmc-c1').map((t) => t.id), 'les caissons VMC suivent le modèle du premier');
assert.equal(A.themesDeLOnglet('icpe_v1', 'p-inconnu').length, 0);
const cle = Object.keys(A.AIDE_LIGNES.icpe_v1).find((k) => /\|\|Ventilation basse$/.test(k));
const [sectionCode] = cle.split('||');
assert.equal(A.ficheDeLaLigne('icpe_v1', sectionCode, 'Ventilation basse').theme.id, 'ventilation');
assert.equal(A.ficheDeLaLigne('icpe_v1', sectionCode, ' Ventilation basse ').theme.id, 'ventilation', 'libellé rogné');
assert.equal(A.ficheDeLaLigne('icpe_v1', sectionCode, 'Inexistant'), null);
assert.equal(A.panneauDeSection('conf-local.partie_local'), 'p-conf-local');

// Natures : une des quatre mentions du dossier.
for (const id of ids) assert.ok(['ob', 'pr', 'co', 'det'].includes(A.natureTheme(A.AIDE_THEMES[id]).code));
assert.equal(A.natureTheme(A.AIDE_THEMES.panique).label, 'Règle à déterminer');

// Ventilation : exemple du dossier (300 kW, 30 m²) ; garde-fous.
const v = A.sectionsVentilation({ kw: '300', surface: '30', passageLibrePct: '60' });
assert.equal(v.statut, 'aide');
assert.equal(A.arrondiSuperieur(v.vb), 13.05, 'SVB = 300/23 arrondi vers le haut');
assert.equal(v.vh, 3, 'SVH = max(30/10 ; 2,5)');
assert.equal(A.arrondiSuperieur(v.brutVhM2, 4), 0.05, 'ouverture brute avec grille à 60 %');
assert.equal(A.sectionsVentilation({ kw: '40', surface: '10' }).vb, 2.5, 'minimum géométrique 2,5 dm²');
assert.equal(A.sectionsVentilation({ kw: '', surface: '30' }).statut, 'manquantes', 'pas de seuil par défaut');
assert.equal(A.sectionsVentilation({ kw: '300', surface: '' }).statut, 'manquantes');
assert.equal(A.sectionsVentilation({ kw: '2000', surface: '30' }).statut, 'hors', 'hors domaine à partir de 2 000 kW');
assert.equal(A.sectionsVentilation({ kw: '300', surface: '30' }).coefficientConnu, false, 'grille inconnue : fiche produit demandée');
assert.equal(A.sectionsVentilation({ kw: '300', surface: '30', passageLibrePct: '150' }).coefficientConnu, false, 'coefficient hors 0-100 refusé');
assert.equal(A.puissanceDeLaVisite('300'), 300); assert.equal(A.puissanceDeLaVisite('2 x 150'), null, 'saisie ambiguë : pas de reprise'); assert.equal(A.puissanceDeLaVisite(''), null);

// VMC, hydraulique, index, ECS.
assert.deepEqual(A.DEBITS_VMC[3], [105, 30, 75]);
assert.equal(A.debitDepuisVitesse('2', '0,01'), 72, 'Q = 3600 × v × S');
assert.equal(A.debitDepuisVitesse('', '0,01'), null);
assert.ok(Math.abs(A.puissanceHydraulique('5', '10') - 58.15) < 1e-9, 'P ≈ 1,163 × q × ΔT');
assert.deepEqual(A.ecartIndex('1 245', '1 190'), { ecart: 55, negatif: false });
assert.equal(A.ecartIndex('10', '20').negatif, true, 'écart négatif : remplacement ou remise à zéro');
assert.equal(A.ecartIndex('', '20'), null);
assert.ok(/respectée/.test(A.repereEcs('toi', '48')) && /dépassée/.test(A.repereEcs('toi', '52')));
assert.ok(/atteint/.test(A.repereEcs('sto', '57')) && /traitement thermique/.test(A.repereEcs('sto', '52')));
assert.equal(A.repereEcs('sto', ''), null);
assert.ok(Number.isNaN(A.nombre('abc')) && A.nombre('1 245,5') === 1245.5);

// Garde-fous : aucun avis n'est écrit par l'aide ; les contrôles ne font qu'ouvrir la fiche.
const ui = read('AideReglementaire.js');
for (const interdit of ['upsertControle', 'upsertChamp', 'runAsync', 'INSERT INTO', 'UPDATE ']) assert.ok(!ui.includes(interdit), `l'aide n'écrit rien (${interdit})`);
for (const f of ['PersistentControleGenerique.js', 'PresetControleGenerique.js', 'VmcControleGenerique.js']) assert.ok(read(f).includes('ouvrirAideReglementaire'), `${f} : appui long sur l'intitulé`);
assert.ok(read('VisitChrome.js').includes('onLongPress={() => ouvrirAideReglementaire'), 'appui long sur les onglets');
assert.ok(read('VisiteScreen.js').includes('<AideReglementaireHost />'), 'fenêtre montée dans la visite');
console.log('aide réglementaire par appui long : OK');
