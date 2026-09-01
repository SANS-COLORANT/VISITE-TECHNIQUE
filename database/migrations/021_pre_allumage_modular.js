export const migration021 = {
  version: 21,
  name: 'pre_allumage_modular',
  sql: `
    CREATE TABLE IF NOT EXISTS pre_allumage_locaux (
      id TEXT PRIMARY KEY,
      visite_id TEXT NOT NULL,
      nom TEXT NOT NULL,
      type_code TEXT NOT NULL DEFAULT 'sous_station',
      ordre INTEGER NOT NULL DEFAULT 0,
      chauffage INTEGER NOT NULL DEFAULT 1,
      ecs INTEGER NOT NULL DEFAULT 1,
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (visite_id) REFERENCES visites(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pre_allumage_rubriques (
      id TEXT PRIMARY KEY,
      visite_id TEXT NOT NULL,
      local_id TEXT,
      panel_id TEXT NOT NULL,
      section_code TEXT NOT NULL,
      nom TEXT NOT NULL,
      ordre INTEGER NOT NULL DEFAULT 0,
      supprimable INTEGER NOT NULL DEFAULT 1,
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (visite_id) REFERENCES visites(id) ON DELETE CASCADE,
      FOREIGN KEY (local_id) REFERENCES pre_allumage_locaux(id) ON DELETE CASCADE,
      UNIQUE (visite_id, section_code)
    );

    CREATE TABLE IF NOT EXISTS pre_allumage_champs (
      id TEXT PRIMARY KEY,
      rubrique_id TEXT NOT NULL,
      cle_stockage TEXT NOT NULL,
      libelle TEXT NOT NULL,
      type_code TEXT NOT NULL DEFAULT 'champ',
      ordre INTEGER NOT NULL DEFAULT 0,
      options_json TEXT,
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (rubrique_id) REFERENCES pre_allumage_rubriques(id) ON DELETE CASCADE,
      UNIQUE (rubrique_id, cle_stockage)
    );

    CREATE INDEX IF NOT EXISTS idx_pa_locaux_visite
      ON pre_allumage_locaux(visite_id, ordre);
    CREATE INDEX IF NOT EXISTS idx_pa_rubriques_visite_panel
      ON pre_allumage_rubriques(visite_id, panel_id, ordre);
    CREATE INDEX IF NOT EXISTS idx_pa_champs_rubrique
      ON pre_allumage_champs(rubrique_id, ordre);
  `,
};
