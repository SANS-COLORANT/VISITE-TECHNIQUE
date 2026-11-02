/**
 * REMAR: projection non destructive vers les cellules officielles et annexe
 * exhaustive. Une fiche unique est mappee automatiquement ; si plusieurs
 * equipements existent, une reference explicite est requise.
 */
import { getDb } from './db.js';
import { destinationMesureCTA, valeurOfficielleRemar } from './remarFieldGuidance.js';
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
    row?.source_visite_id||'',row?.inherited?'Historique à confirmer':'Visite courante',owner.unite||'',
  ]);
}
const temperatureCell = Object.freeze({
  'chauffage aller':'Chauffage aller (°C)',
  'chauffage retour':'Chauffage retour (°C)',
  'ecs depart':'ECS départ (°C)',
  'ecs bouclage':'ECS bouclage (°C)',
  'ecs stockage':'ECS stockage (°C)',
});
// Les destinations sont les libellés exacts des 141 cellules REMAR officielles.
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
  // Une cellule officielle est unique : deux sources divergentes doivent
  // provoquer un blocage explicite, jamais un remplacement silencieux.
  const projectOfficial=(panel,section,cle,row,extra={})=>{
    if (!row && !('valeur' in extra)) return;
    const officialKey=key(panel,section,cle);
    const next={...extra,...(row||{})};
    const previous=replacements.get(officialKey);
    const comparable=x=>JSON.stringify([x?.valeur??null,x?.avis??null,x?.commentaire??null]);
    if(previous && comparable(previous)!==comparable(next)){
      unsupported.push(`Destination REMAR conflictuelle : ${panel} / ${section} / ${cle} (plusieurs saisies pour une seule cellule officielle).`);
      return;
    }
    addOfficial(replacements,panel,section,cle,row,extra);
  };
  if ((definition?.familyId || definition?.id)!=='remar_v1') {
    return {replacements,details,unsupported,ambiguous,hasDynamic:false};
  }
  const db=await getDb();
  const visit=await db.getFirstAsync('SELECT id,installation_id FROM visites WHERE id=?',[visiteId]);
  if (!visit?.installation_id) return {replacements,details,unsupported,ambiguous,hasDynamic:false};
  let hasDynamic=false;
  const familyCounts={cta:0,vmc:0,froid:0};
  for(const family of ['cta','vmc','froid']) {
    const parents=await listerRemarEquipements(visiteId,family);
    // La presence d'un equipement multi-instance suffit a neutraliser les
    // anciens champs CTA fixes lors de l'envoi, meme sans mesure nouvelle.
    familyCounts[family]=parents.length;
    if(parents.length)hasDynamic=true;
    const focusedId=await getRemarEquipementReference(visiteId,family,parents);
    if(parents.length>1 && !focusedId) ambiguous.push(`${family.toUpperCase()} : choisis un equipement de reference pour les cases uniques du classeur officiel.`);
    // Même une CTA additionnelle sans valeurs est une information physique
    // que Symfony V1 ne sait pas créer comme branche indépendante.
    // Une référence Excel choisie n'autorise donc PAS un POST tronqué.
    if(parents.length>1) unsupported.push(
      `${family.toUpperCase()} : ${parents.length} équipements indépendants, une seule série de cellules officielles. Les instances supplémentaires ne sont pas transmissibles sans extension Symfony.`);

    for(const parent of parents) {
      const owner={famille:family,parentName:'',parentId:'',nom:parent.designation||family,
        id:parent.id,type:'equipement'};
      const values=await listerRemarValeurs(visiteId,'equipement',parent.id);
      const accounted=new Set();
      const isFocus=parent.id===focusedId;
      // L'annexe doit toujours identifier une CTA/caisson présent, même
      // lorsqu'aucune valeur n'a été relevée dans cette visite.
      addInfo(details,owner,{panel:panelsForFamily[family][0],
        section:'Équipement',cle:'Identité patrimoine'},
        {valeur:parent.designation||family});
      if(family==='cta'&&isFocus){
        // Le nom de CTA est sa désignation patrimoniale éditable : pas de
        // second formulaire ni de choix absurde 'Sans objet'.
        projectOfficial('p-remar-cta','Informations techniques',
          'Désignation CTA',null,{valeur:parent.designation||'CTA'});
      }
      for(const panel of panelsForFamily[family]) {
        for(const [section,fields] of Object.entries(definition.ui?.panels?.[panel]||{})) {
          for(const field of fields||[]) {
            if (family==='froid' && /^Réseau \d+$/i.test(field.cle)) continue;
            if (family==='vmc' && field.cle==='Nombre de caissons') continue;
            const row=itemValue(values,panel,section,field.cle);
            if (!row) continue;
            accounted.add(key(panel,section,field.cle));
            hasDynamic=true;
            addInfo(details,owner,{panel,section,cle:field.cle},row);
            if(isFocus) projectOfficial(panel,section,field.cle,
              field.type==='champ'?{...row,valeur:valeurOfficielleRemar(row)}:row);
            else if(hasData(row) && !row.inherited)unsupported.push(`${owner.nom} / ${field.cle} : donnee additionnelle non representable dans une case officielle unique.`);
          }
        }
      }
      // Une trame éditable peut enregistrer des champs supplémentaires. Les
      // restituer en annexe ET refuser une transmission V1 silencieusement
      // incomplète ; ne pas les jeter parce qu'ils ne sont pas dans les 141.
      for (const [storageKey,row] of Object.entries(values)) {
        if(accounted.has(storageKey))continue;
        addInfo(details,owner,{panel:row.panel_id,section:row.section_code,cle:row.cle},row);
        if(hasData(row) && !row.inherited)
          unsupported.push(`${owner.nom} : champ dynamique non présent au référentiel officiel (${row.panel_id} / ${row.cle}).`);
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
          const accepted=new Set();
          const markAccepted=cle=>accepted.add(key(panel,type,cle));
          // Chaque enfant figure dans l'annexe meme s'il n'a pas de valeur.
          if(!rowKeys.length) addInfo(details,dataOwner,{panel,section:type,cle:'Type / presence'},
            {valeur:child.nom});
          for(const row of rowKeys) addInfo(details,dataOwner,{panel,section:row.section_code,cle:row.cle},row);
          if(type==='filtre_cta') {
            if(isFocus && idx<3) {
              const sec=`Filtre n°${idx+1}`;
              // Le nom de la fiche est distinct de sa classe de filtration :
              // un filtre nommé 'Filtre soufflage n°2' de classe F7 doit exporter F7.
              const classe=itemValue(childValues,panel,type,'Classe de filtration');
              markAccepted('Classe de filtration');
              markAccepted('Etat du filtre');
              projectOfficial(panel,sec,'Type de filtre',null,
                {valeur:classe?valeurOfficielleRemar(classe):child.nom});
              projectOfficial(panel,sec,'Etat du filtre',
                itemValue(childValues,panel,type,'Etat du filtre'));
            } else unsupported.push(`Filtre supplémentaire : ${dataOwner.parentName} / ${child.nom}`);
          } else if(type==='mesure_cta') {
            const target=destinationMesureCTA(child.nom);
            const row=itemValue(childValues,panel,type,'Valeur');
            if(isFocus && target && row) {
              markAccepted('Valeur');
              projectOfficial(panel,target[0],target[1],
                {...row,valeur:valeurOfficielleRemar(row)});
            }
            else if(hasData(row) && !row.inherited && (!isFocus || !target))
              unsupported.push(`Mesure CTA non representable : ${dataOwner.parentName} / ${child.nom}`);
          } else if(type==='reseau_froid') {
            if(isFocus && idx<3) projectOfficial(panel,'Réseaux',`Réseau ${idx+1}`,null,{valeur:child.nom});
            else unsupported.push(`Reseau froid supplementaire : ${dataOwner.parentName} / ${child.nom}`);
          }
          // Les colonnes officiellement mappées sont parfois des champs
          // texte simples sans colonne commentaire ; si la donnée possède
          // un constat complémentaire, celui-ci reste dans REMAR_DETAIL,
          // mais Symfony V1 ne peut pas le représenter complètement.
          for (const [valueKey,value] of Object.entries(childValues)) {
            if(!hasData(value) || value.inherited)continue;
            const hasExtra=accepted.has(valueKey) && (
              (value.commentaire && String(value.commentaire).trim()) ||
              (type==='filtre_cta'&&value.cle==='Classe de filtration' && value.avis)
            );
            if(!accepted.has(valueKey) || hasExtra)
              unsupported.push(`${dataOwner.parentName} / ${dataOwner.nom} : valeur ou observation non représentable dans une cellule officielle (${value.cle}).`);
          }
        }
      }
    }
    if(family==='vmc'&&focusedId) {
      projectOfficial('p-remar-vmc','Informations générales','Nombre de caissons',
        null,{valeur:String(parents.length)});
    }
  }
  const temperatures=await listerRemarItems(visiteId,'temperature_chaufferie');
  for(const item of temperatures) {
    const values=await listerRemarValeurs(visiteId,'item',item.id);
    const owner={famille:'chaufferie',parentName:'',parentId:'',nom:item.nom,id:item.id,type:'temperature_chaufferie',unite:item.unite};
    const row=itemValue(values,'p-remar-releves','temperature_chaufferie','Valeur');
    hasDynamic=true;
    addInfo(details,owner,{panel:'p-remar-releves',section:'Température chaufferie',cle:'Valeur'},row||{valeur:''});
    const dest=temperatureCell[norm(item.nom)];
    if(dest&&row) {
      projectOfficial('p-remar-releves','Température chaufferie',dest,
        {...row,valeur:valeurOfficielleRemar(row)});
      if(!row.inherited && String(row.commentaire||'').trim())
        unsupported.push(`Température ${item.nom} : commentaire impossible à transporter dans une cellule officielle de mesure.`);
    } else if(!dest&&hasData(row) && !row.inherited)
      unsupported.push(`Temperature complementaire : ${item.nom}`);
    for (const other of Object.values(values)) {
      if(other===row)continue;
      addInfo(details,owner,{panel:other.panel_id,section:other.section_code,cle:other.cle},other);
      if(hasData(other) && !other.inherited)
        unsupported.push(`Température ${item.nom} : champ supplémentaire non prévu (${other.cle}).`);
    }
  }
  return {replacements,details,unsupported:[...new Set(unsupported)],ambiguous,hasDynamic,
    familyCounts,temperaturesCount:temperatures.length};
}

/**
 * Centralise l'autorité entre les fiches REMAR actuelles et les anciens champs
 * plats. Appelé à l'identique par l'Excel et par la sérialisation Intranet.
 */
export function remarDynamicOwnsMapping(mapping, projection) {
  if (!mapping || !projection?.hasDynamic) return false;
  const panel=mapping.panelId;
  const counts=projection.familyCounts || {};
  return Boolean(
    (counts.cta > 0 && panelsForFamily.cta.includes(panel)) ||
    (counts.vmc > 0 && panelsForFamily.vmc.includes(panel)) ||
    (counts.froid > 0 && panelsForFamily.froid.includes(panel)) ||
    (projection.temperaturesCount > 0 && panel==='p-remar-releves' &&
      mapping.section==='Température chaufferie')
  );
}
