import { obtenirTrame, DEFAULT_TRAME_ID, normaliserSectionCode } from './trameRegistry.js';
import { calculerEtatOnglets } from './visitTabStatusDb.js';

const cacheClesTrame = new Map();
const recalculsEnCours = new Map();

function construireClesTrame(trame, panelsActifs = null) {
  const suffixe = panelsActifs ? [...panelsActifs].sort().join(',') : '*';
  const cacheKey = `${trame.id}|${suffixe}`;
  const cachee = cacheClesTrame.get(cacheKey);
  if (cachee) return cachee;

  const champs = new Set();
  const controles = new Set();
  for (const [panelId, sections] of Object.entries(trame.ui?.panels || {})) {
    if (panelsActifs && /^p-vmc-c[1-6]$/.test(panelId) && !panelsActifs.has(panelId)) continue;
    for (const [section, fields] of Object.entries(sections || {})) {
      const code = normaliserSectionCode(panelId, section);
      for (const field of fields || []) {
        if (field?.hiddenInApp === true) continue;
        const cle = `${code}||${field.cle}`;
        if (field.type === 'champ') champs.add(cle);
        else if (field.type === 'controle') controles.add(cle);
      }
    }
  }
  const resultat = { champs, controles };
  cacheClesTrame.set(cacheKey, resultat);
  return resultat;
}

function panelsVmcActifs(champsRows = [], controlesRows = []) {
  const config = new Map(
    (champsRows || [])
      .filter((r) => r.section_code === 'vmc.config' && /^caisson_[1-6]_actif$/.test(String(r.cle || '')))
      .map((r) => [r.cle, String(r.valeur ?? '')])
  );
  const explicite = config.size > 0;
  const actifs = new Set();

  if (explicite) {
    for (let i = 1; i <= 6; i += 1) {
      if (config.get(`caisson_${i}_actif`) === '1') actifs.add(`p-vmc-c${i}`);
    }
  } else {
    for (const row of [...(champsRows || []), ...(controlesRows || [])]) {
      const match = String(row.section_code || '').match(/^vmc-c([1-6])\./);
      if (match) actifs.add(`p-vmc-c${match[1]}`);
    }
  }

  if (!actifs.size) actifs.add('p-vmc-c1');
  return actifs;
}

async function calculerProgression(db, visiteId, withStatus = false) {
  const [champsRows, controlesRows, visite] = await Promise.all([
    db.getAllAsync(`SELECT section_code,cle,valeur FROM champs_visite WHERE visite_id=?`, [visiteId]),
    db.getAllAsync(`SELECT section_code,cle,avis FROM controles_visite WHERE visite_id=?`, [visiteId]),
    db.getFirstAsync(`SELECT progression_pct,trame_id FROM visites WHERE id=?`, [visiteId]),
  ]);

  const trame = obtenirTrame(visite?.trame_id || DEFAULT_TRAME_ID);
  const actifs = trame.id === 'vmc' ? panelsVmcActifs(champsRows, controlesRows) : null;
  const clesTrame = construireClesTrame(trame, actifs);
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

  // Le ring REMAR doit utiliser le même référentiel que les pastilles
  // du parcours dynamique. Avant ce calcul, un avis S/N.S renseigné sur
  // une CTA était invisible dans la jauge, qui restait à 5 %.
  // Les trois étapes CTA retirées de la barre de navigation restent
  // comptées dans le parcours de cette CTA et dans ses exports.
  const isRemar = (trame.familyId || trame.id) === 'remar_v1';
  const etat = isRemar || withStatus
    ? await calculerEtatOnglets(visiteId, trame.id, { db, champsRows, controlesRows })
    : null;
  if (isRemar) {
    const values = Object.values(etat.tabs || {});
    total=values.reduce((sum,v)=>sum+Math.max(0,Number(v.total)||0),0);
    remplis=values.reduce((sum,v)=>sum+Math.max(0,Math.min(Number(v.total)||0,Number(v.done)||0)),0);
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
  return { pct, etat };
}

/** Coalesce les appels rapprochés, et retourne si demandé les pastilles
 * calculées sur les mêmes lignes SQLite que la progression. Par défaut le
 * contrat historique (nombre) reste strictement inchangé pour les appelants.
 */
export async function recalculerProgressionVisite(db, visiteId, { withStatus = false } = {}) {
  if (!db || !visiteId) return withStatus ? { pct: 0, etat: null } : 0;

  const existant = recalculsEnCours.get(visiteId);
  if (existant) {
    existant.dirty = true;
    if (withStatus) existant.withStatus = true;
    const result = await existant.promise;
    return withStatus ? result : result.pct;
  }

  const run = { dirty: false, withStatus: Boolean(withStatus), promise: null };
  run.promise = (async () => {
    let result;
    do {
      run.dirty = false;
      result = await calculerProgression(db, visiteId, run.withStatus);
    } while (run.dirty || (run.withStatus && !result.etat));
    return result;
  })().finally(() => {
    if (recalculsEnCours.get(visiteId) === run) recalculsEnCours.delete(visiteId);
  });

  recalculsEnCours.set(visiteId, run);
  const result = await run.promise;
  return withStatus ? result : result.pct;
}
