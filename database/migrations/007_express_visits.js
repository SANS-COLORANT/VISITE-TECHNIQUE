export const migration007 = {
  version: 7,
  name: 'express_visits',
  sql: `
    ALTER TABLE visites ADD COLUMN mode_visite TEXT NOT NULL DEFAULT 'complete'
      CHECK (mode_visite IN ('complete', 'express'));
    ALTER TABLE visites ADD COLUMN source_visite_id TEXT REFERENCES visites(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_visites_source ON visites(source_visite_id);
  `,
};
