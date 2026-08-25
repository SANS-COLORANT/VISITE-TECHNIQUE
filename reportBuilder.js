import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as ImageManipulator from 'expo-image-manipulator';
import { getDb, listerMateriel } from './db.js';
import { obtenirTrame, DEFAULT_TRAME_ID, normaliserSectionCode } from './trameRegistry.js';

const MIME_PDF = 'application/pdf';
const MIME_WORD = 'application/msword';

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
  const prestation = court(remarque?.prestation || '', 44);
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
    return court(m?.designation || m?.categorie || 'Équipement', 48);
  }
  if (type === 'compteur' || type === 'compteur_site') {
    const c = data.compteurs?.find((x) => x.id === id || x.compteur_site_id === id);
    return court(c?.label || 'Compteur', 48);
  }
  if (type === 'reseau' || type === 'reseau_site') {
    const r = data.reseaux?.find((x) => x.id === id || x.reseau_site_id === id);
    return court(r?.nom_reseau || 'Réseau', 48);
  }

  const saved = court(photo.label || '', 48);
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
  return `<section class="reportSection pageBreakBefore"><div class="sectionBanner">REMARQUES PARTICULIÈRES</div><table class="reserveTable"><thead><tr><th>Poste</th><th>Prestation</th><th class="reserveDate">Date de la réserve</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.poste || 'Remarques particulières')}</td><td>${esc(r.prestation || '/')}</td><td>${esc(dateFr(String(r.cree_le || '').slice(0, 10)) || '/')}</td></tr>`).join('')}</tbody></table></section>`;
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

function brandMarkHtml(compact = false) {
  return `<div class="brandLockup ${compact ? 'compact' : ''}"><span class="brandSpiral">◎</span>${compact ? '' : '<span><b>ENERGIE <em>&amp;</em> SERVICE</b><small>Etude - Conseil - AMO - Maîtrise d’œuvre</small></span>'}</div>`;
}

function cssRapport() {
  return `
    @page{size:A4;margin:18mm 19mm 18mm 19mm}
    *{box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:9.5pt;line-height:1.25;margin:0}
    .cover{height:258mm;position:relative;page-break-after:always}
    .brandLockup{display:flex;align-items:center;gap:5mm;color:#777;margin-top:2mm}
    .brandLockup b{font-size:25pt;letter-spacing:-.6pt}.brandLockup em{font-style:normal;font-weight:400;color:#888}.brandLockup small{display:block;color:#aaa;font-size:10pt;margin-top:1mm}
    .brandSpiral{display:inline-flex;width:19mm;height:19mm;border:2.3mm solid #f1db72;border-right-color:#9bcf8a;border-bottom-color:#9bcf8a;border-radius:50%;align-items:center;justify-content:center;color:#f49a58;font-size:22pt;font-weight:700;transform:rotate(-18deg)}
    .brandLockup.compact{position:fixed;top:6mm;left:12mm;z-index:4}.brandLockup.compact .brandSpiral{width:10mm;height:10mm;border-width:1.2mm;font-size:12pt}
    .coverDate{text-align:right;font-size:12pt;margin-top:12mm}.ref{margin:13mm 0 7mm 12mm;font-size:12pt;font-weight:700;text-decoration:underline}
    .coverClient{position:relative;width:84%;margin:0 auto;z-index:2;background:#f47f2a;color:#fff;border-radius:6mm;text-align:center;padding:10mm 7mm;font-size:24pt}
    .coverVisual{width:90%;height:105mm;margin:-5mm auto 0;background:linear-gradient(145deg,#83d2ee 0%,#d8eef6 40%,#8e9ba2 41%,#475158 100%);position:relative;overflow:hidden}
    .coverVisual:before{content:'';position:absolute;left:10%;bottom:0;width:35%;height:74%;background:#f4f4f4;box-shadow:110mm 18mm 0 -15mm #2e3840;transform:skewY(-3deg)}
    .coverVisual:after{content:'';position:absolute;left:14%;bottom:18%;width:30%;height:42%;background:repeating-linear-gradient(90deg,#d4d8db 0 8mm,#9aa4aa 8mm 10mm)}
    .coverObject{text-align:center;font-size:17pt;margin-top:24mm}.coverObject b{font-weight:500}
    .coverBusiness{position:absolute;left:0;right:0;bottom:26mm;text-align:center;font-size:9pt}.coverBusiness span{margin:0 4mm}.coverBottom{position:absolute;left:-19mm;right:-19mm;bottom:-18mm;border-top:1.5mm solid #f47f2a;font-size:7.5pt;color:#666;text-align:center;padding-top:3mm}
    .toc{page-break-after:always;padding:7mm 10mm}.toc h1{text-align:center;text-decoration:underline;font-size:28pt;margin:5mm 0 14mm}.tocSite{font-size:14pt;font-weight:800;margin:4mm 0 2mm}.tocRow{display:flex;align-items:flex-end;margin-left:9mm;font-size:12pt;padding:1.5mm 0}.tocDots{flex:1;border-bottom:1px dotted #888;margin:0 2mm 1.5mm}.tocMeta{font-size:9pt;color:#666}
    .intro{page-break-after:always;padding:7mm 7mm}.introTitle{font-size:21pt;text-decoration:underline;margin:13mm 0 8mm;font-weight:800}.intro p{font-size:12pt;line-height:1.65}.introLead{text-decoration:underline}.intro ul{font-size:12pt;line-height:1.55;margin-top:5mm}
    .siteStart{text-align:center;margin:9mm 0 7mm}.siteStart h1{font-size:24pt;text-decoration:underline;margin:0 0 8mm}.siteStart h4{font-size:18pt;text-decoration:underline;margin:0}
    .reportSection{margin:0 0 5mm}.pageBreakBefore{page-break-before:always;padding-top:7mm}.sectionBanner{width:84%;margin:0 auto 7mm;background:#f47f2a;color:#fff;border:1.2px solid #111;text-align:center;font-size:15.5pt;font-weight:800;padding:2.2mm 3mm}
    .groupBlock{break-inside:avoid;margin-bottom:6mm}.groupBlock h3{text-align:center;text-decoration:underline;font-size:13pt;margin:4mm 0 5mm}
    table{width:100%;border-collapse:collapse;margin-bottom:4mm;font-size:9pt;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}
    th,td{border:1px solid #111;padding:1.6mm 1.4mm;vertical-align:middle}th{text-align:left;font-weight:800;background:#fff}
    .techTable .labelCol{width:30%}.techTable .avisCol{width:8%}.techTable .labelCell{background:#fbd0ad}.techTable .avisCell{text-align:center}.techTable .avisCell.champAvis{background:#929292;color:#111}.techTable .avisOk{color:#008c1a;font-weight:700}.techTable .avisKo{color:#c51f1f;font-weight:700}
    .reserveTable th:nth-child(1){width:27%}.reserveTable th:nth-child(3){width:15%}.reserveTable td:nth-child(1){background:#f8ba88}.reserveTable td:nth-child(2){background:#fbe3d0}.reserveDate{white-space:nowrap}
    .materialTable th:nth-child(1){width:11%}.materialTable th:nth-child(2){width:9%}.materialTable th:nth-child(3){width:30%}.materialTable th:nth-child(4){width:23%}.materialTable th:nth-child(5){width:22%}.materialTable th:nth-child(6){width:7%}.materialTable td:nth-child(1),.materialTable td:nth-child(3){background:#f8ba88}.materialTable td:nth-child(2),.materialTable td:nth-child(4){background:#fbe3d0}.qty,.year{text-align:center}
    .photoPage{min-height:247mm}.photoGrid{display:grid;grid-template-columns:1fr 1fr;gap:4mm 16mm}.photoCard{height:68mm;border:1px solid #111;break-inside:avoid;display:flex;flex-direction:column;background:#fff}.photoImageWrap{height:54mm;display:flex;align-items:center;justify-content:center;overflow:hidden}.photoImageWrap img{max-width:100%;max-height:54mm;object-fit:contain;display:block}.photoCaption{height:14mm;background:#fbd0ad;border-top:1px solid #111;display:flex;align-items:center;justify-content:center;text-align:center;font-size:11pt;padding:1.5mm 2mm}
    .docMeta{position:fixed;left:19mm;bottom:5.5mm;color:#777;font-size:7.5pt;line-height:1.25}.pageBadge{position:fixed;right:0;bottom:5mm;display:flex;align-items:stretch;font-size:8pt;color:#fff}.pageArrow{background:#666;padding:2mm 2.5mm}.pageCounter{background:#f47f2a;padding:2mm 5mm}.pageCounter:after{content:counter(page) ' sur ' counter(pages)}
  `;
}

function construireToc(datas) {
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
  return `<div class="toc"><h1>Sommaire</h1>${groupes.map((g) => `<div class="tocSite">${esc(g.site)}</div>${g.items.map((d) => `<div class="tocRow"><span>${esc(d.visite.nom_local || d.visite.type_local || 'Installation technique')}</span><span class="tocDots"></span><span class="tocMeta">${esc(dateFr(d.visite.date_visite))}</span></div>`).join('')}`).join('')}</div>`;
}

export async function construireHtmlRapport(datas, config, photosConfig = []) {
  const contenus = [];
  for (const d of datas) contenus.push(await siteHtml(d, config, photosConfig));

  const client = datas[0]?.visite?.nom_client || 'Rapport';
  const dateRapport = dateFr(config.dateRapport || new Date().toISOString().slice(0, 10));
  const sites = [...new Set(datas.map((d) => d.visite.nom_site).filter(Boolean))];
  const toc = construireToc(datas);
  const siteFooter = sites.length === 1 ? sites[0] : `${sites.length} sites sélectionnés`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${cssRapport()}</style></head><body>
    <div class="cover">
      ${brandMarkHtml(false)}
      <div class="coverDate">Versailles, le ${esc(dateRapport)}</div>
      <div class="ref">Nos réf. : ${esc(config.chrono || '')}</div>
      <div class="coverClient">${esc(client)}</div>
      <div class="coverVisual"></div>
      <div class="coverBusiness"><span>◉ COPROPRIÉTÉS</span><span>◉ BAILLEURS SOCIAUX</span><span>◉ COLLECTIVITÉS</span><span>◉ TERTIAIRE</span></div>
      <div class="coverObject"><b>${esc(config.objet || '')}</b></div>
      <div class="coverBottom">VERSAILLES · NANTES · TOURS · RENNES · LYON · BORDEAUX · CHERBOURG · NÎMES<br/>Tél. 01 39 55 17 20 · 143 rue Yves le Coz · 78000 VERSAILLES · contact.versailles@energieetservice.fr</div>
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
    ${brandMarkHtml(true)}
    <div class="docMeta">Nos réf. : ${esc(config.chrono || '')}<br/>Site : ${esc(siteFooter)}<br/>Objet : ${esc(config.objet || '')}</div>
    <div class="pageBadge"><span class="pageArrow">→</span><span class="pageCounter"></span></div>
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

async function exporterUnFormat({ datas, config, photosConfig, format, dossier }) {
  const html = await construireHtmlRapport(datas, config, photosConfig);
  const base = propre(`${config.chrono || 'Rapport'}_${datas.length === 1 ? datas[0].visite.nom_site : datas[0].visite.nom_client}_${config.objet || 'CRV'}`);

  if (format === 'word') {
    const nom = `${base}.doc`;
    return { format, uri: await ecrireWordHtml(dossier, nom, html), nom };
  }

  const printed = await Print.printToFileAsync({ html, base64: false });
  const nom = `${base}.pdf`;
  try {
    return { format: 'pdf', uri: await copierPdfVersDossier(printed.uri, dossier, nom), nom };
  } finally {
    await FileSystem.deleteAsync(printed.uri, { idempotent: true }).catch(() => {});
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
