const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../db.js'), 'utf8');
const start = source.indexOf('let dbInstance = null;');
const end = source.indexOf('async function seedDemoSiNecessaire', start);
assert.ok(start >= 0 && end > start, 'getDb source is available');

function makeGetDb(seeds) {
  const db = {};
  const names = [
    'openAppDatabase',
    'seedDemoSiNecessaire',
    'seedBibliothequeSiNecessaire',
    'seedEquipementsBibliothequeSiNecessaire'
  ];
  const values = [async () => db, ...seeds];
  return new Function(...names, `${source.slice(start, end)}\nreturn getDb;`)(...values);
}

async function main() {
  let releaseSeed;
  const seedGate = new Promise((resolve) => {
    releaseSeed = resolve;
  });
  let seedCalls = 0;
  const getDb = makeGetDb([
    async () => {
      seedCalls += 1;
      await seedGate;
    },
    async () => {
      seedCalls += 1;
    },
    async () => {
      seedCalls += 1;
    }
  ]);
  const first = getDb();
  await Promise.resolve();
  await Promise.resolve();
  let secondResolved = false;
  const second = getDb().then(() => {
    secondResolved = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(secondResolved, false, 'concurrent callers wait for all seeds');
  releaseSeed();
  await Promise.all([first, second]);
  assert.equal(seedCalls, 3, 'seeds run only once');

  let attempts = 0;
  const retry = makeGetDb([
    async () => {
      if (++attempts === 1) throw new Error('seed failed');
    },
    async () => {},
    async () => {}
  ]);
  await assert.rejects(retry(), /seed failed/);
  await retry();
  assert.equal(attempts, 2, 'failed initialization can retry');
  console.log('Database initialization concurrency: OK');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
