/**
 * Partage par fichier — cœur pur (testé sous Node).
 *
 * Un « fichier de partage » METRA (.metra.json) contient des trames, des
 * listes de référence, des modèles de Mission et des modèles Word. À
 * l'import, rien n'est écrasé : ce qui existe déjà à l'identique est ignoré,
 * le reste reçoit de nouveaux identifiants et les liens internes (liste
 * utilisée par un champ, trames d'un modèle) sont recâblés. Aucune donnée de
 * Mission (points, photos, mesures, fiches remplies) n'est jamais partagée.
 */
import { normalizeFormFields } from './missionFormEngine.js';

export const PACK_FORMAT = 'METRA_MISSION_PACK';
export const PACK_VERSION = 1;
const MAX_TEMPLATE_BYTES = 15 * 1024 * 1024;

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v == null ? '' : String(v)).trim();

function json(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export function buildMissionPack({ forms = [], lists = [], models = [], templates = [], exportedBy = null, now = new Date() } = {}) {
  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    exported_at: new Date(now).toISOString(),
    exported_by: exportedBy,
    forms: forms.map((f) => ({ id: f.id, label: f.label, description: f.description || null, target_type: f.target_type || 'mission', fields: normalizeFormFields(f.fields_json ?? f.fields) })),
    lists: lists.map((l) => ({ id: l.id, label: l.label, items: arr(json(l.items_json ?? l.items, [])), source_name: l.source_name || null })),
    models: models.map((m) => ({ id: m.id, label: m.label, description: m.description || null, family: m.family || null, type: m.type || null, modules: json(m.modules_json, null), layout: json(m.layout_json, null), forms: arr(json(m.forms_json, [])) })),
    templates: templates.filter((t) => t.docx_base64).map((t) => ({ id: t.id, label: t.label, original_name: t.original_name || null, docx_base64: t.docx_base64 })),
  };
}

/** Lecture tolérante et sûre d'un fichier de partage. */
export function parseMissionPack(text) {
  let pack;
  try { pack = typeof text === 'string' ? JSON.parse(text) : text; } catch { throw new Error('Ce fichier n’est pas un fichier de partage METRA.'); }
  if (!pack || pack.format !== PACK_FORMAT) throw new Error('Ce fichier n’est pas un fichier de partage METRA.');
  if (Number(pack.version) > PACK_VERSION) throw new Error('Ce fichier vient d’une version plus récente de METRA : mets l’application à jour.');
  return {
    ...pack,
    forms: arr(pack.forms).filter((f) => str(f?.label)),
    lists: arr(pack.lists).filter((l) => str(l?.label)),
    models: arr(pack.models).filter((m) => str(m?.label)),
    templates: arr(pack.templates).filter((t) => str(t?.label) && typeof t.docx_base64 === 'string' && t.docx_base64.length * 0.75 <= MAX_TEMPLATE_BYTES),
  };
}

const fingerprint = {
  form: (f) => JSON.stringify([str(f.label).toLowerCase(), f.target_type || 'mission', normalizeFormFields(f.fields_json ?? f.fields).map((x) => ({ ...x, listId: undefined }))]),
  list: (l) => JSON.stringify([str(l.label).toLowerCase(), arr(json(l.items_json ?? l.items, []))]),
  model: (m) => JSON.stringify([str(m.label).toLowerCase(), m.family || null, m.type || null]),
  template: (t) => JSON.stringify([str(t.label).toLowerCase(), t.original_name || null]),
};

function freeLabel(label, taken) {
  if (!taken.has(label.toLowerCase())) return label;
  let candidate = `${label} (importé)`;
  let i = 2;
  while (taken.has(candidate.toLowerCase())) candidate = `${label} (importé ${i++})`;
  return candidate;
}

/**
 * Prépare l'import : lignes à insérer (nouveaux identifiants, liens recâblés)
 * et nombre d'éléments ignorés car déjà présents à l'identique.
 */
export function planMissionPackImport(pack, existing = {}, makeId = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`) {
  const result = { forms: [], lists: [], models: [], templates: [], skipped: 0 };
  const listMap = new Map();
  const formMap = new Map();

  const knownLists = new Map(arr(existing.lists).map((l) => [fingerprint.list(l), l.id]));
  const listLabels = new Set(arr(existing.lists).map((l) => str(l.label).toLowerCase()));
  for (const list of pack.lists) {
    const fp = fingerprint.list(list);
    if (knownLists.has(fp)) { listMap.set(list.id, knownLists.get(fp)); result.skipped += 1; continue; }
    const id = makeId('mlist');
    const label = freeLabel(str(list.label), listLabels);
    listLabels.add(label.toLowerCase());
    listMap.set(list.id, id);
    knownLists.set(fp, id);
    result.lists.push({ id, label, items_json: JSON.stringify(arr(list.items)), source_name: list.source_name || null });
  }

  const knownForms = new Map(arr(existing.forms).map((f) => [fingerprint.form(f), f.id]));
  const formLabels = new Set(arr(existing.forms).map((f) => str(f.label).toLowerCase()));
  const bySource = new Map(arr(existing.forms).filter((f) => f.source).map((f) => [f.source, f.id]));
  for (const form of pack.forms) {
    const fp = fingerprint.form(form);
    const already = knownForms.get(fp) || bySource.get(`partage:${form.id}`);
    if (already) { formMap.set(form.id, already); result.skipped += 1; continue; }
    const id = makeId('mform');
    const label = freeLabel(str(form.label), formLabels);
    formLabels.add(label.toLowerCase());
    formMap.set(form.id, id);
    knownForms.set(fp, id);
    const fields = normalizeFormFields(form.fields).map((field) => {
      if (!field.listId) return field;
      const mapped = listMap.get(field.listId);
      const { listId, ...rest } = field;
      return mapped ? { ...rest, listId: mapped } : rest;
    });
    result.forms.push({ id, label, description: form.description || null, target_type: form.target_type || 'mission', fields_json: JSON.stringify(fields), source: `partage:${form.id}` });
  }

  const knownModels = new Set(arr(existing.models).map(fingerprint.model));
  const modelLabels = new Set(arr(existing.models).map((m) => str(m.label).toLowerCase()));
  for (const model of pack.models) {
    if (knownModels.has(fingerprint.model(model))) { result.skipped += 1; continue; }
    const label = freeLabel(str(model.label), modelLabels);
    modelLabels.add(label.toLowerCase());
    const forms = arr(model.forms).map((id) => formMap.get(id)).filter(Boolean);
    result.models.push({
      id: makeId('mmod'),
      label,
      description: model.description || null,
      family: model.family || null,
      type: model.type || null,
      modules_json: model.modules ? JSON.stringify(model.modules) : null,
      layout_json: model.layout ? JSON.stringify(model.layout) : null,
      forms_json: forms.length ? JSON.stringify(forms) : null,
    });
  }

  const knownTemplates = new Set(arr(existing.templates).map(fingerprint.template));
  for (const template of pack.templates) {
    if (knownTemplates.has(fingerprint.template(template))) { result.skipped += 1; continue; }
    result.templates.push({ id: makeId('mtpl'), label: str(template.label), original_name: template.original_name || null, docx_base64: template.docx_base64 });
  }
  return result;
}
