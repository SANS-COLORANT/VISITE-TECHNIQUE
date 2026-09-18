import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { exporterGeoPackageLocal } from './missionNativeTools.js';

function clean(value) {
  const out = String(value ?? '').trim();
  return out || null;
}

function safeName(value = 'plan') {
  return String(value || 'plan')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.-]+|[_\.-]+$/g, '')
    .slice(0, 100) || 'plan';
}

function parseJson(value, fallback = null) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function distance(a, b) {
  const dx = Number(b?.x || 0) - Number(a?.x || 0);
  const dy = Number(b?.y || 0) - Number(a?.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function polygonArea(points = []) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += Number(a.x || 0) * Number(b.y || 0) - Number(b.x || 0) * Number(a.y || 0);
  }
  return Math.abs(sum) / 2;
}

function polygonPerimeter(points = []) {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) sum += distance(points[i], points[(i + 1) % points.length]);
  return sum;
}

export async function choisirEtImporterPlanMission({ missionId, siteId = null } = {}) {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*', 'application/geo+json', 'application/json'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked?.canceled) return null;
  const asset = picked?.assets?.[0];
  if (!asset?.uri) throw new Error('Fichier inaccessible.');

  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('Stockage local indisponible.');
  const folder = root + 'metra-missions/' + safeName(missionId) + '/plans/';
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  const filename = Date.now() + '__' + safeName(asset.name || 'plan');
  const destination = folder + filename;
  await FileSystem.copyAsync({ from: asset.uri, to: destination });

  const db = await getDb();
  const id = createId('mdoc');
  const mime = String(asset.mimeType || '').toLowerCase();
  const type = mime.includes('pdf') ? 'plan_pdf' : mime.includes('image') ? 'plan_image' : 'plan_source';
  await db.runAsync(
    'INSERT INTO mission_documents(id,mission_id,site_id,type,name,source,file_uri,visibility,offline_state,document_date) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [id, missionId, clean(siteId), type, asset.name || filename, 'import_plan', destination, 'internal', 'available_offline', new Date().toISOString().slice(0, 10)]
  );
  const layerId = createId('mplayer');
  await db.runAsync(
    'INSERT INTO mission_plan_layers(id,mission_id,document_id,label,kind,sort_order) VALUES(?,?,?,?,?,?)',
    [layerId, missionId, id, 'Annotations terrain', 'annotation', 0]
  );
  return { id, name: asset.name || filename, fileUri: destination, type, layerId };
}

export async function listerPlansMission(missionId) {
  const db = await getDb();
  return db.getAllAsync(
    "SELECT * FROM mission_documents WHERE mission_id=? AND type IN ('plan_pdf','plan_image','plan_source','plan_derived_pdf') ORDER BY created_at DESC",
    [missionId]
  );
}

export async function listerCalquesPlan(documentId) {
  const db = await getDb();
  return db.getAllAsync('SELECT * FROM mission_plan_layers WHERE document_id=? ORDER BY sort_order,created_at', [documentId]);
}

export async function creerCalquePlan({ missionId, documentId, label, kind = 'annotation', style = null } = {}) {
  const db = await getDb();
  const id = createId('mplayer');
  const count = await db.getFirstAsync('SELECT COUNT(*) AS c FROM mission_plan_layers WHERE document_id=?', [documentId]);
  await db.runAsync(
    'INSERT INTO mission_plan_layers(id,mission_id,document_id,label,kind,sort_order,style_json) VALUES(?,?,?,?,?,?,?)',
    [id, missionId, documentId, clean(label) || 'Calque', kind, Number(count?.c || 0), style ? JSON.stringify(style) : null]
  );
  return id;
}

const GEOMETRY_LINK_KEYS = Object.freeze([
  'site_id',
  'location_id',
  'equipment_id',
  'point_id',
  'subject_id',
  'measure_id',
  'photo_id',
  'action_id',
  'installation_id',
  'system_id',
  'network_id',
  'signature_id',
]);

function planGeometryToGeoJson(annotationType, geometry) {
  if (!geometry) return null;
  const rawPoints = Array.isArray(geometry.points)
    ? geometry.points
    : (geometry.x !== undefined && geometry.y !== undefined ? [geometry] : []);
  const points = rawPoints
    .map((point) => [Number(point?.x), Number(point?.y)])
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (!points.length) return null;

  if (['point', 'symbol', 'text', 'count', 'signature'].includes(annotationType)) {
    return { type: 'Point', coordinates: points[0] };
  }
  if (annotationType === 'polygon') {
    if (points.length < 3) return null;
    const ring = [...points];
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
    return { type: 'Polygon', coordinates: [ring] };
  }
  if (points.length < 2) return null;
  return { type: 'LineString', coordinates: points };
}

async function resolveEntityGeometryContext(db, missionId, entityType, entityId) {
  const type = clean(entityType);
  const id = clean(entityId);
  if (!type || !id) return {};

  if (type === 'site') {
    const row = await db.getFirstAsync(
      'SELECT s.id FROM mission_sites s JOIN mission_site_links ml ON ml.site_id=s.id WHERE s.id=? AND ml.mission_id=?',
      [id, missionId]
    );
    if (!row) throw new Error('Site Mission introuvable.');
    return { site_id: row.id };
  }
  if (type === 'location') {
    const row = await db.getFirstAsync(
      'SELECT l.id,l.site_id FROM mission_locations l JOIN mission_site_links ml ON ml.site_id=l.site_id WHERE l.id=? AND ml.mission_id=?',
      [id, missionId]
    );
    if (!row) throw new Error('Localisation Mission introuvable.');
    return { site_id: row.site_id, location_id: row.id };
  }
  if (type === 'equipment') {
    const row = await db.getFirstAsync(
      'SELECT e.id,e.site_id,e.location_id FROM mission_equipment e JOIN mission_site_links ml ON ml.site_id=e.site_id WHERE e.id=? AND ml.mission_id=?',
      [id, missionId]
    );
    if (!row) throw new Error('Équipement Mission introuvable.');
    return { site_id: row.site_id, location_id: row.location_id, equipment_id: row.id };
  }
  if (type === 'point') {
    const row = await db.getFirstAsync(
      'SELECT id,site_id,location_id,equipment_id FROM mission_points WHERE id=? AND mission_id=?',
      [id, missionId]
    );
    if (!row) throw new Error('Point Mission introuvable.');
    return { site_id: row.site_id, location_id: row.location_id, equipment_id: row.equipment_id, point_id: row.id };
  }
  if (type === 'subject') {
    const row = await db.getFirstAsync(
      'SELECT id,site_id,location_id FROM mission_subjects WHERE id=? AND mission_id=?',
      [id, missionId]
    );
    if (!row) throw new Error('Sujet Mission introuvable.');
    return { site_id: row.site_id, location_id: row.location_id, subject_id: row.id };
  }
  if (type === 'measure') {
    const row = await db.getFirstAsync(
      'SELECT id,site_id,location_id,point_id,equipment_id FROM mission_measures WHERE id=? AND mission_id=?',
      [id, missionId]
    );
    if (!row) throw new Error('Mesure Mission introuvable.');
    return { site_id: row.site_id, location_id: row.location_id, equipment_id: row.equipment_id, point_id: row.point_id, measure_id: row.id };
  }
  if (type === 'photo') {
    const row = await db.getFirstAsync(
      'SELECT id,site_id,location_id,point_id,equipment_id,action_id FROM mission_photos WHERE id=? AND mission_id=?',
      [id, missionId]
    );
    if (!row) throw new Error('Photo Mission introuvable.');
    return {
      site_id: row.site_id,
      location_id: row.location_id,
      equipment_id: row.equipment_id,
      point_id: row.point_id,
      action_id: row.action_id,
      photo_id: row.id,
    };
  }
  if (type === 'action') {
    const row = await db.getFirstAsync(
      'SELECT id,site_id,location_id,equipment_id,source_point_id FROM mission_actions WHERE id=? AND mission_id=?',
      [id, missionId]
    );
    if (!row) throw new Error('Action Mission introuvable.');
    return { site_id: row.site_id, location_id: row.location_id, equipment_id: row.equipment_id, point_id: row.source_point_id, action_id: row.id };
  }
  if (type === 'installation') {
    const row = await db.getFirstAsync(
      'SELECT id,site_id,location_id FROM mission_installations WHERE id=? AND mission_id=?',
      [id, missionId]
    );
    if (!row) throw new Error('Installation Mission introuvable.');
    return { site_id: row.site_id, location_id: row.location_id, installation_id: row.id };
  }
  if (type === 'system') {
    const row = await db.getFirstAsync(
      'SELECT sy.id,sy.installation_id,i.site_id,i.location_id FROM mission_systems sy LEFT JOIN mission_installations i ON i.id=sy.installation_id WHERE sy.id=? AND sy.mission_id=?',
      [id, missionId]
    );
    if (!row) throw new Error('Système Mission introuvable.');
    return { site_id: row.site_id, location_id: row.location_id, installation_id: row.installation_id, system_id: row.id };
  }
  if (type === 'network') {
    const row = await db.getFirstAsync(
      'SELECT id,site_id,location_id,installation_id,system_id FROM mission_networks WHERE id=? AND mission_id=?',
      [id, missionId]
    );
    if (!row) throw new Error('Réseau Mission introuvable.');
    return {
      site_id: row.site_id,
      location_id: row.location_id,
      installation_id: row.installation_id,
      system_id: row.system_id,
      network_id: row.id,
    };
  }
  if (type === 'signature') {
    const row = await db.getFirstAsync(
      'SELECT id,visit_id FROM mission_signatures WHERE id=? AND mission_id=?',
      [id, missionId]
    );
    if (!row) throw new Error('Signature Mission introuvable.');
    let siteId = null;
    if (row.visit_id) {
      const visit = await db.getFirstAsync('SELECT site_id FROM mission_visits WHERE id=? AND mission_id=?', [row.visit_id, missionId]);
      siteId = visit?.site_id || null;
    }
    return { site_id: siteId, signature_id: row.id };
  }
  throw new Error('Type de liaison non pris en charge : ' + type);
}

function geometryLinkValues(context = {}, fallbackSiteId = null) {
  return GEOMETRY_LINK_KEYS.map((key) => key === 'site_id'
    ? (context.site_id || fallbackSiteId || null)
    : (context[key] || null));
}

export async function ajouterAnnotationPlan({
  missionId,
  documentId,
  layerId = null,
  pageNumber = 1,
  annotationType,
  geometry = null,
  text = null,
  symbolKey = null,
  style = null,
  properties = null,
  linkedEntityType = null,
  linkedEntityId = null,
} = {}) {
  const db = await getDb();
  const document = await db.getFirstAsync(
    'SELECT id,site_id FROM mission_documents WHERE id=? AND mission_id=?',
    [documentId, missionId]
  );
  if (!document) throw new Error('Plan Mission introuvable.');

  const id = createId('mpann');
  const geoJson = planGeometryToGeoJson(annotationType || 'point', geometry);
  const entityContext = linkedEntityType && linkedEntityId
    ? await resolveEntityGeometryContext(db, missionId, linkedEntityType, linkedEntityId)
    : {};
  const geometryId = geoJson ? createId('mgeo') : null;
  const linkValues = geometryLinkValues(entityContext, document.site_id);

  await db.withTransactionAsync(async () => {
    if (geometryId) {
      await db.runAsync(
        'INSERT INTO mission_geometries(' +
          'id,mission_id,site_id,location_id,equipment_id,point_id,subject_id,measure_id,photo_id,action_id,installation_id,system_id,network_id,signature_id,' +
          'geometry_type,geojson,coordinate_space,plan_document_id,plan_page,label,style_json,properties_json' +
        ') VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          geometryId,
          missionId,
          ...linkValues,
          String(geoJson.type || annotationType || 'geometry').toLowerCase(),
          JSON.stringify(geoJson),
          'plan',
          documentId,
          Number(pageNumber) || 1,
          clean(text),
          style ? JSON.stringify(style) : null,
          properties ? JSON.stringify(properties) : null,
        ]
      );
    }
    await db.runAsync(
      'INSERT INTO mission_plan_annotations(' +
        'id,mission_id,document_id,layer_id,page_number,annotation_type,geometry_json,geometry_id,text,symbol_key,style_json,linked_entity_type,linked_entity_id' +
      ') VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        id, missionId, documentId, clean(layerId), Number(pageNumber) || 1, annotationType || 'point',
        geometry ? JSON.stringify(geometry) : null, geometryId, clean(text), clean(symbolKey), style ? JSON.stringify(style) : null,
        clean(linkedEntityType), clean(linkedEntityId),
      ]
    );
  });
  return id;
}

export async function lierAnnotationPlan(annotationId, { entityType = null, entityId = null } = {}) {
  const db = await getDb();
  const annotation = await db.getFirstAsync(
    'SELECT a.id,a.mission_id,a.document_id,a.geometry_id,d.site_id AS document_site_id FROM mission_plan_annotations a JOIN mission_documents d ON d.id=a.document_id WHERE a.id=?',
    [annotationId]
  );
  if (!annotation) throw new Error('Annotation introuvable.');
  const context = entityType && entityId
    ? await resolveEntityGeometryContext(db, annotation.mission_id, entityType, entityId)
    : {};
  const values = geometryLinkValues(context, annotation.document_site_id);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE mission_plan_annotations SET linked_entity_type=?,linked_entity_id=?,updated_at=datetime('now') WHERE id=?",
      [clean(entityType), clean(entityId), annotationId]
    );
    if (annotation.geometry_id) {
      await db.runAsync(
        "UPDATE mission_geometries SET site_id=?,location_id=?,equipment_id=?,point_id=?,subject_id=?,measure_id=?,photo_id=?,action_id=?,installation_id=?,system_id=?,network_id=?,signature_id=?,updated_at=datetime('now') WHERE id=?",
        [...values, annotation.geometry_id]
      );
    }
  });
}

export async function supprimerAnnotationPlan(id) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    'SELECT id,geometry_id FROM mission_plan_annotations WHERE id=?',
    [id]
  );
  if (!row) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM mission_plan_annotations WHERE id=?', [id]);
    if (!row.geometry_id) return;
    const [remaining, photoRef, geometry] = await Promise.all([
      db.getFirstAsync('SELECT COUNT(*) AS c FROM mission_plan_annotations WHERE geometry_id=?', [row.geometry_id]),
      db.getFirstAsync('SELECT COUNT(*) AS c FROM mission_photos WHERE geometry_id=?', [row.geometry_id]),
      db.getFirstAsync(
        'SELECT location_id,equipment_id,point_id,subject_id,measure_id,photo_id,action_id,installation_id,system_id,network_id,signature_id FROM mission_geometries WHERE id=?',
        [row.geometry_id]
      ),
    ]);
    const hasEntityLink = geometry && [
      geometry.location_id, geometry.equipment_id, geometry.point_id, geometry.subject_id, geometry.measure_id,
      geometry.photo_id, geometry.action_id, geometry.installation_id, geometry.system_id, geometry.network_id, geometry.signature_id,
    ].some(Boolean);
    if (!Number(remaining?.c || 0) && !Number(photoRef?.c || 0) && !hasEntityLink) {
      await db.runAsync('DELETE FROM mission_geometries WHERE id=?', [row.geometry_id]);
    }
  });
}

export async function listerAnnotationsPlan(documentId, pageNumber = 1) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    'SELECT a.*,l.label AS layer_label,l.visible AS layer_visible,l.locked AS layer_locked,' +
      'g.properties_json AS geometry_properties_json,g.network_id AS geometry_network_id,g.point_id AS geometry_point_id,g.action_id AS geometry_action_id ' +
    'FROM mission_plan_annotations a ' +
    'LEFT JOIN mission_plan_layers l ON l.id=a.layer_id ' +
    'LEFT JOIN mission_geometries g ON g.id=a.geometry_id ' +
    'WHERE a.document_id=? AND a.page_number=? ' +
    'ORDER BY COALESCE(l.sort_order,0),a.created_at',
    [documentId, Number(pageNumber) || 1]
  );
  return rows.map((row) => ({
    ...row,
    geometry: parseJson(row.geometry_json),
    style: parseJson(row.style_json, {}),
    geometryProperties: parseJson(row.geometry_properties_json, {}),
  }));
}

export async function listerCiblesAnnotationMission(missionId) {
  const db = await getDb();
  const [sites, locations, equipment, points, actions, measures, photos, installations, systems, networks, signatures] = await Promise.all([
    db.getAllAsync('SELECT s.id,s.name AS label,s.city AS subtitle FROM mission_sites s JOIN mission_site_links ml ON ml.site_id=s.id WHERE ml.mission_id=? ORDER BY s.name', [missionId]),
    db.getAllAsync('SELECT l.id,l.label,s.name AS site_name,l.kind FROM mission_locations l JOIN mission_site_links ml ON ml.site_id=l.site_id LEFT JOIN mission_sites s ON s.id=l.site_id WHERE ml.mission_id=? ORDER BY s.name,l.sort_order,l.label', [missionId]),
    db.getAllAsync('SELECT e.id,e.type,e.brand,e.model,s.name AS site_name,l.label AS location_label FROM mission_equipment e JOIN mission_site_links ml ON ml.site_id=e.site_id LEFT JOIN mission_sites s ON s.id=e.site_id LEFT JOIN mission_locations l ON l.id=e.location_id WHERE ml.mission_id=? ORDER BY s.name,e.type,e.brand,e.model LIMIT 3000', [missionId]),
    db.getAllAsync('SELECT p.id,p.label,p.description,p.status,s.name AS site_name FROM mission_points p LEFT JOIN mission_sites s ON s.id=p.site_id WHERE p.mission_id=? ORDER BY p.created_at DESC LIMIT 1500', [missionId]),
    db.getAllAsync('SELECT a.id,a.label,a.status,s.name AS site_name FROM mission_actions a LEFT JOIN mission_sites s ON s.id=a.site_id WHERE a.mission_id=? ORDER BY a.created_at DESC LIMIT 1500', [missionId]),
    db.getAllAsync('SELECT m.id,m.type,m.value_number,m.value_text,m.unit,s.name AS site_name FROM mission_measures m LEFT JOIN mission_sites s ON s.id=m.site_id WHERE m.mission_id=? ORDER BY m.created_at DESC LIMIT 1500', [missionId]),
    db.getAllAsync('SELECT p.id,p.label,p.type,p.taken_at,s.name AS site_name FROM mission_photos p LEFT JOIN mission_sites s ON s.id=p.site_id WHERE p.mission_id=? ORDER BY COALESCE(p.taken_at,p.created_at) DESC LIMIT 1000', [missionId]),
    db.getAllAsync('SELECT i.id,i.label,i.type,s.name AS site_name FROM mission_installations i LEFT JOIN mission_sites s ON s.id=i.site_id WHERE i.mission_id=? ORDER BY s.name,i.label', [missionId]),
    db.getAllAsync('SELECT sy.id,sy.label,sy.type,i.label AS installation_label FROM mission_systems sy LEFT JOIN mission_installations i ON i.id=sy.installation_id WHERE sy.mission_id=? ORDER BY i.label,sy.label', [missionId]),
    db.getAllAsync('SELECT n.id,n.label,n.type,s.name AS site_name FROM mission_networks n LEFT JOIN mission_sites s ON s.id=n.site_id WHERE n.mission_id=? ORDER BY s.name,n.label', [missionId]),
    db.getAllAsync('SELECT id,signer_label,role_label,signed_at FROM mission_signatures WHERE mission_id=? ORDER BY COALESCE(signed_at,created_at) DESC', [missionId]),
  ]);

  return [
    ...sites.map((row) => ({ type: 'site', id: row.id, label: row.label, subtitle: row.subtitle || '' })),
    ...locations.map((row) => ({ type: 'location', id: row.id, label: row.label, subtitle: [row.site_name, row.kind].filter(Boolean).join(' · ') })),
    ...equipment.map((row) => ({ type: 'equipment', id: row.id, label: [row.type,row.brand,row.model].filter(Boolean).join(' · ') || 'Équipement', subtitle: [row.site_name,row.location_label].filter(Boolean).join(' · ') })),
    ...points.map((row) => ({ type: 'point', id: row.id, label: row.label || row.description || 'Point', subtitle: [row.site_name,row.status].filter(Boolean).join(' · ') })),
    ...actions.map((row) => ({ type: 'action', id: row.id, label: row.label || 'Action', subtitle: [row.site_name,row.status].filter(Boolean).join(' · ') })),
    ...measures.map((row) => ({ type: 'measure', id: row.id, label: row.type || 'Mesure', subtitle: [row.value_number ?? row.value_text, row.unit, row.site_name].filter((v) => v !== null && v !== undefined && v !== '').join(' · ') })),
    ...photos.map((row) => ({ type: 'photo', id: row.id, label: row.label || row.type || 'Photo', subtitle: [row.site_name,row.taken_at].filter(Boolean).join(' · ') })),
    ...installations.map((row) => ({ type: 'installation', id: row.id, label: row.label, subtitle: [row.site_name,row.type].filter(Boolean).join(' · ') })),
    ...systems.map((row) => ({ type: 'system', id: row.id, label: row.label, subtitle: [row.installation_label,row.type].filter(Boolean).join(' · ') })),
    ...networks.map((row) => ({ type: 'network', id: row.id, label: row.label, subtitle: [row.site_name,row.type].filter(Boolean).join(' · ') })),
    ...signatures.map((row) => ({ type: 'signature', id: row.id, label: row.signer_label || 'Signature', subtitle: [row.role_label,row.signed_at].filter(Boolean).join(' · ') })),
  ];
}

export async function creerReserveDepuisAnnotationPlan({
  annotationId,
  label,
  description = null,
  responsibleLabel = null,
  dueDate = null,
  dueText = null,
  priority = null,
  costEstimate = null,
} = {}) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    'SELECT a.id,a.mission_id,a.document_id,a.geometry_id,g.site_id,g.location_id,g.equipment_id ' +
    'FROM mission_plan_annotations a LEFT JOIN mission_geometries g ON g.id=a.geometry_id WHERE a.id=?',
    [annotationId]
  );
  if (!row) throw new Error('Annotation introuvable.');
  const finalLabel = clean(label) || 'Réserve localisée sur plan';

  let actorId = null;
  if (clean(responsibleLabel)) {
    const existing = await db.getFirstAsync(
      "SELECT id FROM mission_actors WHERE mission_id=? AND LOWER(COALESCE(company,name,''))=LOWER(?) LIMIT 1",
      [row.mission_id, clean(responsibleLabel)]
    );
    actorId = existing?.id || createId('mactor');
    if (!existing?.id) {
      await db.runAsync(
        'INSERT INTO mission_actors(id,mission_id,site_id,company,role,actor_type) VALUES(?,?,?,?,?,?)',
        [actorId, row.mission_id, row.site_id || null, clean(responsibleLabel), 'Responsable réserve', 'responsible']
      );
    }
  }

  const pointId = createId('mpt');
  const actionId = createId('mact');
  const cost = costEstimate === null || costEstimate === undefined || costEstimate === ''
    ? null
    : Number(String(costEstimate).replace(',', '.'));

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO mission_points(' +
        'id,mission_id,site_id,location_id,equipment_id,type,label,description,status,responsible_actor_id,due_date,due_text,priority,visibility,source_type,source_id' +
      ') VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        pointId, row.mission_id, row.site_id || null, row.location_id || null, row.equipment_id || null,
        'reserve', finalLabel, clean(description), 'open', actorId, clean(dueDate), clean(dueText), clean(priority),
        'internal', 'plan', row.document_id,
      ]
    );
    await db.runAsync(
      'INSERT INTO mission_point_history(id,point_id,status_after,comment,source) VALUES(?,?,?,?,?)',
      [createId('mphist'), pointId, 'open', clean(description), 'plan']
    );
    await db.runAsync(
      'INSERT INTO mission_actions(' +
        'id,mission_id,source_point_id,site_id,location_id,equipment_id,label,description,status,priority,responsible_actor_id,due_date,due_text,cost_estimate' +
      ') VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        actionId, row.mission_id, pointId, row.site_id || null, row.location_id || null, row.equipment_id || null,
        finalLabel, clean(description), 'open', clean(priority), actorId, clean(dueDate), clean(dueText),
        Number.isFinite(cost) ? cost : null,
      ]
    );
    await db.runAsync(
      "UPDATE mission_plan_annotations SET linked_entity_type='point',linked_entity_id=?,updated_at=datetime('now') WHERE id=?",
      [pointId, annotationId]
    );
    if (row.geometry_id) {
      await db.runAsync(
        "UPDATE mission_geometries SET point_id=?,action_id=?,updated_at=datetime('now') WHERE id=?",
        [pointId, actionId, row.geometry_id]
      );
    }
  });
  return { pointId, actionId };
}

export async function creerReseauDepuisPlanMission({
  missionId,
  documentId,
  label,
  type = null,
  properties = null,
} = {}) {
  const db = await getDb();
  const document = await db.getFirstAsync(
    'SELECT id,site_id,location_id FROM mission_documents WHERE id=? AND mission_id=?',
    [documentId, missionId]
  );
  if (!document) throw new Error('Plan Mission introuvable.');
  const id = createId('mnet');
  await db.runAsync(
    'INSERT INTO mission_networks(id,mission_id,site_id,location_id,type,label,properties_json) VALUES(?,?,?,?,?,?,?)',
    [id, missionId, document.site_id || null, document.location_id || null, clean(type), clean(label) || 'Réseau technique', properties ? JSON.stringify(properties) : null]
  );
  return id;
}

export async function calibrerPlan({
  missionId,
  documentId,
  pageNumber = 1,
  pointA,
  pointB,
  displayWidth,
  displayHeight,
  realDistance,
  unit = 'm',
} = {}) {
  const pxA = { x: Number(pointA.x) * Number(displayWidth), y: Number(pointA.y) * Number(displayHeight) };
  const pxB = { x: Number(pointB.x) * Number(displayWidth), y: Number(pointB.y) * Number(displayHeight) };
  const pixelDistance = distance(pxA, pxB);
  const real = Number(String(realDistance).replace(',', '.'));
  if (!Number.isFinite(real) || real <= 0 || pixelDistance <= 0) throw new Error('Calibration invalide.');

  const db = await getDb();
  const existing = await db.getFirstAsync(
    'SELECT id FROM mission_plan_calibrations WHERE document_id=? AND page_number=? ORDER BY updated_at DESC LIMIT 1',
    [documentId, Number(pageNumber) || 1]
  );
  const id = existing?.id || createId('mpcal');
  const ratio = real / pixelDistance;
  if (existing?.id) {
    await db.runAsync(
      'UPDATE mission_plan_calibrations SET point_a_json=?,point_b_json=?,pixel_distance=?,real_distance=?,unit=?,scale_ratio=?,updated_at=datetime(\'now\') WHERE id=?',
      [JSON.stringify(pointA), JSON.stringify(pointB), pixelDistance, real, unit, ratio, id]
    );
  } else {
    await db.runAsync(
      'INSERT INTO mission_plan_calibrations(id,mission_id,document_id,page_number,point_a_json,point_b_json,pixel_distance,real_distance,unit,scale_ratio) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [id, missionId, documentId, Number(pageNumber) || 1, JSON.stringify(pointA), JSON.stringify(pointB), pixelDistance, real, unit, ratio]
    );
  }
  return { id, pixelDistance, realDistance: real, unit, scaleRatio: ratio };
}

export async function getCalibrationPlan(documentId, pageNumber = 1) {
  const db = await getDb();
  return db.getFirstAsync(
    'SELECT * FROM mission_plan_calibrations WHERE document_id=? AND page_number=? ORDER BY updated_at DESC LIMIT 1',
    [documentId, Number(pageNumber) || 1]
  );
}

export function mesurerGeometriePlan({ geometry, calibration, displayWidth, displayHeight } = {}) {
  if (!geometry || !calibration) return null;
  const points = (geometry.points || []).map((p) => ({ x: Number(p.x) * displayWidth, y: Number(p.y) * displayHeight }));
  const ratio = Number(calibration.scale_ratio || 0);
  if (!ratio || !points.length) return null;
  if (geometry.type === 'line' || geometry.type === 'distance') {
    if (points.length < 2) return null;
    const px = distance(points[0], points[1]);
    return { type: 'distance', value: px * ratio, unit: calibration.unit || 'm' };
  }
  if (geometry.type === 'polygon') {
    const areaPx = polygonArea(points);
    const perimeterPx = polygonPerimeter(points);
    return {
      type: 'polygon',
      area: areaPx * ratio * ratio,
      areaUnit: (calibration.unit || 'm') + '²',
      perimeter: perimeterPx * ratio,
      perimeterUnit: calibration.unit || 'm',
    };
  }
  if (geometry.type === 'angle' && points.length >= 3) {
    const a = points[0], b = points[1], c = points[2];
    const v1 = { x: a.x - b.x, y: a.y - b.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const norm = Math.sqrt((v1.x ** 2 + v1.y ** 2) * (v2.x ** 2 + v2.y ** 2));
    const angle = norm ? Math.acos(Math.max(-1, Math.min(1, dot / norm))) * 180 / Math.PI : 0;
    return { type: 'angle', value: angle, unit: '°' };
  }
  return null;
}

function normalizedToPdf(point, width, height) {
  return { x: Number(point?.x || 0) * width, y: height - Number(point?.y || 0) * height };
}

async function pdfFromSource(document) {
  const base64 = await FileSystem.readAsStringAsync(document.file_uri, { encoding: FileSystem.EncodingType.Base64 });
  if (String(document.type).includes('pdf') || String(document.name || '').toLowerCase().endsWith('.pdf')) {
    return PDFDocument.load(base64);
  }
  const pdf = await PDFDocument.create();
  const lower = String(document.name || document.file_uri || '').toLowerCase();
  const image = lower.endsWith('.png') ? await pdf.embedPng(base64) : await pdf.embedJpg(base64);
  const page = pdf.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  return pdf;
}

export async function exporterPlanPdfAnnote({ missionId, documentId, share = true } = {}) {
  const db = await getDb();
  const document = await db.getFirstAsync('SELECT * FROM mission_documents WHERE id=? AND mission_id=?', [documentId, missionId]);
  if (!document?.file_uri) throw new Error('Plan source introuvable.');

  const annotations = await db.getAllAsync(
    `SELECT a.* FROM mission_plan_annotations a
     LEFT JOIN mission_plan_layers l ON l.id=a.layer_id
     WHERE a.document_id=? AND COALESCE(l.visible,1)=1 ORDER BY a.page_number,a.created_at`,
    [documentId]
  );
  const pdf = await pdfFromSource(document);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();

  for (const row of annotations) {
    const page = pages[Math.max(0, Math.min(pages.length - 1, Number(row.page_number || 1) - 1))];
    if (!page) continue;
    const { width, height } = page.getSize();
    const geometry = parseJson(row.geometry_json, {});
    const points = geometry?.points || [];
    const color = rgb(0.18, 0.49, 0.35);

    if (row.annotation_type === 'text') {
      const p = normalizedToPdf(points[0] || geometry, width, height);
      page.drawText(String(row.text || ''), { x: p.x, y: p.y, size: 10, font, color });
      continue;
    }
    if (row.annotation_type === 'point' || row.annotation_type === 'symbol' || row.annotation_type === 'count') {
      const p = normalizedToPdf(points[0] || geometry, width, height);
      page.drawCircle({ x: p.x, y: p.y, size: 5, borderColor: color, borderWidth: 2 });
      if (row.text) page.drawText(String(row.text), { x: p.x + 7, y: p.y + 2, size: 8, font, color });
      continue;
    }
    if ((row.annotation_type === 'line' || row.annotation_type === 'distance' || row.annotation_type === 'network' || row.annotation_type === 'angle') && points.length >= 2) {
      for (let i = 0; i < points.length - 1; i += 1) {
        page.drawLine({ start: normalizedToPdf(points[i], width, height), end: normalizedToPdf(points[i + 1], width, height), thickness: 2, color });
      }
      if (row.text) {
        const p = normalizedToPdf(points[Math.floor(points.length / 2)], width, height);
        page.drawText(String(row.text), { x: p.x + 4, y: p.y + 4, size: 8, font, color });
      }
      continue;
    }
    if (row.annotation_type === 'polygon' && points.length >= 3) {
      for (let i = 0; i < points.length; i += 1) {
        page.drawLine({
          start: normalizedToPdf(points[i], width, height),
          end: normalizedToPdf(points[(i + 1) % points.length], width, height),
          thickness: 2,
          color,
        });
      }
    }
  }

  const outputRoot = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  const name = 'Plan_annote_' + safeName(document.name || document.id) + '.pdf';
  const uri = outputRoot + name;
  const bytes = await pdf.saveAsBase64();
  await FileSystem.writeAsStringAsync(uri, bytes, { encoding: FileSystem.EncodingType.Base64 });

  const derivedId = createId('mdoc');
  await db.runAsync(
    'INSERT INTO mission_documents(id,mission_id,site_id,type,name,source,file_uri,visibility,offline_state,document_date) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [derivedId, missionId, document.site_id, 'plan_derived_pdf', name, 'generated_from:' + document.id, uri, 'internal', 'available_offline', new Date().toISOString().slice(0, 10)]
  );

  if (share && await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Plan annoté METRA' });
  }
  return { id: derivedId, uri, name };
}

async function chargerPdfSourceMission(db, missionId, documentId) {
  const source = await db.getFirstAsync('SELECT * FROM mission_documents WHERE id=? AND mission_id=?', [documentId, missionId]);
  if (!source?.file_uri) throw new Error('PDF source introuvable.');
  const base64 = await FileSystem.readAsStringAsync(source.file_uri, { encoding: FileSystem.EncodingType.Base64 });
  const pdf = await PDFDocument.load(base64);
  return { source, pdf };
}

async function enregistrerPdfDeriveMission(db, missionId, source, pdf, prefix) {
  const uri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + safeName(prefix || 'Plan') + '_' + Date.now() + '.pdf';
  await FileSystem.writeAsStringAsync(uri, await pdf.saveAsBase64(), { encoding: FileSystem.EncodingType.Base64 });
  const id = createId('mdoc');
  const name = (prefix || 'Plan') + '__' + (source.name || 'plan.pdf');
  await db.runAsync(
    'INSERT INTO mission_documents(id,mission_id,site_id,location_id,equipment_id,type,name,source,file_uri,visibility,offline_state,document_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    [id, missionId, source.site_id || null, source.location_id || null, source.equipment_id || null, 'plan_derived_pdf', name, 'generated_from:' + source.id, uri, 'internal', 'available_offline', new Date().toISOString().slice(0, 10)]
  );
  return { id, uri, name };
}

async function reconstruirePdfParOrdre(sourcePdf, indices) {
  const target = await PDFDocument.create();
  const copied = await target.copyPages(sourcePdf, indices);
  copied.forEach((page) => target.addPage(page));
  return target;
}

export async function dupliquerPagePdfMission({ missionId, documentId, pageNumber = 1 } = {}) {
  const db = await getDb();
  const { source, pdf } = await chargerPdfSourceMission(db, missionId, documentId);
  const count = pdf.getPageCount();
  const index = Math.max(0, Math.min(count - 1, Number(pageNumber || 1) - 1));
  const order = [];
  for (let i = 0; i < count; i += 1) {
    order.push(i);
    if (i === index) order.push(i);
  }
  const output = await reconstruirePdfParOrdre(pdf, order);
  return enregistrerPdfDeriveMission(db, missionId, source, output, 'Duplication_page');
}

export async function supprimerPagePdfMission({ missionId, documentId, pageNumber = 1 } = {}) {
  const db = await getDb();
  const { source, pdf } = await chargerPdfSourceMission(db, missionId, documentId);
  const count = pdf.getPageCount();
  if (count <= 1) throw new Error('Impossible de supprimer l’unique page du PDF.');
  const index = Math.max(0, Math.min(count - 1, Number(pageNumber || 1) - 1));
  const order = Array.from({ length: count }, (_, i) => i).filter((i) => i !== index);
  const output = await reconstruirePdfParOrdre(pdf, order);
  return enregistrerPdfDeriveMission(db, missionId, source, output, 'Suppression_page');
}

export async function deplacerPagePdfMission({ missionId, documentId, pageNumber = 1, delta = 1 } = {}) {
  const db = await getDb();
  const { source, pdf } = await chargerPdfSourceMission(db, missionId, documentId);
  const count = pdf.getPageCount();
  const index = Math.max(0, Math.min(count - 1, Number(pageNumber || 1) - 1));
  const targetIndex = Math.max(0, Math.min(count - 1, index + (Number(delta) < 0 ? -1 : 1)));
  if (index === targetIndex) return { id: source.id, uri: source.file_uri, name: source.name, unchanged: true };
  const order = Array.from({ length: count }, (_, i) => i);
  const [moved] = order.splice(index, 1);
  order.splice(targetIndex, 0, moved);
  const output = await reconstruirePdfParOrdre(pdf, order);
  return enregistrerPdfDeriveMission(db, missionId, source, output, delta < 0 ? 'Page_avancee' : 'Page_reculée');
}

export async function tournerPagePdfMission({ missionId, documentId, pageNumber = 1, angle = 90 } = {}) {
  const db = await getDb();
  const { source, pdf } = await chargerPdfSourceMission(db, missionId, documentId);
  const pages = pdf.getPages();
  const page = pages[Math.max(0, Math.min(pages.length - 1, Number(pageNumber) - 1))];
  page.setRotation(degrees((Number(page.getRotation()?.angle || 0) + Number(angle || 90)) % 360));
  return enregistrerPdfDeriveMission(db, missionId, source, pdf, 'Rotation');
}

export async function exporterGeoJsonMission(missionId, { share = true } = {}) {
  const db = await getDb();
  const [geometries, mapLayers] = await Promise.all([
    db.getAllAsync("SELECT * FROM mission_geometries WHERE mission_id=? AND coordinate_space IN ('geo','wgs84','epsg:4326') ORDER BY created_at", [missionId]),
    db.getAllAsync("SELECT * FROM mission_map_layers WHERE mission_id=? AND type='geojson' ORDER BY created_at", [missionId]),
  ]);
  const features = [];
  for (const row of geometries) {
    const geometry = parseJson(row.geojson);
    if (!geometry) continue;
    features.push({
      type: 'Feature',
      id: row.id,
      properties: {
        label: row.label || null,
        site_id: row.site_id || null,
        location_id: row.location_id || null,
        equipment_id: row.equipment_id || null,
        point_id: row.point_id || null,
        subject_id: row.subject_id || null,
        source: 'METRA',
      },
      geometry,
    });
  }
  for (const layer of mapLayers) {
    const data = parseJson(layer.data_json);
    if (data?.type === 'FeatureCollection' && Array.isArray(data.features)) {
      for (const feature of data.features) features.push({ ...feature, properties: { ...(feature.properties || {}), metra_layer: layer.label } });
    }
  }
  const collection = { type: 'FeatureCollection', name: 'METRA Mission', features };
  const uri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + 'METRA_Mission_' + safeName(missionId) + '.geojson';
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(collection, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
  if (share && await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/geo+json', dialogTitle: 'Export SIG METRA' });
  return { uri, featureCount: features.length, data: collection };
}

export async function importerGeoJsonMission({ missionId } = {}) {
  const picked = await DocumentPicker.getDocumentAsync({ type: ['application/geo+json', 'application/json', 'text/plain'], copyToCacheDirectory: true, multiple: false });
  if (picked?.canceled) return null;
  const asset = picked?.assets?.[0];
  if (!asset?.uri) throw new Error('GeoJSON inaccessible.');
  const raw = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
  const data = JSON.parse(raw);
  if (data?.type !== 'FeatureCollection') throw new Error('Le fichier doit contenir un FeatureCollection GeoJSON.');

  const db = await getDb();
  const layerId = createId('mmap');
  await db.runAsync(
    'INSERT INTO mission_map_layers(id,mission_id,label,type,source_uri,data_json,offline_available) VALUES(?,?,?,?,?,?,?)',
    [layerId, missionId, asset.name || 'Couche GeoJSON', 'geojson', asset.uri, JSON.stringify(data), 1]
  );

  let created = 0;
  for (const feature of data.features || []) {
    if (!feature?.geometry) continue;
    const id = createId('mgeo');
    await db.runAsync(
      'INSERT INTO mission_geometries(id,mission_id,geometry_type,geojson,coordinate_space,label,style_json) VALUES(?,?,?,?,?,?,?)',
      [
        id,
        missionId,
        String(feature.geometry.type || 'geometry').toLowerCase(),
        JSON.stringify(feature.geometry),
        'epsg:4326',
        clean(feature.properties?.name || feature.properties?.label),
        JSON.stringify({ sourceLayerId: layerId, sourceProperties: feature.properties || {} }),
      ]
    );
    created += 1;
  }
  return { layerId, featureCount: created, name: asset.name };
}


export async function exporterGeoPackageMission(missionId, { share = true } = {}) {
  const geo = await exporterGeoJsonMission(missionId, { share: false });
  const outputUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + 'METRA_Mission_' + safeName(missionId) + '.gpkg';
  const result = await exporterGeoPackageLocal(geo.data, outputUri);
  const uri = result?.uri || outputUri;
  if (share && await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/geopackage+sqlite3', dialogTitle: 'GeoPackage METRA pour QGIS' });
  }
  return { uri, featureCount: result?.featureCount ?? geo.featureCount };
}
