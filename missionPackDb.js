/**
 * Partage par fichier — export / import d'un fichier .metra.json.
 * Logique pure : missionPackCore.js. Ici : lecture de la base, fichiers, partage.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { getDb } from './db.js';
import { buildMissionPack, parseMissionPack, planMissionPackImport } from './missionPackCore.js';
import { queryForms, queryRefLists, queryReportTemplates } from './missionFormsQueries.js';
import { queryMissionModels } from './missionModelsQueries.js';
import { MODELES_WORD_DIR } from './missionReportTemplateExporter.js';

async function ensureDir(dir) {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

export async function exporterPackMission({ share = true } = {}) {
  const db = await getDb();
  const [forms, lists, models, templates] = await Promise.all([queryForms(db), queryRefLists(db), queryMissionModels(db), queryReportTemplates(db)]);
  const withFiles = [];
  for (const t of templates) {
    try {
      withFiles.push({ ...t, docx_base64: await FileSystem.readAsStringAsync(t.file_uri, { encoding: FileSystem.EncodingType.Base64 }) });
    } catch { /* fichier disparu : modèle ignoré */ }
  }
  const pack = buildMissionPack({ forms, lists, models, templates: withFiles });
  const stamp = new Date().toISOString().slice(0, 10);
  const uri = `${FileSystem.cacheDirectory}METRA_trames_modeles_${stamp}.metra.json`;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(pack));
  if (share && await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Partager mes trames et modèles METRA' });
  return { uri, counts: { forms: pack.forms.length, lists: pack.lists.length, models: pack.models.length, templates: pack.templates.length } };
}

export async function importerPackMission() {
  const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'application/octet-stream', '*/*'], copyToCacheDirectory: true, multiple: false });
  if (picked?.canceled) return null;
  const asset = picked?.assets?.[0];
  if (!asset?.uri) throw new Error('Fichier non accessible.');
  const pack = parseMissionPack(await FileSystem.readAsStringAsync(asset.uri));
  const db = await getDb();
  const [forms, lists, models, templates] = await Promise.all([queryForms(db, { includeArchived: true }), queryRefLists(db), queryMissionModels(db), queryReportTemplates(db)]);
  const plan = planMissionPackImport(pack, { forms, lists, models, templates });
  const now = new Date().toISOString();
  const written = [];
  if (plan.templates.length) await ensureDir(MODELES_WORD_DIR);
  try {
    for (const t of plan.templates) {
      const uri = `${MODELES_WORD_DIR}${t.id}.docx`;
      await FileSystem.writeAsStringAsync(uri, t.docx_base64, { encoding: FileSystem.EncodingType.Base64 });
      written.push({ ...t, uri });
    }
    await db.withTransactionAsync(async () => {
      for (const l of plan.lists) await db.runAsync('INSERT INTO mission_ref_lists(id,label,items_json,source_name,created_at,updated_at) VALUES(?,?,?,?,?,?)', [l.id, l.label, l.items_json, l.source_name, now, now]);
      for (const f of plan.forms) await db.runAsync('INSERT INTO mission_forms(id,label,description,target_type,fields_json,version,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)', [f.id, f.label, f.description, f.target_type, f.fields_json, 1, f.source, now, now]);
      for (const m of plan.models) await db.runAsync('INSERT INTO mission_models(id,label,description,family,type,modules_json,layout_json,forms_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)', [m.id, m.label, m.description, m.family, m.type, m.modules_json, m.layout_json, m.forms_json, now, now]);
      for (const t of written) await db.runAsync('INSERT INTO mission_report_templates(id,label,file_uri,original_name,tags_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', [t.id, t.label, t.uri, t.original_name, null, now, now]);
    });
  } catch (e) {
    for (const t of written) await FileSystem.deleteAsync(t.uri, { idempotent: true });
    throw e;
  }
  return { added: { forms: plan.forms.length, lists: plan.lists.length, models: plan.models.length, templates: written.length }, skipped: plan.skipped };
}
