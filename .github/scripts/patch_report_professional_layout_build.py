from pathlib import Path

MARKER = 'PROFESSIONAL_REPORT_LAYOUT_V1'


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def replace_between(text, start_marker, end_marker, replacement, label):
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f'{label}: start marker not found')
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f'{label}: end marker not found')
    return text[:start] + replacement + text[end:]


# ---------------------------------------------------------------------------
# Shared reportBuilder improvements: these apply to every standard PDF model
# rendered through reportBuilder (VMC, ICPE, chaufferie, sous-station, etc.).
# This script deliberately runs after the VMC and LAB-health compatibility
# patches so it can improve the final report without breaking their markers.
# ---------------------------------------------------------------------------
p = 'reportBuilder.js'
s = read(p)

if MARKER not in s:
    helper_marker = "function valeurChamp(champs, cle) {\n"
    helpers = r'''// PROFESSIONAL_REPORT_LAYOUT_V1
function texteRapport(v = '') {
  let t = String(v ?? '').trim();
  if (!t) return '';
  t = t
    .replace(/\bEchelle taille non adapté\b/gi, 'Échelle de dimensions inadaptées')
    .replace(/\bEtat\b/g, 'État')
    .replace(/\bEtancheite\b/gi, 'Étanchéité')
    .replace(/\bDeplacer\b/g, 'Déplacer')
    .replace(/\bbatiment\b/gi, 'bâtiment')
    .replace(/\bskydom\b/gi, 'skydome');
  return t;
}

function estIdentifiantInterneRapport(v) {
  const t = String(v || '').trim();
  return /^id-[a-z0-9_-]{8,}$/i.test(t)
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t);
}

function valeurChampRapport(label, value, visite) {
  const libelle = String(label || '');
  let v = texteRapport(value);
  if (!v) return '';
  if (/date/i.test(libelle) && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(v)) v = dateFr(v);
  if (/(?:n°|numéro|numero|identifiant|\bid\b).*site/i.test(libelle) && estIdentifiantInterneRapport(v)) {
    return texteRapport(visite?.nom_site || visite?.adresse || '');
  }
  return v;
}

function commentaireRapportHtml(row) {
  let brut = texteRapport(row?.comment || '');
  if (brut === '/') brut = '';
  if (!brut) {
    const avis = String(row?.avis || '').trim().toUpperCase();
    if (avis === 'S.O' || avis === 'SO') brut = 'Sans objet.';
    else if (avis === 'N.R' || avis === 'NR') brut = 'Non relevé.';
    else if (avis === 'N.V' || avis === 'NV') brut = 'Non visible.';
    else brut = '-';
  }
  const parties = brut.split('||').map((x) => x.trim()).filter(Boolean);
  if (parties.length > 1) {
    return `${esc(parties[0])}<div class="reportPrecision"><b>Précision :</b> ${esc(parties.slice(1).join(' · '))}</div>`;
  }
  return esc(brut);
}

function criticiteRapport(remarque) {
  const n = Math.round(Number(remarque?.criticite));
  return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : 2;
}

function criticiteRapportLabel(value) {
  return ['Information', 'Mineur', 'À programmer', 'Important', 'Prioritaire', 'Critique'][Math.max(0, Math.min(5, Number(value) || 0))] || 'À programmer';
}

function trierRemarquesRapport(remarques = []) {
  return [...(remarques || [])].sort((a, b) => {
    const c = criticiteRapport(b) - criticiteRapport(a);
    if (c) return c;
    return String(a?.cree_le || '').localeCompare(String(b?.cree_le || ''));
  });
}

function introRapportHtml(datas, config) {
  const ids = [...new Set((datas || []).map((d) => d?.trame?.id).filter(Boolean))];
  const noms = [...new Set((datas || []).map((d) => d?.trame?.nom).filter(Boolean))];
  const vmcOnly = ids.length === 1 && ids[0] === 'vmc';
  const titre = config.sousTitre || (vmcOnly
    ? 'Présentation de la trame de visite technique VMC'
    : noms.length === 1
      ? `Présentation de la trame de visite technique — ${noms[0]}`
      : 'Présentation de la trame de visite technique');
  const corps = vmcOnly
    ? '<p>Pour chaque caisson VMC et chaque élément du réseau de distribution contrôlé, les caractéristiques techniques, avis, commentaires, photographies et éventuelles réserves ont été relevés.</p><p>Le présent compte rendu synthétise les constats de la visite, site par site et caisson par caisson.</p>'
    : '<p>Pour chaque installation et équipement contrôlé, les caractéristiques techniques, avis, commentaires, photographies et éventuelles réserves ont été relevés.</p><p>Le présent compte rendu synthétise les constats de la visite, site par site et installation par installation.</p>';
  return `<div class="intro"><div class="introTitle">${esc(titre)}</div>${corps}<p class="introLead">Les principales abréviations sont :</p><ul><li>S : Satisfaisant</li><li>N.S : Non satisfaisant</li><li>S.O : Sans objet</li><li>N.R : Non relevé</li><li>N.V : Non visible</li></ul></div>`;
}

'''
    if helper_marker not in s:
        raise SystemExit('professional helpers marker not found')
    s = s.replace(helper_marker, helpers + helper_marker, 1)

# Normalize values only for rendering: stored field/control data remains untouched.
normalise_marker = "  const localName = titreLocalDepuisChamps(champs);\n"
normalise_block = """  for (const section of sections) {
    for (const group of section.groups || []) {
      for (const row of group.rows || []) {
        row.label = texteRapport(row.label);
        row.comment = valeurChampRapport(row.label, row.comment, visite);
      }
    }
  }

"""
if normalise_block not in s:
    if normalise_marker not in s:
        raise SystemExit('report value normalization marker not found')
    s = s.replace(normalise_marker, normalise_block + normalise_marker, 1)

# Better equipment photo labels: avoid generic captions such as just "VMC".
old_material_label = "    return court(m?.designation || m?.categorie || 'Équipement', 60);\n"
new_material_label = "    return court([m?.designation || m?.categorie, m?.marque, m?.modele].filter(Boolean).join(' · ') || 'Équipement', 80);\n"
if old_material_label in s:
    s = s.replace(old_material_label, new_material_label, 1)

# Technical tables may split between rows instead of pushing a complete small
# group to the next page. Headings and rows themselves remain protected.
table_start = "function tableHtml(group, afficherLignesVides) {\n"
table_end = "function sectionHtml(section, config) {\n"
new_table = r'''function tableHtml(group, afficherLignesVides) {
  const rows = (group.rows || []).filter((r) => afficherLignesVides || String(r.avis || r.comment || '').trim());
  if (!rows.length) return '';

  return `<div class="groupBlock"><h3>${esc(texteRapport(group.title))}</h3><table class="techTable"><thead><tr><th class="labelCol">Intitulé</th><th class="avisCol">Avis</th><th>Commentaire</th></tr></thead><tbody>${rows.map((r) => {
    const avis = String(r.avis || '').trim();
    const champClass = r.type === 'champ' ? 'champAvis' : '';
    return `<tr><td class="labelCell">${esc(texteRapport(r.label))}</td><td class="avisCell ${champClass} ${classeAvis(avis)}">${esc(avis)}</td><td>${commentaireRapportHtml(r)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

'''
s = replace_between(s, table_start, table_end, new_table, 'technical table function')

# All reserve models share the same client-facing structure and criticity.
reserve_start = "function reservesHtml(data, config) {\n"
reserve_end = "function materielHtml(data, config) {\n"
new_reserves = r'''function reservesHtml(data, config) {
  if (!config.remarques) return '';
  const lignes = trierRemarquesRapport(remarquesRapportUniques(data.remarques || []));
  if (!lignes.length && !config.afficherLignesVides) return '';
  const rows = lignes.length ? lignes : [{ prestation: '', cree_le: '', criticite: 0 }];
  return `<section class="reportSection reserveSection"><div class="sectionBanner">REMARQUES PARTICULIÈRES</div><table class="reserveTable"><thead><tr><th>Point concerné</th><th>Réserve / préconisation</th><th>Criticité</th><th>Date</th></tr></thead><tbody>${rows.map((r) => {
    const criticite = criticiteRapport(r);
    const point = texteRapport(libellePointReserve(r) || libelleReserveCourt(r) || 'Général');
    const prestation = texteRapport(r.prestation || '-');
    const date = dateFr(String(r.cree_le || '').slice(0, 10)) || '-';
    return `<tr><td>${esc(point)}</td><td>${esc(prestation)}</td><td class="reserveSeverity severity-${criticite}"><b>${criticite}/5</b><span>${esc(criticiteRapportLabel(criticite))}</span></td><td class="reserveDateCell">${esc(date)}</td></tr>`;
  }).join('')}</tbody></table></section>`;
}

'''
s = replace_between(s, reserve_start, reserve_end, new_reserves, 'reserve table function')

# Material listing flows naturally after preceding content instead of forcing a
# mostly empty page.
s = s.replace(
    '<section class="reportSection pageBreakBefore"><div class="sectionBanner">LISTING MATÉRIEL</div>',
    '<section class="reportSection materialSection"><div class="sectionBanner">LISTING MATÉRIEL</div>',
)

# Base PDF photo pagination: up to six photos, with the grid adapting to the
# number of photos on each page. Images stay object-fit:contain.
photos_start = "async function photosHtml(data, config, photosConfig) {\n"
photos_end = "async function siteHtml(data, config, photosConfig) {\n"
new_photos = r'''async function photosHtml(data, config, photosConfig) {
  if (!config.photos) return '';
  const items = (photosConfig || [])
    .filter((p) => p.visiteId === data.visite.id && p.include)
    .sort((a, b) => a.ordre - b.ordre);
  if (!items.length) return '';

  const prepared = [];
  for (const p of items) {
    const src = await imageRapportBase64(p.uri);
    if (src) prepared.push({ ...p, src });
  }
  if (!prepared.length) return '';

  return chunk(prepared, 6).map((page) => `<section class="photoPage pageBreakBefore"><div class="sectionBanner">PHOTOGRAPHIES</div><div class="photoGrid photoCount-${page.length}">${page.map((p) => `<div class="photoCard"><div class="photoImageWrap"><img src="${p.src}"/></div><div class="photoCaption">${esc(texteRapport(p.label || 'Photo générale'))}</div></div>`).join('')}</div></section>`).join('');
}

'''
s = replace_between(s, photos_start, photos_end, new_photos, 'photo function')

# Replace the hard-coded chaufferie/SST introduction with a trame-aware intro.
intro_start = '    <div class="intro">\n'
intro_end = "    ${contenus.join('')}\n"
if intro_start in s and intro_end in s:
    start = s.find(intro_start)
    end = s.find(intro_end, start)
    s = s[:start] + "    ${introRapportHtml(datas, config)}\n" + s[end:]
elif '${introRapportHtml(datas, config)}' not in s:
    raise SystemExit('dynamic report intro target not found')

# CSS override layer. Site starts are now deterministic, small groups can flow,
# and photo density adapts 1/2/3-4/5-6 while keeping full images visible.
css_marker = "    ${fixedUi}\n"
css_block = r'''    /* PROFESSIONAL_REPORT_LAYOUT_V1 */
    .siteReport{page-break-before:always;padding-top:2mm}.siteStart{break-after:avoid-page;margin:2mm 0 5mm}.siteStart h1{font-size:19pt;margin-bottom:3mm}.siteStart h4{font-size:12.5pt;margin:0}
    .reportSection{margin-bottom:3mm}.groupBlock{break-inside:auto!important;margin-bottom:2.5mm!important}.groupBlock h3{break-after:avoid-page;margin:1.8mm 0 2mm!important}.techTable thead{display:table-header-group}.techTable tr{break-inside:avoid-page}.techTable th,.techTable td{padding:.9mm 1mm;line-height:1.14}
    .reportPrecision{margin-top:.7mm;font-size:7.6pt;color:#555}.reserveSection,.materialSection{break-before:auto;padding-top:1mm}.reserveSection .sectionBanner,.materialSection .sectionBanner{break-after:avoid-page;margin-top:2mm}
    .reserveTable{font-size:7.7pt}.reserveTable th:nth-child(1){width:28%}.reserveTable th:nth-child(2){width:45%}.reserveTable th:nth-child(3){width:15%;text-align:center}.reserveTable th:nth-child(4){width:12%;text-align:center}.reserveTable td:nth-child(1){background:#F6B888}.reserveTable td:nth-child(2){background:#fff}.reserveTable td:nth-child(3){background:#fff}.reserveSeverity{text-align:center;white-space:nowrap}.reserveSeverity span{display:block;font-size:6.5pt;font-weight:600;margin-top:.4mm}.severity-0,.severity-1{color:#666}.severity-2{color:#9A6700}.severity-3{color:#B45309}.severity-4,.severity-5{color:#B91C1C}.severity-5{font-weight:900}
    .photoPage{min-height:0}.photoGrid{display:grid;grid-template-columns:1fr 1fr;gap:4mm 7mm;align-items:start}.photoCard{min-height:0}.photoCount-1 .photoCard{grid-column:1/-1}.photoCount-1 .photoImageWrap{height:132mm}.photoCount-2 .photoImageWrap{height:100mm}.photoCount-3 .photoImageWrap,.photoCount-4 .photoImageWrap{height:76mm}.photoCount-5 .photoImageWrap,.photoCount-6 .photoImageWrap{height:49mm}.photoCount-1 .photoCaption,.photoCount-2 .photoCaption{min-height:11mm}.photoCount-5 .photoCaption,.photoCount-6 .photoCaption{min-height:9mm;font-size:8pt}
'''
if css_block not in s:
    if css_marker not in s:
        raise SystemExit('professional CSS marker not found')
    s = s.replace(css_marker, css_block + css_marker, 1)

# In grouped reports a static footer cannot reliably know the current site's
# page. Say "Périmètre" instead of incorrectly labelling all pages as one site.
old_meta = "    const meta = [`Nos réf. : ${config.chrono || ''}`, `Site : ${siteFooter || ''}`, `Objet : ${config.objet || ''}`];\n"
new_meta = "    const perimetre = /^\\d+ sites/i.test(String(siteFooter || '')) ? `Périmètre : ${siteFooter}` : `Site : ${siteFooter || ''}`;\n    const meta = [`Nos réf. : ${config.chrono || ''}`, perimetre, `Objet : ${config.objet || ''}`];\n"
if old_meta in s:
    s = s.replace(old_meta, new_meta, 1)
elif 'const perimetre = /^\\d+ sites/i.test' not in s:
    raise SystemExit('report footer scope marker not found')

write(p, s)


# ---------------------------------------------------------------------------
# Editable report exporter uses its own photo regrouping and PDF footer.
# Keep manual sizes, but let the default medium size reach six photos/page.
# ---------------------------------------------------------------------------
p = 'reportEditorExporter.js'
s = read(p)

old_weight = """function poidsPhoto(size) {
  if (size === 'small') return 2;
  if (size === 'large') return 6;
  if (size === 'full') return 12;
  return 3;
}
"""
new_weight = """function poidsPhoto(size) {
  if (size === 'full') return 12;
  if (size === 'large') return 6;
  return 2;
}
"""
if old_weight in s:
    s = s.replace(old_weight, new_weight, 1)
elif new_weight not in s:
    raise SystemExit('editable photo weight marker not found')

old_rebuilt = "  const rebuilt = pages.map((page) => `<section class=\"photoPage pageBreakBefore\"><div class=\"sectionBanner\">PHOTOGRAPHIES</div><div class=\"photoGrid\">${page.map((x) => x.html).join('')}</div></section>`).join('');\n"
new_rebuilt = "  const rebuilt = pages.map((page) => `<section class=\"photoPage pageBreakBefore\"><div class=\"sectionBanner\">PHOTOGRAPHIES</div><div class=\"photoGrid photoCount-${page.length}\">${page.map((x) => x.html).join('')}</div></section>`).join('');\n"
if old_rebuilt in s:
    s = s.replace(old_rebuilt, new_rebuilt, 1)
elif new_rebuilt not in s:
    raise SystemExit('editable photo page count marker not found')

editor_css_marker = "    .sectionBanner.titleSize-small{font-size:11pt!important}.sectionBanner.titleSize-large{font-size:17pt!important}\n"
editor_css_extra = editor_css_marker + "    .photoCount-1 .photoSize-medium{grid-column:1/-1!important}.photoCount-1 .photoSize-medium .photoImageWrap{height:132mm!important}.photoCount-2 .photoSize-medium .photoImageWrap{height:100mm!important}.photoCount-3 .photoSize-medium .photoImageWrap,.photoCount-4 .photoSize-medium .photoImageWrap{height:76mm!important}.photoCount-5 .photoSize-medium .photoImageWrap,.photoCount-6 .photoSize-medium .photoImageWrap{height:49mm!important}\n"
if 'photoCount-6 .photoSize-medium' not in s:
    if editor_css_marker not in s:
        raise SystemExit('editable photo CSS marker not found')
    s = s.replace(editor_css_marker, editor_css_extra, 1)

old_meta = "    const meta = [`Nos réf. : ${config.chrono || ''}`, `Site : ${siteFooter || ''}`, `Objet : ${config.objet || ''}`];\n"
new_meta = "    const perimetre = /^\\d+ sites/i.test(String(siteFooter || '')) ? `Périmètre : ${siteFooter}` : `Site : ${siteFooter || ''}`;\n    const meta = [`Nos réf. : ${config.chrono || ''}`, perimetre, `Objet : ${config.objet || ''}`];\n"
if old_meta in s:
    s = s.replace(old_meta, new_meta, 1)
elif 'const perimetre = /^\\d+ sites/i.test' not in s:
    raise SystemExit('editable footer scope marker not found')

write(p, s)


# ---------------------------------------------------------------------------
# Dedicated Pré-allumage PDF: keep its special document structure, but prevent
# clipping and allow long test tables to flow across pages safely.
# ---------------------------------------------------------------------------
p = 'preAllumageReportExporter.js'
s = read(p)
s = s.replace('background:#fff;overflow:hidden}.paPage:before', 'background:#fff;overflow:visible}.paPage:before')
write(p, s)

p = 'preAllumageReportHtml.js'
s = read(p)
s = s.replace('.paTestGroup{break-inside:avoid-page;margin-bottom:3.4mm}', '.paTestGroup{break-inside:auto;margin-bottom:3.4mm}.paTestTable thead{display:table-header-group}.paTestTable tr{break-inside:avoid-page}')
write(p, s)

print('Professional PDF layout applied to all report models.')
