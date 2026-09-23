import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { zip } from 'react-native-zip-archive';
import { getDb } from './db.js';
import { preparerExportMission } from './missionExcelExport.js';
import { preparerExportMissionClient, preparerSyntheseActionsMission } from './missionClientExcelExport.js';
import { preparerAlbumPhotosMission } from './missionPhotoAlbumExport.js';
import { exporterRapportMissionDocx, exporterRapportMissionPdf } from './missionReportExporter.js';
import { exporterGeoJsonMission, exporterGeoPackageMission, exporterPlanPdfAnnote, listerPlansMission } from './missionPlanDb.js';

function safe(value = 'item') {
  return String(value || 'item')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.-]+|[_\.-]+$/g, '')
    .slice(0, 110) || 'item';
}

function native(uri) {
  return String(uri || '').replace(/^file:\/\//, '');
}

async function ensure(path) {
  await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  return path;
}

async function copyIfFile(uri, destination) {
  if (!uri) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) return false;
    await FileSystem.copyAsync({ from: uri, to: destination });
    return true;
  } catch {
    return false;
  }
}

async function copyPath(uri, destination) {
  if (!uri) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return false;
    if (!info.isDirectory) {
      await FileSystem.copyAsync({ from: uri, to: destination });
      return true;
    }
    await FileSystem.makeDirectoryAsync(destination, { intermediates: true });
    const names = await FileSystem.readDirectoryAsync(uri);
    for (const name of names) {
      const sourceChild = uri + (uri.endsWith('/') ? '' : '/') + name;
      const destinationChild = destination + (destination.endsWith('/') ? '' : '/') + name;
      await copyPath(sourceChild, destinationChild);
    }
    return true;
  } catch {
    return false;
  }
}

export const DEFAULT_MISSION_PACKAGE_OPTIONS = Object.freeze({
  reportPdf: true,
  reportDocx: true,
  individualReports: true,
  excel: true,
  excelClient: true,
  actionsSummary: true,
  photos: true,
  photoAlbumAll: false,
  photoAlbumReport: true,
  photoAlbumIssues: true,
  sourceDocuments: true,
  annotatedPlans: true,
  sourcePlans: true,
  sigGeoJson: true,
  sigGeoPackage: true,
  offlineMapLayers: true,
  synopticData: true,
  manifest: true,
});

export async function exporterPackageMission(missionId, options = DEFAULT_MISSION_PACKAGE_OPTIONS) {
  const cfg = { ...DEFAULT_MISSION_PACKAGE_OPTIONS, ...(options || {}) };
  const db = await getDb();
  const mission = await db.getFirstAsync(
    'SELECT m.*,c.name AS client_name FROM missions m LEFT JOIN mission_clients c ON c.id=m.client_id WHERE m.id=?',
    [missionId]
  );
  if (!mission) throw new Error('Mission introuvable.');

  const rootBase = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!rootBase) throw new Error('Stockage temporaire indisponible.');
  const stamp = Date.now();
  const packageName = 'METRA_Mission_' + safe(mission.label || mission.reference || missionId);
  const root = rootBase + packageName + '_' + stamp + '/';
  await ensure(root);

  const manifest = {
    format: 'METRA_MISSION_PACKAGE_V1',
    generatedAt: new Date().toISOString(),
    mission: {
      id: mission.id,
      label: mission.label,
      reference: mission.reference,
      client: mission.client_name,
      family: mission.family,
      type: mission.type,
    },
    options: cfg,
    files: [],
  };

  if (cfg.reportPdf || cfg.reportDocx) {
    const folder = await ensure(root + 'Rapport/');
    if (cfg.reportPdf) {
      const out = await exporterRapportMissionPdf(missionId, { share: false });
      const dest = folder + safe(out.name || 'Rapport_Mission.pdf');
      if (await copyIfFile(out.uri, dest)) manifest.files.push('Rapport/' + safe(out.name || 'Rapport_Mission.pdf'));
    }
    if (cfg.reportDocx) {
      const out = await exporterRapportMissionDocx(missionId, { share: false });
      const dest = folder + safe(out.name || 'Rapport_Mission.docx');
      if (await copyIfFile(out.uri, dest)) manifest.files.push('Rapport/' + safe(out.name || 'Rapport_Mission.docx'));
    }
    if (cfg.individualReports) {
      const sites = await db.getAllAsync(
        'SELECT s.* FROM mission_sites s JOIN mission_site_links l ON l.site_id=s.id WHERE l.mission_id=? ORDER BY s.name',
        [missionId]
      );
      if (sites.length) {
        const siteFolder = await ensure(root + 'Rapport/Sites/');
        for (const site of sites) {
          if (cfg.reportPdf) {
            const out = await exporterRapportMissionPdf(missionId, { share: false, siteId: site.id });
            const name = safe(out.name || ('Rapport_' + site.name + '.pdf'));
            if (await copyIfFile(out.uri, siteFolder + name)) manifest.files.push('Rapport/Sites/' + name);
          }
          if (cfg.reportDocx) {
            const out = await exporterRapportMissionDocx(missionId, { share: false, siteId: site.id });
            const name = safe(out.name || ('Rapport_' + site.name + '.docx'));
            if (await copyIfFile(out.uri, siteFolder + name)) manifest.files.push('Rapport/Sites/' + name);
          }
        }
      }
    }
  }

  if (cfg.excel) {
    const folder = await ensure(root + 'Data/');
    const excel = await preparerExportMission(missionId);
    const name = safe(excel.name || 'Export_METRA.xlsx');
    await FileSystem.writeAsStringAsync(folder + name, excel.base64, { encoding: FileSystem.EncodingType.Base64 });
    manifest.files.push('Data/' + name);
  }

  const [photos, documents, relations, equipment, actions, points, mapLayers] = await Promise.all([
    db.getAllAsync('SELECT * FROM mission_photos WHERE mission_id=? ORDER BY created_at', [missionId]),
    db.getAllAsync('SELECT * FROM mission_documents WHERE mission_id=? ORDER BY created_at', [missionId]),
    db.getAllAsync('SELECT * FROM mission_equipment_relations WHERE mission_id=? ORDER BY created_at', [missionId]),
    db.getAllAsync('SELECT e.* FROM mission_equipment e JOIN mission_site_links l ON l.site_id=e.site_id WHERE l.mission_id=? ORDER BY e.type', [missionId]),
    db.getAllAsync('SELECT * FROM mission_actions WHERE mission_id=? ORDER BY created_at', [missionId]),
    db.getAllAsync('SELECT * FROM mission_points WHERE mission_id=? ORDER BY created_at', [missionId]),
    db.getAllAsync('SELECT * FROM mission_map_layers WHERE mission_id=? ORDER BY created_at', [missionId]),
  ]);

  const packagePhotoPathById = {};

  if (cfg.photos && photos.length) {
    const folder = await ensure(root + 'Photos/');
    const photoIndex = [];
    let index = 0;
    for (const photo of photos) {
      index += 1;
      const lower = String(photo.file_uri || '').toLowerCase();
      const ext = lower.endsWith('.png') ? '.png' : lower.endsWith('.webp') ? '.webp' : '.jpg';
      const name = String(index).padStart(4, '0') + '__' + safe(photo.label || photo.type || photo.id) + ext;
      const copied = await copyIfFile(photo.file_uri, folder + name);
      if (copied) {
        manifest.files.push('Photos/' + name);
        packagePhotoPathById[photo.id] = 'Photos/' + name;
        photoIndex.push({ ...photo, package_file: 'Photos/' + name });
      } else {
        photoIndex.push({ ...photo, package_file: null });
      }
    }
    await FileSystem.writeAsStringAsync(folder + 'index.json', JSON.stringify(photoIndex, null, 2));
    manifest.files.push('Photos/index.json');
  }

  if (cfg.excelClient || cfg.actionsSummary) {
    const folder = await ensure(root + 'Data/');
    if (cfg.excelClient) {
      const out = await preparerExportMissionClient(missionId, { photoPathById: packagePhotoPathById });
      const name = safe(out.name || 'Export_client.xlsx');
      await FileSystem.writeAsStringAsync(folder + name, out.base64, { encoding: FileSystem.EncodingType.Base64 });
      manifest.files.push('Data/' + name);
    }
    if (cfg.actionsSummary) {
      const out = await preparerSyntheseActionsMission(missionId, { photoPathById: packagePhotoPathById });
      const name = safe(out.name || 'Synthese_actions.xlsx');
      await FileSystem.writeAsStringAsync(folder + name, out.base64, { encoding: FileSystem.EncodingType.Base64 });
      manifest.files.push('Data/' + name);
    }
  }

  if (cfg.photoAlbumAll || cfg.photoAlbumReport || cfg.photoAlbumIssues) {
    const albumFolder = await ensure(root + 'Photos/Albums/');
    const albumModes = [
      ['photoAlbumAll', 'all'],
      ['photoAlbumReport', 'report'],
      ['photoAlbumIssues', 'issues'],
    ];
    for (const [optionKey, mode] of albumModes) {
      if (!cfg[optionKey]) continue;
      try {
        const out = await preparerAlbumPhotosMission(missionId, { mode });
        const name = safe(out.name || ('Album_' + mode + '.pdf'));
        await FileSystem.writeAsStringAsync(albumFolder + name, out.base64, { encoding: FileSystem.EncodingType.Base64 });
        manifest.files.push('Photos/Albums/' + name);
      } catch {}
    }
  }

  if (cfg.sourceDocuments && documents.length) {
    const folder = await ensure(root + 'Documents_sources/');
    const documentIndex = [];
    let index = 0;
    for (const doc of documents.filter((d) => !String(d.type || '').startsWith('plan_'))) {
      index += 1;
      const extension = String(doc.name || '').includes('.') ? '.' + String(doc.name).split('.').pop() : '';
      const baseName = safe(doc.name || doc.id);
      const name = String(index).padStart(3, '0') + '__' + baseName + (extension && !baseName.toLowerCase().endsWith(extension.toLowerCase()) ? extension : '');
      const copied = await copyIfFile(doc.file_uri, folder + name);
      if (copied) {
        manifest.files.push('Documents_sources/' + name);
        documentIndex.push({ ...doc, package_file: 'Documents_sources/' + name });
      } else {
        documentIndex.push({ ...doc, package_file: null });
      }
    }
    await FileSystem.writeAsStringAsync(folder + 'index.json', JSON.stringify(documentIndex, null, 2));
    manifest.files.push('Documents_sources/index.json');
  }

  const plans = await listerPlansMission(missionId);
  if ((cfg.sourcePlans || cfg.annotatedPlans) && plans.length) {
    if (cfg.sourcePlans) {
      const folder = await ensure(root + 'Plans/Sources/');
      const planIndex = [];
      let index = 0;
      for (const plan of plans.filter((p) => !String(p.type || '').includes('derived'))) {
        index += 1;
        const name = String(index).padStart(3, '0') + '__' + safe(plan.name || plan.id);
        const copied = await copyIfFile(plan.file_uri, folder + name);
        if (copied) {
          manifest.files.push('Plans/Sources/' + name);
          planIndex.push({ ...plan, package_file: 'Plans/Sources/' + name });
        } else {
          planIndex.push({ ...plan, package_file: null });
        }
      }
      await FileSystem.writeAsStringAsync(folder + 'index.json', JSON.stringify(planIndex, null, 2));
      manifest.files.push('Plans/Sources/index.json');
    }
    if (cfg.annotatedPlans) {
      const folder = await ensure(root + 'Plans/Annotes/');
      let index = 0;
      for (const plan of plans.filter((p) => ['plan_pdf','plan_image','plan_source'].includes(p.type))) {
        try {
          const out = await exporterPlanPdfAnnote({ missionId, documentId: plan.id, share: false });
          index += 1;
          const name = String(index).padStart(3, '0') + '__' + safe(out.name || 'Plan_annote.pdf');
          if (await copyIfFile(out.uri, folder + name)) manifest.files.push('Plans/Annotes/' + name);
        } catch {}
      }
    }
  }

  if (cfg.offlineMapLayers && mapLayers.length) {
    const folder = await ensure(root + 'Map_layers/');
    const layerIndex = [];
    for (const layer of mapLayers) {
      if (!layer.source_uri) {
        layerIndex.push({ ...layer, package_file: null });
        continue;
      }
      const info = await FileSystem.getInfoAsync(layer.source_uri).catch(() => ({ exists: false }));
      if (!info.exists) {
        layerIndex.push({ ...layer, package_file: null });
        continue;
      }
      const packageName = layer.type === 'xyz_tiles'
        ? safe(layer.id + '__' + (layer.label || 'tiles')) + '/'
        : safe(layer.id + '__' + (layer.label || 'layer'));
      const destination = folder + packageName;
      const copied = await copyPath(layer.source_uri, destination);
      if (copied) {
        const relative = 'Map_layers/' + packageName;
        manifest.files.push(relative);
        layerIndex.push({ ...layer, package_file: relative });
      } else {
        layerIndex.push({ ...layer, package_file: null });
      }
    }
    await FileSystem.writeAsStringAsync(folder + 'index.json', JSON.stringify(layerIndex, null, 2));
    manifest.files.push('Map_layers/index.json');
  }

  if (cfg.sigGeoJson || cfg.sigGeoPackage) {
    const folder = await ensure(root + 'Export_SIG/');
    if (cfg.sigGeoJson) {
      try {
        const out = await exporterGeoJsonMission(missionId, { share: false });
        const dest = folder + 'Mission.geojson';
        if (await copyIfFile(out.uri, dest)) manifest.files.push('Export_SIG/Mission.geojson');
      } catch {}
    }
    if (cfg.sigGeoPackage) {
      try {
        const out = await exporterGeoPackageMission(missionId, { share: false });
        const dest = folder + 'Mission.gpkg';
        if (await copyIfFile(out.uri, dest)) manifest.files.push('Export_SIG/Mission.gpkg');
      } catch {}
    }
  }

  if (cfg.synopticData) {
    const folder = await ensure(root + 'Synoptiques/');
    await FileSystem.writeAsStringAsync(
      folder + 'relations_techniques.json',
      JSON.stringify({ equipment, relations }, null, 2),
      { encoding: FileSystem.EncodingType.UTF8 }
    );
    manifest.files.push('Synoptiques/relations_techniques.json');
  }

  if (cfg.manifest) {
    manifest.summary = {
      photos: photos.length,
      documents: documents.length,
      equipment: equipment.length,
      relations: relations.length,
      actions: actions.length,
      points: points.length,
      mapLayers: mapLayers.length,
    };
    await FileSystem.writeAsStringAsync(root + 'manifest.json', JSON.stringify(manifest, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
  }

  const zipUri = rootBase + packageName + '.zip';
  try { await FileSystem.deleteAsync(zipUri, { idempotent: true }); } catch {}
  await zip(native(root), native(zipUri));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(zipUri, { mimeType: 'application/zip', dialogTitle: 'Dossier complet METRA Missions' });
  }
  return { uri: zipUri, name: packageName + '.zip', manifest };
}
