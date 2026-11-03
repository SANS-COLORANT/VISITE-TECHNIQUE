/**
 * Restore named REMAR blocks from the Symfony V1 text contract, without
 * touching notes, reservations or the other visit families.
 *
 * This augments the historical flat fields; the dynamic equipment layer is
 * canonical for CTA/VMC/cold. Import is called inside the caller's SQLite
 * transaction. No inference from a global S/N.S status for multiple objects.
 */
import { importerRemarDetailExcel } from './remarExcelDetail.js';
import { inspectIntranetCriterionCandidate } from './intranetVisitPayload.js';
import { remarMappingsForRemote } from './remarSymfonyCompleteContract.js';
import { obtenirTrame } from './trameRegistry.js';
import { createId } from './database/ids.js';

const str=x=>String(x??'').trim();
const norm=x=>str(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const statuses=new Set(['S','N.S','N.R','S.O','N.V']);
const FAMILY={
  'p-remar-cta':'cta','p-remar-filtres':'cta','p-remar-cta-mesures':'cta',
  'p-remar-vmc':'vmc','p-remar-froid':'froid',
};
const OWNER_PANEL={cta:'p-remar-cta',vmc:'p-remar-vmc',froid:'p-remar-froid'};
const isNamed=name=>str(name).length>0 && !/[\r\n]/.test(name);
const impliedFamily=(family,name)=>{
  const n=norm(name);
  if(family==='cta')return /^(cta|centrale traitement air)( |$)/.test(n);
  if(family==='vmc')return /^(vmc|caisson|tourelle|extracteur)( |$)/.test(n);
  return /^(froid|groupe froid|production froid|chiller)( |$)/.test(n);
};
const unescapeText=value=>String(value??'').replace(/\\(n|\\)/g,(_,key)=>key==='n'?'\n':'\\');

export function parseRemarNamedCell(raw, {family, knownNames=[], identity=false}={}) {
  const lines=String(raw??'').split(/\r\n|\r|\n|\u2028|\u2029/)
    .map(s=>s.trim()).filter(Boolean);
  if(!lines.length)return [];
  const known=new Set(knownNames.map(norm));
  const parsed=[];
  for(const line of lines) {
    const at=line.indexOf(' : ');
    if(at<1){parsed.push(null);continue;}
    const label=line.slice(0,at).trim(),body=line.slice(at+3);
    const parent=label.split(' / ')[0].trim();
    if(!isNamed(label)||!isNamed(parent)||
      (family && !known.has(norm(parent)) && !impliedFamily(family,parent) &&
        !(identity && body.trim()===label))){
      parsed.push(null);continue;
    }
    parsed.push({label,parent,child:label.includes(' / ')?label.slice(label.indexOf(' / ')+3).trim():null,
      body:unescapeText(body)});
  }
  if(parsed.every(Boolean))return parsed;
  // An ordinary paragraph with newlines is NOT a collection of equipment.
  // Keep it unmodified in the flat historical value for this visit.
  if(parsed.some(Boolean))
    throw new Error('REMAR import : plusieurs lignes mêlent blocs nommés et texte libre ; corriger le format, aucun équipement inventé.');
  return [];
}

function fieldBody(raw,type,remoteAvis) {
  let body=String(raw??''),avis=null,commentaire='';
  if(type==='controle') {
    const match=/^\[(S|N\.S|N\.R|S\.O|N\.V)\](?:\s+([\s\S]*))?$/.exec(body);
    if(!match)throw new Error('REMAR import : contrôle de bloc sans avis individuel S/N.S/N.R/S.O/N.V.');
    return {valeur:'',avis:match[1],commentaire:match[2]||''};
  }
  const match=body.match(/\s+\[(S|N\.S|N\.R|S\.O|N\.V)\]$/);
  if(match){avis=match[1];body=body.slice(0,-match[0].length);}
  const separator=body.indexOf(' — ');
  if(separator>=0){commentaire=body.slice(separator+3);body=body.slice(0,separator);}
  return {valeur:body,avis,commentaire};
}
function extractUnit(value) {
  const match=str(value).match(/^(.*?)(?:\s+(°C|Pa|m³|MWh|kWh|%))$/);
  return match?{value:match[1],unit:match[2]}:{value:str(value),unit:''};
}

export function decodeRemarSymfonyDetail(ref,{historical=false}={}) {
  const trame=obtenirTrame('remar_v1');
  const mapping=remarMappingsForRemote(trame,ref?.trame);
  const allowed=new Set(mapping.map(m=>[m.panelId,m.section,m.cle].join('||')));
  const criteria=[];
  for(const category of ref?.trame?.categories||[])for(const sub of category?.sousCategories||[])
    for(const criterion of sub?.criteres||[]){
      const target=inspectIntranetCriterionCandidate('remar_v1',criterion,category.nom,sub.nom,ref.trame).resolved;
      if(!target||!allowed.has([target.panelId,target.section,target.cle].join('||')))continue;
      const family=FAMILY[target.panelId];
      if(!family)continue;
      const value=str(criterion.commentaire);
      if(!value||value==='/')continue;
      const origin=str(criterion.visiteSourceId);
      criteria.push({target,family,value,avis:str(criterion.avis),origin});
    }
  const parents=new Map(), children=new Map(),records=[],seen=new Map();
  const ownerKey=(family,name)=>family+'||'+norm(name);
  const ensureParent=(family,name)=>{
    if(!isNamed(name))throw new Error('REMAR import : nom d’équipement manquant.');
    const key=ownerKey(family,name);
    const current=parents.get(key);
    if(current){if(current.nom!==name)throw new Error('REMAR import : deux noms distincts partagent la même identité normalisée : '+name);return current;}
    const id='symfony:remar:parent:'+key;
    const row={famille:family,parent:'',parentId:'',nom:name,elementId:id,type:'equipement',
      panel:OWNER_PANEL[family],section:'Équipement',cle:'Identité patrimoine',
      valeur:name,avis:'',commentaire:'',sourceVisite:'',statut:'Visite courante',unite:''};
    parents.set(key,row); records.push(row);return row;
  };
  const ensureChild=(parent,type,name)=>{
    if(!isNamed(name))throw new Error('REMAR import : nom d’enfant manquant pour '+parent.nom);
    const key=parent.elementId+'||'+type+'||'+norm(name);
    const current=children.get(key);
    if(current){if(current.nom!==name)throw new Error('REMAR import : identité enfant contradictoire.');return current;}
    const panel=type==='filtre_cta'?'p-remar-filtres':type==='mesure_cta'?'p-remar-cta-mesures':'p-remar-froid';
    const row={famille:parent.famille,parent:parent.nom,parentId:parent.elementId,
      nom:name,elementId:'symfony:remar:child:'+key,type,panel,section:type,cle:'Type / presence',
      valeur:name,avis:'',commentaire:'',sourceVisite:'',statut:'Visite courante',unite:''};
    children.set(key,row);records.push(row);return row;
  };
  const addObservation=(owner,panel,section,cle,content,origin,unit='')=>{
    const source=historical || (!!origin && origin!==str(ref?.derniereVisite?.id));
    const row={...owner,panel,section,cle,valeur:content.valeur||'',
      avis:content.avis||'',commentaire:content.commentaire||'',
      sourceVisite:source?origin||str(ref?.derniereVisite?.id):'',
      statut:source?'Historique à confirmer':'Visite courante',unite:unit||owner.unite||''};
    const key=[row.type,row.elementId,row.panel,row.section,row.cle].join('||');
    const old=seen.get(key);
    if(old){
      if(JSON.stringify([old.valeur,old.avis,old.commentaire,old.sourceVisite]) !==
        JSON.stringify([row.valeur,row.avis,row.commentaire,row.sourceVisite]))
        throw new Error('REMAR import : observations contradictoires pour '+owner.nom+' / '+cle);
      return;
    }
    seen.set(key,row);records.push(row);
  };
  // Identity criteria are parsed first, allowing names such as "Triple"
  // which do not start with "CTA" to be recognized in subsequent fields.
  for(const datum of criteria) {
    const {target,family,value}=datum;
    const isIdentity=(target.panelId==='p-remar-cta'&&target.cle==='Désignation CTA')||
      (target.panelId==='p-remar-vmc'&&target.cle==='Nombre de caissons')||
      (target.panelId==='p-remar-froid'&&target.cle==='Production froid');
    if(!isIdentity)continue;
    const lines=parseRemarNamedCell(value,{family,identity:true});
    if(lines.length)for(const row of lines)ensureParent(family,row.parent);
    else if(family==='cta'&&value.indexOf('\n')<0&&value.indexOf(' : ')<0)
      ensureParent(family,value);
  }
  for(const datum of criteria) {
    const {target,family,value,avis,origin}=datum;
    const identity=(target.panelId==='p-remar-cta'&&target.cle==='Désignation CTA')||
      (target.panelId==='p-remar-vmc'&&target.cle==='Nombre de caissons');
    if(identity)continue;
    const names=[...parents.values()].filter(r=>r.famille===family).map(r=>r.nom);
    const parsed=parseRemarNamedCell(value,{family,knownNames:names});
    // Legacy single-equipment values may be unprefixed, but controls need
    // an explicit per-equipment status or a single unambiguous remote avis.
    const lines=parsed.length?parsed:(names.length===1 && !value.includes('\n')
      ?[{label:names[0],parent:names[0],child:null,
        body:target.type==='controle' && statuses.has(avis)
          ?'['+avis+'] '+value:value}]:[]);
    if(!lines.length)continue;
    for(const line of lines) {
      const parent=ensureParent(family,line.parent);
      if(target.panelId==='p-remar-froid' && target.section==='Réseaux'){
        const childName=line.child||line.body.split(' — ')[0].trim();
        if(!childName)throw new Error('REMAR import : nom de réseau froid absent.');
        const child=ensureChild(parent,'reseau_froid',childName);
        const extra=line.body.indexOf(' — ');
        if(extra>=0)addObservation(child,'p-remar-froid','reseau_froid','Description',
          {valeur:line.body.slice(extra+3)},origin);
        continue;
      }
      const data=fieldBody(line.body,target.type,avis);
      if(target.panelId==='p-remar-filtres'){
        if(!line.child)throw new Error('REMAR import : filtre sans identité sous '+parent.nom);
        const child=ensureChild(parent,'filtre_cta',line.child);
        const key=target.cle==='Type de filtre'?'Classe de filtration':target.cle;
        const pressure=/^(Pertes de charge \(Pa\)|Seuil d'alarme \(Pa\))$/.test(key);
        const measured=pressure?extractUnit(data.valeur):{value:data.valeur,unit:''};
        addObservation(child,'p-remar-filtres','filtre_cta',key,
          {...data,valeur:measured.value},origin,measured.unit);
      }else if(target.panelId==='p-remar-cta-mesures'){
        if(!line.child)throw new Error('REMAR import : mesure CTA sans nom sous '+parent.nom);
        const child=ensureChild(parent,'mesure_cta',line.child);
        const measured=extractUnit(data.valeur);
        addObservation(child,'p-remar-cta-mesures','mesure_cta','Valeur',
          {...data,valeur:measured.value},origin,measured.unit);
      }else{
        addObservation(parent,target.panelId,target.section,target.cle,data,origin);
      }
    }
  }
  return records;
}
export async function importerRemarSymfonyMultiligne({db,visiteId,installationId,trameId,ref,historical=false}) {
  if(trameId!=='remar_v1'||!installationId)return 0;
  const rows=decodeRemarSymfonyDetail(ref,{historical});
  if(!rows.length)return 0;
  const sourceKey=[
    str(visiteId),str(ref?.trame?.id),str(ref?.derniereVisite?.id)||'preparation'
  ].join('::');
  const already=await db.getFirstAsync(
    "SELECT id FROM provenances WHERE entite_type='visite_remar_blocs' AND entite_id=? AND origine='api_symfony' AND reference_externe=? LIMIT 1",
    [visiteId,sourceKey]
  );
  if(already?.id)return 0;
  // The caller encloses this import in a single SQLite transaction.
  // If any child/parent or duplicate is invalid, all rows roll back.
  const count=await importerRemarDetailExcel(db,visiteId,installationId,trameId,rows,createId);
  await db.runAsync(
    "INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json) VALUES(?,?,?,?,?,?)",
    [createId(),'visite_remar_blocs',visiteId,'api_symfony',sourceKey,
      JSON.stringify({kind:'remar_complete_multiline_import',rowCount:rows.length,
        remoteTrameId:str(ref?.trame?.id),remoteVisitId:str(ref?.derniereVisite?.id)})]
  );
  return count;
}
