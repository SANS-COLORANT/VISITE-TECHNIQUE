from pathlib import Path

p = Path('reportBuilder.js')
s = p.read_text(encoding='utf-8')

# This patch is deliberately Word-only. The native PDF drawing code and all
# source files in assets/report remain untouched.
marker = "function wordInteriorDecor(config, siteFooter) {\n"
if marker not in s:
    raise SystemExit('wordInteriorDecor marker not found')

if 'function wordCoverHtml(' not in s:
    word_cover = r'''function wordCoverHtml(client, dateRapport, config) {
  const img = (base64Value, mime, widthMm, alt = '') => `<img src="data:image/${mime};base64,${base64Value}" alt="${esc(alt)}" style="display:block;border:0;width:${widthMm}mm;height:auto;"/>`;
  const business = [
    [EXACT_SPIRAL_1, 'COPROPRIÉTÉS'],
    [EXACT_SPIRAL_2, 'BAILLEURS SOCIAUX'],
    [EXACT_SPIRAL_3, 'COLLECTIVITÉS'],
    [EXACT_SPIRAL_4, 'TERTIAIRE'],
  ];
  const businessHtml = business.map(([image, label]) => `<td style="width:25%;text-align:center;vertical-align:middle;padding:0 1mm;font-size:6.7pt;font-weight:bold;color:#555;white-space:nowrap;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td style="vertical-align:middle;padding-right:1mm;">${img(image, 'jpeg', 5.2, label)}</td><td style="vertical-align:middle;white-space:nowrap;">${esc(label)}</td></tr></table></td>`).join('');

  return `<div class="wordCover" style="width:174mm;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#111;page-break-after:always;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:174mm;border-collapse:collapse;table-layout:fixed;">
      <tr><td colspan="4" style="height:25mm;vertical-align:top;padding:0;">${img(EXACT_LOGO, 'png', 86, 'Energie & Service')}</td></tr>
      <tr><td colspan="4" style="height:7mm;text-align:right;vertical-align:middle;font-size:10pt;text-transform:uppercase;padding:0 1mm 0 0;">VERSAILLES, le ${esc(dateRapport)}</td></tr>
      <tr><td colspan="4" style="height:8mm;text-align:left;vertical-align:middle;font-size:9pt;font-weight:bold;text-decoration:underline;padding:0 0 0 12mm;">Nos réf. : ${esc(config.chrono || '')}</td></tr>
      <tr><td colspan="4" style="height:4mm;font-size:1pt;">&nbsp;</td></tr>
      <tr><td style="width:12mm;">&nbsp;</td><td colspan="2" style="height:18mm;background:#F07E31;color:#fff;text-align:center;vertical-align:middle;font-size:16pt;font-weight:bold;padding:0 4mm;">${esc(client)}</td><td style="width:12mm;">&nbsp;</td></tr>
      <tr><td colspan="4" style="height:6mm;font-size:1pt;">&nbsp;</td></tr>
      <tr><td colspan="4" style="text-align:center;vertical-align:middle;padding:0;">${img(EXACT_COVER, 'png', 148, 'Couverture du rapport')}</td></tr>
      <tr><td colspan="4" style="height:8mm;font-size:1pt;">&nbsp;</td></tr>
      <tr><td colspan="4" style="text-align:center;vertical-align:middle;font-size:14pt;font-weight:bold;padding:0 5mm;">${esc(config.objet || 'Compte rendu de visite technique')}</td></tr>
      <tr><td colspan="4" style="height:5mm;font-size:1pt;">&nbsp;</td></tr>
      <tr>${businessHtml}</tr>
      <tr><td colspan="4" style="height:8mm;font-size:1pt;">&nbsp;</td></tr>
      <tr><td colspan="4" style="text-align:center;font-size:6.2pt;color:#666;letter-spacing:.1mm;padding-bottom:2mm;"><b style="color:#EF720B;">PARIS</b>&nbsp;&nbsp; NANTES&nbsp;&nbsp; TOURS&nbsp;&nbsp; RENNES&nbsp;&nbsp; BORDEAUX&nbsp;&nbsp; LYON&nbsp;&nbsp; CHERBOURG&nbsp;&nbsp; NÎMES</td></tr>
      <tr><td colspan="3" style="background:#EF720B;color:#fff;text-align:center;vertical-align:middle;height:8mm;font-size:6.5pt;padding:0 2mm;">Tél. 01 39 55 17 20 - 143 rue Yves Le Coz - 78000 VERSAILLES - contact.versailles@energieetservice.fr</td><td style="background:#595959;color:#fff;text-align:center;vertical-align:middle;height:8mm;font-size:10pt;font-weight:bold;padding:0 1mm;">energieetservice.fr</td></tr>
      <tr><td style="width:30mm;vertical-align:middle;padding-top:1.5mm;">${img(EXACT_FOOTER_CERT, 'png', 23, 'AFAC et OPQIBI')}</td><td colspan="3" style="vertical-align:middle;padding:1.5mm 0 0 1mm;font-size:5.6pt;color:#666;">SAS au capital de 292 500€ - Siège social : 143 rue Yves Le Coz - 78000 Versailles - RCS Versailles B 338 335 201 / NAF 7112B</td></tr>
    </table>
  </div>`;
}

'''
    s = s.replace(marker, word_cover + marker, 1)

old = r'''  const toc = construireToc(datas, config);

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${cssRapport(output)}</style></head><body>
    <div class="cover">
      ${logoHtml()}
      <div class="coverDate">VERSAILLES, le ${esc(dateRapport)}</div>
      <div class="ref">Nos réf. : ${esc(config.chrono || '')}</div>
      <div class="coverClient">${esc(client)}</div>
      <div class="coverVisual"><img src="${REPORT_COVER}" alt="Energie & Service"/></div>
      <div class="coverObject">${esc(config.objet || 'Compte rendu de visite technique')}</div>
      <div class="coverBusiness"><span>◉ COPROPRIÉTÉS</span><span>◉ BAILLEURS SOCIAUX</span><span>◉ COLLECTIVITÉS</span><span>◉ TERTIAIRE</span></div>
      ${footerCorporateHtml()}
    </div>
    ${toc}'''
new = r'''  const toc = construireToc(datas, config);
  const coverHtml = output === 'word'
    ? wordCoverHtml(clientCover, dateRapport, config)
    : `<div class="cover">
      ${logoHtml()}
      <div class="coverDate">VERSAILLES, le ${esc(dateRapport)}</div>
      <div class="ref">Nos réf. : ${esc(config.chrono || '')}</div>
      <div class="coverClient">${esc(client)}</div>
      <div class="coverVisual"><img src="${REPORT_COVER}" alt="Energie & Service"/></div>
      <div class="coverObject">${esc(config.objet || 'Compte rendu de visite technique')}</div>
      <div class="coverBusiness"><span>◉ COPROPRIÉTÉS</span><span>◉ BAILLEURS SOCIAUX</span><span>◉ COLLECTIVITÉS</span><span>◉ TERTIAIRE</span></div>
      ${footerCorporateHtml()}
    </div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${cssRapport(output)}</style></head><body>
    ${coverHtml}
    ${toc}'''

if old not in s:
    if "const coverHtml = output === 'word'" not in s:
        raise SystemExit('shared cover block not found')
else:
    s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
print('Word-only cover layout installed; native PDF branch untouched.')
