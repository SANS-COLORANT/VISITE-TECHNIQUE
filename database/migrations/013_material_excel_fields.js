export const migration013 = {
  version: 13,
  name: 'material_excel_fields',
  sql: `
    ALTER TABLE materiel ADD COLUMN nombre TEXT;
    ALTER TABLE materiel ADD COLUMN numero_materiel TEXT;
    ALTER TABLE materiel ADD COLUMN reseau_desservi TEXT;
    ALTER TABLE materiel ADD COLUMN caracteristiques TEXT;
  `,
};
