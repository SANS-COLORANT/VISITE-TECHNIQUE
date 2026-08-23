export const migration008 = {
  version: 8,
  name: 'equipment_reference_details',
  sql: `
    CREATE TABLE IF NOT EXISTS variantes_equipement (
      id TEXT PRIMARY KEY,
      modele_id TEXT NOT NULL,
      nom TEXT NOT NULL COLLATE NOCASE,
      reference TEXT,
      description TEXT,
      actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (modele_id) REFERENCES modeles_equipement(id) ON DELETE CASCADE,
      UNIQUE (modele_id, nom)
    );

    CREATE TABLE IF NOT EXISTS caracteristiques_equipement (
      id TEXT PRIMARY KEY,
      variante_id TEXT NOT NULL,
      cle TEXT NOT NULL,
      valeur TEXT,
      unite TEXT,
      ordre INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (variante_id) REFERENCES variantes_equipement(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS courbes_equipement (
      id TEXT PRIMARY KEY,
      variante_id TEXT NOT NULL,
      nom TEXT NOT NULL,
      axe_x TEXT NOT NULL DEFAULT 'Débit',
      unite_x TEXT NOT NULL DEFAULT 'm³/h',
      axe_y TEXT NOT NULL DEFAULT 'HMT',
      unite_y TEXT NOT NULL DEFAULT 'mCE',
      serie TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (variante_id) REFERENCES variantes_equipement(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS documents_equipement (
      id TEXT PRIMARY KEY,
      variante_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'Document',
      nom TEXT NOT NULL,
      uri TEXT NOT NULL,
      FOREIGN KEY (variante_id) REFERENCES variantes_equipement(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_variantes_modele ON variantes_equipement(modele_id);
    CREATE INDEX IF NOT EXISTS idx_caracteristiques_variante ON caracteristiques_equipement(variante_id);
    CREATE INDEX IF NOT EXISTS idx_courbes_variante ON courbes_equipement(variante_id);
    CREATE INDEX IF NOT EXISTS idx_documents_variante ON documents_equipement(variante_id);
  `,
};
