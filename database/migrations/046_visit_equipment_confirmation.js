export const migration046 = {
  version: 46,
  name: 'visit_equipment_confirmation',
  sql: `ALTER TABLE materiel ADD COLUMN confirme_le TEXT;
    ALTER TABLE materiel ADD COLUMN ajoute_pendant_visite INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE points_mesure_visite (
      id TEXT PRIMARY KEY, visite_id TEXT NOT NULL REFERENCES visites(id) ON DELETE CASCADE,
      libelle TEXT NOT NULL, unite TEXT NOT NULL, valeur TEXT,
      cree_le TEXT NOT NULL DEFAULT (datetime('now'))
    );`,
};
