from pathlib import Path

# ---------------------------------------------------------------------------
# Compact VMC PDF/Word layout.
# - only active caissons are rendered;
# - the caisson name is shown once as a strong heading;
# - technical sub-sections keep simple Situation/Caisson/Distribution/Gestion
#   headings;
# - hidden identification rows are not repeated in the report;
# - duplicate control-linked reserves are collapsed;
# - the reserve header stays compact and all four columns get explicit widths.
# ---------------------------------------------------------------------------
p = Path('reportBuilder.js')
s = p.read_text(encoding='utf-8')

if 'function caissonActifRapport' not in s:
    marker = "function titreSectionRapport(panelId, fallback) {\n"
    helper = r'''function caissonActifRapport(champs, controles, panelId) {
  const m = String(panelId || '').match(/^p-vmc-c(\d+)$/);
  if (!m) return true;
  const index = Number(m[1]);
  const flag = (champs || []).find((r) => r.section_code === 'vmc.config' && r.cle === `caisson_${index}_actif`);
  if (flag) return String(flag.valeur || '') === '1';
  if (index === 1) return true;
  const prefix = `vmc-c${index}.`;
  return (champs || []).some((r) => String(r.section_code || '').startsWith(prefix) && String(r.valeur || '').trim())
    || (controles || []).some((r) => String(r.section_code || '').startsWith(prefix) && String(r.avis || r.commentaire || '').trim());
}

function libellePointReserve(remarque) {
  const rattachement = court(remarque?.reference_libelle || '', 54);
  if (rattachement) return rattachement;
  const controleKey = String(remarque?.controle_key || '').trim();
  if (controleKey.includes('||')) return court(controleKey.split('||').slice(1).join('||'), 54) || 'Point technique';
  return 'Général';
}

function remarquesRapportUniques(remarques = []) {
  const vus = new Set();
  return (remarques || []).filter((r) => {
    const key = String(r?.controle_key || '').trim();
    if (!key) return true;
    if (vus.has(key)) return false;
    vus.add(key);
    return true;
  });
}

'''
    if marker not in s:
        raise SystemExit('VMC compact helper marker not found')
    s = s.replace(marker, helper + marker, 1)

loop_old = "  for (const panelId of trame.ui?.tabOrder || []) {\n    if (panelId === 'SEP' || ['p-equip', 'p-remarques', 'p-photos'].includes(panelId)) continue;\n    const groups = [];\n"
loop_new = "  for (const panelId of trame.ui?.tabOrder || []) {\n    if (panelId === 'SEP' || ['p-equip', 'p-remarques', 'p-photos'].includes(panelId)) continue;\n    if (trame.id === 'vmc' && /^p-vmc-c\\d+$/.test(panelId) && !caissonActifRapport(champs, controles, panelId)) continue;\n    const groups = [];\n"
if loop_new not in s:
    if loop_old not in s:
        raise SystemExit('VMC active-caisson report filter target not found')
    s = s.replace(loop_old, loop_new, 1)

rows_old = "        rows: (fields || []).map((f) => {\n"
rows_new = "        rows: (fields || []).filter((f) => f?.hiddenInApp !== true).map((f) => {\n"
if rows_new not in s:
    if rows_old not in s:
        raise SystemExit('VMC hidden field report target not found')
    s = s.replace(rows_old, rows_new, 1)

repeated_title = "        title: trame.id === 'vmc' && /^p-vmc-c\\d+$/.test(panelId) ? `${libelleCaissonRapport(champs, panelId)} — ${section}` : section,\n"
if repeated_title in s:
    s = s.replace(repeated_title, "        title: section,\n", 1)
elif "        title: section,\n" not in s:
    raise SystemExit('VMC repeated caisson title target not found')

push_old = "    sections.push({\n      panelId,\n      title: titreSectionRapport(panelId, trame.ui.labels?.[panelId]),\n      banner: REPORT_SECTION_META[panelId]?.banner === true,\n      breakBefore: REPORT_SECTION_META[panelId]?.breakBefore === true,\n      groups,\n    });\n"
push_new = "    const vmcCaisson = trame.id === 'vmc' && /^p-vmc-c\\d+$/.test(panelId);\n    sections.push({\n      panelId,\n      title: vmcCaisson ? libelleCaissonRapport(champs, panelId) : titreSectionRapport(panelId, trame.ui.labels?.[panelId]),\n      banner: vmcCaisson ? false : REPORT_SECTION_META[panelId]?.banner === true,\n      breakBefore: REPORT_SECTION_META[panelId]?.breakBefore === true,\n      vmcCaisson,\n      groups,\n    });\n"
if push_new not in s:
    if push_old not in s:
        raise SystemExit('VMC section heading target not found')
    s = s.replace(push_old, push_new, 1)

section_old = '''function sectionHtml(section, config) {
  const inner = (section.groups || []).map((g) => tableHtml(g, config.afficherLignesVides)).join('');
  if (!inner) return '';
  const banner = section.banner && section.title ? `<div class="sectionBanner">${esc(section.title)}</div>` : '';
  const breakClass = section.breakBefore ? ' pageBreakBefore' : '';
  return `<section class="reportSection${breakClass}">${banner}${inner}</section>`;
}
'''
section_new = '''function sectionHtml(section, config) {
  const inner = (section.groups || []).map((g) => tableHtml(g, config.afficherLignesVides)).join('');
  if (!inner) return '';
  const banner = section.banner && section.title ? `<div class="sectionBanner">${esc(section.title)}</div>` : '';
  const caissonTitle = section.vmcCaisson && section.title ? `<div class="vmcCaissonTitle">${esc(section.title)}</div>` : '';
  const breakClass = section.breakBefore ? ' pageBreakBefore' : '';
  const caissonClass = section.vmcCaisson ? ' vmcCaissonSection' : '';
  return `<section class="reportSection${breakClass}${caissonClass}">${banner}${caissonTitle}${inner}</section>`;
}
'''
if section_new not in s:
    if section_old not in s:
        raise SystemExit('VMC section HTML target not found')
    s = s.replace(section_old, section_new, 1)

reserves_old = "  const lignes = data.remarques || [];\n"
reserves_new = "  const lignes = remarquesRapportUniques(data.remarques || []);\n"
if reserves_new not in s:
    if reserves_old not in s:
        raise SystemExit('reserve dedupe target not found')
    s = s.replace(reserves_old, reserves_new, 1)

s = s.replace("<tr><td>${esc(libelleReserveCourt(r))}</td><td>${esc(r.poste || 'Remarques particulières')}</td>",
              "<tr><td>${esc(libellePointReserve(r))}</td><td>${esc(r.poste || 'Remarques particulières')}</td>")

css_group_old = "    .groupBlock{break-inside:avoid-page;margin-bottom:4.5mm}.groupBlock h3{text-align:center;text-decoration:underline;font-size:11.5pt;margin:3mm 0 3.5mm}\n"
css_group_new = css_group_old + "    .vmcCaissonSection{margin-bottom:6mm}.vmcCaissonSection + .vmcCaissonSection{margin-top:9mm}.vmcCaissonTitle{text-align:center;text-transform:uppercase;font-size:15pt;font-weight:800;margin:6mm 0 4mm;padding:2mm 3mm;border-top:1.2px solid ${ORANGE_DARK};border-bottom:1.2px solid ${ORANGE_DARK};break-after:avoid-page}.vmcCaissonSection .groupBlock h3{font-size:10.8pt;margin:2.5mm 0 2.8mm}\n"
if '.vmcCaissonTitle{' not in s:
    if css_group_old not in s:
        raise SystemExit('VMC report CSS heading target not found')
    s = s.replace(css_group_old, css_group_new, 1)

css_reserve_old = "    .reserveTable th:nth-child(1){width:26%}.reserveTable th:nth-child(2){width:55%}.reserveTable th:nth-child(3){width:19%;text-align:center}.reserveTable td:nth-child(1){background:#F6B888}.reserveTable td:nth-child(2){background:#FBE3D0}.reserveDateCell{text-align:center;white-space:nowrap;font-size:7.8pt}\n"
css_reserve_new = "    .reserveTable{font-size:7.9pt}.reserveTable thead{display:table-header-group}.reserveTable thead tr,.reserveTable thead th{height:auto!important;min-height:0!important}.reserveTable thead tr{break-inside:auto!important}.reserveTable th{padding:.9mm 1.05mm!important;line-height:1.08!important;vertical-align:middle}.reserveTable td{padding:1mm 1.05mm;line-height:1.14}.reserveTable th:nth-child(1){width:27%}.reserveTable th:nth-child(2){width:18%}.reserveTable th:nth-child(3){width:43%}.reserveTable th:nth-child(4){width:12%;text-align:center}.reserveTable td:nth-child(1){background:#F6B888}.reserveTable td:nth-child(2){background:#FBE3D0}.reserveTable td:nth-child(3){background:#FFF}.reserveDateCell{text-align:center;white-space:nowrap;font-size:7.5pt}\n"
if css_reserve_new not in s:
    if css_reserve_old not in s:
        raise SystemExit('compact reserve table CSS target not found')
    s = s.replace(css_reserve_old, css_reserve_new, 1)

p.write_text(s, encoding='utf-8')
print('Compact VMC report layout patched safely.')
