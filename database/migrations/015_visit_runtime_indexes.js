export const migration015 = {
  version: 15,
  name: 'visit_runtime_indexes',
  sql: `
    CREATE INDEX IF NOT EXISTS idx_visites_site_date ON visites(site_id, date_visite, modifie_le);
    CREATE INDEX IF NOT EXISTS idx_visites_statut_modifie ON visites(statut, modifie_le);

    CREATE INDEX IF NOT EXISTS idx_photos_visite_entite ON photos(visite_id, entite_key, cree_le);
    CREATE INDEX IF NOT EXISTS idx_remarques_visite_date ON remarques(visite_id, cree_le);
    CREATE INDEX IF NOT EXISTS idx_remarques_controle ON remarques(visite_id, controle_key);

    CREATE INDEX IF NOT EXISTS idx_reseaux_visite_ordre ON reseaux(visite_id, ordre);
    CREATE INDEX IF NOT EXISTS idx_compteurs_visite ON compteurs(visite_id);
    CREATE INDEX IF NOT EXISTS idx_materiel_visite ON materiel(visite_id);

    CREATE INDEX IF NOT EXISTS idx_champs_visite_lookup ON champs_visite(visite_id, section_code, cle);
    CREATE INDEX IF NOT EXISTS idx_controles_visite_lookup ON controles_visite(visite_id, section_code, cle);
  `,
};
