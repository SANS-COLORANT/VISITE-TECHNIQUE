/**
 * Additive field feedback, 16 November 2026.
 * SQLite values entered on old visits and the existing Symfony field keys
 * remain unchanged. No existing temperature or remark is reclassified.
 */
export const migration050 = {
  version: 50,
  name: 'ecs_return_and_remark_urgency',
  sql: `
    ALTER TABLE reseaux ADD COLUMN t_retour_c TEXT;
    ALTER TABLE remarques ADD COLUMN urgence INTEGER NOT NULL DEFAULT 0
      CHECK (urgence IN (0,1));
    CREATE INDEX IF NOT EXISTS idx_remarques_urgence
      ON remarques(visite_id,urgence);
  `,
};
