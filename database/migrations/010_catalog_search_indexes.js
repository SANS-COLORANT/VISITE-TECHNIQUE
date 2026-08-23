export const migration010 = {
  version: 10,
  name: 'catalog_search_indexes',
  sql: `
    CREATE INDEX IF NOT EXISTS idx_models_catalog_lookup ON modeles_equipement(actif, marque_id, categorie_id, nom);
    CREATE INDEX IF NOT EXISTS idx_models_reference ON modeles_equipement(reference);
    CREATE INDEX IF NOT EXISTS idx_variants_lookup ON variantes_equipement(actif, modele_id, nom);
    CREATE INDEX IF NOT EXISTS idx_variants_reference ON variantes_equipement(reference);
    CREATE INDEX IF NOT EXISTS idx_specs_lookup ON caracteristiques_equipement(variante_id, cle, ordre);
    CREATE INDEX IF NOT EXISTS idx_docs_lookup ON documents_equipement(variante_id, type, nom);
    CREATE INDEX IF NOT EXISTS idx_curves_lookup ON courbes_equipement(variante_id, nom);
  `,
};
