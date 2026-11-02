/**
 * REMAR: projection non destructive vers les cellules officielles et annexe
 * exhaustive. Une fiche unique est mappee automatiquement ; si plusieurs
 * equipements existent, une reference explicite est requise.
 */
import { getDb } from './db.js';
import {
  listerRemarEquipements, listerRemarItems, listerRemarValeurs,
  getRemarEquipementReference,
} from './remarDynamicDb.js';

const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const key = (panel,section,cle) => [panel,section,cle].join('||');
const itemValue = (row,panel,section,cle) => row?.[key(panel,section,cle)] || null;
const hasData = x => x && [x.valeur,x.avis,x.commentaire].some(v=>v!=null && String(v).trim()!=='');
function addOfficial(map,panel,section,cle,row,extra={}) {
  if (!row && !('valeur' in extra)) return;
  map.set(key(panel,section,cle), {...extra,...(row||{})});
}
function addInfo(lines,owner,meta,row) {
  lines.push([
    owner.famille,owner.parentName||'',owner.parentId||'',owner.nom,
    owner.id,owner.type,meta.panel,meta.section,meta.cle,
    row?.valeur??'',row?.avis??'',row?.commentaire??'',
    row?.source_visite_id||'',row?.inherited?'Historique à confirmer':'Visite courante',
  ]);
}
const temperatureCell = Object.freeze({
  'chauffage aller':'Chauffage aller (°C)',
  'chauffage retour':'Chauffage retour (°C)',
  'ecs depart':'ECS départ (°C)',
  'ecs bouclage':'ECS bouclage (°C)',
  'ecs stockage':'ECS stockage (°C)',
});
function measureDestination(name) {
  const n=norm(name);
  if (n.startsWith('vitesse ')) return ['Variation de vitesse',name.replace(/^vitesse\s+/i,'')];
  if (n.startsWith('consigne ')) return ['Consignes',name.replace(/^consigne\s+/i,'')];
  if (n==='pression') return ['Consignes','Pression'];
  const tempNames = ['air neuf','apres recuperation','soufflage','extraction reprise'];
  return tempNames.includes(n) ? ['Températures',name] : null;
}
const childTypes=Object.freeze({
  cta:['filtre_cta','mesure_cta'],
  vmc:[],
  froid:['reseau_froid'],
});
const panelsForFamily=Object.freeze({
  cta:['p-remar-cta','p-remar-filtres','p-remar-cta-mesures','p-remar-cta-energie'],
  vmc:['p-remar-vmc'], froid:['p-remar-froid'],
});

export async function construireRemarDynamiquePourRapport(visiteId, definition) {
  const replacements=new Map();
  const details=[],unsupported=[],ambiguous=[];
  if ((definition?.familyId || definition?.id)!=='remar_v1') {
    return {replacements,details,unsupported,ambiguous,hasDynamic:false};
  }
  const db=await getDb();
  const visit=await db.getFirstAsync('SELECT id,installation_id FROM visites WHERE id=?',[visiteId]);
  if (!visit?.installation_id) return {replacements,details,unsupported,ambiguous,hasDynamic:false};
  let hasDynamic=false;
  for(const family of ['cta','vmc','froid']) {
    const parents=await listerRemarEquipements(visiteId,family);
    const focusedId=await getRemarEquipementReference(visiteId,family,parents);
    if(parents.length>1 && !focusedId) ambiguous.push(`${family.toUpperCase()} : choisis un equipement de reference pour les cases uniques du classeur officiel.`);
    for(const parent of parents) {
      const owner={famille:family,parentName:'',parentId:parent.id,nom:parent.designation||family,
        id:parent.id,type:'equipement'};
      const values=await listerRemarValeurs(visiteId,'equipement',parent.id);
      const isFocus=parent.id===focusedId;
      for(const panel of panelsForFamily[family]) {
        for(const [section,fields] of Object.entries(definition.ui?.panels?.[panel]||{})) {
          for(const field of fields||[]) {
            if (family==='froid' && /^Réseau \d+$/i.test(field.cle)) continue;
            if (family==='vmc' && field.cle==='Nombre de caissons') continue;
            const row=itemValue(values,panel,section,field.cle);
            if (!row) continue;
            hasDynamic=true;
            addInfo(details,owner,{panel,section,cle:field.cle},row);
            if(isFocus) addOfficial(replacements,panel,section,field.cle,row);
            else if(hasData(row))unsupported.push(`${owner.nom} / ${field.cle} : donnee additionnelle non representable dans une case officielle unique.`);
          }
        }
      }
      for(const type of childTypes[family]) {
        const items=await listerRemarItems(visiteId,type,parent.id);
        for(let idx=0;idx<items.length;idx++) {
          const child=items[idx];
          const childValues=await listerRemarValeurs(visiteId,'item',child.id);
          const dataOwner={famille:family,parentName:parent.designation||family,parentId:parent.id,
            nom:child.nom,id:child.id,type,unite:child.unite};
          hasDynamic=true;
          const panel=type==='filtre_cta'?'p-remar-filtres':type==='mesure_cta'?'p-remar-cta-mesures':'p-remar-froid';
          const rowKeys=Object.values(childValues);
          // Chaque enfant figure dans l'annexe meme s'il n'a pas de valeur.
          if(!rowKeys.length) addInfo(details,dataOwner,{panel,section:type,cle:'Type / presence'},
            {valeur:child.nom});
          for(const row of rowKeys) addInfo(details,dataOwner,{panel,section:row.section_code,cle:row.cle},row);
          if(type==='filtre_cta') {
            if(isFocus && idx<3) {
              const sec=`Filtre n°${idx+1}`;
              addOfficial(replacements,panel,sec,'Type de filtre',null,{valeur:child.nom});
              addOfficial(replacements,panel,sec,'Etat du filtre',
                itemValue(childValues,panel,type,'Etat du filtre'));
            } else unsupported.push(`Filtre supplémentaire : ${dataOwner.parentName} / ${child.nom}`);
          } else if(type==='mesure_cta') {
            const target=measureDestination(child.nom);
            const row=itemValue(childValues,panel,type,'Valeur');
            if(isFocus && target && row) addOfficial(replacements,panel,target[0],target[1],row);
            else if(!isFocus || !target) unsupported.push(`Mesure CTA non representable : ${dataOwner.parentName} / ${child.nom}`);
          } else if(type==='reseau_froid') {
            if(isFocus && idx<3) addOfficial(replacements,panel,'Réseaux',`Réseau ${idx+1}`,null,{valeur:child.nom});
            else unsupported.push(`Reseau froid supplementaire : ${dataOwner.parentName} / ${child.nom}`);
          }
        }
      }
    }
    if(family==='vmc'&&focusedId) {
      addOfficial(replacements,'p-remar-vmc','Informations générales','Nombre de caissons',
        null,{valeur:String(parents.length)});
    }
  }
  const temperatures=await listerRemarItems(visiteId,'temperature_chaufferie');
  for(const item of temperatures) {
    const values=await listerRemarValeurs(visiteId,'item',item.id);
    const owner={famille:'chaufferie',parentName:'',parentId:'',nom:item.nom,id:item.id,type:'temperature_chaufferie'};
    const row=itemValue(values,'p-remar-releves','temperature_chaufferie','Valeur');
    hasDynamic=true;
    addInfo(details,owner,{panel:'p-remar-releves',section:'Température chaufferie',cle:'Valeur'},row||{valeur:''});
    const dest=temperatureCell[norm(item.nom)];
    if(dest&&row) addOfficial(replacements,'p-remar-releves','Température chaufferie',dest,row);
    else if(!dest) unsupported.push(`Temperature complementaire : ${item.nom}`);
  }
  return {replacements,details,unsupported:[...new Set(unsupported)],ambiguous,hasDynamic};
}
