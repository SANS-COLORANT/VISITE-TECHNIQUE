import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';
import { dossierVisiteMetra, obtenirRacineMetra } from './metraStorage.js';
import { importApiReferenceForVisit } from './apiVisitPreparationDb.js';
import { importLatestApiVisitForLocal } from './apiLatestVisitImportDb.js';
import { pinPhotoReferencesForVisit } from './latestVisitPhotosDb.js';

async function latestImportedVisitAlreadyMaterialized(db, remoteLocalId) {
  const local = await db.getFirstAsync(`SELECT derniere_visite_id FROM api_local_links WHERE remote_local_id=? LIMIT 1`, [String(remoteLocalId)]);
  const remoteVisitId = String(local?.derniere_visite_id || '').trim();
  if (!remoteVisitId) return false;
  const existing = await db.getFirstAsync(`SELECT 1 AS ok FROM provenances p JOIN visites v ON v.id=p.entite_id WHERE p.entite_type='visite' AND p.origine='api_symfony' AND p.reference_externe=? AND p.details_json LIKE '%\"sourceType\":\"imported_latest_visit\"%' LIMIT 1`, [remoteVisitId]);
  return Boolean(existing?.ok);
}

/** Création d'une visite native de production. Le chemin critique ne contient que les données nécessaires au premier écran. */
export async function creerVisiteProduction({ siteId, technicien = null, mode = 'complete', trameId = DEFAULT_TRAME_ID, apiRemoteLocalId = null, apiRemoteClientId = null } = {}) {
  if (!siteId) throw new Error('Site requis pour créer une visite');
  const modeNormalise = mode === 'express' ? 'express' : 'complete';
  const trame = obtenirTrame(trameId);
  const db = await getDb();
  const id = createId();

  await db.withTransactionAsync(async () => {
    await db.runAsync(`INSERT INTO visites (id, site_id, date_visite, technicien, statut, progression_pct, mode_visite, trame_id) VALUES (?, ?, date('now'), ?, 'en_cours', 0, ?, ?)`, [id, siteId, technicien ? String(technicien).trim() || null : null, modeNormalise, trame.id]);
    await db.runAsync(`INSERT OR IGNORE INTO notes (visite_id, contenu) VALUES (?, '')`, [id]);
  });

  if (apiRemoteLocalId) {
    // Le client/site importé contient normalement déjà l'historique. On ne
    // rematérialise le serveur que lorsqu'une nouvelle dernière visite existe.
    if (!(await latestImportedVisitAlreadyMaterialized(db, apiRemoteLocalId))) await importLatestApiVisitForLocal(siteId, apiRemoteLocalId);
    await importApiReferenceForVisit(id, apiRemoteLocalId, apiRemoteClientId);
  }

  // Photos de référence et création des dossiers SAF ne déterminent aucune
  // valeur du formulaire. Elles sont donc volontairement sorties du chemin
  // critique : la visite peut s'ouvrir pendant leur préparation.
  void pinPhotoReferencesForVisit(id).catch((e) => console.warn('Photo reference snapshot deferred', e));
  void (async () => {
    try { if (await obtenirRacineMetra()) await dossierVisiteMetra(id); }
    catch (e) { console.warn('Dossier METRA de la nouvelle visite non préparé immédiatement', e); }
  })();

  return id;
}
