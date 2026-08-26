from pathlib import Path
import json

p = Path('reportBuilder.js')
s = p.read_text(encoding='utf-8')

old = "import * as ImageManipulator from 'expo-image-manipulator';\nimport { PDFDocument, StandardFonts, rgb } from 'pdf-lib';"
new = "import * as ImageManipulator from 'expo-image-manipulator';\nimport { Asset } from 'expo-asset';\nimport { PDFDocument, StandardFonts, rgb } from 'pdf-lib';"
if old not in s:
    raise SystemExit('import anchor not found')
s = s.replace(old, new, 1)

anchor = "const GREY = '#595959';\n"
assets = """const GREY = '#595959';

// Fichiers binaires embarques directement dans l'APK. Aucun visuel de rapport
// n'est stocke en Base64 dans le code JavaScript.
const REPORT_ASSET_MODULES = Object.freeze({
  cover: require('./assets/report/cover-building.png'),
  logo: require('./assets/report/brand-logo.png'),
  businessSpirals: [
    require('./assets/report/spiral-red-orange.jpg'),
    require('./assets/report/spiral-yellow-green.jpg'),
    require('./assets/report/spiral-green-red.jpg'),
    require('./assets/report/spiral-multicolor.jpg'),
  ],
  pageMark: require('./assets/report/spiral-multicolor.png'),
});
"""
if anchor not in s:
    raise SystemExit('asset constants anchor not found')
s = s.replace(anchor, assets, 1)

old = """function dataUriBase64(dataUri) {
  return String(dataUri || '').split(',')[1] || '';
}

async function habillerPdf(uriSource, config, siteFooter) {
"""
new = """function dataUriBase64(dataUri) {
  return String(dataUri || '').split(',')[1] || '';
}

async function lireAssetBinaire(moduleId) {
  const asset = Asset.fromModule(moduleId);
  if (!asset.localUri) await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  if (!uri) throw new Error('Asset de rapport introuvable dans le bundle Android.');
  const response = await fetch(uri);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function habillerPdf(uriSource, config, siteFooter) {
"""
if old not in s:
    raise SystemExit('helper anchor not found')
s = s.replace(old, new, 1)

old = """  const embedJpgSafe = async (base64) => {
    try { return base64 ? await pdf.embedJpg(base64) : null; } catch { return null; }
  };
  const coverLogoImage = await embedJpgSafe(dataUriBase64(REPORT_LOGO));
  const coverVisualImage = await embedJpgSafe(dataUriBase64(REPORT_COVER));
  const coverOpqibiImage = await embedJpgSafe(dataUriBase64(REPORT_OPQIBI));
  const pageMarkImage = await embedJpgSafe(REPORT_MARK_B64);
  const logo = coverLogoImage;
"""
new = """  const embedJpgSafe = async (base64) => {
    try { return base64 ? await pdf.embedJpg(base64) : null; } catch { return null; }
  };
  const embedBundledSafe = async (moduleId, format) => {
    try {
      const bytes = await lireAssetBinaire(moduleId);
      return format === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch (error) {
      console.warn('Impossible de charger un asset PDF embarque', error);
      return null;
    }
  };

  const [coverVisualImage, coverLogoImage, pageMarkImage, ...businessSpiralImages] = await Promise.all([
    embedBundledSafe(REPORT_ASSET_MODULES.cover, 'png'),
    embedBundledSafe(REPORT_ASSET_MODULES.logo, 'png'),
    embedBundledSafe(REPORT_ASSET_MODULES.pageMark, 'png'),
    ...REPORT_ASSET_MODULES.businessSpirals.map((moduleId) => embedBundledSafe(moduleId, 'jpg')),
  ]);
  const coverOpqibiImage = await embedJpgSafe(dataUriBase64(REPORT_OPQIBI));
"""
if old not in s:
    raise SystemExit('embed block not found')
s = s.replace(old, new, 1)

start = s.index("    if (index === 0) {\n")
end = s.index("      return;\n    }", start) + len("      return;\n    }")
old_cover = s[start:end]
new_cover = r'''    if (index === 0) {
      // La garde PDF est redessinee integralement avec pdf-lib. Le moteur HTML
      // ne participe plus au rendu des images de couverture.
      const orange = rgb(0.94, 0.45, 0.05);
      const grey = rgb(0.35, 0.35, 0.35);
      const dark = rgb(0.12, 0.12, 0.12);
      const white = rgb(1, 1, 1);
      page.drawRectangle({ x: 0, y: 0, width, height, color: white });

      if (coverLogoImage) {
        const sLogo = fit(coverLogoImage, mm(63), mm(18));
        page.drawImage(coverLogoImage, {
          x: mm(20),
          y: height - mm(14) - sLogo.height,
          width: sLogo.width,
          height: sLogo.height,
        });
      }

      const dateLine = `VERSAILLES, LE ${String(config.dateRapport ? dateFr(config.dateRapport) : dateFr(new Date().toISOString().slice(0, 10))).toUpperCase()}`;
      const dateSize = 7.2;
      const dateWidth = bold.widthOfTextAtSize(dateLine, dateSize);
      page.drawText(dateLine, {
        x: width - mm(19) - dateWidth,
        y: height - mm(25),
        size: dateSize,
        font: bold,
        color: dark,
      });

      page.drawText(`Nos réf. : ${config.chrono || ''}`, {
        x: mm(20),
        y: height - mm(48),
        size: 7.4,
        font: bold,
        color: dark,
      });
      page.drawLine({
        start: { x: mm(20), y: height - mm(49) },
        end: { x: mm(54), y: height - mm(49) },
        thickness: 0.6,
        color: dark,
      });

      const client = String(config.client || config.nomClient || config.clientNom || '').trim();
      const coverClient = client || String(config.titreClient || '').trim();
      const clientLabel = coverClient || String(config.site || '').trim() || 'Rapport de visite technique';
      const boxX = mm(28);
      const boxY = height - mm(82);
      const boxW = mm(153);
      const boxH = mm(20);
      const radius = boxH / 2;
      page.drawRectangle({ x: boxX + radius, y: boxY, width: boxW - 2 * radius, height: boxH, color: orange });
      page.drawCircle({ x: boxX + radius, y: boxY + radius, size: radius, color: orange });
      page.drawCircle({ x: boxX + boxW - radius, y: boxY + radius, size: radius, color: orange });
      let clientSize = 14.5;
      while (clientSize > 8 && bold.widthOfTextAtSize(clientLabel, clientSize) > boxW - mm(12)) clientSize -= 0.5;
      const clientWidth = bold.widthOfTextAtSize(clientLabel, clientSize);
      page.drawText(clientLabel, {
        x: boxX + (boxW - clientWidth) / 2,
        y: boxY + boxH / 2 - clientSize * 0.34,
        size: clientSize,
        font: bold,
        color: white,
      });

      if (coverVisualImage) {
        const sCover = fit(coverVisualImage, mm(140), mm(89));
        page.drawImage(coverVisualImage, {
          x: (width - sCover.width) / 2,
          y: height - mm(94) - sCover.height,
          width: sCover.width,
          height: sCover.height,
        });
      }

      const objectText = String(config.objet || 'Compte rendu de visite technique');
      let objectSize = 11.4;
      while (objectSize > 8 && bold.widthOfTextAtSize(objectText, objectSize) > mm(160)) objectSize -= 0.4;
      const objectWidth = bold.widthOfTextAtSize(objectText, objectSize);
      page.drawText(objectText, {
        x: (width - objectWidth) / 2,
        y: height - mm(190),
        size: objectSize,
        font: bold,
        color: dark,
      });

      const business = ['COPROPRIÉTÉS', 'BAILLEURS SOCIAUX', 'COLLECTIVITÉS', 'TERTIAIRE'];
      const businessY = height - mm(205);
      const businessSize = 5.2;
      const iconSize = mm(3.2);
      const gap = mm(1.1);
      const itemGap = mm(3.4);
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

      const cities = [
        ['VERSAILLES', true], ['NANTES', false], ['TOURS', false],
        ['RENNES', false], ['LYON', false], ['BORDEAUX', false],
      ];
      const citySize = 5.2;
      const cityGap = mm(4.1);
      const cityWidths = cities.map(([label]) => font.widthOfTextAtSize(label, citySize));
      const cityTotal = cityWidths.reduce((sum, value) => sum + value, 0) + cityGap * (cities.length - 1);
      let cityX = (width - cityTotal) / 2;
      cities.forEach(([label, active], i) => {
        page.drawText(label, { x: cityX, y: mm(25.5), size: citySize, font: active ? bold : font, color: active ? orange : grey });
        cityX += cityWidths[i] + cityGap;
      });

      const barY = mm(14.2);
      const barH = mm(7.7);
      const websiteW = mm(48);
      page.drawRectangle({ x: 0, y: barY, width: width - websiteW, height: barH, color: orange });
      page.drawRectangle({ x: width - websiteW, y: barY, width: websiteW, height: barH, color: grey });
      const contact = 'Tél. 01 39 55 17 20 - 21 avenue Georges Pompidou - 69486 LYON CEDEX 3 - contact@energieetservice.fr';
      let contactSize = 4.65;
      while (contactSize > 3.8 && font.widthOfTextAtSize(contact, contactSize) > width - websiteW - mm(8)) contactSize -= 0.15;
      page.drawText(contact, { x: mm(5), y: barY + mm(2.65), size: contactSize, font, color: white });
      const website = 'energieetservice.fr';
      const websiteSize = 8.2;
      const websiteTextW = bold.widthOfTextAtSize(website, websiteSize);
      page.drawText(website, { x: width - websiteW + (websiteW - websiteTextW) / 2, y: barY + mm(2.25), size: websiteSize, font: bold, color: white });

      if (coverOpqibiImage) {
        const sOpqibi = fit(coverOpqibiImage, mm(17), mm(7.5));
        page.drawImage(coverOpqibiImage, { x: mm(5), y: mm(4.5), width: sOpqibi.width, height: sOpqibi.height });
      }
      const legal = 'SAS au capital de 292 500 € - Siège social : 64 avenue de Paris - 78000 Versailles - RCS Versailles B 338 335 201 / NAF 7112B';
      let legalSize = 4.45;
      while (legalSize > 3.7 && font.widthOfTextAtSize(legal, legalSize) > width - mm(28)) legalSize -= 0.15;
      page.drawText(legal, { x: mm(25), y: mm(6.3), size: legalSize, font, color: grey });
      return;
    }'''
s = s[:start] + new_cover + s[end:]

# Le petit logo des pages interieures provient maintenant du PNG original Image20.
if "REPORT_MARK_B64" in s:
    s = s.replace("import REPORT_MARK_B64 from './reportAssetsExact/mark.js';\n", "", 1)

p.write_text(s, encoding='utf-8')

package_path = Path('package.json')
package = json.loads(package_path.read_text(encoding='utf-8'))
package.setdefault('dependencies', {})['expo-asset'] = '~10.0.10'
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('Direct bundled report assets integrated.')
