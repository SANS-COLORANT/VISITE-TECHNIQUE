import { getDb } from './db.js';
import { rattacherDonneesGeneralesChaufferie } from './preAllumageBusinessDb.js';

export async function preparerChaufferieDynamiquePreAllumage(visiteId, localId) {
  const db = await getDb();
  // L'ancien ajout créait un mini-bloc de deux tests. Désormais les essais
  // appartiennent aux chaudières, brûleurs, pompes, etc. ajoutés explicitement.
  await db.runAsync(
    `DELETE FROM pre_allumage_rubriques WHERE visite_id=? AND local_id=? AND section_code=?`,
    [visiteId, localId, `pa.local.${localId}.tests`]
  );
  await rattacherDonneesGeneralesChaufferie(visiteId, localId);
}
