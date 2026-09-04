import { rattacherDonneesGeneralesChaufferie } from './preAllumageBusinessDb.js';

export async function preparerChaufferieDynamiquePreAllumage(visiteId, localId) {
  // Le bloc de contrôles généraux créé avec la chaufferie reste présent tant
  // qu'il n'est pas remplacé par une structure d'équipements héritée du site.
  // Cela garantit que les avis S / N.S / N.R / S.O / N.V sont immédiatement
  // disponibles, même avant l'ajout d'une chaudière, pompe, V3V, etc.
  await rattacherDonneesGeneralesChaufferie(visiteId, localId);
}
