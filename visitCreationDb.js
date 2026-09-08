import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';
import { dossierVisiteMetra, obtenirRacineMetra } from './metraStorage.js';
import { importApiReferenceForVisit } from './apiVisitPreparationDb.js';

/** Création d'une visite native de production. Aucune valeur technique supposée n'est injectée. */
export async function creerVisiteProduction({ siteId, technicien = null, mode = 'complete', trameId = DEFAULT_TRAME_ID, apiRemoteLocalId = null } = {}) {
  if (!siteId) throw new Error('Site requis pour créer une visite');
  const modeNormalise = mode === 'express' ? 'express' : 'complete'; const trame = obtenirTrame(trameId); const db = await getDb(); const id = createId();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`INSERT INTO visites (id,site_id,date_visite,technicien,statut,progression_pct,mode_visite,trame_id) VALUES(?,?,date('now'),?,'en_cours',0,?,?)`,[id,siteId,technicien?String(technicien).trim()||null:null,modeNormalise,trame.id]);
    await db.runAsync(`INSERT OR IGNORE INTO notes (visite_id,contenu) VALUES (?, '')`,[id]);
  });
  if (apiRemoteLocalId) await importApiReferenceForVisit(id, apiRemoteLocalId);
  try { if (await obtenirRacineMetra()) await dossierVisiteMetra(id); } catch {}
  return id;
}
