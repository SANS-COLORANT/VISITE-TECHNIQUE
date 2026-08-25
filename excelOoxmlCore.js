const XML_ENTITIES = Object.freeze({ '&apos;': "'", '&quot;': '"', '&gt;': '>', '&lt;': '<', '&amp;': '&' });

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlUnescape(value) {
  return String(value || '').replace(/&(apos|quot|gt|lt|amp);/g, (m) => XML_ENTITIES[m] || m);
}

function attrValue(attrs, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(attrs || '').match(new RegExp(`(?:^|\\s)${escaped}="([^"]*)"`));
  return match ? xmlUnescape(match[1]) : null;
}

function normaliserTarget(target) {
  const parts = `xl/${target}`.split('/');
  const stack = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

function obtenirCheminsFeuilles(workbookXml, relsXml) {
  const relations = new Map();
  for (const match of String(relsXml || '').matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/g)) {
    const id = attrValue(match[1], 'Id');
    const target = attrValue(match[1], 'Target');
    if (id && target) relations.set(id, normaliserTarget(target));
  }
  const feuilles = new Map();
  for (const match of String(workbookXml || '').matchAll(/<sheet\b([^>]*)\/?>(?:<\/sheet>)?/g)) {
    const nom = attrValue(match[1], 'name');
    const relationId = attrValue(match[1], 'r:id');
    const chemin = relationId ? relations.get(relationId) : null;
    if (nom && chemin) feuilles.set(nom, chemin);
  }
  return feuilles;
}

function sansAttributType(attrs) {
  return String(attrs || '').replace(/\s+t="[^"]*"/g, '').replace(/\s*\/\s*$/, '');
}

function construireValeurXml(value, valueType) {
  if (value === null || value === undefined || value === '') return { type: null, xml: '' };
  if (valueType === 'number') {
    const nombre = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
    if (!Number.isFinite(nombre)) throw new Error(`Valeur numérique Excel invalide : ${value}`);
    return { type: null, xml: `<v>${String(nombre)}</v>` };
  }
  if (valueType === 'boolean') return { type: 'b', xml: `<v>${value ? 1 : 0}</v>` };
  return { type: 'inlineStr', xml: `<is><t xml:space="preserve">${xmlEscape(value)}</t></is>` };
}

function creerCelluleXml(adresse, valeur) {
  return `<c r="${adresse}"${valeur.type ? ` t="${valeur.type}"` : ''}>${valeur.xml}</c>`;
}

function insererLigneManquante(xml, numeroLigne, celluleXml) {
  const source = String(xml || '');
  const sheetData = source.match(/<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/);
  if (!sheetData) throw new Error('Structure Excel invalide : sheetData introuvable.');
  const ligneXml = `<row r="${numeroLigne}">${celluleXml}</row>`;
  const lignes = [...sheetData[0].matchAll(/<row\b([^>]*)\br="([0-9]+)"[^>]*(?:\/>|>[\s\S]*?<\/row>)/g)];
  const suivante = lignes.find((match) => Number(match[2]) > Number(numeroLigne));
  let sheetDataModifie;
  if (suivante) {
    const index = suivante.index;
    sheetDataModifie = `${sheetData[0].slice(0, index)}${ligneXml}${sheetData[0].slice(index)}`;
  } else {
    sheetDataModifie = sheetData[0].replace(/<\/sheetData>$/, `${ligneXml}</sheetData>`);
  }
  return source.replace(sheetData[0], sheetDataModifie);
}

function patcherCelluleXml(xml, patch) {
  const adresse = String(patch?.address || '').toUpperCase();
  if (!/^[A-Z]+[1-9][0-9]*$/.test(adresse)) throw new Error(`Adresse Excel invalide : ${patch?.address}`);
  const source = String(xml || '');
  const valeur = construireValeurXml(patch.value, patch.valueType || 'text');

  // Tester d'abord la forme auto-fermante. L'ancienne expression pouvait traiter
  // <c .../> comme une balise ouvrante et consommer tout le XML jusqu'au prochain </c>.
  const adresseRegex = adresse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const celluleVideRegex = new RegExp(`<c\\b([^>]*\\br="${adresseRegex}"[^>]*)\\/>`);
  const celluleVide = source.match(celluleVideRegex);
  if (celluleVide) {
    const attrsFinaux = `${sansAttributType(celluleVide[1])}${valeur.type ? ` t="${valeur.type}"` : ''}`;
    return source.replace(celluleVideRegex, `<c${attrsFinaux}>${valeur.xml}</c>`);
  }

  const cellulePleineRegex = new RegExp(`<c\\b([^>]*\\br="${adresseRegex}"[^>/]*)>([\\s\\S]*?)<\\/c>`);
  const cellule = source.match(cellulePleineRegex);
  if (cellule) {
    const attrs = cellule[1] || '';
    const contenu = cellule[2] || '';
    if (/<f\b/.test(contenu) && patch.allowFormulaOverwrite !== true) {
      throw new Error(`La cellule ${adresse} contient une formule et ne peut pas être remplacée.`);
    }
    const attrsFinaux = `${sansAttributType(attrs)}${valeur.type ? ` t="${valeur.type}"` : ''}`;
    return source.replace(cellulePleineRegex, `<c${attrsFinaux}>${valeur.xml}</c>`);
  }

  if (patch.value === null || patch.value === undefined || patch.value === '') return source;
  const ligne = adresse.match(/[0-9]+$/)[0];
  const ligneRegex = new RegExp(`(<row\\b[^>]*\\br="${ligne}"[^>]*>)([\\s\\S]*?)(<\\/row>)`);
  const matchLigne = source.match(ligneRegex);
  const nouvelle = creerCelluleXml(adresse, valeur);
  if (!matchLigne) return insererLigneManquante(source, ligne, nouvelle);
  return source.replace(ligneRegex, `${matchLigne[1]}${matchLigne[2]}${nouvelle}${matchLigne[3]}`);
}

module.exports = { obtenirCheminsFeuilles, patcherCelluleXml, xmlEscape, xmlUnescape };
