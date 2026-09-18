import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as ImageManipulator from 'expo-image-manipulator';
import { zip } from 'react-native-zip-archive';
import { chargerRapportMission, initialiserRapportMission } from './missionReportDb.js';
import { getDb } from './db.js';
import { createId } from './database/ids.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';

function esc(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fileSafe(value = 'Mission') {
  return String(value || 'Mission')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'Mission';
}

function blocks(section) {
  const out = [];
  if (section.content_text) out.push({ type: 'paragraph', text: section.content_text });
  if (section.content_json) {
    try {
      const parsed = JSON.parse(section.content_json);
      if (Array.isArray(parsed)) out.push(...parsed);
    } catch {}
  }
  return out;
}

async function photoDataUri(uri) {
  if (!uri) return null;
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1100 } }],
      { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return result.base64 ? 'data:image/jpeg;base64,' + result.base64 : null;
  } catch {
    return null;
  }
}

async function buildHtml(report) {
  const visible = (report.sections || []).filter((s) => !Number(s.hidden));
  const photoItems = [];
  for (const photo of report.data?.photos || []) {
    const uri = await photoDataUri(photo.preview_uri || photo.file_uri);
    if (uri) photoItems.push({ ...photo, dataUri: uri });
  }

  const body = visible.map((section) => {
    const content = blocks(section).map((block) => {
      if (block.type === 'table') {
        const head = '<tr>' + (block.headers || []).map((v) => '<th>' + esc(v) + '</th>').join('') + '</tr>';
        const rows = (block.rows || []).map((row) => '<tr>' + row.map((v) => '<td>' + esc(v) + '</td>').join('') + '</tr>').join('');
        return '<table><thead>' + head + '</thead><tbody>' + rows + '</tbody></table>';
      }
      return '<p>' + esc(block.text || '').replace(/\n/g, '<br/>') + '</p>';
    }).join('');
    return '<section><h2>' + esc(section.title || 'Section') + '</h2>' + content + '</section>';
  }).join('');

  const photos = photoItems.length
    ? '<section class="pageBreak"><h2>Photographies</h2><div class="photos">' + photoItems.map((p) => (
      '<figure><img src="' + p.dataUri + '"/><figcaption>' + esc(p.label || p.type || 'Photo') + '</figcaption></figure>'
    )).join('') + '</div></section>'
    : '';

  const mission = report.data?.mission || {};
  return '<!doctype html><html><head><meta charset="utf-8"/><style>' +
    '@page{size:A4;margin:16mm 14mm 16mm 14mm}body{font-family:Arial,sans-serif;color:#19221d;font-size:10pt;line-height:1.4}' +
    'h1{font-size:23pt;color:#245f45;margin:0 0 6mm}h2{font-size:14pt;color:#2f7d58;margin:7mm 0 3mm;border-bottom:1px solid #cfe4d7;padding-bottom:2mm}' +
    '.meta{color:#627168;margin-bottom:9mm}.badge{display:inline-block;padding:2mm 3mm;border-radius:5mm;background:#e8f4ec;color:#245f45;font-weight:700}' +
    'table{width:100%;border-collapse:collapse;margin:3mm 0 6mm;page-break-inside:auto}th,td{border:1px solid #d7dfda;padding:2.2mm;vertical-align:top}th{background:#eef6f1;color:#245f45;text-align:left}' +
    'tr{page-break-inside:avoid}.pageBreak{page-break-before:always}.photos{display:grid;grid-template-columns:1fr 1fr;gap:5mm}.photos figure{margin:0;page-break-inside:avoid}.photos img{width:100%;max-height:95mm;object-fit:contain}.photos figcaption{text-align:center;font-size:8.5pt;margin-top:1.5mm;color:#627168}' +
    '</style></head><body>' +
    '<h1>' + esc(report.profile?.label || mission.label || 'Rapport Mission') + '</h1>' +
    '<div class="meta"><span class="badge">METRA Missions</span> ' + esc(mission.client_name || '') + ' · ' + esc(mission.reference || '') + '</div>' +
    body + photos + '</body></html>';
}

function xmlEsc(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wp(text, { bold = false, size = 20, color = '1A221D', after = 100, pageBreak = false } = {}) {
  return '<w:p><w:pPr><w:spacing w:after="' + after + '"/>' + (pageBreak ? '<w:pageBreakBefore/>' : '') + '</w:pPr><w:r><w:rPr>' +
    (bold ? '<w:b/>' : '') + '<w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/><w:color w:val="' + color + '"/></w:rPr><w:t xml:space="preserve">' +
    xmlEsc(text) + '</w:t></w:r></w:p>';
}

function wcell(text, bold = false) {
  return '<w:tc><w:tcPr><w:tcMar><w:top w:w="70" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar></w:tcPr>' +
    wp(text, { bold, size: 17, after: 0 }) + '</w:tc>';
}

function wtable(headers = [], rows = []) {
  const border = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="B9C8BF"/><w:left w:val="single" w:sz="4" w:color="B9C8BF"/><w:bottom w:val="single" w:sz="4" w:color="B9C8BF"/><w:right w:val="single" w:sz="4" w:color="B9C8BF"/><w:insideH w:val="single" w:sz="4" w:color="D9E2DC"/><w:insideV w:val="single" w:sz="4" w:color="D9E2DC"/></w:tblBorders>';
  const header = '<w:tr>' + headers.map((v) => wcell(v, true)).join('') + '</w:tr>';
  const body = rows.map((row) => '<w:tr>' + row.map((v) => wcell(v, false)).join('') + '</w:tr>').join('');
  return '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' + border + '</w:tblPr>' + header + body + '</w:tbl>' + wp('', { after: 80 });
}

function packageContentTypes() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
}

function stylesXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';
}

async function buildDocx(report, outputUri) {
  const stamp = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const root = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + 'mission-docx-' + stamp + '/';
  const word = root + 'word/';
  const rels = root + '_rels/';
  const wordRels = word + '_rels/';
  const props = root + 'docProps/';
  await FileSystem.makeDirectoryAsync(wordRels, { intermediates: true });
  await FileSystem.makeDirectoryAsync(rels, { intermediates: true });
  await FileSystem.makeDirectoryAsync(props, { intermediates: true });

  const mission = report.data?.mission || {};
  const body = [];
  body.push(wp(report.profile?.label || mission.label || 'Rapport Mission', { bold: true, size: 38, color: '2F7D58', after: 150 }));
  body.push(wp((mission.client_name || '') + (mission.reference ? ' · ' + mission.reference : ''), { size: 18, color: '607168', after: 220 }));

  for (const section of (report.sections || []).filter((s) => !Number(s.hidden))) {
    body.push(wp(section.title || 'Section', { bold: true, size: 27, color: '2F7D58', after: 100 }));
    for (const block of blocks(section)) {
      if (block.type === 'table') body.push(wtable(block.headers || [], block.rows || []));
      else body.push(wp(block.text || '', { size: 19, after: 90 }));
    }
  }

  if ((report.data?.photos || []).length) {
    body.push(wp('Photographies', { bold: true, size: 27, color: '2F7D58', pageBreak: true }));
    body.push(wp('Les photographies originales et leurs références sont conservées dans METRA et dans l’export Excel complet.', { size: 18, color: '607168' }));
    body.push(wtable(['Photo', 'Type', 'Date', 'Référence fichier'], (report.data.photos || []).map((p, i) => [
      p.label || 'Photo ' + (i + 1), p.type || '', p.taken_at || '', p.file_uri || ''
    ])));
  }

  body.push('<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850"/></w:sectPr>');
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body.join('') + '</w:body></w:document>';
  const packageRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
  const documentRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + xmlEsc(report.profile?.label || 'Rapport Mission') + '</dc:title><dc:creator>METRA</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString() + '</dcterms:created></cp:coreProperties>';
  const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>METRA</Application></Properties>';

  await Promise.all([
    FileSystem.writeAsStringAsync(root + '[Content_Types].xml', packageContentTypes()),
    FileSystem.writeAsStringAsync(rels + '.rels', packageRels),
    FileSystem.writeAsStringAsync(word + 'document.xml', documentXml),
    FileSystem.writeAsStringAsync(word + 'styles.xml', stylesXml()),
    FileSystem.writeAsStringAsync(wordRels + 'document.xml.rels', documentRels),
    FileSystem.writeAsStringAsync(props + 'core.xml', core),
    FileSystem.writeAsStringAsync(props + 'app.xml', app),
  ]);

  const zipped = await zip(String(root).replace(/^file:\/\//, ''), String(outputUri).replace(/^file:\/\//, ''));
  await FileSystem.deleteAsync(root, { idempotent: true }).catch(() => {});
  return zipped || outputUri;
}

async function recordOutput(missionId, profileId, format, fileUri) {
  const db = await getDb();
  const id = createId('mreport');
  await db.runAsync(
    'INSERT INTO mission_report_outputs(id,mission_id,profile_id,scope_type,format,file_uri,status,generated_at) VALUES(?,?,?,?,?,?,?,?)',
    [id, missionId, profileId, 'mission', format, fileUri, 'generated', new Date().toISOString()]
  );
  return id;
}

async function ensureReport(missionId) {
  const existing = await chargerRapportMission(missionId);
  if (existing?.sections?.length) return existing;
  return initialiserRapportMission(missionId);
}

export async function exporterRapportMissionPdf(missionId) {
  const report = await ensureReport(missionId);
  const html = await buildHtml(report);
  const generated = await Print.printToFileAsync({ html, base64: false });
  const root = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  const name = 'Rapport_Mission_' + fileSafe(report.data?.mission?.label || missionId) + '.pdf';
  const uri = root + name;
  if (generated.uri !== uri) await FileSystem.copyAsync({ from: generated.uri, to: uri });
  await recordOutput(missionId, report.profile?.id, 'pdf', uri);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: PDF_MIME, dialogTitle: 'Rapport METRA Missions' });
  return { uri, name };
}

export async function exporterRapportMissionDocx(missionId) {
  const report = await ensureReport(missionId);
  const root = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  const name = 'Rapport_Mission_' + fileSafe(report.data?.mission?.label || missionId) + '.docx';
  const uri = root + name;
  await buildDocx(report, uri);
  await recordOutput(missionId, report.profile?.id, 'docx', uri);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: DOCX_MIME, dialogTitle: 'Rapport Word METRA Missions' });
  return { uri, name };
}
