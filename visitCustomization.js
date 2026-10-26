import { getDb, toucherVisite, recalculerProgression } from './db.js';
import { validateVisitField } from './visitFields.js';

export async function getVisitFieldOverrides(visiteId) {
  const db = await getDb();
  return db.getAllAsync('SELECT * FROM personnalisation_champs WHERE visite_id = ? ORDER BY rowid', [visiteId]);
}

export async function saveVisitFieldOverride(visiteId, field) {
  const db = await getDb();
  const visite = await db.getFirstAsync('SELECT trame_code FROM visites WHERE id = ?', [visiteId]);
  if (!visite || visite.trame_code !== 'REMAR_CROUS') throw new Error('Personnalisation disponible pour les visites REMAR · CROUS.');
  const r = validateVisitField(visite.trame_code, field);
  const existing = await db.getFirstAsync(
    'SELECT type FROM personnalisation_champs WHERE visite_id = ? AND panel_id = ? AND section = ? AND cle = ?',
    [visiteId, r.panel_id, r.section, r.cle]
  );
  if (existing && existing.type !== r.type) throw new Error('Ce point existe déjà avec un autre type. Réaffiche-le ou choisis un autre intitulé.');
  await db.runAsync(
    `INSERT INTO personnalisation_champs (visite_id, panel_id, section, cle, type, masque)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(visite_id, panel_id, section, cle) DO UPDATE SET masque = excluded.masque`,
    [visiteId, r.panel_id, r.section, r.cle, r.type, r.masque]
  );
  await toucherVisite(visiteId);
  await recalculerProgression(visiteId);
}
