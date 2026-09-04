export const migration026 = {
  version: 26,
  name: 'pre_allumage_primary_usage',
  sql: `
    ALTER TABLE pre_allumage_locaux
      ADD COLUMN primaire INTEGER NOT NULL DEFAULT 0;
  `,
};
