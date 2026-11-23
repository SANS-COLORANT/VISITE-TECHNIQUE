/**
 * METRA Google Play : les commandes de sauvegarde non chiffree doivent etre
 * absentes de la branche UI securisee. La restauration reelle reste bloque
 * dans le backend; une erreur de prevalidation ne doit pas fermer l'app.
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
  assert.match(settings, /Sauvegarde et restauration locales indisponibles/);
  assert.match(settings, /Ne désinstalle pas METRA/);
  assert.match(settings, /\) : \(<>[\s\S]*Restaurer une sauvegarde ZIP[\s\S]*<\/>(\s*)\)}/);
});

test('Security: no unencrypted export or restore re-enabled in Play', () => {
  const backup = source('databaseBackup.js');
  assert.match(backup, /if \(METRA_PLAY_SECURE_BUILD\) throw new Error/);
  assert.match(backup, /export async function exporterSauvegardeBase\(\) \{\s*refuserExportNonChiffre\(\)/);
  assert.match(backup, /export async function exporterSauvegardeComplete\(\) \{\s*refuserExportNonChiffre\(\)/);
  assert.match(backup, /export async function choisirEtRestaurerSauvegardeComplete\(\) \{\s*refuserExportNonChiffre\(\)/);
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
