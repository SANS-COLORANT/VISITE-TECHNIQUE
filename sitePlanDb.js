import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { openAppDatabase } from './database/index.js';

function extensionDepuisAsset(asset = {}) {
  const mime = String(asset.mimeType || '').toLowerCase();
  const name = String(asset.fileName || '').toLowerCase();
  if (mime.includes('png') || name.endsWith('.png')) return 'png';
  if (mime.includes('webp') || name.endsWith('.webp')) return 'webp';
  if (mime.includes('jpeg') || mime.includes('jpg') || name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'jpg';
  return 'jpg';
}

function estPlanGere(uri) {
  return !!uri && !!FileSystem.documentDirectory && String(uri).startsWith(`${FileSystem.documentDirectory}visite-technique/site-plans/`);
}

async function contexteSite(visiteId) {
  const db = await openAppDatabase();
  const row = await db.getFirstAsync(
    `SELECT s.id AS site_id,s.plan_uri,s.nom_site
     FROM visites v JOIN sites s ON s.id=v.site_id
     WHERE v.id=?`,
    [visiteId]
  );
  if (!row) throw new Error('Site introuvable pour cette visite.');
  return { db, ...row };
}

export async function getPlanSitePourVisite(visiteId) {
  const { site_id, plan_uri, nom_site } = await contexteSite(visiteId);
  return { siteId: site_id, uri: plan_uri || null, nomSite: nom_site || 'Site' };
}

export async function choisirEtSauverPlanSite(visiteId) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("L'accès aux images est nécessaire pour sélectionner le plan du site.");

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 1,
    base64: false,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;

  const asset = result.assets[0];
  const { db, site_id, plan_uri } = await contexteSite(visiteId);
  const racine = FileSystem.documentDirectory;
  if (!racine) throw new Error('Stockage local Android indisponible.');

  const dossier = `${racine}visite-technique/site-plans/${site_id}/`;
  await FileSystem.makeDirectoryAsync(dossier, { intermediates: true });
  const ext = extensionDepuisAsset(asset);
  const destination = `${dossier}plan_site.${ext}`;
  const info = await FileSystem.getInfoAsync(destination);
  if (info.exists) await FileSystem.deleteAsync(destination, { idempotent: true });
  await FileSystem.copyAsync({ from: asset.uri, to: destination });
  await db.runAsync(`UPDATE sites SET plan_uri=? WHERE id=?`, [destination, site_id]);

  if (plan_uri && plan_uri !== destination && estPlanGere(plan_uri)) {
    await FileSystem.deleteAsync(plan_uri, { idempotent: true }).catch(() => {});
  }
  return destination;
}

export async function supprimerPlanSitePourVisite(visiteId) {
  const { db, site_id, plan_uri } = await contexteSite(visiteId);
  await db.runAsync(`UPDATE sites SET plan_uri=NULL WHERE id=?`, [site_id]);
  if (estPlanGere(plan_uri)) await FileSystem.deleteAsync(plan_uri, { idempotent: true }).catch(() => {});
}
