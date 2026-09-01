import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Print from 'expo-print';
import { Asset } from 'expo-asset';
import { PDFDocument, clip, endPath, popGraphicsState, pushGraphicsState, rectangle } from 'pdf-lib';
import { chargerDonneesVisiteRapport } from './reportBuilder.js';
import { getPlanSitePourVisite } from './sitePlanDb.js';
import { construireSitePreAllumageHtml, PREALLUMAGE_REPORT_CSS } from './preAllumageReportHtml.js';
import { REPORT_COVER, REPORT_LOGO, REPORT_OPQIBI } from './reportBrandAssets.js';

const MIME_PDF = 'application/pdf';
const MIME_WORD = 'application/msword';
const ORANGE = '#F07E31';
const GREY = '#595959';

const COVER_ASSETS = Object.freeze({
  logo: require('./assets/report/brand-logo.png'),
  visual: require('./assets/report/cover-building.png'),
  opqibi: require('./assets/report/Image21.png'),
});

function esc(v = '') {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function propre(v = 'Rapport') {
  return String(v || 'Rapport')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 90) || 'Rapport';
}

function dateFr(v) {
  if (!v) return '';
  const m = String(v).slice(0, 10).split('-');
  return m.length === 3 ? `${m[2]}/${m[1]}/${m[0]}` : String(v);
}

function infoValue(data, label) {
  for (const s of data.sections || []) {
    if (s.panelId !== 'p-pa-infos') continue;
    for (const g of s.groups || []) {
      const r = (g.rows || []).find((x) => x.label === label);
      const v = String(r?.comment || '').trim();
      if (v) return v;
    }
  }
  return '';
}

async function imageDataUri(uri) {
  if (!uri) return null;
  try {
    const r = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1800 } }],
      { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return r.base64 ? `data:image/jpeg;base64,${r.base64}` : null;
  } catch (e) {
    console.warn('Plan non converti pour le rapport Pré-allumage', e);
    return null;
  }
}

function cssDocument() {
  return `
    @page{size:A4;margin:0}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif}
    .paCover{position:relative;width:210mm;height:297mm;padding:13mm 15mm 12mm;page-break-after:always;overflow:hidden;background:#fff}
    .paCoverLogo{width:72mm;height:20mm;object-fit:contain;object-position:left top}
    .paCoverDate{position:absolute;right:17mm;top:20mm;font-size:8pt;font-weight:700}
    .paCoverRef{position:absolute;left:24mm;top:42mm;font-size:8pt;font-weight:700}
    .paCoverClient{position:absolute;left:18mm;right:18mm;top:55mm;background:${ORANGE};color:#fff;border-radius:6mm;text-align:center;padding:4.5mm 5mm;font-size:16pt;font-weight:800;line-height:1.12;z-index:2}
    .paCoverVisual{position:absolute;left:18mm;right:18mm;top:79mm;height:88mm;overflow:hidden;background:#eee}.paCoverVisual img{width:100%;height:100%;object-fit:cover}
    .paCoverMission{position:absolute;left:20mm;right:20mm;top:184mm;text-align:center;font-weight:800;font-size:11.5pt;line-height:1.1}
    .paCoverObject{position:absolute;left:21mm;right:21mm;top:204mm;text-align:center;font-weight:800;font-size:10pt;line-height:1.2}
    .paCoverOperator{position:absolute;left:20mm;right:20mm;top:228mm;text-align:center;font-size:9.5pt;font-weight:800}
    .paCoverBusiness{position:absolute;left:17mm;right:17mm;top:171mm;display:flex;justify-content:space-around;font-size:6pt;color:#666;font-weight:700}
    .paCoverFooter{position:absolute;left:0;right:0;bottom:0;color:#666;font-size:5.4pt}.paCities{text-align:center;margin-bottom:1.5mm}.paCities span{margin:0 3mm}.paCities span:first-child{color:${ORANGE};font-weight:800}.paContactBar{height:7mm;display:flex}.paContactOrange{flex:1;background:${ORANGE};color:#fff;text-align:center;padding-top:2mm}.paWebsite{width:48mm;background:${GREY};color:#fff;text-align:center;padding-top:1.8mm;font-size:7.5pt;font-weight:800}.paLegal{height:8mm;display:flex;align-items:center;gap:3mm;padding:0 5mm}.paLegal img{width:18mm;max-height:7mm;object-fit:contain}
    .paPage{position:relative;width:210mm;min-height:297mm;padding:17mm 15mm 20mm!important;margin:0!important;page-break-before:always;page-break-after:always;background:#fff;overflow:hidden}
    .paPage:before{content:'ENERGIE & SERVICE';position:absolute;left:15mm;top:7mm;color:${ORANGE};font-size:7pt;font-weight:800}
    .paPage:after{content:'Rapport Pré-allumage';position:absolute;right:15mm;top:7mm;color:#111;font-size:6.5pt;font-weight:800;text-transform:uppercase}
    ${PREALLUMAGE_REPORT_CSS}
  `;
}

function coverHtml(data, config) {
  const saison = infoValue(data, 'Saison de chauffe');
  const exploitant = infoValue(data, 'Exploitant');
  const adresse = data.visite.adresse || '';
  const clientLine = [data.visite.nom_site || data.visite.nom_client, adresse].filter(Boolean).join('<br/>');
  return `<section class="paCover">
    <img class="paCoverLogo" src="${REPORT_LOGO}" alt="Energie & Service"/>
    <div class="paCoverDate">VERSAILLES, ${esc(dateFr(config.dateRapport))}</div>
    <div class="paCoverRef">${esc(config.chrono || '')}</div>
    <div class="paCoverClient">${clientLine}</div>
    <div class="paCoverVisual"><img src="${REPORT_COVER}" alt="Couverture"/></div>
    <div class="paCoverBusiness"><span>◉ COPROPRIÉTÉS</span><span>◉ BAILLEURS SOCIAUX</span><span>◉ COLLECTIVITÉS</span><span>◉ TERTIAIRE</span></div>
    <div class="paCoverMission">MISSION DE SUIVI D’EXPLOITATION DES SYSTEMES DE<br/>CHAUFFAGE ET D’ECS</div>
    <div class="paCoverObject">Visite technique de préparation au lancement de la saison de chauffe${saison ? ` ${esc(saison)}` : ''}<br/>Essais réalisés le ${esc(dateFr(data.visite.date_visite))}</div>
    <div class="paCoverOperator">Installations exploitées par ${esc(exploitant || 'exploitant à renseigner')}</div>
    <div class="paCoverFooter"><div class="paCities"><span>VERSAILLES</span><span>NANTES</span><span>TOURS</span><span>RENNES</span><span>LYON</span><span>BORDEAUX</span></div><div class="paContactBar"><div class="paContactOrange">Tél. 01 39 55 17 20 - contact@energieetservice.fr</div><div class="paWebsite">energieetservice.fr</div></div><div class="paLegal"><img src="${REPORT_OPQIBI}" alt="OPQIBI"/><div>ENERGIE ET SERVICE - Mission de suivi d’exploitation des systèmes de chauffage et d’ECS</div></div></div>
  </section>`;
}

async function construireHtml(visiteId) {
  const data = await chargerDonneesVisiteRapport(visiteId);
  if (data.trame?.id !== 'pre_allumage') throw new Error('Ce format de rapport est réservé aux visites Pré-allumage.');
  const plan = await getPlanSitePourVisite(visiteId);
  const planSrc = await imageDataUri(plan?.uri);
  const chrono = infoValue(data, 'N° / référence du rapport') || '';
  const config = {
    chrono,
    dateRapport: new Date().toISOString().slice(0, 10),
    afficherLignesVides: false,
  };
  const corps = construireSitePreAllumageHtml(data, config, planSrc);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${cssDocument()}</style></head><body>${coverHtml(data, config)}${corps}</body></html>`;
  return { data, config, html };
}

async function choisirDossier() {
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF?.requestDirectoryPermissionsAsync || !SAF?.createFileAsync) throw new Error("L'enregistrement dans Documents n'est pas disponible sur cet appareil.");
  let initial = null;
  try { initial = SAF.getUriForDirectoryInRoot ? SAF.getUriForDirectoryInRoot('Documents') : null; } catch {}
  const p = await SAF.requestDirectoryPermissionsAsync(initial || undefined);
  return p?.granted ? p.directoryUri : null;
}

async function lireAssetBinaire(moduleId) {
  const asset = Asset.fromModule(moduleId);
  if (asset.localUri) {
    return FileSystem.readAsStringAsync(asset.localUri, { encoding: FileSystem.EncodingType.Base64 });
  }
  const charge = await Promise.race([
    asset.downloadAsync(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de matérialisation asset PDF')), 5000)),
  ]);
  const uri = charge?.localUri || asset.localUri;
  if (!uri) throw new Error('Asset de couverture introuvable dans le bundle Android.');
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

function dimensionsContenues(image, maxWidth, maxHeight) {
  const ratio = image.width / image.height;
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  return { width, height };
}

function dessinerImageCouverte(page, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const imageWidth = image.width * scale;
  const imageHeight = image.height * scale;
  page.pushOperators(pushGraphicsState(), rectangle(x, y, width, height), clip(), endPath());
  page.drawImage(image, {
    x: x + (width - imageWidth) / 2,
    y: y + (height - imageHeight) / 2,
    width: imageWidth,
    height: imageHeight,
  });
  page.pushOperators(popGraphicsState());
}

async function integrerImagesPageGarde(uriSource) {
  const sourceBase64 = await FileSystem.readAsStringAsync(uriSource, { encoding: FileSystem.EncodingType.Base64 });
  const pdf = await PDFDocument.load(sourceBase64);
  const page = pdf.getPages()[0];
  if (!page) throw new Error('La page de garde du PDF est introuvable.');

  const [logoBytes, visualBytes, opqibiBytes] = await Promise.all([
    lireAssetBinaire(COVER_ASSETS.logo),
    lireAssetBinaire(COVER_ASSETS.visual),
    lireAssetBinaire(COVER_ASSETS.opqibi),
  ]);
  const [logo, visual, opqibi] = await Promise.all([
    pdf.embedPng(logoBytes),
    pdf.embedPng(visualBytes),
    pdf.embedPng(opqibiBytes),
  ]);
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const mm = (value) => value * 72 / 25.4;

  const logoSize = dimensionsContenues(logo, mm(72), mm(20));
  page.drawImage(logo, {
    x: mm(15),
    y: pageHeight - mm(13) - logoSize.height,
    width: logoSize.width,
    height: logoSize.height,
  });

  const visualWidth = mm(174);
  const visualHeight = mm(88);
  dessinerImageCouverte(
    page,
    visual,
    (pageWidth - visualWidth) / 2,
    pageHeight - mm(79) - visualHeight,
    visualWidth,
    visualHeight
  );

  const opqibiSize = dimensionsContenues(opqibi, mm(18), mm(7));
  page.drawImage(opqibi, {
    x: mm(5),
    y: mm(1),
    width: opqibiSize.width,
    height: opqibiSize.height,
  });

  const uri = `${FileSystem.cacheDirectory}pre_allumage_couverture_${Date.now()}.pdf`;
  const base64 = await pdf.saveAsBase64({ dataUri: false });
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}

async function ecrirePdf(dossier, nom, html) {
  const temp = await Print.printToFileAsync({ html, base64: false });
  let habille = null;
  try {
    // Sur un APK Android, expo-print peut ignorer les images HTML de la garde.
    // On les réinjecte depuis les vrais assets du bundle dans le PDF final.
    habille = await integrerImagesPageGarde(temp.uri);
    const b64 = await FileSystem.readAsStringAsync(habille, { encoding: FileSystem.EncodingType.Base64 });
    const uri = await FileSystem.StorageAccessFramework.createFileAsync(dossier, nom, MIME_PDF);
    await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
    return uri;
  } finally {
    await FileSystem.deleteAsync(temp.uri, { idempotent: true }).catch(() => {});
    if (habille) await FileSystem.deleteAsync(habille, { idempotent: true }).catch(() => {});
  }
}

async function ecrireWord(dossier, nom, html) {
  const wordHtml = html.replace('<html>', '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">');
  const uri = await FileSystem.StorageAccessFramework.createFileAsync(dossier, nom, MIME_WORD);
  await FileSystem.writeAsStringAsync(uri, wordHtml, { encoding: FileSystem.EncodingType.UTF8 });
  return uri;
}

export async function exporterRapportPreAllumage(visiteId, format = 'pdf') {
  const dossier = await choisirDossier();
  if (!dossier) return { annule: true };
  const { data, html } = await construireHtml(visiteId);
  const base = propre(`Pre_Allumage_${data.visite.nom_site || 'Site'}_${data.visite.date_visite || ''}`);
  if (format === 'word') {
    const nom = `${base}.doc`;
    return { annule: false, format, nom, uri: await ecrireWord(dossier, nom, html) };
  }
  const nom = `${base}.pdf`;
  return { annule: false, format: 'pdf', nom, uri: await ecrirePdf(dossier, nom, html) };
}
