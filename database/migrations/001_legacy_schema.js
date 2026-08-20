export const migration001 = {
  version: 1,
  name: 'legacy_schema',
  sql: `
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY, nom TEXT NOT NULL, code_exploitant TEXT, adresse TEXT,
      cree_le TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL, nom_site TEXT NOT NULL,
      adresse TEXT, statut TEXT DEFAULT 'Actif',
      cree_le TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS visites (
      id TEXT PRIMARY KEY, site_id TEXT NOT NULL, date_visite TEXT, technicien TEXT,
      statut TEXT NOT NULL DEFAULT 'en_cours', progression_pct INTEGER NOT NULL DEFAULT 0,
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      cree_le TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS champs_visite (
      visite_id TEXT NOT NULL, section_code TEXT NOT NULL, cle TEXT NOT NULL,
      valeur TEXT, PRIMARY KEY (visite_id, section_code, cle)
    );
    CREATE TABLE IF NOT EXISTS controles_visite (
      visite_id TEXT NOT NULL, section_code TEXT NOT NULL, cle TEXT NOT NULL,
      avis TEXT, commentaire TEXT, PRIMARY KEY (visite_id, section_code, cle)
    );
    CREATE TABLE IF NOT EXISTS reseaux (
      id TEXT PRIMARY KEY, visite_id TEXT NOT NULL, ordre INTEGER NOT NULL,
      nom_reseau TEXT, t_ext_c TEXT, t_dep_c TEXT, courbe_de_chauffe TEXT,
      tnc TEXT, consigne_programme_horaire TEXT
    );
    CREATE TABLE IF NOT EXISTS compteurs (
      id TEXT PRIMARY KEY, visite_id TEXT NOT NULL, label TEXT, valeur TEXT, unite TEXT
    );
    CREATE TABLE IF NOT EXISTS materiel (
      id TEXT PRIMARY KEY, visite_id TEXT NOT NULL, categorie TEXT, designation TEXT,
      marque TEXT, modele TEXT, annee TEXT, etat TEXT DEFAULT 'bon',
      cree_le TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS remarques (
      id TEXT PRIMARY KEY, visite_id TEXT NOT NULL, controle_key TEXT,
      poste TEXT, prestation TEXT, delai INTEGER, estimatif REAL, origine TEXT,
      cree_le TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notes (visite_id TEXT PRIMARY KEY, contenu TEXT);
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY, visite_id TEXT NOT NULL, entite_key TEXT,
      uri TEXT NOT NULL, label TEXT, cree_le TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reserves_bibliotheque (
      id TEXT PRIMARY KEY, nom TEXT NOT NULL, description TEXT,
      prix REAL, poste TEXT, delai INTEGER,
      cree_le TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS equipements_bibliotheque (
      id TEXT PRIMARY KEY, categorie TEXT NOT NULL, marque TEXT, modele TEXT,
      cree_le TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `,
};
