import { getDb } from './db.js';
import { createId } from './database/ids.js';

function clean(value) {
  const out = String(value ?? '').trim();
  return out || null;
}

async function requireMission(db, missionId) {
  const row = await db.getFirstAsync('SELECT id FROM missions WHERE id=?', [missionId]);
  if (!row) throw new Error('Mission introuvable.');
}

async function requireMissionSite(db, missionId, siteId) {
  if (!siteId) return null;
  const row = await db.getFirstAsync(
    'SELECT s.id FROM mission_sites s JOIN mission_site_links ml ON ml.site_id=s.id WHERE ml.mission_id=? AND s.id=?',
    [missionId, siteId]
  );
  if (!row) throw new Error('Le Site ne correspond pas à cette Mission.');
  return row;
}

export async function listerArchitectureTechniqueMission(missionId, { siteId = null } = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const params = [missionId];
  let siteClause = '';
  if (siteId) {
    siteClause = ' AND site_id=?';
    params.push(siteId);
  }

  const [sites, locations, installations, systems, networks, equipment, components] = await Promise.all([
    db.getAllAsync(
      'SELECT s.* FROM mission_sites s JOIN mission_site_links ml ON ml.site_id=s.id WHERE ml.mission_id=? ORDER BY s.name',
      [missionId]
    ),
    db.getAllAsync(
      'SELECT l.* FROM mission_locations l JOIN mission_site_links ml ON ml.site_id=l.site_id WHERE ml.mission_id=?' + (siteId ? ' AND l.site_id=?' : '') + ' ORDER BY l.site_id,l.sort_order,l.label',
      siteId ? [missionId, siteId] : [missionId]
    ),
    db.getAllAsync(
      'SELECT i.*,l.label AS location_label FROM mission_installations i LEFT JOIN mission_locations l ON l.id=i.location_id WHERE i.mission_id=?' + siteClause + ' ORDER BY i.label',
      params
    ),
    db.getAllAsync(
      'SELECT sy.*,i.label AS installation_label FROM mission_systems sy LEFT JOIN mission_installations i ON i.id=sy.installation_id WHERE sy.mission_id=? ORDER BY sy.label',
      [missionId]
    ),
    db.getAllAsync(
      'SELECT n.*,i.label AS installation_label,sy.label AS system_label,l.label AS location_label FROM mission_networks n LEFT JOIN mission_installations i ON i.id=n.installation_id LEFT JOIN mission_systems sy ON sy.id=n.system_id LEFT JOIN mission_locations l ON l.id=n.location_id WHERE n.mission_id=?' + siteClause + ' ORDER BY n.label',
      params
    ),
    db.getAllAsync(
      `SELECT e.*,s.name AS site_name,l.label AS location_label
       FROM mission_equipment e
       JOIN mission_site_links ml ON ml.site_id=e.site_id
       LEFT JOIN mission_sites s ON s.id=e.site_id
       LEFT JOIN mission_locations l ON l.id=e.location_id
       WHERE ml.mission_id=?${siteId ? ' AND e.site_id=?' : ''}
       ORDER BY e.type,e.brand,e.model`,
      siteId ? [missionId, siteId] : [missionId]
    ),
    db.getAllAsync(
      `SELECT c.*,e.type AS equipment_type,e.brand AS equipment_brand,e.model AS equipment_model
       FROM mission_components c
       JOIN mission_equipment e ON e.id=c.equipment_id
       JOIN mission_site_links ml ON ml.site_id=e.site_id
       WHERE c.mission_id=?${siteId ? ' AND e.site_id=?' : ''}
       ORDER BY c.label`,
      siteId ? [missionId, siteId] : [missionId]
    ),
  ]);

  return { sites, locations, installations, systems, networks, equipment, components };
}

export async function creerInstallationMission({
  missionId,
  siteId = null,
  locationId = null,
  type = null,
  label,
  status = null,
  properties = null,
} = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  await requireMissionSite(db, missionId, siteId);
  const id = createId('minst');
  await db.runAsync(
    'INSERT INTO mission_installations(id,mission_id,site_id,location_id,type,label,status,properties_json) VALUES(?,?,?,?,?,?,?,?)',
    [id, missionId, clean(siteId), clean(locationId), clean(type), clean(label) || 'Installation', clean(status), properties ? JSON.stringify(properties) : null]
  );
  return id;
}

export async function creerSystemeMission({
  missionId,
  installationId,
  type = null,
  label,
  status = null,
  properties = null,
} = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const installation = await db.getFirstAsync('SELECT id FROM mission_installations WHERE id=? AND mission_id=?', [installationId, missionId]);
  if (!installation) throw new Error('Installation introuvable.');
  const id = createId('msys');
  await db.runAsync(
    'INSERT INTO mission_systems(id,mission_id,installation_id,type,label,status,properties_json) VALUES(?,?,?,?,?,?,?)',
    [id, missionId, installationId, clean(type), clean(label) || 'Système', clean(status), properties ? JSON.stringify(properties) : null]
  );
  return id;
}

export async function creerReseauTechniqueMission({
  missionId,
  installationId = null,
  systemId = null,
  siteId = null,
  locationId = null,
  type = null,
  label,
  status = null,
  properties = null,
} = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  let installation = null;
  let system = null;
  if (systemId) {
    system = await db.getFirstAsync(
      'SELECT sy.id,sy.installation_id,i.site_id,i.location_id FROM mission_systems sy LEFT JOIN mission_installations i ON i.id=sy.installation_id WHERE sy.id=? AND sy.mission_id=?',
      [systemId, missionId]
    );
    if (!system) throw new Error('Système introuvable.');
    installationId = installationId || system.installation_id || null;
    siteId = siteId || system.site_id || null;
    locationId = locationId || system.location_id || null;
  }
  if (installationId) {
    installation = await db.getFirstAsync(
      'SELECT id,site_id,location_id FROM mission_installations WHERE id=? AND mission_id=?',
      [installationId, missionId]
    );
    if (!installation) throw new Error('Installation introuvable.');
    siteId = siteId || installation.site_id || null;
    locationId = locationId || installation.location_id || null;
  }
  await requireMissionSite(db, missionId, siteId);

  const id = createId('mnet');
  await db.runAsync(
    'INSERT INTO mission_networks(id,mission_id,site_id,location_id,installation_id,system_id,type,label,status,properties_json) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [id, missionId, clean(siteId), clean(locationId), clean(installationId), clean(systemId), clean(type), clean(label) || 'Réseau', clean(status), properties ? JSON.stringify(properties) : null]
  );
  return id;
}

export async function rattacherEquipementArchitectureMission({
  missionId,
  equipmentId,
  installationId = null,
  systemId = null,
  networkId = null,
} = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const equipment = await db.getFirstAsync(
    'SELECT e.id,e.site_id FROM mission_equipment e JOIN mission_site_links ml ON ml.site_id=e.site_id WHERE e.id=? AND ml.mission_id=?',
    [equipmentId, missionId]
  );
  if (!equipment) throw new Error('Équipement Mission introuvable.');

  let installation = null;
  let system = null;
  let network = null;

  if (networkId) {
    network = await db.getFirstAsync(
      'SELECT id,site_id,installation_id,system_id FROM mission_networks WHERE id=? AND mission_id=?',
      [networkId, missionId]
    );
    if (!network) throw new Error('Réseau introuvable.');
    installationId = installationId || network.installation_id || null;
    systemId = systemId || network.system_id || null;
    if (network.site_id && String(network.site_id) !== String(equipment.site_id)) throw new Error('Le réseau appartient à un autre Site.');
  }
  if (systemId) {
    system = await db.getFirstAsync(
      'SELECT sy.id,sy.installation_id,i.site_id FROM mission_systems sy LEFT JOIN mission_installations i ON i.id=sy.installation_id WHERE sy.id=? AND sy.mission_id=?',
      [systemId, missionId]
    );
    if (!system) throw new Error('Système introuvable.');
    installationId = installationId || system.installation_id || null;
    if (system.site_id && String(system.site_id) !== String(equipment.site_id)) throw new Error('Le système appartient à un autre Site.');
  }
  if (installationId) {
    installation = await db.getFirstAsync(
      'SELECT id,site_id FROM mission_installations WHERE id=? AND mission_id=?',
      [installationId, missionId]
    );
    if (!installation) throw new Error('Installation introuvable.');
    if (installation.site_id && String(installation.site_id) !== String(equipment.site_id)) throw new Error('L’installation appartient à un autre Site.');
  }

  await db.runAsync(
    "UPDATE mission_equipment SET installation_id=?,system_id=?,network_id=?,updated_at=datetime('now') WHERE id=?",
    [clean(installationId), clean(systemId), clean(networkId), equipmentId]
  );
}

export async function creerComposantEquipementMission({
  missionId,
  equipmentId,
  type = null,
  label,
  brand = null,
  model = null,
  state = null,
  properties = null,
} = {}) {
  const db = await getDb();
  await requireMission(db, missionId);
  const equipment = await db.getFirstAsync(
    'SELECT e.id FROM mission_equipment e JOIN mission_site_links ml ON ml.site_id=e.site_id WHERE e.id=? AND ml.mission_id=?',
    [equipmentId, missionId]
  );
  if (!equipment) throw new Error('Équipement Mission introuvable.');
  const id = createId('mcomp');
  await db.runAsync(
    'INSERT INTO mission_components(id,mission_id,equipment_id,type,label,brand,model,state,properties_json) VALUES(?,?,?,?,?,?,?,?,?)',
    [id, missionId, equipmentId, clean(type), clean(label) || 'Composant', clean(brand), clean(model), clean(state), properties ? JSON.stringify(properties) : null]
  );
  return id;
}

export async function supprimerObjetArchitectureMission(kind, id) {
  const db = await getDb();
  const table = kind === 'installation'
    ? 'mission_installations'
    : kind === 'system'
      ? 'mission_systems'
      : kind === 'network'
        ? 'mission_networks'
        : kind === 'component'
          ? 'mission_components'
          : null;
  if (!table) throw new Error('Type d’objet technique inconnu.');
  await db.runAsync('DELETE FROM ' + table + ' WHERE id=?', [id]);
}
