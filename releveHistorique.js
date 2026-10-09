/**
 * Historique d'un compteur : courbe des derniers index et repère d'écart.
 * Le repère compare le rythme de consommation de la période en cours à celui
 * des périodes précédentes : une indication, jamais un blocage ni un verdict.
 */
import { nombreIndex } from './meterDestinations.js';

const JOUR = 86400000;
const SEUIL_HAUT = 40; // % au-dessus de la moyenne
const SEUIL_BAS = -40;

const jourDe = (d) => { const t = Date.parse(String(d).slice(0, 10)); return Number.isFinite(t) ? t : NaN; };

/**
 * @param {Array<{date:string,valeur:number}>} historique relevés précédents (ordre quelconque)
 * @param {{valeur:any,date:string}} courant index saisi et date de la visite
 */
export function analyserHistorique(historique = [], courant = {}) {
  const serie = historique
    .map((h) => ({ t: jourDe(h.date), v: Number(h.valeur) }))
    .filter((h) => Number.isFinite(h.t) && Number.isFinite(h.v))
    .sort((a, b) => a.t - b.t);
  const n = nombreIndex(courant.valeur);
  const tc = jourDe(courant.date);
  const aCourant = n !== null && !Number.isNaN(n) && Number.isFinite(tc);
  const points = aCourant ? [...serie, { t: tc, v: n, courant: true }] : serie;

  // Périodes entre deux relevés successifs (ignore les baisses : remplacement ou remise à zéro).
  const periodes = [];
  for (let i = 1; i < points.length; i++) {
    const jours = (points[i].t - points[i - 1].t) / JOUR;
    const delta = points[i].v - points[i - 1].v;
    if (jours > 0 && delta >= 0) periodes.push({ jours, delta, courante: Boolean(points[i].courant), rythme: delta / jours });
  }
  const courante = periodes.find((p) => p.courante) || null;
  const passees = periodes.filter((p) => !p.courante);
  let tauxPct = null; let niveau = 'normal';
  if (courante && passees.length >= 2) {
    const moyenne = passees.reduce((s, p) => s + p.rythme, 0) / passees.length;
    if (moyenne > 0) {
      tauxPct = Math.round(((courante.rythme - moyenne) / moyenne) * 100);
      if (tauxPct >= SEUIL_HAUT) niveau = 'haut';
      else if (tauxPct <= SEUIL_BAS) niveau = 'bas';
    }
  }
  return {
    points, utile: points.length >= 3,
    ecart: courante ? courante.delta : null, jours: courante ? Math.round(courante.jours) : null,
    tauxPct, niveau,
  };
}

/** Coordonnées d'une courbe dans un cadre largeur × hauteur (marges comprises). */
export function coordonneesCourbe(points = [], largeur = 240, hauteur = 70, marge = 8) {
  if (!points.length) return [];
  const t0 = points[0].t; const t1 = points[points.length - 1].t;
  const vs = points.map((p) => p.v);
  const vMin = Math.min(...vs); const vMax = Math.max(...vs);
  const dx = t1 > t0 ? t1 - t0 : 1; const dy = vMax > vMin ? vMax - vMin : 1;
  return points.map((p) => ({
    x: marge + ((p.t - t0) / dx) * (largeur - 2 * marge),
    y: hauteur - marge - ((p.v - vMin) / dy) * (hauteur - 2 * marge),
    courant: Boolean(p.courant),
  }));
}

export function libelleTaux(taux) {
  if (taux == null) return '';
  return `${taux > 0 ? '+' : ''}${taux} % vs rythme habituel`;
}
