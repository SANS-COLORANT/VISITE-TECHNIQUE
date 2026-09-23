import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getDb } from './db.js';

const PDF_MIME = 'application/pdf';

function safe(value = 'Mission') {
  return String(value || 'Mission')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.-]+|[_\.-]+$/g, '')
    .slice(0, 100) || 'Mission';
}

function clean(value) {
  const out = String(value ?? '').trim();
  return out || '';
}

function wrapText(value, maxChars = 82) {
  const words = clean(value).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if ((current + ' ' + word).length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

async function imageBytes(uri) {
  if (!uri) return null;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) return null;
    return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  } catch {
    return null;
  }
}

async function embedPhoto(pdf, row) {
  const uri = row.thumbnail_uri || row.preview_uri || row.file_uri;
  const base64 = await imageBytes(uri);
  if (!base64) return null;
  const lower = String(uri || '').toLowerCase();
  try {
    if (lower.endsWith('.png')) return pdf.embedPng(base64);
    return pdf.embedJpg(base64);
  } catch {
    try { return await pdf.embedJpg(base64); } catch {}
    try { return await pdf.embedPng(base64); } catch {}
    return null;
  }
}

async function loadAlbumData(missionId, mode = 'all') {
  const db = await getDb();
  const mission = await db.getFirstAsync(
    `SELECT m.*,c.name AS client_name
     FROM missions m LEFT JOIN mission_clients c ON c.id=m.client_id
     WHERE m.id=?`,
    [missionId]
  );
  if (!mission) throw new Error('Mission introuvable.');

  const rows = await db.getAllAsync(
    `SELECT p.*,s.name AS site_name,l.label AS location_label,
      e.type AS equipment_type,e.brand AS equipment_brand,e.model AS equipment_model,
      pt.label AS point_label,pt.status AS point_status,pt.type AS point_type,
      a.label AS action_label,a.status AS action_status
     FROM mission_photos p
     LEFT JOIN mission_sites s ON s.id=p.site_id
     LEFT JOIN mission_locations l ON l.id=p.location_id
     LEFT JOIN mission_equipment e ON e.id=p.equipment_id
     LEFT JOIN mission_points pt ON pt.id=p.point_id
     LEFT JOIN mission_actions a ON a.id=p.action_id
     WHERE p.mission_id=?
     ORDER BY s.name,COALESCE(p.taken_at,p.created_at),p.created_at`,
    [missionId]
  );

  let photos = rows;
  if (mode === 'report') {
    photos = rows.filter((row) => ['report','client'].includes(String(row.visibility || '')));
  } else if (mode === 'issues') {
    photos = rows.filter((row) =>
      Boolean(row.point_id || row.action_id)
      || ['before','after'].includes(String(row.phase_role || ''))
      || ['reserve','control','action'].includes(String(row.point_type || ''))
    );
  }

  return { mission, photos };
}

function contextText(row) {
  return [
    row.site_name,
    row.location_label,
    [row.equipment_type,row.equipment_brand,row.equipment_model].filter(Boolean).join(' · '),
  ].filter(Boolean).join(' › ');
}

function linkedText(row) {
  return [
    row.point_label ? 'Point : ' + row.point_label : null,
    row.action_label ? 'Action : ' + row.action_label : null,
    row.phase_role ? 'Rôle : ' + row.phase_role : null,
  ].filter(Boolean).join(' · ');
}

export async function preparerAlbumPhotosMission(missionId, { mode = 'all' } = {}) {
  const { mission, photos } = await loadAlbumData(missionId, mode);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;
  const usableWidth = pageWidth - margin * 2;
  const slotHeight = 355;

  if (!photos.length) {
    const page = pdf.addPage([pageWidth,pageHeight]);
    page.drawText('Album photos Mission', { x: margin, y: pageHeight - 70, size: 18, font: bold, color: rgb(0.12,0.22,0.17) });
    page.drawText(mission.label || mission.reference || mission.id, { x: margin, y: pageHeight - 96, size: 11, font: regular, color: rgb(0.25,0.32,0.29) });
    page.drawText('Aucune photo dans cette sélection.', { x: margin, y: pageHeight - 140, size: 11, font: regular, color: rgb(0.35,0.40,0.38) });
  }

  for (let index = 0; index < photos.length; index += 1) {
    const slot = index % 2;
    let page;
    if (slot === 0) {
      page = pdf.addPage([pageWidth,pageHeight]);
      page.drawText('Album photos · ' + (mission.label || mission.reference || 'Mission'), {
        x: margin, y: pageHeight - 32, size: 10, font: bold, color: rgb(0.12,0.30,0.21),
      });
      page.drawText(
        mode === 'report' ? 'Sélection rapport/client' : mode === 'issues' ? 'Photos liées aux points / actions' : 'Toutes les photos',
        { x: margin, y: pageHeight - 47, size: 7.5, font: regular, color: rgb(0.40,0.45,0.43) }
      );
    } else {
      page = pdf.getPages()[pdf.getPageCount() - 1];
    }

    const row = photos[index];
    const top = pageHeight - 65 - slot * slotHeight;
    const image = await embedPhoto(pdf, row);

    page.drawText(String(index + 1).padStart(3,'0') + ' · ' + (row.label || row.type || 'Photo'), {
      x: margin, y: top, size: 10, font: bold, color: rgb(0.12,0.22,0.17),
    });

    let metaY = top - 15;
    const contextLines = wrapText(contextText(row), 88);
    for (const line of contextLines) {
      page.drawText(line, { x: margin, y: metaY, size: 7.2, font: regular, color: rgb(0.35,0.40,0.38) });
      metaY -= 10;
    }
    const linkedLines = wrapText(linkedText(row), 88);
    for (const line of linkedLines) {
      page.drawText(line, { x: margin, y: metaY, size: 7.2, font: regular, color: rgb(0.18,0.38,0.27) });
      metaY -= 10;
    }

    const imageTop = metaY - 5;
    const imageBottom = top - 300;
    const maxHeight = Math.max(120, imageTop - imageBottom);
    if (image) {
      const dims = image.scale(1);
      const ratio = Math.min(usableWidth / dims.width, maxHeight / dims.height);
      const w = dims.width * ratio;
      const h = dims.height * ratio;
      page.drawImage(image, {
        x: margin + (usableWidth - w) / 2,
        y: imageTop - h,
        width: w,
        height: h,
      });
    } else {
      page.drawRectangle({
        x: margin, y: imageBottom, width: usableWidth, height: maxHeight,
        borderWidth: 0.8, borderColor: rgb(0.75,0.78,0.77),
      });
      page.drawText('Image indisponible dans le stockage local.', {
        x: margin + 12, y: imageBottom + maxHeight / 2, size: 8, font: regular, color: rgb(0.45,0.48,0.47),
      });
    }

    page.drawText(clean(row.taken_at || row.created_at), {
      x: margin, y: top - 319, size: 6.7, font: regular, color: rgb(0.48,0.50,0.49),
    });
  }

  const base64 = await pdf.saveAsBase64({ dataUri: false });
  const suffix = mode === 'report' ? 'Selection_rapport' : mode === 'issues' ? 'Points_actions' : 'Toutes';
  return {
    base64,
    name: 'Album_photos_' + safe(mission.label || mission.reference || mission.id) + '_' + suffix + '.pdf',
    count: photos.length,
    mission,
  };
}

export async function exporterAlbumPhotosMission(missionId, { mode = 'all', share = true } = {}) {
  const out = await preparerAlbumPhotosMission(missionId, { mode });
  const root = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!root) throw new Error('Stockage temporaire indisponible.');
  const uri = root + out.name;
  await FileSystem.writeAsStringAsync(uri, out.base64, { encoding: FileSystem.EncodingType.Base64 });
  if (share && await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: PDF_MIME, dialogTitle: 'Exporter l’album photos de la Mission' });
  }
  return { ...out, uri };
}
