/**
 * Version Expo Snack.
 *
 * L'import Excel natif dépend de modules de fichiers qui ne sont pas résolus
 * correctement par l'import Git de Snack. On conserve la même API publique
 * pour que le reste de l'application démarre normalement.
 */

export async function choisirEtAnalyserExcel() {
  throw new Error(
    "L’import Excel n’est pas disponible dans Expo Snack. Cette fonction reste disponible dans la version native de l’application."
  );
}

export function analyserClasseur() {
  throw new Error(
    "L’analyse Excel n’est pas disponible dans Expo Snack. Utilise la version native de l’application pour importer une trame."
  );
}

export async function importerAnalyseExcel() {
  throw new Error(
    "L’import Excel n’est pas disponible dans Expo Snack. Cette fonction reste disponible dans la version native de l’application."
  );
}
