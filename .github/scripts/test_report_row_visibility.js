const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.resolve(__dirname,'../../reportRowVisibility.js'),'utf8')
  .replace(/export\s+(?=function\s)/g,'');
const { marqueVideRapport, filtrerLignesRapport } =
  new Function(script + '\nreturn {marqueVideRapport,filtrerLignesRapport};')();
for (const x of ['', '  ', '/', ' / ', '//', 'S.O', 'S.O.', 'SO', 'S O', 'Sans objet', 'SANS OBJET.'])
  assert.equal(marqueVideRapport(x), true, x);
for (const x of ['N.S', 'N.V', 'S', 'Contrôle effectué', '0', '28°C'])
  assert.equal(marqueVideRapport(x), false, x);
const rows = [
  {avis:'',comment:'/'}, {avis:'S.O',comment:'/'},
  {avis:'S.O',comment:'Automatique'},
  {avis:'',comment:'Température 55 °C'},
  {avis:'N.S',comment:'/'}, {avis:'S',comment:'/'},
  {avis:'N.V',comment:'/'}, {avis:'',comment:'0'},
];
assert.equal(filtrerLignesRapport(rows, false).length,5);
assert.equal(filtrerLignesRapport(rows, true).length,8);
assert.equal(filtrerLignesRapport(rows.slice(0,3), false).length,0);
console.log('Rapports PDF et Word : suppression des lignes / et S.O : OK');
