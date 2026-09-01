import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { zip } from 'react-native-zip-archive';
import { REPORT_COVER, REPORT_LOGO } from './reportBrandAssets.js';

export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const esc = (value = '') => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');
const nativePath = (uri) => String(uri || '').replace(/^file:\/\//, '');
const cleanText = (value = '') => String(value ?? '').replace(/\r/g, '').trim();
const dataUriBase64 = (value) => String(value || '').split(',')[1] || '';
const dateFr = (value) => {
  if (!value) return '';
  const parts = String(value).slice(0, 10).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value);
};

function run(text, { bold = false, size = 20, color = '1A1A18' } = {}) {
  const safe = esc(text);
  if (!safe) return '';
  return `<w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:color w:val="${color}"/></w:rPr><w:t xml:space="preserve">${safe}</w:t></w:r>`;
}

function paragraph(text = '', { bold = false, size = 20, color = '1A1A18', align = 'left', after = 100, before = 0, pageBreakBefore = false } = {}) {
  return `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="${before}" w:after="${after}"/>${pageBreakBefore ? '<w:pageBreakBefore/>' : ''}</w:pPr>${run(text, { bold, size, color })}</w:p>`;
}

function pageBreak() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

function cell(text, { bold = false, width = 2400, shade = null, align = 'left' } = {}) {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : ''}<w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tcMar></w:tcPr>${paragraph(cleanText(text) || '/', { bold, size: 17, align, after: 0 })}</w:tc>`;
}

function table(rows, widths = []) {
  const borders = '<w:tblBorders><w:top w:val="single" w:sz="5" w:color="777777"/><w:left w:val="single" w:sz="5" w:color="777777"/><w:bottom w:val="single" w:sz="5" w:color="777777"/><w:right w:val="single" w:sz="5" w:color="777777"/><w:insideH w:val="single" w:sz="4" w:color="AAAAAA"/><w:insideV w:val="single" w:sz="4" w:color="AAAAAA"/></w:tblBorders>';
  const body = rows.map((row, rowIndex) => `<w:tr>${row.map((value, index) => cell(value, { bold: rowIndex === 0, width: widths[index] || 2600, shade: rowIndex === 0 ? 'F4E5D8' : null, align: index === 1 && row.length === 3 ? 'center' : 'left' })).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/>${borders}</w:tblPr><w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${body}</w:tbl>${paragraph('', { after: 40 })}`;
}

function imageParagraph(relId, widthEmu, heightEmu, docPrId, name, align = 'center') {
  return `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:after="120"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${docPrId}" name="${esc(name)}"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="${esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

async function preparePhoto(photo, index) {
  if (!photo?.uri) return null;
  try {
    const result = await ImageManipulator.manipulateAsync(photo.uri, [{ resize: { width: 1100 } }], { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: true });
    if (!result.base64) return null;
    return { base64: result.base64, width: result.width || 1100, height: result.height || 750, filename: `photo_${index + 1}.jpeg`, label: photo.label || `Photo ${index + 1}` };
  } catch (error) {
    console.warn('Photo Word non intégrée', error);
    return null;
  }
}

function reportRows(group, includeEmpty) {
  const rows = (group?.rows || []).filter((row) => includeEmpty || cleanText(row?.avis || row?.comment));
  return rows.map((row) => [row.label || '', row.avis || '', row.comment || '']);
}

function siteDocumentXml(data, config, imageByPhotoId) {
  const out = [];
  const site = data.visite?.nom_site || 'Site';
  const local = data.visite?.nom_local || data.visite?.type_local || 'Installation technique';
  out.push(paragraph(site, { bold: true, size: 34, color: 'F26426', align: 'center', before: 100, after: 80 }));
  out.push(paragraph(local, { bold: true, size: 25, align: 'center', after: 180 }));

  for (const section of data.sections || []) {
    const groups = (section.groups || []).map((group) => ({ group, rows: reportRows(group, config.afficherLignesVides) })).filter((item) => item.rows.length);
    if (!groups.length) continue;
    if (section.title) out.push(paragraph(section.title, { bold: true, size: 25, color: 'F26426', align: 'center', before: 130, after: 100, pageBreakBefore: section.breakBefore === true }));
    groups.forEach(({ group, rows }) => {
      out.push(paragraph(group.title || '', { bold: true, size: 21, align: 'center', before: 80, after: 70 }));
      out.push(table([['Intitulé', 'Avis', 'Commentaire'], ...rows], [3300, 900, 4700]));
    });
  }

  if (config.remarques !== false && (data.remarques || []).length) {
    out.push(paragraph('REMARQUES PARTICULIÈRES', { bold: true, size: 25, color: 'F26426', align: 'center', pageBreakBefore: true, after: 100 }));
    out.push(table([['Poste', 'Prestation', 'Date'], ...(data.remarques || []).map((item) => [item.poste || 'Remarque', item.prestation || '', dateFr(item.cree_le)])], [2500, 5000, 1400]));
  }

  if (config.materiel !== false && (data.materiel || []).length) {
    out.push(paragraph('LISTING MATÉRIEL', { bold: true, size: 25, color: 'F26426', align: 'center', pageBreakBefore: true, after: 100 }));
    out.push(table([['Catégorie', 'Nb', 'Désignation', 'Marque', 'Modèle', 'Année'], ...(data.materiel || []).map((item) => [item.categorie || '', item.nombre || 1, item.designation || '', item.marque || '', item.modele || '', item.annee || ''])], [1500, 650, 2500, 1500, 1800, 800]));
  }

  const note = cleanText(data.note);
  if (note) {
    out.push(paragraph('NOTE DE VISITE', { bold: true, size: 25, color: 'F26426', align: 'center', pageBreakBefore: true, after: 100 }));
    note.split(/\n+/).filter(Boolean).forEach((line) => out.push(paragraph(line, { size: 19, after: 80 })));
  }

  const photos = [...imageByPhotoId.values()].filter((image) => image.visiteId === data.visite.id);
  if (config.photos !== false && photos.length) {
    out.push(paragraph('PHOTOGRAPHIES', { bold: true, size: 25, color: 'F26426', align: 'center', pageBreakBefore: true, after: 120 }));
    photos.forEach((image) => {
      out.push(imageParagraph(image.relId, image.widthEmu, image.heightEmu, image.docPrId, image.filename));
      out.push(paragraph(image.label, { bold: true, size: 17, align: 'center', after: 150 }));
    });
  }
  return out.join('');
}

function contentTypes() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;
}

async function createDocxPackage({ datas, config, photosConfig = [], title = null }) {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const root = `${FileSystem.cacheDirectory}metra-docx-${stamp}/`;
  const word = `${root}word/`, rels = `${root}_rels/`, wordRels = `${word}_rels/`, media = `${word}media/`, props = `${root}docProps/`;
  await FileSystem.makeDirectoryAsync(wordRels, { intermediates: true });
  await FileSystem.makeDirectoryAsync(media, { intermediates: true });
  await FileSystem.makeDirectoryAsync(rels, { intermediates: true });
  await FileSystem.makeDirectoryAsync(props, { intermediates: true });

  const relationships = [{ id: 'rIdStyles', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles', target: 'styles.xml' }];
  const images = [];
  let nextRel = 2;
  let nextDocPr = 1;

  const addBase64Image = async (base64, filename, widthEmu, heightEmu, label, visiteId = null) => {
    if (!base64) return null;
    const relId = `rId${nextRel++}`;
    const docPrId = nextDocPr++;
    await FileSystem.writeAsStringAsync(`${media}${filename}`, base64, { encoding: FileSystem.EncodingType.Base64 });
    relationships.push({ id: relId, type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', target: `media/${filename}` });
    const image = { relId, docPrId, filename, widthEmu, heightEmu, label, visiteId };
    images.push(image);
    return image;
  };

  const logo = await addBase64Image(dataUriBase64(REPORT_LOGO), 'brand_logo.jpeg', 2500000, 650000, 'Energie & Service');
  const cover = await addBase64Image(dataUriBase64(REPORT_COVER), 'cover.jpeg', 5200000, 2850000, 'Couverture');

  const enabledPhotos = (photosConfig || []).filter((photo) => photo.include !== false);
  for (let index = 0; index < enabledPhotos.length; index += 1) {
    const photo = enabledPhotos[index];
    const prepared = await preparePhoto(photo, index);
    if (!prepared) continue;
    const maxWidth = 5200000;
    const ratio = prepared.height / prepared.width;
    const height = Math.min(3600000, Math.max(1200000, Math.round(maxWidth * ratio)));
    await addBase64Image(prepared.base64, prepared.filename, maxWidth, height, prepared.label, photo.visiteId);
  }

  const imageByPhotoId = new Map();
  const photoImages = images.filter((image) => image.visiteId);
  photoImages.forEach((image, index) => imageByPhotoId.set(`${image.visiteId}||${index}`, image));
  // L'ordre des images préparées est celui de photosConfig : on recompose un map par visite.
  const perVisit = new Map();
  photoImages.forEach((image) => {
    if (!perVisit.has(image.visiteId)) perVisit.set(image.visiteId, []);
    perVisit.get(image.visiteId).push(image);
  });
  const imageMap = new Map();
  for (const [visiteId, visitImages] of perVisit.entries()) visitImages.forEach((image, index) => imageMap.set(`${visiteId}||${index}`, image));
  const imagesForSite = new Map();
  for (const image of photoImages) imagesForSite.set(`${image.relId}`, image);

  const client = datas?.[0]?.visite?.nom_client || 'Rapport';
  const documentTitle = title || config.objet || 'Compte rendu de visite technique';
  const body = [];
  if (logo) body.push(imageParagraph(logo.relId, logo.widthEmu, logo.heightEmu, logo.docPrId, logo.filename, 'left'));
  body.push(paragraph(client, { bold: true, size: 38, color: 'F26426', align: 'center', before: 220, after: 140 }));
  body.push(paragraph(documentTitle, { bold: true, size: 28, align: 'center', after: 90 }));
  body.push(paragraph(`Date du rapport : ${dateFr(config.dateRapport || new Date().toISOString().slice(0, 10))}`, { size: 18, align: 'center', after: 50 }));
  if (config.chrono) body.push(paragraph(`Référence : ${config.chrono}`, { size: 18, align: 'center', after: 100 }));
  if (cover) body.push(imageParagraph(cover.relId, cover.widthEmu, cover.heightEmu, cover.docPrId, cover.filename));
  body.push(pageBreak());

  for (let index = 0; index < (datas || []).length; index += 1) {
    const data = datas[index];
    const siteImages = new Map();
    for (const image of photoImages.filter((item) => item.visiteId === data.visite.id)) siteImages.set(image.relId, image);
    body.push(siteDocumentXml(data, config, siteImages));
    if (index < datas.length - 1) body.push(pageBreak());
  }

  body.push('<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body.join('')}</w:body></w:document>`;
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.map((rel) => `<Relationship Id="${rel.id}" Type="${rel.type}" Target="${rel.target}"/>`).join('')}</Relationships>`;
  const packageRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(documentTitle)}</dc:title><dc:creator>METRA</dc:creator><cp:lastModifiedBy>METRA</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`;
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>METRA</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop></Properties>`;

  await Promise.all([
    FileSystem.writeAsStringAsync(`${root}[Content_Types].xml`, contentTypes()),
    FileSystem.writeAsStringAsync(`${rels}.rels`, packageRels),
    FileSystem.writeAsStringAsync(`${word}document.xml`, documentXml),
    FileSystem.writeAsStringAsync(`${word}styles.xml`, stylesXml()),
    FileSystem.writeAsStringAsync(`${wordRels}document.xml.rels`, documentRels),
    FileSystem.writeAsStringAsync(`${props}core.xml`, core),
    FileSystem.writeAsStringAsync(`${props}app.xml`, app),
  ]);

  const zipUri = `${FileSystem.cacheDirectory}METRA_${stamp}.docx`;
  await zip(nativePath(root), nativePath(zipUri));
  return { root, zipUri };
}

export async function exporterRapportDocx({ datas, config = {}, photosConfig = [], dossier, nom, title = null }) {
  const SAF = FileSystem.StorageAccessFramework;
  if (!dossier || !SAF?.createFileAsync) throw new Error("Le dossier d'export Word est indisponible.");
  const pack = await createDocxPackage({ datas, config, photosConfig, title });
  try {
    const base64 = await FileSystem.readAsStringAsync(pack.zipUri, { encoding: FileSystem.EncodingType.Base64 });
    const destination = await SAF.createFileAsync(dossier, nom, MIME_DOCX);
    await FileSystem.writeAsStringAsync(destination, base64, { encoding: FileSystem.EncodingType.Base64 });
    return destination;
  } finally {
    await FileSystem.deleteAsync(pack.root, { idempotent: true }).catch(() => {});
    await FileSystem.deleteAsync(pack.zipUri, { idempotent: true }).catch(() => {});
  }
}
