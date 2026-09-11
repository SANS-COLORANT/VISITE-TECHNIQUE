import { obtenirTrame, DEFAULT_TRAME_ID } from './trameRegistry.js';
import { carryForwardPreviousVisit } from './visitCarryForwardDb.js';

const prefillTermines = new Set();
const prefillEnCours = new Map();
const PREFILL_MARKER_VERSION = 2;

function sectionCode(panelId, section) { return panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_'); }
function formatHeure(date = new Date()) { const p = (n) => String(n).padStart(2, '0'); return `${p(date.getHours())}:${p(date.getMinutes())}`; }
function saisonDeChauffe(dateTexte) {
  const d = dateTexte ? new Date(`${String(dateTexte).slice(0,10)}T12:00:00`) : new Date();
  const y = Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  const m = Number.isNaN(d.getTime()) ? new Date().getMonth()+1 : d.getMonth()+1;
  const debut = m >= 7 ? y : y - 1; return `${debut}-${debut+1}`;
}
function prefillMarker(visiteId) { return `visit_prefill_v${PREFILL_MARKER_VERSION}:${String(visiteId)}`; }

/** Une seule traversée du bridge SQLite pour tout un bloc de champs fixes. */
async function insertManyIfEmpty(db, visiteId, rows) {
  const values = (rows || []).filter((row) => row?.[3] !== null && row?.[3] !== undefined && String(row[3]).trim() !== '');
  if (!values.length) return 0;
  const placeholders = values.map(() => '(?,?,?,?)').join(',');
  const params = values.flatMap(([panelId, section, cle, valeur]) => [visiteId, sectionCode(panelId, section), cle, String(valeur)]);
  const result = await db.runAsync(`INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES ${placeholders}
    ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur
    WHERE champs_visite.valeur IS NULL OR trim(champs_visite.valeur)=''`, params);
  return Number(result?.changes || 0);
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

  // Le report complet est fait une seule fois ici. visitCarryForwardDb utilise
  // des INSERT...SELECT groupés pour ICPE/VMC ; aucune seconde passe historique
  // n'est nécessaire ensuite.
  const carryForward = await carryForwardPreviousVisit(db, visiteId, contexte);
  contexte = carryForward?.contexte || contexte;

  const trame = obtenirTrame(contexte.trame_id || DEFAULT_TRAME_ID);
  const maintenant = new Date();
  const dateVisite = contexte.date_visite || maintenant.toISOString().slice(0,10);
  const nomLocal = contexte.nom_installation || contexte.localisation_note || null;

  const fixes = trame.id === 'pre_allumage' ? [
    ['p-pa-infos','Général','Nom du client',contexte.nom_client],
    ['p-pa-infos','Général','Nom du site',contexte.nom_site],
    ['p-pa-infos','Général','Nom du local / adresse',nomLocal || contexte.adresse],
    ['p-pa-infos','Général','Trame utilisée','PRE-ALLUMAGE v1'],
    ['p-pa-infos','Général','Date de la visite',dateVisite],
    ['p-pa-infos','Informations générales','Date de visite',dateVisite],
    ['p-pa-infos','Informations générales','Saison de chauffe',saisonDeChauffe(dateVisite)],
    ['p-pa-infos','Informations générales','Exploitant',contexte.code_exploitant],
    ['p-pa-infos','Informations générales','Chargé d’affaires / rédacteur',contexte.technicien],
  ] : [
    ['p-infos','Général','Nom du client',contexte.nom_client],
    ['p-infos','Général','Nom du site',contexte.nom_site],
    ['p-infos','Général','Nom du local',nomLocal],
    ['p-infos','Général','Trame utilisée',trame.nom],
    ['p-infos','Général','Date de la visite',dateVisite],
    ['p-infos','Informations générales','Date de visite',dateVisite],
    ['p-infos','Informations générales','Heure de visite',formatHeure(maintenant)],
    ['p-infos','Informations générales','Nom du site',contexte.nom_site],
    ['p-infos','Informations générales','Adresse',contexte.adresse],
  ];
  await insertManyIfEmpty(db, visiteId, fixes);

  if (trame.id !== 'pre_allumage') {
    const equipements = contexte.installation_id
      ? await db.getAllAsync(`SELECT e.type_code FROM equipements e JOIN installations i ON i.id=e.installation_id WHERE i.site_id=? AND i.id=? AND i.actif=1 AND e.statut='actif'`, [contexte.site_id, contexte.installation_id])
      : await db.getAllAsync(`SELECT e.type_code FROM equipements e JOIN installations i ON i.id=e.installation_id WHERE i.site_id=? AND i.actif=1 AND e.statut='actif'`, [contexte.site_id]);
    if (equipements.length) {
      const types = [...new Set(equipements.map((e)=>String(e.type_code||'').trim()).filter(Boolean))];
      await insertManyIfEmpty(db, visiteId, [
        ['p-infos', 'Description des principaux équipements', "Nb d'équipements", equipements.length],
        ['p-infos', 'Description des principaux équipements', 'Production primaire', types.length === 1 ? types[0] : null],
      ]);
    }
  }

  return carryForward;
}

export async function preremplirVisiteDepuisContexte(db, visiteId) {
  const key = String(visiteId || '');
  if (!key || prefillTermines.has(key)) return;
  const existant = prefillEnCours.get(key);
  if (existant) return existant;
  const promise = (async () => {
    const marker = prefillMarker(key);
    const durable = await db.getFirstAsync(`SELECT value FROM _meta WHERE key=? LIMIT 1`, [marker]);
    if (durable?.value === 'done') {
      prefillTermines.add(key);
      return;
    }
    const result = await preremplirVisiteDepuisContexteInterne(db, visiteId);
    await db.runAsync(`INSERT INTO _meta(key,value) VALUES(?, 'done') ON CONFLICT(key) DO UPDATE SET value='done'`, [marker]);
    prefillTermines.add(key);
    return result;
  })().finally(() => prefillEnCours.delete(key));
  prefillEnCours.set(key, promise);
  return promise;
}