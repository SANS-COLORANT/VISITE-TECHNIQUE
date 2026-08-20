export const migration004 = {
  version: 4,
  name: 'persistent_equipment',
  sql: `
    ALTER TABLE materiel ADD COLUMN equipement_id TEXT
      REFERENCES equipements(id) ON DELETE SET NULL;

    UPDATE materiel SET etat = 'Bon' WHERE lower(etat) = 'bon';

    CREATE TABLE IF NOT EXISTS observations_equipement (
      id TEXT PRIMARY KEY,
      equipement_id TEXT NOT NULL,
      visite_id TEXT NOT NULL,
      etat TEXT,
      commentaire TEXT,
      present INTEGER NOT NULL DEFAULT 1 CHECK (present IN (0, 1)),
      observe_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (equipement_id) REFERENCES equipements(id) ON DELETE RESTRICT,
      FOREIGN KEY (visite_id) REFERENCES visites(id) ON DELETE CASCADE,
      UNIQUE (equipement_id, visite_id)
    );

    CREATE INDEX IF NOT EXISTS idx_materiel_equipement ON materiel(equipement_id);
    CREATE INDEX IF NOT EXISTS idx_observations_equipement ON observations_equipement(equipement_id, observe_le);
    CREATE INDEX IF NOT EXISTS idx_observations_visite ON observations_equipement(visite_id);
  `,
};
