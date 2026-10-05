export const migration044 = {
  version: 44,
  name: 'heat_network_perimeters',
  sql: `
    ALTER TABLE remarques ADD COLUMN perimetre TEXT
      CHECK (perimetre IN ('Primaire', 'Secondaire') OR perimetre IS NULL);

    ALTER TABLE materiel ADD COLUMN perimetre TEXT
      CHECK (perimetre IN ('Primaire', 'Secondaire') OR perimetre IS NULL);

    ALTER TABLE equipement_trames ADD COLUMN perimetre TEXT
      CHECK (perimetre IN ('Primaire', 'Secondaire') OR perimetre IS NULL);

    CREATE INDEX IF NOT EXISTS idx_remarques_perimetre
      ON remarques(visite_id, perimetre);

    CREATE INDEX IF NOT EXISTS idx_materiel_perimetre
      ON materiel(visite_id, perimetre);
  `,
};
