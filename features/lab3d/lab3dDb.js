import { openAppDatabase } from './database/index.js';
import { createId } from './database/ids.js';

const DEFAULT_GRID_STEP = 0.25;

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

export const LAB3D_EQUIPMENT_PRESETS = Object.freeze([
  { code: 'chaudiere', label: 'Chaudière', icon: '🔥', width: 1.4, depth: 0.9, height: 1.55, anchor: 'floor' },
  { code: 'pompe', label: 'Pompe / circulateur', icon: '◉', width: 0.75, depth: 0.45, height: 0.55, anchor: 'floor' },
  { code: 'adoucisseur', label: 'Adoucisseur', icon: '💧', width: 0.55, depth: 0.55, height: 1.45, anchor: 'floor' },
  { code: 'ballon', label: 'Ballon', icon: '⬭', width: 0.85, depth: 0.85, height: 1.75, anchor: 'floor' },
  { code: 'vase_expansion', label: "Vase d'expansion", icon: '◯', width: 0.55, depth: 0.55, height: 0.75, anchor: 'floor' },
  { code: 'echangeur', label: 'Échangeur', icon: '▥', width: 0.9, depth: 0.5, height: 1.2, anchor: 'floor' },
  { code: 'bouteille', label: 'Bouteille de découplage', icon: '⬭', width: 0.55, depth: 0.55, height: 1.5, anchor: 'floor' },
  { code: 'cta', label: 'CTA', icon: '▰', width: 2.4, depth: 1.2, height: 1.35, anchor: 'floor' },
  { code: 'vmc', label: 'Caisson VMC', icon: '▣', width: 1.1, depth: 0.75, height: 0.65, anchor: 'floor' },
  { code: 'ventilateur', label: 'Ventilateur / extracteur', icon: '✣', width: 0.8, depth: 0.65, height: 0.8, anchor: 'floor' },
  { code: 'armoire', label: 'Armoire électrique', icon: '⚡', width: 0.8, depth: 0.35, height: 1.8, anchor: 'floor' },
  { code: 'bac_sel', label: 'Bac à sel', icon: '□', width: 0.65, depth: 0.65, height: 0.8, anchor: 'floor' },
  { code: 'equipement', label: 'Équipement générique', icon: '⚙', width: 1, depth: 0.7, height: 1, anchor: 'floor' },
]);

export const LAB3D_DN = Object.freeze([15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200]);

export const LAB3D_NETWORK_TYPES = Object.freeze([
  { code: 'chauffage_depart', label: 'Chauffage départ' },
  { code: 'chauffage_retour', label: 'Chauffage retour' },
  { code: 'ecs', label: 'ECS' },
  { code: 'efs', label: 'EFS' },
  { code: 'bouclage_ecs', label: 'Bouclage ECS' },
  { code: 'gaz', label: 'Gaz' },
  { code: 'condensats', label: 'Condensats' },
  { code: 'fioul', label: 'Fioul' },
  { code: 'autre', label: 'Autre réseau' },
]);

function presetByCode(code) {
  return LAB3D_EQUIPMENT_PRESETS.find((item) => item.code === code)
    || LAB3D_EQUIPMENT_PRESETS[LAB3D_EQUIPMENT_PRESETS.length - 1];
}

export function inferLab3dProfile(equipment = {}) {
  const text = normalize([equipment.type_code, equipment.designation, equipment.marque, equipment.modele].filter(Boolean).join(' '));
  let code = 'equipement';
  if (text.includes('chaudiere') || text.includes('generateur')) code = 'chaudiere';
  else if (text.includes('adouc')) code = 'adoucisseur';
  else if (text.includes('bac a sel') || text.includes('bac sel')) code = 'bac_sel';
  else if (text.includes('pompe') || text.includes('circulateur')) code = 'pompe';
  else if (text.includes('vase')) code = 'vase_expansion';
  else if (text.includes('bouteille') || text.includes('decoupl')) code = 'bouteille';
  else if (text.includes('echangeur')) code = 'echangeur';
  else if (text.includes('ballon') || text.includes('stockage ecs')) code = 'ballon';
  else if (text.includes('cta') || text.includes('centrale traitement')) code = 'cta';
  else if (text.includes('vmc') || text.includes('caisson')) code = 'vmc';
  else if (text.includes('ventilateur') || text.includes('extracteur')) code = 'ventilateur';
  else if (text.includes('armoire') || text.includes('coffret elect')) code = 'armoire';
  const preset = presetByCode(code);
  return { ...preset, source: code === 'equipement' ? 'generic' : 'type-match' };
}

async function ensureInstallation(db, siteId) {
  let row = await db.getFirstAsync(
    `SELECT id FROM installations WHERE site_id=? AND actif=1 ORDER BY cree_le LIMIT 1`,
    [siteId]
  );
  if (row?.id) return row.id;
  const id = createId();
  await db.runAsync(
    `INSERT INTO installations(id,site_id,type_code,nom,description,actif) VALUES(?,?,?,?,?,1)`,
    [id, siteId, 'installation_technique', 'Installation technique', 'Créée automatiquement depuis LAB 3D']
  );
  return id;
}

export async function resolveLab3dContext({ siteId = null, visiteId = null } = {}) {
  const db = await openAppDatabase();
  if (siteId) {
    const site = await db.getFirstAsync(`SELECT id,nom_site FROM sites WHERE id=?`, [siteId]);
    if (!site) throw new Error('Site introuvable');
    return { db, siteId: site.id, nomSite: site.nom_site, visiteId: visiteId || null };
  }
  if (!visiteId) throw new Error('Site ou visite requis');
  const row = await db.getFirstAsync(
    `SELECT v.id AS visite_id,v.site_id,s.nom_site FROM visites v JOIN sites s ON s.id=v.site_id WHERE v.id=?`,
    [visiteId]
  );
  if (!row) throw new Error('Visite introuvable');
  return { db, siteId: row.site_id, nomSite: row.nom_site, visiteId: row.visite_id };
}

export async function ensureLab3dScene(siteId) {
  const db = await openAppDatabase();
  let scene = await db.getFirstAsync(`SELECT * FROM lab3d_scenes WHERE site_id=?`, [siteId]);
  if (scene) return scene;
  const id = createId();
  await db.runAsync(
    `INSERT INTO lab3d_scenes(id,site_id,nom,grid_step) VALUES(?,?,?,?)`,
    [id, siteId, 'Maquette technique', DEFAULT_GRID_STEP]
  );
  return db.getFirstAsync(`SELECT * FROM lab3d_scenes WHERE id=?`, [id]);
}

export async function loadLab3dSite({ siteId = null, visiteId = null } = {}) {
  const context = await resolveLab3dContext({ siteId, visiteId });
  const scene = await ensureLab3dScene(context.siteId);
  const [objects, networks, equipments, remarks] = await Promise.all([
    context.db.getAllAsync(`SELECT * FROM lab3d_objects WHERE scene_id=? ORDER BY cree_le,id`, [scene.id]),
    context.db.getAllAsync(`SELECT * FROM lab3d_networks WHERE scene_id=? ORDER BY cree_le,id`, [scene.id]),
    context.db.getAllAsync(
      `SELECT e.*,i.site_id,
        EXISTS(SELECT 1 FROM lab3d_objects o WHERE o.scene_id=? AND o.equipment_id=e.id) AS placed_3d
       FROM equipements e JOIN installations i ON i.id=e.installation_id
       WHERE i.site_id=? AND i.actif=1 AND e.statut='actif'
       ORDER BY COALESCE(e.designation,''),COALESCE(e.marque,''),COALESCE(e.modele,'')`,
      [scene.id, context.siteId]
    ),
    context.visiteId
      ? context.db.getAllAsync(
          `SELECT r.*,m.equipement_id
           FROM remarques r
           LEFT JOIN materiel m ON m.visite_id=r.visite_id AND m.equipement_id=r.reference_id
           WHERE r.visite_id=? AND r.reference_type='equipement' AND r.reference_id IS NOT NULL
           ORDER BY r.cree_le,r.id`,
          [context.visiteId]
        )
      : Promise.resolve([]),
  ]);
  return {
    ...context,
    scene,
    objects: objects.map(parseObject),
    networks: networks.map(parseNetwork),
    equipments: equipments.map((equipment) => ({ ...equipment, visualProfile: inferLab3dProfile(equipment) })),
    remarks,
  };
}

function parseObject(row) {
  let params = {};
  try { params = row.params_json ? JSON.parse(row.params_json) : {}; } catch { params = {}; }
  return { ...row, params };
}

function parseNetwork(row) {
  let points = [];
  try { points = JSON.parse(row.points_json || '[]'); } catch { points = []; }
  return { ...row, points };
}

export async function placeExistingEquipment(sceneId, equipment, position = {}) {
  if (!equipment?.id) throw new Error('Équipement invalide');
  const db = await openAppDatabase();
  const existing = await db.getFirstAsync(`SELECT * FROM lab3d_objects WHERE scene_id=? AND equipment_id=?`, [sceneId, equipment.id]);
  if (existing) return parseObject(existing);
  const profile = inferLab3dProfile(equipment);
  const id = createId();
  await db.runAsync(
    `INSERT INTO lab3d_objects(id,scene_id,equipment_id,kind,subtype,label,x,y,z,width,depth,height,rotation_deg,anchor_type,params_json)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, sceneId, equipment.id, 'equipment', profile.code,
      equipment.designation || profile.label,
      Number(position.x ?? 0), Number(position.y ?? 0), Number(position.z ?? 0),
      profile.width, profile.depth, profile.height, 0, profile.anchor,
      JSON.stringify({ visualSource: profile.source, support: null }),
    ]
  );
  return parseObject(await db.getFirstAsync(`SELECT * FROM lab3d_objects WHERE id=?`, [id]));
}

export async function createEquipmentFromLab3d(siteId, sceneId, presetCode, position = {}) {
  const db = await openAppDatabase();
  const installationId = await ensureInstallation(db, siteId);
  const profile = presetByCode(presetCode);
  const equipmentId = createId();
  await db.runAsync(
    `INSERT INTO equipements(id,installation_id,type_code,designation,statut) VALUES(?,?,?,?, 'actif')`,
    [equipmentId, installationId, profile.code, profile.label]
  );
  const equipment = { id: equipmentId, type_code: profile.code, designation: profile.label, marque: null, modele: null };
  const object = await placeExistingEquipment(sceneId, equipment, position);
  return { equipment, object };
}

export async function updateLab3dObject(objectId, patch = {}) {
  const allowed = ['x','y','z','width','depth','height','rotation_deg','anchor_type','label','locked'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    sets.push(`${key}=?`);
    params.push(patch[key]);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'params')) {
    sets.push('params_json=?');
    params.push(JSON.stringify(patch.params || {}));
  }
  if (!sets.length) return;
  sets.push(`modifie_le=datetime('now')`);
  params.push(objectId);
  const db = await openAppDatabase();
  await db.runAsync(`UPDATE lab3d_objects SET ${sets.join(',')} WHERE id=?`, params);
}

export async function updateLab3dEquipmentData(equipmentId, patch = {}) {
  if (!equipmentId) return;
  const allowed = ['designation','marque','modele','type_code'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    sets.push(`${key}=?`);
    params.push(patch[key] || null);
  }
  if (!sets.length) return;
  sets.push(`modifie_le=datetime('now')`);
  params.push(equipmentId);
  const db = await openAppDatabase();
  await db.runAsync(`UPDATE equipements SET ${sets.join(',')} WHERE id=?`, params);
}

export async function removeLab3dObject(objectId) {
  const db = await openAppDatabase();
  await db.runAsync(`DELETE FROM lab3d_objects WHERE id=?`, [objectId]);
}

export async function setMasonryBase(object) {
  if (!object?.id) return;
  const current = object.params || {};
  const support = current.support?.type === 'masonry' ? null : {
    type: 'masonry',
    overhang: 0.05,
    height: 0.10,
    width: Number(object.width || 1) + 0.10,
    depth: Number(object.depth || 0.6) + 0.10,
  };
  await updateLab3dObject(object.id, { params: { ...current, support } });
}

export async function updateMasonryBase(object, patch = {}) {
  if (!object?.id) return;
  const current = object.params || {};
  const support = { ...(current.support || { type: 'masonry' }), ...patch, type: 'masonry' };
  await updateLab3dObject(object.id, { params: { ...current, support } });
}

export function makeOrthogonalNetworkPoints(start, end) {
  const a = {
    x: Number(start.x || 0),
    y: Number(start.y || 0),
    z: Number(start.z || 0) + Math.max(0.25, Number(start.height || 1) * 0.65),
    objectId: start.id,
  };
  const b = {
    x: Number(end.x || 0),
    y: Number(end.y || 0),
    z: Number(end.z || 0) + Math.max(0.25, Number(end.height || 1) * 0.65),
    objectId: end.id,
  };
  const routingZ = Math.max(a.z, b.z) + 0.15;
  return [
    a,
    { x: a.x, y: a.y, z: routingZ },
    { x: b.x, y: a.y, z: routingZ },
    { x: b.x, y: b.y, z: routingZ },
    b,
  ];
}

export async function createLab3dNetwork(sceneId, { typeCode, label = null, diameterMm = 50, start, end }) {
  if (!start?.id || !end?.id || start.id === end.id) throw new Error('Deux équipements différents sont nécessaires');
  const db = await openAppDatabase();
  const id = createId();
  const points = makeOrthogonalNetworkPoints(start, end);
  await db.runAsync(
    `INSERT INTO lab3d_networks(id,scene_id,type_code,label,diameter_mm,points_json) VALUES(?,?,?,?,?,?)`,
    [id, sceneId, typeCode || 'autre', label || null, Number(diameterMm || 50), JSON.stringify(points)]
  );
  return parseNetwork(await db.getFirstAsync(`SELECT * FROM lab3d_networks WHERE id=?`, [id]));
}

export async function updateLab3dNetwork(networkId, patch = {}) {
  const sets = [];
  const params = [];
  if (Object.prototype.hasOwnProperty.call(patch, 'diameter_mm')) { sets.push('diameter_mm=?'); params.push(Number(patch.diameter_mm)); }
  if (Object.prototype.hasOwnProperty.call(patch, 'type_code')) { sets.push('type_code=?'); params.push(patch.type_code); }
  if (Object.prototype.hasOwnProperty.call(patch, 'label')) { sets.push('label=?'); params.push(patch.label || null); }
  if (Object.prototype.hasOwnProperty.call(patch, 'points')) { sets.push('points_json=?'); params.push(JSON.stringify(patch.points || [])); }
  if (!sets.length) return;
  sets.push(`modifie_le=datetime('now')`);
  params.push(networkId);
  const db = await openAppDatabase();
  await db.runAsync(`UPDATE lab3d_networks SET ${sets.join(',')} WHERE id=?`, params);
}

export async function removeLab3dNetwork(networkId) {
  const db = await openAppDatabase();
  await db.runAsync(`DELETE FROM lab3d_networks WHERE id=?`, [networkId]);
}

export async function saveLab3dCamera(sceneId, camera = {}) {
  const db = await openAppDatabase();
  await db.runAsync(`UPDATE lab3d_scenes SET camera_json=?,modifie_le=datetime('now') WHERE id=?`, [JSON.stringify(camera || {}), sceneId]);
}
