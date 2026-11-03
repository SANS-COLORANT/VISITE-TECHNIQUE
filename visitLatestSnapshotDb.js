/**
 * Clone the last visit's entered values only for the same installation and
 * the same published METRA template. This is a draft, not a new remote visit.
 *
 * Historical photos and closed reserves are intentionally retained in their
 * original dated visits; copying their files or reopening closed reserves
 * would misrepresent evidence and could delete shared media.
 */
import { DEFAULT_TRAME_ID } from './trameRegistry.js';

const CURRENT_VISIT_FIELDS = new Set([
  'date de visite', 'date de la visite', 'heure de visite',
  'nom du client', 'nom du site', 'nom du local',
  'nom du local / adresse', 'trame utilisee', 'adresse',
]);
function normalizeKey(key) {
  return String(key || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
export function isCurrentVisitMetadata(key) {
  return CURRENT_VISIT_FIELDS.has(normalizeKey(key));
}

export async function copyLatestSameTrameVisit(db, newVisitId) {
  const id = String(newVisitId || '').trim();
  if (!id) throw new Error('Nouvelle visite sans identifiant');
  const visit = await db.getFirstAsync(
    'SELECT id,site_id,installation_id,trame_id,statut,date_visite FROM visites WHERE id=?', [id]);
  if (!visit || visit.statut !== 'en_cours') return { sourceVisitId: null, skipped: true };
  const source = await db.getFirstAsync(
    `SELECT id, date_visite FROM visites
      WHERE id<>? AND site_id=? AND COALESCE(trame_id,?)=?
        AND ((? IS NOT NULL AND installation_id=?) OR (? IS NULL AND installation_id IS NULL))
        AND (date_visite IS NULL OR date_visite<=?)
        AND rowid < (SELECT rowid FROM visites WHERE id=?)
      ORDER BY COALESCE(date_visite,'') DESC,modifie_le DESC,rowid DESC LIMIT 1`,
    [id, visit.site_id, DEFAULT_TRAME_ID, visit.trame_id || DEFAULT_TRAME_ID,
      visit.installation_id, visit.installation_id, visit.installation_id,
      visit.date_visite, id]);
  if (!source?.id) return { sourceVisitId: null, copiedFields: 0, copiedControls: 0, copiedDynamic: 0 };

  // Re-copying only on first creation; a repeated call must never overwrite
  // later edits performed by the technician on this new visit.
  const metaKey = `visit_full_copy_done::${id}`;
  const done = await db.getFirstAsync('SELECT value FROM _meta WHERE key=?', [metaKey]);
  if (done?.value === '1') return { sourceVisitId: source.id, alreadyCopied: true };

  let copiedFields = 0, copiedControls = 0, copiedDynamic = 0;
  await db.withTransactionAsync(async () => {
    const fields = await db.getAllAsync(
      'SELECT section_code,cle,valeur FROM champs_visite WHERE visite_id=?', [source.id]);
    for (const row of fields) {
      if (isCurrentVisitMetadata(row.cle)) continue;
      await db.runAsync(
        `INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)
         ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur`,
        [id,row.section_code,row.cle,row.valeur ?? null]);
      copiedFields++;
    }
    const controls = await db.getAllAsync(
      'SELECT section_code,cle,avis,commentaire FROM controles_visite WHERE visite_id=?', [source.id]);
    for (const row of controls) {
      await db.runAsync(
        `INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire)
         VALUES(?,?,?,?,?)
         ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET
           avis=excluded.avis,commentaire=excluded.commentaire`,
        [id,row.section_code,row.cle,row.avis ?? null,row.commentaire ?? null]);
      copiedControls++;
    }
    // Preserve the last actual inspection status of *each* CTA/filter/VMC
    // separately. Ownership IDs are stable within one local; never cross
    // into another installation. Provenance remains the source visit ID.
    const dynamic = await db.getAllAsync(
      `SELECT r.owner_type,r.owner_id,r.panel_id,r.section_code,r.cle,
              r.valeur,r.avis,r.commentaire,r.confirme_le
       FROM remar_values r
       WHERE r.visite_id=?`, [source.id]);
    for (const row of dynamic) {
      const owner = row.owner_type === 'equipement' ? 'equipements' : 'remar_items';
      const owned = await db.getFirstAsync(
        `SELECT id FROM ${owner} WHERE id=? AND installation_id=?`,
        [row.owner_id,visit.installation_id]);
      if (!owned) continue;
      await db.runAsync(
        `INSERT INTO remar_values(visite_id,owner_type,owner_id,panel_id,section_code,
            cle,valeur,avis,commentaire,source_visite_id,confirme_le)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(visite_id,owner_type,owner_id,panel_id,section_code,cle)
         DO UPDATE SET valeur=excluded.valeur,avis=excluded.avis,
           commentaire=excluded.commentaire,source_visite_id=excluded.source_visite_id,
           confirme_le=excluded.confirme_le`,
        [id,row.owner_type,row.owner_id,row.panel_id,row.section_code,row.cle,
          row.valeur ?? null,row.avis ?? null,row.commentaire ?? null,
          `copie_locale:${source.id}`,row.confirme_le ?? null]);
      copiedDynamic++;
    }
    // Free text is part of the visit. Do not overwrite the new visit date or
    // change the frozen client/site/trame or new remote upload identity.
    const note = await db.getFirstAsync('SELECT contenu FROM notes WHERE visite_id=?', [source.id]);
    if (note && String(note.contenu || '').trim()) {
      await db.runAsync(
        `INSERT INTO notes(visite_id,contenu) VALUES(?,?)
         ON CONFLICT(visite_id) DO UPDATE SET contenu=excluded.contenu`,
        [id,note.contenu]);
    }
    await db.runAsync(
      `INSERT INTO _meta(key,value) VALUES(?,'1')
       ON CONFLICT(key) DO UPDATE SET value='1'`,[metaKey]);
  });
  return { sourceVisitId:source.id,copiedFields,copiedControls,copiedDynamic };
}
