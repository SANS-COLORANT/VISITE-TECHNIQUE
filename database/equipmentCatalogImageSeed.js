const MODEL_IMAGES = [
  {
    brand: 'Atlantic', model: 'Varfree EVO',
    uri: 'https://i0.wp.com/satc.atlantic-pros.fr/wp-content/uploads/Chaudiere-Varfree-Evo_Trois-Quart-Gauche-2.png?fit=1181%2C1373&ssl=1',
  },
  {
    brand: 'Atlantic', model: 'Varmax 2',
    uri: 'https://i0.wp.com/satc.atlantic-pros.fr/wp-content/uploads/images-produit_0007_Varmax-3-4-droit_HD.png?fit=300%2C400&ssl=1',
  },
  {
    brand: 'Atlantic', model: 'Condensinox',
    uri: 'https://i0.wp.com/satc.atlantic-pros.fr/wp-content/uploads/images-produit_0014_condensinox-3-4-droit_HD.png?fit=300%2C400&ssl=1',
  },
  {
    brand: 'Wilo', model: 'Stratos MAXO',
    uri: 'https://cms.media.wilo.com/dcipicpfinder/wilo56941/1169392/wilo56941_2.png',
  },
  {
    brand: 'Caleffi', model: 'DIRTMAG 5463',
    uri: 'https://www.caleffi.com/sites/default/files/styles/container100_xxxl/public/media/external-image/546305.png.webp?itok=jIj-UBOR',
  },
];

export async function seedEquipmentCatalogImages(db) {
  const done = await db.getFirstAsync(`SELECT value FROM _meta WHERE key='equipment_catalog_images_v1'`);
  if (done) return;

  for (const image of MODEL_IMAGES) {
    const row = await db.getFirstAsync(`
      SELECT m.id FROM modeles_equipement m
      JOIN marques_equipement b ON b.id=m.marque_id
      WHERE b.nom=? COLLATE NOCASE AND m.nom=? COLLATE NOCASE
    `, [image.brand, image.model]);
    if (!row) continue;
    await db.runAsync('UPDATE modeles_equipement SET image_uri=? WHERE id=?', [image.uri, row.id]);
    await db.runAsync('UPDATE variantes_equipement SET image_uri=COALESCE(image_uri, ?) WHERE modele_id=?', [image.uri, row.id]);
  }

  await db.runAsync(`INSERT OR REPLACE INTO _meta(key,value) VALUES('equipment_catalog_images_v1','1')`);
}
