import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { zip } from 'react-native-zip-archive';
import { getDb } from './db.js';
import { preparerExportMission } from './missionExcelExport.js';
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

export const DEFAULT_MISSION_PACKAGE_OPTIONS = Object.freeze({
  reportPdf: true,
  reportDocx: true,
  individualReports: true,
  excel: true,
  photos: true,
  sourceDocuments: true,
  annotatedPlans: true,
  sourcePlans: true,
  sigGeoJson: true,
  sigGeoPackage: true,
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

  const [photos, documents, relations, equipment, actions, points] = await Promise.all([
    db.getAllAsync('SELECT * FROM mission_photos WHERE mission_id=? ORDER BY created_at', [missionId]),
    db.getAllAsync('SELECT * FROM mission_documents WHERE mission_id=? ORDER BY created_at', [missionId]),
    db.getAllAsync('SELECT * FROM mission_equipment_relations WHERE mission_id=? ORDER BY created_at', [missionId]),
    db.getAllAsync('SELECT e.* FROM mission_equipment e JOIN mission_site_links l ON l.site_id=e.site_id WHERE l.mission_id=? ORDER BY e.type', [missionId]),
    db.getAllAsync('SELECT * FROM mission_actions WHERE mission_id=? ORDER BY created_at', [missionId]),
    db.getAllAsync('SELECT * FROM mission_points WHERE mission_id=? ORDER BY created_at', [missionId]),
  ]);

  if (cfg.photos && photos.length) {
    const folder = await ensure(root + 'Photos/');
    let index = 0;
    for (const photo of photos) {
      index += 1;
      const ext = String(photo.file_uri || '').toLowerCase().endsWith('.png') ? '.png' : '.jpg';
      const name = String(index).padStart(4, '0') + '__' + safe(photo.label || photo.type || photo.id) + ext;
      if (await copyIfFile(photo.file_uri, folder + name)) manifest.files.push('Photos/' + name);
    }
    await FileSystem.writeAsStringAsync(folder + 'index.json', JSON.stringify(photos, null, 2));
    manifest.files.push('Photos/index.json');
  }

  if (cfg.sourceDocuments && documents.length) {
    const folder = await ensure(root + 'Documents_sources/');
    let index = 0;
    for (const doc of documents.filter((d) => !String(d.type || '').startsWith('plan_derived'))) {
      index += 1;
      const extension = String(doc.name || '').includes('.') ? '.' + String(doc.name).split('.').pop() : '';
      const name = String(index).padStart(3, '0') + '__' + safe(doc.name || doc.id) + (extension && !safe(doc.name || '').toLowerCase().endsWith(extension.toLowerCase()) ? extension : '');
      if (await copyIfFile(doc.file_uri, folder + name)) manifest.files.push('Documents_sources/' + name);
    }
  }

  const plans = await listerPlansMission(missionId);
  if ((cfg.sourcePlans || cfg.annotatedPlans) && plans.length) {
    if (cfg.sourcePlans) {
      const folder = await ensure(root + 'Plans/Sources/');
      let index = 0;
      for (const plan of plans.filter((p) => !String(p.type || '').includes('derived'))) {
        index += 1;
        const name = String(index).padStart(3, '0') + '__' + safe(plan.name || plan.id);
        if (await copyIfFile(plan.file_uri, folder + name)) manifest.files.push('Plans/Sources/' + name);
      }
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
