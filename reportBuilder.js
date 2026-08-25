import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as ImageManipulator from 'expo-image-manipulator';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getDb, listerMateriel } from './db.js';
import { obtenirTrame, DEFAULT_TRAME_ID, normaliserSectionCode } from './trameRegistry.js';
import { REPORT_COVER, REPORT_LOGO, REPORT_OPQIBI } from './reportBrandAssets.js';

const MIME_PDF = 'application/pdf';
const MIME_WORD = 'application/msword';
const ORANGE = '#F07E31';
const ORANGE_DARK = '#EF720B';
const PEACH = '#F8CBAD';
const GREY = '#595959';

const REPORT_SECTION_META = Object.freeze({
  'p-infos': { titre: 'INFORMATIONS GÉNÉRALES', banner: true },
  'p-distrib': { titre: null, banner: false },
  'p-regulation': { titre: 'PARAMÈTRES DE RÉGULATION', banner: true },
  'p-releves': { titre: 'RELEVÉS DES INDICATEURS', banner: true, breakBefore: true },
  'p-conf-local': { titre: 'CONFORMITÉ LOCAL', banner: true, breakBefore: true },
  'p-conf-energie': { titre: 'CONFORMITÉ ÉNERGIE', banner: true, breakBefore: true },
  'p-conf-chauffage': { titre: 'CONFORMITÉ CHAUFFAGE', banner: true, breakBefore: true },
  'p-conf-ecs': { titre: 'CONFORMITÉ ECS', banner: true, breakBefore: true },
  'p-conf-adouc': { titre: 'CONFORMITÉ ADOUCISSEUR', banner: true, breakBefore: true },
});

function esc(v = '') {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function court(v = '', max = 52) {
  const brut = String(v || '').split('||')[0].replace(/\s+/g, ' ').trim();
  if (!brut) return '';
  const phrase = brut.split(/[\n.;!?]/)[0].trim() || brut;
  return phrase.length > max ? `${phrase.slice(0, max - 1).trim()}…` : phrase;
}

function propre(v = 'Rapport') {
  return String(v || 'Rapport')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'Rapport';
}

function dateFr(v) {
  if (!v) return '';
  const m = String(v).slice(0, 10).split('-');
  return m.length === 3 ? `${m[2]}/${m[1]}/${m[0]}` : String(v);
}

function valeurChamp(champs, cle) {
  const row = (champs || []).find((r) => r.cle === cle && String(r.valeur ?? '').trim() !== '');
  return row?.valeur || '';
}

function titreLocalDepuisChamps(champs) {
  return court(valeurChamp(champs, 'Nom du local') || valeurChamp(champs, 'Type de LT') || 'Installation technique', 80);
}

function typeLocalDepuisChamps(champs) {
  return court(valeurChamp(champs, 'Type de LT') || '', 80);
}

function titreSectionRapport(panelId, fallback) {
  return REPORT_SECTION_META[panelId]?.titre || fallback || panelId;
}

function classeAvis(avis) {
  const v = String(avis || '').trim().toUpperCase();
  if (v === 'S') return 'avisOk';
  if (v === 'N.S' || v === 'NS') return 'avisKo';
  return '';
}

function chunk(array, taille) {
  const out = [];
  for (let i = 0; i < array.length; i += taille) out.push(array.slice(i, i + taille));
  return out;
}

export async function finaliserVisiteRapport(visiteId) {
  const db = await getDb();
  await db.runAsync(`UPDATE visites SET statut='terminee', modifie_le=datetime('now') WHERE id=?`, [visiteId]);
}

export async function rouvrirVisiteRapport(visiteId) {
  const db = await getDb();
  await db.runAsync(`UPDATE visites SET statut='en_cours', modifie_le=datetime('now') WHERE id=?`, [visiteId]);
}

export async function listerVisitesRapportClient(clientId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT v.id,v.date_visite,v.statut,v.progression_pct,v.trame_id,v.technicien,
            s.id site_id,s.nom_site,s.adresse,c.nom nom_client
     FROM visites v
     JOIN sites s ON s.id=v.site_id
     JOIN clients c ON c.id=s.client_id
     WHERE c.id=?
     ORDER BY s.nom_site COLLATE NOCASE, COALESCE(v.date_visite,'') DESC, v.modifie_le DESC`,
    [clientId]
  );
}

export async function chargerDonneesVisiteRapport(visiteId) {
  const db = await getDb();
  const visite = await db.getFirstAsync(
    `SELECT v.*,s.nom_site,s.adresse,c.id client_id,c.nom nom_client
     FROM visites v
     JOIN sites s ON s.id=v.site_id
     JOIN clients c ON c.id=s.client_id
     WHERE v.id=?`,
    [visiteId]
  );
  if (!visite) throw new Error('Visite introuvable');

  const trame = obtenirTrame(visite.trame_id || DEFAULT_TRAME_ID);
  const [champs, controles, reseaux, compteurs, remarques, photos, materiel, note] = await Promise.all([
    db.getAllAsync(`SELECT * FROM champs_visite WHERE visite_id=?`, [visiteId]),
    db.getAllAsync(`SELECT * FROM controles_visite WHERE visite_id=?`, [visiteId]),
    db.getAllAsync(`SELECT * FROM reseaux WHERE visite_id=? ORDER BY ordre,id`, [visiteId]),
    db.getAllAsync(`SELECT * FROM compteurs WHERE visite_id=? ORDER BY rowid`, [visiteId]),
    db.getAllAsync(`SELECT * FROM remarques WHERE visite_id=? ORDER BY cree_le,id`, [visiteId]),
    db.getAllAsync(`SELECT * FROM photos WHERE visite_id=? ORDER BY cree_le,id`, [visiteId]),
    listerMateriel(visiteId),
    db.getFirstAsync(`SELECT contenu FROM notes WHERE visite_id=?`, [visiteId]),
  ]);

  const champMap = new Map(champs.map((r) => [`${r.section_code}||${r.cle}`, r.valeur || '']));
  const ctrlMap = new Map(controles.map((r) => [`${r.section_code}||${r.cle}`, r]));
  const sections = [];

  for (const panelId of trame.ui?.tabOrder || []) {
    if (panelId === 'SEP' || ['p-equip', 'p-remarques', 'p-photos'].includes(panelId)) continue;
    const groups = [];

    for (const [section, fields] of Object.entries(trame.ui?.panels?.[panelId] || {})) {
      if (panelId === 'p-infos' && section === 'Général') continue;
      const code = normaliserSectionCode(panelId, section);
      groups.push({
        title: section,
        rows: (fields || []).map((f) => {
          const controle = ctrlMap.get(`${code}||${f.cle}`);
          return {
            label: f.cle,
            type: f.type,
            avis: f.type === 'controle' ? (controle?.avis || '') : '',
            comment: f.type === 'controle' ? (controle?.commentaire || '') : (champMap.get(`${code}||${f.cle}`) || ''),
          };
        }),
      });
    }

    if (panelId === 'p-regulation') {
      reseaux.forEach((r, i) => groups.push({
        title: r.nom_reseau || `Réseau n°${i + 1}`,
        rows: [
          { label: 'T°ext(°C)', type: 'champ', avis: '', comment: r.t_ext_c || '' },
          { label: 'T°dép(°C)', type: 'champ', avis: '', comment: r.t_dep_c || '' },
          { label: 'Nom réseau', type: 'champ', avis: '', comment: r.nom_reseau || '' },
          { label: 'Courbe de chauffe', type: 'champ', avis: '', comment: r.courbe_de_chauffe || '' },
          { label: 'TNC', type: 'champ', avis: '', comment: r.tnc || '' },
          { label: 'Consigne et Programme horaire', type: 'champ', avis: '', comment: r.consigne_programme_horaire || '' },
        ],
      }));
    }

    if (panelId === 'p-releves' && compteurs.length) {
      groups.push({
        title: 'Compteurs complémentaires',
        rows: compteurs.map((c) => ({
          label: c.label || 'Compteur',
          type: 'champ',
          avis: '',
          comment: [c.valeur, c.unite].filter(Boolean).join(' '),
        })),
      });
    }

    sections.push({
      panelId,
      title: titreSectionRapport(panelId, trame.ui.labels?.[panelId]),
      banner: REPORT_SECTION_META[panelId]?.banner === true,
      breakBefore: REPORT_SECTION_META[panelId]?.breakBefore === true,
      groups,
    });
  }

  const localName = titreLocalDepuisChamps(champs);
  const localType = typeLocalDepuisChamps(champs);
  return {
    visite: { ...visite, nom_local: localName, type_local: localType },
    trame,
    sections,
    remarques,
    photos,
    materiel,
    reseaux,
    compteurs,
    note: note?.contenu || '',
  };
}

function libelleReserveCourt(remarque) {
  const rattachement = court(remarque?.reference_libelle || '', 48);
  if (rattachement) return rattachement;
  const prestation = court(remarque?.prestation || '', 48);
  return prestation || 'Réserve';
}

function libellePhoto(photo, data) {
  const key = String(photo.entite_key || '');
  const [type, id] = key.split('||');

  if (type === 'remarque') {
    const r = data.remarques.find((x) => x.id === id);
    return libelleReserveCourt(r);
  }
  if (type === 'materiel' || type === 'equipement') {
    const m = data.materiel.find((x) => x.id === id || x.equipement_id === id);
    return court(m?.designation || m?.categorie || 'Équipement', 60);
  }
  if (type === 'compteur' || type === 'compteur_site') {
    const c = data.compteurs?.find((x) => x.id === id || x.compteur_site_id === id);
    return court(c?.label || 'Compteur', 60);
  }
  if (type === 'reseau' || type === 'reseau_site') {
    const r = data.reseaux?.find((x) => x.id === id || x.reseau_site_id === id);
    return court(r?.nom_reseau || 'Réseau', 60);
  }

  const saved = court(photo.label || '', 60);
  return saved || 'Photo générale';
}

export function preparerPhotosRapport(data, existantes = []) {
  const ancien = new Map((existantes || []).map((x) => [x.id, x]));
  return data.photos.map((p, i) => ({
    id: p.id,
    uri: p.uri,
    visiteId: data.visite.id,
    siteId: data.visite.site_id,
    siteLabel: data.visite.nom_site || 'Site',
    localLabel: data.visite.nom_local || data.visite.type_local || 'Installation technique',
    label: ancien.get(p.id)?.label || libellePhoto(p, data),
    include: ancien.get(p.id)?.include !== false,
    ordre: ancien.get(p.id)?.ordre ?? i,
    entiteKey: p.entite_key || null,
  })).sort((a, b) => a.ordre - b.ordre);
}

async function imageRapportBase64(uri) {
  try {
    const r = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 900 } }],
      { compress: 0.55, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return r.base64 ? `data:image/jpeg;base64,${r.base64}` : null;
  } catch {
    return null;
  }
}

function tableHtml(group, afficherLignesVides) {
  const rows = (group.rows || []).filter((r) => afficherLignesVides || String(r.avis || r.comment || '').trim());
  if (!rows.length) return '';

  return `<div class="groupBlock"><h3>${esc(group.title)}</h3><table class="techTable"><thead><tr><th class="labelCol">Intitulé</th><th class="avisCol">Avis</th><th>Commentaire</th></tr></thead><tbody>${rows.map((r) => {
    const comment = String(r.comment || '').trim() || '/';
    const avis = String(r.avis || '').trim();
    const champClass = r.type === 'champ' ? 'champAvis' : '';
    return `<tr><td class="labelCell">${esc(r.label)}</td><td class="avisCell ${champClass} ${classeAvis(avis)}">${esc(avis)}</td><td>${esc(comment)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function sectionHtml(section, config) {
  const inner = (section.groups || []).map((g) => tableHtml(g, config.afficherLignesVides)).join('');
  if (!inner) return '';
  const banner = section.banner && section.title ? `<div class="sectionBanner">${esc(section.title)}</div>` : '';
  const breakClass = section.breakBefore ? ' pageBreakBefore' : '';
  return `<section class="reportSection${breakClass}">${banner}${inner}</section>`;
}

function reservesHtml(data, config) {
  if (!config.remarques) return '';
  const lignes = data.remarques || [];
  if (!lignes.length && !config.afficherLignesVides) return '';
  const rows = lignes.length ? lignes : [{ poste: '', prestation: '', cree_le: '' }];
  return `<section class="reportSection pageBreakBefore"><div class="sectionBanner">REMARQUES PARTICULIÈRES</div><table class="reserveTable"><thead><tr><th>Poste</th><th>Prestation</th><th>Date de la réserve</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.poste || 'Remarques particulières')}</td><td>${esc(r.prestation || '/')}</td><td class="reserveDateCell">${esc(dateFr(String(r.cree_le || '').slice(0, 10)) || '/')}</td></tr>`).join('')}</tbody></table></section>`;
}

function materielHtml(data, config) {
  if (!config.materiel) return '';
  const lignes = data.materiel || [];
  if (!lignes.length && !config.afficherLignesVides) return '';
  const rows = lignes.length ? lignes : [{}];
  return `<section class="reportSection pageBreakBefore"><div class="sectionBanner">LISTING MATÉRIEL</div><table class="materialTable"><thead><tr><th>Catégorie</th><th class="qty">Nombre</th><th>Désignation</th><th>Marque</th><th>Modèle</th><th class="year">Année</th></tr></thead><tbody>${rows.map((m) => `<tr><td>${esc(m.categorie || '')}</td><td class="qty">${esc(m.nombre || 1)}</td><td>${esc(m.designation || '')}</td><td>${esc(m.marque || '')}</td><td>${esc(m.modele || '')}</td><td class="year">${esc(m.annee || '')}</td></tr>`).join('')}</tbody></table></section>`;
}

async function photosHtml(data, config, photosConfig) {
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

  return chunk(prepared, 6).map((page) => `<section class="photoPage pageBreakBefore"><div class="sectionBanner">PHOTOGRAPHIES</div><div class="photoGrid">${page.map((p) => `<div class="photoCard"><div class="photoImageWrap"><img src="${p.src}"/></div><div class="photoCaption">${esc(p.label || 'Photo')}</div></div>`).join('')}</div></section>`).join('');
}

async function siteHtml(data, config, photosConfig) {
  const sections = (data.sections || []).map((s) => sectionHtml(s, config)).join('');
  const reserves = reservesHtml(data, config);
  const photos = await photosHtml(data, config, photosConfig);
  const materiel = materielHtml(data, config);
  const local = data.visite.nom_local || data.visite.type_local || 'Installation technique';
  return `<article class="siteReport"><div class="siteStart"><h1>${esc(data.visite.nom_site || 'Site')}</h1><h4>${esc(local)}</h4></div>${sections}${reserves}${photos}${materiel}</article>`;
}

function logoHtml(classe = 'reportLogo') {
  return `<img class="${classe}" src="${REPORT_LOGO}" alt="Energie & Service"/>`;
}

function footerCorporateHtml() {
  return `<div class="coverFooter">
    <div class="cities"><b>VERSAILLES</b><span>NANTES</span><span>TOURS</span><span>RENNES</span><span>LYON</span><span>BORDEAUX</span></div>
    <div class="contactBar"><div class="contactOrange">Tél. 01 39 55 17 20 - 21 avenue Georges Pompidou - 69486 LYON CEDEX 3 - contact@energieetservice.fr</div><div class="website">energieetservice.fr</div></div>
    <div class="legalRow"><img src="${REPORT_OPQIBI}" alt="OPQIBI"/><div>SAS au capital de 292 500 € - Siège social : 64 avenue de Paris - 78000 Versailles - RCS Versailles B 338 335 201 / NAF 7112B</div></div>
  </div>`;
}

function cssRapport(output = 'pdf') {
  const fixedUi = output === 'word' ? `
    .interiorHeader{display:block}.interiorFooter{display:flex}
  ` : `
    .interiorHeader,.interiorFooter{display:none}
  `;
  return `
    @page{size:A4;margin:20mm 18mm 29mm 18mm}
    *{box-sizing:border-box}
    html,body{padding:0;margin:0}
    body{font-family:'PT Sans',Arial,Helvetica,sans-serif;color:#111;font-size:9.1pt;line-height:1.22}
    .cover{height:248mm;position:relative;page-break-after:always;background:#fff;z-index:20;margin:-7mm 0 -15mm}
    .reportLogo{display:block;width:72mm;height:auto;object-fit:contain}
    .cover .reportLogo{position:absolute;left:0;top:0;width:78mm}
    .coverDate{position:absolute;right:2mm;top:22mm;font-size:11pt;text-transform:uppercase}
    .ref{position:absolute;left:13mm;top:42mm;font-size:11pt;font-weight:700;text-decoration:underline}
    .coverClient{position:absolute;left:9%;right:9%;top:58mm;background:${ORANGE};color:#fff;border-radius:6mm;text-align:center;padding:8mm 6mm;font-size:23pt;font-weight:700;z-index:3}
    .coverVisual{position:absolute;left:6%;right:6%;top:80mm;height:89mm;overflow:hidden;background:#eee}
    .coverVisual img{width:100%;height:100%;object-fit:cover;display:block}
    .coverObject{position:absolute;left:8%;right:8%;top:182mm;text-align:center;font-size:16pt;font-weight:700}
    .coverBusiness{position:absolute;left:0;right:0;top:199mm;text-align:center;font-size:7.7pt;font-weight:700;color:#555;white-space:nowrap}
    .coverBusiness span{margin:0 2.2mm}
    .coverFooter{position:absolute;left:-18mm;right:-18mm;bottom:-2mm;color:#666;font-size:7pt}
    .cities{text-align:center;margin-bottom:2mm;letter-spacing:.1mm}.cities>*{margin:0 2.2mm}.cities b{color:${ORANGE_DARK}}
    .contactBar{display:flex;height:10mm}.contactOrange{flex:1;background:${ORANGE_DARK};color:#fff;padding:3mm 3mm 2mm;text-align:center;font-size:7.3pt;letter-spacing:.15mm}.website{width:42mm;background:${GREY};color:#fff;font-size:12pt;font-weight:700;display:flex;align-items:center;justify-content:center}
    .legalRow{display:flex;align-items:center;gap:3mm;padding:1.2mm 5mm 0;font-size:6.7pt;color:#666}.legalRow img{width:20mm;height:8mm;object-fit:contain}
    .toc,.intro,.siteReport{position:relative}
    .toc{page-break-after:always;padding-top:4mm}.tocBrand{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:9mm}.tocBrand img{width:16mm;height:10mm;object-fit:contain;object-position:left center}.tocRunning{font-size:10pt;font-weight:700;text-transform:uppercase;margin-top:2mm}
    .tocTitle{font-size:22pt;font-weight:800;margin:0 0 11mm 6mm;position:relative;text-transform:uppercase}.tocTitle:before{content:'';position:absolute;left:-6mm;top:0;width:1.6mm;height:9mm;background:${ORANGE_DARK};box-shadow:2.3mm 0 0 ${ORANGE}}
    .tocSite{font-size:14pt;font-weight:800;margin:4mm 0 2mm}.tocRow{display:flex;align-items:flex-end;margin-left:9mm;font-size:11pt;padding:1.4mm 0}.tocDots{flex:1;border-bottom:1px dotted #888;margin:0 2mm 1.5mm}.tocMeta{font-size:8.5pt;color:#666}
    .intro{page-break-after:always;padding-top:5mm}.introTitle{font-size:20pt;text-decoration:underline;margin:10mm 0 8mm;font-weight:800}.intro p{font-size:11.5pt;line-height:1.55}.introLead{text-decoration:underline}.intro ul{font-size:11.5pt;line-height:1.5;margin-top:5mm}
    .siteStart{text-align:center;margin:5mm 0 6mm}.siteStart h1{font-size:22pt;text-decoration:underline;margin:0 0 6mm}.siteStart h4{font-size:16pt;text-decoration:underline;margin:0}
    .reportSection{margin:0 0 4mm}.pageBreakBefore{page-break-before:always;padding-top:5mm}.sectionBanner{width:84%;margin:0 auto 5mm;background:${ORANGE};color:#fff;border:1px solid #111;text-align:center;font-size:14pt;font-weight:800;padding:1.9mm 3mm}
    .groupBlock{break-inside:avoid-page;margin-bottom:4.5mm}.groupBlock h3{text-align:center;text-decoration:underline;font-size:11.5pt;margin:3mm 0 3.5mm}
    table{width:100%;border-collapse:collapse;margin-bottom:3mm;font-size:8.2pt;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid-page}
    th,td{border:.8px solid #111;padding:1.25mm 1.3mm;vertical-align:middle;overflow-wrap:anywhere}th{text-align:left;font-weight:800;background:#fff}
    .techTable .labelCol{width:30%}.techTable .avisCol{width:8%}.techTable .labelCell{background:${PEACH}}.techTable .avisCell{text-align:center}.techTable .avisCell.champAvis{background:#929292;color:#111}.techTable .avisOk{color:#008c1a;font-weight:800}.techTable .avisKo{color:#c51f1f;font-weight:800}
    .reserveTable th:nth-child(1){width:26%}.reserveTable th:nth-child(2){width:55%}.reserveTable th:nth-child(3){width:19%;text-align:center}.reserveTable td:nth-child(1){background:#F6B888}.reserveTable td:nth-child(2){background:#FBE3D0}.reserveDateCell{text-align:center;white-space:nowrap;font-size:7.8pt}
    .materialTable th:nth-child(1){width:17%}.materialTable th:nth-child(2){width:9%}.materialTable th:nth-child(3){width:27%}.materialTable th:nth-child(4){width:19%}.materialTable th:nth-child(5){width:20%}.materialTable th:nth-child(6){width:8%}.materialTable td:nth-child(1),.materialTable td:nth-child(3){background:#F6B888}.materialTable td:nth-child(2),.materialTable td:nth-child(4){background:#FBE3D0}.qty,.year{text-align:center}
    .photoPage{min-height:235mm}.photoGrid{display:grid;grid-template-columns:1fr 1fr;gap:5mm 11mm}.photoCard{min-height:65mm;border:1px solid #111;break-inside:avoid-page;display:flex;flex-direction:column;background:#fff}.photoImageWrap{height:50mm;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fff}.photoImageWrap img{width:100%;height:100%;object-fit:contain;display:block}.photoCaption{min-height:13mm;background:${PEACH};border-top:1px solid #111;display:flex;align-items:center;justify-content:center;text-align:center;font-size:9pt;line-height:1.15;padding:1.5mm 2mm;overflow-wrap:anywhere}
    .interiorHeader{position:fixed;top:3mm;left:9mm;right:9mm;height:10mm;z-index:4}.interiorHeader img{width:20mm;height:9mm;object-fit:contain;object-position:left center}.interiorHeader span{position:absolute;right:0;top:2mm;font-size:8.5pt;font-weight:700;text-transform:uppercase}
    .interiorFooter{position:fixed;left:18mm;right:0;bottom:5mm;align-items:flex-end;justify-content:space-between;color:#777;font-size:7pt;line-height:1.25}.interiorBadge{display:flex;color:#fff}.interiorArrow{background:#666;padding:2mm 3mm}.interiorPage{background:${ORANGE};padding:2mm 5mm;min-width:18mm;text-align:center}
    ${fixedUi}
  `;
}

function construireToc(datas, config) {
  if ((datas || []).length <= 1) return '';
  const groupes = [];
  const bySite = new Map();
  for (const data of datas) {
    const key = data.visite.site_id || data.visite.nom_site || data.visite.id;
    if (!bySite.has(key)) {
      const g = { site: data.visite.nom_site || 'Site', items: [] };
      bySite.set(key, g);
      groupes.push(g);
    }
    bySite.get(key).items.push(data);
  }
  return `<div class="toc"><div class="tocBrand">${logoHtml('tocLogo')}<div class="tocRunning">${esc(config.objet || 'Compte rendu de visite technique')}</div></div><div class="tocTitle">Sommaire</div>${groupes.map((g) => `<div class="tocSite">${esc(g.site)}</div>${g.items.map((d) => `<div class="tocRow"><span>${esc(d.visite.nom_local || d.visite.type_local || 'Installation technique')}</span><span class="tocDots"></span><span class="tocMeta">${esc(dateFr(d.visite.date_visite))}</span></div>`).join('')}`).join('')}</div>`;
}

function wordInteriorDecor(config, siteFooter) {
  return `<div class="interiorHeader">${logoHtml('interiorLogo')}<span>${esc(config.objet || 'Compte rendu de visite technique')}</span></div><div class="interiorFooter"><div>Nos réf. : ${esc(config.chrono || '')}<br/>Site : ${esc(siteFooter)}<br/>Objet : ${esc(config.objet || '')}</div><div class="interiorBadge"><span class="interiorArrow">→</span><span class="interiorPage">Page</span></div></div>`;
}

export async function construireHtmlRapport(datas, config, photosConfig = [], output = 'pdf') {
  const contenus = [];
  for (const d of datas) contenus.push(await siteHtml(d, config, photosConfig));

  const client = datas[0]?.visite?.nom_client || 'Rapport';
  const dateRapport = dateFr(config.dateRapport || new Date().toISOString().slice(0, 10));
  const sites = [...new Set(datas.map((d) => d.visite.nom_site).filter(Boolean))];
  const siteFooter = sites.length === 1 ? sites[0] : `${sites.length} sites sélectionnés`;
  const toc = construireToc(datas, config);

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
    ${toc}
    <div class="intro">
      <div class="introTitle">Présentation de la trame de visite des installations</div>
      <p>Pour chaque chaufferie, sous-station chauffage et sous-station ECS, une fiche de conformité a été remplie.</p>
      <p>Dans ce compte rendu nous vous présentons un résumé par sous-station et chaufferie de chaque fiche.</p>
      <p class="introLead">Les principales abréviations sont :</p>
      <ul><li>S : Satisfaisant</li><li>N.S : Non satisfaisant</li><li>S.O : Sans objet</li><li>N.R : Non relevé</li><li>N.V : Non visible</li></ul>
    </div>
    ${contenus.join('')}
    ${output === 'word' ? wordInteriorDecor(config, siteFooter) : ''}
  </body></html>`;
}

async function choisirDossier() {
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF?.requestDirectoryPermissionsAsync || !SAF?.createFileAsync) {
    throw new Error("L'enregistrement dans Documents n'est pas disponible sur cet appareil.");
  }
  let initial = null;
  try { initial = SAF.getUriForDirectoryInRoot ? SAF.getUriForDirectoryInRoot('Documents') : null; } catch {}
  const p = await SAF.requestDirectoryPermissionsAsync(initial || undefined);
  return p?.granted ? p.directoryUri : null;
}

async function copierPdfVersDossier(uriSource, dossier, nom) {
  const SAF = FileSystem.StorageAccessFramework;
  const b64 = await FileSystem.readAsStringAsync(uriSource, { encoding: FileSystem.EncodingType.Base64 });
  const uri = await SAF.createFileAsync(dossier, nom, MIME_PDF);
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}

async function ecrireWordHtml(dossier, nom, html) {
  const SAF = FileSystem.StorageAccessFramework;
  const wordHtml = html.replace('<html>', '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">');
  const uri = await SAF.createFileAsync(dossier, nom, MIME_WORD);
  await FileSystem.writeAsStringAsync(uri, wordHtml, { encoding: FileSystem.EncodingType.UTF8 });
  return uri;
}

function dataUriBase64(dataUri) {
  return String(dataUri || '').split(',')[1] || '';
}

async function habillerPdf(uriSource, config, siteFooter) {
  const sourceBase64 = await FileSystem.readAsStringAsync(uriSource, { encoding: FileSystem.EncodingType.Base64 });
  const pdf = await PDFDocument.load(sourceBase64);
  const pages = pdf.getPages();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedJpg(dataUriBase64(REPORT_LOGO)); } catch {}

  const total = pages.length;
  pages.forEach((page, index) => {
    if (index === 0) return;
    const { width, height } = page.getSize();
    const left = 50;
    const footerY = 20;
    const grey = rgb(0.35, 0.35, 0.35);
    const orange = rgb(0.94, 0.45, 0.05);

    if (logo) {
      const ratio = logo.width / logo.height;
      const logoH = 19;
      const logoW = logoH * ratio;
      page.drawImage(logo, { x: left, y: height - 31, width: logoW, height: logoH });
    }
    const running = String(config.objet || 'Compte rendu de visite technique').toUpperCase();
    const runSize = 7.2;
    const runWidth = bold.widthOfTextAtSize(running, runSize);
    page.drawText(running, { x: Math.max(left + 90, width - 50 - runWidth), y: height - 24, size: runSize, font: bold, color: rgb(0.15, 0.15, 0.15) });

    const meta = [`Nos réf. : ${config.chrono || ''}`, `Site : ${siteFooter || ''}`, `Objet : ${config.objet || ''}`];
    meta.forEach((line, i) => page.drawText(String(line), { x: left, y: footerY + 15 - i * 7, size: 5.8, font, color: grey }));

    const pageText = `${index + 1}/${total}`;
    const arrowW = 23;
    const numW = 38;
    const boxH = 17;
    const x = width - arrowW - numW;
    page.drawRectangle({ x, y: footerY - 1, width: arrowW, height: boxH, color: grey });
    page.drawRectangle({ x: x + arrowW, y: footerY - 1, width: numW, height: boxH, color: orange });
    const arrowColor = rgb(1, 1, 1);
    const arrowY = footerY + 7.5;
    page.drawLine({ start: { x: x + 6, y: arrowY }, end: { x: x + 16, y: arrowY }, thickness: 1.2, color: arrowColor });
    page.drawLine({ start: { x: x + 12.5, y: arrowY + 3.2 }, end: { x: x + 16, y: arrowY }, thickness: 1.2, color: arrowColor });
    page.drawLine({ start: { x: x + 12.5, y: arrowY - 3.2 }, end: { x: x + 16, y: arrowY }, thickness: 1.2, color: arrowColor });
    const tW = bold.widthOfTextAtSize(pageText, 6.6);
    page.drawText(pageText, { x: x + arrowW + (numW - tW) / 2, y: footerY + 4, size: 6.6, font: bold, color: rgb(1, 1, 1) });
  });

  const outBase64 = await pdf.saveAsBase64({ dataUri: false });
  const outUri = `${FileSystem.cacheDirectory}rapport_habille_${Date.now()}.pdf`;
  await FileSystem.writeAsStringAsync(outUri, outBase64, { encoding: FileSystem.EncodingType.Base64 });
  return outUri;
}

async function exporterUnFormat({ datas, config, photosConfig, format, dossier }) {
  const base = propre(`${config.chrono || 'Rapport'}_${datas.length === 1 ? datas[0].visite.nom_site : datas[0].visite.nom_client}_${config.objet || 'CRV'}`);
  const sites = [...new Set(datas.map((d) => d.visite.nom_site).filter(Boolean))];
  const siteFooter = sites.length === 1 ? sites[0] : `${sites.length} sites sélectionnés`;

  if (format === 'word') {
    const html = await construireHtmlRapport(datas, config, photosConfig, 'word');
    const nom = `${base}.doc`;
    return { format, uri: await ecrireWordHtml(dossier, nom, html), nom };
  }

  const html = await construireHtmlRapport(datas, config, photosConfig, 'pdf');
  const printed = await Print.printToFileAsync({ html, base64: false });
  let habille = null;
  const nom = `${base}.pdf`;
  try {
    habille = await habillerPdf(printed.uri, config, siteFooter);
    return { format: 'pdf', uri: await copierPdfVersDossier(habille, dossier, nom), nom };
  } finally {
    await FileSystem.deleteAsync(printed.uri, { idempotent: true }).catch(() => {});
    if (habille) await FileSystem.deleteAsync(habille, { idempotent: true }).catch(() => {});
  }
}

export async function exporterRapport({ datas, config, photosConfig, format = 'pdf', dossierUri = null }) {
  const dossier = dossierUri || await choisirDossier();
  if (!dossier) return { annule: true };

  if (format === 'both') {
    const pdf = await exporterUnFormat({ datas, config, photosConfig, format: 'pdf', dossier });
    const word = await exporterUnFormat({ datas, config, photosConfig, format: 'word', dossier });
    return { annule: false, nom: `${pdf.nom} + ${word.nom}`, resultats: [pdf, word] };
  }

  return { annule: false, ...(await exporterUnFormat({ datas, config, photosConfig, format, dossier })) };
}

export async function exporterRapportsParSite({ datas, config, photosConfig, format = 'pdf' }) {
  const dossier = await choisirDossier();
  if (!dossier) return { annule: true, resultats: [] };

  const groupes = new Map();
  for (const data of datas) {
    const key = data.visite.site_id || data.visite.nom_site || data.visite.id;
    if (!groupes.has(key)) groupes.set(key, []);
    groupes.get(key).push(data);
  }

  const resultats = [];
  for (const siteDatas of groupes.values()) {
    resultats.push(await exporterRapport({ datas: siteDatas, config, photosConfig, format, dossierUri: dossier }));
  }
  return { annule: false, resultats };
}