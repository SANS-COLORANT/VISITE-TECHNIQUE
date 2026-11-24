import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import { NativeModules } from 'react-native';
import { beginReportPhotoExport, endReportPhotoExport, reportPhotoCacheStats } from './reportPhotoCache.js';
import * as Print from 'expo-print';
import * as ImageManipulator from 'expo-image-manipulator';
import { Asset } from 'expo-asset';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { construireHtmlRapport } from './reportBuilder.js';
import { planifierLotsPdf, extraireEnteteRapport, composerHtmlLot, choisirBudgetPdf, pagesPhotosRapport } from './reportPdfFragments.js';
import { REPORT_COVER, REPORT_LOGO, REPORT_OPQIBI } from './reportBrandAssets.js';
import { dossierRapportsClientMetra, dossierRapportsSiteMetra, dossierRapportsLocalMetra, creerFichierSaf, creerFichierSafDepuisFichier } from './metraStorage.js';

const MIME_PDF = 'application/pdf';
const MIME_WORD = 'application/msword';

const REPORT_ASSETS = Object.freeze({
  cover: require('./assets/report/cover-building.png'),
  logo: require('./assets/report/brand-logo.png'),
  cert: require('./assets/report/Image21.png'),
  pageMark: require('./assets/report/spiral-multicolor.png'),
  businessSpirals: [
    require('./assets/report/spiral-red-orange.jpg'),
    require('./assets/report/spiral-yellow-green.jpg'),
    require('./assets/report/spiral-green-red.jpg'),
    require('./assets/report/spiral-multicolor-alt.jpg'),
  ],
});

function propre(v = 'Rapport') {
  return String(v || 'Rapport')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'Rapport';
}

function dateFr(v) {
  if (!v) return '';
  const m = String(v).slice(0, 10).split('-');
  return m.length === 3 ? `${m[2]}/${m[1]}/${m[0]}` : String(v);
}

function dataUriBase64(dataUri) { return String(dataUri || '').split(',')[1] || ''; }
function sectionKey(visiteId, panelId) { return `${visiteId}||${panelId}`; }

function titreMarque(titre, taille) {
  const clean = String(titre || '');
  if (taille === 'small') return `[[METRA_TITLE_SMALL]]${clean}`;
  if (taille === 'large') return `[[METRA_TITLE_LARGE]]${clean}`;
  return clean;
}

function preparerDatasMiseEnPage(datas, layout = {}) {
  return (datas || []).map((data) => {
    const sections = (data.sections || [])
      .map((section, index) => {
        const ov = layout.sections?.[sectionKey(data.visite.id, section.panelId)] || {};
        const ordre = Number.isFinite(Number(ov.ordre)) ? Number(ov.ordre) : index;
        if (ov.visible === false) return null;
        const titre = ov.title ?? section.title;
        return {
          ...section,
          title: titreMarque(titre, ov.titleSize || 'normal'),
          banner: section.banner || Boolean(ov.title),
          breakBefore: ov.breakBefore ?? section.breakBefore,
          __ordreRapport: ordre,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.__ordreRapport - b.__ordreRapport)
      .map(({ __ordreRapport, ...section }) => section);
    return { ...data, sections };
  });
}

async function imageDataUri(uri, width = 1400, compress = 0.78) {
  if (!uri) return null;
  try {
    const r = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width } }],
      { compress, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return r.base64 ? `data:image/jpeg;base64,${r.base64}` : null;
  } catch {
    return null;
  }
}

function grouperCartes(cartes) { return pagesPhotosRapport(cartes); }

function classesCartePhoto(photo) {
  const size = ['small', 'medium', 'large', 'full'].includes(photo?.size) ? photo.size : 'medium';
  const caption = ['small', 'normal', 'large'].includes(photo?.captionSize) ? photo.captionSize : 'normal';
  return `photoCard photoSize-${size} captionSize-${caption}`;
}

function personnaliserPhotosArticle(article, data, photosConfig) {
  const photoSections = [...article.matchAll(/<section class="photoPage pageBreakBefore">[\s\S]*?<\/section>/g)].map((m) => ({ texte: m[0], index: m.index }));
  if (!photoSections.length) return article;

  const cards = [];
  for (const section of photoSections) {
    const found = [...section.texte.matchAll(/<div class="photoCard"[^>]*>[\s\S]*?<div class="photoCaption">[\s\S]*?<\/div><\/div>/g)];
    found.forEach((m) => cards.push(m[0]));
  }
  if (!cards.length) return article;

  const photos = (photosConfig || [])
    .filter((p) => p.visiteId === data.visite.id && p.include && p.exportAllowed !== false)
    .sort((a, b) => a.ordre - b.ordre);
  const byId = new Map(photos.map((p) => [String(p.id), p]));
  const cartes = cards.map((card) => {
    const id = /data-photo-id="([^"]+)"/.exec(card)?.[1];
    const photo = byId.get(id);
    if (!id || !photo) throw new Error('Photo du document sans correspondance d’identité : ' + String(id || '?'));
    return { photo, html: card.replace('class="photoCard"', `class="${classesCartePhoto(photo)}"`) };
  });
  const pages = grouperCartes(cartes);
  const rebuilt = pages.map((page) => `<section class="photoPage pageBreakBefore"><div class="sectionBanner">PHOTOGRAPHIES</div><div class="photoGrid">${page.map((x) => x.html).join('')}</div></section>`).join('');

  const firstIndex = photoSections[0].index;
  let sansPhotos = article;
  for (let i = photoSections.length - 1; i >= 0; i -= 1) {
    const s = photoSections[i];
    sansPhotos = sansPhotos.slice(0, s.index) + sansPhotos.slice(s.index + s.texte.length);
  }
  return sansPhotos.slice(0, firstIndex) + rebuilt + sansPhotos.slice(firstIndex);
}

function personnaliserPhotosHtml(html, datas, photosConfig) {
  let siteIndex = 0;
  return html.replace(/<article class="siteReport">[\s\S]*?<\/article>/g, (article) => {
    const data = datas[siteIndex++];
    return data ? personnaliserPhotosArticle(article, data, photosConfig) : article;
  });
}

function cssEditeur(layout = {}) {
  const scale = layout.textScale || 'normal';
  const body = scale === 'compact' ? 8.4 : scale === 'large' ? 9.9 : 9.1;
  const table = scale === 'compact' ? 7.5 : scale === 'large' ? 8.9 : 8.2;
  const group = scale === 'compact' ? 10.4 : scale === 'large' ? 12.5 : 11.5;
  return `
    body{font-size:${body}pt!important}
    table{font-size:${table}pt!important}
    .groupBlock h3{font-size:${group}pt!important}
    .photoGrid{display:grid!important;grid-template-columns:repeat(6,1fr)!important;gap:5mm 4mm!important;align-items:start}
    .photoCard{width:auto!important;min-height:0!important}
    .photoSize-small{grid-column:span 2}.photoSize-medium{grid-column:span 3}.photoSize-large,.photoSize-full{grid-column:1/-1}
    .photoSize-small .photoImageWrap{height:38mm!important}.photoSize-medium .photoImageWrap{height:50mm!important}.photoSize-large .photoImageWrap{height:82mm!important}.photoSize-full .photoImageWrap{height:142mm!important}
    .captionSize-small .photoCaption{font-size:7.4pt!important}.captionSize-normal .photoCaption{font-size:9pt!important}.captionSize-large .photoCaption{font-size:11pt!important}
    .sectionBanner.titleSize-small{font-size:11pt!important}.sectionBanner.titleSize-large{font-size:17pt!important}
  `;
}

function appliquerTitresMarques(html) {
  return html
    .replace(/<div class="sectionBanner">\[\[METRA_TITLE_SMALL\]\]/g, '<div class="sectionBanner titleSize-small">')
    .replace(/<div class="sectionBanner">\[\[METRA_TITLE_LARGE\]\]/g, '<div class="sectionBanner titleSize-large">');
}

async function construireHtmlEdite(datas, config, photosConfig, output) {
  const layout = config.layout || {};
  const preparedDatas = preparerDatasMiseEnPage(datas, layout);
  const coverDataUri = config.__fragmentRapport ? null : (config.coverUri ? await imageDataUri(config.coverUri) : null);
  let html = await construireHtmlRapport(preparedDatas, config, photosConfig, output);
  html = appliquerTitresMarques(html);
  html = html.replace('</style>', `${cssEditeur(layout)}</style>`);
  html = personnaliserPhotosHtml(html, preparedDatas, photosConfig);
  if (coverDataUri) {
    html = html.replace(/<div class="coverVisual"><img src="[^"]+" alt="Energie & Service"\/><\/div>/, `<div class="coverVisual"><img src="${coverDataUri}" alt="Couverture du rapport"/></div>`);
    html = html.replace(/<img src="[^"]+" alt="Couverture du rapport"([^>]*)\/>/, `<img src="${coverDataUri}" alt="Couverture du rapport"$1/>`);
  }
  return { html, coverDataUri, preparedDatas };
}

async function choisirDossier() {
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF?.requestDirectoryPermissionsAsync || !SAF?.createFileAsync) throw new Error("L'enregistrement dans Documents n'est pas disponible sur cet appareil.");
  let initial = null;
  try { initial = SAF.getUriForDirectoryInRoot ? SAF.getUriForDirectoryInRoot('Documents') : null; } catch {}
  const p = await SAF.requestDirectoryPermissionsAsync(initial || undefined);
  return p?.granted ? p.directoryUri : null;
}

async function copierPdfVersDossier(uriSource, dossier, nom) {
  const nativeCopy=NativeModules.MetraPdf?.copyReportToDocument;
  if(typeof nativeCopy==='function'){
    return creerFichierSafDepuisFichier(dossier,nom,MIME_PDF,uriSource,(source,dest)=>NativeModules.MetraPdf.copyReportToDocument(source,dest));
  }
  // Compatibility for a runtime without the bundled Android module.
  const b64 = await FileSystem.readAsStringAsync(uriSource, { encoding: FileSystem.EncodingType.Base64 });
  return creerFichierSaf(dossier, nom, MIME_PDF, b64);
}
function checkReportCancelled(config){
  if(config.shouldCancel?.())throw Object.assign(new Error('Génération annulée. Aucun PDF incomplet enregistré.'),{code:'METRA_REPORT_CANCELLED'});
}
async function lirePdfBinaire(uri){
  if(typeof File?.prototype?.bytes==='function')return new File(uri).bytes();
  return FileSystem.readAsStringAsync(uri,{encoding:FileSystem.EncodingType.Base64});
}
async function sauvegarderPdfBinaire(pdf,prefix='rapport_edite'){
  const uri=FileSystem.cacheDirectory+prefix+'_'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.pdf';
  try{
    if(typeof File?.prototype?.write==='function'){
      const bytes=await pdf.save();
      const file=new File(uri);
      file.create({overwrite:false});
      file.write(bytes);
    }else{
      await FileSystem.writeAsStringAsync(uri,await pdf.saveAsBase64({dataUri:false}),{encoding:FileSystem.EncodingType.Base64});
    }
    const info=await FileSystem.getInfoAsync(uri,{size:true});
    if(!info.exists||!info.size)throw Error('PDF temporaire vide.');
    return uri;
  }catch(error){await FileSystem.deleteAsync(uri,{idempotent:true}).catch(()=>{});throw error;}
}

async function ecrireWordHtml(dossier, nom, html) {
  const SAF = FileSystem.StorageAccessFramework;
  const wordHtml = html.replace('<html>', '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">');
  const uri = await SAF.createFileAsync(dossier, nom, MIME_WORD);
  try {
    await FileSystem.writeAsStringAsync(uri, wordHtml, { encoding: FileSystem.EncodingType.UTF8 });
    return uri;
  } catch (error) {
    let nettoye = false;
    try { await FileSystem.deleteAsync(uri, { idempotent: true }); nettoye = true; } catch (_) {}
    throw new Error('Word incomplet : ' + String(error?.message || error) +
      (nettoye ? ' · Nouvelle sortie supprimée.' : ' · Supprimer le fichier partiel : ' + uri));
  }
}

async function lireAssetBinaire(moduleId) {
  const asset = Asset.fromModule(moduleId);
  const lisible = (uri) => /^(file|content):\/\//i.test(String(uri || ''));
  if (lisible(asset.localUri)) return FileSystem.readAsStringAsync(asset.localUri, { encoding: FileSystem.EncodingType.Base64 });
  try {
    const charge = await Promise.race([
      asset.downloadAsync(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout asset PDF')), 5000)),
    ]);
    const localUri = charge?.localUri || asset.localUri;
    if (lisible(localUri)) return FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
  } catch (error) { console.warn('Asset PDF non matérialisé', error); }
  const uri = String(asset.uri || '');
  if (/^https?:/i.test(uri)) {
    const response = await Promise.race([
      fetch(uri),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout lecture asset PDF')), 5000)),
    ]);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength) return new Uint8Array(buffer);
    }
  }
  throw new Error('Asset PDF illisible');
}

async function habillerPdfEdite(uriSource, config, siteFooter, clientCover, coverDataUri, pdfSource=null) {
  // Reuse the merged document rather than serializing and parsing it again.
  const pdf = pdfSource || await PDFDocument.load(await lirePdfBinaire(uriSource));
  const pages = pdf.getPages();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  // Standard WinAnsi PDF fonts cannot encode arbitrary Unicode. Keep the
  // complete HTML-printed PDF instead of throwing or changing user text.
  try {
    for (const v of [config.chrono, config.objet, siteFooter, clientCover])
      bold.widthOfTextAtSize(String(v || ''), 9);
  } catch (error) {
    console.warn('Habillage PDF Unicode non pris en charge ; PDF imprimé complet conservé.', error);
    if(uriSource)return uriSource;
    return sauvegarderPdfBinaire(pdf);
  }
  const mm = (value) => value * 72 / 25.4;
  const embedJpgSafe = async (base64) => { try { return base64 ? await pdf.embedJpg(base64) : null; } catch { return null; } };
  const embedBundledSafe = async (moduleId, format) => {
    try {
      const bytes = await lireAssetBinaire(moduleId);
      return format === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch (error) { console.warn('Asset PDF embarqué non chargé', error); return null; }
  };

  const [coverExact, logoExact, certExact, pageMarkImage, ...businessSpiralImages] = await Promise.all([
    embedBundledSafe(REPORT_ASSETS.cover, 'png'),
    embedBundledSafe(REPORT_ASSETS.logo, 'png'),
    embedBundledSafe(REPORT_ASSETS.cert, 'png'),
    embedBundledSafe(REPORT_ASSETS.pageMark, 'png'),
    ...REPORT_ASSETS.businessSpirals.map((moduleId) => embedBundledSafe(moduleId, 'jpg')),
  ]);
  const customCover = coverDataUri ? await embedJpgSafe(dataUriBase64(coverDataUri)) : null;
  const coverFallback = !coverExact && !customCover ? await embedJpgSafe(dataUriBase64(REPORT_COVER)) : null;
  const logoFallback = !logoExact ? await embedJpgSafe(dataUriBase64(REPORT_LOGO)) : null;
  const certFallback = !certExact ? await embedJpgSafe(dataUriBase64(REPORT_OPQIBI)) : null;
  const coverVisualImage = customCover || coverExact || coverFallback;
  const coverLogoImage = logoExact || logoFallback;
  const coverOpqibiImage = certExact || certFallback;

  const fit = (image, maxWidth, maxHeight) => {
    if (!image) return { width: 0, height: 0 };
    const ratio = image.width / image.height;
    let width = maxWidth, height = width / ratio;
    if (height > maxHeight) { height = maxHeight; width = height * ratio; }
    return { width, height };
  };

  const total = pages.length;
  pages.forEach((page, index) => {
    const { width, height } = page.getSize();
    if (index === 0) {
      const orange = rgb(0.94, 0.45, 0.05), grey = rgb(0.35, 0.35, 0.35), dark = rgb(0.12, 0.12, 0.12), white = rgb(1, 1, 1);
      page.drawRectangle({ x: 0, y: 0, width, height, color: white });
      if (coverLogoImage) {
        const sLogo = fit(coverLogoImage, mm(86), mm(21));
        page.drawImage(coverLogoImage, { x: mm(16.5), y: height - mm(12) - sLogo.height, width: sLogo.width, height: sLogo.height });
      }
      const dateLine = `VERSAILLES, LE ${String(config.dateRapport ? dateFr(config.dateRapport) : dateFr(new Date().toISOString().slice(0, 10))).toUpperCase()}`;
      const dateSize = 7.2, dateWidth = bold.widthOfTextAtSize(dateLine, dateSize);
      page.drawText(dateLine, { x: width - mm(19) - dateWidth, y: height - mm(25), size: dateSize, font: bold, color: dark });
      page.drawText(`Nos réf. : ${config.chrono || ''}`, { x: mm(20), y: height - mm(48), size: 7.4, font: bold, color: dark });
      page.drawLine({ start: { x: mm(20), y: height - mm(49) }, end: { x: mm(54), y: height - mm(49) }, thickness: 0.6, color: dark });

      const clientLabel = String(clientCover || '').trim() || 'Rapport de visite technique';
      const boxX = mm(30), boxY = height - mm(80), boxW = mm(150), boxH = mm(18), radius = boxH / 2;
      page.drawRectangle({ x: boxX + radius, y: boxY, width: boxW - 2 * radius, height: boxH, color: orange });
      page.drawCircle({ x: boxX + radius, y: boxY + radius, size: radius, color: orange });
      page.drawCircle({ x: boxX + boxW - radius, y: boxY + radius, size: radius, color: orange });
      let clientSize = 14.5;
      while (clientSize > 8 && bold.widthOfTextAtSize(clientLabel, clientSize) > boxW - mm(12)) clientSize -= 0.5;
      const clientWidth = bold.widthOfTextAtSize(clientLabel, clientSize);
      page.drawText(clientLabel, { x: boxX + (boxW - clientWidth) / 2, y: boxY + boxH / 2 - clientSize * 0.34, size: clientSize, font: bold, color: white });

      if (coverVisualImage) {
        const maxW = mm(148), maxH = mm(92);
        const sCover = fit(coverVisualImage, maxW, maxH);
        page.drawImage(coverVisualImage, { x: (width - sCover.width) / 2, y: height - mm(96) - sCover.height, width: sCover.width, height: sCover.height });
      }
      const objectText = String(config.objet || 'Compte rendu de visite technique');
      let objectSize = 11.4;
      while (objectSize > 8 && bold.widthOfTextAtSize(objectText, objectSize) > mm(160)) objectSize -= 0.4;
      const objectWidth = bold.widthOfTextAtSize(objectText, objectSize);
      page.drawText(objectText, { x: (width - objectWidth) / 2, y: height - mm(194), size: objectSize, font: bold, color: dark });

      const business = ['COPROPRIÉTÉS', 'BAILLEURS SOCIAUX', 'COLLECTIVITÉS', 'TERTIAIRE'];
      const businessY = height - mm(207), businessSize = 5.2, iconSize = mm(5.2), gap = mm(0.9), itemGap = mm(3.0);
      const widths = business.map((label) => iconSize + gap + bold.widthOfTextAtSize(label, businessSize));
      const businessTotal = widths.reduce((sum, value) => sum + value, 0) + itemGap * (business.length - 1);
      let businessX = (width - businessTotal) / 2;
      business.forEach((label, i) => {
        const icon = businessSpiralImages[i];
        if (icon) page.drawImage(icon, { x: businessX, y: businessY - mm(0.5), width: iconSize, height: iconSize });
        businessX += iconSize + gap;
        page.drawText(label, { x: businessX, y: businessY, size: businessSize, font: bold, color: grey });
        businessX += bold.widthOfTextAtSize(label, businessSize) + itemGap;
      });

      const cities = [['PARIS', true], ['NANTES', false], ['TOURS', false], ['RENNES', false], ['BORDEAUX', false], ['LYON', false], ['CHERBOURG', false], ['NÎMES', false]];
      const citySize = 4.65, cityGap = mm(3.0), cityWidths = cities.map(([label]) => font.widthOfTextAtSize(label, citySize));
      const cityTotal = cityWidths.reduce((sum, value) => sum + value, 0) + cityGap * (cities.length - 1);
      let cityX = (width - cityTotal) / 2;
      cities.forEach(([label, active], i) => {
        page.drawText(label, { x: cityX, y: mm(25.5), size: citySize, font: active ? bold : font, color: active ? orange : grey });
        cityX += cityWidths[i] + cityGap;
      });

      const barY = mm(14.2), barH = mm(7.7), websiteW = mm(48);
      page.drawRectangle({ x: 0, y: barY, width: width - websiteW, height: barH, color: orange });
      page.drawRectangle({ x: width - websiteW, y: barY, width: websiteW, height: barH, color: grey });
      const contact = 'Tél. 01 39 55 17 20 - 143 rue Yves Le Coz - 78000 VERSAILLES - contact.versailles@energieetservice.fr';
      let contactSize = 4.65;
      while (contactSize > 3.8 && font.widthOfTextAtSize(contact, contactSize) > width - websiteW - mm(8)) contactSize -= 0.15;
      page.drawText(contact, { x: mm(5), y: barY + mm(2.65), size: contactSize, font, color: white });
      const website = 'energieetservice.fr', websiteSize = 8.2, websiteTextW = bold.widthOfTextAtSize(website, websiteSize);
      page.drawText(website, { x: width - websiteW + (websiteW - websiteTextW) / 2, y: barY + mm(2.25), size: websiteSize, font: bold, color: white });
      if (coverOpqibiImage) {
        const sOpqibi = fit(coverOpqibiImage, mm(23), mm(8.5));
        page.drawImage(coverOpqibiImage, { x: mm(4.5), y: mm(3.9), width: sOpqibi.width, height: sOpqibi.height });
      }
      const legal = 'SAS au capital de 292 500€ - Siège social : 143 rue Yves Le Coz - 78000 Versailles - RCS Versailles B 338 335 201 / NAF 7112B';
      let legalSize = 4.45;
      while (legalSize > 3.5 && font.widthOfTextAtSize(legal, legalSize) > width - mm(35)) legalSize -= 0.15;
      page.drawText(legal, { x: mm(31), y: mm(6.0), size: legalSize, font, color: grey });
      return;
    }

    const left = 50, footerY = 20, grey = rgb(0.35, 0.35, 0.35), orange = rgb(0.94, 0.45, 0.05);
    if (pageMarkImage) {
      const s = fit(pageMarkImage, mm(6), mm(6));
      page.drawImage(pageMarkImage, { x: mm(4.5), y: height - mm(4.5) - s.height, width: s.width, height: s.height });
    }
    const running = String(config.objet || 'Compte rendu de visite technique').toUpperCase();
    const runSize = 7.2, runWidth = bold.widthOfTextAtSize(running, runSize);
    page.drawText(running, { x: Math.max(left + 90, width - 50 - runWidth), y: height - 24, size: runSize, font: bold, color: rgb(0.15, 0.15, 0.15) });
    const meta = [`Nos réf. : ${config.chrono || ''}`, `Site : ${siteFooter || ''}`, `Objet : ${config.objet || ''}`];
    meta.forEach((line, i) => page.drawText(String(line), { x: left, y: footerY + 15 - i * 7, size: 5.8, font, color: grey }));
    const pageText = `${index + 1}/${total}`, arrowW = 23, numW = 38, boxH = 17, x = width - arrowW - numW;
    page.drawRectangle({ x, y: footerY - 1, width: arrowW, height: boxH, color: grey });
    page.drawRectangle({ x: x + arrowW, y: footerY - 1, width: numW, height: boxH, color: orange });
    const arrowColor = rgb(1, 1, 1), arrowY = footerY + 7.5;
    page.drawLine({ start: { x: x + 6, y: arrowY }, end: { x: x + 16, y: arrowY }, thickness: 1.2, color: arrowColor });
    page.drawLine({ start: { x: x + 12.5, y: arrowY + 3.2 }, end: { x: x + 16, y: arrowY }, thickness: 1.2, color: arrowColor });
    page.drawLine({ start: { x: x + 12.5, y: arrowY - 3.2 }, end: { x: x + 16, y: arrowY }, thickness: 1.2, color: arrowColor });
    const tW = bold.widthOfTextAtSize(pageText, 6.6);
    page.drawText(pageText, { x: x + arrowW + (numW - tW) / 2, y: footerY + 4, size: 6.6, font: bold, color: rgb(1, 1, 1) });
  });

  checkReportCancelled(config);
  return sauvegarderPdfBinaire(pdf);
}


async function imprimerPdfParFragments({datas,config,photosConfig,onProgress}) {
  const started=Date.now(),cacheBefore=reportPhotoCacheStats();
  const metrics={visits:datas.length,photos:0,budget:8,plannedLots:0,printJobs:0,retriedLots:0,headerMs:0,htmlMs:0,printMs:0,mergeMs:0};
  const progress=(phase,done,total)=>config.onReportProgress?.({phase,done,total});
  checkReportCancelled(config);
  let profile={};
  try{profile=await NativeModules.MetraPdf?.reportMemoryProfile?.()||{};}catch{}
  const budget=choisirBudgetPdf(profile);
  metrics.budget=budget;
  const lots=planifierLotsPdf(datas,photosConfig,config.photos!==false,budget);
  metrics.plannedLots=lots.length;
  metrics.photos=lots.reduce((n,lot)=>n+lot.reduce((a,f)=>a+f.photosConfig.length,0),0);
  if(!lots.length)throw Error('Aucune visite à exporter.');
  let photoDone=0,count=0;
  progress('Données',0,datas.length);
  const headerStarted=Date.now();
  const header=await construireHtmlEdite(datas,{...config,photos:false,__enteteSeulement:true},[],'pdf');
  const entete=extraireEnteteRapport(header.html);
  metrics.headerMs=Date.now()-headerStarted;
  progress('Données',datas.length,datas.length);
  const final=await PDFDocument.create();
  async function imprimerLot(lot){
    checkReportCancelled(config);
    const htmlStart=Date.now();
    const rendered=[];
    for(const fragment of lot){
      checkReportCancelled(config);
      const page=await construireHtmlEdite([fragment.data],{
        ...config,patrimoine:false,coverUri:null,__fragmentRapport:fragment,
        onPhotoPrepared:()=>{
          photoDone++;
          if(photoDone%10===0||photoDone===metrics.photos)progress('Photos',Math.min(photoDone,metrics.photos),metrics.photos);
        }
      },fragment.photosConfig,'pdf');
      rendered.push({html:page.html,fragment});
    }
    const html=composerHtmlLot(rendered,entete,metrics.printJobs===0);
    metrics.htmlMs+=Date.now()-htmlStart;
    checkReportCancelled(config);
    progress('Impression',count,lots.length);
    let printed;
    const printStart=Date.now();
    try{
      printed=await Print.printToFileAsync({html,base64:false});
    }catch(error){
      metrics.printMs+=Date.now()-printStart;
      // Retain all previously copied pages. Retry only a rejected print,
      // never a partially appended PDF or a missing-photo error.
      if(lot.length>1){
        metrics.retriedLots++;
        for(const fragment of lot)await imprimerLot([fragment]);
        return;
      }
      throw error;
    }
    metrics.printMs+=Date.now()-printStart;
    try{
      checkReportCancelled(config);
      const mergeStart=Date.now();
      const chunk=await PDFDocument.load(await lirePdfBinaire(printed.uri));
      if(!chunk.getPageCount())throw Error('Impression PDF vide.');
      const pages=await final.copyPages(chunk,chunk.getPageIndices());
      for(const page of pages)final.addPage(page);
      metrics.mergeMs+=Date.now()-mergeStart;metrics.printJobs++;
    }finally{if(printed?.uri)await FileSystem.deleteAsync(printed.uri,{idempotent:true}).catch(()=>{});}
  }
  try{
    for(const lot of lots){
      await imprimerLot(lot);
      count++;onProgress?.(count,lots.length);
      progress('Impression',count,lots.length);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const after=reportPhotoCacheStats();
    Object.assign(metrics,{photoCacheHits:after.hits-cacheBefore.hits,photoEncodes:after.encoded-cacheBefore.encoded,assembleMs:Date.now()-started,pages:final.getPageCount()});
    return {pdf:final,coverDataUri:header.coverDataUri,metrics};
  }catch(error){
    if(error?.code==='METRA_REPORT_CANCELLED')throw error;
    throw Error('Génération PDF interrompue ('+count+'/'+lots.length+' lots) : '+String(error?.message||error));
  }
}

// Heavy previews are complete temporary files; no change to the Word path.
export async function preparerApercuPdfFragmente({datas,config,photosConfig}){
  beginReportPhotoExport();
  try{
    const result=await imprimerPdfParFragments({datas,config,photosConfig});
    return await sauvegarderPdfBinaire(result.pdf,'rapport_apercu');
  }finally{endReportPhotoExport();}
}

async function exporterUnFormatEdite({datas,config,photosConfig,format,dossier}){
  const clientNom=datas[0]?.visite?.nom_client||'Rapport';
  const localNom=datas[0]?.visite?.nom_local||datas[0]?.visite?.type_local||null;
  const base=propre(datas.length>1
    ? clientNom+'_'+(config.chrono||'Rapport')+'_'+(config.objet||'CRV')
    : (config.chrono||'Rapport')+'_'+(datas[0]?.visite?.nom_site||clientNom)+(localNom?'_'+localNom:'')+'_'+(config.objet||'CRV'));
  const sites=[...new Set(datas.map(d=>d.visite.nom_site).filter(Boolean))];
  const siteFooter=sites.length===1?[sites[0],datas.length===1?localNom:null].filter(Boolean).join(' · '):sites.length+' sites sélectionnés';
  const clientCover=datas[0]?.visite?.nom_client||'Rapport';
  checkReportCancelled(config);
  if(format==='word'){
    const rendered=await construireHtmlEdite(datas,config,photosConfig,'word');
    const nom=base+'.doc';
    return {format,uri:await ecrireWordHtml(dossier,nom,rendered.html),nom};
  }
  let habille=null;
  const started=Date.now(),nom=base+'.pdf';
  beginReportPhotoExport();
  try{
    const result=await imprimerPdfParFragments({datas,config,photosConfig,onProgress:config.onPdfProgress});
    checkReportCancelled(config);
    config.onReportProgress?.({phase:'Pagination et assemblage',done:0,total:1});
    const finishStart=Date.now();
    habille=await habillerPdfEdite(null,config,siteFooter,clientCover,result.coverDataUri,result.pdf);
    result.metrics.finishMs=Date.now()-finishStart;
    checkReportCancelled(config);
    config.onReportProgress?.({phase:'Enregistrement',done:0,total:1});
    const writeStart=Date.now();
    const uri=await copierPdfVersDossier(habille,dossier,nom);
    result.metrics.writeMs=Date.now()-writeStart;result.metrics.totalMs=Date.now()-started;
    // Counts and timings only: never names, paths, photo labels or client data.
    console.info('METRA_REPORT_METRICS '+JSON.stringify(result.metrics));
    config.onReportProgress?.({phase:'Terminé',done:1,total:1});
    return {format:'pdf',uri,nom,metrics:result.metrics};
  }finally{
    if(habille)await FileSystem.deleteAsync(habille,{idempotent:true}).catch(()=>{});
    endReportPhotoExport();
  }
}

export async function exporterRapportEdite({ datas, config, photosConfig, format = 'pdf', dossierUri = null }) {
  checkReportCancelled(config);
  const clientNom = datas?.[0]?.visite?.nom_client || null;
  const clientId = datas?.[0]?.visite?.client_id || null;
  const dossier = dossierUri || (clientNom ? await dossierRapportsClientMetra(clientNom, clientId) : await choisirDossier());
  if (!dossier) return { annule: true };
  return { annule: false, ...(await exporterUnFormatEdite({ datas, config, photosConfig, format, dossier })) };
}

export async function exporterRapportsParSiteEdites({ datas, config, photosConfig, format = 'pdf', dossiersParSite = true }) {
  const clientNom = datas?.[0]?.visite?.nom_client || null;
  const clientId = datas?.[0]?.visite?.client_id || null;
  const dossierClient = clientNom ? await dossierRapportsClientMetra(clientNom, clientId) : await choisirDossier();
  if (!dossierClient) return { annule: true, resultats: [] };
  const groupes = new Map();
  for (const data of datas) {
    const key = data.visite.site_id || data.visite.nom_site || data.visite.id;
    if (!groupes.has(key)) groupes.set(key, []);
    groupes.get(key).push(data);
  }
  const resultats = [];
  const erreurs = [];
  for (const siteDatas of groupes.values()) {
    if(config.shouldCancel?.())break;
    const visiteId = siteDatas[0]?.visite?.id;
    const siteConfig = config.coverVisiteId && !siteDatas.some((data) => data.visite.id === config.coverVisiteId)
      ? { ...config, coverUri: null, coverLabel: 'Image standard METRA', coverVisiteId: null }
      : config;
    const siteNom = siteDatas[0]?.visite?.nom_site || 'Site';
    try {
      const dossierSite = dossiersParSite === false || !clientNom
        ? dossierClient
        : await dossierRapportsSiteMetra({ clientNom, siteNom, clientId, siteId: siteDatas[0]?.visite?.site_id });
      resultats.push(await exporterRapportEdite({ datas: siteDatas, config: siteConfig, photosConfig, format, dossierUri: dossierSite }));
    } catch (error) {
      if(error?.code==='METRA_REPORT_CANCELLED')break;
      erreurs.push({ siteId: siteDatas[0]?.visite?.site_id, siteNom, visiteIds: siteDatas.map((d) => d.visite.id), message: String(error?.message || error) });
    }
  }
  return { annule: false, interrompu:Boolean(config.shouldCancel?.()), resultats, erreurs };
}


export async function exporterRapportsParLocalEdites({ datas, config, photosConfig, format = 'pdf', dossiersParLocal = true }) {
  const clientNom = datas?.[0]?.visite?.nom_client || null;
  const clientId = datas?.[0]?.visite?.client_id || null;
  const dossierClient = clientNom ? await dossierRapportsClientMetra(clientNom, clientId) : await choisirDossier();
  if (!dossierClient) return { annule: true, resultats: [] };

  const groupes = new Map();
  for (const data of datas || []) {
    const key = data.visite?.installation_id || `visite:${data.visite?.id}`;
    if (!groupes.has(key)) groupes.set(key, []);
    groupes.get(key).push(data);
  }

  const resultats = [];
  const erreurs = [];
  for (const localDatas of groupes.values()) {
    if(config.shouldCancel?.())break;
    const visiteId = localDatas[0]?.visite?.id;
    const localConfig = config.coverVisiteId && config.coverVisiteId !== visiteId
      ? { ...config, coverUri: null, coverLabel: 'Image standard METRA', coverVisiteId: null }
      : config;
    const siteNom = localDatas[0]?.visite?.nom_site || 'Site';
    const localNom = localDatas[0]?.visite?.nom_local || localDatas[0]?.visite?.type_local || 'Visite non rattachée';
    try {
      let dossier = dossierClient;
      if (dossiersParLocal !== false && clientNom) {
        dossier = await dossierRapportsLocalMetra({ clientNom, siteNom, localNom,
          clientId, siteId: localDatas[0]?.visite?.site_id, localId: localDatas[0]?.visite?.installation_id });
      } else if (clientNom) {
        dossier = await dossierRapportsSiteMetra({ clientNom, siteNom, clientId, siteId: localDatas[0]?.visite?.site_id });
      }
      resultats.push(await exporterRapportEdite({ datas: localDatas, config: localConfig, photosConfig, format, dossierUri: dossier }));
    } catch (error) {
      if(error?.code==='METRA_REPORT_CANCELLED')break;
      erreurs.push({ localId: localDatas[0]?.visite?.installation_id,
        visiteIds: localDatas.map((d) => d.visite.id), localNom, siteNom,
        message: String(error?.message || error) });
    }
  }
  return { annule: false, interrompu:Boolean(config.shouldCancel?.()), resultats, erreurs };
}

// METRA storage compatibility: dossierUri || await choisirDossier(datas);
