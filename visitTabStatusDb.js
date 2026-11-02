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

export async function calculerEtatOnglets(visiteId, trameId = DEFAULT_TRAME_ID) {
  const db = await getDb();
  const [champsRows, controlesRows] = await Promise.all([
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
      visit?.installation_id ? db.getAllAsync(`SELECT e.type_code,e.designation,m.id AS materiel_id,e.statut
        FROM equipements e LEFT JOIN materiel m ON m.equipement_id=e.id AND m.visite_id=?
        WHERE e.installation_id=? AND (m.id IS NOT NULL OR (e.statut='actif' AND ?=1))`,
        [visiteId,visit.installation_id,visit.statut==='en_cours'?1:0]) : Promise.resolve([]),
      db.getAllAsync(`SELECT i.type_code FROM remar_item_visits piv JOIN remar_items i ON i.id=piv.item_id
        WHERE piv.visite_id=?`,[visiteId]),
      db.getAllAsync(`SELECT panel_id,owner_type,owner_id,avis,valeur FROM remar_values WHERE visite_id=?`,[visiteId]),
      db.getAllAsync('SELECT nom_reseau FROM reseaux WHERE visite_id=?',[visiteId]),
      db.getAllAsync('SELECT valeur FROM compteurs WHERE visite_id=?',[visiteId]),
    ]);
    const equipTypes=equipmentRows.map(e=>remarFamilleEquipement(e));
    const cta=equipTypes.filter(t=>t==='cta').length;
    const vmc=equipTypes.filter(t=>t==='vmc').length;
    const froid=equipTypes.filter(t=>t==='froid').length;
    const countType=t=>itemRows.filter(i=>i.type_code===t).length;
    const countValues=p=>dynamicRows.filter(v=>v.panel_id===p &&
      (String(v.avis||'').trim()||String(v.valeur||'').trim())).length;
    const countNs=p=>dynamicRows.filter(v=>v.panel_id===p&&v.avis==='N.S').length;
    const definitions={
      'p-remar-reseaux':networks.length,
      'p-remar-releves':meters.length+countType('temperature_chaufferie'),
      'p-remar-cta':cta*13,
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
      if(p==='p-remar-reseaux') done=networks.filter(n=>String(n.nom_reseau||'').trim()).length;
      if(p==='p-remar-releves') done=meters.filter(m=>String(m.valeur||'').trim()).length+countValues(p);
      if(p==='p-remar-filtres') done=dynamicRows.filter(v=>v.panel_id===p&&v.avis).length;
      if(p==='p-remar-froid') done=Math.min(total,countValues(p)+countType('reseau_froid'));
      done=Math.min(total,done);
      const ns=countNs(p);
      tabs[p]={total,done,ns,state:etat({total,done,ns})};
    }
    for(const row of dynamicRows) if(avis[row.avis] != null) avis[row.avis] += 1;
  }
  return { tabs, avis };
}
