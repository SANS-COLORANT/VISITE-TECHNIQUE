export const migration038 = {
  version: 38,
  name: 'client_site_images',
  sql: `
    ALTER TABLE clients ADD COLUMN image_uri TEXT;
    ALTER TABLE sites ADD COLUMN image_uri TEXT;
  `,
};
