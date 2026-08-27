// Valeurs de secours pour le developpement local.
// Le workflow Android remplace automatiquement APK_BUILD par le numero exact du build.
export const APP_RELEASE = 'Alpha 1';
export const APK_BUILD = 'DEV';

export function appVersionLabel() {
  return `${APP_RELEASE}.${APK_BUILD}`;
}
