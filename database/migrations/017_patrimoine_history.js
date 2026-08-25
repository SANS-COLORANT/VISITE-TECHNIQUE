export const migration017 = {
  version: 17,
  name: 'patrimoine_history',
  sql: `
    CREATE TABLE IF NOT EXISTS reserves_suivi (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_visite_id TEXT,
      source_remarque_id TEXT UNIQUE,
      poste TEXT,
      prestation TEXT,
      statut TEXT NOT NULL DEFAULT 'ouverte'
        CHECK (statut IN ('ouverte', 'levee', 'archivee')),
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      levee_le TEXT,
      archivee_le TEXT,
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
      FOREIGN KEY (source_visite_id) REFERENCES visites(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS historique_reserves (
      id TEXT PRIMARY KEY,
      reserve_id TEXT NOT NULL,
      type_evenement TEXT NOT NULL,
      date_evenement TEXT NOT NULL DEFAULT (datetime('now')),
      ancien_statut TEXT,
      nouveau_statut TEXT,
      commentaire TEXT,
      details_json TEXT,
      source_visite_id TEXT,
      FOREIGN KEY (reserve_id) REFERENCES reserves_suivi(id) ON DELETE CASCADE,
      FOREIGN KEY (source_visite_id) REFERENCES visites(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS historique_equipements (
      id TEXT PRIMARY KEY,
      equipement_id TEXT NOT NULL,
      type_evenement TEXT NOT NULL,
      date_evenement TEXT NOT NULL DEFAULT (datetime('now')),
      etat_avant TEXT,
      etat_apres TEXT,
      statut_avant TEXT,
      statut_apres TEXT,
      commentaire TEXT,
      source_visite_id TEXT,
      remplace_par_id TEXT,
      FOREIGN KEY (equipement_id) REFERENCES equipements(id) ON DELETE CASCADE,
      FOREIGN KEY (source_visite_id) REFERENCES visites(id) ON DELETE SET NULL,
      FOREIGN KEY (remplace_par_id) REFERENCES equipements(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reserves_suivi_site_statut
      ON reserves_suivi(site_id, statut, cree_le);
    CREATE INDEX IF NOT EXISTS idx_reserves_suivi_dates
      ON reserves_suivi(site_id, cree_le, levee_le);
    CREATE INDEX IF NOT EXISTS idx_historique_reserves_reserve_date
      ON historique_reserves(reserve_id, date_evenement);
    CREATE INDEX IF NOT EXISTS idx_historique_equipements_equipement_date
      ON historique_equipements(equipement_id, date_evenement);
    CREATE INDEX IF NOT EXISTS idx_historique_equipements_visite
      ON historique_equipements(source_visite_id);
  `,
};
