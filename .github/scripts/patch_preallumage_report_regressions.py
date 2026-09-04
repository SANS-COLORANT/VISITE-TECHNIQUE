from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: marker not found')
    return text.replace(old, new, 1)


def insert_after(text: str, marker: str, addition: str, label: str) -> str:
    if addition.strip() in text:
        return text
    if marker not in text:
        raise SystemExit(f'{label}: marker not found')
    return text.replace(marker, marker + addition, 1)


# This patch deliberately runs after the LAB-health and professional-layout
# patches. It repairs the Pré-allumage data path without undoing those shared
# report layers.

# ---------------------------------------------------------------------------
# 1. Report data: the simplified terrain navigation must never define what is
#    exported. Pré-allumage reports need every technical métier panel.
# ---------------------------------------------------------------------------
report = Path('reportBuilder.js')
s = report.read_text(encoding='utf-8')

s = insert_after(
    s,
    "import { chargerPreAllumageModulaire } from './preAllumageModularDb.js';\n",
    "import { getPlanSitePourVisite } from './sitePlanDb.js';\n"
    "import { construireSitePreAllumageHtml, PREALLUMAGE_REPORT_CSS } from './preAllumageReportHtml.js';\n",
    'report imports',
)

report_order = """
const PREALLUMAGE_REPORT_PANEL_ORDER = Object.freeze([
  'p-pa-infos',
  'p-pa-batiments',
  'p-pa-compteurs',
  'p-pa-regulation',
  'p-pa-chaufferie',
  'p-pa-sst',
  'p-pa-conclusion',
]);

"""
if 'PREALLUMAGE_REPORT_PANEL_ORDER' not in s:
    marker = "function esc(v = '') {\n"
    if marker not in s:
        raise SystemExit('report panel order marker not found')
    s = s.replace(marker, report_order + marker, 1)

s = insert_after(
    s,
    "  const modelePreAllumage = trame.id === 'pre_allumage' ? await chargerPreAllumageModulaire(visiteId) : null;\n",
    "  const planPreAllumage = trame.id === 'pre_allumage' ? await getPlanSitePourVisite(visiteId) : null;\n",
    'preallumage plan data',
)

s = replace_once(
    s,
    "  for (const panelId of trame.ui?.tabOrder || []) {\n",
    "  const reportPanelOrder = trame.id === 'pre_allumage'\n"
    "    ? PREALLUMAGE_REPORT_PANEL_ORDER\n"
    "    : (trame.ui?.tabOrder || []);\n\n"
    "  for (const panelId of reportPanelOrder) {\n",
    'report panel iteration',
)

s = replace_once(
    s,
    "    note: note?.contenu || '',\n    aliases,\n  };\n",
    "    note: note?.contenu || '',\n"
    "    aliases,\n"
    "    preAllumage: modelePreAllumage ? {\n"
    "      locaux: modelePreAllumage.locaux || [],\n"
    "      plan: planPreAllumage,\n"
    "    } : null,\n"
    "  };\n",
    'report preallumage metadata',
)

# Client/Documents reports pass through the generic report engine. At this
# point the LAB patch has already added reserves/material/health/photos to the
# site renderer; keep those annexes but use the real Pré-allumage métier pages
# for the main body instead of the generic ICPE-like table flow.
old_site_tail = """  const local = data.visite.nom_local || data.visite.type_local || 'Installation technique';
  return `<article class=\"siteReport\"><div class=\"siteStart\"><h1>${esc(data.visite.nom_site || 'Site')}</h1><h4>${esc(local)}</h4></div>${sections}${reserves}${materiel}${healthHtml}${photos}</article>`;
}
"""
new_site_tail = """  const local = data.visite.nom_local || data.visite.type_local || 'Installation technique';
  if (data.trame?.id === 'pre_allumage') {
    const planSrc = data.preAllumage?.plan?.uri ? await imageRapportBase64(data.preAllumage.plan.uri) : null;
    const metier = construireSitePreAllumageHtml(data, config, planSrc);
    return `${metier}${reserves}${materiel}${healthHtml}${photos}`;
  }
  return `<article class=\"siteReport\"><div class=\"siteStart\"><h1>${esc(data.visite.nom_site || 'Site')}</h1><h4>${esc(local)}</h4></div>${sections}${reserves}${materiel}${healthHtml}${photos}</article>`;
}
"""
s = replace_once(s, old_site_tail, new_site_tail, 'trame-aware client report')

s = insert_after(
    s,
    "  const toc = construireToc(datas, config);\n",
    "  const contientPreAllumage = (datas || []).some((d) => d.trame?.id === 'pre_allumage');\n",
    'preallumage report css flag',
)
s = replace_once(
    s,
    '<style>${cssRapport(output)}</style>',
    '<style>${cssRapport(output)}${contientPreAllumage ? PREALLUMAGE_REPORT_CSS : \'\'}</style>',
    'preallumage report css',
)

report.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 2. Dedicated PDF/HTML: keep every real local in the housing table even when
#    one of its three information fields is temporarily empty.
# ---------------------------------------------------------------------------
pa_html = Path('preAllumageReportHtml.js')
s = pa_html.read_text(encoding='utf-8')
old_buildings = """function tableBatiments(data, config) {
  const groups = section(data, 'p-pa-batiments').groups || [];
  const rows = groups.map((g, i) => {
    const nb = rowValue(g, 'Nombre de logements desservis');
    const bat = rowValue(g, 'Bâtiments desservis');
    const sit = rowValue(g, 'Situation / localisation');
    const connus = new Set(['Nombre de logements desservis', 'Bâtiments desservis', 'Situation / localisation']);
    const extras = (g.rows || []).filter((r) => !connus.has(r.storageKey || r.label) && (config.afficherLignesVides || String(r.comment || '').trim()));
    if (!config.afficherLignesVides && !nb && !bat && !sit && !extras.length) return '';
    return `<tr><td>${esc(titreGroupe(data, 'p-pa-batiments', g))}</td><td>${esc(nb || '-')}</td><td>${esc(bat || '')}</td><td>${esc(sit || '')}</td></tr>${extras.map((r) => `<tr><td></td><td colspan=\"3\"><b>${esc(r.label)} :</b> ${esc(r.comment || '')}</td></tr>`).join('')}`;
  }).join('');
  return `<table class=\"paBuildingTable\"><thead><tr><th>Local / SST</th><th>Nombre de logements desservis</th><th>Bâtiments desservis</th><th>Situation</th></tr></thead><tbody>${rows}</tbody></table>`;
}
"""
new_buildings = """function tableBatiments(data, config) {
  const groups = section(data, 'p-pa-batiments').groups || [];
  const locaux = data.preAllumage?.locaux || [];
  const byLocal = new Map(groups.filter((g) => g.localId).map((g) => [g.localId, g]));
  const used = new Set();
  const ordered = [];

  locaux.forEach((local) => {
    const group = byLocal.get(local.id);
    if (group) {
      used.add(group);
      ordered.push({ group, local });
    } else {
      ordered.push({ group: { title: local.nom, localId: local.id, rows: [] }, local });
    }
  });
  groups.filter((g) => !used.has(g)).forEach((group) => ordered.push({ group, local: null }));

  const rows = ordered.map(({ group: g, local }) => {
    const nb = rowValue(g, 'Nombre de logements desservis');
    const bat = rowValue(g, 'Bâtiments desservis');
    const sit = rowValue(g, 'Situation / localisation');
    const connus = new Set(['Nombre de logements desservis', 'Bâtiments desservis', 'Situation / localisation']);
    const extras = (g.rows || []).filter((r) => !connus.has(r.storageKey || r.label) && (config.afficherLignesVides || String(r.comment || '').trim()));
    const estLocalReel = Boolean(local || g.localId);
    if (!config.afficherLignesVides && !estLocalReel && !nb && !bat && !sit && !extras.length) return '';
    const nom = local?.nom || titreGroupe(data, 'p-pa-batiments', g);
    return `<tr><td>${esc(nom)}</td><td>${esc(nb || '-')}</td><td>${esc(bat || '')}</td><td>${esc(sit || '')}</td></tr>${extras.map((r) => `<tr><td></td><td colspan=\"3\"><b>${esc(r.label)} :</b> ${esc(r.comment || '')}</td></tr>`).join('')}`;
  }).join('');
  return `<table class=\"paBuildingTable\"><thead><tr><th>Local / SST</th><th>Nombre de logements desservis</th><th>Bâtiments desservis</th><th>Situation</th></tr></thead><tbody>${rows}</tbody></table>`;
}
"""
s = replace_once(s, old_buildings, new_buildings, 'preallumage housing table')
pa_html.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 3. Real DOCX: add the site plan and the cross-local housing table. The LAB
#    patch has already extended siteDocumentXml with health arguments, so this
#    patch appends the plan argument instead of replacing LAB behavior.
# ---------------------------------------------------------------------------
word = Path('wordDocxExporter.js')
s = word.read_text(encoding='utf-8')

word_helpers = r'''
function preAllumageBuildingRows(data) {
  const section = (data.sections || []).find((item) => item.panelId === 'p-pa-batiments');
  const groups = section?.groups || [];
  const locaux = data.preAllumage?.locaux || [];
  const byLocal = new Map(groups.filter((group) => group.localId).map((group) => [group.localId, group]));
  const used = new Set();
  const entries = [];

  for (const local of locaux) {
    const group = byLocal.get(local.id);
    if (group) used.add(group);
    entries.push({ local, group: group || { title: local.nom, rows: [] } });
  }
  for (const group of groups) if (!used.has(group)) entries.push({ local: null, group });

  const value = (group, label) => {
    const row = (group?.rows || []).find((item) => item.label === label || item.storageKey === label);
    return cleanText(row?.comment || '');
  };
  return entries.map(({ local, group }) => [
    local?.nom || group?.title || 'Local',
    value(group, 'Nombre de logements desservis') || '-',
    value(group, 'Bâtiments desservis'),
    value(group, 'Situation / localisation'),
  ]);
}

'''
if 'function preAllumageBuildingRows' not in s:
    health_signature = "function siteDocumentXml(data, config, imageByPhotoId, health = null, multi = false) {\n"
    plain_signature = "function siteDocumentXml(data, config, imageByPhotoId) {\n"
    if health_signature in s:
        s = s.replace(health_signature, word_helpers + "function siteDocumentXml(data, config, imageByPhotoId, health = null, multi = false, preAllumagePlanImage = null) {\n", 1)
    elif plain_signature in s:
        s = s.replace(plain_signature, word_helpers + "function siteDocumentXml(data, config, imageByPhotoId, preAllumagePlanImage = null) {\n", 1)
    else:
        raise SystemExit('Word siteDocumentXml marker not found')

s = replace_once(
    s,
    "  const local = data.visite?.nom_local || data.visite?.type_local || 'Installation technique';\n",
    "  const estPreAllumage = data.trame?.id === 'pre_allumage';\n"
    "  const local = estPreAllumage ? 'Visite de pré-allumage' : (data.visite?.nom_local || data.visite?.type_local || 'Installation technique');\n",
    'Word preallumage title',
)

summary_marker = "  out.push(paragraph(local, { bold: true, size: 25, align: 'center', after: 180 }));\n\n"
summary_block = r'''  if (estPreAllumage) {
    out.push(paragraph('PLAN ET INFORMATIONS BÂTIMENTS', { bold: true, size: 25, color: 'F26426', align: 'center', before: 100, after: 100 }));
    if (preAllumagePlanImage) {
      out.push(imageParagraph(preAllumagePlanImage.relId, preAllumagePlanImage.widthEmu, preAllumagePlanImage.heightEmu, preAllumagePlanImage.docPrId, preAllumagePlanImage.filename));
    } else {
      out.push(paragraph('Aucun plan du site sélectionné dans METRA.', { size: 18, color: '777777', align: 'center', after: 100 }));
    }
    const housingRows = preAllumageBuildingRows(data);
    out.push(table([
      ['Local / SST', 'Nombre de logements desservis', 'Bâtiments desservis', 'Situation'],
      ...(housingRows.length ? housingRows : [['Aucun local renseigné', '-', '', '']]),
    ], [1700, 2300, 2600, 2600]));
  }

'''
if summary_block.strip() not in s:
    if summary_marker not in s:
        raise SystemExit('Word preallumage summary insertion marker not found')
    s = s.replace(summary_marker, summary_marker + summary_block, 1)

s = replace_once(
    s,
    "  for (const section of data.sections || []) {\n    const groups = (section.groups || []).map((group) => ({ group, rows: reportRows(group, config.afficherLignesVides) })).filter((item) => item.rows.length);\n",
    "  for (const section of data.sections || []) {\n"
    "    if (estPreAllumage && section.panelId === 'p-pa-batiments') continue;\n"
    "    const groups = (section.groups || []).map((group) => ({ group, rows: reportRows(group, config.afficherLignesVides) })).filter((item) => item.rows.length);\n",
    'Word skip duplicate building groups',
)

plan_block = r'''  const preAllumagePlanImages = new Map();
  for (let index = 0; index < (datas || []).length; index += 1) {
    const data = datas[index];
    const uri = data?.trame?.id === 'pre_allumage' ? data?.preAllumage?.plan?.uri : null;
    if (!uri) continue;
    const prepared = await preparePhoto({ uri, label: 'Plan du site' }, 1000 + index);
    if (!prepared) continue;
    const maxWidth = 5400000;
    const ratio = prepared.height / prepared.width;
    const height = Math.min(3500000, Math.max(1500000, Math.round(maxWidth * ratio)));
    const planImage = await addBase64Image(prepared.base64, `preallumage_plan_${index + 1}.jpeg`, maxWidth, height, 'Plan du site', data.visite?.id || null);
    if (planImage) {
      planImage.kind = 'preallumage-plan';
      preAllumagePlanImages.set(data.visite.id, planImage);
    }
  }

'''
if 'const preAllumagePlanImages = new Map();' not in s:
    marker = "  const enabledPhotos = (photosConfig || []).filter((photo) => photo.include !== false);\n"
    if marker not in s:
        raise SystemExit('Word enabled photos marker not found')
    s = s.replace(marker, plan_block + marker, 1)

s = replace_once(
    s,
    "  const photoImages = images.filter((image) => image.visiteId);\n",
    "  const photoImages = images.filter((image) => image.visiteId && image.kind !== 'preallumage-plan');\n",
    'Word plan/photo separation',
)

health_call = "    body.push(siteDocumentXml(data, config, siteImages, healthByVisit.get(data.visite.id) || null, multi));\n"
health_call_new = "    body.push(siteDocumentXml(data, config, siteImages, healthByVisit.get(data.visite.id) || null, multi, preAllumagePlanImages.get(data.visite.id) || null));\n"
plain_call = "    body.push(siteDocumentXml(data, config, siteImages));\n"
plain_call_new = "    body.push(siteDocumentXml(data, config, siteImages, preAllumagePlanImages.get(data.visite.id) || null));\n"
if health_call_new not in s and plain_call_new not in s:
    if health_call in s:
        s = s.replace(health_call, health_call_new, 1)
    elif plain_call in s:
        s = s.replace(plain_call, plain_call_new, 1)
    else:
        raise SystemExit('Word site document call marker not found')

word.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 4. APK-only DOCX hook: patch_word_docx_build.py turns the dedicated Word
#    button into exporterRapportDocx. Feed it the visit photos instead of an
#    empty array. This part is intentionally optional during the earlier CI
#    compatibility pass where the DOCX hook is not present yet.
# ---------------------------------------------------------------------------
pre_exporter = Path('preAllumageReportExporter.js')
s = pre_exporter.read_text(encoding='utf-8')
if "photosConfig: []" in s and "title: 'Rapport Pré-allumage'" in s:
    old_import = "import { chargerDonneesVisiteRapport } from './reportBuilder.js';\n"
    new_import = "import { chargerDonneesVisiteRapport, preparerPhotosRapport } from './reportBuilder.js';\n"
    if old_import in s:
        s = s.replace(old_import, new_import, 1)
    elif new_import not in s:
        raise SystemExit('Pré-allumage reportBuilder import marker not found')
    s = s.replace('photosConfig: []', 'photosConfig: preparerPhotosRapport(data)', 1)
pre_exporter.write_text(s, encoding='utf-8')

print('Pré-allumage reports repaired: full data, plans, housing summary, real DOCX and Client/Documents dispatch.')
