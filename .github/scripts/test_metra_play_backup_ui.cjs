/**
 * Contrats METRA : ZIP complet AES-256 sur Play, anciens ZIP v1 importables,
 * copie avant remplacement et protection des médias Missions. Le test de
 * restauration native reste obligatoire sur Android avant diffusion.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');
const { parse } = require('@babel/parser');
const root = path.resolve(__dirname, '../..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const backup = source('databaseBackup.js');
const settings = source('ParametresScreen.js');

test('Play: secure archive UI is accessible, backed by real AES256 code', () => {
  parse(settings, {sourceType:'module', plugins:['jsx']});
  parse(backup, {sourceType:'module'});
  assert.match(settings, /Sauvegarde chiffrée complète · AES-256/);
  assert.match(settings, /accessibilityLabel="Mot de passe de sauvegarde"/);
  assert.match(settings, /accessibilityLabel="Confirmer le mot de passe de sauvegarde"/);
  assert.match(settings, /accessibilityLabel="Mot de passe de restauration"/);
  assert.match(settings, /secureTextEntry/);
  assert.match(settings, /backupPassword!==backupConfirmation/);
  assert.match(settings, /exporterSauvegardeComplete\(\{password:backupPassword\}\)/);
  assert.match(settings, /allowLegacyPlain:legacyZip/);
  assert.match(backup, /zipWithPassword\(cheminNatif\(travail\), cheminNatif\(archiveUri\), secret, BACKUP_ENCRYPTION\)/);
  assert.match(backup, /unzipWithPassword\(cheminNatif\(asset\.uri\), cheminNatif\(restauration\), secret\)/);
  assert.match(backup, /BACKUP_ENCRYPTION = 'AES-256'/);
  assert.match(backup, /value\.length < 12 \|\| value\.length > 256/);
});

test('Play security: plaintext DB export and automatic plaintext backup remain blocked', () => {
  assert.match(backup, /if \(METRA_PLAY_SECURE_BUILD\) throw new Error/);
  assert.match(backup, /export async function exporterSauvegardeBase\(\) \{\s*refuserExportNonChiffre\(\)/);
  assert.match(backup, /export async function choisirDossierSauvegardeAuto\(\) \{\s*refuserExportNonChiffre\(\)/);
  assert.match(backup, /export async function sauvegardeAutoSiNecessaire[\s\S]*if \(METRA_PLAY_SECURE_BUILD\) return false/);
  assert.match(backup, /const plainLegacy = !METRA_PLAY_SECURE_BUILD && !password/);
  assert.match(backup, /if \(plainLegacy\) await zip\(/);
  assert.match(backup, /if \(allowLegacyPlain\) await unzip\(/);
  assert.match(backup, /archiveVersion === LEGACY_BACKUP_VERSION/);
});

test('SQLite and media safety: source integrity, protected rollback and full allowed roots', () => {
  assert.match(backup, /verifyDatabaseIntegrity\(db\)/);
  assert.match(backup, /await db\.execAsync\('PRAGMA wal_checkpoint\(TRUNCATE\);'\)/);
  assert.match(backup, /metra-recovery\/pre-restore-/);
  assert.match(backup, /await FileSystem\.copyAsync\(\{ from: currentDb, to: securite \+ DATABASE_NAME \}\)/);
  assert.match(backup, /await closeAppDatabase\(\)/);
  assert.match(backup, /await rebaserUrisDurables\(restoredDb\)/);
  assert.match(backup, /restoreTouchedDatabase = true/);
  assert.match(backup, /'visite-technique\/'/);
  assert.match(backup, /'metra-missions\/'/);
  assert.match(backup, /safeArchiveRelative\(manifeste\.database/);
  assert.match(backup, /safeArchiveRelative\(manifeste\.photosRoot/);
  assert.match(backup, /throw new Error\('Dossier inconnu dans le manifeste/);
  assert.match(settings, /sqlitePotentiellementModifie = Boolean\(e\?\.restoreTouchedDatabase\)/);
});

test('Zip native dependency is patched against unsafe extraction (>=7.1.2)', () => {
  const p = JSON.parse(source('package.json'));
  const lock = JSON.parse(source('package-lock.json'));
  assert.equal(p.dependencies['react-native-zip-archive'], '7.1.2');
  assert.equal(lock.packages[''].dependencies['react-native-zip-archive'], '7.1.2');
  assert.equal(lock.packages['node_modules/react-native-zip-archive'].version, '7.1.2');
});
