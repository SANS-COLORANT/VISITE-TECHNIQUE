from pathlib import Path


p = Path('wordDocxExporter.js')
s = p.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str):
    global s
    if new in s:
        return
    if old not in s:
        raise SystemExit(f'{label} marker not found')
    s = s.replace(old, new, 1)


# This patch deliberately runs LAST for the Word exporter, after the real DOCX,
# Android Base64 and METRA LAB health patches. It therefore validates the final
# package that will really be shipped in the APK.
replace_once(
    "import * as ImageManipulator from 'expo-image-manipulator';\n",
    "import * as ImageManipulator from 'expo-image-manipulator';\nimport { Asset } from 'expo-asset';\n",
    'expo asset import',
)
replace_once(
    "import { zip } from 'react-native-zip-archive';\n",
    "import { zip, unzip } from 'react-native-zip-archive';\n",
    'zip integrity import',
)
replace_once(
    "import { REPORT_COVER, REPORT_LOGO } from './reportBrandAssets.js';\n",
    "import { REPORT_COVER, REPORT_LOGO, REPORT_OPQIBI } from './reportBrandAssets.js';\n",
    'Word brand assets import',
)

old_esc = """const esc = (value = '') => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&apos;');
"""
new_esc = r'''const sanitizeXmlText = (value = '') => {
  const source = String(value ?? '');
  let out = '';
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (code === 0x09 || code === 0x0A || code === 0x0D || (code >= 0x20 && code <= 0xD7FF) || (code >= 0xE000 && code <= 0xFFFD)) {
      out += source[index];
      continue;
    }
    if (code >= 0xD800 && code <= 0xDBFF && index + 1 < source.length) {
      const low = source.charCodeAt(index + 1);
      if (low >= 0xDC00 && low <= 0xDFFF) {
        out += source[index] + source[index + 1];
        index += 1;
      }
    }
  }
  return out;
};
const esc = (value = '') => sanitizeXmlText(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&apos;');
'''
replace_once(old_esc, new_esc, 'XML sanitiser')
replace_once(
    "const cleanText = (value = '') => String(value ?? '').replace(/\\r/g, '').trim();\n",
    "const cleanText = (value = '') => sanitizeXmlText(value).replace(/\\r/g, '').trim();\n",
    'clean XML text helper',
)

asset_constants_marker = "export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';\n"
asset_constants = asset_constants_marker + """
const WORD_LOGO_ASSET = require('./assets/report/brand-logo.png');
const WORD_COVER_ASSET = require('./assets/report/cover-building.png');
"""
replace_once(asset_constants_marker, asset_constants, 'Word binary asset modules')

page_break_marker = """function pageBreak() {
  return '<w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>';
}
"""
page_break_new = page_break_marker + r'''
function shadedParagraph(text = '', { fill = 'F26426', color = 'FFFFFF', size = 22, align = 'center', before = 40, after = 80, bold = true } = {}) {
  const safe = esc(text);
  return `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="${before}" w:after="${after}"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/></w:pPr><w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:color w:val="${color}"/></w:rPr><w:t xml:space="preserve">${safe}</w:t></w:r></w:p>`;
}
'''
replace_once(page_break_marker, page_break_new, 'Word cover shaded paragraph')

prepare_photo_marker = "async function preparePhoto(photo, index) {\n"
asset_helpers = r'''async function bundledAssetBase64(moduleId, label) {
  try {
    const asset = Asset.fromModule(moduleId);
    await asset.downloadAsync();
    const uri = asset.localUri || asset.uri;
    if (!uri) throw new Error('URI locale introuvable');
    return normalizeBase64(
      await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }),
      label,
    );
  } catch (error) {
    console.warn(`Asset Word non lisible (${label})`, error);
    return '';
  }
}

async function prepareWordCoverSpec(config) {
  if (config?.coverUri) {
    try {
      const result = await ImageManipulator.manipulateAsync(
        config.coverUri,
        [{ resize: { width: 1600 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (result.base64) return { base64: result.base64, filename: 'cover.jpeg' };
    } catch (error) {
      console.warn('Couverture personnalisée Word non intégrée', error);
    }
  }

  const png = await bundledAssetBase64(WORD_COVER_ASSET, 'couverture Word PNG embarquée');
  if (png) return { base64: png, filename: 'cover.png' };
  const fallback = dataUriBase64(REPORT_COVER);
  return fallback ? { base64: fallback, filename: 'cover.jpeg' } : null;
}

'''
if 'async function bundledAssetBase64' not in s:
    if prepare_photo_marker not in s:
        raise SystemExit('Word photo helper marker not found')
    s = s.replace(prepare_photo_marker, asset_helpers + prepare_photo_marker, 1)

# Word must know both JPEG and PNG, because the fixed cover now comes from the
# exact binary PNG files bundled in assets/report instead of a JS data URI.
replace_once(
    '<Default Extension="jpeg" ContentType="image/jpeg"/>',
    '<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/>',
    'DOCX image content types',
)

create_marker = "async function createDocxPackage({ datas, config, photosConfig = [], title = null }) {\n"
integrity_helpers = r'''async function requireDocxFile(uri, label, minBytes = 1) {
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  if (!info?.exists) throw new Error(`DOCX invalide : ${label} absent.`);
  if (Number.isFinite(Number(info.size)) && Number(info.size) < minBytes) {
    throw new Error(`DOCX invalide : ${label} est vide (${info.size || 0} octet).`);
  }
  return info;
}

async function validateDocxPackage(zipUri, stamp, mediaFiles = []) {
  await requireDocxFile(zipUri, 'archive Word', 500);
  const verifyRoot = `${FileSystem.cacheDirectory}metra-docx-check-${stamp}/`;
  await FileSystem.deleteAsync(verifyRoot, { idempotent: true }).catch(() => {});
  await FileSystem.makeDirectoryAsync(verifyRoot, { intermediates: true });
  try {
    await unzip(nativePath(zipUri), nativePath(verifyRoot), 'UTF-8');
    const required = [
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
      'word/styles.xml',
      'word/_rels/document.xml.rels',
      'docProps/core.xml',
      'docProps/app.xml',
    ];
    for (const relative of required) await requireDocxFile(`${verifyRoot}${relative}`, relative, 20);
    for (const filename of mediaFiles.filter(Boolean)) {
      await requireDocxFile(`${verifyRoot}word/media/${filename}`, `word/media/${filename}`, 80);
    }
    const xml = await FileSystem.readAsStringAsync(`${verifyRoot}word/document.xml`);
    if (!xml.includes('<w:document') || !xml.includes('<w:body>') || !xml.includes('</w:document>')) {
      throw new Error('DOCX invalide : word/document.xml est incomplet.');
    }
    const relXml = await FileSystem.readAsStringAsync(`${verifyRoot}word/_rels/document.xml.rels`);
    if (!relXml.includes('relationships/styles')) throw new Error('DOCX invalide : relation de styles absente.');
    return verifyRoot;
  } catch (error) {
    await FileSystem.deleteAsync(verifyRoot, { idempotent: true }).catch(() => {});
    throw new Error(`Contrôle du fichier Word impossible : ${String(error?.message || error)}`);
  }
}

function base64ByteLength(value) {
  const base64 = String(value || '');
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

'''
if 'async function validateDocxPackage' not in s:
    if create_marker not in s:
        raise SystemExit('DOCX package creator marker not found')
    s = s.replace(create_marker, integrity_helpers + create_marker, 1)

old_brand = """  const logo = await addBase64Image(dataUriBase64(REPORT_LOGO), 'brand_logo.jpeg', 2500000, 650000, 'Energie & Service');
  const cover = await addBase64Image(dataUriBase64(REPORT_COVER), 'cover.jpeg', 5200000, 2850000, 'Couverture');
"""
new_brand = r'''  const exactLogo = await bundledAssetBase64(WORD_LOGO_ASSET, 'logo Word PNG embarqué');
  const logo = exactLogo
    ? await addBase64Image(exactLogo, 'brand_logo.png', 3300000, 860000, 'Energie & Service')
    : await addBase64Image(dataUriBase64(REPORT_LOGO), 'brand_logo.jpeg', 3300000, 860000, 'Energie & Service');
  const coverSpec = await prepareWordCoverSpec(config);
  const cover = coverSpec ? await addBase64Image(coverSpec.base64, coverSpec.filename, 5400000, 3050000, 'Couverture') : null;
  const opqibi = await addBase64Image(dataUriBase64(REPORT_OPQIBI), 'opqibi.jpeg', 1250000, 800000, 'Qualifications et certifications');
'''
replace_once(old_brand, new_brand, 'exact Word cover media')

old_cover_body = """  if (logo) body.push(imageParagraph(logo.relId, logo.widthEmu, logo.heightEmu, logo.docPrId, logo.filename, 'left'));
  body.push(paragraph(client, { bold: true, size: 38, color: 'F26426', align: 'center', before: 220, after: 140 }));
  body.push(paragraph(documentTitle, { bold: true, size: 28, align: 'center', after: 90 }));
  body.push(paragraph(`Date du rapport : ${dateFr(config.dateRapport || new Date().toISOString().slice(0, 10))}`, { size: 18, align: 'center', after: 50 }));
  if (config.chrono) body.push(paragraph(`Référence : ${config.chrono}`, { size: 18, align: 'center', after: 100 }));
  if (cover) body.push(imageParagraph(cover.relId, cover.widthEmu, cover.heightEmu, cover.docPrId, cover.filename));
  body.push(pageBreak());
"""
new_cover_body = r'''  if (logo) body.push(imageParagraph(logo.relId, logo.widthEmu, logo.heightEmu, logo.docPrId, logo.filename, 'left'));
  body.push(paragraph(`VERSAILLES, le ${dateFr(config.dateRapport || new Date().toISOString().slice(0, 10))}`, { size: 18, align: 'right', before: 20, after: 70 }));
  if (config.chrono) body.push(paragraph(`Nos réf. : ${config.chrono}`, { bold: true, size: 18, align: 'left', after: 90 }));
  body.push(shadedParagraph(client, { size: 30, before: 40, after: 100 }));
  if (cover) body.push(imageParagraph(cover.relId, cover.widthEmu, cover.heightEmu, cover.docPrId, cover.filename));
  body.push(paragraph(documentTitle, { bold: true, size: 28, align: 'center', before: 80, after: 100 }));
  body.push(paragraph('● COPROPRIÉTÉS     ● BAILLEURS SOCIAUX     ● COLLECTIVITÉS     ● TERTIAIRE', { bold: true, size: 15, color: '595959', align: 'center', after: 70 }));
  body.push(paragraph('PARIS   NANTES   TOURS   RENNES   BORDEAUX   LYON   CHERBOURG   NÎMES', { bold: true, size: 13, color: '666666', align: 'center', after: 50 }));
  body.push(shadedParagraph('Tél. 01 39 55 17 20  ·  143 rue Yves Le Coz - 78000 VERSAILLES  ·  contact.versailles@energieetservice.fr  ·  energieetservice.fr', { size: 13, before: 20, after: 55 }));
  if (opqibi) body.push(imageParagraph(opqibi.relId, opqibi.widthEmu, opqibi.heightEmu, opqibi.docPrId, opqibi.filename, 'left'));
  body.push(paragraph('SAS au capital de 292 500 € - Siège social : 143 rue Yves Le Coz - 78000 Versailles - RCS Versailles B 338 335 201 / NAF 7112B', { size: 11, color: '777777', align: 'left', after: 30 }));
  body.push(pageBreak());
'''
replace_once(old_cover_body, new_cover_body, 'Word cover layout')

old_zip = """  const zipUri = `${FileSystem.cacheDirectory}METRA_${stamp}.docx`;
  await zip(nativePath(root), nativePath(zipUri));
  return { root, zipUri };
"""
new_zip = r'''  const zipUri = `${FileSystem.cacheDirectory}METRA_${stamp}.docx`;
  await zip(nativePath(root), nativePath(zipUri));
  const verifyRoot = await validateDocxPackage(
    zipUri,
    stamp,
    [logo?.filename, cover?.filename, opqibi?.filename],
  );
  return { root, zipUri, verifyRoot };
'''
replace_once(old_zip, new_zip, 'DOCX post-zip validation')

# This marker is the final exporter after patch_word_base64_android_build.py.
old_write = """    const base64 = normalizeBase64(
      await FileSystem.readAsStringAsync(pack.zipUri, { encoding: FileSystem.EncodingType.Base64 }),
      'package DOCX',
    );
    const destination = await SAF.createFileAsync(dossier, nom, MIME_DOCX);
    await writeBase64Async(destination, base64, 'fichier DOCX final');
    return destination;
"""
new_write = r'''    const base64 = normalizeBase64(
      await FileSystem.readAsStringAsync(pack.zipUri, { encoding: FileSystem.EncodingType.Base64 }),
      'package DOCX',
    );
    if (!base64.startsWith('UEs')) throw new Error('DOCX invalide : signature ZIP PK absente.');

    // Expo SAF documents createFileAsync with a display name WITHOUT extension.
    // The Android provider adds the extension from the DOCX MIME type.
    const safName = String(nom || 'Rapport_METRA.docx').replace(/\.docx$/i, '') || 'Rapport_METRA';
    const destination = await SAF.createFileAsync(dossier, safName, MIME_DOCX);
    try {
      if (typeof SAF.writeAsStringAsync === 'function') {
        await SAF.writeAsStringAsync(destination, base64, { encoding: FileSystem.EncodingType.Base64 });
      } else {
        await writeBase64Async(destination, base64, 'fichier DOCX final');
      }
    } catch (error) {
      throw new Error(`Export Word — écriture Android impossible : ${String(error?.message || error)}`);
    }

    const expectedBytes = base64ByteLength(base64);
    const savedInfo = await FileSystem.getInfoAsync(destination, { size: true });
    if (!savedInfo?.exists) throw new Error('Export Word — le fichier final est introuvable après écriture.');
    if (Number.isFinite(Number(savedInfo.size)) && Number(savedInfo.size) > 0 && Math.abs(Number(savedInfo.size) - expectedBytes) > 2) {
      throw new Error(`Export Word — écriture incomplète (${savedInfo.size} octets enregistrés sur ${expectedBytes}).`);
    }

    // For ordinary reports, reread the SAF document to detect corruption before
    // telling the user that the export succeeded. Large reports use the byte-size
    // validation above to avoid doubling memory consumption.
    if (expectedBytes > 0 && expectedBytes <= 8 * 1024 * 1024) {
      const savedBase64 = normalizeBase64(
        await SAF.readAsStringAsync(destination, { encoding: FileSystem.EncodingType.Base64 }),
        'DOCX relu sur Android',
      );
      const headOk = savedBase64.slice(0, 256) === base64.slice(0, 256);
      const tailOk = savedBase64.slice(-256) === base64.slice(-256);
      if (savedBase64.length !== base64.length || !headOk || !tailOk) {
        throw new Error('Export Word — le fichier relu diffère du DOCX généré.');
      }
    }
    return destination;
'''
replace_once(old_write, new_write, 'verified Android DOCX write')

old_cleanup = """  } finally {
    await FileSystem.deleteAsync(pack.root, { idempotent: true }).catch(() => {});
    await FileSystem.deleteAsync(pack.zipUri, { idempotent: true }).catch(() => {});
  }
"""
new_cleanup = """  } finally {
    if (pack.verifyRoot) await FileSystem.deleteAsync(pack.verifyRoot, { idempotent: true }).catch(() => {});
    await FileSystem.deleteAsync(pack.root, { idempotent: true }).catch(() => {});
    await FileSystem.deleteAsync(pack.zipUri, { idempotent: true }).catch(() => {});
  }
"""
replace_once(old_cleanup, new_cleanup, 'DOCX validation cleanup')

p.write_text(s, encoding='utf-8')
print('DOCX integrity validation, XML sanitising and exact Word cover assets installed.')
