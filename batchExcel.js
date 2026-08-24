/** Import/export Excel en lot : plusieurs fichiers sélectionnés en une seule opération. */
import * as XLSX from 'xlsx';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { analyserClasseur, importerAnalyseExcel } from './excelImport.js';
import { preparerExport } from './excelExport.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function empreinteLegere(texte) {
  let hash = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    hash ^= texte.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export async function choisirEtAnalyserExcels() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
    copyToCacheDirectory: true,
    multiple: true,
  });
  if (result.canceled) return null;

  const analyses = [];
  const erreurs = [];
  for (const asset of result.assets || []) {
    const nom = asset.name || 'import.xlsx';
    try {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const wb = XLSX.read(base64, { type: 'base64', cellDates: true });
      const analyse = analyserClasseur(wb, nom);
      analyse.sourceId = `${analyse.trameId}:${analyse.nomFichier}:${empreinteLegere(base64)}`;
      analyses.push(analyse);
    } catch (e) {
      erreurs.push({ nomFichier: nom, message: String(e?.message || e) });
    }
  }
  return { analyses, erreurs };
}

export async function importerAnalysesExcel(analyses = []) {
  const resultats = [];
  for (const analyse of analyses) {
    try {
      const resultat = await importerAnalyseExcel(analyse);
      resultats.push({ analyse, ...resultat, ok: true });
    } catch (e) {
      resultats.push({ analyse, ok: false, erreur: String(e?.message || e) });
    }
  }
  return resultats;
}

function rendreNomUnique(nom, occurrences) {
  const deja = occurrences.get(nom) || 0;
  occurrences.set(nom, deja + 1);
  if (deja === 0) return nom;
  const point = nom.toLowerCase().lastIndexOf('.xlsx');
  return point >= 0 ? `${nom.slice(0, point)}_${deja + 1}.xlsx` : `${nom}_${deja + 1}.xlsx`;
}

export async function exporterVisitesExcelEnLot(visiteIds = []) {
  const ids = [...new Set((visiteIds || []).filter(Boolean))];
  if (!ids.length) throw new Error('Aucune visite sélectionnée.');

  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF?.requestDirectoryPermissionsAsync || !SAF?.createFileAsync) {
    throw new Error("L'enregistrement multiple n'est pas disponible sur cet appareil Android.");
  }

  const permission = await SAF.requestDirectoryPermissionsAsync();
  if (!permission?.granted || !permission?.directoryUri) return { annule: true, enregistres: [], erreurs: [] };

  const enregistres = [];
  const erreurs = [];
  const occurrences = new Map();
  for (const visiteId of ids) {
    try {
      const { base64, nomFichier, trame, stats } = await preparerExport(visiteId);
      const nomUnique = rendreNomUnique(nomFichier, occurrences);
      const uri = await SAF.createFileAsync(permission.directoryUri, nomUnique, XLSX_MIME);
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      enregistres.push({ visiteId, nomFichier: nomUnique, uri, trameNom: trame?.nom, stats });
    } catch (e) {
      erreurs.push({ visiteId, message: String(e?.message || e) });
    }
  }
  return { annule: false, enregistres, erreurs };
}
