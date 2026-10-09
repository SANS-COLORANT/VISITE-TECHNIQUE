const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const pictos = read('relevePictos.js').replace(/export /g, '');
const mod = read('releveMultiligne.js').replace(/^import .*$/m, '').replace(/export /g, '');
const R = new Function(`${pictos}\n${mod}; return {lignesReleve, lireLigneReleve, decouperReleves, formaterLigneReleve, formaterReleves, compteursDepuisCellule, temperaturesDepuisCellule, pointsDeLaTemperature, formaterTemperatureGroupee};`)();

// Lignes : sauts simples, doubles, espaces, ancien séparateur « | ».
assert.deepEqual(R.lignesReleve('a\n\n  \nb\r\nc'), ['a', 'b', 'c']);
assert.deepEqual(R.lignesReleve('x : 1 | y : 2'), ['x : 1', 'y : 2']);
assert.deepEqual(R.lignesReleve(''), []);
assert.deepEqual(R.lignesReleve(null), []);

// Lecture d'une ligne.
assert.deepEqual(R.lireLigneReleve('Compteur gaz : 1 234,5 m³'), { label: 'Compteur gaz', valeur: '1234,5', unite: 'm³' });
assert.deepEqual(R.lireLigneReleve('4521 MWh'), { label: null, valeur: '4521', unite: 'MWh' });
assert.deepEqual(R.lireLigneReleve('56,2'), { label: null, valeur: '56,2', unite: '' });
assert.deepEqual(R.lireLigneReleve('Chaufferie B : 98'), { label: 'Chaufferie B', valeur: '98', unite: '' });
assert.deepEqual(R.lireLigneReleve('RAS'), { label: null, valeur: 'RAS', unite: '' });

// Cellule multi-lignes avec double saut : un compteur par ligne non vide.
const cpt = R.compteursDepuisCellule({ base: 'compteur énergie', destination: 'Index compteur énergie (MWh)', unite: 'MWh', texte: '120,5\n\n\n 340 MWh\n' });
assert.equal(cpt.length, 2);
assert.deepEqual(cpt.map((c) => [c.label, c.valeur, c.unite, c.destination]),
  [['compteur énergie', '120,5', 'MWh', 'Index compteur énergie (MWh)'], ['compteur énergie 2', '340', 'MWh', 'Index compteur énergie (MWh)']]);
// Noms donnés et doublons de nom.
const nommes = R.compteursDepuisCellule({ base: 'gaz', destination: 'd', unite: 'm³', texte: 'Bât A : 10\nBât A : 20\nBât B : 30 m³' });
assert.deepEqual(nommes.map((c) => c.label), ['Bât A', 'Bât A 2', 'Bât B']);
// Une seule ligne : comportement historique.
assert.equal(R.compteursDepuisCellule({ base: 'gaz', destination: 'd', unite: 'm³', texte: '55' }).length, 1);
assert.equal(R.compteursDepuisCellule({ base: 'gaz', destination: 'd', unite: 'm³', texte: '\n\n' }).length, 0);

// Températures : première valeur dans le champ, suivantes en points du circuit.
const t = R.temperaturesDepuisCellule({ cle: 'CHAUFFAGE: T° départ (°C)', texte: '65\n\n62,5 °C' });
assert.equal(t.valeur, '65');
assert.deepEqual(t.points, [{ libelle: 'Chauffage · Départ 2', valeur: '62,5', unite: '°C' }]);
const e = R.temperaturesDepuisCellule({ cle: 'EAU CHAUDE SANITAIRE: T° stockage (°C)', texte: 'Ballon haut : 58\nBallon bas : 41' });
assert.deepEqual(e.points, [{ libelle: 'ECS · Ballon bas', valeur: '41', unite: '°C' }]);
assert.deepEqual(R.temperaturesDepuisCellule({ cle: 'x', texte: '' }), { valeur: '', points: [] });

// Export : un relevé = valeur seule (historique), plusieurs = une ligne chacun « nom : index unité ».
assert.equal(R.formaterReleves([{ label: 'Gaz', valeur: '12', unite: 'm³' }]), '12 m³');
assert.equal(R.formaterReleves([{ label: 'Gaz A', valeur: '12', unite: 'm³' }, { label: 'Gaz B', valeur: '', unite: 'm³' }]), '12 m³');
assert.equal(R.formaterReleves([{ label: 'Gaz A', valeur: '12', unite: 'm³' }, { label: 'Gaz B', valeur: '7,5', unite: 'm³' }]), 'Gaz A : 12 m³\nGaz B : 7,5 m³');
assert.equal(R.formaterReleves([{ label: 'Gaz', valeur: '12', unite: '' }], { avecNomSeul: true }), 'Gaz : 12');
assert.equal(R.formaterReleves([]), '');

// Aller-retour : ce que l'export écrit, l'import le relit.
const cellule = R.formaterReleves([{ label: 'Gaz A', valeur: '12', unite: 'm³' }, { label: 'Gaz B', valeur: '7,5', unite: 'm³' }]);
assert.deepEqual(R.decouperReleves(cellule).map((r) => [r.label, r.valeur, r.unite]), [['Gaz A', '12', 'm³'], ['Gaz B', '7,5', 'm³']]);
// Température groupée : mesures ajoutées du même circuit et sens.
const pts = [
  { libelle: 'Chauffage · Départ 2', valeur: '62,5', unite: '°C' },
  { libelle: 'Chauffage · Retour 2', valeur: '48', unite: '°C' },
  { libelle: 'ECS · Ballon haut', valeur: '58', unite: '°C' },
  { libelle: 'Chauffage · Mélange', valeur: '40', unite: '°C' },
  { libelle: 'Chauffage · Départ 3', valeur: '', unite: '°C' },
];
assert.equal(R.pointsDeLaTemperature('CHAUFFAGE: T° départ (°C)', pts).length, 1);
assert.equal(R.formaterTemperatureGroupee('CHAUFFAGE: T° départ (°C)', '65', pts), 'Départ : 65 °C\nDépart 2 : 62,5 °C');
assert.equal(R.formaterTemperatureGroupee('EAU CHAUDE SANITAIRE: T° stockage (°C)', '55', pts), 'Stockage : 55 °C\nBallon haut : 58 °C');
assert.equal(R.formaterTemperatureGroupee('PRIMAIRE: T° départ (°C)', '90', pts), '90', 'sans mesure ajoutée : inchangé');
assert.equal(R.formaterTemperatureGroupee('CHAUFFAGE: T° départ (°C)', '', pts), 'Départ 2 : 62,5 °C');
console.log('releve multiligne : OK');
