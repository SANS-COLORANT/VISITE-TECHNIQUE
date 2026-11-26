/**
 * Modèles Word à balises — import d'un .docx et génération pour une Mission.
 * Le remplissage lui-même est pur (docxTemplateEngine.js) ; ce module ne fait
 * que décompresser, lire / écrire les parties XML et recompresser.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { unzip, zip } from 'react-native-zip-archive';
import { listTemplateTags, renderTemplateXml } from './docxTemplateEngine.js';
import { buildMissionTemplateData } from './missionTemplateContext.js';
import { ajouterModeleWord, lireSourceModeleWord, listerModelesWord } from './missionFormsDb.js';
import { MISSION_FAMILIES } from './missionsDb.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TEMPLATE_DIR = `${FileSystem.documentDirectory}metra-missions/modeles-word/`;
const native = (uri) => String(uri).replace(/^file:\/\//, '');
const TYPE_LABELS = new Map(MISSION_FAMILIES.flatMap((f) => f.types.map(([k, l]) => [k, l])));
const fileSafe = (value) => String(value || 'document').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'document';

async function ensureDir(dir) {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

async function extract(docxUri) {
  const dir = `${FileSystem.cacheDirectory}metra-docx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}/`;
  await ensureDir(dir);
  await unzip(native(docxUri), native(dir));
  return dir;
}

/** Parties XML contenant du texte : corps, en-têtes, pieds de page. */
async function textParts(dir) {
  const names = await FileSystem.readDirectoryAsync(`${dir}word/`);
  return names.filter((n) => /^(document|header\d*|footer\d*)\.xml$/.test(n)).map((n) => `${dir}word/${n}`);
}

/** Choisit un .docx, le garde dans l'application et relève ses balises. */
export async function importerModeleWord() {
  const picked = await DocumentPicker.getDocumentAsync({ type: [DOCX_MIME], copyToCacheDirectory: true, multiple: false });
  if (picked?.canceled) return null;
  const asset = picked?.assets?.[0];
  if (!asset?.uri) throw new Error('Fichier Word non accessible.');
  await ensureDir(TEMPLATE_DIR);
  const target = `${TEMPLATE_DIR}${Date.now()}_${fileSafe(asset.name?.replace(/\.docx$/i, ''))}.docx`;
  await FileSystem.copyAsync({ from: asset.uri, to: target });
  const dir = await extract(target);
  try {
    const tags = new Set();
    for (const part of await textParts(dir)) for (const tag of listTemplateTags(await FileSystem.readAsStringAsync(part))) tags.add(tag);
    if (!tags.size) throw new Error('Aucune balise {{…}} trouvée dans ce document. Ajoute par exemple {{mission.nom}} là où le nom doit apparaître.');
    const label = String(asset.name || 'Modèle Word').replace(/\.docx$/i, '');
    const id = await ajouterModeleWord({ label, fileUri: target, originalName: asset.name || null, tags: [...tags] });
    return { id, label, tags: [...tags] };
  } catch (e) {
    await FileSystem.deleteAsync(target, { idempotent: true });
    throw e;
  } finally {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  }
}

/** Remplit le modèle avec les données de la Mission et partage le .docx obtenu. */
export async function genererDepuisModeleWord(templateId, missionId, { share = true } = {}) {
  const template = (await listerModelesWord()).find((t) => t.id === templateId);
  if (!template) throw new Error('Modèle Word introuvable.');
  const source = await lireSourceModeleWord(missionId);
  if (!source.mission) throw new Error('Mission introuvable.');
  const data = buildMissionTemplateData({ ...source, typeLabel: TYPE_LABELS.get(source.mission.type) || '' });
  const dir = await extract(template.file_uri);
  try {
    for (const part of await textParts(dir)) {
      const xml = await FileSystem.readAsStringAsync(part);
      await FileSystem.writeAsStringAsync(part, renderTemplateXml(xml, data));
    }
    const outDir = `${FileSystem.documentDirectory}metra-missions/rapports/`;
    await ensureDir(outDir);
    const output = `${outDir}${fileSafe(template.label)}__${fileSafe(source.mission.label || missionId)}__${Date.now()}.docx`;
    await zip(native(dir), native(output)); // même appel que le rapport Word METRA (dossier racine)
    if (share && await Sharing.isAvailableAsync()) await Sharing.shareAsync(output, { mimeType: DOCX_MIME, dialogTitle: template.label });
    return { uri: output, name: output.split('/').pop() };
  } finally {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  }
}

export async function supprimerFichierModeleWord(fileUri) {
  if (fileUri) await FileSystem.deleteAsync(fileUri, { idempotent: true });
}

export const MODELES_WORD_DIR = TEMPLATE_DIR;
