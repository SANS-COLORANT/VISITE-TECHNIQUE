// Reproductions of asynchronous races without Android, React or production data.
// Kept independent from native SQLite and real Symfony traffic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.join(__dirname, '../..');
class BoundedLruMap extends Map {
  constructor(limit) { super(); this.limit = limit; }
  get(key) {
    if (!super.has(key)) return undefined;
    const value = super.get(key);
    super.delete(key); super.set(key, value);
    return value;
  }
  set(key, value) {
    super.delete(key); super.set(key, value);
    while (this.size > this.limit) super.delete(this.keys().next().value);
    return this;
  }
}
function load(modulePath, deps, exports) {
  const source = fs.readFileSync(path.join(root, modulePath), 'utf8')
    .replace(/^import .*?;\s*$/gm, '')
    .replace(/\bexport\s+/g, '');
  const context = { ...deps, console, Map, Set, String, Number, Date, Promise, JSON, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(source + '\n;globalThis.__module = {' + exports.join(',') + '};', context, { filename: modulePath });
  return context.__module;
}
const defer = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function tick() { await new Promise((r) => setImmediate(r)); }

test('save badge cannot hide a rejected field when another field saves', { timeout: 10000 }, () => {
  const s = load('saveActivity.js', {}, ['markDraftDirty','markDraftSaving','markDraftSaved','markDraftError','getSaveActivity','beginExternalSave','endExternalSave']);
  s.markDraftDirty('A');
  s.markDraftSaving('A');
  s.markDraftError('A', new Error('A failed'));
  s.markDraftDirty('B');
  s.markDraftSaving('B');
  s.markDraftSaved('B');
  assert.equal(s.getSaveActivity().lastError, 'A failed');
  assert.equal(s.getSaveActivity().dirty, 1);
  s.markDraftSaved('A');
  assert.equal(s.getSaveActivity().lastError, null);
  assert.equal(s.getSaveActivity().pending, 0);
  s.beginExternalSave('C');
  s.endExternalSave('C', new Error('C failed'));
  s.beginExternalSave('D');
  s.endExternalSave('D');
  assert.equal(s.getSaveActivity().lastError, 'C failed');
  s.beginExternalSave('C');
  s.endExternalSave('C');
  assert.equal(s.getSaveActivity().lastError, null);
});

test('invalidation rejects a stale prewarm publication and preserves current worker', { timeout: 10000 }, async () => {
  const queued = [];
  const nav = load('navigationPrewarm.js', {
    BoundedLruMap,
    listerSitesClient: () => {
      const d = defer(); queued.push(d); return d.promise;
    },
    listerAppartenancesClient: async () => [],
    listerVisitesLocal: async () => [], listerVisitesSite: async () => [],
    getDb: async () => ({ getAllAsync: async () => [], getFirstAsync: async () => null }),
    materializeCachedLocalForSite: async () => {},
    getSiteLocalisation: async () => null,
  }, ['prewarmClientSites','peekClientSites','invalidateClientSites','navigationPrewarmStats']);
  const stale = nav.prewarmClientSites('c');
  await tick();
  assert.equal(queued.length, 1);
  nav.invalidateClientSites('c');
  const fresh = nav.prewarmClientSites('c');
  await tick();
  assert.equal(queued.length, 2);
  queued[1].resolve([{ id: 'new' }]);
  assert.equal((await fresh).sites[0].id, 'new');
  queued[0].resolve([{ id: 'old' }]);
  assert.equal((await stale).sites[0].id, 'new');
  assert.equal(nav.peekClientSites('c').sites[0].id, 'new');
  assert.equal(nav.navigationPrewarmStats().inflight, 0);
});

test('failed navigation hydration retries, rather than retaining an empty marker', { timeout: 10000 }, async () => {
  let calls = 0;
  const nav = load('navigationMemory.js', {
    BoundedLruMap, AppState: { addEventListener: () => ({ remove() {} }) },
    require: () => ({ openAppDatabase: async () => ({
      getFirstAsync: async () => {
        calls += 1;
        if (calls === 1) throw new Error('temporary database failure');
        return { value: JSON.stringify({ scrollY: 42, updatedAt: 10 }) };
      },
    }) }),
  }, ['hydrateNavigationState','getNavigationState']);
  assert.equal(await nav.hydrateNavigationState('screen'), null);
  const recovered = await nav.hydrateNavigationState('screen');
  assert.equal(recovered.scrollY, 42);
  assert.equal(calls, 2);
});
