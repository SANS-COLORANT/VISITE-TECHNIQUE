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
  return String(attrs || '').replace(/\s+t="[^"]*"/g, '');
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

function patcherCelluleXml(xml, patch) {
  const adresse = String(patch?.address || '').toUpperCase();
  if (!/^[A-Z]+[1-9][0-9]*$/.test(adresse)) throw new Error(`Adresse Excel invalide : ${patch?.address}`);

  const valeur = construireValeurXml(patch.value, patch.valueType || 'text');
  const celluleRegex = new RegExp(`<c\\b([^>]*\\br="${adresse}"[^>]*)>([\\s\\S]*?)<\\/c>|<c\\b([^>]*\\br="${adresse}"[^>]*)\\/>`);
  const cellule = String(xml || '').match(celluleRegex);

  if (cellule) {
    const attrs = cellule[1] || cellule[3] || '';
    const contenu = cellule[2] || '';
    if (/<f\b/.test(contenu) && patch.allowFormulaOverwrite !== true) {
      throw new Error(`La cellule ${adresse} contient une formule et ne peut pas être remplacée.`);
    }
    const attrsSansType = sansAttributType(attrs);
    const attrsFinaux = `${attrsSansType}${valeur.type ? ` t="${valeur.type}"` : ''}`;
    return String(xml).replace(celluleRegex, `<c${attrsFinaux}>${valeur.xml}</c>`);
  }

  if (patch.value === null || patch.value === undefined || patch.value === '') return String(xml || '');

  const ligne = adresse.match(/[0-9]+$/)[0];
  const ligneRegex = new RegExp(`(<row\\b[^>]*\\br="${ligne}"[^>]*>)([\\s\\S]*?)(<\\/row>)`);
  const matchLigne = String(xml || '').match(ligneRegex);
  if (!matchLigne) throw new Error(`Ligne Excel ${ligne} absente : impossible de créer ${adresse} sans modifier la structure.`);

  const nouvelle = `<c r="${adresse}"${valeur.type ? ` t="${valeur.type}"` : ''}>${valeur.xml}</c>`;
  return String(xml).replace(ligneRegex, `${matchLigne[1]}${matchLigne[2]}${nouvelle}${matchLigne[3]}`);
}

module.exports = {
  obtenirCheminsFeuilles,
  patcherCelluleXml,
  xmlEscape,
  xmlUnescape,
};
