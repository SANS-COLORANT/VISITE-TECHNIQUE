import { obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';
import { carryForwardPreviousVisit } from './visitCarryForwardDb.js';

const prefillTermines = new Set();
const prefillEnCours = new Map();

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

async function preremplirVisiteDepuisContexteInterne(db, visiteId) {
  let contexte = await db.getFirstAsync(`SELECT v.id,v.date_visite,v.technicien,v.mode_visite,v.statut,v.trame_id,v.installation_id,v.api_remote_local_id,
            s.id site_id,s.nom_site,s.adresse,s.localisation_note,
            c.id client_id,c.nom nom_client,c.code_exploitant,
            i.nom nom_installation
     FROM visites v
     JOIN sites s ON s.id=v.site_id
     JOIN clients c ON c.id=s.client_id
     LEFT JOIN installations i ON i.id=v.installation_id
     WHERE v.id=?`, [visiteId]);
  if (!contexte) return;

  // ICPE et VMC repartent des champs, avis et mesures de la dernière visite du
  // même local/trame. Pré-allumage ne reprend que les informations durables et
  // garde ses contrôles vides. Les réserves/photos historiques restent isolées.
  const carryForward = await carryForwardPreviousVisit(db, visiteId, contexte);
  contexte = carryForward?.contexte || contexte;

  const trame = obtenirTrame(contexte.trame_id || DEFAULT_TRAME_ID);
  const maintenant = new Date();
  const dateVisite = contexte.date_visite || maintenant.toISOString().slice(0,10);
  const nomLocal = contexte.nom_installation || contexte.localisation_note || null;

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

  // Le matériel courant appartient au patrimoine du LOCAL. Pour une visite
  // préparée depuis Symfony, on ne résume donc que l'installation associée à
  // ce local ; les visites historiques non rattachées gardent le comportement
  // site complet pour compatibilité.
  if (trame.id !== 'pre_allumage') {
    const equipements = contexte.installation_id
      ? await db.getAllAsync(`SELECT e.* FROM equipements e JOIN installations i ON i.id=e.installation_id WHERE i.site_id=? AND i.id=? AND i.actif=1 AND e.statut='actif'`, [contexte.site_id, contexte.installation_id])
      : await db.getAllAsync(`SELECT e.* FROM equipements e JOIN installations i ON i.id=e.installation_id WHERE i.site_id=? AND i.actif=1 AND e.statut='actif'`, [contexte.site_id]);
    if (equipements.length) {
      await insertIfEmpty(db, visiteId, 'p-infos', 'Description des principaux équipements', "Nb d'équipements", equipements.length);
      const types = [...new Set(equipements.map((e)=>String(e.type_code||'').trim()).filter(Boolean))];
      if (types.length === 1) await insertIfEmpty(db, visiteId, 'p-infos', 'Description des principaux équipements', 'Production primaire', types[0]);
    }
  }

  // Compatibilité avec le report stable historique : le nouveau mécanisme
  // ci-dessus a déjà repris les données réutilisables. Cette passe reste
  // idempotente et protège les trames qui déclarent explicitement stable/carryForward.
  const precedente = await db.getFirstAsync(`SELECT id FROM visites
    WHERE site_id=? AND id<>? AND COALESCE(trame_id, ?) = ?
      AND (? IS NULL OR installation_id=?)
    ORDER BY COALESCE(date_visite,'') DESC, modifie_le DESC LIMIT 1`,
  [contexte.site_id, visiteId, DEFAULT_TRAME_ID, trame.id, contexte.installation_id, contexte.installation_id]);
  if (precedente) {
    if (trame.id === 'pre_allumage') {
      await copierChampsPersistantsMemeTrame(db, visiteId, precedente.id, trame);
    } else {
      const clesStables = [['p-infos','Informations générales','Nbr de bât / lgt'],['p-infos','Informations générales','Exploitant - marché'],['p-infos','Informations générales','Type de LT'],['p-infos','Description des principaux équipements','Production primaire'],['p-infos','Description des principaux équipements','Type de régulation'],['p-infos','Description des principaux équipements','Production ECS']];
      const anciens = await db.getAllAsync(
        `SELECT section_code,cle,valeur FROM champs_visite WHERE visite_id=? AND valeur IS NOT NULL AND trim(valeur)<>''`,
        [precedente.id]
      );
      const anciensMap = new Map((anciens || []).map((row) => [`${row.section_code}||${row.cle}`, row.valeur]));
      for (const [p,s,c] of clesStables) {
        const valeur = anciensMap.get(`${sectionCode(p,s)}||${c}`);
        if (valeur) await insertIfEmpty(db, visiteId, p, s, c, valeur);
      }
    }
  }
}

export async function preremplirVisiteDepuisContexte(db, visiteId) {
 const key=String(visiteId||'');if(!key||prefillTermines.has(key))return;
 const existant=prefillEnCours.get(key);if(existant)return existant;
 const promise=preremplirVisiteDepuisContexteInterne(db,visiteId).then((r)=>{prefillTermines.add(key);return r;}).finally(()=>prefillEnCours.delete(key));
 prefillEnCours.set(key,promise);return promise;
}
