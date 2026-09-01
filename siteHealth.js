import { getDb } from './db.js';
import { getStatsSitePatrimoine } from './patrimoineDb.js';
import { getSiteHealthManualSettings, setSiteHealthManualSettings } from './featureSettings.js';

export const HEALTH_DIMENSIONS = Object.freeze([
  { key: 'conformite', label: 'Conformité technique', weight: 35 },
  { key: 'reserves', label: 'Réserves', weight: 25 },
  { key: 'equipements', label: 'État des équipements', weight: 20 },
  { key: 'suivi', label: 'Suivi / exploitation', weight: 10 },
  { key: 'donnees', label: 'Qualité des données', weight: 10 },
]);

const clampScore = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
};

function weightedScore(scores = {}) {
  let total = 0;
  let weights = 0;
  for (const dimension of HEALTH_DIMENSIONS) {
    const score = clampScore(scores[dimension.key]);
    if (score === null) continue;
    total += score * dimension.weight;
    weights += dimension.weight;
  }
  return weights ? Math.round(total / weights) : null;
}

function healthLevel(score) {
  const n = clampScore(score);
  if (n === null) return { key: 'unknown', label: 'Données insuffisantes' };
  if (n >= 80) return { key: 'good', label: 'Satisfaisant' };
  if (n >= 60) return { key: 'watch', label: 'À surveiller' };
  return { key: 'priority', label: 'Prioritaire' };
}

function daysSince(dateValue) {
  if (!dateValue) return null;
  const t = new Date(`${String(dateValue).slice(0, 10)}T12:00:00`).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function recencyScore(days) {
  if (days === null) return null;
  if (days <= 180) return 100;
  if (days <= 365) return 80;
  if (days <= 730) return 55;
  return 30;
}

async function latestVisit(db, siteId, forcedVisitId = null) {
  if (forcedVisitId) {
    const forced = await db.getFirstAsync(
      `SELECT id,site_id,date_visite,statut,progression_pct,trame_id,modifie_le FROM visites WHERE id=? AND site_id=?`,
      [forcedVisitId, siteId]
    );
    if (forced) return forced;
  }
  const completed = await db.getFirstAsync(
    `SELECT id,site_id,date_visite,statut,progression_pct,trame_id,modifie_le
     FROM visites WHERE site_id=? AND statut='terminee'
     ORDER BY COALESCE(date_visite,'') DESC,COALESCE(modifie_le,'') DESC LIMIT 1`,
    [siteId]
  );
  if (completed) return completed;
  return db.getFirstAsync(
    `SELECT id,site_id,date_visite,statut,progression_pct,trame_id,modifie_le
     FROM visites WHERE site_id=?
     ORDER BY COALESCE(date_visite,'') DESC,COALESCE(modifie_le,'') DESC LIMIT 1`,
    [siteId]
  );
}

async function controlStats(db, visiteId) {
  if (!visiteId) return { s: 0, ns: 0, neutral: 0, total: 0, score: null };
  const rows = await db.getAllAsync(`SELECT avis FROM controles_visite WHERE visite_id=?`, [visiteId]);
  let s = 0, ns = 0, neutral = 0;
  for (const row of rows) {
    const value = String(row?.avis || '').trim().toUpperCase().replace(/\s+/g, '');
    if (value === 'S') s += 1;
    else if (value === 'NS' || value === 'N.S') ns += 1;
    else if (value) neutral += 1;
  }
  const pertinent = s + ns;
  return { s, ns, neutral, total: rows.length, score: pertinent ? Math.round((s / pertinent) * 100) : null };
}

function reserveScore(stats = {}) {
  const ouvertes = Number(stats.ouvertes || 0);
  const total = Number(stats.total || 0);
  if (!ouvertes) return 100;
  const volumePenalty = Math.min(75, ouvertes * 8);
  const ratioPenalty = total > 0 ? Math.round((ouvertes / total) * 25) : 25;
  return clampScore(100 - volumePenalty - ratioPenalty);
}

function equipmentScore(stats = {}) {
  const actifs = Number(stats.actifs || 0);
  const surveiller = Number(stats.aSurveiller || 0);
  if (!actifs) return null;
  return clampScore(((actifs - Math.min(actifs, surveiller)) / actifs) * 100);
}

export async function computeAutomaticSiteHealth(siteId, forcedVisitId = null) {
  const db = await getDb();
  const [visite, patrimoine] = await Promise.all([
    latestVisit(db, siteId, forcedVisitId),
    getStatsSitePatrimoine(siteId),
  ]);
  const controles = await controlStats(db, visite?.id);
  const reserves = patrimoine?.reserves || {};
  const equipements = patrimoine?.equipements || {};
  const ageDays = daysSince(visite?.date_visite);
  const recent = recencyScore(ageDays);
  const closure = Number(reserves.total || 0) > 0
    ? clampScore((Number(reserves.levees || 0) / Number(reserves.total || 1)) * 100)
    : 100;
  const suivi = recent === null ? null : clampScore(recent * 0.65 + closure * 0.35);
  const donnees = visite ? clampScore(visite.progression_pct) : null;

  const scores = {
    conformite: controles.score,
    reserves: reserveScore(reserves),
    equipements: equipmentScore(equipements),
    suivi,
    donnees,
  };
  const overall = weightedScore(scores);

  return {
    siteId,
    mode: 'auto',
    overall,
    level: healthLevel(overall),
    scores,
    dimensions: HEALTH_DIMENSIONS.map((dimension) => ({ ...dimension, score: scores[dimension.key] })),
    source: visite ? {
      visitId: visite.id,
      date: visite.date_visite || null,
      status: visite.statut || null,
      trameId: visite.trame_id || null,
      progression: clampScore(visite.progression_pct),
    } : null,
    details: {
      controles,
      reserves: {
        total: Number(reserves.total || 0),
        ouvertes: Number(reserves.ouvertes || 0),
        levees: Number(reserves.levees || 0),
      },
      equipements: {
        actifs: Number(equipements.actifs || 0),
        aSurveiller: Number(equipements.aSurveiller || 0),
        remplaces: Number(equipements.remplaces || 0),
      },
      visitAgeDays: ageDays,
    },
  };
}

function normalizeManualScores(scores = {}) {
  const out = {};
  for (const dimension of HEALTH_DIMENSIONS) out[dimension.key] = clampScore(scores?.[dimension.key]);
  return out;
}

export async function getSiteHealth(siteId, forcedVisitId = null) {
  const [automatic, settings] = await Promise.all([
    computeAutomaticSiteHealth(siteId, forcedVisitId),
    getSiteHealthManualSettings(siteId),
  ]);
  if (settings.mode !== 'manual') return { ...automatic, settings, automatic };

  const scores = normalizeManualScores(settings.scores);
  const overall = weightedScore(scores);
  return {
    ...automatic,
    mode: 'manual',
    overall,
    level: healthLevel(overall),
    scores,
    dimensions: HEALTH_DIMENSIONS.map((dimension) => ({ ...dimension, score: scores[dimension.key] })),
    settings,
    automatic,
    manualComment: settings.comment || '',
  };
}

export async function saveSiteHealthMode(siteId, mode, scores = {}, comment = '') {
  return setSiteHealthManualSettings(siteId, {
    mode: mode === 'manual' ? 'manual' : 'auto',
    scores: normalizeManualScores(scores),
    comment,
  });
}

export function aggregateSiteHealth(siteHealthList = []) {
  const valid = (siteHealthList || []).filter(Boolean);
  const dimensions = {};
  for (const dimension of HEALTH_DIMENSIONS) {
    const values = valid.map((item) => clampScore(item?.scores?.[dimension.key])).filter((value) => value !== null);
    dimensions[dimension.key] = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  }
  const overallValues = valid.map((item) => clampScore(item?.overall)).filter((value) => value !== null);
  const overall = overallValues.length ? Math.round(overallValues.reduce((sum, value) => sum + value, 0) / overallValues.length) : null;
  const ranked = valid.filter((item) => clampScore(item?.overall) !== null).sort((a, b) => a.overall - b.overall);
  return {
    overall,
    level: healthLevel(overall),
    scores: dimensions,
    dimensions: HEALTH_DIMENSIONS.map((dimension) => ({ ...dimension, score: dimensions[dimension.key] })),
    sites: valid.length,
    calculables: overallValues.length,
    satisfaisants: overallValues.filter((value) => value >= 80).length,
    aSurveiller: overallValues.filter((value) => value >= 60 && value < 80).length,
    prioritaires: overallValues.filter((value) => value < 60).length,
    lowest: ranked[0] || null,
  };
}

export async function getClientHealth(clientId) {
  const db = await getDb();
  const sites = await db.getAllAsync(`SELECT id,nom_site,adresse FROM sites WHERE client_id=? ORDER BY nom_site COLLATE NOCASE`, [clientId]);
  const health = [];
  for (const site of sites) {
    const item = await getSiteHealth(site.id);
    health.push({ ...item, siteName: site.nom_site || 'Site', address: site.adresse || '' });
  }
  return { ...aggregateSiteHealth(health), items: health };
}

export { clampScore, healthLevel, weightedScore };
