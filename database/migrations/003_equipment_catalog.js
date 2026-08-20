export const migration003 = {
  version: 3,
  name: 'equipment_catalog',
  sql: `
    CREATE TABLE IF NOT EXISTS categories_equipement (
      id TEXT PRIMARY KEY,
      nom TEXT NOT NULL COLLATE NOCASE UNIQUE,
      icone TEXT NOT NULL DEFAULT '⚙️',
      ordre INTEGER NOT NULL DEFAULT 0,
      actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS marques_equipement (
      id TEXT PRIMARY KEY,
      nom TEXT NOT NULL COLLATE NOCASE UNIQUE,
      logo_uri TEXT,
      couleur TEXT,
      actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS modeles_equipement (
      id TEXT PRIMARY KEY,
      categorie_id TEXT NOT NULL,
      marque_id TEXT NOT NULL,
      nom TEXT NOT NULL COLLATE NOCASE,
      reference TEXT,
      caracteristiques TEXT,
      mots_cles TEXT,
      actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (categorie_id) REFERENCES categories_equipement(id) ON DELETE RESTRICT,
      FOREIGN KEY (marque_id) REFERENCES marques_equipement(id) ON DELETE RESTRICT,
      UNIQUE (categorie_id, marque_id, nom)
    );

    CREATE INDEX IF NOT EXISTS idx_modeles_equipement_categorie ON modeles_equipement(categorie_id);
    CREATE INDEX IF NOT EXISTS idx_modeles_equipement_marque ON modeles_equipement(marque_id);
    CREATE INDEX IF NOT EXISTS idx_modeles_equipement_nom ON modeles_equipement(nom);
  `,
};
