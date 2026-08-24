export const migration016 = {
  version: 16,
  name: 'visit_template_id',
  sql: `
    ALTER TABLE visites ADD COLUMN trame_id TEXT NOT NULL DEFAULT 'icpe_v1';
    CREATE INDEX IF NOT EXISTS idx_visites_trame ON visites(trame_id, site_id, date_visite);
  `,
};
