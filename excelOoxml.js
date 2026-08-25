import * as FileSystem from 'expo-file-system';
import { unzip, zip } from 'react-native-zip-archive';

const { obtenirCheminsFeuilles, patcherCelluleXml } = require('./excelOoxmlCore.js');

function cheminNatif(uri) {
  return String(uri || '').replace(/^file:\/\//, '');
}

function uriFichier(path) {
  return String(path || '').startsWith('file://') ? path : `file://${path}`;
}

function dossierTemp(prefix = 'excel-ooxml') {
  return `${FileSystem.cacheDirectory}${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}/`;
}

async function existe(uri) {
  try { return (await FileSystem.getInfoAsync(uri)).exists; }
  catch { return false; }
}

export async function patcherClasseurXlsx({ sourceUri = null, sourceBase64 = null, patches = [] }) {
  if (!sourceUri && !sourceBase64) throw new Error('Aucune source Excel à préserver.');

  const dossier = dossierTemp();
  const sourceTemp = `${dossier}source.xlsx`;
  const extrait = `${dossier}unzipped`;
  const sortie = `${dossier}resultat.xlsx`;

  await FileSystem.makeDirectoryAsync(dossier, { intermediates: true });
  try {
    if (sourceUri) {
      if (!(await existe(sourceUri))) throw new Error('Le fichier Excel source de la visite est introuvable. Réimporte le fichier original pour garantir un export fidèle.');
      await FileSystem.copyAsync({ from: sourceUri, to: sourceTemp });
    } else {
      await FileSystem.writeAsStringAsync(sourceTemp, sourceBase64, { encoding: FileSystem.EncodingType.Base64 });
    }

    if (!patches.length) {
      const base64 = await FileSystem.readAsStringAsync(sourceTemp, { encoding: FileSystem.EncodingType.Base64 });
      return { uri: sourceTemp, base64, dossierTemp: dossier, identiqueSource: true };
    }

    await unzip(cheminNatif(sourceTemp), cheminNatif(extrait));

    const workbookUri = `${uriFichier(cheminNatif(extrait))}/xl/workbook.xml`;
    const relsUri = `${uriFichier(cheminNatif(extrait))}/xl/_rels/workbook.xml.rels`;
    const [workbookXml, relsXml] = await Promise.all([
      FileSystem.readAsStringAsync(workbookUri, { encoding: FileSystem.EncodingType.UTF8 }),
      FileSystem.readAsStringAsync(relsUri, { encoding: FileSystem.EncodingType.UTF8 }),
    ]);
    const chemins = obtenirCheminsFeuilles(workbookXml, relsXml);
    const parFichier = new Map();

    for (const patch of patches) {
      const relatif = chemins.get(patch.sheetName);
      if (!relatif) throw new Error(`Feuille Excel introuvable : ${patch.sheetName}`);
      if (!parFichier.has(relatif)) parFichier.set(relatif, []);
      parFichier.get(relatif).push(patch);
    }

    for (const [relatif, modifications] of parFichier.entries()) {
      const feuilleUri = `${uriFichier(cheminNatif(extrait))}/${relatif}`;
      let xml = await FileSystem.readAsStringAsync(feuilleUri, { encoding: FileSystem.EncodingType.UTF8 });
      for (const patch of modifications) xml = patcherCelluleXml(xml, patch);
      await FileSystem.writeAsStringAsync(feuilleUri, xml, { encoding: FileSystem.EncodingType.UTF8 });
    }

    await zip(cheminNatif(extrait), cheminNatif(sortie));
    const base64 = await FileSystem.readAsStringAsync(sortie, { encoding: FileSystem.EncodingType.Base64 });
    return { uri: sortie, base64, dossierTemp: dossier, identiqueSource: false };
  } catch (error) {
    await FileSystem.deleteAsync(dossier, { idempotent: true }).catch(() => {});
    throw error;
  }
}

export async function nettoyerClasseurTemp(resultat) {
  if (resultat?.dossierTemp) await FileSystem.deleteAsync(resultat.dossierTemp, { idempotent: true }).catch(() => {});
}
