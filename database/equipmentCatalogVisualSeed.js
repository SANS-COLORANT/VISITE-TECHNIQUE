import { getEquipmentBrandLogoUri } from '../equipmentVisuals.js';

const META_KEY = 'equipment_catalog_visuals_v1';

function estUriImage(uri = '') {
  const value = String(uri || '').trim().toLowerCase();
  return /\.(png|jpe?g|webp|gif)(\?|#|$)/.test(value);
}

/**
 * Complète les visuels sans inventer de photo produit.
 * - toutes les marques connues reçoivent un logo distant de secours ;
 * - une image déjà présente sur une variante remonte au modèle ;
 * - une image du modèle redescend vers les variantes qui n'en ont pas ;
 * - une source constructeur qui pointe directement vers une image peut être reprise.
 *
 * Les images existantes/custom ne sont jamais écrasées.
 */
export async function seedEquipmentCatalogVisuals(db) {
  const done = await db.getFirstAsync(`SELECT value FROM _meta WHERE key=?`, [META_KEY]);
  if (done) return;

  const brands = await db.getAllAsync(`SELECT id,nom,logo_uri FROM marques_equipement WHERE actif=1 ORDER BY nom`);
  for (const brand of brands) {
    if (String(brand.logo_uri || '').trim()) continue;
    const logoUri = getEquipmentBrandLogoUri(brand.nom);
    if (logoUri) await db.runAsync(`UPDATE marques_equipement SET logo_uri=? WHERE id=?`, [logoUri, brand.id]);
  }

  // Certaines fiches enrichies portent déjà une image officielle directement
  // dans source_uri. On ne la reprend que si l'URL est clairement une image.
  const directModelSources = await db.getAllAsync(`
    SELECT id,source_uri FROM modeles_equipement
    WHERE actif=1 AND (image_uri IS NULL OR TRIM(image_uri)='')
      AND source_uri IS NOT NULL AND TRIM(source_uri)<>''
  `);
  for (const row of directModelSources) {
    if (estUriImage(row.source_uri)) await db.runAsync(`UPDATE modeles_equipement SET image_uri=? WHERE id=?`, [row.source_uri, row.id]);
  }

  const directVariantSources = await db.getAllAsync(`
    SELECT id,source_uri FROM variantes_equipement
    WHERE actif=1 AND (image_uri IS NULL OR TRIM(image_uri)='')
      AND source_uri IS NOT NULL AND TRIM(source_uri)<>''
  `);
  for (const row of directVariantSources) {
    if (estUriImage(row.source_uri)) await db.runAsync(`UPDATE variantes_equipement SET image_uri=? WHERE id=?`, [row.source_uri, row.id]);
  }

  // Si une référence précise possède déjà une vraie image, elle devient aussi
  // l'aperçu de la gamme lorsque la gamme n'avait encore aucun visuel.
  await db.runAsync(`
    UPDATE modeles_equipement
    SET image_uri=(
      SELECT v.image_uri
      FROM variantes_equipement v
      WHERE v.modele_id=modeles_equipement.id
        AND v.actif=1
        AND v.image_uri IS NOT NULL
        AND TRIM(v.image_uri)<>''
      ORDER BY CASE WHEN COALESCE(v.data_quality,'') LIKE 'verified%' THEN 0 ELSE 1 END, v.nom
      LIMIT 1
    )
    WHERE actif=1
      AND (image_uri IS NULL OR TRIM(image_uri)='')
      AND EXISTS(
        SELECT 1 FROM variantes_equipement v
        WHERE v.modele_id=modeles_equipement.id
          AND v.actif=1
          AND v.image_uri IS NOT NULL
          AND TRIM(v.image_uri)<>''
      )
  `);

  // Et réciproquement : lorsqu'une gamme est illustrée, ses références sans
  // image bénéficient de ce visuel de gamme plutôt que d'un écran vide.
  await db.runAsync(`
    UPDATE variantes_equipement
    SET image_uri=(SELECT m.image_uri FROM modeles_equipement m WHERE m.id=variantes_equipement.modele_id)
    WHERE actif=1
      AND (image_uri IS NULL OR TRIM(image_uri)='')
      AND EXISTS(
        SELECT 1 FROM modeles_equipement m
        WHERE m.id=variantes_equipement.modele_id
          AND m.image_uri IS NOT NULL
          AND TRIM(m.image_uri)<>''
      )
  `);

  const logoStats = await db.getFirstAsync(`
    SELECT COUNT(*) total,
      SUM(CASE WHEN logo_uri IS NOT NULL AND TRIM(logo_uri)<>'' THEN 1 ELSE 0 END) avec_logo
    FROM marques_equipement WHERE actif=1
  `);
  const imageStats = await db.getFirstAsync(`
    SELECT COUNT(*) total,
      SUM(CASE WHEN image_uri IS NOT NULL AND TRIM(image_uri)<>'' THEN 1 ELSE 0 END) avec_image
    FROM modeles_equipement WHERE actif=1
  `);

  await db.runAsync(
    `INSERT OR REPLACE INTO _meta(key,value) VALUES(?,?)`,
    [META_KEY, JSON.stringify({
      marques: Number(logoStats?.total || 0),
      marquesAvecLogo: Number(logoStats?.avec_logo || 0),
      modeles: Number(imageStats?.total || 0),
      modelesAvecImage: Number(imageStats?.avec_image || 0),
    })]
  );
}
