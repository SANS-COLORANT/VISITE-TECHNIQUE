/** Réconciliation de l'inventaire courant d'un local Intranet.
 * Source distante autoritaire lors d'un import explicite ou d'une préparation.
 * Les anciennes lignes de visite, observations, photos et réserves ne sont pas
 * détruites : seul le patrimoine courant est retiré (statut='retire').
 */
const REMOTE_SOURCES = new Set(['listing_materiel','current_remote_local_patrimoine']);
function detailsOf(row) {
  try { return JSON.parse(row?.details_json || 'null'); } catch { return null; }
}
function importedForLocal(details, remoteLocalId) {
  return REMOTE_SOURCES.has(String(details?.sourceType || '')) &&
    String(details?.remoteLocalId || '') === String(remoteLocalId || '');
}
export async function reconcileImportedEquipmentInventory(db, {
  installationId, remoteLocalId, retainedEquipmentIds, visitId = null,
} = {}) {
  if (!installationId || !remoteLocalId || !Array.isArray(retainedEquipmentIds)) return { retired: 0, detached: 0 };
  const retained = new Set(retainedEquipmentIds.map(String));
  const existing = await db.getAllAsync(`SELECT e.id,p.details_json
    FROM equipements e JOIN provenances p ON p.entite_type='equipement' AND p.entite_id=e.id
    WHERE e.installation_id=? AND p.origine='api_symfony'`,
    [String(installationId)]);
  const absentIds = new Set();
  for (const row of existing) {
    if (retained.has(String(row.id))) continue;
    if (importedForLocal(detailsOf(row), remoteLocalId)) absentIds.add(String(row.id));
  }
  let detached = 0;
  if (visitId) {
    // Ne retirer que les matériels importés depuis ce local. Les créations
    // locales encore hors Intranet ne sont jamais effacées par un réimport.
    for (const id of absentIds) {
      const removed = await db.runAsync('DELETE FROM materiel WHERE visite_id=? AND equipement_id=?',
        [String(visitId), id]);
      detached += Number(removed?.changes || 0);
    }
  }
  for (const equipmentId of absentIds) {
    await db.runAsync("UPDATE equipements SET statut='retire',modifie_le=datetime('now') WHERE id=?",
      [equipmentId]);
  }
  return { retired: absentIds.size, detached };
}
