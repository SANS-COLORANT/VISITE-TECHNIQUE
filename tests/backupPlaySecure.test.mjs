import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BACKUP_FORMAT, BACKUP_FORMAT_VERSION, BACKUP_ENCRYPTION,
  BACKUP_MAX_UNCOMPRESSED_BYTES, validerMotDePasseSauvegarde,
  validerManifesteSauvegarde, validerEntreesZip,
  normaliserCheminArchive, rebaserUriLocale,
} from '../backupPolicy.js';

const currentSchema=48; // Tests accept newer schemas below with runtime-provided version.
const db='visite_technique.db';
const v1={format:BACKUP_FORMAT,formatVersion:1,schemaVersion:40,
  database:'database/'+db,photosRoot:'photos/',counts:{visites:2,photos:4}};
const v2={...v1,formatVersion:2,encryption:BACKUP_ENCRYPTION,
  photosRoot:'data/visite-technique/photos/',
  dataRoots:['data/visite-technique/','data/metra-missions/']};

test('password must be 16–128 characters and not padding',()=>{
  for(const s of ['', 'weakpass', ' '.repeat(19), 'valid but short']) assert.throws(()=>validerMotDePasseSauvegarde(s));
  assert.equal(validerMotDePasseSauvegarde('sixteencharacters!!'),'sixteencharacters!!');
  assert.throws(()=>validerMotDePasseSauvegarde('a'.repeat(129)));
});
test('v2 manifest recognizes encrypted complete data roots',()=>{
  assert.equal(BACKUP_FORMAT_VERSION,2);
  assert.equal(BACKUP_ENCRYPTION,'AES-256');
  assert.deepEqual(validerManifesteSauvegarde(v2,db,currentSchema),{
    formatVersion:2,schemaVersion:40,dbPath:'database/'+db,
    photoRoot:'data/visite-technique/photos/',visites:2,photos:4,
  });
});
test('legacy archive v1 is readable for migration from the old APK',()=>{
  assert.equal(validerManifesteSauvegarde(v1,db,currentSchema).formatVersion,1);
});
test('reject a future schema',()=>{
  assert.throws(()=>validerManifesteSauvegarde({...v2,schemaVersion:999},db,currentSchema),/plus récente/);
});
test('reject spoofed format or version',()=>{
  assert.throws(()=>validerManifesteSauvegarde({...v2,format:'else'},db,currentSchema));
  assert.throws(()=>validerManifesteSauvegarde({...v2,formatVersion:3},db,currentSchema));
  assert.throws(()=>validerManifesteSauvegarde({...v2,schemaVersion:0},db,currentSchema));
});
test('reject incomplete data roots or missing encryption',()=>{
  assert.throws(()=>validerManifesteSauvegarde({...v2,encryption:'STANDARD'},db,currentSchema));
  assert.throws(()=>validerManifesteSauvegarde({...v2,dataRoots:['data/visite-technique/']},db,currentSchema));
  assert.throws(()=>validerManifesteSauvegarde({...v2,dataRoots:[...v2.dataRoots].reverse()},db,currentSchema));
});
test('reject path traversal and absolute manifest paths',()=>{
  for(const bad of ['../db','x/../db','/tmp/file','C:/windows','x/./file','x\\\\..\\\\file','']) {
    assert.throws(()=>normaliserCheminArchive(bad),bad);
  }
  assert.throws(()=>validerManifesteSauvegarde({...v1,database:'../../private.db'},db,currentSchema));
  assert.throws(()=>validerManifesteSauvegarde({...v2,photosRoot:'../../photos/'},db,currentSchema));
});
test('reject archive substitution and bogus counts',()=>{
  assert.throws(()=>validerManifesteSauvegarde({...v2,database:'database/other.db'},db,currentSchema));
  assert.throws(()=>validerManifesteSauvegarde({...v2,counts:{visites:-1,photos:3}},db,currentSchema));
  assert.throws(()=>validerManifesteSauvegarde({...v2,counts:{visites:2,photos:Infinity}},db,currentSchema));
});
test('rebase visit photos and intranet history on new Android app document root',()=>{
  assert.equal(rebaserUriLocale('file:///data/user/0/old/files/visite-technique/photos/a.jpg','file:///data/user/0/new/files/'),
    'file:///data/user/0/new/files/visite-technique/photos/a.jpg');
  assert.equal(rebaserUriLocale('file:///old/files/visite-technique/intranet-photos/c.jpg','file:///new/files/'),
    'file:///new/files/visite-technique/intranet-photos/c.jpg');
});
test('rebase mission documents and photos',()=>{
  assert.equal(rebaserUriLocale('file:///old/files/metra-missions/12/photos/a.jpg','file:///new/files/'),
    'file:///new/files/metra-missions/12/photos/a.jpg');
});
test('non-owned URIs are left alone',()=>{
  assert.equal(rebaserUriLocale('https://intranet.example/image','file:///new/'),'https://intranet.example/image');
  assert.equal(rebaserUriLocale('content://media/images/123','file:///new/'),'content://media/images/123');
});
test('ZIP entries safely bounded',()=>{
  assert.equal(validerEntreesZip([
    {path:'manifest.json',size:200,isEncrypted:true},
    {path:'data/visite-technique/photos/hello.jpg',size:1000,isEncrypted:true},
  ]),1200);
  assert.throws(()=>validerEntreesZip([{path:'../../escape',size:1}]));
  assert.throws(()=>validerEntreesZip([{path:'file',size:-1}]));
  assert.throws(()=>validerEntreesZip([{path:'file',size:BACKUP_MAX_UNCOMPRESSED_BYTES+1}]));
});

const backend=readFileSync(resolve('secureBackup.js'),'utf8');
const wrapper=readFileSync(resolve('databaseBackup.js'),'utf8');
const ui=readFileSync(resolve('ParametresScreen.js'),'utf8');
const pkg=JSON.parse(readFileSync(resolve('package.json'),'utf8'));
const lock=JSON.parse(readFileSync(resolve('package-lock.json'),'utf8'));
test('Play backup always uses native AES-256 and never a plain outgoing ZIP',()=>{
  assert.match(backend,/await zipWithPassword\(native\(travail\), native\(archive\), password, BACKUP_ENCRYPTION\)/);
  assert.match(backend,/await checkNativeEncryptedArchive\(archive\)/);
  assert.doesNotMatch(backend,/\bawait zip\(/);
  assert.match(backend,/if \(!archiveValide\) await safeRemove\(archive\)/);
  assert.match(backend,/export async function partagerDerniereSauvegardeChiffree\(\)/);
  assert.match(backend,/const PRIVATE_BACKUP_FOLDER = 'metra-encrypted-backups\/'/);
});
test('import gates legacy plaintext and validates before replacing the database',()=>{
  assert.match(backend,/!autoriserArchiveAncienne/);
  assert.match(backend,/validerManifesteSauvegarde\(manifeste, DATABASE_NAME, DATABASE_SCHEMA_VERSION\)/);
  assert.ok(backend.indexOf('await validateRestoredContent(extracted')<backend.indexOf('await closeAppDatabase();'));
  assert.match(backend,/await snapshotDatabase\(db, safety \+ 'database\/' \+ DATABASE_NAME\)/);
  assert.match(backend,/await db\.runAsync\('VACUUM INTO \?', \[native\(destination\)\]\)/);
  assert.match(backend,/rollbackSucceeded = true/);
});
test('plaintext .db exports and automatic copies remain blocked on Play',()=>{
  assert.match(wrapper,/export async function exporterSauvegardeBase\(\) \{\s*refuserExportNonChiffre/);
  assert.match(wrapper,/export async function exporterSauvegardeComplete\(options = \{\}\) \{\s*if \(METRA_PLAY_SECURE_BUILD\) return exporterSauvegardeChiffree\(options\)/);
  assert.match(wrapper,/export async function choisirEtRestaurerSauvegardeComplete\(options = \{\}\) \{\s*if \(METRA_PLAY_SECURE_BUILD\) return choisirEtRestaurerSauvegardeChiffree\(options\)/);
  assert.match(wrapper,/if \(METRA_PLAY_SECURE_BUILD\) return false/);
});
test('settings require password confirmation, explicitly allow legacy archive and never store password in prefs',()=>{
  assert.match(ui,/Mot de passe/);
  assert.match(ui,/backupPassword!==backupPasswordConfirm/);
  assert.match(ui,/autoriserArchiveAncienne:legacy/);
  assert.match(ui,/navigationBarTranslucent/);
  assert.doesNotMatch(ui,/setPrefSync\([^)]*backupPassword/);
});
test('zip module is security-updated and integrity-pinned',()=>{
  assert.equal(pkg.dependencies['react-native-zip-archive'],'9.5.3');
  assert.equal(lock.packages[''].dependencies['react-native-zip-archive'],'9.5.3');
  assert.equal(lock.packages['node_modules/react-native-zip-archive'].version,'9.5.3');
  assert.ok(lock.packages['node_modules/react-native-zip-archive'].integrity.startsWith('sha512-'));
});
