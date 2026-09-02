from pathlib import Path

p = Path('wordDocxExporter.js')
s = p.read_text(encoding='utf-8')

old_document = r'''  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mo="http://schemas.microsoft.com/office/mac/office/2008/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:mv="urn:schemas-microsoft-com:mac:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" mc:Ignorable="w14 wp14"><w:body>${body.join('')}</w:body></w:document>`;
  const baseDocumentRels = await FileSystem.readAsStringAsync(`${wordRels}document.xml.rels`);
'''

new_document = r'''  // Keep the Office document shell produced by python-docx, but add every
  // DrawingML namespace used by METRA's picture markup. A blank python-docx
  // document does not declare these namespaces because it contains no picture.
  let baseDocumentXml = await FileSystem.readAsStringAsync(`${word}document.xml`);
  if (!baseDocumentXml.includes('xmlns:a=')) {
    baseDocumentXml = baseDocumentXml.replace(
      '<w:document ',
      '<w:document xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ',
    );
  }
  if (!baseDocumentXml.includes('xmlns:pic=')) {
    baseDocumentXml = baseDocumentXml.replace(
      '<w:document ',
      '<w:document xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ',
    );
  }
  if (!baseDocumentXml.includes('xmlns:wp=')) {
    baseDocumentXml = baseDocumentXml.replace(
      '<w:document ',
      '<w:document xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ',
    );
  }
  if (!/<w:body(?:\s[^>]*)?>[\s\S]*<\/w:body>/.test(baseDocumentXml)) {
    throw new Error('Gabarit Word invalide : corps document.xml absent.');
  }
  const documentXml = baseDocumentXml.replace(
    /<w:body(?:\s[^>]*)?>[\s\S]*<\/w:body>/,
    `<w:body>${body.join('')}</w:body>`,
  );
  const baseDocumentRels = await FileSystem.readAsStringAsync(`${wordRels}document.xml.rels`);
'''

if new_document not in s:
    if old_document in s:
        s = s.replace(old_document, new_document, 1)
    else:
        old_preserved = r'''  // Do not rebuild the w:document shell by hand. Word for Android is stricter
  // than desktop ZIP readers about the exact namespaces/compatibility metadata.
  // Keep the document.xml produced by python-docx and replace only its body.
  const baseDocumentXml = await FileSystem.readAsStringAsync(`${word}document.xml`);
  if (!/<w:body(?:\s[^>]*)?>[\s\S]*<\/w:body>/.test(baseDocumentXml)) {
    throw new Error('Gabarit Word invalide : corps document.xml absent.');
  }
  const documentXml = baseDocumentXml.replace(
    /<w:body(?:\s[^>]*)?>[\s\S]*<\/w:body>/,
    `<w:body>${body.join('')}</w:body>`,
  );
  const baseDocumentRels = await FileSystem.readAsStringAsync(`${wordRels}document.xml.rels`);
'''
        old_namespaced = r'''  // Keep the Office document shell produced by python-docx, but add the two
  // DrawingML namespaces used by METRA's image markup. A blank python-docx
  // document does not declare them because it contains no picture. Injecting
  // <a:...> / <pic:...> without these declarations creates malformed XML that
  // Word (including Word Android) refuses to open.
  let baseDocumentXml = await FileSystem.readAsStringAsync(`${word}document.xml`);
  if (!baseDocumentXml.includes('xmlns:a=')) {
    baseDocumentXml = baseDocumentXml.replace(
      '<w:document ',
      '<w:document xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ',
    );
  }
  if (!baseDocumentXml.includes('xmlns:pic=')) {
    baseDocumentXml = baseDocumentXml.replace(
      '<w:document ',
      '<w:document xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ',
    );
  }
  if (!/<w:body(?:\s[^>]*)?>[\s\S]*<\/w:body>/.test(baseDocumentXml)) {
    throw new Error('Gabarit Word invalide : corps document.xml absent.');
  }
  const documentXml = baseDocumentXml.replace(
    /<w:body(?:\s[^>]*)?>[\s\S]*<\/w:body>/,
    `<w:body>${body.join('')}</w:body>`,
  );
  const baseDocumentRels = await FileSystem.readAsStringAsync(`${wordRels}document.xml.rels`);
'''
        if old_namespaced in s:
            s = s.replace(old_namespaced, new_document, 1)
        elif old_preserved in s:
            s = s.replace(old_preserved, new_document, 1)
        else:
            raise SystemExit('Office document shell marker not found')

old_validation = r'''    const relXml = await FileSystem.readAsStringAsync(`${verifyRoot}word/_rels/document.xml.rels`);
    if (!relXml.includes('relationships/styles')) throw new Error('DOCX invalide : relation de styles absente.');
    return verifyRoot;
'''

new_validation = r'''    const relXml = await FileSystem.readAsStringAsync(`${verifyRoot}word/_rels/document.xml.rels`);
    if (!relXml.includes('relationships/styles')) throw new Error('DOCX invalide : relation de styles absente.');
    if (!xml.includes('<w:sectPr')) throw new Error('DOCX invalide : propriétés de section absentes.');
    if ((xml.includes('<a:') || xml.includes('</a:')) && !xml.includes('xmlns:a=')) {
      throw new Error('DOCX invalide : espace de noms DrawingML a absent.');
    }
    if ((xml.includes('<pic:') || xml.includes('</pic:')) && !xml.includes('xmlns:pic=')) {
      throw new Error('DOCX invalide : espace de noms DrawingML pic absent.');
    }
    if ((xml.includes('<wp:') || xml.includes('</wp:')) && !xml.includes('xmlns:wp=')) {
      throw new Error('DOCX invalide : espace de noms DrawingML wp absent.');
    }
    const embeddedIds = [...xml.matchAll(/r:embed="([^"]+)"/g)].map((match) => match[1]);
    for (const relId of embeddedIds) {
      const escaped = relId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp(`Id="${escaped}"`).test(relXml)) {
        throw new Error(`DOCX invalide : relation image ${relId} absente.`);
      }
    }
    return verifyRoot;
'''

old_extended_validation = r'''    const relXml = await FileSystem.readAsStringAsync(`${verifyRoot}word/_rels/document.xml.rels`);
    if (!relXml.includes('relationships/styles')) throw new Error('DOCX invalide : relation de styles absente.');
    if (!xml.includes('<w:sectPr')) throw new Error('DOCX invalide : propriétés de section absentes.');
    const embeddedIds = [...xml.matchAll(/r:embed="([^"]+)"/g)].map((match) => match[1]);
    for (const relId of embeddedIds) {
      const escaped = relId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp(`Id="${escaped}"`).test(relXml)) {
        throw new Error(`DOCX invalide : relation image ${relId} absente.`);
      }
    }
    return verifyRoot;
'''

old_namespaced_validation = r'''    const relXml = await FileSystem.readAsStringAsync(`${verifyRoot}word/_rels/document.xml.rels`);
    if (!relXml.includes('relationships/styles')) throw new Error('DOCX invalide : relation de styles absente.');
    if (!xml.includes('<w:sectPr')) throw new Error('DOCX invalide : propriétés de section absentes.');
    if ((xml.includes('<a:') || xml.includes('</a:')) && !xml.includes('xmlns:a=')) {
      throw new Error('DOCX invalide : espace de noms DrawingML a absent.');
    }
    if ((xml.includes('<pic:') || xml.includes('</pic:')) && !xml.includes('xmlns:pic=')) {
      throw new Error('DOCX invalide : espace de noms DrawingML pic absent.');
    }
    const embeddedIds = [...xml.matchAll(/r:embed="([^"]+)"/g)].map((match) => match[1]);
    for (const relId of embeddedIds) {
      const escaped = relId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp(`Id="${escaped}"`).test(relXml)) {
        throw new Error(`DOCX invalide : relation image ${relId} absente.`);
      }
    }
    return verifyRoot;
'''

if new_validation not in s:
    if old_namespaced_validation in s:
        s = s.replace(old_namespaced_validation, new_validation, 1)
    elif old_extended_validation in s:
        s = s.replace(old_extended_validation, new_validation, 1)
    elif old_validation in s:
        s = s.replace(old_validation, new_validation, 1)
    else:
        raise SystemExit('DOCX validation marker not found')

# The historical REPORT_* JPEG data-URIs used by the Word exporter are actually
# truncated: the generated files start with a JPEG header but contain no FFD9
# end-of-image marker. Word shows "The picture can't be displayed" and can reject
# the whole DOCX. The PDF pipeline already creates exact base64 constants from
# untouched assets/report files, so Word must use the same exact PNG bytes.
exact_import = "import { EXACT_COVER, EXACT_LOGO, EXACT_FOOTER_CERT } from './reportExactAssets.generated.js';\n"
if exact_import not in s:
    marker = "import { WORD_DOCX_TEMPLATE_BASE64 } from './wordDocxTemplate.generated.js';\n"
    if marker not in s:
        raise SystemExit('Exact Word asset import marker not found')
    s = s.replace(marker, marker + exact_import, 1)

old_cover_fallback = r'''  const png = await bundledAssetBase64(WORD_COVER_ASSET, 'couverture Word PNG embarquée');
  if (png) return { base64: png, filename: 'cover.png' };
  const fallback = dataUriBase64(REPORT_COVER);
  return fallback ? { base64: fallback, filename: 'cover.jpeg' } : null;
'''
new_cover_fallback = r'''  const png = normalizeBase64(EXACT_COVER, 'couverture Word PNG exacte');
  if (!png || !png.startsWith('iVBORw0KGgo')) {
    throw new Error('Couverture Word invalide : PNG exact absent ou corrompu.');
  }
  return { base64: png, filename: 'cover.png' };
'''
if new_cover_fallback not in s:
    if old_cover_fallback not in s:
        raise SystemExit('Word cover fallback marker not found')
    s = s.replace(old_cover_fallback, new_cover_fallback, 1)

old_brand = r'''  const exactLogo = await bundledAssetBase64(WORD_LOGO_ASSET, 'logo Word PNG embarqué');
  const logo = exactLogo
    ? await addBase64Image(exactLogo, 'brand_logo.png', 3300000, 860000, 'Energie & Service')
    : await addBase64Image(dataUriBase64(REPORT_LOGO), 'brand_logo.jpeg', 3300000, 860000, 'Energie & Service');
  const coverSpec = await prepareWordCoverSpec(config);
  const cover = coverSpec ? await addBase64Image(coverSpec.base64, coverSpec.filename, 5400000, 3050000, 'Couverture') : null;
  const opqibi = await addBase64Image(dataUriBase64(REPORT_OPQIBI), 'opqibi.jpeg', 1250000, 800000, 'Qualifications et certifications');
'''
new_brand = r'''  const exactLogo = normalizeBase64(EXACT_LOGO, 'logo Word PNG exact');
  if (!exactLogo || !exactLogo.startsWith('iVBORw0KGgo')) {
    throw new Error('Logo Word invalide : PNG exact absent ou corrompu.');
  }
  const logo = await addBase64Image(exactLogo, 'brand_logo.png', 3300000, 860000, 'Energie & Service');
  const coverSpec = await prepareWordCoverSpec(config);
  const cover = coverSpec ? await addBase64Image(coverSpec.base64, coverSpec.filename, 5400000, 3050000, 'Couverture') : null;
  const exactOpqibi = normalizeBase64(EXACT_FOOTER_CERT, 'certifications Word PNG exactes');
  if (!exactOpqibi || !exactOpqibi.startsWith('iVBORw0KGgo')) {
    throw new Error('Certifications Word invalides : PNG exact absent ou corrompu.');
  }
  const opqibi = await addBase64Image(exactOpqibi, 'opqibi.png', 1250000, 800000, 'Qualifications et certifications');
'''
if new_brand not in s:
    if old_brand not in s:
        raise SystemExit('Exact Word brand media marker not found')
    s = s.replace(old_brand, new_brand, 1)

p.write_text(s, encoding='utf-8')
print('Word exporter preserves Office XML namespaces and embeds only complete exact PNG branding assets.')
