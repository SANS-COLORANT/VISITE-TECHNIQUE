export const migration005 = {
  version: 5,
  name: 'persistent_networks_meters',
  sql: `
    ALTER TABLE reseaux ADD COLUMN reseau_site_id TEXT
      REFERENCES reseaux_site(id) ON DELETE SET NULL;
    ALTER TABLE compteurs ADD COLUMN compteur_site_id TEXT
      REFERENCES compteurs_site(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS observations_reseau (
      id TEXT PRIMARY KEY,
      reseau_site_id TEXT NOT NULL,
      visite_id TEXT NOT NULL,
      t_ext_c TEXT,
      t_dep_c TEXT,
      courbe_de_chauffe TEXT,
      tnc TEXT,
      consigne_programme_horaire TEXT,
      present INTEGER NOT NULL DEFAULT 1 CHECK (present IN (0, 1)),
      observe_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (reseau_site_id) REFERENCES reseaux_site(id) ON DELETE RESTRICT,
      FOREIGN KEY (visite_id) REFERENCES visites(id) ON DELETE CASCADE,
      UNIQUE (reseau_site_id, visite_id)
    );

    CREATE TABLE IF NOT EXISTS releves_compteur (
      id TEXT PRIMARY KEY,
      compteur_site_id TEXT NOT NULL,
      visite_id TEXT NOT NULL,
      valeur_texte TEXT,
      valeur_nombre REAL,
      unite TEXT,
      releve_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (compteur_site_id) REFERENCES compteurs_site(id) ON DELETE RESTRICT,
      FOREIGN KEY (visite_id) REFERENCES visites(id) ON DELETE CASCADE,
      UNIQUE (compteur_site_id, visite_id)
    );

    CREATE INDEX IF NOT EXISTS idx_reseaux_reseau_site ON reseaux(reseau_site_id);
    CREATE INDEX IF NOT EXISTS idx_compteurs_compteur_site ON compteurs(compteur_site_id);
    CREATE INDEX IF NOT EXISTS idx_observations_reseau_site ON observations_reseau(reseau_site_id, observe_le);
    CREATE INDEX IF NOT EXISTS idx_releves_compteur_site ON releves_compteur(compteur_site_id, releve_le);
  `,
};
