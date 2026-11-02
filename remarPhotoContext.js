/**
 * Rattachement photo REMAR: toute photo prise depuis une CTA, un filtre, une
 * mesure, un controle ou la reserve issue du controle conserve son parent CTA.
 * Classement par identifiant stable, jamais par nom "CTA 1"/"CTA 2" ambigu.
 * Aucune migration ni mutation de la table photos.
 */
import { getDb } from './db.js';
import { obtenirTrame } from './trameRegistry.js';
import { remarFamilleEquipement } from './remarDynamicDb.js';

export function identifiantCtaPhoto(entiteKey, contexte = {}) {
  const cle=String(entiteKey||'');
  const parts=cle.split('||');
  let type=parts[0],id=parts[1];
  if(type==='remarque') {
    const key=contexte.reserves?.[id];
    if(!key||key===cle)return null;
    return identifiantCtaPhoto(key,{...contexte,reserves:{}}); // evite recursions entre reserves
  }
  if(type==='remar') {type=parts[1];id=parts[2];}
  if(type==='equipement')return contexte.ctas?.[id]?id:null;
  if(type==='item') {
    const parent=contexte.items?.[id]?.parentId;
    return parent&&contexte.ctas?.[parent]?parent:null;
  }
  return null;
}
export function contextePhotoRemar(entiteKey,contexte={}) {
  const ctaId=identifiantCtaPhoto(entiteKey,contexte);
  if(!ctaId)return null;
  const cta=contexte.ctas[ctaId];
  const parts=String(entiteKey||'').split('||');
  const reserveKey=parts[0]==='remarque'?contexte.reserves?.[parts[1]]:null;
  const owner=(reserveKey||entiteKey).split('||');
  const childId=owner[0]==='remar'&&owner[1]==='item'?owner[2]:null;
  const child=childId?contexte.items?.[childId]:null;
  const prefix=child?`${cta.nom} · ${child.nom}`:cta.nom;
  return {id:ctaId,nom:cta.nom,element:child?.nom||null,prefix};
}

export async function lireContextePhotosRemar(visiteId) {
  const db=await getDb();
  const visit=await db.getFirstAsync('SELECT installation_id,trame_id FROM visites WHERE id=?',[visiteId]);
  if(!visit?.installation_id || (obtenirTrame(visit.trame_id)?.familyId||obtenirTrame(visit.trame_id)?.id)!=='remar_v1'){
    return {ctas:{},items:{},reserves:{}};
  }
  const [equipements,items,remarques]=await Promise.all([
    db.getAllAsync('SELECT id,designation,type_code FROM equipements WHERE installation_id=?',[visit.installation_id]),
    db.getAllAsync('SELECT id,parent_equipement_id,nom FROM remar_items WHERE installation_id=?',[visit.installation_id]),
    db.getAllAsync('SELECT id,controle_key FROM remarques WHERE visite_id=?',[visiteId]),
  ]);
  const ctas={};
  for(const e of equipements)if(remarFamilleEquipement(e)==='cta'){
    ctas[e.id]={id:e.id,nom:String(e.designation||'CTA')};
  }
  return {
    ctas,
    items:Object.fromEntries(items.map(x=>[x.id,{parentId:x.parent_equipement_id,nom:x.nom}])),
    reserves:Object.fromEntries(remarques.filter(r=>r.controle_key).map(r=>[r.id,r.controle_key])),
  };
}
