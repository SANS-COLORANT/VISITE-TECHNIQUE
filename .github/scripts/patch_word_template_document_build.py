from pathlib import Path

p = Path('wordDocxExporter.js')
s = p.read_text(encoding='utf-8')

old_document = r'''  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mo="http://schemas.microsoft.com/office/mac/office/2008/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:mv="urn:schemas-microsoft-com:mac:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" mc:Ignorable="w14 wp14"><w:body>${body.join('')}</w:body></w:document>`;
  const baseDocumentRels = await FileSystem.readAsStringAsync(`${wordRels}document.xml.rels`);
'''

new_document = r'''  // Keep the Office document shell produced by python-docx, but add the two
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
        if old_preserved not in s:
            raise SystemExit('Office document shell marker not found')
        s = s.replace(old_preserved, new_document, 1)

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

if new_validation not in s:
    if old_extended_validation in s:
        s = s.replace(old_extended_validation, new_validation, 1)
    elif old_validation in s:
        s = s.replace(old_validation, new_validation, 1)
    else:
        raise SystemExit('DOCX validation marker not found')

p.write_text(s, encoding='utf-8')
print('Word exporter preserves the Office shell, declares DrawingML namespaces and validates image relationships.')
