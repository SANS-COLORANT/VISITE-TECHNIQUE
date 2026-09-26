/**
 * Aperçu du rapport PDF d'une visite, sans export : le rapport est construit
 * avec les réglages par défaut puis affiché dans l'aperçu d'impression
 * Android (qui permet aussi de l'enregistrer en PDF).
 */
import * as Print from 'expo-print';

export async function apercuRapportVisite(visiteId) {
  const { chargerDonneesVisiteRapport, construireHtmlRapport, preparerPhotosRapport } = require('./reportBuilder.js');
  const data = await chargerDonneesVisiteRapport(visiteId);
  const photos = preparerPhotosRapport(data, []).map((x) => ({ ...x, size: x.size || 'medium', captionSize: x.captionSize || 'normal' }));
  const config = {
    chrono: '', objet: 'Compte rendu de visite technique', dateRapport: new Date().toISOString().slice(0, 10),
    afficherLignesVides: false, materiel: true, remarques: true, photos: true,
    coverUri: null, coverLabel: 'Image standard METRA', coverVisiteId: null,
    layout: { textScale: 'normal', sections: {} }, patrimoine: false, patrimoineScope: 'sites',
  };
  const html = await construireHtmlRapport([data], config, photos, 'pdf');
  await Print.printAsync({ html });
}
