import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';
import { dossierVisiteMetra, obtenirRacineMetra } from './metraStorage.js';
import { importApiReferenceForVisit } from './apiVisitPreparationDb.js';
import { importLatestApiVisitForLocal } from './apiLatestVisitImportDb.js';
import { pinPhotoReferencesForVisit } from './latestVisitPhotosDb.js';
import { preremplirVisiteDepuisContexte } from './visitPrefillDb.js';
import { assurerStructureSitePreAllumage } from './preAllumageSiteBootstrap.js';
import { chargerPreAllumageModulaire } from './preAllumageModularDb.js';

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
    // Les données Intranet sont déjà en cache local. On matérialise la référence
    // AVANT d'ouvrir l'écran afin que l'utilisateur ne voie plus les champs se
    // remplir progressivement quelques instants après la navigation.
    await importLatestApiVisitForLocal(siteId, apiRemoteLocalId);
    await importApiReferenceForVisit(id, apiRemoteLocalId, apiRemoteClientId);
  }

  // Un local créé hors connexion n'a pas encore de remoteLocalId. L'identité
  // installation reste néanmoins figée sur la visite. Dès l'accusé serveur,
  // intranetStructureDb complète api_remote_local_id/api_remote_trame_id sur
  // toutes les visites rattachées à cette installation sans les recréer.

  // Le préremplissage doit être terminé avant le retour de l'identifiant :
  // SiteVisitesScreen peut alors ouvrir une visite dont les informations sont
  // immédiatement cohérentes, y compris pour un client Intranet déjà importé.
  await preremplirVisiteDepuisContexte(db, id);

  if (trame.id === 'pre_allumage') {
    // Prépare tous les locaux et leurs rubriques pendant l'état « création en
    // cours ». Les locaux précédent/suivant sont ainsi déjà présents en mémoire
    // SQLite lorsque l'écran Pré-allumage s'ouvre et le swipe ne déclenche pas
    // la construction tardive de leur structure.
    await assurerStructureSitePreAllumage(id);
    await chargerPreAllumageModulaire(id);
  }

  // Les références photo et le classement Android ne sont pas nécessaires pour
  // afficher les données métier. Ils sont volontairement préparés en fond pour
  // raccourcir le chemin critique de création.
  void Promise.allSettled([
    pinPhotoReferencesForVisit(id),
    (async () => {
      if (await obtenirRacineMetra()) await dossierVisiteMetra(id);
    })(),
  ]).then((results) => {
    const [photos, stockage] = results;
    if (photos?.status === 'rejected') console.warn('Photo reference snapshot deferred', photos.reason);
    if (stockage?.status === 'rejected') console.warn('Dossier METRA de la nouvelle visite non préparé immédiatement', stockage.reason);
  });

  return id;
}
