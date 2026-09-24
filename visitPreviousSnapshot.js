import { BoundedLruMap } from './boundedCache.js';
import { getDb, getVisite, getChampsVisite, getControlesVisite, listerCompteurs, listerReseaux } from './db.js';

const cache = new BoundedLruMap(3);
const pending = new Map();

function mapRows(rows, keyBuilder, valueBuilder) {
  const result = {};
  for (const row of rows || []) {
    const key = keyBuilder(row);
    if (!key) continue;
    result[key] = valueBuilder(row);
  }
  return result;
}

async function loadPreviousSnapshot(visiteId) {
  const current = await getVisite(visiteId);
  if (!current?.id) return null;
  const db = await getDb();
  const previous = await db.getFirstAsync(
    `SELECT v.id,v.date_visite,v.modifie_le
       FROM visites v
      WHERE v.id<>?
        AND v.site_id=?
        AND ((? IS NULL AND v.installation_id IS NULL) OR v.installation_id=?)
        AND COALESCE(v.trame_id,'icpe_v1')=COALESCE(?,'icpe_v1')
      ORDER BY COALESCE(v.date_visite,'') DESC,COALESCE(v.modifie_le,'') DESC
      LIMIT 1`,
    [current.id, current.site_id, current.installation_id || null, current.installation_id || null, current.trame_id || null]
  );
  if (!previous?.id) {
    return { currentVisitId: current.id, previousVisitId: null, previousDate: null, fields: {}, controls: {}, meters: {}, networks: {} };
  }

  const [fields, controls, meters, networks] = await Promise.all([
    getChampsVisite(previous.id),
    getControlesVisite(previous.id),
    listerCompteurs(previous.id),
    listerReseaux(previous.id),
  ]);

  return {
    currentVisitId: current.id,
    previousVisitId: previous.id,
    previousDate: previous.date_visite || null,
    fields: mapRows(fields, (row) => row?.section_code && row?.cle ? `${row.section_code}||${row.cle}` : null, (row) => row.valeur),
    controls: mapRows(controls, (row) => row?.section_code && row?.cle ? `${row.section_code}||${row.cle}` : null, (row) => ({ avis: row.avis || null, commentaire: row.commentaire || null })),
    meters: mapRows(meters, (row) => row?.compteur_site_id || row?.id || row?.label, (row) => ({ label: row.label || '', valeur: row.valeur ?? null, unite: row.unite || null })),
    networks: mapRows(networks, (row) => row?.reseau_site_id || row?.id || row?.nom_reseau, (row) => ({ nom: row.nom_reseau || '', tExt: row.t_ext_c ?? null, tDep: row.t_dep_c ?? null, courbe: row.courbe_de_chauffe ?? null })),
  };
}

export function prewarmPreviousVisitSnapshot(visiteId, { force = false } = {}) {
  const key = String(visiteId || '');
  if (!key) return Promise.resolve(null);
  if (!force) {
    const cached = cache.get(key);
    if (cached) return Promise.resolve(cached);
    if (pending.has(key)) return pending.get(key);
  }
  const promise = loadPreviousSnapshot(key)
    .then((snapshot) => {
      cache.set(key, snapshot);
      return snapshot;
    })
    .finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}

export function getPreviousVisitSnapshot(visiteId) {
  return cache.get(String(visiteId || '')) || null;
}

export function invalidatePreviousVisitSnapshot(visiteId) {
  cache.delete(String(visiteId || ''));
}

export function previousVisitSnapshotStats() {
  return { cached: cache.size, pending: pending.size, limit: 3 };
}
