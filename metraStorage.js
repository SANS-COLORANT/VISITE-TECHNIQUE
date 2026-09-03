import * as FileSystem from 'expo-file-system';
import { openAppDatabase } from './database/index.js';
import { getDb } from './db.js';

const ROOT_META_KEY = 'metra_documents_root_uri';
const ROOT_FOLDER = 'METRA';

function nettoyerSegment(value, fallback = 'Sans_nom') {
  const clean = String(value || fallback)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-zA-Z0-9 _.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return clean || fallback;
}

async function lireMeta(key) {
  const db = await openAppDatabase();
  const row = await db.getFirstAsync('SELECT value FROM _meta WHERE key=?', [key]);
  return row?.value || null;
}

async function ecrireMeta(key, value) {
  const db = await openAppDatabase();
  await db.runAsync(
    `INSERT INTO _meta(key,value) VALUES(?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [key, String(value || '')]
  );
}

async function supprimerMeta(key) {
  const db = await openAppDatabase();
  await db.runAsync('DELETE FROM _meta WHERE key=?', [key]);
}

function uriSeTerminePar(uri, nom) {
  try {
    const decoded = decodeURIComponent(String(uri || ''));
    return decoded.endsWith(`/${nom}`) || decoded.endsWith(`:${nom}`);
  } catch {
    return false;
  }
}

async function trouverOuCreerSousDossier(parentUri, nom) {
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF?.readDirectoryAsync || !SAF?.makeDirectoryAsync) return parentUri;
  const safeName = nettoyerSegment(nom);
  try {
    const children = await SAF.readDirectoryAsync(parentUri);
    const existing = (children || []).find((uri) => uriSeTerminePar(uri, safeName));
    if (existing) return existing;
  } catch {}
  return SAF.makeDirectoryAsync(parentUri, safeName);
}

export async function obtenirRacineMetra() {
  return lireMeta(ROOT_META_KEY);
}

export async function oublierRacineMetra() {
  await supprimerMeta(ROOT_META_KEY);
}

export async function garantirRacineMetra() {
  const existante = await obtenirRacineMetra();
  if (existante) {
    try {
      await FileSystem.StorageAccessFramework.readDirectoryAsync(existante);
      return existante;
    } catch {
      await oublierRacineMetra().catch(() => {});
    }
  }

  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF?.requestDirectoryPermissionsAsync || !SAF?.makeDirectoryAsync) return null;
  let initialUri;
  try { initialUri = SAF.getUriForDirectoryInRoot?.('Documents'); } catch { initialUri = undefined; }
  const permission = await SAF.requestDirectoryPermissionsAsync(initialUri);
  if (!permission?.granted || !permission?.directoryUri) return null;
  const racine = await trouverOuCreerSousDossier(permission.directoryUri, ROOT_FOLDER);
  await ecrireMeta(ROOT_META_KEY, racine);
  return racine;
}

export async function garantirCheminMetra(segments = []) {
  let current = await garantirRacineMetra();
  if (!current) return null;
  for (const segment of segments.filter(Boolean)) current = await trouverOuCreerSousDossier(current, segment);
  return current;
}

export async function contexteVisiteStockage(visiteId) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT v.id visite_id,v.date_visite,v.trame_id,
            s.id site_id,s.nom_site,c.id client_id,c.nom nom_client
     FROM visites v
     JOIN sites s ON s.id=v.site_id
     JOIN clients c ON c.id=s.client_id
     WHERE v.id=?`,
    [visiteId]
  );
  if (!row) throw new Error('Visite introuvable pour le stockage.');
  return row;
}

function libelleVisite(ctx) {
  const date = String(ctx?.date_visite || 'Sans date').slice(0, 10);
  const trame = nettoyerSegment(ctx?.trame_id || 'Visite', 'Visite');
  return `${date} - ${trame}`;
}

export async function dossierClientMetra(clientNom) {
  return garantirCheminMetra(['Clients', nettoyerSegment(clientNom, 'Client')]);
}

export async function dossierSiteMetra({ clientNom, siteNom }) {
  return garantirCheminMetra(['Clients', nettoyerSegment(clientNom, 'Client'), 'Sites', nettoyerSegment(siteNom, 'Site')]);
}

export async function dossierVisiteMetra(visiteId, sousDossier = null) {
  const ctx = await contexteVisiteStockage(visiteId);
  return garantirCheminMetra([
    'Clients', nettoyerSegment(ctx.nom_client, 'Client'),
    'Sites', nettoyerSegment(ctx.nom_site, 'Site'),
    'Visites', libelleVisite(ctx),
    sousDossier,
  ]);
}

export async function dossierRapportMetra(datas = []) {
  const premiere = datas?.[0]?.visite;
  if (!premiere) return garantirCheminMetra(['Exports']);
  const clients = new Set(datas.map((d) => d?.visite?.client_id).filter(Boolean));
  const sites = new Set(datas.map((d) => d?.visite?.site_id).filter(Boolean));
  if (sites.size === 1 && premiere.id) return dossierVisiteMetra(premiere.id, 'Rapports');
  if (clients.size <= 1) return garantirCheminMetra(['Clients', nettoyerSegment(premiere.nom_client, 'Client'), 'Rapports']);
  return garantirCheminMetra(['Rapports multi-clients']);
}

export async function dossierExportsClientMetra(clientNom) {
  return garantirCheminMetra(['Clients', nettoyerSegment(clientNom, 'Client'), 'Exports']);
}

export async function creerFichierSaf(dossierUri, nomFichier, mimeType, base64) {
  const SAF = FileSystem.StorageAccessFramework;
  if (!dossierUri || !SAF?.createFileAsync) throw new Error("Le dossier METRA n'est pas disponible.");
  const destination = await SAF.createFileAsync(dossierUri, nettoyerSegment(nomFichier, 'Fichier'), mimeType);
  await FileSystem.writeAsStringAsync(destination, base64, { encoding: FileSystem.EncodingType.Base64 });
  return destination;
}

export { nettoyerSegment };
