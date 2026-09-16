import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { synchroniserNombreLocauxPreAllumage } from './preAllumageBusinessDb.js';

const DEFAULTS = new Set([...Array.from({ length: 10 }, (_, i) => `SST ${i + 1}`), 'Centre commercial', 'Église']);
const PHYSICAL_PANELS = new Set(['p-pa-batiments', 'p-pa-compteurs', 'p-pa-regulation', 'p-pa-sst']);
const preparationEnCours = new Map();

async function chargerSectionsAvecDonnees(db, visiteId) {
  const [champs, controles] = await Promise.all([
    db.getAllAsync(
      `SELECT DISTINCT section_code FROM champs_visite
       WHERE visite_id=? AND valeur IS NOT NULL AND trim(valeur)<>''`,
      [visiteId]
    ),
    db.getAllAsync(
      `SELECT DISTINCT section_code FROM controles_visite
       WHERE visite_id=? AND (avis IS NOT NULL OR (commentaire IS NOT NULL AND trim(commentaire)<>''))`,
      [visiteId]
    ),
  ]);
  return new Set([...(champs || []), ...(controles || [])].map((row) => String(row.section_code || '')).filter(Boolean));
}

function canonicalName(localName) {
  const raw = String(localName || '').trim();
  const sst = raw.match(/^SST\s*(\d+)/i); if (sst) return `SST ${Number(sst[1])}`;
  if (/^centre commercial/i.test(raw)) return 'Centre commercial';
  if (/^église/i.test(raw) || /^eglise/i.test(raw)) return 'Église';
  if (/^piscine/i.test(raw)) return 'Piscine';
  return raw;
}
function inferredLocalName(r) {
  const name = String(r?.nom || '').trim();
  if (!name) return null;
  if (r.panel_id === 'p-pa-batiments') return canonicalName(name);
  if (r.panel_id === 'p-pa-sst') return canonicalName(name.split(' — ')[0]);
  if (r.panel_id === 'p-pa-compteurs') {
    if (/^SST\s*\d+$/i.test(name) || /^Église$/i.test(name) || /^Piscine$/i.test(name)) return canonicalName(name);
    if (/Commerces\s*\/\s*bureaux/i.test(name)) return 'Centre commercial';
  }
  if (r.panel_id === 'p-pa-regulation') {
    if (/^SST\s*\d+$/i.test(name) || /^Église$/i.test(name) || /^Piscine$/i.test(name)) return canonicalName(name);
    if (/^(Commerces|Bureaux)$/i.test(name)) return 'Centre commercial';
  }
  return null;
}
function officialMatches(r, canonical) {
  const name = String(r.nom || '').trim();
  if (r.panel_id === 'p-pa-batiments') return canonicalName(name) === canonical;
  if (r.panel_id === 'p-pa-compteurs') {
    if (canonical === 'Centre commercial') return /Commerces\s*\/\s*bureaux/i.test(name);
    return canonicalName(name) === canonical;
  }
  if (r.panel_id === 'p-pa-regulation') {
    if (canonical === 'Centre commercial') return /^(Commerces|Bureaux)$/i.test(name);
    return canonicalName(name) === canonical;
  }
  if (r.panel_id === 'p-pa-sst') return canonicalName(name.split(' — ')[0]) === canonical;
  return false;
}

async function materialiserLocauxImportes(db, visiteId, rubriques, sectionsAvecDonnees, locaux) {
  const physiques = (rubriques || []).filter((r) => !r.local_id && PHYSICAL_PANELS.has(r.panel_id));
  const candidates = new Set();
  for (const r of physiques) {
    const name = inferredLocalName(r);
    if (name && sectionsAvecDonnees.has(String(r.section_code || ''))) candidates.add(name);
  }
  if (!candidates.size) return locaux;

  const existants = [...(locaux || [])];
  const nomsExistants = new Set(existants.map((x) => canonicalName(x.nom)));
  let ordre = existants.reduce((max, row) => Math.max(max, Number(row.ordre ?? -1)), -1) + 1;
  for (const name of candidates) {
    if (nomsExistants.has(name)) continue;
    const id = createId('pa-local');
    const local = { id, visite_id: visiteId, nom: name, type_code: 'sous_station', ordre: ordre++, chauffage: 1, ecs: 1 };
    await db.runAsync(
      `INSERT INTO pre_allumage_locaux(id,visite_id,nom,type_code,ordre,chauffage,ecs) VALUES(?,?,?,?,?,?,?)`,
      [id, visiteId, name, 'sous_station', local.ordre, 1, 1]
    );
    const matches = physiques.filter((x) => !x.local_id && officialMatches(x, name));
    for (const r of matches) {
      await db.runAsync(`UPDATE pre_allumage_rubriques SET local_id=?,modifie_le=datetime('now') WHERE id=?`, [id, r.id]);
      r.local_id = id;
    }
    existants.push(local);
    nomsExistants.add(name);
  }
  return existants;
}

async function preparerStructurePreAllumageInterne(visiteId) {
  const db = await getDb();
  const [locauxInitiaux, rubriques, sectionsAvecDonnees] = await Promise.all([
    db.getAllAsync(`SELECT * FROM pre_allumage_locaux WHERE visite_id=? ORDER BY ordre,cree_le`, [visiteId]),
    db.getAllAsync(`SELECT * FROM pre_allumage_rubriques WHERE visite_id=? ORDER BY ordre,cree_le`, [visiteId]),
    chargerSectionsAvecDonnees(db, visiteId),
  ]);
  let locaux = [...(locauxInitiaux || [])];

  if (locaux.length >= 10 && locaux.every((l) => DEFAULTS.has(String(l.nom || '').trim()))) {
    // Build 305/306 : les locaux étaient créés automatiquement. Au lieu de
    // lancer deux requêtes par rubrique/local, on utilise ici les deux jeux de
    // sections renseignées chargés une seule fois pour toute la visite.
    const rubriquesParLocal = new Map();
    for (const r of rubriques || []) {
      if (!r.local_id) continue;
      if (!rubriquesParLocal.has(r.local_id)) rubriquesParLocal.set(r.local_id, []);
      rubriquesParLocal.get(r.local_id).push(r);
    }
    const aSupprimer = locaux.filter((local) => !(rubriquesParLocal.get(local.id) || [])
      .some((r) => sectionsAvecDonnees.has(String(r.section_code || ''))));
    if (aSupprimer.length) {
      const ids = aSupprimer.map((row) => row.id);
      const placeholders = ids.map(() => '?').join(',');
      await db.runAsync(`UPDATE pre_allumage_rubriques SET local_id=NULL WHERE local_id IN (${placeholders})`, ids);
      await db.runAsync(`DELETE FROM pre_allumage_locaux WHERE id IN (${placeholders})`, ids);
      const supprimés = new Set(ids);
      for (const r of rubriques) if (supprimés.has(r.local_id)) r.local_id = null;
      locaux = locaux.filter((row) => !supprimés.has(row.id));
    }
  }

  // Un import Excel peut renseigner SST 1, Église, Piscine… avant même que
  // l'utilisateur ouvre la visite. On recrée uniquement les locaux réellement
  // renseignés, sans refaire une requête champs+contrôles pour chaque rubrique.
  locaux = await materialiserLocauxImportes(db, visiteId, rubriques, sectionsAvecDonnees, locaux);

  // Ancienne visite : si des essais chaufferie orphelins contiennent déjà des
  // réponses, on matérialise une vraie chaufferie plutôt qu'un faux Site/Général.
  const existingCh = locaux.find((row) => row.type_code === 'chaufferie');
  if (!existingCh) {
    const withData = (rubriques || []).filter((r) => !r.local_id && r.panel_id === 'p-pa-chaufferie'
      && sectionsAvecDonnees.has(String(r.section_code || '')));
    if (withData.length) {
      const ordre = locaux.reduce((max, row) => Math.max(max, Number(row.ordre ?? -1)), -1) + 1;
      const id = createId('pa-local');
      await db.runAsync(
        `INSERT INTO pre_allumage_locaux(id,visite_id,nom,type_code,ordre,chauffage,ecs) VALUES(?,?,?,?,?,?,?)`,
        [id, visiteId, 'Chaufferie', 'chaufferie', ordre, 1, 1]
      );
      for (const r of withData) {
        await db.runAsync(`UPDATE pre_allumage_rubriques SET local_id=? WHERE id=?`, [id, r.id]);
        r.local_id = id;
      }
    }
  }
  return synchroniserNombreLocauxPreAllumage(visiteId);
}

export async function preparerStructurePreAllumage(visiteId) {
  const key = String(visiteId || '');
  if (!key) return null;
  const existante = preparationEnCours.get(key);
  if (existante) return existante;
  const promise = preparerStructurePreAllumageInterne(visiteId)
    .finally(() => { if (preparationEnCours.get(key) === promise) preparationEnCours.delete(key); });
  preparationEnCours.set(key, promise);
  return promise;
}

export async function remapperLocalVersRubriquesOfficielles(visiteId, localId) {
  const db = await getDb();
  const local = await db.getFirstAsync(`SELECT * FROM pre_allumage_locaux WHERE id=? AND visite_id=?`, [localId, visiteId]);
  if (!local || local.type_code === 'chaufferie') return 0;
  const canonical = canonicalName(local.nom);
  const orphan = await db.getAllAsync(`SELECT * FROM pre_allumage_rubriques WHERE visite_id=? AND local_id IS NULL ORDER BY ordre`, [visiteId]);
  const matches = (orphan || []).filter((r) => officialMatches(r, canonical));
  if (!matches.length) return 0;

  const panels = [...new Set(matches.map((r) => r.panel_id))];
  for (const panelId of panels) {
    const dynamic = await db.getAllAsync(
      `SELECT id,section_code FROM pre_allumage_rubriques WHERE local_id=? AND panel_id=? AND section_code LIKE ?`,
      [localId, panelId, `pa.local.${localId}.%`]
    );
    for (const r of dynamic || []) {
      await db.runAsync(`DELETE FROM champs_visite WHERE visite_id=? AND section_code=?`, [visiteId, r.section_code]);
      await db.runAsync(`DELETE FROM controles_visite WHERE visite_id=? AND section_code=?`, [visiteId, r.section_code]);
      await db.runAsync(`DELETE FROM pre_allumage_rubriques WHERE id=?`, [r.id]);
    }
  }
  for (const r of matches) await db.runAsync(`UPDATE pre_allumage_rubriques SET local_id=?,modifie_le=datetime('now') WHERE id=?`, [localId, r.id]);
  return matches.length;
}
