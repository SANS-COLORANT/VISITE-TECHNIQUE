export const migration019 = {
  version: 19,
  name: 'equipment_trame_usage',
  sql: `
    CREATE TABLE IF NOT EXISTS equipement_trames (
      equipement_id TEXT NOT NULL,
      trame_id TEXT NOT NULL,
      actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0,1)),
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (equipement_id, trame_id),
      FOREIGN KEY (equipement_id) REFERENCES equipements(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_equipement_trames_trame
      ON equipement_trames(trame_id, actif, equipement_id);
  `,
};
