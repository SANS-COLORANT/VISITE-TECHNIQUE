/** Formats locaux de trames : données JSON uniquement, jamais du code exécutable. */
import * as XLSX from 'xlsx';
import { construireIndexSemantiqueTrame } from './trameSemanticMesh.js';
import { defaultPointPresets } from './tramePointPresets.js';
import { validerDefinitionTrame } from './trameValidation.js';

export const TRAME_PACKAGE_FORMAT = 'metra.trame.v1';
export const TRAME_MANIFEST_SHEET = 'METRA_TRAME';
const LIMIT = 5 * 1024 * 1024;
const clone = (value) => JSON.parse(JSON.stringify(value));
const codeSection = (panel, section) => panel.replace('p-', '') + '.' + section.toLowerCase().replace(/[^a-z0-9]+/g, '_');

export function validateLocalTrame(definition) {
  const result = validerDefinitionTrame(definition);
  if (!result.ok) throw new Error(result.erreurs.join('\n'));
  if (JSON.stringify(definition).length > LIMIT) throw new Error('La trame dépasse 5 Mo.');
  if (!/^[a-z][a-z0-9_-]{1,100}$/i.test(definition.id)) throw new Error('Identifiant de trame invalide.');
  if (typeof definition.nom !== 'string' || (definition.description != null && typeof definition.description !== 'string')) throw new Error('Nom ou description de trame invalide.');
  if (String(definition.nom).length > 100) throw new Error('Nom de trame trop long (100 caractères maximum).');
  const wb = XLSX.read(definition.excel.templateBase64, { type: 'base64' });
  if (!wb.Sheets[definition.excel.mainSheet]) throw new Error('Feuille principale absente du modèle Excel.');
  const keys = new Set(); const cells = new Set(); let count = 0;
  for (const [panel, sections] of Object.entries(definition.ui.panels)) {
    if (!/^p-[a-z][a-z0-9_-]{0,90}$/i.test(panel) || typeof definition.ui.labels[panel] !== 'string') throw new Error('Identifiant ou libellé d’onglet invalide.');
    if (!definition.ui.tabOrder.includes(panel)) throw new Error('Un onglet de la trame est inaccessible.');
    for (const [section, fields] of Object.entries(sections)) {
      const sectionCode = codeSection(panel, section);
      if (['__proto__', 'constructor', 'prototype'].includes(section) || !section.trim() || section.length > 150 || !Array.isArray(fields)) throw new Error('Rubrique invalide.');
      for (const field of fields) {
        const key = `${sectionCode}||${field.cle}`;
        if (typeof field.cle !== 'string' || !field.cle.trim() || field.cle.includes('||') || field.cle.length > 200 || keys.has(key)) throw new Error('Point vide ou en double : ' + field.cle);
        keys.add(key); count++;
        if (!['champ', 'controle'].includes(field.type)) throw new Error('Type de point invalide.');
        if (field.options && (!Array.isArray(field.options) || field.options.length > 100 || field.options.some((o) => typeof o !== 'string' || o.length > 500))) throw new Error('Liste de choix invalide.');
        if (field.label != null && typeof field.label !== 'string') throw new Error('Libellé du point invalide.');
        if (field.meta && !['client', 'site', 'local', 'type', 'dateVisite', 'adresse'].includes(field.meta)) throw new Error('Champ d’en-tête inconnu.');
        if (field.presets) for (const avis of ['S', 'N.S', 'N.R', 'S.O', 'N.V']) {
          const choices = field.presets[avis] || [];
          if (!Array.isArray(choices) || choices.length > 100 || choices.some((p) => !p || typeof p.commentaire !== 'string' || p.commentaire.length > 5000)) throw new Error('Commentaires prédéfinis invalides.');
        }
        if (field.numeric && (!Number.isFinite(field.numeric.min) || !Number.isFinite(field.numeric.max) || field.numeric.min >= field.numeric.max || !Number.isFinite(field.numeric.step) || !(field.numeric.step > 0))) throw new Error('Bornes numériques invalides.');
        const mappings = definition.excel.fieldMappings.filter((m) => m.sectionCode === sectionCode && m.cle === field.cle);
        if (mappings.length !== 1 || mappings[0].type !== field.type) throw new Error('Mapping Excel manquant ou ambigu : ' + field.cle);
        const m = mappings[0]; const sheet = m.sheet || definition.excel.mainSheet;
        if (!wb.Sheets[sheet]) throw new Error('Feuille Excel inconnue : ' + sheet);
        for (const cell of [m.valueCell, m.commentCell].filter(Boolean)) {
          const keyCell = `${sheet}!${cell}`;
          if (cells.has(keyCell)) throw new Error('Cellule Excel utilisée plusieurs fois : ' + keyCell);
          cells.add(keyCell);
        }
      }
    }
  }
  if (!count || count > 600) throw new Error('La trame doit contenir entre 1 et 600 points.');
  if ((definition.ui.specialPanels || []).some((p) => !['p-equip', 'p-remarques', 'p-photos'].includes(p))) throw new Error('Cette copie doit utiliser les panneaux génériques.');
  return definition;
}

export function editableTrameCopy(definition) {
  const draft = clone(definition);
  draft.libraryManaged = true;
  draft.familyId = definition.libraryManaged ? (definition.familyId || definition.id) : `copy_${definition.id}_${Date.now()}`;
  if (!definition.libraryManaged) draft.nom = `${definition.nom} personnalisée`;
  draft.ui.specialPanels = ['p-equip', 'p-remarques', 'p-photos'];
  const originalIndex = construireIndexSemantiqueTrame(definition);
  for (const [panel, sections] of Object.entries(draft.ui.panels)) for (const [section, fields] of Object.entries(sections)) for (const field of fields) {
    const source = [...originalIndex.byStorage.values()].find((r) => r.panelId === panel && r.section === section && r.field.cle === field.cle);
    if (source && !field.semanticKey) field.semanticKey = source.semanticKey;
  }
  if (!definition.libraryManaged) {
    const semantic = construireIndexSemantiqueTrame(definition);
    const wb = XLSX.read(draft.excel.templateBase64, { type: 'base64', cellStyles: true });
    const sheet = wb.Sheets[draft.excel.mainSheet];
    const panels = {}; const labels = { ...draft.ui.labels }; const mappings = []; const cells = new Set();
    for (const [originalPanel, sections] of Object.entries(draft.ui.panels)) {
      const panel = originalPanel === 'p-infos' || originalPanel === 'p-vmc-infos' || originalPanel === 'p-pa-infos' ? 'p-infos' : `p-personnel-${originalPanel.replace(/^p-/, '')}`;
      panels[panel] = sections; labels[panel] = draft.ui.labels[originalPanel] || originalPanel;
      for (const [section, fields] of Object.entries(sections)) for (const field of fields) {
        const source = [...semantic.byStorage.values()].find((r) => r.panelId === originalPanel && r.section === section && r.field.cle === field.cle);
        if (source) field.semanticKey = source.semanticKey;
        delete field.vmc; delete field.preAllumage;
        if (field.type === 'controle' && !field.presets) field.presets = defaultPointPresets(field.cle);
        const existing = draft.excel.fieldMappings.find((m) => m.panelId === originalPanel && m.section === section && m.cle === field.cle);
        let mapping = existing ? { ...existing } : null;
        const duplicate = mapping && [mapping.valueCell, mapping.commentCell].filter(Boolean).some((cell) => cells.has(cell));
        if (!mapping || duplicate) {
          const row = XLSX.utils.decode_range(sheet['!ref'] || 'A1').e.r + 3;
          XLSX.utils.sheet_add_aoa(sheet, [[`${labels[panel]} — ${section}`], [field.cle, '', '']], { origin: `A${row - 1}` });
          mapping = { valueCell: `${field.type === 'controle' ? 'B' : 'C'}${row}`, commentCell: field.type === 'controle' ? `C${row}` : null };
        }
        [mapping.valueCell, mapping.commentCell].filter(Boolean).forEach((cell) => cells.add(cell));
        mappings.push({ ...mapping, panelId: panel, section, sectionCode: codeSection(panel, section), cle: field.cle, type: field.type });
      }
    }
    draft.ui.panels = panels; draft.ui.labels = labels; draft.excel.fieldMappings = mappings;
    draft.excel.templateBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  }
  draft.ui.tabOrder = [...new Set([...Object.keys(draft.ui.panels), 'SEP', ...draft.ui.specialPanels])];
  return draft;
}

export function changeTramePoint(draft, panel, section, oldKey, changes) {
  const next = clone(draft);
  const fields = next.ui.panels[panel]?.[section];
  if (!fields) throw new Error('Rubrique inconnue.');
  const old = fields.find((f) => f.cle === oldKey);
  if (!old) throw new Error('Point introuvable.');
  const key = String(changes.cle ?? old.cle).trim();
  if (!key || fields.some((f) => f !== old && f.cle.toLowerCase() === key.toLowerCase())) throw new Error('Intitulé vide ou déjà utilisé.');
  const mapping = next.excel.fieldMappings.find((m) => m.sectionCode === codeSection(panel, section) && m.cle === oldKey);
  const oldType = old.type;
  if (old.meta && changes.type && changes.type !== oldType) throw new Error('Une information d’en-tête doit rester une information.');
  Object.assign(old, changes, { cle: key });
  if (!mapping) throw new Error('Mapping du point introuvable.');
  mapping.cle = key; mapping.type = old.type;
  if (changes.type && changes.type !== oldType) {
    const row = mapping.valueCell.match(/[0-9]+$/)[0];
    mapping.valueCell = `${old.type === 'controle' ? 'B' : 'C'}${row}`;
    mapping.commentCell = old.type === 'controle' ? `C${row}` : null;
  }
  const wb = XLSX.read(next.excel.templateBase64, { type: 'base64', cellStyles: true });
  const sheet = wb.Sheets[mapping.sheet || next.excel.mainSheet];
  const row = mapping.valueCell.match(/[0-9]+$/)[0];
  sheet[`A${row}`] = { ...(sheet[`A${row}`] || {}), t: 's', v: key }; delete sheet[`A${row}`].w;
  next.excel.templateBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  return next;
}

export function addTramePoint(draft, panel, section, field) {
  const next = clone(draft);
  const fields = next.ui.panels[panel]?.[section];
  if (!fields) throw new Error('Rubrique inconnue.');
  const cle = String(field.cle || '').trim();
  if (!cle || fields.some((f) => f.cle.toLowerCase() === cle.toLowerCase())) throw new Error('Intitulé vide ou déjà utilisé.');
  const wb = XLSX.read(next.excel.templateBase64, { type: 'base64', cellStyles: true });
  const sheet = wb.Sheets[next.excel.mainSheet];
  const row = XLSX.utils.decode_range(sheet['!ref'] || 'A1').e.r + 3;
  XLSX.utils.sheet_add_aoa(sheet, [[`${next.ui.labels[panel]} — ${section}`], [cle]], { origin: `A${row - 1}` });
  fields.push({ ...field, cle });
  next.excel.fieldMappings.push({ panelId: panel, section, sectionCode: codeSection(panel, section), cle, type: field.type,
    valueCell: `${field.type === 'controle' ? 'B' : 'C'}${row}`, commentCell: field.type === 'controle' ? `C${row}` : null });
  // Les cellules de saisie ajoutées doivent rester dans la plage sérialisée.
  const range = XLSX.utils.decode_range(sheet['!ref']); range.e.c = Math.max(range.e.c, 2); sheet['!ref'] = XLSX.utils.encode_range(range);
  next.excel.templateBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  return next;
}

export function exportTramePackage(definition) {
  validateLocalTrame(definition);
  return JSON.stringify({ format: TRAME_PACKAGE_FORMAT, definition }, null, 2);
}
export function importTramePackage(text) {
  if (typeof text !== 'string' || text.length > LIMIT) throw new Error('Fichier de trame trop volumineux.');
  const data = JSON.parse(text);
  if (data.format !== TRAME_PACKAGE_FORMAT) throw new Error('Format de trame METRA non reconnu.');
  return validateLocalTrame(data.definition);
}
export function writeTrameManifest(wb, definition) {
  if (!definition.libraryManaged) return;
  const text = exportTramePackage(definition);
  const rows = [[TRAME_PACKAGE_FORMAT]];
  for (let i = 0; i < text.length; i += 28000) rows.push([text.slice(i, i + 28000)]);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  if (wb.Sheets[TRAME_MANIFEST_SHEET]) wb.Sheets[TRAME_MANIFEST_SHEET] = sheet;
  else XLSX.utils.book_append_sheet(wb, sheet, TRAME_MANIFEST_SHEET);
  wb.Workbook ||= {}; wb.Workbook.Sheets ||= wb.SheetNames.map((name) => ({ name }));
  wb.Workbook.Sheets[wb.SheetNames.indexOf(TRAME_MANIFEST_SHEET)] = { name: TRAME_MANIFEST_SHEET, Hidden: 1 };
}
export function readTrameManifest(wb) {
  const sheet = wb.Sheets[TRAME_MANIFEST_SHEET];
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows[0]?.[0] !== TRAME_PACKAGE_FORMAT || rows.length > 250) throw new Error('Définition embarquée de trame invalide.');
  return importTramePackage(rows.slice(1).map((r) => r[0]).join(''));
}

export function removeTramePoint(draft, panel, section, cle) {
  const next = clone(draft);
  const fields = next.ui.panels[panel]?.[section];
  const field = fields?.find((f) => f.cle === cle);
  if (!field) throw new Error('Point introuvable.');
  if (field.meta) throw new Error('Les informations d’en-tête sont conservées pour les exports.');
  const mapping = next.excel.fieldMappings.find((m) => m.sectionCode === codeSection(panel, section) && m.cle === cle);
  next.ui.panels[panel][section] = fields.filter((f) => f !== field);
  next.excel.fieldMappings = next.excel.fieldMappings.filter((m) => m !== mapping);
  const wb = XLSX.read(next.excel.templateBase64, { type: 'base64', cellStyles: true });
  const sheet = wb.Sheets[mapping.sheet || next.excel.mainSheet];
  const row = mapping.valueCell.match(/\d+$/)[0];
  for (const col of ['A', 'B', 'C', 'D', 'E']) delete sheet[`${col}${row}`];
  next.excel.templateBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  return next;
}

export function renameTrameSection(draft, panel, oldName, newName) {
  const next = clone(draft); const name = String(newName || '').trim();
  const sections = next.ui.panels[panel];
  if (!sections?.[oldName] || !name || (name !== oldName && sections[name])) throw new Error('Nom de rubrique vide ou déjà utilisé.');
  if (oldName === 'Général') throw new Error('La rubrique d’en-tête est conservée.');
  const affected = next.excel.fieldMappings.filter((m) => m.panelId === panel && m.section === oldName);
  next.ui.panels[panel] = Object.fromEntries(Object.entries(sections).map(([key, fields]) => [key === oldName ? name : key, fields]));
  for (const m of affected) { m.section = name; m.sectionCode = codeSection(panel, name); }
  if (affected.length) {
    const wb = XLSX.read(next.excel.templateBase64, { type: 'base64', cellStyles: true });
    const sheet = wb.Sheets[next.excel.mainSheet];
    const row = Math.min(...affected.map((m) => Number(m.valueCell.match(/\d+$/)[0]))) - 3;
    const merged = (sheet['!merges'] || []).some((m) => m.s.r === row - 1 && m.e.r === row - 1 && m.s.c === 0 && m.e.c >= 2);
    if (row > 0 && merged) { sheet[`A${row}`] = { ...(sheet[`A${row}`] || {}), t: 's', v: name }; delete sheet[`A${row}`].w; }
    next.excel.templateBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  }
  return next;
}
