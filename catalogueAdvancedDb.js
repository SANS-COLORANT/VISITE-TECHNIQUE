import { getDb } from './db.js';

const SYNONYMS={
  'geg':['groupe eau glacée','groupe froid','chiller'],
  'groupe froid':['groupe eau glacée','geg','chiller'],
  'eau glacée':['groupe eau glacée','chiller','ventilo-convecteur'],
  'circulateur':['pompe','circulation'],
  'vfd':['variateur','variateur de fréquence','drive'],
  'variateur':['vfd','drive'],
  'drv':['vrv','vrf'],
  'vrv':['drv','vrf'],
  'cta':['centrale traitement air','centrale de traitement d’air'],
  'vmc':['ventilation mécanique contrôlée','extracteur'],
  'pac':['pompe à chaleur','heat pump'],
  'ecs':['eau chaude sanitaire'],
};
function expandSearch(value=''){
  const q=value.trim().toLowerCase(); if(!q)return [];
  const out=new Set([q]);
  Object.entries(SYNONYMS).forEach(([key,vals])=>{if(q.includes(key)){vals.forEach(v=>out.add(q.replace(key,v)));out.add(key);vals.forEach(v=>out.add(v));}});
  return [...out];
}

export async function rechercherCatalogueIntelligent({recherche='',categorieId=null,marqueId=null,favoris=false,lifecycle=null,limit=250}={}){
  const db=await getDb();
  const terms=expandSearch(recherche);
  const params=[];
  const filters=['m.actif=1','c.actif=1','b.actif=1'];
  if(categorieId){filters.push('m.categorie_id=?');params.push(categorieId);}
  if(marqueId){filters.push('m.marque_id=?');params.push(marqueId);}
  if(lifecycle){filters.push('m.lifecycle_status=?');params.push(lifecycle);}
  if(favoris)filters.push('COALESCE(u.favori,0)=1');
  if(terms.length){
    const chunks=[];
    for(const term of terms){const like=`%${term}%`;chunks.push(`(
      lower(c.nom) LIKE ? OR lower(b.nom) LIKE ? OR lower(m.nom) LIKE ? OR lower(COALESCE(m.reference,'')) LIKE ? OR
      lower(COALESCE(m.caracteristiques,'')) LIKE ? OR lower(COALESCE(m.mots_cles,'')) LIKE ? OR lower(COALESCE(m.aliases,'')) LIKE ? OR
      EXISTS(SELECT 1 FROM variantes_equipement v WHERE v.modele_id=m.id AND v.actif=1 AND (lower(v.nom) LIKE ? OR lower(COALESCE(v.reference,'')) LIKE ? OR lower(COALESCE(v.description,'')) LIKE ?)) OR
      EXISTS(SELECT 1 FROM variantes_equipement v JOIN caracteristiques_equipement s ON s.variante_id=v.id WHERE v.modele_id=m.id AND v.actif=1 AND (lower(s.cle) LIKE ? OR lower(COALESCE(s.valeur,'')) LIKE ? OR lower(COALESCE(s.unite,'')) LIKE ?))
    )`);for(let i=0;i<13;i++)params.push(like);}
    filters.push(`(${chunks.join(' OR ')})`);
  }
  params.push(limit);
  return db.getAllAsync(`SELECT m.*,c.nom categorie,c.icone,b.nom marque,b.logo_uri,b.couleur,
    COALESCE(u.favori,0) favori,u.dernier_acces,u.ouvertures,
    (SELECT COUNT(*) FROM variantes_equipement v WHERE v.modele_id=m.id AND v.actif=1) nb_variantes,
    (SELECT COUNT(*) FROM variantes_equipement v JOIN documents_equipement d ON d.variante_id=v.id WHERE v.modele_id=m.id) nb_documents,
    (SELECT COUNT(*) FROM variantes_equipement v JOIN courbes_equipement q ON q.variante_id=v.id WHERE v.modele_id=m.id) nb_courbes
    FROM modeles_equipement m JOIN categories_equipement c ON c.id=m.categorie_id JOIN marques_equipement b ON b.id=m.marque_id
    LEFT JOIN catalogue_usage u ON u.modele_id=m.id
    WHERE ${filters.join(' AND ')}
    ORDER BY COALESCE(u.favori,0) DESC, COALESCE(u.dernier_acces,'') DESC, c.ordre,b.nom,m.nom LIMIT ?`,params);
}

export async function enregistrerOuvertureModele(modeleId){const db=await getDb();await db.runAsync(`INSERT INTO catalogue_usage(modele_id,favori,ouvertures,dernier_acces) VALUES(?,0,1,datetime('now')) ON CONFLICT(modele_id) DO UPDATE SET ouvertures=ouvertures+1,dernier_acces=datetime('now')`,[modeleId]);}
export async function basculerFavoriModele(modeleId){const db=await getDb();await db.runAsync(`INSERT INTO catalogue_usage(modele_id,favori,ouvertures,dernier_acces) VALUES(?,1,0,datetime('now')) ON CONFLICT(modele_id) DO UPDATE SET favori=CASE WHEN favori=1 THEN 0 ELSE 1 END,dernier_acces=datetime('now')`,[modeleId]);return db.getFirstAsync('SELECT favori FROM catalogue_usage WHERE modele_id=?',[modeleId]);}
export async function listerModelesRecents(limit=12){const db=await getDb();return db.getAllAsync(`SELECT m.*,c.nom categorie,b.nom marque,b.logo_uri,b.couleur,u.favori,u.dernier_acces,u.ouvertures,(SELECT COUNT(*) FROM variantes_equipement v WHERE v.modele_id=m.id AND v.actif=1) nb_variantes,(SELECT COUNT(*) FROM variantes_equipement v JOIN documents_equipement d ON d.variante_id=v.id WHERE v.modele_id=m.id) nb_documents,(SELECT COUNT(*) FROM variantes_equipement v JOIN courbes_equipement q ON q.variante_id=v.id WHERE v.modele_id=m.id) nb_courbes FROM catalogue_usage u JOIN modeles_equipement m ON m.id=u.modele_id JOIN categories_equipement c ON c.id=m.categorie_id JOIN marques_equipement b ON b.id=m.marque_id WHERE m.actif=1 ORDER BY u.dernier_acces DESC LIMIT ?`,[limit]);}

export function getFamilyPriorityKeys(category=''){
  const c=category.toLowerCase();
  if(c.includes('pompe')||c.includes('circulateur'))return ['Débit','HMT','Vitesse','Puissance','DN','Pression','EEI'];
  if(c.includes('pac')||c.includes('groupe eau')||c.includes('froid'))return ['Puissance chauffage','Puissance froid','COP','SCOP','EER','SEER','Fluide frigorigène','Température départ'];
  if(c.includes('cta')||c.includes('vmc')||c.includes('ventil'))return ['Débit d’air','Pression','Récupération','Filtration','Puissance moteur','Régulation'];
  if(c.includes('chaudi'))return ['Puissance','Rendement','Pression','Température','Combustible','NOx'];
  if(c.includes('échangeur'))return ['Puissance','Débit','Nombre de plaques','Pression','Température','Matériau'];
  return [];
}

export function scoreCompletudeModele(model={}){
  let score=0;
  if(model.image_uri)score+=20;
  if((model.nb_variantes||0)>0)score+=20;
  if((model.nb_documents||0)>0)score+=20;
  if((model.nb_courbes||0)>0)score+=15;
  if(String(model.data_quality||'').startsWith('verified'))score+=15;
  if(model.caracteristiques)score+=10;
  return Math.min(100,score);
}

export async function obtenirAuditCompletudeCatalogue(limit=50){
  const rows=await rechercherCatalogueIntelligent({limit:1000});
  return rows.map(r=>({...r,completude:scoreCompletudeModele(r)})).sort((a,b)=>a.completude-b.completude||String(a.marque).localeCompare(String(b.marque))).slice(0,limit);
}
