import { getDb } from './db.js';
import { createId } from './database/ids.js';

export const MISSION_LOCATION_KINDS = Object.freeze([
  ['building', 'Bâtiment'],
  ['level', 'Niveau / étage'],
  ['room', 'Local / pièce'],
  ['technical_room', 'Local technique'],
  ['boiler_room', 'Chaufferie'],
  ['substation', 'Sous-station'],
  ['ecs_room', 'Local ECS'],
  ['cta_room', 'Local CTA'],
  ['vmc_room', 'Local VMC'],
  ['pac_room', 'Local PAC / froid'],
  ['water_treatment_room', 'Traitement d’eau'],
  ['apartment', 'Logement'],
  ['zone', 'Zone'],
  ['roof', 'Toiture / terrasse'],
  ['exterior', 'Extérieur'],
  ['other', 'Autre']
]);

function clean(value) {
  const out = String(value ?? '').trim();
  return out || null;
}

async function requireMissionSite(db, missionId, siteId) {
  const row = await db.getFirstAsync(
    'SELECT s.id FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id WHERE l.mission_id=? AND s.id=?',
    [missionId, siteId]
  );
  if (!row) throw new Error('Le Site ne correspond pas à cette Mission.');
}

async function requireParent(db, siteId, parentLocationId) {
  if (!parentLocationId) return null;
  const row = await db.getFirstAsync('SELECT id,site_id,parent_location_id FROM mission_locations WHERE id=?', [
    parentLocationId
  ]);
  if (!row) throw new Error('Localisation parente introuvable.');
  if (String(row.site_id) !== String(siteId)) throw new Error('La localisation parente appartient à un autre Site.');
  return row;
}

export async function creerLocalisationMission({
  missionId,
  siteId,
  parentLocationId = null,
  kind = 'room',
  label
} = {}) {
  if (!missionId || !siteId) throw new Error('Mission et Site requis.');
  const finalLabel = clean(label);
  if (!finalLabel) throw new Error('Nom de la localisation requis.');
  const db = await getDb();
  await requireMissionSite(db, missionId, siteId);
  await requireParent(db, siteId, parentLocationId);

  const orderRow = await db.getFirstAsync(
    "SELECT COALESCE(MAX(sort_order),-1)+1 AS next_order FROM mission_locations WHERE site_id=? AND COALESCE(parent_location_id,'')=COALESCE(?,'')",
    [siteId, clean(parentLocationId)]
  );

  const id = createId('mloc');
  await db.runAsync(
    'INSERT INTO mission_locations(id,site_id,parent_location_id,kind,label,sort_order) VALUES(?,?,?,?,?,?)',
    [id, siteId, clean(parentLocationId), clean(kind) || 'room', finalLabel, Number(orderRow?.next_order || 0)]
  );
  return id;
}

export async function modifierLocalisationMission(locationId, { label, kind, parentLocationId, sortOrder } = {}) {
  const db = await getDb();
  const current = await db.getFirstAsync('SELECT * FROM mission_locations WHERE id=?', [locationId]);
  if (!current) throw new Error('Localisation introuvable.');

  if (parentLocationId !== undefined) {
    if (parentLocationId === locationId) throw new Error('Une localisation ne peut pas être son propre parent.');
    const parent = await requireParent(db, current.site_id, parentLocationId);
    if (parent) {
      let cursor = parent;
      const visited = new Set([locationId]);
      while (cursor?.parent_location_id) {
        if (visited.has(cursor.parent_location_id))
          throw new Error('Cette modification créerait une boucle dans la hiérarchie.');
        visited.add(cursor.parent_location_id);
        cursor = await db.getFirstAsync('SELECT id,parent_location_id FROM mission_locations WHERE id=?', [
          cursor.parent_location_id
        ]);
      }
    }
  }

  const setters = [];
  const values = [];
  if (label !== undefined) {
    setters.push('label=?');
    values.push(clean(label) || current.label);
  }
  if (kind !== undefined) {
    setters.push('kind=?');
    values.push(clean(kind) || current.kind);
  }
  if (parentLocationId !== undefined) {
    setters.push('parent_location_id=?');
    values.push(clean(parentLocationId));
  }
  if (sortOrder !== undefined) {
    setters.push('sort_order=?');
    values.push(Number(sortOrder) || 0);
  }
  if (!setters.length) return;
  setters.push("updated_at=datetime('now')");
  values.push(locationId);
  await db.runAsync('UPDATE mission_locations SET ' + setters.join(',') + ' WHERE id=?', values);
}

export async function supprimerLocalisationMission(locationId) {
  const db = await getDb();
  await db.runAsync('DELETE FROM mission_locations WHERE id=?', [locationId]);
}

export async function listerStructureMission(missionId) {
  const db = await getDb();
  const [sites, locations, equipment] = await Promise.all([
    db.getAllAsync(
      'SELECT s.* FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id WHERE l.mission_id=? ORDER BY s.name',
      [missionId]
    ),
    db.getAllAsync(
      'SELECT l.*, (SELECT COUNT(*) FROM mission_equipment e WHERE e.location_id=l.id) AS direct_equipment_count ' +
        'FROM mission_locations l JOIN mission_site_links ml ON ml.site_id=l.site_id ' +
        'WHERE ml.mission_id=? ORDER BY l.site_id,l.sort_order,l.label',
      [missionId]
    ),
    db.getAllAsync(
      'SELECT e.id,e.site_id,e.location_id,e.type,e.brand,e.model,e.state,e.verification_status ' +
        'FROM mission_equipment e JOIN mission_site_links ml ON ml.site_id=e.site_id ' +
        'WHERE ml.mission_id=? ORDER BY e.site_id,e.location_id,e.type,e.brand,e.model',
      [missionId]
    )
  ]);

  return { sites, locations, equipment };
}

export function construireArbreLocalisations({ sites = [], locations = [], equipment = [] } = {}) {
  const byParent = new Map();
  for (const loc of locations) {
    const key = loc.parent_location_id || '__root__:' + loc.site_id;
    const list = byParent.get(key) || [];
    list.push(loc);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort(
      (a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.label).localeCompare(String(b.label))
    );
  }

  const equipmentByLocation = new Map();
  const unlocatedBySite = new Map();
  for (const eq of equipment) {
    if (eq.location_id) {
      const list = equipmentByLocation.get(eq.location_id) || [];
      list.push(eq);
      equipmentByLocation.set(eq.location_id, list);
    } else {
      const list = unlocatedBySite.get(eq.site_id) || [];
      list.push(eq);
      unlocatedBySite.set(eq.site_id, list);
    }
  }

  const buildChildren = (siteId, parentId = null, depth = 0) => {
    const key = parentId || '__root__:' + siteId;
    return (byParent.get(key) || []).map((loc) => ({
      ...loc,
      depth,
      equipment: equipmentByLocation.get(loc.id) || [],
      children: buildChildren(siteId, loc.id, depth + 1)
    }));
  };

  return sites.map((site) => ({
    ...site,
    locations: buildChildren(site.id),
    unlocatedEquipment: unlocatedBySite.get(site.id) || []
  }));
}

export async function cheminLocalisationMission(locationId) {
  const db = await getDb();
  const parts = [];
  let current = await db.getFirstAsync('SELECT * FROM mission_locations WHERE id=?', [locationId]);
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(current);
    current = current.parent_location_id
      ? await db.getFirstAsync('SELECT * FROM mission_locations WHERE id=?', [current.parent_location_id])
      : null;
  }
  return parts;
}
