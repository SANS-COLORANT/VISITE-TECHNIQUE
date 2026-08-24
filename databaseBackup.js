import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getDb } from './db.js';
import { DATABASE_NAME } from './database/constants.js';

function horodatageSauvegarde(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}`;
}

function cheminBaseSQLite() {
  return `${FileSystem.documentDirectory}SQLite/${DATABASE_NAME}`;
}

export async function exporterSauvegardeBase() {
  const db = await getDb();
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');

  const source = cheminBaseSQLite();
  const info = await FileSystem.getInfoAsync(source);
  if (!info.exists) throw new Error('Fichier de base SQLite introuvable');

  const dossier = `${FileSystem.documentDirectory}backups/`;
  await FileSystem.makeDirectoryAsync(dossier, { intermediates: true });
  const destination = `${dossier}Visite_Technique_${horodatageSauvegarde()}.db`;
  await FileSystem.copyAsync({ from: source, to: destination });

  const partageDisponible = await Sharing.isAvailableAsync();
  if (partageDisponible) {
    await Sharing.shareAsync(destination, {
      mimeType: 'application/octet-stream',
      dialogTitle: 'Sauvegarder les données Visite Technique',
    });
  }
  return destination;
}
