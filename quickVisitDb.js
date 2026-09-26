/**
 * Visite rapide (bouton + de la barre du bas) : démarre une visite sans client.
 *
 * Le schéma impose visite → site → client. La visite rapide est donc rangée
 * sous un client local unique « À rattacher » (identifiant fixe), avec un site
 * par visite. Ce client n'a aucun identifiant Intranet : tant que la visite
 * n'est pas rattachée à un vrai client, elle reste locale et n'est jamais
 * proposée à l'envoi Intranet.
 */
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { creerVisiteProduction } from './visitCreationDb.js';

export const QUICK_VISIT_CLIENT_ID = 'metra-visites-a-rattacher';
export const QUICK_VISIT_CLIENT_NAME = 'À rattacher';

async function assurerClientARattacher(db) {
  await db.runAsync(
    `INSERT OR IGNORE INTO clients (id, nom, code_exploitant, adresse) VALUES (?, ?, NULL, NULL)`,
    [QUICK_VISIT_CLIENT_ID, QUICK_VISIT_CLIENT_NAME]
  );
}

function nomParDefaut() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `Visite rapide du ${pad(d.getDate())}/${pad(d.getMonth() + 1)} à ${pad(d.getHours())}h${pad(d.getMinutes())}`;
}

export async function creerVisiteRapide({ trameId, nom = '' } = {}) {
  const db = await getDb();
  await assurerClientARattacher(db);
  const siteId = createId();
  const nomSite = String(nom || '').trim() || nomParDefaut();
  await db.runAsync(
    `INSERT INTO sites (id, client_id, nom_site, adresse, statut) VALUES (?, ?, ?, NULL, 'Actif')`,
    [siteId, QUICK_VISIT_CLIENT_ID, nomSite]
  );
  const visiteId = await creerVisiteProduction({ siteId, trameId, mode: 'complete' });
  return { visiteId, siteId, nomSite };
}

export async function listerIdsVisitesARattacher() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT v.id FROM visites v JOIN sites s ON s.id=v.site_id WHERE s.client_id=?`,
    [QUICK_VISIT_CLIENT_ID]
  );
  return new Set((rows || []).map((r) => r.id));
}

export async function estVisiteARattacher(visiteId) {
  if (!visiteId) return false;
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT 1 AS ok FROM visites v JOIN sites s ON s.id=v.site_id WHERE v.id=? AND s.client_id=?`,
    [visiteId, QUICK_VISIT_CLIENT_ID]
  );
  return Boolean(row?.ok);
}
