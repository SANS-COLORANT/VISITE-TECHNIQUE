const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const swipeSource = read('rootTabSwipe.js').replace(/^export /gm, '');
const context = { module: { exports: {} } };
vm.runInNewContext(swipeSource + ';module.exports = {canStartRootSwipe, rootSwipeTarget, rootSwipeProgress};', context);
const { canStartRootSwipe, rootSwipeTarget, rootSwipeProgress } = context.module.exports;
assert.equal(canStartRootSwipe('home', -14, 0), true, 'left swipe opens Clients from Home');
assert.equal(canStartRootSwipe('home', +30, 0), false, 'no tab before Home');
assert.equal(canStartRootSwipe('clients', +14, 0), true, 'right swipe opens Home');
assert.equal(canStartRootSwipe('clients', -14, 0), true, 'left swipe opens Settings');
assert.equal(canStartRootSwipe('settings', -30, 0), false, 'no tab after Settings');
assert.equal(canStartRootSwipe('clients', -30, 26), false, 'vertical scrolling must not trigger tabs');
assert.equal(rootSwipeTarget('home', -42, 0), 'clients');
assert.equal(rootSwipeTarget('clients', -42, 0), 'settings');
assert.equal(rootSwipeTarget('settings', +42, 0), 'clients');
assert.equal(rootSwipeTarget('clients', +42, 0), 'home');
assert.equal(rootSwipeTarget('clients', +25, 0), null, 'gesture must exceed short threshold');
assert.equal(rootSwipeProgress(-56), 1, 'indicator follows small movement');
assert.equal(rootSwipeProgress(56), -1, 'indicator follows back movement');

const app = read('App.js'), nav = read('BottomTabBar.js');
assert.ok(app.includes('gesture.dx > 18') && app.includes('gesture.dx > 82'), 'back swipe needs left-to-right direction');
assert.ok(app.includes('canStartRootSwipe(') && app.includes('rootSwipeProgress('), 'app uses tab swipe');
assert.ok(nav.includes('translateX: bubbleTranslate') && nav.includes('pointerEvents="none"'), 'animated bubble does not steal touches');
assert.ok(app.includes('swipeProgress={tabSwipeProgress}'), 'root responder drives bubble');

const dbSource = read('symfonyApiCacheDb.js');
const start = dbSource.indexOf('export async function listImportedApiClients()');
const end = dbSource.indexOf('export async function searchCachedDirectory(', start);
assert.ok(start >= 0 && end > start, 'dedicated imported client query exists');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`
  CREATE TABLE clients(id TEXT PRIMARY KEY, nom TEXT);
  CREATE TABLE api_client_links(remote_client_id TEXT PRIMARY KEY,local_client_id TEXT,nom TEXT,autorise INTEGER DEFAULT 1);
  INSERT INTO clients VALUES ('local-1','Déjà importé');
  INSERT INTO api_client_links VALUES ('1','local-1','Importé',1);
  INSERT INTO api_client_links VALUES ('2',NULL,'Seulement Intranet',1);
  INSERT INTO api_client_links VALUES ('3','local-disparu','Référence supprimée',1);
  INSERT INTO api_client_links VALUES ('4','local-1','Accès non autorisé',0);
`);
const getDb = async () => ({ getAllAsync: async (sql) => sqlite.prepare(sql).all() });
const fake = { db: getDb, result: null };
vm.runInNewContext(dbSource.slice(start,end).replace(/^export /gm, '')+';globalThis.result = listImportedApiClients;',fake);
(async () => {
  const rows = await fake.result();
  assert.deepEqual(rows.map(x=>x.remote_client_id), ['1'], 'default list must include only existing, authorized imported client');
  sqlite.close();
  const directory = read('MetraDirectoryScreen.js');
  assert.ok(directory.includes('await searchCachedDirectory(text)') && directory.includes('await listImportedApiClients()'), 'search includes remote clients, default only imports');
  assert.ok(directory.includes("navigation.navigate('ClientSites', { clientId: item.local_client_id"), 'imported client opens local sites');
  assert.ok(directory.includes('onSubmitEditing') && directory.includes('sync();'), 'submitted search can refresh Intranet catalogue');
  console.log('[root-navigation-directory] swipe direction/short travel/bubble + SQL imported-only + Intranet search passed.');
})().catch((error) => { console.error(error); process.exitCode=1; });
