/**
 * REMAR multi-instance: material is the shared equipment registry. Add only
 * child definitions, visit membership and per-visit observations. Never modify
 * historical champs_visite, controles_visite, reseaux or materiel.
 */
export const migration049 = {
  version: 49,
  name: 'remar_dynamic_components',
  sql: `
    CREATE TABLE IF NOT EXISTS remar_items (
      id TEXT PRIMARY KEY,
      installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE RESTRICT,
      parent_equipement_id TEXT REFERENCES equipements(id) ON DELETE RESTRICT,
      parent_reseau_id TEXT REFERENCES reseaux_site(id) ON DELETE RESTRICT,
      type_code TEXT NOT NULL,
      nom TEXT NOT NULL,
      unite TEXT,
      ordre INTEGER NOT NULL DEFAULT 0,
      actif INTEGER NOT NULL DEFAULT 1 CHECK(actif IN (0,1)),
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      modifie_le TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_remar_items_local
      ON remar_items(installation_id,type_code,actif,ordre);
    CREATE INDEX IF NOT EXISTS idx_remar_items_parent
      ON remar_items(parent_equipement_id,type_code,actif);
    CREATE TABLE IF NOT EXISTS remar_item_visits (
      visite_id TEXT NOT NULL REFERENCES visites(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES remar_items(id) ON DELETE RESTRICT,
      PRIMARY KEY(visite_id,item_id)
    );
    CREATE TABLE IF NOT EXISTS remar_values (
      visite_id TEXT NOT NULL REFERENCES visites(id) ON DELETE CASCADE,
      owner_type TEXT NOT NULL CHECK(owner_type IN ('equipement','item')),
      owner_id TEXT NOT NULL,
      panel_id TEXT NOT NULL,
      section_code TEXT NOT NULL,
      cle TEXT NOT NULL,
      valeur TEXT,
      avis TEXT CHECK(avis IS NULL OR avis IN ('S','N.S','N.R','S.O','N.V')),
      commentaire TEXT,
      source_visite_id TEXT,
      confirme_le TEXT,
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(visite_id,owner_type,owner_id,panel_id,section_code,cle)
    );
    CREATE INDEX IF NOT EXISTS idx_remar_values_owner
      ON remar_values(owner_type,owner_id,modifie_le);
    CREATE TABLE IF NOT EXISTS remar_report_focus (
      visite_id TEXT NOT NULL REFERENCES visites(id) ON DELETE CASCADE,
      famille TEXT NOT NULL CHECK(famille IN ('cta','vmc','froid')),
      equipement_id TEXT NOT NULL REFERENCES equipements(id) ON DELETE RESTRICT,
      PRIMARY KEY(visite_id,famille)
    );
  `,
};
