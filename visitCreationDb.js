import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';
import { dossierVisiteMetra, obtenirRacineMetra } from './metraStorage.js';
import { importApiReferenceForVisit } from './apiVisitPreparationDb.js';
import { importLatestApiVisitForLocal } from './apiLatestVisitImportDb.js';
import { pinPhotoReferencesForVisit } from './latestVisitPhotosDb.js';

/** Création d'une visite native de production. Le préremplissage vient uniquement de l'historique réel du même local/trame. */
export async function creerVisiteProduction({ siteId, technicien = null, mode = 'complete', trameId = DEFAULT_TRAME_ID, apiRemoteLocalId = null } = {}) {
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

  if (apiRemoteLocalId) {
    // Matérialiser d'abord la dernière visite réelle du local Intranet. Le
    // préremplissage standard peut ensuite repartir de cette visite historique
    // sans transformer la référence API en constat du jour.
    await importLatestApiVisitForLocal(siteId, apiRemoteLocalId);
    await importApiReferenceForVisit(id, apiRemoteLocalId);
  }

  // Snapshot only cached reference metadata: no network and no observation copy.
  try { await pinPhotoReferencesForVisit(id); } catch (e) { console.warn('Photo reference snapshot deferred', e); }

  // Le stockage Android SAF peut être lent (lecture/création de plusieurs
  // dossiers). Il ne doit jamais retarder l'ouverture de la visite : la base
  // locale est déjà créée, le classement Documents/METRA est préparé en fond.
  void (async () => {
    try {
      if (await obtenirRacineMetra()) await dossierVisiteMetra(id);
    } catch (e) {
      console.warn('Dossier METRA de la nouvelle visite non préparé immédiatement', e);
    }
  })();

  return id;
}
