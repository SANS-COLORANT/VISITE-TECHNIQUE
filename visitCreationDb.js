import { getDb } from './db.js';
import { createId } from './database/ids.js';

/**
 * Création d'une visite native de production.
 *
 * Aucune valeur technique supposée n'est injectée ici. Les informations
 * réellement connues (client, site, adresse, historique stable...) sont
 * ajoutées ensuite par visitPrefillDb.js.
 */
export async function creerVisiteProduction({ siteId, technicien = null, mode = 'complete' } = {}) {
  if (!siteId) throw new Error('Site requis pour créer une visite');
  const modeNormalise = mode === 'express' ? 'express' : 'complete';
  const db = await getDb();
  const id = createId();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO visites
        (id, site_id, date_visite, technicien, statut, progression_pct, mode_visite)
       VALUES (?, ?, date('now'), ?, 'en_cours', 0, ?)`,
      [id, siteId, technicien ? String(technicien).trim() || null : null, modeNormalise]
    );
    await db.runAsync(`INSERT OR IGNORE INTO notes (visite_id, contenu) VALUES (?, '')`, [id]);
  });

  return id;
}
