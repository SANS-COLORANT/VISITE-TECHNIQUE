from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label} marker not found')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Parameters -> LAB METRA tab
# ---------------------------------------------------------------------------
p = Path('ParametresScreen.js')
s = p.read_text(encoding='utf-8')
import_marker = "import { COLORS, styles } from './styles.js';\n"
lab_import = "import { LabMetraPanel } from './LabMetraPanel.js';\n"
if lab_import not in s:
    s = replace_once(s, import_marker, import_marker + lab_import, 'parameters import')

tabs_old = """      <TouchableOpacity style={[styles.paramTab,onglet==='donnees'&&styles.paramTabActive]} onPress={()=>setOnglet('donnees')}><Text style={[styles.paramTabText,onglet==='donnees'&&styles.paramTabTextActive]}>Données</Text></TouchableOpacity>
"""
tabs_new = tabs_old + """      <TouchableOpacity style={[styles.paramTab,onglet==='lab'&&styles.paramTabActive]} onPress={()=>setOnglet('lab')}><Text style={[styles.paramTabText,onglet==='lab'&&styles.paramTabTextActive]}>LAB METRA</Text></TouchableOpacity>
"""
if "setOnglet('lab')" not in s:
    s = replace_once(s, tabs_old, tabs_new, 'parameters LAB tab')

render_old = "    {onglet==='reserves'?<BibliothequeReserves/>:onglet==='equipements'?contenuEquipements:<GestionDonnees/>}\n"
render_new = "    {onglet==='reserves'?<BibliothequeReserves/>:onglet==='equipements'?contenuEquipements:onglet==='lab'?<LabMetraPanel/>:<GestionDonnees/>}\n"
s = replace_once(s, render_old, render_new, 'parameters LAB content')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# Site screen -> optional Santé tab
# ---------------------------------------------------------------------------
p = Path('SiteVisitesScreen.js')
s = p.read_text(encoding='utf-8')
import_marker = "import { exporterVisitesExcelEnLot } from './batchExcel.js';\n"
extra_imports = "import { getLabFeatureEnabled } from './featureSettings.js';\nimport { SiteHealthPanel } from './SiteHealthPanel.js';\n"
if extra_imports not in s:
    s = replace_once(s, import_marker, import_marker + extra_imports, 'site health imports')

state_marker = "  const [exportLotEnCours, setExportLotEnCours] = useState(false);\n"
state_line = "  const [healthLabEnabled, setHealthLabEnabled] = useState(false);\n"
if state_line not in s:
    s = replace_once(s, state_marker, state_marker + state_line, 'site health state')

effect_marker = "  useEffect(() => { charger(); }, [charger]);\n"
effect_line = "  useEffect(() => { getLabFeatureEnabled('health_dashboard').then(setHealthLabEnabled).catch(()=>setHealthLabEnabled(false)); }, []);\n"
if effect_line not in s:
    s = replace_once(s, effect_marker, effect_marker + effect_line, 'site health effect')

map_old = "      {SITE_TABS.map((tab) => {\n"
map_new = "      {(healthLabEnabled ? [...SITE_TABS, { id: 'sante', label: 'Santé' }] : SITE_TABS).map((tab) => {\n"
s = replace_once(s, map_old, map_new, 'site tabs map')

empty_old = """        ListEmptyComponent={siteTab === 'visites'
          ? <View style={styles.empty}><Text style={styles.emptyText}>Aucune visite pour ce site pour l'instant.</Text><Text style={styles.emptySub}>Lance la première avec le bouton ci-dessous.</Text></View>
          : <SiteOverviewPanel siteId={siteId} mode={siteTab} />}
"""
empty_new = """        ListEmptyComponent={siteTab === 'visites'
          ? <View style={styles.empty}><Text style={styles.emptyText}>Aucune visite pour ce site pour l'instant.</Text><Text style={styles.emptySub}>Lance la première avec le bouton ci-dessous.</Text></View>
          : siteTab === 'sante'
            ? <SiteHealthPanel siteId={siteId} siteName={nomSite} />
            : <SiteOverviewPanel siteId={siteId} mode={siteTab} />}
"""
s = replace_once(s, empty_old, empty_new, 'site health panel')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# Report screen -> optional health content toggle
# ---------------------------------------------------------------------------
p = Path('ReportScreen.js')
s = p.read_text(encoding='utf-8')
import_marker = "import{exporterRapportEdite,exporterRapportsParSiteEdites}from'./reportEditorExporter.js';\n"
health_import = "import{getLabFeatureEnabled}from'./featureSettings.js';\n"
if health_import not in s:
    s = replace_once(s, import_marker, import_marker + health_import, 'report health import')

state_old = " const[afficherLignesVides,setAfficherLignesVides]=useState(false),[materiel,setMateriel]=useState(true),[remarques,setRemarques]=useState(true),[inclurePhotos,setInclurePhotos]=useState(true);\n"
state_new = " const[afficherLignesVides,setAfficherLignesVides]=useState(false),[materiel,setMateriel]=useState(true),[remarques,setRemarques]=useState(true),[inclurePhotos,setInclurePhotos]=useState(true),[inclureSante,setInclureSante]=useState(false),[healthLabEnabled,setHealthLabEnabled]=useState(false);\n"
s = replace_once(s, state_old, state_new, 'report health state')

effect_marker = " useEffect(()=>{chargerListe().catch(e=>Alert.alert('Rapport',String(e?.message||e)))},[chargerListe]);\n"
effect_new = effect_marker + " useEffect(()=>{getLabFeatureEnabled('health_dashboard').then(setHealthLabEnabled).catch(()=>setHealthLabEnabled(false))},[]);\n"
if "getLabFeatureEnabled('health_dashboard').then(setHealthLabEnabled)" not in s:
    s = replace_once(s, effect_marker, effect_new, 'report health effect')

config_old = " const config={chrono,objet,dateRapport,afficherLignesVides,materiel,remarques,photos:inclurePhotos,coverUri,coverLabel,coverVisiteId,layout};\n"
config_new = " const config={chrono,objet,dateRapport,afficherLignesVides,materiel,remarques,photos:inclurePhotos,health:healthLabEnabled&&inclureSante,coverUri,coverLabel,coverVisiteId,layout};\n"
s = replace_once(s, config_old, config_new, 'report health config')

photos_toggle = "<Toggle label=\"Photographies\" value={inclurePhotos} onChange={setInclurePhotos} sub=\"Les originaux restent intacts ; seules les copies de travail du rapport sont compressées.\"/>"
health_toggle = photos_toggle + "{healthLabEnabled?<Toggle label=\"Santé du patrimoine (LAB)\" value={inclureSante} onChange={setInclureSante} sub=\"Mono-site : juste avant les photos. Multi-site : synthèse après le sommaire, avant le détail des sites.\"/>:null}"
if "Santé du patrimoine (LAB)" not in s:
    s = replace_once(s, photos_toggle, health_toggle, 'report health toggle')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# PDF/HTML report builder -> site health and multi-site health introduction
# ---------------------------------------------------------------------------
p = Path('reportBuilder.js')
s = p.read_text(encoding='utf-8')
import_marker = "import { chargerPreAllumageModulaire } from './preAllumageModularDb.js';\n"
health_import = "import { HEALTH_DIMENSIONS, aggregateSiteHealth, getSiteHealth } from './siteHealth.js';\n"
if health_import not in s:
    s = replace_once(s, import_marker, import_marker + health_import, 'builder health import')

photos_marker = "async function photosHtml(data, config, photosConfig) {\n"
health_functions = r'''function healthScoreClass(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'healthUnknown';
  if (n >= 80) return 'healthGood';
  if (n >= 60) return 'healthWatch';
  return 'healthPriority';
}

function healthScoreText(score) {
  return Number.isFinite(Number(score)) ? `${Math.round(Number(score))}/100` : 'N/C';
}

function healthDetailsText(health, key) {
  const d = health?.details || {};
  if (key === 'conformite') return `${d.controles?.s || 0} S · ${d.controles?.ns || 0} NS`;
  if (key === 'reserves') return `${d.reserves?.ouvertes || 0} ouverte(s) · ${d.reserves?.levees || 0} levée(s)`;
  if (key === 'equipements') return `${d.equipements?.actifs || 0} actif(s) · ${d.equipements?.aSurveiller || 0} à surveiller`;
  if (key === 'suivi') return d.visitAgeDays === null || d.visitAgeDays === undefined ? 'Aucune visite de référence' : `Visite il y a ${d.visitAgeDays} jour(s)`;
  if (key === 'donnees') return health?.source?.progression !== null && health?.source?.progression !== undefined ? `Progression ${health.source.progression}%` : 'Progression non disponible';
  return '';
}

export function construireSanteSiteHtml(health, siteName = 'Site', multi = false) {
  if (!health) return '';
  const manual = health.mode === 'manual';
  const rows = HEALTH_DIMENSIONS.map((dimension) => `<tr><td>${esc(dimension.label)}</td><td class="healthScore ${healthScoreClass(health.scores?.[dimension.key])}">${healthScoreText(health.scores?.[dimension.key])}</td><td>${esc(manual ? 'Appréciation manuelle' : healthDetailsText(health, dimension.key))}</td></tr>`).join('');
  const source = manual
    ? `Appréciation manuelle${health.settings?.updatedAt ? ` · mise à jour ${dateFr(String(health.settings.updatedAt).slice(0, 10))}` : ''}`
    : health.source?.date ? `Calcul depuis la visite du ${dateFr(health.source.date)}` : 'Données automatiques insuffisantes';
  const comment = manual && health.manualComment ? `<div class="healthComment"><b>Commentaire technique :</b> ${esc(health.manualComment)}</div>` : '';
  return `<section class="healthReport${multi ? ' healthMulti' : ''}"><div class="sectionBanner">SANTÉ DU PATRIMOINE — ${esc(siteName)}</div><div class="healthHeadline"><span class="healthBig ${healthScoreClass(health.overall)}">${healthScoreText(health.overall)}</span><span>${esc(health.level?.label || 'Données insuffisantes')}</span></div><div class="healthSource">${esc(source)}</div><table class="healthTable"><thead><tr><th>Indicateur</th><th>Indice</th><th>Lecture</th></tr></thead><tbody>${rows}</tbody></table>${comment}<div class="healthDisclaimer">Indice expérimental METRA d'aide au suivi patrimonial. Il ne remplace pas une conclusion réglementaire ou l'avis du technicien.</div></section>`;
}

function construireSanteMultiHtml(healthList, clientName) {
  if (!healthList?.length) return '';
  const aggregate = aggregateSiteHealth(healthList);
  const rows = healthList.map((health) => `<tr><td>${esc(health.siteName || 'Site')}</td><td class="healthScore ${healthScoreClass(health.overall)}">${healthScoreText(health.overall)}</td><td>${esc(health.level?.label || 'Données insuffisantes')}</td><td>${health.details?.reserves?.ouvertes || 0}</td><td>${health.details?.equipements?.aSurveiller || 0}</td></tr>`).join('');
  const dimensions = HEALTH_DIMENSIONS.map((dimension) => `<div class="healthMini"><span>${esc(dimension.label)}</span><b class="${healthScoreClass(aggregate.scores?.[dimension.key])}">${healthScoreText(aggregate.scores?.[dimension.key])}</b></div>`).join('');
  const lowest = aggregate.lowest ? `<div class="healthAlert">Site le plus faible : <b>${esc(aggregate.lowest.siteName || 'Site')} — ${healthScoreText(aggregate.lowest.overall)}</b></div>` : '';
  return `<section class="healthReport healthMulti"><div class="sectionBanner">SANTÉ DU PATRIMOINE — ${esc(clientName || 'CLIENT')}</div><div class="healthHeadline"><span class="healthBig ${healthScoreClass(aggregate.overall)}">${healthScoreText(aggregate.overall)}</span><span>${esc(aggregate.level?.label || 'Données insuffisantes')}</span></div><div class="healthSource">${aggregate.calculables}/${aggregate.sites} site(s) calculable(s) · ${aggregate.satisfaisants} satisfaisant(s) · ${aggregate.aSurveiller} à surveiller · ${aggregate.prioritaires} prioritaire(s)</div><div class="healthMiniGrid">${dimensions}</div>${lowest}<table class="healthTable"><thead><tr><th>Site</th><th>Indice</th><th>État</th><th>Réserves ouvertes</th><th>Équipements à surveiller</th></tr></thead><tbody>${rows}</tbody></table><div class="healthDisclaimer">La moyenne client ne masque pas les sites dégradés : le site le plus faible et les sites prioritaires restent signalés séparément.</div></section>`;
}

'''
if "export function construireSanteSiteHtml" not in s:
    if photos_marker not in s:
        raise SystemExit('builder photos marker not found')
    s = s.replace(photos_marker, health_functions + photos_marker, 1)

site_old = r'''async function siteHtml(data, config, photosConfig) {
  const sections = (data.sections || []).map((s) => sectionHtml(s, config)).join('');
  const reserves = reservesHtml(data, config);
  const photos = await photosHtml(data, config, photosConfig);
  const materiel = materielHtml(data, config);
  const local = data.visite.nom_local || data.visite.type_local || 'Installation technique';
  return `<article class="siteReport"><div class="siteStart"><h1>${esc(data.visite.nom_site || 'Site')}</h1><h4>${esc(local)}</h4></div>${sections}${reserves}${photos}${materiel}</article>`;
}
'''
site_new = r'''async function siteHtml(data, config, photosConfig) {
  const sections = (data.sections || []).map((s) => sectionHtml(s, config)).join('');
  const reserves = reservesHtml(data, config);
  const materiel = materielHtml(data, config);
  const health = config.health ? await getSiteHealth(data.visite.site_id, data.visite.id) : null;
  const healthHtml = config.health ? construireSanteSiteHtml(health, data.visite.nom_site || 'Site', false) : '';
  const photos = await photosHtml(data, config, photosConfig);
  const local = data.visite.nom_local || data.visite.type_local || 'Installation technique';
  return `<article class="siteReport"><div class="siteStart"><h1>${esc(data.visite.nom_site || 'Site')}</h1><h4>${esc(local)}</h4></div>${sections}${reserves}${materiel}${healthHtml}${photos}</article>`;
}
'''
s = replace_once(s, site_old, site_new, 'builder site health placement')

css_marker = "    .interiorHeader{position:fixed;top:3mm;left:9mm;right:9mm;height:10mm;z-index:4}.interiorHeader img{width:20mm;height:9mm;object-fit:contain;object-position:left center}.interiorHeader span{position:absolute;right:0;top:2mm;font-size:8.5pt;font-weight:700;text-transform:uppercase}\n"
health_css = "    .healthReport{page-break-before:always;page-break-after:always;padding-top:5mm}.healthReport.healthMulti{page-break-before:auto}.healthHeadline{display:flex;align-items:flex-end;gap:4mm;margin:3mm 0 1mm}.healthBig{font-size:28pt;font-weight:900}.healthSource{font-size:8.5pt;color:#666;margin-bottom:4mm}.healthTable th:nth-child(1){width:31%}.healthTable th:nth-child(2){width:14%;text-align:center}.healthTable td:nth-child(2){text-align:center;font-weight:900}.healthTable th:nth-child(3){width:55%}.healthGood{color:#2E7D32!important}.healthWatch{color:#B45309!important}.healthPriority{color:#B91C1C!important}.healthUnknown{color:#777!important}.healthMiniGrid{display:flex;flex-wrap:wrap;gap:2mm;margin:4mm 0}.healthMini{width:31%;border:1px solid #ddd;padding:2mm}.healthMini span{display:block;font-size:7.5pt;color:#666}.healthMini b{font-size:12pt}.healthAlert{background:#FFF1EA;border:1px solid #F4B38E;padding:2.5mm;margin:3mm 0}.healthComment{margin-top:3mm;padding:2.5mm;border-left:2mm solid #F26426;background:#FFF8F3}.healthDisclaimer{font-size:7.2pt;color:#777;margin-top:3mm;font-style:italic}\n"
if ".healthReport{" not in s:
    s = replace_once(s, css_marker, health_css + css_marker, 'builder health CSS')

construct_old = r'''export async function construireHtmlRapport(datas, config, photosConfig = [], output = 'pdf') {
  const contenus = [];
  for (const d of datas) contenus.push(await siteHtml(d, config, photosConfig));

  const client = datas[0]?.visite?.nom_client || 'Rapport';
'''
construct_new = r'''export async function construireHtmlRapport(datas, config, photosConfig = [], output = 'pdf') {
  const multi = (datas || []).length > 1;
  const contenus = [];
  for (const d of datas) contenus.push(await siteHtml(d, multi ? { ...config, health: false } : config, photosConfig));

  const healthList = [];
  if (config.health && multi) {
    for (const d of datas) {
      const health = await getSiteHealth(d.visite.site_id, d.visite.id);
      healthList.push({ ...health, siteName: d.visite.nom_site || 'Site' });
    }
  }
  const client = datas[0]?.visite?.nom_client || 'Rapport';
'''
s = replace_once(s, construct_old, construct_new, 'builder multi health preparation')

insert_old = "    ${toc}\n    <div class=\"intro\">\n"
insert_new = "    ${toc}\n    ${config.health && multi ? construireSanteMultiHtml(healthList, client) : ''}\n    <div class=\"intro\">\n"
s = replace_once(s, insert_old, insert_new, 'builder multi health insertion')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# True DOCX report -> same health positioning as PDF
# ---------------------------------------------------------------------------
p = Path('wordDocxExporter.js')
s = p.read_text(encoding='utf-8')
import_marker = "import { REPORT_COVER, REPORT_LOGO } from './reportBrandAssets.js';\n"
health_import = "import { HEALTH_DIMENSIONS, aggregateSiteHealth, getSiteHealth } from './siteHealth.js';\n"
if health_import not in s:
    s = replace_once(s, import_marker, import_marker + health_import, 'docx health import')

report_rows_marker = "function reportRows(group, includeEmpty) {\n"
docx_health = r'''function docxHealthColor(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return '777777';
  if (n >= 80) return '2E7D32';
  if (n >= 60) return 'B45309';
  return 'B91C1C';
}

function docxHealthText(score) {
  return Number.isFinite(Number(score)) ? `${Math.round(Number(score))}/100` : 'N/C';
}

function siteHealthXml(health, siteName) {
  if (!health) return '';
  const out = [];
  out.push(paragraph(`SANTÉ DU PATRIMOINE — ${siteName || 'Site'}`, { bold: true, size: 25, color: 'F26426', align: 'center', pageBreakBefore: true, after: 100 }));
  out.push(paragraph(`${docxHealthText(health.overall)} · ${health.level?.label || 'Données insuffisantes'}`, { bold: true, size: 32, color: docxHealthColor(health.overall), align: 'center', after: 70 }));
  const source = health.mode === 'manual' ? 'Appréciation manuelle' : health.source?.date ? `Calcul depuis la visite du ${dateFr(health.source.date)}` : 'Données automatiques insuffisantes';
  out.push(paragraph(source, { size: 17, color: '666666', align: 'center', after: 100 }));
  out.push(table([['Indicateur', 'Indice'], ...HEALTH_DIMENSIONS.map((dimension) => [dimension.label, docxHealthText(health.scores?.[dimension.key])])], [6500, 2200]));
  if (health.mode === 'manual' && health.manualComment) out.push(paragraph(`Commentaire technique : ${health.manualComment}`, { size: 18, after: 100 }));
  out.push(paragraph("Indice expérimental METRA d'aide au suivi patrimonial. Il ne remplace pas une conclusion réglementaire ou l'avis du technicien.", { size: 15, color: '777777', after: 120 }));
  return out.join('');
}

function multiHealthXml(items, clientName) {
  if (!items?.length) return '';
  const aggregate = aggregateSiteHealth(items);
  const out = [];
  out.push(paragraph(`SANTÉ DU PATRIMOINE — ${clientName || 'Client'}`, { bold: true, size: 28, color: 'F26426', align: 'center', after: 100 }));
  out.push(paragraph(`${docxHealthText(aggregate.overall)} · ${aggregate.level?.label || 'Données insuffisantes'}`, { bold: true, size: 34, color: docxHealthColor(aggregate.overall), align: 'center', after: 60 }));
  out.push(paragraph(`${aggregate.calculables}/${aggregate.sites} site(s) calculable(s) · ${aggregate.satisfaisants} satisfaisant(s) · ${aggregate.aSurveiller} à surveiller · ${aggregate.prioritaires} prioritaire(s)`, { size: 17, align: 'center', after: 100 }));
  if (aggregate.lowest) out.push(paragraph(`Site le plus faible : ${aggregate.lowest.siteName || 'Site'} — ${docxHealthText(aggregate.lowest.overall)}`, { bold: true, size: 18, color: docxHealthColor(aggregate.lowest.overall), after: 100 }));
  out.push(table([['Site', 'Indice', 'État'], ...items.map((item) => [item.siteName || 'Site', docxHealthText(item.overall), item.level?.label || 'Données insuffisantes'])], [4300, 1900, 2500]));
  out.push(paragraph('La moyenne client ne masque pas les sites dégradés : le site le plus faible et les sites prioritaires restent signalés séparément.', { size: 15, color: '777777', after: 120 }));
  return out.join('');
}

'''
if "function siteHealthXml" not in s:
    if report_rows_marker not in s:
        raise SystemExit('docx report rows marker not found')
    s = s.replace(report_rows_marker, docx_health + report_rows_marker, 1)

signature_old = "function siteDocumentXml(data, config, imageByPhotoId) {\n"
signature_new = "function siteDocumentXml(data, config, imageByPhotoId, health = null, multi = false) {\n"
s = replace_once(s, signature_old, signature_new, 'docx site signature')

photos_old = """  const photos = [...imageByPhotoId.values()].filter((image) => image.visiteId === data.visite.id);
  if (config.photos !== false && photos.length) {
"""
photos_new = """  if (config.health && !multi && health) out.push(siteHealthXml(health, site));

  const photos = [...imageByPhotoId.values()].filter((image) => image.visiteId === data.visite.id);
  if (config.photos !== false && photos.length) {
"""
s = replace_once(s, photos_old, photos_new, 'docx site health placement')

body_marker = "  const body = [];\n"
health_prepare = """  const healthItems = [];
  if (config.health) {
    for (const data of datas || []) {
      const health = await getSiteHealth(data.visite.site_id, data.visite.id);
      healthItems.push({ ...health, siteName: data.visite.nom_site || 'Site', visiteId: data.visite.id });
    }
  }
  const healthByVisit = new Map(healthItems.map((item) => [item.visiteId, item]));

  const body = [];
"""
s = replace_once(s, body_marker, health_prepare, 'docx health preparation')

cover_break = "  body.push(pageBreak());\n\n  for (let index = 0; index < (datas || []).length; index += 1) {\n"
intro_insert = """  body.push(pageBreak());

  const multi = (datas || []).length > 1;
  if (multi) {
    body.push(paragraph('SOMMAIRE', { bold: true, size: 30, color: 'F26426', after: 120 }));
    for (const data of datas || []) body.push(paragraph(`${data.visite?.nom_site || 'Site'} · ${dateFr(data.visite?.date_visite)}`, { size: 20, after: 70 }));
    body.push(pageBreak());
    if (config.health && healthItems.length) {
      body.push(multiHealthXml(healthItems, client));
      body.push(pageBreak());
    }
  }

  for (let index = 0; index < (datas || []).length; index += 1) {
"""
s = replace_once(s, cover_break, intro_insert, 'docx multi health introduction')

call_old = "    body.push(siteDocumentXml(data, config, siteImages));\n"
call_new = "    body.push(siteDocumentXml(data, config, siteImages, healthByVisit.get(data.visite.id) || null, multi));\n"
s = replace_once(s, call_old, call_new, 'docx health call')
p.write_text(s, encoding='utf-8')

print('METRA LAB health wired into Parameters, site dashboard, PDF and DOCX reports.')
