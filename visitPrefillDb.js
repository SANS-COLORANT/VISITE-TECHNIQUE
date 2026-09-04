import { obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';
import { assurerStructureSitePreAllumage } from './preAllumageSiteBootstrap.js';

function sectionCode(panelId, section) {
  return panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
}
async function insertIfEmpty(db, visiteId, panelId, section, cle, valeur) {
  if (valeur === null || valeur === undefined || String(valeur).trim() === '') return;
  await db.runAsync(`INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)
     ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur
     WHERE champs_visite.valeur IS NULL OR trim(champs_visite.valeur)=''`, [visiteId, sectionCode(panelId, section), cle, String(valeur)]);
}
function formatHeure(date = new Date()) { const p = (n) => String(n).padStart(2, '0'); return `${p(date.getHours())}:${p(date.getMinutes())}`; }
function saisonDeChauffe(dateTexte) {
  const d = dateTexte ? new Date(`${String(dateTexte).slice(0,10)}T12:00:00`) : new Date();
  const y = Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  const m = Number.isNaN(d.getTime()) ? new Date().getMonth()+1 : d.getMonth()+1;
  const debut = m >= 7 ? y : y - 1; return `${debut}-${debut+1}`;
}
async function copierChampsPersistantsMemeTrame(db, visiteId, precedenteId, trame) {
  if (!precedenteId) return;
  for (const [panelId, sections] of Object.entries(trame.ui?.panels || {})) {
    for (const [section, fields] of Object.entries(sections || {})) {
      for (const field of fields || []) {
        if (field.type !== 'champ' || (!field.stable && !field.carryForward)) continue;
        const code = sectionCode(panelId, section);
        const ancien = await db.getFirstAsync(`SELECT valeur FROM champs_visite WHERE visite_id=? AND section_code=? AND cle=?`, [precedenteId, code, field.cle]);
        if (ancien?.valeur) await insertIfEmpty(db, visiteId, panelId, section, field.cle, ancien.valeur);
      }
    }
  }
}

export async function preremplirVisiteDepuisContexte(db, visiteId) {
  const contexte = await db.getFirstAsync(`SELECT v.id,v.date_visite,v.technicien,v.mode_visite,v.trame_id,
            s.id site_id,s.nom_site,s.adresse,s.localisation_note,
            c.id client_id,c.nom nom_client,c.code_exploitant
     FROM visites v JOIN sites s ON s.id=v.site_id JOIN clients c ON c.id=s.client_id WHERE v.id=?`, [visiteId]);
  if (!contexte) return;
  const trame = obtenirTrame(contexte.trame_id || DEFAULT_TRAME_ID);
  const maintenant = new Date(); const dateVisite = contexte.date_visite || maintenant.toISOString().slice(0,10); const nomLocal = contexte.localisation_note || null;

  if (trame.id === 'pre_allumage') {
    const fixesPa = [
      ['p-pa-infos','Général','Nom du client',contexte.nom_client],
      ['p-pa-infos','Général','Nom du site',contexte.nom_site],
      ['p-pa-infos','Général','Nom du local / adresse',nomLocal || contexte.adresse],
      ['p-pa-infos','Général','Trame utilisée','PRE-ALLUMAGE v1'],
      ['p-pa-infos','Général','Date de la visite',dateVisite],
      ['p-pa-infos','Informations générales','Date de visite',dateVisite],
      ['p-pa-infos','Informations générales','Saison de chauffe',saisonDeChauffe(dateVisite)],
      ['p-pa-infos','Informations générales','Exploitant',contexte.code_exploitant],
      ['p-pa-infos','Informations générales','Chargé d’affaires / rédacteur',contexte.technicien],
    ];
    for (const [p,s,c,v] of fixesPa) await insertIfEmpty(db, visiteId, p, s, c, v);
  } else {
    const fixes = [
      ['p-infos','Général','Nom du client',contexte.nom_client],['p-infos','Général','Nom du site',contexte.nom_site],['p-infos','Général','Nom du local',nomLocal],['p-infos','Général','Trame utilisée',trame.nom],['p-infos','Général','Date de la visite',dateVisite],
      ['p-infos','Informations générales','Date de visite',dateVisite],['p-infos','Informations générales','Heure de visite',formatHeure(maintenant)],['p-infos','Informations générales','Nom du site',contexte.nom_site],['p-infos','Informations générales','Adresse',contexte.adresse],
    ];
    for (const [p,s,c,v] of fixes) await insertIfEmpty(db, visiteId, p, s, c, v);
  }

  const equipements = await db.getAllAsync(`SELECT e.* FROM equipements e JOIN installations i ON i.id=e.installation_id WHERE i.site_id=? AND i.actif=1 AND e.statut='actif'`, [contexte.site_id]);
  if (trame.id !== 'pre_allumage' && equipements.length) {
    await insertIfEmpty(db, visiteId, 'p-infos', 'Description des principaux équipements', "Nb d'équipements", equipements.length);
    const types = [...new Set(equipements.map((e)=>String(e.type_code||'').trim()).filter(Boolean))];
    if (types.length === 1) await insertIfEmpty(db, visiteId, 'p-infos', 'Description des principaux équipements', 'Production primaire', types[0]);
  }

  const precedente = await db.getFirstAsync(`SELECT id FROM visites WHERE site_id=? AND id<>? AND COALESCE(trame_id, ?) = ? ORDER BY COALESCE(date_visite,'') DESC, modifie_le DESC LIMIT 1`, [contexte.site_id, visiteId, DEFAULT_TRAME_ID, trame.id]);
  if (precedente) {
    if (trame.id === 'pre_allumage') {
      await copierChampsPersistantsMemeTrame(db, visiteId, precedente.id, trame);
    } else {
      const clesStables = [['p-infos','Informations générales','Nbr de bât / lgt'],['p-infos','Informations générales','Exploitant - marché'],['p-infos','Informations générales','Type de LT'],['p-infos','Description des principaux équipements','Production primaire'],['p-infos','Description des principaux équipements','Type de régulation'],['p-infos','Description des principaux équipements','Production ECS']];
      for (const [p,s,c] of clesStables) {
        const ancien = await db.getFirstAsync(`SELECT valeur FROM champs_visite WHERE visite_id=? AND section_code=? AND cle=?`, [precedente.id, sectionCode(p,s), c]);
        if (ancien?.valeur) await insertIfEmpty(db, visiteId, p, s, c, ancien.valeur);
      }
    }
  }

  if (trame.id === 'pre_allumage') {
    await assurerStructureSitePreAllumage(visiteId);
  }
}
