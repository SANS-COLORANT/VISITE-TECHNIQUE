// LOT 05: executable checks on the production callback bodies, without React/Android/data mutation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..', '..');
const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('F06: production scroll adapter restores both FlatList and RN 0.74 SectionList', () => {
  const src = source('useListScrollMemory.js');
  const body = src.slice(src.indexOf('export function restoreListScrollOffset'), src.indexOf('export function useListScrollMemory')).replace('export ', '');
  const restore = new Function(body + '; return restoreListScrollOffset;')();
  const seen = [];
  assert.equal(restore({ scrollToOffset: (args) => seen.push(['flat', args.offset]) }, 800), true);
  assert.equal(restore({ getScrollResponder: () => ({ scrollTo: (args) => seen.push(['section', args.y]) }) }, 800), true);
  assert.equal(restore({ getScrollResponder: () => ({ scrollResponderScrollTo: (args) => seen.push(['fallback', args.y]) }) }, 800), true);
  assert.equal(restore({ getScrollResponder: () => ({}) }, 800), false);
  assert.deepEqual(seen, [['flat', 800], ['section', 800], ['fallback', 800]]);
  const generic = source('TrameGenericPanel.js');
  assert.match(generic, /restoreListScrollOffset\(listRef\.current, offset\)/);
  assert.doesNotMatch(generic, /listRef\.current\?\.scrollToOffset/);
});

test('F07: production directory callback discards late results and stale fast-cache updates', async () => {
  const src = source('MetraDirectoryScreen.js');
  const match = src.match(/const search = useCallback\(async \(text = query\) => \{([\s\S]*?)\n  \}, \[query\]\);/);
  assert.ok(match, 'production search callback located');
  const pending = [];
  const visible = [];
  const ref = { current: 0 };
  const queryRef = { current: 'old' };
  const factory = new Function('directorySearchVersionRef', 'visibleQueryRef', 'setDirectory', 'searchCachedDirectory', 'listImportedApiClients', 'query', `
    let METRA_DIRECTORY_FAST_CACHE = null;
    const search = async (text = query) => {${match[1]}\n};
    return { search, fast: () => METRA_DIRECTORY_FAST_CACHE };
  `);
  const api = factory(ref, queryRef, (v) => visible.push(v), (q) => {
    const d = deferred(); pending.push({ query: q, ...d }); return d.promise;
  }, async () => [], 'old');
  const oldCall = api.search('old');
  queryRef.current = 'new';
  ref.current += 1; // real text update invalidates before debounce
  const newCall = api.search('new');
  assert.equal(pending.length, 2);
  pending[1].resolve({ clients: ['new'], sites: [] });
  await newCall;
  pending[0].resolve({ clients: ['old'], sites: [] });
  await oldCall;
  assert.deepEqual(visible.map((v) => v.clients[0]), ['new']);
  assert.equal(api.fast().clients[0], 'new');
});

test('F12: production Pilotage callbacks ignore photos from a previously closed cell', async () => {
  const src = source('ClientPilotageScreen.js');
  const begin = src.indexOf('  const closeCell = () => {');
  const end = src.indexOf('  const activeFilterCount = ', begin);
  assert.ok(begin > 0 && end > begin);
  const body = src.slice(begin, end);
  const pending = [];
  const selected = [];
  const published = [];
  const photoGeneration = { current: 0 };
  const factory = new Function('cellPhotoGenerationRef', 'setSelected', 'setPhotos', 'mapAvecConcurrence', 'issueKey', 'getMatrixCellPhotos', 'Alert', `
    ${body}
    return { closeCell, openCell };
  `);
  const api = factory(photoGeneration, (v) => selected.push(v), (v) => published.push(v),
    async (issues, _limit, worker) => Promise.all(issues.map(worker)),
    (issue) => issue.id, (issue) => {
      const d = deferred(); pending.push({ id: issue.id, ...d }); return d.promise;
    }, { alert: () => { throw Error('unexpected photo error'); } });
  const first = api.openCell({ id: 'A' }, {}, { issues: [{ id: 'A' }] });
  api.closeCell();
  const second = api.openCell({ id: 'B' }, {}, { issues: [{ id: 'B' }] });
  pending[1].resolve(['photo-B']);
  await second;
  pending[0].resolve(['photo-A']);
  await first;
  assert.equal(selected.at(-1).site.id, 'B');
  assert.equal(published.at(-1).B[0], 'photo-B');
  assert.equal(Object.prototype.hasOwnProperty.call(published.at(-1), 'A'), false);
});

test('F11: Pilotage publishes usable matrix before secondary statistics and does not display fabricated zeroes', () => {
  const src = source('ClientPilotageScreen.js');
  const started = src.indexOf('  const charger = useCallback(async () => {');
  const ended = src.indexOf('  useEffect(() => {', started);
  const body = src.slice(started, ended);
  assert.ok(body.indexOf('setMatrix(m)') >= 0 && body.indexOf('setMatrix(m)') < body.indexOf('await getStatsSitesPatrimoine(clientId)'));
  assert.ok(body.indexOf('setLoading(false)') < body.indexOf('await getStatsSitesPatrimoine(clientId)'));
  assert.match(src, /if \(!\(stats instanceof Map\)\) return null/);
  assert.match(src, /resume\?\.actifs \?\? '—'/);
  assert.match(src, /Statistiques indisponibles/);
});
