import { TRAME_DATA } from './data.js';

function sectionCode(panelId, section) {
  return panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function construireClesTrame() {
  const champs = new Set();
  const controles = new Set();
  for (const [panelId, sections] of Object.entries(TRAME_DATA || {})) {
    for (const [section, fields] of Object.entries(sections || {})) {
      const code = sectionCode(panelId, section);
      for (const field of fields || []) {
        const cle = `${code}||${field.cle}`;
        if (field.type === 'champ') champs.add(cle);
        else if (field.type === 'controle') controles.add(cle);
      }
    }
  }
  return { champs, controles };
}

const CLES_TRAME = construireClesTrame();
const recalculsEnCours = new Map();

async function calculerProgression(db, visiteId) {
  const [champsRows, controlesRows, visite] = await Promise.all([
    db.getAllAsync(`SELECT section_code,cle,valeur FROM champs_visite WHERE visite_id=?`, [visiteId]),
    db.getAllAsync(`SELECT section_code,cle,avis FROM controles_visite WHERE visite_id=?`, [visiteId]),
    db.getFirstAsync(`SELECT progression_pct FROM visites WHERE id=?`, [visiteId]),
  ]);

  let total = CLES_TRAME.champs.size + CLES_TRAME.controles.size;
  let remplis = 0;

  for (const row of champsRows || []) {
    const cle = `${row.section_code}||${row.cle}`;
    if (CLES_TRAME.champs.has(cle) && String(row.valeur ?? '').trim() !== '') remplis += 1;
  }

  for (const row of controlesRows || []) {
    const cle = `${row.section_code}||${row.cle}`;
    if (CLES_TRAME.controles.has(cle) && String(row.avis ?? '').trim() !== '') remplis += 1;
  }

  if (total <= 0) total = 1;
  const pct = Math.max(0, Math.min(100, Math.round((remplis / total) * 100)));
  const ancienPct = Number(visite?.progression_pct ?? -1);

  // Une simple consultation/re-sauvegarde ne doit pas faire paraître la visite
  // plus récente si sa progression n'a réellement pas changé.
  if (pct !== ancienPct) {
    await db.runAsync(
      `UPDATE visites SET progression_pct=?, modifie_le=datetime('now') WHERE id=?`,
      [pct, visiteId]
    );
  }
  return pct;
}

/**
 * Coalesce les appels rapprochés : si plusieurs champs se sauvegardent pendant
 * qu'un calcul est déjà en cours, on évite les lectures SQLite concurrentes et
 * on effectue au maximum un passage final supplémentaire avec les données les
 * plus récentes.
 */
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
