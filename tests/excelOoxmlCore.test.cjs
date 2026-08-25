const test = require('node:test');
const assert = require('node:assert/strict');
const { obtenirCheminsFeuilles, patcherCelluleXml } = require('../excelOoxmlCore.js');

test('résout les noms de feuilles sans modifier le workbook', () => {
  const workbook = '<workbook><sheets><sheet name="TRAME ICPE" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const rels = '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>';
  const map = obtenirCheminsFeuilles(workbook, rels);
  assert.equal(map.get('TRAME ICPE'), 'xl/worksheets/sheet1.xml');
});

test('modifie uniquement la valeur texte et conserve le style de cellule', () => {
  const before = '<worksheet><sheetData><row r="10"><c r="C10" s="15" t="s"><v>8</v></c><c r="D10" s="4"><v>12</v></c></row></sheetData><dataValidations count="1"/></worksheet>';
  const after = patcherCelluleXml(before, { address: 'C10', value: 'Nouvelle observation', valueType: 'text' });
  assert.match(after, /<c r="C10" s="15" t="inlineStr"><is><t xml:space="preserve">Nouvelle observation<\/t><\/is><\/c>/);
  assert.match(after, /<c r="D10" s="4"><v>12<\/v><\/c>/);
  assert.match(after, /<dataValidations count="1"\/>/);
});

test('préserve le type nombre OOXML', () => {
  const before = '<worksheet><sheetData><row r="25"><c r="C25" s="15"><v>3</v></c></row></sheetData></worksheet>';
  const after = patcherCelluleXml(before, { address: 'C25', value: '4', valueType: 'number' });
  assert.equal(after, '<worksheet><sheetData><row r="25"><c r="C25" s="15"><v>4</v></c></row></sheetData></worksheet>');
});

test('refuse une chaîne dans une cellule numérique ciblée', () => {
  const before = '<worksheet><sheetData><row r="183"><c r="C183" s="15"><v>2</v></c></row></sheetData></worksheet>';
  assert.throws(() => patcherCelluleXml(before, { address: 'C183', value: 'Mettre en place un extincteur', valueType: 'number' }), /numérique Excel invalide/);
});

test('ne supprime pas une formule par erreur', () => {
  const before = '<worksheet><sheetData><row r="8"><c r="C8" s="9"><f>SUM(A1:A2)</f><v>2</v></c></row></sheetData></worksheet>';
  assert.throws(() => patcherCelluleXml(before, { address: 'C8', value: '3', valueType: 'number' }), /contient une formule/);
});

test('échappe correctement accents, esperluettes, apostrophes et retours à la ligne', () => {
  const before = '<worksheet><sheetData><row r="4"><c r="B4" s="2" t="s"><v>1</v></c></row></sheetData></worksheet>';
  const after = patcherCelluleXml(before, { address: 'B4', value: 'Énergie & Service\nL\'installation "A"', valueType: 'text' });
  assert.match(after, /Énergie &amp; Service\nL&apos;installation &quot;A&quot;/);
});
