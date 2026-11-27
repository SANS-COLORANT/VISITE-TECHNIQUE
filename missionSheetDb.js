/**
 * Fiche Mission modulable — lectures branchées sur la base locale.
 * Les requêtes elles-mêmes vivent dans missionSheetQueries.js (testées sous Node).
 */
import { getDb } from './db.js';
import { queryMissionResumes, queryMissionSheetExtras } from './missionSheetQueries.js';

/** Visites Mission à reprendre (brouillon ou en cours), toutes Missions confondues ou pour une seule. */
export async function listerReprisesMissions(options = {}) {
  return queryMissionResumes(await getDb(), options);
}

/** Mesures récentes, documents attendus et avancement des sites d'une Mission. */
export async function chargerExtrasFicheMission(missionId, options = {}) {
  return queryMissionSheetExtras(await getDb(), missionId, options);
}
