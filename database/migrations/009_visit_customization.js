export const migration009 = {
  version: 9,
  name: 'visit_customization',
  sql: `
    ALTER TABLE materiel ADD COLUMN nombre TEXT;
    ALTER TABLE materiel ADD COLUMN numero_materiel TEXT;
    ALTER TABLE materiel ADD COLUMN reseau_desservi TEXT;
    ALTER TABLE materiel ADD COLUMN caracteristiques TEXT;
    ALTER TABLE remarques ADD COLUMN date_reserve TEXT;
    ALTER TABLE remarques ADD COLUMN etat_avancement TEXT;

    CREATE TABLE IF NOT EXISTS personnalisation_champs (
      visite_id TEXT NOT NULL REFERENCES visites(id) ON DELETE CASCADE,
      panel_id TEXT NOT NULL,
      section TEXT NOT NULL,
      cle TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('champ', 'controle')),
      masque INTEGER NOT NULL DEFAULT 0 CHECK (masque IN (0, 1)),
      PRIMARY KEY (visite_id, panel_id, section, cle)
    );
  `,
};
