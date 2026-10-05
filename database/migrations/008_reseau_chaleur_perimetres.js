export const migration008 = {
  version: 8,
  name: 'reseau_chaleur_perimetres',
  sql: `
    ALTER TABLE visites ADD COLUMN trame_code TEXT NOT NULL DEFAULT 'ICPE';

    ALTER TABLE controles_visite ADD COLUMN perimetre TEXT
      CHECK (perimetre IN ('Primaire', 'Secondaire') OR perimetre IS NULL);

    ALTER TABLE materiel ADD COLUMN perimetre TEXT
      CHECK (perimetre IN ('Primaire', 'Secondaire') OR perimetre IS NULL);

    ALTER TABLE equipements ADD COLUMN perimetre TEXT
      CHECK (perimetre IN ('Primaire', 'Secondaire') OR perimetre IS NULL);

    ALTER TABLE remarques ADD COLUMN perimetre TEXT
      CHECK (perimetre IN ('Primaire', 'Secondaire') OR perimetre IS NULL);

    CREATE INDEX IF NOT EXISTS idx_visites_trame_code ON visites(trame_code);
    CREATE INDEX IF NOT EXISTS idx_controles_perimetre ON controles_visite(visite_id, perimetre);
    CREATE INDEX IF NOT EXISTS idx_materiel_perimetre ON materiel(visite_id, perimetre);
  `,
};
