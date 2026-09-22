/** Regression tests for a first Intranet visit on a local with no previous visit. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

const root = path.resolve(__dirname, '../..');
let checks = 0;
function check(condition, label) { assert.ok(condition, label); checks += 1; console.log(`OK ${checks}: ${label}`); }

function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map((m) => m[1]);
  const script = source
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/export\s*\{[^}]+\};?/g, '')
    .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g, '');
  return new Function(...Object.keys(dependencies), `${script}\nreturn {${[...new Set(names)].join(',')}};`)(
    ...Object.values(dependencies)
  );
}

function databaseProcess(filename) {
  const child = spawn('python3', [path.join(__dirname, 'photo_sqlite_harness.py'), filename], { stdio: ['pipe', 'pipe', 'inherit'] });
  const pending = new Map(); let seq = 0;
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const response = JSON.parse(line);
    const waiter = pending.get(response.id);
    if (!waiter) return;
    pending.delete(response.id);
    if (response.error) waiter.reject(new Error(response.error));
    else waiter.resolve(response.result);
  });
  const send = (method, sql = '', params = []) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ id, method, sql, params }) + '\n');
  });
  const db = {
    getAllAsync: (sql, params) => send('all', sql, params),
    getFirstAsync: async (sql, params) => (await send('all', sql, params))[0] || null,
    runAsync: (sql, params) => send('run', sql, params),
    execAsync: (sql) => send('exec', sql),
  };
  db.withExclusiveTransactionAsync = async (fn) => {
    await send('run', 'BEGIN');
    try {
      const result = await fn(db);
      await send('run', 'COMMIT');
      return result;
    } catch (error) {
      await send('run', 'ROLLBACK');
      throw error;
    }
  };
  db.withTransactionAsync = (fn) => db.withExclusiveTransactionAsync(() => fn());
  return { db, send, close: () => child.stdin.end() };
}

const remoteTrame = {
  id: '3',
  nom: 'ICPE',
  categories: [{
    id: '10',
    nom: 'Contrôles',
    sousCategories: [{
      id: '20',
      nom: 'Sous',
      criteres: [{ id: '100', nom: 'Contrôle A', avisApplicable: true }],
    }],
  }],
};

function mapRemoteTrameToLocal(remote) {
  const value = String(remote?.nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (value.includes('vmc') || value.includes('ventilation')) return 'vmc';
  if (value.includes('pre') && value.includes('allum')) return 'pre_allumage';
  if (value.includes('chauffer') || value.includes('sous-station') || value.includes('sous station') || value.includes('icpe')) return 'icpe_v1';
  return null;
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-first-visit-'));
  const server = databaseProcess(path.join(dir, 'first-visit.db'));
  try {
    await server.send('migrate', '', [0, 43]);
    await server.db.execAsync(`
      INSERT INTO api_client_links(remote_client_id,nom,autorise,payload_json)
        VALUES('12','Client Alpha',1,'{}');

      INSERT INTO api_site_links(remote_site_id,remote_client_id,nom,payload_json,remote_present)
        VALUES('45','12','Site A','{}',1);
      INSERT INTO api_site_links(remote_site_id,remote_client_id,nom,payload_json,remote_present)
        VALUES('46','12','Site B','{}',1);

      INSERT INTO api_client_site_links(remote_client_id,remote_site_id,remote_present)
        VALUES('12','45',1);
      INSERT INTO api_client_site_links(remote_client_id,remote_site_id,remote_present)
        VALUES('12','46',1);

      INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,reference_json,remote_present)
        VALUES('501','45','Local sans visite','{"local":{"id":"501"},"site":{"id":"45"},"trame":null,"derniereVisite":null}',1);
      INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,reference_json,remote_present)
        VALUES('502','46','Local déjà caché','{"local":{"id":"502"},"site":{"id":"46"},"trame":{"id":"8","nom":"VMC"}}',1);

      INSERT INTO api_preparation_cache(remote_client_id,payload_json)
        VALUES('12','{"marker":"full-client-cache"}');
    `);

    const cache = load('symfonyApiCacheDb.js', {
      openAppDatabase: async () => server.db,
      createId: () => 'unused-id',
    });

    const filteredPayload = {
      client: { id: '12', nom: 'Client Alpha' },
      visites: [{
        local: { id: '501', designation: 'Local sans visite' },
        site: { id: '45', nom: 'Site A' },
        derniereVisite: null,
        trame: remoteTrame,
        remarques: [],
        materiels: [],
        notes: [],
      }],
    };

    await cache.cachePreparation('12', filteredPayload, { partial: true });

    const target = await server.db.getFirstAsync(`
      SELECT remote_trame_id,remote_trame_nom,derniere_visite_id,criteria_count,reference_json,remote_present
      FROM api_local_links WHERE remote_local_id='501'
    `);
    const targetReference = JSON.parse(target.reference_json);
    check(target.remote_trame_id === '3' && target.remote_trame_nom === 'ICPE', 'filtered first-visit preparation stores the selected remote trame');
    check(Number(target.criteria_count) === 1 && targetReference.derniereVisite == null, 'first-visit preparation keeps criteria with no fabricated historical visit');
    check(Number(target.remote_present) === 1, 'target local remains present after filtered preparation');

    const unrelatedSite = await server.db.getFirstAsync(`
      SELECT remote_present FROM api_client_site_links WHERE remote_client_id='12' AND remote_site_id='46'
    `);
    const unrelatedLocal = await server.db.getFirstAsync(`
      SELECT remote_present FROM api_local_links WHERE remote_local_id='502'
    `);
    check(Number(unrelatedSite.remote_present) === 1 && Number(unrelatedLocal.remote_present) === 1,
      'filtered ?trame preparation never hides unrelated cached sites or locals');

    const fullCache = await server.db.getFirstAsync(`
      SELECT payload_json FROM api_preparation_cache WHERE remote_client_id='12'
    `);
    check(JSON.parse(fullCache.payload_json).marker === 'full-client-cache',
      'filtered ?trame preparation never overwrites the complete client preparation cache');

    const binding = load('intranetVisitBindingDb.js', {
      getDb: async () => server.db,
      createId: () => 'unused-binding-id',
      mapRemoteTrameToLocal,
    });
    const resolved = binding.resolveFirstVisitRemoteTrame({ trames: [remoteTrame] }, 'icpe_v1');
    check(resolved.remoteTrameId === '3', 'unique referentiel-structure trame is resolved for first visit');

    assert.throws(
      () => binding.resolveFirstVisitRemoteTrame({ trames: [remoteTrame, { ...remoteTrame, id: '4', nom: 'ICPE Chaufferie' }] }, 'icpe_v1'),
      (error) => error?.code === 'intranet_first_visit_trame_ambiguous'
    );
    checks += 1;
    console.log(`OK ${checks}: ambiguous remote trames are rejected instead of guessed`);

    assert.throws(
      () => binding.resolveFirstVisitRemoteTrame({ trames: [{ id: '8', nom: 'VMC' }] }, 'icpe_v1'),
      (error) => error?.code === 'intranet_first_visit_trame_missing'
    );
    checks += 1;
    console.log(`OK ${checks}: missing compatible remote trame is explicit`);

    check((await server.db.getAllAsync('PRAGMA foreign_key_check')).length === 0,
      'first-visit filtered preparation leaves SQLite foreign keys valid');

    console.log(`\n${checks} first-visit Intranet preparation checks passed.`);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
