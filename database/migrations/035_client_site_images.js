export const migration035 = {
  version: 35,
  name: 'client_site_images',
  sql: `
    -- Image de couverture patrimoniale, distincte des photos de visite.
    -- Le fichier reste dans le stockage privé local de METRA ; SQLite ne garde
    -- que son URI afin de préserver une base légère et pleinement offline.
    ALTER TABLE clients ADD COLUMN image_uri TEXT;
    ALTER TABLE sites ADD COLUMN image_uri TEXT;
  `
};
