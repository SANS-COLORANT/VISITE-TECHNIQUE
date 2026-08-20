export const migration002 = {
  version: 2,
  name: 'domain_foundations',
  sql: `
    CREATE TABLE IF NOT EXISTS installations (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      type_code TEXT NOT NULL,
      nom TEXT,
      description TEXT,
      actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS equipements (
      id TEXT PRIMARY KEY,
      installation_id TEXT NOT NULL,
      type_code TEXT NOT NULL,
      designation TEXT,
      marque TEXT,
      modele TEXT,
      numero_serie TEXT,
      annee INTEGER,
      statut TEXT NOT NULL DEFAULT 'actif',
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS reseaux_site (
      id TEXT PRIMARY KEY,
      installation_id TEXT NOT NULL,
      type_code TEXT NOT NULL,
      nom TEXT,
      ordre INTEGER NOT NULL DEFAULT 0,
      actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS compteurs_site (
      id TEXT PRIMARY KEY,
      installation_id TEXT NOT NULL,
      type_code TEXT NOT NULL,
      libelle TEXT,
      numero_serie TEXT,
      unite TEXT,
      actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS mesures (
      id TEXT PRIMARY KEY,
      visite_id TEXT NOT NULL,
      definition_code TEXT NOT NULL,
      equipement_id TEXT,
      reseau_id TEXT,
      compteur_id TEXT,
      valeur_nombre REAL,
      valeur_texte TEXT,
      unite TEXT,
      mesure_le TEXT,
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (visite_id) REFERENCES visites(id) ON DELETE CASCADE,
      FOREIGN KEY (definition_code) REFERENCES referentiel_champs(code) ON DELETE RESTRICT,
      FOREIGN KEY (equipement_id) REFERENCES equipements(id) ON DELETE RESTRICT,
      FOREIGN KEY (reseau_id) REFERENCES reseaux_site(id) ON DELETE RESTRICT,
      FOREIGN KEY (compteur_id) REFERENCES compteurs_site(id) ON DELETE RESTRICT,
      CHECK (valeur_nombre IS NOT NULL OR valeur_texte IS NOT NULL)
    );

    CREATE TABLE IF NOT EXISTS controles (
      id TEXT PRIMARY KEY,
      visite_id TEXT NOT NULL,
      definition_code TEXT NOT NULL,
      equipement_id TEXT,
      reseau_id TEXT,
      avis TEXT,
      commentaire TEXT,
      controle_le TEXT,
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (visite_id) REFERENCES visites(id) ON DELETE CASCADE,
      FOREIGN KEY (definition_code) REFERENCES referentiel_champs(code) ON DELETE RESTRICT,
      FOREIGN KEY (equipement_id) REFERENCES equipements(id) ON DELETE RESTRICT,
      FOREIGN KEY (reseau_id) REFERENCES reseaux_site(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS attributs_libres (
      id TEXT PRIMARY KEY,
      entite_type TEXT NOT NULL,
      entite_id TEXT NOT NULL,
      cle TEXT NOT NULL,
      valeur TEXT,
      type_valeur TEXT NOT NULL DEFAULT 'texte',
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (entite_type, entite_id, cle)
    );

    CREATE TABLE IF NOT EXISTS referentiel_champs (
      code TEXT PRIMARY KEY,
      entite_type TEXT NOT NULL,
      libelle TEXT NOT NULL,
      type_valeur TEXT NOT NULL,
      unite TEXT,
      section_code TEXT,
      actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
      version_referentiel INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS mapping_excel (
      id TEXT PRIMARY KEY,
      definition_code TEXT NOT NULL,
      feuille TEXT NOT NULL,
      cellule_valeur TEXT NOT NULL,
      cellule_commentaire TEXT,
      sens TEXT NOT NULL DEFAULT 'import_export'
        CHECK (sens IN ('import', 'export', 'import_export')),
      version_modele TEXT NOT NULL,
      actif INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
      UNIQUE (definition_code, feuille, cellule_valeur, version_modele),
      FOREIGN KEY (definition_code) REFERENCES referentiel_champs(code) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS provenances (
      id TEXT PRIMARY KEY,
      entite_type TEXT NOT NULL,
      entite_id TEXT NOT NULL,
      origine TEXT NOT NULL,
      reference_externe TEXT,
      details_json TEXT,
      importe_le TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS journal_modifications (
      id TEXT PRIMARY KEY,
      entite_type TEXT NOT NULL,
      entite_id TEXT NOT NULL,
      action TEXT NOT NULL,
      visite_id TEXT,
      ancienne_valeur_json TEXT,
      nouvelle_valeur_json TEXT,
      auteur TEXT,
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (visite_id) REFERENCES visites(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sites_client ON sites(client_id);
    CREATE INDEX IF NOT EXISTS idx_visites_site ON visites(site_id);
    CREATE INDEX IF NOT EXISTS idx_champs_visite_visite ON champs_visite(visite_id);
    CREATE INDEX IF NOT EXISTS idx_controles_visite_visite ON controles_visite(visite_id);
    CREATE INDEX IF NOT EXISTS idx_reseaux_visite ON reseaux(visite_id);
    CREATE INDEX IF NOT EXISTS idx_compteurs_visite ON compteurs(visite_id);
    CREATE INDEX IF NOT EXISTS idx_materiel_visite ON materiel(visite_id);
    CREATE INDEX IF NOT EXISTS idx_remarques_visite ON remarques(visite_id);
    CREATE INDEX IF NOT EXISTS idx_photos_visite ON photos(visite_id);
    CREATE INDEX IF NOT EXISTS idx_installations_site ON installations(site_id);
    CREATE INDEX IF NOT EXISTS idx_equipements_installation ON equipements(installation_id);
    CREATE INDEX IF NOT EXISTS idx_reseaux_site_installation ON reseaux_site(installation_id);
    CREATE INDEX IF NOT EXISTS idx_compteurs_site_installation ON compteurs_site(installation_id);
    CREATE INDEX IF NOT EXISTS idx_mesures_visite ON mesures(visite_id);
    CREATE INDEX IF NOT EXISTS idx_mesures_definition ON mesures(definition_code);
    CREATE INDEX IF NOT EXISTS idx_controles_visite ON controles(visite_id);
    CREATE INDEX IF NOT EXISTS idx_controles_definition ON controles(definition_code);
    CREATE INDEX IF NOT EXISTS idx_attributs_entite ON attributs_libres(entite_type, entite_id);
    CREATE INDEX IF NOT EXISTS idx_provenances_entite ON provenances(entite_type, entite_id);
    CREATE INDEX IF NOT EXISTS idx_journal_entite ON journal_modifications(entite_type, entite_id);
  `,
};
