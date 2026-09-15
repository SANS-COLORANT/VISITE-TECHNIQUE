import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';
import { dossierVisiteMetra, obtenirRacineMetra } from './metraStorage.js';
import { importApiReferenceForVisit } from './apiVisitPreparationDb.js';
import { importLatestApiVisitForLocal } from './apiLatestVisitImportDb.js';
import { pinPhotoReferencesForVisit } from './latestVisitPhotosDb.js';

/** Création d'une visite native de production. Le préremplissage vient uniquement de l'historique réel du même local/trame. */
export async function creerVisiteProduction({
  siteId,
  technicien = null,
  mode = 'complete',
  trameId = DEFAULT_TRAME_ID,
  apiRemoteLocalId = null,
  apiRemoteClientId = null,
  apiRemoteTrameId = null,
  installationId = null,
} = {}) {
  if (!siteId) throw new Error('Site requis pour créer une visite');
  const modeNormalise = mode === 'express' ? 'express' : 'complete';
  const trame = obtenirTrame(trameId);
  const db = await getDb();
  const id = createId();
  const remoteClientId = apiRemoteClientId == null ? null : String(apiRemoteClientId).trim() || null;
  const remoteLocalId = apiRemoteLocalId == null ? null : String(apiRemoteLocalId).trim() || null;
  const remoteTrameId = apiRemoteTrameId == null ? null : String(apiRemoteTrameId).trim() || null;
  const localInstallationId = installationId == null ? null : String(installationId).trim() || null;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO visites
        (id, site_id, date_visite, technicien, statut, progression_pct, mode_visite, trame_id,
         installation_id, api_remote_client_id, api_remote_local_id, api_remote_trame_id)
       VALUES (?, ?, date('now'), ?, 'en_cours', 0, ?, ?, ?, ?, ?, ?)`,
      [id, siteId, technicien ? String(technicien).trim() || null : null, modeNormalise, trame.id,
        localInstallationId, remoteClientId, remoteLocalId, remoteTrameId]
    );
    await db.runAsync(`INSERT OR IGNORE INTO notes (visite_id, contenu) VALUES (?, '')`, [id]);
  });

  if (apiRemoteLocalId) {
    // Conserve volontairement cet ordre : la dernière visite réelle est d'abord
    // matérialisée, puis la référence courante est liée à la nouvelle visite.
    await importLatestApiVisitForLocal(siteId, apiRemoteLocalId);
    await importApiReferenceForVisit(id, apiRemoteLocalId, apiRemoteClientId);
  }

  // Un local créé hors connexion n'a pas encore de remoteLocalId. L'identité
  // installation reste néanmoins figée sur la visite. Dès l'accusé serveur,
  // intranetStructureDb complète api_remote_local_id/api_remote_trame_id sur
  // toutes les visites rattachées à cette installation sans les recréer.

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
