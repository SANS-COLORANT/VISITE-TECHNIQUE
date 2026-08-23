const MODEL_IMAGES = [
  { brand:'Atlantic', model:'Varfree EVO', uri:'https://i0.wp.com/satc.atlantic-pros.fr/wp-content/uploads/Chaudiere-Varfree-Evo_Trois-Quart-Gauche-2.png?fit=1181%2C1373&ssl=1' },
  { brand:'Atlantic', model:'Varmax 2', uri:'https://i0.wp.com/satc.atlantic-pros.fr/wp-content/uploads/images-produit_0007_Varmax-3-4-droit_HD.png?fit=300%2C400&ssl=1' },
  { brand:'Atlantic', model:'Condensinox', uri:'https://i0.wp.com/satc.atlantic-pros.fr/wp-content/uploads/images-produit_0014_condensinox-3-4-droit_HD.png?fit=300%2C400&ssl=1' },

  { brand:'Grundfos', model:'MAGNA3', uri:'https://www.grundfos.com/content/dam/local/en-gb/activity-assets/local-campaign/regular-wide/MAGNA3.jpeg' },
  { brand:'Grundfos', model:'MAGNA1', uri:'https://www.grundfos.com/content/dam/local/en-gb/activity-assets/local-campaign/regular-wide/MAGNA3.jpeg' },
  { brand:'Grundfos', model:'TPE3', uri:'https://www.pei-france.com/uploads/tx_etim/27753_PEI3911_Grundfos_TPE3_r.jpg' },
  { brand:'Grundfos', model:'TPE2', uri:'https://www.pei-france.com/uploads/tx_etim/27753_PEI3911_Grundfos_TPE3_r.jpg' },
  { brand:'Grundfos', model:'CR', uri:'https://api.grundfos.com/gpi/imaging/productgroup?h=576&pgcode=CREFAM&w=768' },
  { brand:'Grundfos', model:'CRE', uri:'https://api.grundfos.com/gpi/imaging/productgroup?h=576&pgcode=CREFAM&w=768' },

  { brand:'Wilo', model:'Stratos MAXO', uri:'https://cms.media.wilo.com/dcipicpfinder/wilo56941/1169392/wilo56941_2.png' },
  { brand:'Wilo', model:'Stratos MAXO-D', uri:'https://cms.media.wilo.com/dcipicpfinder/wilo56941/1169392/wilo56941_2.png' },
  { brand:'Wilo', model:'Stratos MAXO-Z', uri:'https://cms.media.wilo.com/dcipicpfinder/wilo56941/1169392/wilo56941_2.png' },
  { brand:'Wilo', model:'Yonos MAXO', uri:'https://static-data2.manualslib.com/product-images/537/1633375/wilo-yonos-maxo-water-pump.jpg' },
  { brand:'Wilo', model:'Stratos GIGA2.0-I', uri:'https://img.edilportale.com/products/STRATOS-GIGA2-0-WILO-Italia-589300-rel23ee3d20.jpg' },

  { brand:'Lowara', model:'ecocirc XL', uri:'https://www.regotherm24.de/media/image/8e/e5/20/LOB_HZP_e_XL_32_60_1280x1280%402x.jpg' },
  { brand:'KSB', model:'Etaline', uri:'https://acszigalen.cloudimg.io/v7/https%3A%2F%2Flive-commerce-proxy-e2e-sales.ksb.com%2Fmedias%2FEtaline-1-.png%3Fcontext%3DbWFzdGVyfGltYWdlc3w5NDM3Njd8aW1hZ2UvcG5nfGFEWmpMMmd4WkM4NU1ERTVNVFEwT1RrME9EUTJMMFYwWVd4cGJtVmJNVjB1Y0c1bnxmMDRhNTY1ZmVkOWJkZGEyMTdkMmQ2NmEzMjFjNjI2NTIyNWIyNGJjNWVmZDZlNjQ3MzAzYmQ4ZmE4Y2JjOWUy?br_px=3213%2C3213&ci_url_encoded=1&force_format=jpeg&optipress=3&tl_px=1512%2C1512&w=1000' },

  { brand:'Bosch', model:'Condens 7000 F', uri:'https://static-data2.manualslib.com/product-images/ea4/1489347/bosch-condens-7000-f-boiler.jpg' },
  { brand:'De Dietrich', model:'C230 EVO', uri:'https://d.scdn.gr/images/sku_main_images/005760/5760512/20220311162829_de_dietrich_c_230_130_eco_levitas_sympyknosis_aeriou_me_kaystira_111779kcal_h.jpeg' },
  { brand:'De Dietrich', model:'C310 ECO', uri:'https://d.scdn.gr/images/sku_main_images/005760/5760512/20220311162829_de_dietrich_c_230_130_eco_levitas_sympyknosis_aeriou_me_kaystira_111779kcal_h.jpeg' },
  { brand:'De Dietrich', model:'C330 ECO', uri:'https://d.scdn.gr/images/sku_main_images/005760/5760512/20220311162829_de_dietrich_c_230_130_eco_levitas_sympyknosis_aeriou_me_kaystira_111779kcal_h.jpeg' },

  { brand:'Alfa Laval', model:'M6', uri:'https://www.pto-service.com/upload/iblock/caf/cafb3fe14c85e100677bad12731e4515.jpg' },
  { brand:'Alfa Laval', model:'M10', uri:'https://www.pto-service.com/upload/iblock/caf/cafb3fe14c85e100677bad12731e4515.jpg' },

  { brand:'Danfoss', model:'VRB2', uri:'https://ridan.ru/file/1527623/open/IMG037338030476_preview.jpg' },
  { brand:'Danfoss', model:'VRB3', uri:'https://ridan.ru/file/1527623/open/IMG037338030476_preview.jpg' },
  { brand:'Danfoss', model:'AME 435', uri:'https://ridan.ru/file/1527624/open/IMG303448912268_preview.jpg?h=380&w=640' },
  { brand:'Belimo', model:'H3..S globe 3 voies', uri:'https://tameson.com/cdn/shop/files/asset_2FProducts_2FTameson_2FValves_2FValve_20Actuator_2FElectric_2FLinear_2FBelimo_2FLV_2FImage_2FPublished_2Fv2vs3_00_9c88f041-c07a-45db-b2d1-d389788f09b2.jpg?v=1760956231' },
  { brand:'Belimo', model:'H6.. globe 2 voies', uri:'https://tameson.com/cdn/shop/files/asset_2FProducts_2FTameson_2FValves_2FValve_20Actuator_2FElectric_2FLinear_2FBelimo_2FLV_2FImage_2FPublished_2Fv2vs3_00_9c88f041-c07a-45db-b2d1-d389788f09b2.jpg?v=1760956231' },
  { brand:'Siemens', model:'SAX', uri:'https://auranord-technik.com/media/image/product/6031/lg/siemens-elektromotorischer-stellantrieb-sax6103.jpg' },

  { brand:'Reflex', model:'N', uri:'https://heunert.de/media/image/d1/cb/f3/14907_446c075a3b96144f7eff7c287ac65720_all.jpg' },
  { brand:'Reflex', model:'NG', uri:'https://heunert.de/media/image/d1/cb/f3/14907_446c075a3b96144f7eff7c287ac65720_all.jpg' },
  { brand:'Caleffi', model:'DIRTMAG 5463', uri:'https://www.caleffi.com/sites/default/files/styles/container100_xxxl/public/media/external-image/546305.png.webp?itok=jIj-UBOR' },
  { brand:'Caleffi', model:'DIRTMAG', uri:'https://cdn4.volusion.store/rwaps-nrpqw/v/vspfiles/photos/CAL-546307A-2.jpg?v-cache=1635174903' },
  { brand:'Fernox', model:'TF1 Omega', uri:'https://cdn11.bigcommerce.com/s-kf91vy1qfw/images/stencil/1280x1280/products/21602/427449/fernox-62294-tf1-omega-filter-nickel-plated-brass-in-line-system-filter-1inch__21367.1755198136.jpg?c=1' },

  { brand:'Kamstrup', model:'MULTICAL 603', uri:'https://static.wixstatic.com/media/bf3545_ba5dddbfce014a3f8fc874714b771605~mv2.png/v1/fill/w_480%2Ch_480%2Cal_c%2Cq_85%2Cusm_0.66_1.00_0.01%2Cenc_avif%2Cquality_auto/bf3545_ba5dddbfce014a3f8fc874714b771605~mv2.png' },
  { brand:'Itron', model:'CF Echo II', uri:'https://na.itron.com/o/commerce-media/accounts/-1/images/3198885?download=false' },
];

export async function seedEquipmentCatalogImages(db) {
  const done = await db.getFirstAsync(`SELECT value FROM _meta WHERE key='equipment_catalog_images_v2'`);
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

  await db.runAsync(`INSERT OR REPLACE INTO _meta(key,value) VALUES('equipment_catalog_images_v2','1')`);
}
