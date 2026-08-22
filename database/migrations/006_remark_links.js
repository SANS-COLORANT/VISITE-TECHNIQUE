export const migration006 = {
  version: 6,
  name: 'remark_links',
  sql: `
    ALTER TABLE remarques ADD COLUMN reference_onglet TEXT;
    ALTER TABLE remarques ADD COLUMN reference_type TEXT;
    ALTER TABLE remarques ADD COLUMN reference_id TEXT;
    ALTER TABLE remarques ADD COLUMN reference_libelle TEXT;

    CREATE INDEX IF NOT EXISTS idx_remarques_reference
      ON remarques(visite_id, reference_onglet, reference_type, reference_id);
  `,
};
