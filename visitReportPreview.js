/**
 * Aperçu du rapport PDF d'une visite, sans export : le rapport est construit
 * avec les réglages par défaut puis affiché dans l'aperçu d'impression
 * Android (qui permet aussi de l'enregistrer en PDF).
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

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
  const selectedCount = photos.filter((photo) => photo.include && photo.exportAllowed !== false).length;
  if (selectedCount > 8) {
    // The normal print preview used to send every photo into a single Android
    // print job. Open a bounded, complete temporary PDF instead.
    if (!await Sharing.isAvailableAsync())
      throw new Error('Aperçu volumineux : aucune visionneuse PDF disponible. Utilisez Générer un rapport PDF.');
    const { preparerApercuPdfFragmente } = require('./reportEditorExporter.js');
    const uri = await preparerApercuPdfFragmente({ datas: [data], config, photosConfig: photos });
    try {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Aperçu de visite METRA' });
    } finally {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
    return;
  }
  const html = await construireHtmlRapport([data], config, photos, 'pdf');
  await Print.printAsync({ html });
}
