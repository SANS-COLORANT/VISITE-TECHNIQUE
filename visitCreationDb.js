import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';
import { dossierVisiteMetra, obtenirRacineMetra } from './metraStorage.js';

/**
 * Création d'une visite native de production.
 *
 * Aucune valeur technique supposée n'est injectée ici. Les informations
 * réellement connues (client, site, adresse, historique stable...) sont
 * ajoutées ensuite par visitPrefillDb.js.
 */
export async function creerVisiteProduction({ siteId, technicien = null, mode = 'complete', trameId = DEFAULT_TRAME_ID } = {}) {
  if (!siteId) throw new Error('Site requis pour créer une visite');
  const modeNormalise = mode === 'express' ? 'express' : 'complete';
  const trame = obtenirTrame(trameId);
  const db = await getDb();
  const id = createId();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO visites
        (id, site_id, date_visite, technicien, statut, progression_pct, mode_visite, trame_id)
       VALUES (?, ?, date('now'), ?, 'en_cours', 0, ?, ?)`,
      [id, siteId, technicien ? String(technicien).trim() || null : null, modeNormalise, trame.id]
    );
    await db.runAsync(`INSERT OR IGNORE INTO notes (visite_id, contenu) VALUES (?, '')`, [id]);
  });

  // Si l'utilisateur a déjà accordé une fois l'accès Documents/METRA, la
  // structure Client/Site/Visite est créée immédiatement sans nouvelle boîte
  // de dialogue. Le refus ou l'absence d'autorisation ne bloque jamais la visite.
  try {
    if (await obtenirRacineMetra()) await dossierVisiteMetra(id);
  } catch {}

  return id;
}
