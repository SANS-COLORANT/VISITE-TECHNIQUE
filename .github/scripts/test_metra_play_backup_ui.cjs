/**
 * METRA Google Play : la sauvegarde manuelle chiffrée AES-256 doit être
 * accessible, l'export brut et l'automatisation non chiffrée restent interdits.
 * Les anciens ZIP ne s'importent qu'avec consentement explicite.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');

const source = (name) => fs.readFileSync(path.resolve(__dirname, '../..', name), 'utf8');

test('Google Play: backup / restore controls are gated behind the secure build flag', () => {
  const settings = source('ParametresScreen.js');
  assert.match(settings, /import \{ METRA_PLAY_SECURE_BUILD \} from '\.\/playSecurityRuntime\.generated\.js';/);
  assert.match(settings, /METRA_PLAY_SECURE_BUILD \? \(/);
  assert.match(settings, /Sauvegarde complète chiffrée/);
  assert.match(settings, /Exporter une sauvegarde chiffrée/);
  assert.match(settings, /Restaurer une sauvegarde ZIP/);
  assert.match(settings, /backupPassword!==backupPasswordConfirm/);
  assert.match(settings, /autoriserArchiveAncienne:legacy/);
  assert.match(settings, /Ne désinstalle pas METRA/);
  assert.match(settings, /\) : \(<>[\s\S]*Restaurer une sauvegarde ZIP[\s\S]*<\/>(\s*)\)}/);
});

test('Security: no unencrypted export or restore re-enabled in Play', () => {
  const backup = source('databaseBackup.js');
  assert.match(backup, /if \(METRA_PLAY_SECURE_BUILD\) throw new Error/);
  assert.match(backup, /export async function exporterSauvegardeBase\(\) \{\s*refuserExportNonChiffre\(\)/);
  assert.match(backup, /export async function exporterSauvegardeComplete\(options = \{\}\) \{\s*if \(METRA_PLAY_SECURE_BUILD\) return exporterSauvegardeChiffree\(options\)/);
  assert.match(backup, /export async function choisirEtRestaurerSauvegardeComplete\(options = \{\}\) \{\s*if \(METRA_PLAY_SECURE_BUILD\) return choisirEtRestaurerSauvegardeChiffree\(options\)/);
  assert.match(backup, /export async function sauvegardeAutoSiNecessaire[\s\S]*if \(METRA_PLAY_SECURE_BUILD\) return false/);
});

test('Restore: no automatic shutdown when SQLite restoration did not start', () => {
  const settings = source('ParametresScreen.js');
  const backup = source('databaseBackup.js');
  assert.match(backup, /if \(remplacementCommence && error && typeof error === 'object'\)/);
  assert.match(backup, /error\.restoreTouchedDatabase = true/);
  assert.match(settings, /sqlitePotentiellementModifie = Boolean\(e\?\.restoreTouchedDatabase\)/);
  assert.match(settings, /\[\{text:'Compris'\}\]/);
  assert.match(settings, /Aucune restauration des données locales n’a été commencée/);
});
