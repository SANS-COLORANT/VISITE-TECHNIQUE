/**
 * Version Expo Snack.
 *
 * L'export Excel natif utilise le système de fichiers et le partage natif.
 * Ces modules ne sont pas disponibles de façon fiable dans l'import Git de
 * Snack. On conserve la fonction attendue par VisiteScreen afin que toute
 * l'application puisse être testée dans Snack sans planter au chargement.
 */

export async function construireClasseur() {
  throw new Error(
    "La génération Excel n’est pas disponible dans Expo Snack. Elle reste disponible dans la version native de l’application."
  );
}

export async function exporterEtPartager() {
  throw new Error(
    "L’export Excel n’est pas disponible dans Expo Snack. Cette fonction reste disponible dans la version native de l’application."
  );
}
