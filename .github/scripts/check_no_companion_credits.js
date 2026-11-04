const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
for (const [p, forbidden] of [
  ['App.js', ['CompanionPhoneScreen', "phoneMode === 'companion'", 'onPhoneModeExit']],
  ['VisiteScreen.js', ['CompanionTabletModal', 'ACTION_PICTOS.compagnon']],
  ['ClientSitesScreen.js', ['CompanionTabletModal', "key: 'compagnon'"]],
  ['app.config.js', ['withMetraCompanion']],
]) for (const token of forbidden) assert.ok(!read(p).includes(token), p + ' still contains ' + token);
for (const p of [
  'plugins/withMetraCompanion.js', 'native/metra-companion/MetraCompanionModule.kt',
  'native/metra-companion/MetraCompanionPackage.kt', 'CompanionPhoneScreen.js',
  'CompanionTabletModal.js', 'companionNative.js', 'companionOutbox.js', 'companionProtocol.js',
]) assert.ok(!fs.existsSync(path.join(root, p)), 'Companion artifact still exists: ' + p);
const app = read('App.js'), home = read('HomeScreen.js'), credits = read('CreditsModal.js');
assert.ok(app.includes('<CreditsModal') && app.includes('onCreditsLongPress'), 'credits modal not connected');
assert.ok(home.includes('delayLongPress={550}') && home.includes('onLongPress={onCreditsLongPress}'), 'orange wrench long press missing');
for (const [code, label] of [['TCA','Pour Thibault'],['EAL','Pour Erwan'],['TSAI','Pour Thomas']])
  assert.ok(credits.includes(code) && credits.includes(label), 'missing credit: ' + code);
assert.ok(read('PhotoPhoneScreen.js').includes('buildPhotoModeVisitSnapshot'), 'standalone photo editor not retained');
console.log('[no-companion-credits] native pairing removed; local photos preserved; credits reachable.');
