import { obtenirTrame, DEFAULT_TRAME_ID, normaliserSectionCode } from './trameRegistry.js';

const cacheClesTrame = new Map();
const recalculsEnCours = new Map();

function construireClesTrame(trame) {
  const cachee = cacheClesTrame.get(trame.id);
  if (cachee) return cachee;

  const champs = new Set();
  const controles = new Set();
  for (const [panelId, sections] of Object.entries(trame.ui?.panels || {})) {
    for (const [section, fields] of Object.entries(sections || {})) {
      const code = normaliserSectionCode(panelId, section);
      for (const field of fields || []) {
        const cle = `${code}||${field.cle}`;
        if (field.type === 'champ') champs.add(cle);
        else if (field.type === 'controle') controles.add(cle);
      }
    }
  }
  const resultat = { champs, controles };
  cacheClesTrame.set(trame.id, resultat);
  return resultat;
}

async function calculerProgression(db, visiteId) {
  const [champsRows, controlesRows, visite] = await Promise.all([
    db.getAllAsync(`SELECT section_code,cle,valeur FROM champs_visite WHERE visite_id=?`, [visiteId]),
    db.getAllAsync(`SELECT section_code,cle,avis FROM controles_visite WHERE visite_id=?`, [visiteId]),
    db.getFirstAsync(`SELECT progression_pct,trame_id FROM visites WHERE id=?`, [visiteId]),
  ]);

  const trame = obtenirTrame(visite?.trame_id || DEFAULT_TRAME_ID);
  const clesTrame = construireClesTrame(trame);
  let total = clesTrame.champs.size + clesTrame.controles.size;
  let remplis = 0;

  for (const row of champsRows || []) {
    const cle = `${row.section_code}||${row.cle}`;
    if (clesTrame.champs.has(cle) && String(row.valeur ?? '').trim() !== '') remplis += 1;
  }

  for (const row of controlesRows || []) {
    const cle = `${row.section_code}||${row.cle}`;
    if (clesTrame.controles.has(cle) && String(row.avis ?? '').trim() !== '') remplis += 1;
  }

  if (total <= 0) total = 1;
  const pct = Math.max(0, Math.min(100, Math.round((remplis / total) * 100)));
  const ancienPct = Number(visite?.progression_pct ?? -1);

  if (pct !== ancienPct) {
    await db.runAsync(
      `UPDATE visites SET progression_pct=?, modifie_le=datetime('now') WHERE id=?`,
      [pct, visiteId]
    );
  }
  return pct;
}

/** Coalesce les appels rapprochés pour éviter les lectures SQLite concurrentes. */
export async function recalculerProgressionVisite(db, visiteId) {
  if (!db || !visiteId) return 0;

  const existant = recalculsEnCours.get(visiteId);
  if (existant) {
    existant.dirty = true;
    return existant.promise;
  }

  const etat = { dirty: false, promise: null };
  etat.promise = (async () => {
    let pct = 0;
    do {
      etat.dirty = false;
      pct = await calculerProgression(db, visiteId);
    } while (etat.dirty);
    return pct;
  })().finally(() => {
    if (recalculsEnCours.get(visiteId) === etat) recalculsEnCours.delete(visiteId);
  });

  recalculsEnCours.set(visiteId, etat);
  return etat.promise;
}
