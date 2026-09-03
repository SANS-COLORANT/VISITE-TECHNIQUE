export const migration023 = {
  version: 23,
  name: 'reserve_severity',
  sql: `
    ALTER TABLE remarques ADD COLUMN criticite INTEGER NOT NULL DEFAULT 2 CHECK (criticite BETWEEN 1 AND 4);
    ALTER TABLE remarques ADD COLUMN criticite_defaut INTEGER NOT NULL DEFAULT 2 CHECK (criticite_defaut BETWEEN 1 AND 4);
    ALTER TABLE remarques ADD COLUMN criticite_modifiee INTEGER NOT NULL DEFAULT 0 CHECK (criticite_modifiee IN (0, 1));
    CREATE INDEX IF NOT EXISTS idx_remarques_criticite ON remarques(visite_id, criticite);
  `,
};
