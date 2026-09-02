from pathlib import Path
import re

p = Path('wordDocxExporter.js')
s = p.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str):
    global s
    if new in s:
        return
    if old not in s:
        raise SystemExit(f'{label} marker not found')
    s = s.replace(old, new, 1)


def replace_function(name: str, next_name: str, new_function: str):
    global s
    pattern = re.compile(
        rf"function {re.escape(name)}\([^\n]*\) \{{[\s\S]*?\n\}}\n\nfunction {re.escape(next_name)}\(",
        re.MULTILINE,
    )
    match = pattern.search(s)
    if not match:
        raise SystemExit(f'Function {name} marker not found')
    s = s[:match.start()] + new_function.rstrip() + f"\n\nfunction {next_name}(" + s[match.end():]


# ---------------------------------------------------------------------------
# Typography and table system
# ---------------------------------------------------------------------------
replace_function(
    'paragraph',
    'pageBreak',
    r'''function paragraph(text = '', { bold = false, size = 20, color = '1A1A18', align = 'left', after = 100, before = 0, pageBreakBefore = false, keepNext = false, keepLines = false } = {}) {
  const flow = `${pageBreakBefore ? '<w:pageBreakBefore/>' : ''}${keepNext ? '<w:keepNext/>' : ''}${keepLines ? '<w:keepLines/>' : ''}`;
  return `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="${before}" w:after="${after}"/>${flow}</w:pPr>${run(text, { bold, size, color })}</w:p>`;
}''',
)

replace_function(
    'cell',
    'table',
    r'''function cell(text, { bold = false, width = 2400, shade = null, align = 'left', fontSize = 18 } = {}) {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : ''}<w:vAlign w:val="center"/><w:tcMar><w:top w:w="70" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr>${paragraph(cleanText(text) || '/', { bold, size: fontSize, align, after: 0, keepLines: true })}</w:tc>`;
}''',
)

replace_function(
    'table',
    'imageParagraph',
    r'''function table(rows, widths = [], { fontSize = 18, headerFontSize = null } = {}) {
  const borders = '<w:tblBorders><w:top w:val="single" w:sz="5" w:color="888888"/><w:left w:val="single" w:sz="5" w:color="888888"/><w:bottom w:val="single" w:sz="5" w:color="888888"/><w:right w:val="single" w:sz="5" w:color="888888"/><w:insideH w:val="single" w:sz="4" w:color="B5B5B5"/><w:insideV w:val="single" w:sz="4" w:color="B5B5B5"/></w:tblBorders>';
  const totalWidth = widths.reduce((sum, width) => sum + Number(width || 0), 0) || 10200;
  const body = rows.map((row, rowIndex) => {
    const rowProps = `<w:trPr>${rowIndex === 0 ? '<w:tblHeader w:val="true"/>' : ''}<w:cantSplit/></w:trPr>`;
    const cells = row.map((value, index) => cell(value, {
      bold: rowIndex === 0,
      width: widths[index] || Math.floor(totalWidth / Math.max(1, row.length)),
      shade: rowIndex === 0 ? 'F4E5D8' : null,
      align: index === 1 || (row.length === 6 && index === 5) ? 'center' : 'left',
      fontSize: rowIndex === 0 ? (headerFontSize || fontSize) : fontSize,
    })).join('');
    return `<w:tr>${rowProps}${cells}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${totalWidth}" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/>${borders}</w:tblPr><w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${body}</w:tbl>${paragraph('', { after: 70 })}`;
}''',
)

# ---------------------------------------------------------------------------
# Site hierarchy and full-width tables
# ---------------------------------------------------------------------------
replacements = {
    "out.push(paragraph(site, { bold: true, size: 34, color: 'F26426', align: 'center', before: 100, after: 80 }));":
        "out.push(paragraph(site, { bold: true, size: 34, color: 'F26426', align: 'center', before: 70, after: 45, keepNext: true, keepLines: true }));",
    "out.push(paragraph(local, { bold: true, size: 25, align: 'center', after: 180 }));":
        "out.push(paragraph(local, { bold: true, size: 25, align: 'center', after: 110, keepNext: true, keepLines: true }));",
    "if (section.title) out.push(paragraph(section.title, { bold: true, size: 25, color: 'F26426', align: 'center', before: 130, after: 100, pageBreakBefore: section.breakBefore === true }));":
        "if (section.title) out.push(paragraph(section.title, { bold: true, size: 25, color: 'F26426', align: 'center', before: 105, after: 65, pageBreakBefore: section.breakBefore === true, keepNext: true, keepLines: true }));",
    "out.push(paragraph(group.title || '', { bold: true, size: 21, align: 'center', before: 80, after: 70 }));":
        "out.push(paragraph(group.title || '', { bold: true, size: 21, align: 'center', before: 65, after: 45, keepNext: true, keepLines: true }));",
    "out.push(table([['Intitulé', 'Avis', 'Commentaire'], ...rows], [3300, 900, 4700]));":
        "out.push(table([['Intitulé', 'Avis', 'Commentaire'], ...rows], [3600, 1000, 5600], { fontSize: 18, headerFontSize: 18 }));",
    "out.push(table([['Poste', 'Prestation', 'Date'], ...(data.remarques || []).map((item) => [item.poste || 'Remarque', item.prestation || '', dateFr(item.cree_le)])], [2500, 5000, 1400]));":
        "out.push(table([['Poste', 'Prestation', 'Date'], ...(data.remarques || []).map((item) => [item.poste || 'Remarque', item.prestation || '', dateFr(item.cree_le)])], [2400, 6200, 1600], { fontSize: 17, headerFontSize: 18 }));",
    "out.push(table([['Catégorie', 'Nb', 'Désignation', 'Marque', 'Modèle', 'Année'], ...(data.materiel || []).map((item) => [item.categorie || '', item.nombre || 1, item.designation || '', item.marque || '', item.modele || '', item.annee || ''])], [1500, 650, 2500, 1500, 1800, 800]));":
        "out.push(table([['Catégorie', 'Nb', 'Désignation', 'Marque', 'Modèle', 'Année'], ...(data.materiel || []).map((item) => [item.categorie || '', item.nombre || 1, item.designation || '', item.marque || '', item.modele || '', item.annee || ''])], [1700, 650, 2650, 1700, 2500, 1000], { fontSize: 15, headerFontSize: 16 }));",
    "out.push(table([['Indicateur', 'Indice'], ...HEALTH_DIMENSIONS.map((dimension) => [dimension.label, docxHealthText(health.scores?.[dimension.key])])], [6500, 2200]));":
        "out.push(table([['Indicateur', 'Indice'], ...HEALTH_DIMENSIONS.map((dimension) => [dimension.label, docxHealthText(health.scores?.[dimension.key])])], [7600, 2600], { fontSize: 18, headerFontSize: 18 }));",
    "out.push(table([['Site', 'Indice', 'État'], ...items.map((item) => [item.siteName || 'Site', docxHealthText(item.overall), item.level?.label || 'Données insuffisantes'])], [4300, 1900, 2500]));":
        "out.push(table([['Site', 'Indice', 'État'], ...items.map((item) => [item.siteName || 'Site', docxHealthText(item.overall), item.level?.label || 'Données insuffisantes'])], [5000, 2000, 3200], { fontSize: 18, headerFontSize: 18 }));",
}
for old, new in replacements.items():
    if old in s:
        s = s.replace(old, new, 1)
    elif new not in s:
        # Health blocks are optional depending on feature patch order; all core
        # report layout markers are mandatory.
        if 'HEALTH_DIMENSIONS' not in old and "items.map" not in old:
            raise SystemExit(f'Word layout marker not found: {old[:80]}')

# ---------------------------------------------------------------------------
# Cover: keep the useful report information in the body and move corporate
# footer content into the real first-page footer from the Office skeleton.
# ---------------------------------------------------------------------------
cover_start = s.find("  if (logo) body.push(imageParagraph(logo.relId, logo.widthEmu, logo.heightEmu, logo.docPrId, logo.filename, 'left'));")
if cover_start < 0:
    raise SystemExit('Word cover start marker not found')
cover_end_marker = "  body.push(pageBreak());"
cover_end = s.find(cover_end_marker, cover_start)
if cover_end < 0:
    raise SystemExit('Word cover end marker not found')
cover_end += len(cover_end_marker)
new_cover = r'''  if (logo) body.push(imageParagraph(logo.relId, logo.widthEmu, logo.heightEmu, logo.docPrId, logo.filename, 'left'));
  body.push(paragraph(`VERSAILLES, le ${dateFr(config.dateRapport || new Date().toISOString().slice(0, 10))}`, { size: 18, align: 'right', before: 10, after: 45 }));
  if (config.chrono) body.push(paragraph(`Nos réf. : ${config.chrono}`, { bold: true, size: 17, align: 'left', after: 55 }));
  body.push(shadedParagraph(client, { size: 30, before: 20, after: 80 }));
  if (cover) body.push(imageParagraph(cover.relId, cover.widthEmu, cover.heightEmu, cover.docPrId, cover.filename));
  body.push(paragraph(documentTitle, { bold: true, size: 28, align: 'center', before: 55, after: 55, keepNext: true }));
  body.push(paragraph('● COPROPRIÉTÉS     ● BAILLEURS SOCIAUX     ● COLLECTIVITÉS     ● TERTIAIRE', { bold: true, size: 15, color: 'F26426', align: 'center', after: 20 }));
  body.push(pageBreak());'''
s = s[:cover_start] + new_cover + s[cover_end:]

# ---------------------------------------------------------------------------
# Reuse the section properties from the standards-compliant skeleton. They carry
# A4 margins plus first/default headers and footers. The previous hand-written
# sectPr discarded those relationships and could never place corporate furniture
# at the true page edges.
# ---------------------------------------------------------------------------
old_document = r'''  if (!/<w:body(?:\s[^>]*)?>[\s\S]*<\/w:body>/.test(baseDocumentXml)) {
    throw new Error('Gabarit Word invalide : corps document.xml absent.');
  }
  const documentXml = baseDocumentXml.replace(
    /<w:body(?:\s[^>]*)?>[\s\S]*<\/w:body>/,
    `<w:body>${body.join('')}</w:body>`,
  );
  const baseDocumentRels = await FileSystem.readAsStringAsync(`${wordRels}document.xml.rels`);
'''
new_document = r'''  if (!/<w:body(?:\s[^>]*)?>[\s\S]*<\/w:body>/.test(baseDocumentXml)) {
    throw new Error('Gabarit Word invalide : corps document.xml absent.');
  }
  const baseSectMatch = baseDocumentXml.match(/<w:sectPr(?:\s[^>]*)?>[\s\S]*?<\/w:sectPr>/);
  if (!baseSectMatch) throw new Error('Gabarit Word invalide : section A4 avec en-tête/pied de page absente.');
  const dynamicBodyXml = body.join('').replace(/<w:sectPr(?:\s[^>]*)?>[\s\S]*?<\/w:sectPr>/g, '') + baseSectMatch[0];
  const documentXml = baseDocumentXml.replace(
    /<w:body(?:\s[^>]*)?>[\s\S]*<\/w:body>/,
    `<w:body>${dynamicBodyXml}</w:body>`,
  );
  const baseDocumentRels = await FileSystem.readAsStringAsync(`${wordRels}document.xml.rels`);
'''
replace_once(old_document, new_document, 'Office section properties reuse')

# The package validator now requires the branded header/footer parts as well.
old_required = """      'word/theme/theme1.xml',
      'word/_rels/document.xml.rels',
"""
new_required = """      'word/theme/theme1.xml',
      'word/header1.xml',
      'word/header2.xml',
      'word/footer1.xml',
      'word/footer2.xml',
      'word/_rels/document.xml.rels',
"""
replace_once(old_required, new_required, 'Word header/footer package validation')

old_section_validation = "    if (!xml.includes('<w:sectPr')) throw new Error('DOCX invalide : propriétés de section absentes.');\n"
new_section_validation = old_section_validation + "    if (!xml.includes('<w:headerReference') || !xml.includes('<w:footerReference') || !xml.includes('<w:titlePg')) throw new Error('DOCX invalide : en-tête/pied de page Office absent.');\n"
replace_once(old_section_validation, new_section_validation, 'Word header/footer relationship validation')

s += "\n// METRA_WORD_LAYOUT_POLISH\n"
p.write_text(s, encoding='utf-8')
print('Word layout polished: branded header/footer, full-width tables, repeated headers and stable page flow.')
