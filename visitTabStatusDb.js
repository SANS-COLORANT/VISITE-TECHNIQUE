/**
 * État par onglet d'une visite (DA "Verre chaud") : alimente les pastilles du
 * rail de sections (vide / entamé / terminé / anomalie) et les compteurs
 * S · N.S · S.O de l'en-tête. Même périmètre que visitProgressDb : champs
 * renseignés + contrôles ayant un avis, sur les panneaux définis par la trame.
 */
import { getDb } from './db.js';
import { obtenirTrame, DEFAULT_TRAME_ID, normaliserSectionCode } from './trameRegistry.js';
import { remarFamilleEquipement } from './remarDynamicDb.js';

const cacheStructure = new Map();

function structureTrame(trame) {
  const cached = cacheStructure.get(trame.id);
  if (cached) return cached;
  const parPanel = {};
  for (const [panelId, sections] of Object.entries(trame.ui?.panels || {})) {
    const champs = new Set();
    const controles = new Set();
    for (const [section, fields] of Object.entries(sections || {})) {
      const code = normaliserSectionCode(panelId, section);
      for (const field of fields || []) {
        if (field?.hiddenInApp === true) continue;
        const cle = `${code}||${field.cle}`;
        if (field.type === 'champ') champs.add(cle);
        else if (field.type === 'controle') controles.add(cle);
      }
    }
    if (champs.size || controles.size) parPanel[panelId] = { champs, controles };
  }
  cacheStructure.set(trame.id, parPanel);
  return parPanel;
}

function etat({ total, done, ns }) {
  if (!total) return null;
  if (ns > 0) return 'alert';
  if (done <= 0) return 'empty';
  if (done >= total) return 'done';
  return 'partial';
}

export async function calculerEtatOnglets(visiteId, trameId = DEFAULT_TRAME_ID, snapshot = null) {
  const db = snapshot?.db || await getDb();
  // F09: reuse the exact rows selected for progress instead of issuing
  // another pair of reads with a potentially different revision.
  const [champsRows, controlesRows] = snapshot?.champsRows && snapshot?.controlesRows
    ? [snapshot.champsRows, snapshot.controlesRows]
    : await Promise.all([
      db.getAllAsync(`SELECT section_code,cle,valeur FROM champs_visite WHERE visite_id=?`, [visiteId]),
      db.getAllAsync(`SELECT section_code,cle,avis FROM controles_visite WHERE visite_id=?`, [visiteId]),
    ]);
  const structure = structureTrame(obtenirTrame(trameId || DEFAULT_TRAME_ID));
  const champsRemplis = new Set();
  for (const row of champsRows || []) {
    if (String(row.valeur ?? '').trim() !== '') champsRemplis.add(`${row.section_code}||${row.cle}`);
  }
  const avisParCle = new Map();
  const avis = { S: 0, 'N.S': 0, 'N.R': 0, 'S.O': 0, 'N.V': 0 };
  for (const row of controlesRows || []) {
    const valeur = String(row.avis ?? '').trim();
    if (!valeur) continue;
    avisParCle.set(`${row.section_code}||${row.cle}`, valeur);
    if (avis[valeur] != null) avis[valeur] += 1;
  }

  const tabs = {};
  for (const [panelId, { champs, controles }] of Object.entries(structure)) {
    let done = 0;
    let ns = 0;
    for (const cle of champs) if (champsRemplis.has(cle)) done += 1;
    for (const cle of controles) {
      const v = avisParCle.get(cle);
      if (!v) continue;
      done += 1;
      if (v === 'N.S') ns += 1;
    }
    const total = champs.size + controles.size;
    tabs[panelId] = { total, done, ns, state: etat({ total, done, ns }) };
  }
  // REMAR : la progression est calculee sur les vrais objets, et non sur les
  // anciennes 5 cases reseau / 3 filtres / 5 temperatures qui n'existent
  // plus visuellement. Les anciens dossiers avec valeurs legacy restent
  // consultables et conservent leur progression initiale.
  const definition = obtenirTrame(trameId || DEFAULT_TRAME_ID);
  if ((definition.familyId || definition.id)==='remar_v1') {
    const visit = await db.getFirstAsync('SELECT installation_id,statut FROM visites WHERE id=?', [visiteId]);
    const [equipmentRows,itemRows,dynamicRows,networks,meters] = await Promise.all([
      // SELECT DISTINCT by equipment identity: one asset can have multiple
      // material rows in old visits (A2 case), never count it three times.
      visit?.installation_id ? db.getAllAsync(`SELECT e.id,e.type_code,e.designation,e.statut
        FROM equipements e
        WHERE e.installation_id=? AND (
          (e.statut='actif' AND (
            ?=1 OR EXISTS(SELECT 1 FROM materiel m WHERE m.equipement_id=e.id AND m.visite_id=?)
          )) OR (?=0 AND EXISTS(
            SELECT 1 FROM materiel m WHERE m.equipement_id=e.id AND m.visite_id=?
          ))
        )`,
        [visit.installation_id,['en_cours','a_completer'].includes(visit.statut)?1:0,
         visiteId,['en_cours','a_completer'].includes(visit.statut)?1:0,visiteId]) : Promise.resolve([]),
      db.getAllAsync(`SELECT i.id,i.type_code,i.parent_equipement_id
        FROM remar_item_visits piv JOIN remar_items i ON i.id=piv.item_id
        WHERE piv.visite_id=?`,[visiteId]),
      db.getAllAsync(`SELECT panel_id,owner_type,owner_id,section_code,cle,avis,valeur,commentaire
        FROM remar_values WHERE visite_id=?`,[visiteId]),
      db.getAllAsync('SELECT * FROM reseaux WHERE visite_id=?',[visiteId]),
      db.getAllAsync('SELECT valeur FROM compteurs WHERE visite_id=?',[visiteId]),
    ]);
    const equipTypes=equipmentRows.map(e=>remarFamilleEquipement(e));
    const cta=equipTypes.filter(t=>t==='cta').length;
    const vmc=equipTypes.filter(t=>t==='vmc').length;
    const froid=equipTypes.filter(t=>t==='froid').length;
    const validOwners=new Set([
      ...equipmentRows.map(e=>'equipement||'+e.id),
      ...itemRows.filter(i=>!i.parent_equipement_id||
        equipmentRows.some(e=>e.id===i.parent_equipement_id)).map(i=>'item||'+i.id),
    ]);
    const rowsVisibles=dynamicRows.filter(v=>validOwners.has(v.owner_type+'||'+v.owner_id));
    // A previously unconfirmed N.S with an empty anomaly description is still
    // an unfinished check, never an accepted professional observation.
    const estRenseigne=row=>String(row.valeur||'').trim() ||
      (String(row.avis||'').trim() && (row.avis!=='N.S' || String(row.commentaire||'').trim()));
    const countType=t=>itemRows.filter(i=>i.type_code===t &&
      (!i.parent_equipement_id||equipmentRows.some(e=>e.id===i.parent_equipement_id))).length;
    const countValues=p=>rowsVisibles.filter(v=>v.panel_id===p &&
      !(p==='p-remar-cta'&&v.cle==='Désignation CTA') &&
      estRenseigne(v)).length;
    const countNs=p=>rowsVisibles.filter(v=>v.panel_id===p&&v.avis==='N.S').length;
    const reseauRenseigne=r=>['t_ext_c','t_dep_c','courbe_de_chauffe','tnc',
      'consigne_programme_horaire'].some(col=>String(r[col]??'').trim());
    const definitions={
      'p-remar-reseaux':networks.length,
      'p-remar-releves':meters.length+countType('temperature_chaufferie'),
      // 'Désignation CTA' est désormais le nom de la fiche patrimoine,
      // rempli automatiquement dans l'Excel, pas un champ redemandé.
      'p-remar-cta':cta*12,
      'p-remar-filtres':countType('filtre_cta'),
      'p-remar-cta-mesures':countType('mesure_cta'),
      'p-remar-cta-energie':cta*6,
      'p-remar-vmc':vmc*21,
      'p-remar-froid':froid*7+countType('reseau_froid'),
    };
    for (const [p,total] of Object.entries(definitions)) {
      const current=structure[p]||{champs:new Set(),controles:new Set()};
      const legacy = [...current.champs].some(k=>champsRemplis.has(k)) ||
        [...current.controles].some(k=>avisParCle.has(k));
      if (legacy && total===0) continue;
      let done = countValues(p);
      if(p==='p-remar-reseaux') done=networks.filter(reseauRenseigne).length;
      if(p==='p-remar-releves') done=meters.filter(m=>String(m.valeur||'').trim()).length+countValues(p);
      if(p==='p-remar-filtres') done=rowsVisibles.filter(v=>v.panel_id===p &&
        v.cle==='Etat du filtre' && estRenseigne(v)).length;
      if(p==='p-remar-froid') done=Math.min(total,countValues(p));
      done=Math.min(total,done);
      const ns=countNs(p);
      tabs[p]={total,done,ns,state:etat({total,done,ns})};
    }
    for(const row of rowsVisibles) if(avis[row.avis] != null) avis[row.avis] += 1;
  }
  return { tabs, avis };
}
