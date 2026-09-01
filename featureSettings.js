import { getDb } from './db.js';

const LAB_PREFIX = 'lab_feature_';
const SITE_HEALTH_PREFIX = 'lab_health_site_';
const listeners = new Set();

export const LAB_FEATURES = Object.freeze([
  {
    key: 'health_dashboard',
    title: 'Santé du patrimoine',
    description: 'Tableaux de bord site/client, calcul automatique ou saisie manuelle, et insertion optionnelle dans les rapports.',
    icon: '♡',
  },
  {
    key: 'hydraulic_schema',
    title: 'Schéma hydraulique',
    description: 'Éditeur expérimental de schémas techniques hydrauliques. Masqué partout quand il est désactivé.',
    icon: '⌁',
  },
]);

function featureKey(key) {
  return `${LAB_PREFIX}${String(key || '').trim()}`;
}

export async function getLabFeatureEnabled(key) {
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT value FROM _meta WHERE key=?`, [featureKey(key)]);
  return String(row?.value || '') === '1';
}

export async function setLabFeatureEnabled(key, enabled) {
  const db = await getDb();
  const value = enabled ? '1' : '0';
  await db.runAsync(
    `INSERT INTO _meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [featureKey(key), value]
  );
  for (const listener of listeners) {
    try { listener(String(key), !!enabled); } catch {}
  }
  return !!enabled;
}

export async function getLabFeatureStates() {
  const states = {};
  for (const feature of LAB_FEATURES) states[feature.key] = await getLabFeatureEnabled(feature.key);
  return states;
}

export function subscribeLabFeatureChanges(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function getHydraulicSchemaVisible() {
  return getLabFeatureEnabled('hydraulic_schema');
}

export async function setHydraulicSchemaVisible(enabled) {
  return setLabFeatureEnabled('hydraulic_schema', enabled);
}

export async function getSiteHealthManualSettings(siteId) {
  if (!siteId) return { mode: 'auto', scores: {}, comment: '', updatedAt: null };
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT value FROM _meta WHERE key=?`, [`${SITE_HEALTH_PREFIX}${siteId}`]);
  if (!row?.value) return { mode: 'auto', scores: {}, comment: '', updatedAt: null };
  try {
    const parsed = JSON.parse(row.value);
    return {
      mode: parsed?.mode === 'manual' ? 'manual' : 'auto',
      scores: parsed?.scores && typeof parsed.scores === 'object' ? parsed.scores : {},
      comment: String(parsed?.comment || ''),
      updatedAt: parsed?.updatedAt || null,
    };
  } catch {
    return { mode: 'auto', scores: {}, comment: '', updatedAt: null };
  }
}

export async function setSiteHealthManualSettings(siteId, settings = {}) {
  if (!siteId) throw new Error('Site manquant pour le réglage de santé.');
  const db = await getDb();
  const payload = {
    mode: settings?.mode === 'manual' ? 'manual' : 'auto',
    scores: settings?.scores && typeof settings.scores === 'object' ? settings.scores : {},
    comment: String(settings?.comment || '').trim(),
    updatedAt: new Date().toISOString(),
  };
  await db.runAsync(
    `INSERT INTO _meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [`${SITE_HEALTH_PREFIX}${siteId}`, JSON.stringify(payload)]
  );
  return payload;
}
