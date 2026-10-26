import { defaultPointPresets } from './tramePointPresets.js';
import * as XLSX from 'xlsx';
import { REMAR } from './remarTrame.js';
import { readTrameManifest, validateLocalTrame } from './trameLibrary.js';
const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const sectionCode = (p, s) => p.replace('p-', '') + '.' + s.toLowerCase().replace(/[^a-z0-9]+/g, '_');

export { defaultPointPresets } from './tramePointPresets.js';

/** Lit uniquement la structure d'un modèle Avis/Commentaire. L'aperçu reste modifiable avant enregistrement. */
export function draftTrameFromWorkbook(wb, sheetName) {
  const embedded = readTrameManifest(wb);
  if (embedded) return JSON.parse(JSON.stringify(embedded));
  const name = sheetName || wb.SheetNames.find((n) => /^trame/i.test(n)) || wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error('Aucune feuille de trame trouvée.');
  const value = (r, col = 'A') => String(sheet[`${col}${r}`]?.v ?? '').trim();
  if (!/nom du client/.test(norm(value(1))) || !/nom du site/.test(norm(value(2))) || !/date.*visite/.test(norm(value(5)))) {
    throw new Error('Utilise un modèle METRA avec les lignes Nom du client, Nom du site et Date de la visite en en-tête, puis des tableaux Intitulé / Avis / Commentaire.');
  }
  const panels = {}; const labels = {}; const mappings = [];
  let category = name; let section = ''; let panel = ''; let active = false; let num = 0;
  const categories = new Map();
  const end = XLSX.utils.decode_range(sheet['!ref'] || 'A1').e.r + 1;
  if (end > 5000) throw new Error('Le modèle dépasse 5 000 lignes.');
  const mergedTitles = new Set((sheet['!merges'] || []).filter((m) => m.s.c === 0 && m.e.c >= 2 && m.s.r === m.e.r).map((m) => m.s.r + 1));
  for (let r = 6; r <= end; r++) {
    const title = value(r);
    if (!title) { active = false; continue; }
    if (mergedTitles.has(r)) {
      active = false;
      if (title === title.toUpperCase() && /[A-ZÀ-Ü]/.test(title)) category = title;
      section = title;
      continue;
    }
    if (/^intitul[eé]$/i.test(title) && /^avis$/i.test(value(r, 'B')) && /^commentaire$/i.test(value(r, 'C'))) {
      section ||= category;
      if (!categories.has(category)) categories.set(category, num++ === 0 ? 'p-infos' : `p-modele-${num}`);
      panel = categories.get(category); labels[panel] = category;
      panels[panel] ||= {}; panels[panel][section] ||= [];
      active = true; continue;
    }
    if (!active) continue;
    const context = norm(`${category} ${section}`);
    const info = /information|distribution chauffage|distribution ecs|reseaux|compteur|temperature|consignes|parametres de fonctionnement/.test(context);
    const controle = /conformite|entretien|amelioration|descriptif technique/.test(context) || /^etat /i.test(norm(title));
    const field = { cle: title, type: controle || !info ? 'controle' : 'champ' };
    if (field.type === 'controle') { field.presets = defaultPointPresets(title); field.trameLabel = name; }
    if (/compteur/.test(context) && field.type === 'champ') field.numericIndex = true;
    if (/temperature/.test(context) && field.type === 'champ') field.numeric = { min: -30, max: 120, step: 0.1, start: 20, unit: '°C' };
    if (/date.*visite/.test(norm(title))) field.meta = 'dateVisite';
    if (norm(title) === 'nom du site') field.meta = 'site';
    if (norm(title) === 'adresse') field.meta = 'adresse';
    panels[panel][section].push(field);
    mappings.push({ panelId: panel, section, sectionCode: sectionCode(panel, section), cle: title, type: field.type,
      valueCell: `${field.type === 'controle' ? 'B' : 'C'}${r}`, commentCell: field.type === 'controle' ? `C${r}` : null });
  }
  if (!mappings.length || !panels['p-infos']) throw new Error('Aucun tableau Intitulé / Avis / Commentaire reconnu.');
  const general = ['Nom du client', 'Nom du site', 'Nom du local', 'Trame utilisée', 'Date de la visite'];
  const metas = ['client', 'site', 'local', 'type', 'dateVisite'];
  panels['p-infos']['Général'] = general.map((cle, i) => ({ cle, type: 'champ', meta: metas[i] }));
  general.forEach((cle, i) => mappings.push({ panelId: 'p-infos', section: 'Général', sectionCode: sectionCode('p-infos', 'Général'), cle, type: 'champ', valueCell: `B${i + 1}`, commentCell: null }));
  // Un modèle ne doit jamais injecter les constats d'un ancien classeur comme valeurs du jour.
  const clean = XLSX.read(XLSX.write(wb, { type: 'base64' }), { type: 'base64', cellStyles: true });
  const main = clean.Sheets[name];
  for (const m of mappings) {
    for (const ref of [m.valueCell, m.commentCell, `D${m.valueCell.match(/\d+$/)[0]}`, `E${m.valueCell.match(/\d+$/)[0]}`].filter(Boolean)) delete main[ref];
  }
  main.B4 = { t: 's', v: name };
  for (const tab of ['MATERIEL', 'REMARQUES', 'NOTE']) {
    const s = clean.Sheets[tab];
    if (!s) { XLSX.utils.book_append_sheet(clean, XLSX.utils.aoa_to_sheet([[tab]]), tab); continue; }
    for (const ref of Object.keys(s)) if (!ref.startsWith('!') && XLSX.utils.decode_cell(ref).r >= (tab === 'NOTE' ? 1 : 3)) delete s[ref];
  }
  const definition = {
    id: `draft_${Date.now()}`, version: 1, nom: name, actif: true, libraryManaged: true,
    ui: { panels, labels: { ...labels, 'p-equip': 'Équipements', 'p-remarques': 'Réserves', 'p-photos': 'Photos' },
      specialPanels: ['p-equip', 'p-remarques', 'p-photos'], tabOrder: [...Object.keys(panels), 'SEP', 'p-equip', 'p-remarques', 'p-photos'] },
    excel: { mainSheet: name, requiredSheets: [name], metadata: { client: 'B1', site: 'B2', local: 'B3', type: 'B4', dateVisite: 'B5', adresse: mappings.find((m) => norm(m.cle) === 'adresse')?.valueCell },
      templateBase64: XLSX.write(clean, { type: 'base64', bookType: 'xlsx' }), fieldMappings: mappings, tables: JSON.parse(JSON.stringify(REMAR.excel.tables)) },
  };
  return validateLocalTrame(definition);
}
