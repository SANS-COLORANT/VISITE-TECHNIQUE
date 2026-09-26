/**
 * État par onglet d'une visite (DA "Verre chaud") : alimente les pastilles du
 * rail de sections (vide / entamé / terminé / anomalie) et les compteurs
 * S · N.S · S.O de l'en-tête. Même périmètre que visitProgressDb : champs
 * renseignés + contrôles ayant un avis, sur les panneaux définis par la trame.
 */
import { getDb } from './db.js';
import { obtenirTrame, DEFAULT_TRAME_ID, normaliserSectionCode } from './trameRegistry.js';

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
  return { tabs, avis };
}
