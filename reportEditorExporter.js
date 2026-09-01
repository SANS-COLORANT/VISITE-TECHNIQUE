import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as ImageManipulator from 'expo-image-manipulator';
import { Asset } from 'expo-asset';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { construireHtmlRapport } from './reportBuilder.js';
import { REPORT_COVER, REPORT_LOGO, REPORT_OPQIBI } from './reportBrandAssets.js';

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

function poidsPhoto(size) {
  if (size === 'small') return 2;
  if (size === 'large') return 6;
  if (size === 'full') return 12;
  return 3;
}

function grouperCartes(cartes) {
  const pages = [];
  let page = [], charge = 0;
  for (const carte of cartes) {
    const poids = poidsPhoto(carte.photo?.size || 'medium');
    if (page.length && charge + poids > 12) {
      pages.push(page);
      page = [];
      charge = 0;
    }
    page.push(carte);
    charge += poids;
    if (charge >= 12) {
      pages.push(page);
      page = [];
      charge = 0;
    }
  }
  if (page.length) pages.push(page);
  return pages;
}

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
    const found = [...section.texte.matchAll(/<div class="photoCard">[\s\S]*?<div class="photoCaption">[\s\S]*?<\/div><\/div>/g)];
    found.forEach((m) => cards.push(m[0]));
  }
  if (!cards.length) return article;

  const photos = (photosConfig || [])
    .filter((p) => p.visiteId === data.visite.id && p.include)
    .sort((a, b) => a.ordre - b.ordre);

  const cartes = cards.map((card, index) => {
    const photo = photos[index] || { size: 'medium', captionSize: 'normal' };
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
  const coverDataUri = config.coverUri ? await imageDataUri(config.coverUri) : null;
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
  const SAF = FileSystem.StorageAccessFramework;
  const b64 = await FileSystem.readAsStringAsync(uriSource, { encoding: FileSystem.EncodingType.Base64 });
  const uri = await SAF.createFileAsync(dossier, nom, MIME_PDF);
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}

async function ecrireWordHtml(dossier, nom, html) {
  const SAF = FileSystem.StorageAccessFramework;
  const wordHtml = html.replace('<html>', '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">');
  const uri = await SAF.createFileAsync(dossier, nom, MIME_WORD);
  await FileSystem.writeAsStringAsync(uri, wordHtml, { encoding: FileSystem.EncodingType.UTF8 });
  return uri;
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

async function habillerPdfEdite(uriSource, config, siteFooter, clientCover, coverDataUri) {
  const sourceBase64 = await FileSystem.readAsStringAsync(uriSource, { encoding: FileSystem.EncodingType.Base64 });
  const pdf = await PDFDocument.load(sourceBase64);
  const pages = pdf.getPages();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
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

  const outBase64 = await pdf.saveAsBase64({ dataUri: false });
  const outUri = `${FileSystem.cacheDirectory}rapport_edite_${Date.now()}.pdf`;
  await FileSystem.writeAsStringAsync(outUri, outBase64, { encoding: FileSystem.EncodingType.Base64 });
  return outUri;
}

async function exporterUnFormatEdite({ datas, config, photosConfig, format, dossier }) {
  const base = propre(`${config.chrono || 'Rapport'}_${datas.length === 1 ? datas[0].visite.nom_site : datas[0].visite.nom_client}_${config.objet || 'CRV'}`);
  const sites = [...new Set(datas.map((d) => d.visite.nom_site).filter(Boolean))];
  const siteFooter = sites.length === 1 ? sites[0] : `${sites.length} sites sélectionnés`;
  const clientCover = datas[0]?.visite?.nom_client || 'Rapport';
  const rendered = await construireHtmlEdite(datas, config, photosConfig, format === 'word' ? 'word' : 'pdf');

  if (format === 'word') {
    const nom = `${base}.doc`;
    return { format, uri: await ecrireWordHtml(dossier, nom, rendered.html), nom };
  }

  const printed = await Print.printToFileAsync({ html: rendered.html, base64: false });
  let habille = null;
  const nom = `${base}.pdf`;
  try {
    habille = await habillerPdfEdite(printed.uri, config, siteFooter, clientCover, rendered.coverDataUri);
    return { format: 'pdf', uri: await copierPdfVersDossier(habille, dossier, nom), nom };
  } finally {
    await FileSystem.deleteAsync(printed.uri, { idempotent: true }).catch(() => {});
    if (habille) await FileSystem.deleteAsync(habille, { idempotent: true }).catch(() => {});
  }
}

export async function exporterRapportEdite({ datas, config, photosConfig, format = 'pdf', dossierUri = null }) {
  const dossier = dossierUri || await choisirDossier();
  if (!dossier) return { annule: true };
  return { annule: false, ...(await exporterUnFormatEdite({ datas, config, photosConfig, format, dossier })) };
}

export async function exporterRapportsParSiteEdites({ datas, config, photosConfig, format = 'pdf' }) {
  const dossier = await choisirDossier();
  if (!dossier) return { annule: true, resultats: [] };
  const groupes = new Map();
  for (const data of datas) {
    const key = data.visite.site_id || data.visite.nom_site || data.visite.id;
    if (!groupes.has(key)) groupes.set(key, []);
    groupes.get(key).push(data);
  }
  const resultats = [];
  for (const siteDatas of groupes.values()) {
    const visiteId = siteDatas[0]?.visite?.id;
    const siteConfig = config.coverVisiteId && config.coverVisiteId !== visiteId
      ? { ...config, coverUri: null, coverLabel: 'Image standard METRA', coverVisiteId: null }
      : config;
    resultats.push(await exporterRapportEdite({ datas: siteDatas, config: siteConfig, photosConfig, format, dossierUri: dossier }));
  }
  return { annule: false, resultats };
}
