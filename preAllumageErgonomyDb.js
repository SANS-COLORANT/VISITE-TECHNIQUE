import { getDb } from './db.js';
import { createId } from './database/ids.js';
import { PREALLUMAGE_PANELS } from './preAllumageTrame.js';

const SST = 'sous_station';

function optionsChamp(field) {
  const { cle, type, presets, ...options } = field || {};
  return Object.keys(options).length ? JSON.stringify(options) : null;
}

async function insererRubrique(db, { visiteId, localId, panelId, code, nom, ordre, fields }) {
  const id = createId('pa-rubrique');
  await db.runAsync(
    `INSERT INTO pre_allumage_rubriques(id,visite_id,local_id,panel_id,section_code,nom,ordre,supprimable)
     VALUES(?,?,?,?,?,?,?,1)`,
    [id, visiteId, localId, panelId, code, nom, ordre]
  );
  for (let i = 0; i < (fields || []).length; i += 1) {
    const f = fields[i];
    await db.runAsync(
      `INSERT INTO pre_allumage_champs(id,rubrique_id,cle_stockage,libelle,type_code,ordre,options_json)
       VALUES(?,?,?,?,?,?,?)`,
      [createId('pa-champ'), id, f.cle, f.libelle || f.cle, f.type || 'champ', i, optionsChamp(f)]
    );
  }
  return id;
}

async function synchroniserNombreSst(db, visiteId) {
  const row = await db.getFirstAsync(
    `SELECT COUNT(*) n FROM pre_allumage_locaux WHERE visite_id=? AND type_code=?`,
    [visiteId, SST]
  );
  await db.runAsync(
    `INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)
     ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur`,
    [visiteId, 'pa-infos.informations_g_n_rales', 'Nombre de sous-stations', String(row?.n || 0)]
  );
}

function nomCopie(nom, locaux) {
  const match = String(nom || '').match(/^SST\s+(\d+)/i);
  if (match) {
    const utilises = new Set((locaux || []).map((l) => {
      const m = String(l.nom || '').match(/^SST\s+(\d+)/i);
      return m ? Number(m[1]) : null;
    }).filter(Number.isFinite));
    let n = 1;
    while (utilises.has(n)) n += 1;
    return `SST ${n}`;
  }
  const base = `${String(nom || 'Installation').trim()} copie`;
  let candidat = base;
  let i = 2;
  const noms = new Set((locaux || []).map((l) => String(l.nom || '').toLowerCase()));
  while (noms.has(candidat.toLowerCase())) candidat = `${base} ${i++}`;
  return candidat;
}

function remplacerNomDansLibelle(libelle, ancienNom, nouveauNom) {
  const texte = String(libelle || '');
  return texte.startsWith(`${ancienNom} —`) ? `${nouveauNom}${texte.slice(String(ancienNom).length)}` : texte;
}

export async function dupliquerLocalPreAllumage(localId) {
  const db = await getDb();
  const local = await db.getFirstAsync(`SELECT * FROM pre_allumage_locaux WHERE id=?`, [localId]);
  if (!local) throw new Error('Installation introuvable.');
  const locaux = await db.getAllAsync(`SELECT * FROM pre_allumage_locaux WHERE visite_id=? ORDER BY ordre`, [local.visite_id]);
  const nouveauNom = nomCopie(local.nom, locaux);
  const max = await db.getFirstAsync(`SELECT COALESCE(MAX(ordre),-1) n FROM pre_allumage_locaux WHERE visite_id=?`, [local.visite_id]);
  const nouveauId = createId('pa-local');
  await db.runAsync(
    `INSERT INTO pre_allumage_locaux(id,visite_id,nom,type_code,ordre,chauffage,ecs,primaire) VALUES(?,?,?,?,?,?,?,?)`,
    [nouveauId, local.visite_id, nouveauNom, local.type_code, Number(max?.n || -1) + 1, local.chauffage, local.ecs, Number(local.primaire) || 0]
  );

  const rubriques = await db.getAllAsync(`SELECT * FROM pre_allumage_rubriques WHERE local_id=? ORDER BY ordre,cree_le`, [localId]);
  for (let i = 0; i < rubriques.length; i += 1) {
    const r = rubriques[i];
    const champs = await db.getAllAsync(`SELECT * FROM pre_allumage_champs WHERE rubrique_id=? ORDER BY ordre,cree_le`, [r.id]);
    const code = `pa.local.${nouveauId}.${String(r.panel_id || 'bloc').replace(/^p-pa-/, '')}.${i}`;
    const nouveauRubriqueId = createId('pa-rubrique');
    await db.runAsync(
      `INSERT INTO pre_allumage_rubriques(id,visite_id,local_id,panel_id,section_code,nom,ordre,supprimable)
       VALUES(?,?,?,?,?,?,?,?)`,
      [nouveauRubriqueId, local.visite_id, nouveauId, r.panel_id, code, remplacerNomDansLibelle(r.nom, local.nom, nouveauNom), Number(r.ordre || 0), r.supprimable]
    );
    for (const c of champs) {
      const nouvelleCle = remplacerNomDansLibelle(c.cle_stockage, local.nom, nouveauNom);
      const nouveauLibelle = remplacerNomDansLibelle(c.libelle, local.nom, nouveauNom);
      await db.runAsync(
        `INSERT INTO pre_allumage_champs(id,rubrique_id,cle_stockage,libelle,type_code,ordre,options_json)
         VALUES(?,?,?,?,?,?,?)`,
        [createId('pa-champ'), nouveauRubriqueId, nouvelleCle, nouveauLibelle, c.type_code, c.ordre, c.options_json]
      );
      // Une duplication reprend uniquement les caractéristiques structurelles.
      // Les index, températures et avis du jour restent volontairement vides.
      if (r.panel_id === 'p-pa-batiments' && c.type_code === 'champ') {
        const ancien = await db.getFirstAsync(
          `SELECT valeur FROM champs_visite WHERE visite_id=? AND section_code=? AND cle=?`,
          [local.visite_id, r.section_code, c.cle_stockage]
        );
        if (ancien?.valeur !== null && ancien?.valeur !== undefined && String(ancien.valeur).trim() !== '') {
          await db.runAsync(
            `INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)
             ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur`,
            [local.visite_id, code, nouvelleCle, String(ancien.valeur)]
          );
        }
      }
    }
  }
  await synchroniserNombreSst(db, local.visite_id);
  return { id: nouveauId, nom: nouveauNom };
}

async function assurerChampCompteurEcs(db, local) {
  const r = await db.getFirstAsync(
    `SELECT * FROM pre_allumage_rubriques WHERE local_id=? AND panel_id='p-pa-compteurs' ORDER BY ordre LIMIT 1`,
    [local.id]
  );
  if (!r) return;
  const existe = await db.getFirstAsync(
    `SELECT id FROM pre_allumage_champs WHERE rubrique_id=? AND lower(libelle) LIKE '%ecs%' LIMIT 1`,
    [r.id]
  );
  if (existe) return;
  const max = await db.getFirstAsync(`SELECT COALESCE(MAX(ordre),-1) n FROM pre_allumage_champs WHERE rubrique_id=?`, [r.id]);
  await db.runAsync(
    `INSERT INTO pre_allumage_champs(id,rubrique_id,cle_stockage,libelle,type_code,ordre,options_json)
     VALUES(?,?,?,?,?,?,?)`,
    [createId('pa-champ'), r.id, `${local.nom} — ECS (m³)`, `${local.nom} — ECS (m³)`, 'champ', Number(max?.n || -1) + 1, JSON.stringify({ numericIndex: true, renamable: true })]
  );
}

async function assurerSectionControle(db, local, nature) {
  const ecs = nature === 'ecs';
  const nom = ecs ? `${local.nom} — ECS / traitement d’eau` : `${local.nom} — Chauffage`;
  const existe = await db.getFirstAsync(
    `SELECT id FROM pre_allumage_rubriques WHERE local_id=? AND panel_id='p-pa-sst' AND lower(nom) LIKE ? LIMIT 1`,
    [local.id, ecs ? '%ecs%' : '%chauffage%']
  );
  if (existe) return;
  const reference = PREALLUMAGE_PANELS['p-pa-sst']?.[ecs ? 'SST 1 — ECS / traitement d’eau' : 'SST 1 — Chauffage'] || [];
  const max = await db.getFirstAsync(`SELECT COALESCE(MAX(ordre),0) n FROM pre_allumage_rubriques WHERE visite_id=?`, [local.visite_id]);
  await insererRubrique(db, {
    visiteId: local.visite_id,
    localId: local.id,
    panelId: 'p-pa-sst',
    code: `pa.local.${local.id}.${nature}.${Date.now()}`,
    nom,
    ordre: Number(max?.n || 0) + 1,
    fields: reference.map((f) => ({ ...f })),
  });
}

export async function mettreAJourConfigurationLocalPreAllumage(localId, { chauffage, ecs, primaire = false }) {
  const db = await getDb();
  const local = await db.getFirstAsync(`SELECT * FROM pre_allumage_locaux WHERE id=?`, [localId]);
  if (!local) throw new Error('Installation introuvable.');
  const nextChauffage = chauffage ? 1 : 0;
  const nextEcs = ecs ? 1 : 0;
  const nextPrimaire = local.type_code === 'chaufferie' && primaire ? 1 : 0;
  await db.runAsync(
    `UPDATE pre_allumage_locaux SET chauffage=?,ecs=?,primaire=?,modifie_le=datetime('now') WHERE id=?`,
    [nextChauffage, nextEcs, nextPrimaire, localId]
  );
  const maj = { ...local, chauffage: nextChauffage, ecs: nextEcs, primaire: nextPrimaire };
  if (local.type_code !== 'chaufferie') {
    if (nextEcs) {
      await assurerChampCompteurEcs(db, maj);
      await assurerSectionControle(db, maj, 'ecs');
    }
    if (nextChauffage) await assurerSectionControle(db, maj, 'chauffage');
  }
  return maj;
}

export async function deplacerLocalPreAllumage(localId, direction) {
  const db = await getDb();
  const local = await db.getFirstAsync(`SELECT * FROM pre_allumage_locaux WHERE id=?`, [localId]);
  if (!local) return false;
  const voisin = await db.getFirstAsync(
    direction < 0
      ? `SELECT * FROM pre_allumage_locaux WHERE visite_id=? AND ordre<? ORDER BY ordre DESC LIMIT 1`
      : `SELECT * FROM pre_allumage_locaux WHERE visite_id=? AND ordre>? ORDER BY ordre ASC LIMIT 1`,
    [local.visite_id, local.ordre]
  );
  if (!voisin) return false;
  await db.withTransactionAsync(async () => {
    await db.runAsync(`UPDATE pre_allumage_locaux SET ordre=?,modifie_le=datetime('now') WHERE id=?`, [voisin.ordre, local.id]);
    await db.runAsync(`UPDATE pre_allumage_locaux SET ordre=?,modifie_le=datetime('now') WHERE id=?`, [local.ordre, voisin.id]);
  });
  return true;
}

const CLES_REGLAGES = [
  'Courbe de chauffe — Pour -7°C (°C)',
  'Courbe de chauffe — Pour 12°C (°C)',
  'Courbe de chauffe — Pour 19°C (°C)',
  'Température de non chauffe (°C)',
  'Réduit de jour (°C d’eau)',
  'Horaires',
];

export async function copierReglagesPreAllumage(localId) {
  const db = await getDb();
  const local = await db.getFirstAsync(`SELECT * FROM pre_allumage_locaux WHERE id=?`, [localId]);
  if (!local) throw new Error('Installation introuvable.');
  const source = await db.getFirstAsync(
    `SELECT * FROM pre_allumage_rubriques WHERE local_id=? AND panel_id='p-pa-regulation' ORDER BY ordre LIMIT 1`,
    [localId]
  );
  if (!source) throw new Error('Aucun réglage de régulation à copier.');
  const valeurs = {};
  for (const cle of CLES_REGLAGES) {
    const row = await db.getFirstAsync(
      `SELECT valeur FROM champs_visite WHERE visite_id=? AND section_code=? AND cle=?`,
      [local.visite_id, source.section_code, cle]
    );
    if (row?.valeur !== null && row?.valeur !== undefined && String(row.valeur).trim() !== '') valeurs[cle] = String(row.valeur);
  }
  if (!Object.keys(valeurs).length) throw new Error('Aucun réglage renseigné sur cette installation.');

  const cibles = await db.getAllAsync(
    `SELECT r.section_code,l.id local_id FROM pre_allumage_rubriques r
     JOIN pre_allumage_locaux l ON l.id=r.local_id
     WHERE r.visite_id=? AND r.panel_id='p-pa-regulation' AND l.id<>?`,
    [local.visite_id, localId]
  );
  for (const cible of cibles) {
    for (const [cle, valeur] of Object.entries(valeurs)) {
      await db.runAsync(
        `INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)
         ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur`,
        [local.visite_id, cible.section_code, cle, valeur]
      );
    }
  }
  return cibles.length;
}