export const migration025 = {
  version: 25,
  name: 'pre_allumage_referentials',
  sql: `
    CREATE TABLE IF NOT EXISTS pre_allumage_referentiels (
      id TEXT PRIMARY KEY,
      categorie TEXT NOT NULL,
      code TEXT NOT NULL,
      libelle TEXT,
      ordre INTEGER NOT NULL DEFAULT 0,
      actif INTEGER NOT NULL DEFAULT 1,
      cree_le TEXT NOT NULL DEFAULT (datetime('now')),
      modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (categorie, code)
    );

    CREATE INDEX IF NOT EXISTS idx_pa_referentiels_categorie
      ON pre_allumage_referentiels(categorie, actif,ordre,code);

    INSERT OR IGNORE INTO pre_allumage_referentiels(id,categorie,code,libelle,ordre) VALUES
      ('pa-ref-exploitant-dalkia','exploitant','DALKIA','DALKIA',10),
      ('pa-ref-exploitant-engie','exploitant','ENGIE SOLUTIONS','ENGIE Solutions',20),
      ('pa-ref-exploitant-idex','exploitant','IDEX','IDEX',30),
      ('pa-ref-exploitant-coriance','exploitant','CORIANCE','Coriance',40),
      ('pa-ref-exploitant-veolia','exploitant','VEOLIA ENERGIE FRANCE','Veolia Énergie France',50),
      ('pa-ref-ca-tca','charge_affaires','TCA','TCA',10),
      ('pa-ref-ca-bdi','charge_affaires','BDI','BDI',20),
      ('pa-ref-ca-sbo','charge_affaires','SBO','SBO',30),
      ('pa-ref-red-nma','redacteur','NMA','NMA',10),
      ('pa-ref-red-abo','redacteur','ABO','ABO',20);
  `,
};
