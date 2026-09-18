import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import { getDb } from './db.js';
import { createId } from './database/ids.js';

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
  linkedEntityType = null,
  linkedEntityId = null,
} = {}) {
  const db = await getDb();
  const id = createId('mpann');
  await db.runAsync(
    'INSERT INTO mission_plan_annotations(id,mission_id,document_id,layer_id,page_number,annotation_type,geometry_json,text,symbol_key,style_json,linked_entity_type,linked_entity_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    [
      id, missionId, documentId, clean(layerId), Number(pageNumber) || 1, annotationType || 'point',
      geometry ? JSON.stringify(geometry) : null, clean(text), clean(symbolKey), style ? JSON.stringify(style) : null,
      clean(linkedEntityType), clean(linkedEntityId),
    ]
  );
  return id;
}

export async function supprimerAnnotationPlan(id) {
  const db = await getDb();
  await db.runAsync('DELETE FROM mission_plan_annotations WHERE id=?', [id]);
}

export async function listerAnnotationsPlan(documentId, pageNumber = 1) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT a.*,l.label AS layer_label,l.visible AS layer_visible,l.locked AS layer_locked
     FROM mission_plan_annotations a
     LEFT JOIN mission_plan_layers l ON l.id=a.layer_id
     WHERE a.document_id=? AND a.page_number=?
     ORDER BY COALESCE(l.sort_order,0),a.created_at`,
    [documentId, Number(pageNumber) || 1]
  );
  return rows.map((row) => ({ ...row, geometry: parseJson(row.geometry_json), style: parseJson(row.style_json, {}) }));
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
    if (row.annotation_type === 'point' || row.annotation_type === 'symbol') {
      const p = normalizedToPdf(points[0] || geometry, width, height);
      page.drawCircle({ x: p.x, y: p.y, size: 5, borderColor: color, borderWidth: 2 });
      if (row.text) page.drawText(String(row.text), { x: p.x + 7, y: p.y + 2, size: 8, font, color });
      continue;
    }
    if ((row.annotation_type === 'line' || row.annotation_type === 'distance' || row.annotation_type === 'network') && points.length >= 2) {
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

export async function tournerPagePdfMission({ missionId, documentId, pageNumber = 1, angle = 90 } = {}) {
  const db = await getDb();
  const source = await db.getFirstAsync('SELECT * FROM mission_documents WHERE id=? AND mission_id=?', [documentId, missionId]);
  if (!source?.file_uri) throw new Error('PDF source introuvable.');
  const base64 = await FileSystem.readAsStringAsync(source.file_uri, { encoding: FileSystem.EncodingType.Base64 });
  const pdf = await PDFDocument.load(base64);
  const pages = pdf.getPages();
  const page = pages[Math.max(0, Math.min(pages.length - 1, Number(pageNumber) - 1))];
  page.setRotation(degrees((Number(page.getRotation()?.angle || 0) + Number(angle || 90)) % 360));
  const uri = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + 'Plan_rotation_' + Date.now() + '.pdf';
  await FileSystem.writeAsStringAsync(uri, await pdf.saveAsBase64(), { encoding: FileSystem.EncodingType.Base64 });
  const id = createId('mdoc');
  await db.runAsync(
    'INSERT INTO mission_documents(id,mission_id,site_id,type,name,source,file_uri,visibility,offline_state,document_date) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [id, missionId, source.site_id, 'plan_derived_pdf', 'Rotation_' + (source.name || 'plan.pdf'), 'generated_from:' + source.id, uri, 'internal', 'available_offline', new Date().toISOString().slice(0, 10)]
  );
  return { id, uri };
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
