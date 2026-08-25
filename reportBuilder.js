import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as ImageManipulator from 'expo-image-manipulator';
import { getDb, listerMateriel } from './db.js';
import { obtenirTrame, DEFAULT_TRAME_ID, normaliserSectionCode } from './trameRegistry.js';

const MIME_PDF = 'application/pdf';
const MIME_WORD = 'application/msword';

function esc(v='') { return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function court(v='', max=72) { const s=String(v||'').split('||')[0].trim(); return s.length>max ? `${s.slice(0,max-1).trim()}…` : s; }
function propre(v='Rapport') { return String(v||'Rapport').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'').slice(0,80) || 'Rapport'; }
function dateFr(v) { if(!v) return ''; const m=String(v).slice(0,10).split('-'); return m.length===3 ? `${m[2]}/${m[1]}/${m[0]}` : String(v); }

export async function finaliserVisiteRapport(visiteId) {
  const db=await getDb();
  await db.runAsync(`UPDATE visites SET statut='terminee', modifie_le=datetime('now') WHERE id=?`,[visiteId]);
}
export async function rouvrirVisiteRapport(visiteId) {
  const db=await getDb();
  await db.runAsync(`UPDATE visites SET statut='en_cours', modifie_le=datetime('now') WHERE id=?`,[visiteId]);
}

export async function listerVisitesRapportClient(clientId) {
  const db=await getDb();
  return db.getAllAsync(`SELECT v.id,v.date_visite,v.statut,v.progression_pct,v.trame_id,v.technicien,s.id site_id,s.nom_site,s.adresse,c.nom nom_client
    FROM visites v JOIN sites s ON s.id=v.site_id JOIN clients c ON c.id=s.client_id
    WHERE c.id=? ORDER BY s.nom_site COLLATE NOCASE, COALESCE(v.date_visite,'') DESC, v.modifie_le DESC`,[clientId]);
}

export async function chargerDonneesVisiteRapport(visiteId) {
  const db=await getDb();
  const visite=await db.getFirstAsync(`SELECT v.*,s.nom_site,s.adresse,c.id client_id,c.nom nom_client FROM visites v JOIN sites s ON s.id=v.site_id JOIN clients c ON c.id=s.client_id WHERE v.id=?`,[visiteId]);
  if(!visite) throw new Error('Visite introuvable');
  const trame=obtenirTrame(visite.trame_id||DEFAULT_TRAME_ID);
  const [champs,controles,reseaux,compteurs,remarques,photos,materiel,note]=await Promise.all([
    db.getAllAsync(`SELECT * FROM champs_visite WHERE visite_id=?`,[visiteId]),
    db.getAllAsync(`SELECT * FROM controles_visite WHERE visite_id=?`,[visiteId]),
    db.getAllAsync(`SELECT * FROM reseaux WHERE visite_id=? ORDER BY ordre,id`,[visiteId]),
    db.getAllAsync(`SELECT * FROM compteurs WHERE visite_id=? ORDER BY rowid`,[visiteId]),
    db.getAllAsync(`SELECT * FROM remarques WHERE visite_id=? ORDER BY cree_le,id`,[visiteId]),
    db.getAllAsync(`SELECT * FROM photos WHERE visite_id=? ORDER BY cree_le,id`,[visiteId]),
    listerMateriel(visiteId),
    db.getFirstAsync(`SELECT contenu FROM notes WHERE visite_id=?`,[visiteId]),
  ]);
  const champMap=new Map(champs.map(r=>[`${r.section_code}||${r.cle}`,r.valeur||'']));
  const ctrlMap=new Map(controles.map(r=>[`${r.section_code}||${r.cle}`,r]));
  const sections=[];
  for(const panelId of trame.ui?.tabOrder||[]) {
    if(panelId==='SEP'||['p-equip','p-remarques','p-photos'].includes(panelId)) continue;
    if(panelId==='p-regulation') {
      const rows=[];
      for(const [section,fields] of Object.entries(trame.ui?.panels?.[panelId]||{})) {
        const code=normaliserSectionCode(panelId,section);
        rows.push({title:section,rows:(fields||[]).map(f=>({label:f.cle,avis:f.type==='controle'?(ctrlMap.get(`${code}||${f.cle}`)?.avis||''):'',comment:f.type==='controle'?(ctrlMap.get(`${code}||${f.cle}`)?.commentaire||''):(champMap.get(`${code}||${f.cle}`)||'')}))});
      }
      reseaux.forEach((r,i)=>rows.push({title:r.nom_reseau||`Réseau n°${i+1}`,rows:[
        {label:'T°ext(°C)',avis:'',comment:r.t_ext_c||''},{label:'T°dép(°C)',avis:'',comment:r.t_dep_c||''},{label:'Nom réseau',avis:'',comment:r.nom_reseau||''},{label:'Courbe de chauffe',avis:'',comment:r.courbe_de_chauffe||''},{label:'TNC',avis:'',comment:r.tnc||''},{label:'Consigne et Programme horaire',avis:'',comment:r.consigne_programme_horaire||''},
      ]}));
      sections.push({panelId,title:trame.ui.labels?.[panelId]||panelId,groups:rows});
      continue;
    }
    const groups=[];
    for(const [section,fields] of Object.entries(trame.ui?.panels?.[panelId]||{})) {
      const code=normaliserSectionCode(panelId,section);
      groups.push({title:section,rows:(fields||[]).map(f=>({label:f.cle,avis:f.type==='controle'?(ctrlMap.get(`${code}||${f.cle}`)?.avis||''):'',comment:f.type==='controle'?(ctrlMap.get(`${code}||${f.cle}`)?.commentaire||''):(champMap.get(`${code}||${f.cle}`)||'')}))});
    }
    if(panelId==='p-releves'&&compteurs.length) groups.push({title:'Compteurs complémentaires',rows:compteurs.map(c=>({label:c.label||'Compteur',avis:'',comment:[c.valeur,c.unite].filter(Boolean).join(' ')}))});
    sections.push({panelId,title:trame.ui.labels?.[panelId]||panelId,groups});
  }
  return {visite,trame,sections,remarques,photos,materiel,note:note?.contenu||''};
}

function libellePhoto(photo,data) {
  const saved=court(photo.label||'',70); if(saved&&saved!=='Photo générale') return saved;
  const key=String(photo.entite_key||''); const [type,id]=key.split('||');
  if(type==='remarque') { const r=data.remarques.find(x=>x.id===id); return court(r?.reference_libelle||r?.prestation||'Réserve',70); }
  if(type==='materiel'||type==='equipement') { const m=data.materiel.find(x=>x.id===id||x.equipement_id===id); return court(m?.designation||m?.categorie||'Équipement',70); }
  if(type==='compteur'||type==='compteur_site') return court('Compteur',70);
  if(type==='reseau'||type==='reseau_site') return court('Réseau',70);
  return saved||'Photo générale';
}

export function preparerPhotosRapport(data, existantes=[]) {
  const ancien=new Map((existantes||[]).map(x=>[x.id,x]));
  return data.photos.map((p,i)=>({id:p.id,uri:p.uri,visiteId:data.visite.id,label:ancien.get(p.id)?.label||libellePhoto(p,data),include:ancien.get(p.id)?.include!==false,ordre:ancien.get(p.id)?.ordre??i,entiteKey:p.entite_key||null})).sort((a,b)=>a.ordre-b.ordre);
}

async function imageRapportBase64(uri) {
  try {
    const r=await ImageManipulator.manipulateAsync(uri,[{resize:{width:1200}}],{compress:0.62,format:ImageManipulator.SaveFormat.JPEG,base64:true});
    return r.base64 ? `data:image/jpeg;base64,${r.base64}` : null;
  } catch { return null; }
}

function tableHtml(group, afficherLignesVides) {
  const rows=(group.rows||[]).filter(r=>afficherLignesVides||String(r.avis||r.comment||'').trim());
  if(!rows.length) return '';
  return `<h3>${esc(group.title)}</h3><table><thead><tr><th class="label">Intitulé</th><th class="avis">Avis</th><th>Commentaire</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.label)}</td><td class="avis">${esc(r.avis)}</td><td>${esc(r.comment||'/')}</td></tr>`).join('')}</tbody></table>`;
}

async function siteHtml(data, config, photosConfig) {
  const sections=(data.sections||[]).map(s=>{
    const inner=(s.groups||[]).map(g=>tableHtml(g,config.afficherLignesVides)).join('');
    return inner?`<section><h2>${esc(s.title.toUpperCase())}</h2>${inner}</section>`:'';
  }).join('');
  const reserves=config.remarques?`<section><h2>REMARQUES PARTICULIERES</h2><table><thead><tr><th>Poste</th><th>Prestation</th><th>Date de la réserve</th></tr></thead><tbody>${data.remarques.map(r=>`<tr><td>${esc(r.poste||'Remarque')}</td><td>${esc(r.prestation||'')}</td><td>${esc(dateFr(String(r.cree_le||'').slice(0,10)))}</td></tr>`).join('')}</tbody></table></section>`:'';
  const materiel=config.materiel?`<section><h2>LISTING MATERIEL</h2><table><thead><tr><th>Catégorie</th><th>Nombre</th><th>Désignation</th><th>Marque</th><th>Modèle</th><th>Année</th></tr></thead><tbody>${data.materiel.map(m=>`<tr><td>${esc(m.categorie||'')}</td><td>1</td><td>${esc(m.designation||'')}</td><td>${esc(m.marque||'')}</td><td>${esc(m.modele||'')}</td><td>${esc(m.annee||'')}</td></tr>`).join('')}</tbody></table></section>`:'';
  let photos='';
  if(config.photos) {
    const items=(photosConfig||[]).filter(p=>p.visiteId===data.visite.id&&p.include).sort((a,b)=>a.ordre-b.ordre);
    const imgs=[];
    for(const p of items) { const src=await imageRapportBase64(p.uri); if(src) imgs.push(`<div class="photo"><img src="${src}"/><div>${esc(p.label||'Photo')}</div></div>`); }
    if(imgs.length) photos=`<section class="photoSection"><h2>PHOTOGRAPHIES</h2><div class="photoGrid">${imgs.join('')}</div></section>`;
  }
  return `<div class="siteStart"><h1>${esc(data.visite.nom_site||'Site')}</h1><h4>${esc(data.visite.nom_local||data.visite.type_local||'Installation technique')}</h4></div>${sections}${reserves}${photos}${materiel}`;
}

function cssRapport() { return `@page{size:A4;margin:24mm 15mm 18mm 15mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:10pt;line-height:1.25;margin:0}.cover{height:245mm;position:relative;page-break-after:always}.brand{font-size:27pt;font-weight:700;color:#777;margin:12mm 0 4mm}.subbrand{color:#999;font-size:10pt}.coverDate{text-align:right;margin-top:12mm}.ref{margin-top:10mm;font-weight:700;text-decoration:underline}.hero{margin:12mm auto 0;width:82%;height:42mm;background:#f58220;border-radius:6mm;display:flex;align-items:center;justify-content:center;color:#fff;font-size:25pt}.coverClient{text-align:center;font-size:16pt;margin-top:78mm}.footer{position:fixed;bottom:7mm;left:15mm;right:15mm;border-top:5px solid #f58220;padding-top:3mm;font-size:7pt;color:#666;text-align:center}.intro{page-break-after:always}.toc{page-break-after:always}.toc h1{text-align:center;text-decoration:underline;font-size:27pt}.tocRow{display:flex;border-bottom:1px dotted #999;padding:2mm 0}.tocRow b{flex:1}.siteStart{page-break-before:always}.siteStart:first-of-type{page-break-before:auto}.siteStart h1{font-size:20pt;margin:0}.siteStart h4{font-size:13pt;margin:2mm 0 5mm}section{margin:0 0 5mm;break-inside:auto}h2{font-size:14pt;margin:5mm 0 2mm;border-bottom:2px solid #f58220;padding-bottom:1mm}h3{font-size:11pt;margin:4mm 0 1mm}table{width:100%;border-collapse:collapse;margin-bottom:4mm;font-size:9pt}th,td{padding:1.7mm 2mm;vertical-align:top;border-bottom:1px solid #ddd}th{text-align:left;font-weight:700}.label{width:43%}.avis{width:12%;text-align:center}.photoSection{page-break-before:always}.photoGrid{display:grid;grid-template-columns:1fr 1fr;gap:8mm 8mm}.photo{break-inside:avoid;font-size:10pt;font-weight:600}.photo img{display:block;width:100%;height:72mm;object-fit:contain;margin-bottom:2mm}.small{font-size:8pt;color:#666}`; }

export async function construireHtmlRapport(datas, config, photosConfig=[]) {
  const contenus=[]; for(const d of datas) contenus.push(await siteHtml(d,config,photosConfig));
  const client=datas[0]?.visite?.nom_client||'Rapport';
  const dateRapport=dateFr(config.dateRapport||new Date().toISOString().slice(0,10));
  const toc=datas.length>1?`<div class="toc"><h1>Sommaire</h1>${datas.map((d,i)=>`<div class="tocRow"><b>${esc(d.visite.nom_site||`Site ${i+1}`)}</b><span>${esc(d.trame.nom)}</span></div>`).join('')}</div>`:'';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${cssRapport()}</style></head><body><div class="cover"><div class="brand">ENERGIE &amp; SERVICE</div><div class="subbrand">Etude - Conseil - AMO - Maîtrise d’oeuvre</div><div class="coverDate">Versailles, le ${esc(dateRapport)}</div><div class="ref">Nos réf.: ${esc(config.chrono||'')}</div><div class="hero">${esc(client)}</div><div class="coverClient">${esc(config.objet||'')}</div></div>${toc}<div class="intro"><h2>Présentation de la trame de visite des installations</h2><p>Pour chaque chaufferie, sous-station chauffage et sous-station ECS, une fiche de conformité a été remplie.</p><p>Dans ce compte rendu nous vous présentons un résumé par sous-station et chaufferie de chaque fiche.</p><p>Les principales abréviations sont :</p><p><b>S</b> : Satisfaisant<br/><b>N.S</b> : Non satisfaisant<br/><b>S.O</b> : Sans objet<br/><b>N.R</b> : Non relevé<br/><b>N.V</b> : Non visible</p></div>${contenus.join('')}<div class="footer">VERSAILLES · NANTES · TOURS · RENNES · LYON · BORDEAUX · CHERBOURG · NIMES<br/>Tél. 01 39 55 17 20 - 143 rue Yves le Coz - 78000 VERSAILLES - contact.versailles@energieetservice.fr</div></body></html>`;
}

async function choisirDossier() {
  const SAF=FileSystem.StorageAccessFramework;
  if(!SAF?.requestDirectoryPermissionsAsync||!SAF?.createFileAsync) throw new Error("L'enregistrement dans Documents n'est pas disponible sur cet appareil.");
  let initial=null; try { initial=SAF.getUriForDirectoryInRoot?SAF.getUriForDirectoryInRoot('Documents'):null; } catch {}
  const p=await SAF.requestDirectoryPermissionsAsync(initial||undefined); return p?.granted?p.directoryUri:null;
}

async function copierPdfVersDossier(uriSource,dossier,nom) {
  const SAF=FileSystem.StorageAccessFramework; const b64=await FileSystem.readAsStringAsync(uriSource,{encoding:FileSystem.EncodingType.Base64});
  const uri=await SAF.createFileAsync(dossier,nom,MIME_PDF); await FileSystem.writeAsStringAsync(uri,b64,{encoding:FileSystem.EncodingType.Base64}); return uri;
}
async function ecrireWordHtml(dossier,nom,html) {
  const SAF=FileSystem.StorageAccessFramework; const uri=await SAF.createFileAsync(dossier,nom,MIME_WORD); await FileSystem.writeAsStringAsync(uri,html,{encoding:FileSystem.EncodingType.UTF8}); return uri;
}

export async function exporterRapport({datas,config,photosConfig,format='pdf',dossierUri=null}) {
  const dossier=dossierUri||await choisirDossier(); if(!dossier) return {annule:true};
  const html=await construireHtmlRapport(datas,config,photosConfig);
  const base=propre(`${config.chrono||'Rapport'}_${datas.length===1?datas[0].visite.nom_site:datas[0].visite.nom_client}_${config.objet||'CRV'}`);
  if(format==='word') return {annule:false,uri:await ecrireWordHtml(dossier,`${base}.doc`,html),nom:`${base}.doc`};
  const printed=await Print.printToFileAsync({html,base64:false});
  try { return {annule:false,uri:await copierPdfVersDossier(printed.uri,dossier,`${base}.pdf`),nom:`${base}.pdf`}; }
  finally { await FileSystem.deleteAsync(printed.uri,{idempotent:true}).catch(()=>{}); }
}

export async function exporterRapportsParSite({datas,config,photosConfig,format='pdf'}) {
  const dossier=await choisirDossier(); if(!dossier) return {annule:true,resultats:[]};
  const resultats=[]; for(const data of datas) resultats.push(await exporterRapport({datas:[data],config,photosConfig,format,dossierUri:dossier})); return {annule:false,resultats};
}
