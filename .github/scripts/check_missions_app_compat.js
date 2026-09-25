const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const fail = (message) => {
  throw new Error('Compatibilité application METRA: ' + message);
};
const requireText = (text, needle, label) => {
  if (!text.includes(needle)) fail(label + ' manquant (' + needle + ')');
};

const pkg = json('package.json');
const lock = json('package-lock.json');
const app = json('app.json');
const constants = read('database/constants.js');
const migrationsIndex = read('database/migrations/index.js');
const appConfig = read('app.config.js');
const apkWorkflow = read('.github/workflows/native-android-apk.yml');
const missionPlugin = read('plugins/withMetraMissionTools.js');

const EXPECTED = Object.freeze({
  expo: '51.0.39',
  react: '18.2.0',
  reactNative: '0.74.5',
  sqlite: '~14.0.0',
  imagePicker: '~15.1.0',
  fileSystem: '~17.0.0',
  packageId: 'com.visitetechnique.tablet',
  dbName: 'visite_technique.db'
});

if (pkg.dependencies?.expo !== EXPECTED.expo)
  fail('Expo doit rester sur ' + EXPECTED.expo + ', trouvé ' + pkg.dependencies?.expo);
if (pkg.dependencies?.react !== EXPECTED.react) fail('React doit rester sur ' + EXPECTED.react);
if (pkg.dependencies?.['react-native'] !== EXPECTED.reactNative)
  fail('React Native doit rester sur ' + EXPECTED.reactNative);
if (pkg.dependencies?.['expo-sqlite'] !== EXPECTED.sqlite) fail('expo-sqlite incompatible');
if (pkg.dependencies?.['expo-image-picker'] !== EXPECTED.imagePicker) fail('expo-image-picker incompatible');
if (pkg.dependencies?.['expo-file-system'] !== EXPECTED.fileSystem) fail('expo-file-system incompatible');

const lockRoot = lock.packages?.[''] || {};
for (const [name, value] of Object.entries(pkg.dependencies || {})) {
  if (lockRoot.dependencies?.[name] !== value) fail('package-lock désaligné pour ' + name);
}

if (app.expo?.android?.package !== EXPECTED.packageId) {
  fail('applicationId Android modifié: ' + app.expo?.android?.package);
}
if (!Number.isInteger(app.expo?.android?.versionCode) || app.expo.android.versionCode < 1) {
  fail('versionCode Android source invalide');
}
if (!constants.includes("DATABASE_NAME = '" + EXPECTED.dbName + "'")) fail('nom de base SQLite historique modifié');

const declaredMatch = constants.match(/DATABASE_SCHEMA_VERSION\s*=\s*(\d+)/);
if (!declaredMatch) fail('DATABASE_SCHEMA_VERSION introuvable');
const declared = Number(declaredMatch[1]);
const registered = [...migrationsIndex.matchAll(/migration(\d+)/g)].map((m) => Number(m[1]));
const latest = Math.max(...registered);
if (declared !== latest) fail('schéma SQLite déclaré v' + declared + ' mais dernière migration v' + latest);
for (let version = 1; version <= latest; version += 1) {
  if (!registered.includes(version)) fail('migration ' + String(version).padStart(3, '0') + ' absente de la lignée');
}

for (const version of [40, 41, 42, 43]) {
  const file =
    'database/migrations/' +
    String(version).padStart(3, '0') +
    (version === 40
      ? '_missions_core.js'
      : version === 41
        ? '_missions_architecture.js'
        : version === 42
          ? '_missions_complete_tooling.js'
          : '_missions_measurement_campaigns.js');
  const src = read(file);
  if (/\bDROP\s+TABLE\b/i.test(src)) fail('migration Missions v' + version + ' contient DROP TABLE');
  if (/\bDELETE\s+FROM\s+(clients|sites|visites|equipements|reseaux|compteurs)\b/i.test(src)) {
    fail('migration Missions v' + version + ' supprime des données historiques');
  }
}

requireText(appConfig, "'./plugins/withMetraDpop'", 'plugin DPoP historique');
requireText(appConfig, "'./plugins/withMetraMissionTools'", 'plugin natif Missions');
requireText(missionPlugin, 'com.google.mlkit:text-recognition:16.0.1', 'ML Kit OCR local');
requireText(missionPlugin, 'MetraMissionToolsPackage()', 'package natif Missions');
requireText(missionPlugin, 'android.permission.RECORD_AUDIO', 'permission dictée locale');

for (const file of [
  'native/metra-mission-tools/MetraOcrModule.kt',
  'native/metra-mission-tools/MetraSpeechModule.kt',
  'native/metra-mission-tools/MetraPdfModule.kt',
  'native/metra-mission-tools/MetraGeoPackageModule.kt',
  'native/metra-mission-tools/MetraMissionToolsPackage.kt'
]) {
  if (!fs.existsSync(path.join(ROOT, file))) fail('module natif Missions manquant: ' + file);
}

requireText(apkWorkflow, "expected_package = 'com.visitetechnique.tablet'", 'verrou applicationId APK');
requireText(apkWorkflow, "android['versionCode'] = int('${{ github.run_number }}')", 'incrément versionCode APK');
requireText(apkWorkflow, "APK_BUILD = '${{ github.run_number }}'", 'numéro de build visible');
requireText(apkWorkflow, 'METRA_COMPAT_SIGNER_SHA256', 'certificat historique de mise à jour');
requireText(apkWorkflow, 'npx expo prebuild --clean --platform android --no-install', 'prébuild Expo Android');
requireText(apkWorkflow, './gradlew assembleRelease', 'compilation APK release');

const recurringTokens = ['pre_allumage', 'vmc-c'];
const recipes = read('missionRecipes.js');
for (const token of recurringTokens) {
  if (recipes.includes(token))
    fail('recette Mission réutilise un identifiant de Visite technique récurrente: ' + token);
}

console.log(
  'Compatibilité METRA validée: Expo ' +
    EXPECTED.expo +
    ', React Native ' +
    EXPECTED.reactNative +
    ', applicationId ' +
    EXPECTED.packageId +
    ', SQLite v' +
    declared +
    ', lignée migrations complète et identité APK conservée.'
);
