import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { synchroniserNombreLocauxPreAllumage } from './preAllumageBusinessDb.js';

const DEFAULTS = new Set([...Array.from({ length: 10 }, (_, i) => `SST ${i + 1}`), 'Centre commercial', 'Église']);
const PHYSICAL_PANELS = new Set(['p-pa-batiments', 'p-pa-compteurs', 'p-pa-regulation', 'p-pa-sst']);

async function sectionHasData(db, visiteId, code) {
  const c = await db.getFirstAsync(`SELECT 1 ok FROM champs_visite WHERE visite_id=? AND section_code=? AND valeur IS NOT NULL AND trim(valeur)<>'' LIMIT 1`, [visiteId, code]);
  if (c?.ok) return true;
  const ctrl = await db.getFirstAsync(`SELECT 1 ok FROM controles_visite WHERE visite_id=? AND section_code=? AND (avis IS NOT NULL OR (commentaire IS NOT NULL AND trim(commentaire)<>'')) LIMIT 1`, [visiteId, code]);
  return Boolean(ctrl?.ok);
}
async function localHasData(db, visiteId, id) {
  const rows = await db.getAllAsync(`SELECT section_code FROM pre_allumage_rubriques WHERE local_id=?`, [id]);
  for (const r of rows || []) if (await sectionHasData(db, visiteId, r.section_code)) return true;
  return false;
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

async function materialiserLocauxImportes(db, visiteId) {
  const orphan = await db.getAllAsync(
    `SELECT * FROM pre_allumage_rubriques WHERE visite_id=? AND local_id IS NULL ORDER BY ordre`,
    [visiteId]
  );
  const physiques = (orphan || []).filter((r) => PHYSICAL_PANELS.has(r.panel_id));
  const candidates = new Set();
  for (const r of physiques) {
    const name = inferredLocalName(r);
    if (name && await sectionHasData(db, visiteId, r.section_code)) candidates.add(name);
  }
  if (!candidates.size) return;

  const existants = await db.getAllAsync(`SELECT id,nom FROM pre_allumage_locaux WHERE visite_id=?`, [visiteId]);
  const nomsExistants = new Set((existants || []).map((x) => canonicalName(x.nom)));
  const maxRow = await db.getFirstAsync(`SELECT COALESCE(MAX(ordre),-1) n FROM pre_allumage_locaux WHERE visite_id=?`, [visiteId]);
  let ordre = Number(maxRow?.n ?? -1) + 1;
  for (const name of candidates) {
    if (nomsExistants.has(name)) continue;
    const id = createId('pa-local');
    await db.runAsync(
      `INSERT INTO pre_allumage_locaux(id,visite_id,nom,type_code,ordre,chauffage,ecs) VALUES(?,?,?,?,?,?,?)`,
      [id, visiteId, name, 'sous_station', ordre++, 1, 1]
    );
    for (const r of physiques.filter((x) => officialMatches(x, name))) {
      await db.runAsync(`UPDATE pre_allumage_rubriques SET local_id=?,modifie_le=datetime('now') WHERE id=?`, [id, r.id]);
    }
    nomsExistants.add(name);
  }
}

export async function preparerStructurePreAllumage(visiteId) {
  const db = await getDb();
  const locaux = await db.getAllAsync(`SELECT * FROM pre_allumage_locaux WHERE visite_id=? ORDER BY ordre,cree_le`, [visiteId]);
  if (locaux.length >= 10 && locaux.every((l) => DEFAULTS.has(String(l.nom || '').trim()))) {
    // Build 305/306 : les locaux étaient créés automatiquement. On conserve
    // uniquement ceux qui ont réellement reçu une saisie ; tous les autres
    // disparaissent de l'interface sans perdre leurs rubriques Excel officielles.
    for (const l of locaux) {
      if (await localHasData(db, visiteId, l.id)) continue;
      await db.runAsync(`UPDATE pre_allumage_rubriques SET local_id=NULL WHERE local_id=?`, [l.id]);
      await db.runAsync(`DELETE FROM pre_allumage_locaux WHERE id=?`, [l.id]);
    }
  }

  // Un import Excel peut renseigner SST 1, Église, Piscine… avant même que
  // l'utilisateur ouvre la visite. On recrée alors uniquement les locaux qui
  // contiennent réellement des données, jamais la structure complète par défaut.
  await materialiserLocauxImportes(db, visiteId);

  // Ancienne visite : si des essais chaufferie orphelins contiennent déjà des
  // réponses, on matérialise une vraie chaufferie plutôt qu'un faux Site/Général.
  const existingCh = await db.getFirstAsync(`SELECT id FROM pre_allumage_locaux WHERE visite_id=? AND type_code='chaufferie' LIMIT 1`, [visiteId]);
  if (!existingCh) {
    const orphan = await db.getAllAsync(`SELECT * FROM pre_allumage_rubriques WHERE visite_id=? AND local_id IS NULL AND panel_id='p-pa-chaufferie' ORDER BY ordre`, [visiteId]);
    const withData = [];
    for (const r of orphan || []) if (await sectionHasData(db, visiteId, r.section_code)) withData.push(r);
    if (withData.length) {
      const max = await db.getFirstAsync(`SELECT COALESCE(MAX(ordre),-1) n FROM pre_allumage_locaux WHERE visite_id=?`, [visiteId]);
      const id = createId('pa-local');
      await db.runAsync(`INSERT INTO pre_allumage_locaux(id,visite_id,nom,type_code,ordre,chauffage,ecs) VALUES(?,?,?,?,?,?,?)`, [id, visiteId, 'Chaufferie', 'chaufferie', Number(max?.n || -1) + 1, 1, 1]);
      for (const r of withData) await db.runAsync(`UPDATE pre_allumage_rubriques SET local_id=? WHERE id=?`, [id, r.id]);
    }
  }
  return synchroniserNombreLocauxPreAllumage(visiteId);
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
