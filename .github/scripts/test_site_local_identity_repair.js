/** Executable regression tests for SITE/LOCAL identity repair on real SQLite. */
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
  // Reproduit le comportement Expo SQLite: withTransactionAsync n'expose
  // pas la valeur retournee par le callback.
  db.withTransactionAsync = async (fn) => {
    await db.withExclusiveTransactionAsync(() => fn());
  };
  return { db, send, close: () => child.stdin.end() };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-site-local-identity-'));
  const server = databaseProcess(path.join(dir, 'identity.db'));
  let id = 0;
  try {
    await server.send('migrate', '', [0, 43]);
    await server.db.execAsync(`
      INSERT INTO clients(id,nom) VALUES('client-local','Client Test');
      INSERT INTO sites(id,client_id,nom_site,statut) VALUES('site-merged','client-local','Résidence Le Parc','Actif');

      INSERT INTO installations(id,site_id,type_code,nom,actif)
        VALUES('installation-merged','site-merged','installation_technique','Chaufferie',1);

      INSERT INTO visites(id,site_id,installation_id,date_visite,statut,trame_id,api_remote_local_id)
        VALUES('visit-a','site-merged','installation-merged','2026-08-01','terminee','icpe_v1','500');
      INSERT INTO visites(id,site_id,installation_id,date_visite,statut,trame_id,api_remote_local_id)
        VALUES('visit-b','site-merged','installation-merged','2026-08-02','terminee','icpe_v1','501');
      INSERT INTO visites(id,site_id,installation_id,date_visite,statut,trame_id)
        VALUES('visit-legacy','site-merged',NULL,'2026-07-01','terminee','icpe_v1');

      INSERT INTO equipements(id,installation_id,type_code,designation,statut)
        VALUES('equipment-a','installation-merged','chaudiere','Chaudière A','actif');
      INSERT INTO equipements(id,installation_id,type_code,designation,statut)
        VALUES('equipment-b','installation-merged','chaudiere','Chaudière B','actif');
      INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json)
        VALUES('prov-a','equipement','equipment-a','api_symfony','900','{"remoteLocalId":"500"}');
      INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json)
        VALUES('prov-b','equipement','equipment-b','api_symfony','901','{"remoteLocalId":"501"}');

      INSERT INTO api_client_links(remote_client_id,local_client_id,nom,autorise,payload_json)
        VALUES('10','client-local','Client Test',1,'{}');

      INSERT INTO api_site_links(remote_site_id,remote_client_id,local_site_id,nom,payload_json,remote_present)
        VALUES('100','10','site-merged','Résidence Le Parc','{}',1);
      INSERT INTO api_site_links(remote_site_id,remote_client_id,local_site_id,nom,payload_json,remote_present)
        VALUES('101','10','site-merged','Résidence LE PARC','{}',1);
      INSERT INTO api_client_site_links(remote_client_id,remote_site_id,local_site_id,remote_present)
        VALUES('10','100','site-merged',1);
      INSERT INTO api_client_site_links(remote_client_id,remote_site_id,local_site_id,remote_present)
        VALUES('10','101','site-merged',1);

      INSERT INTO api_local_links(
        remote_local_id,remote_site_id,local_installation_id,designation,reference_json,remote_present
      ) VALUES('500','100','installation-merged','Chaufferie','{"local":{"id":"500"},"site":{"id":"100"}}',1);
      INSERT INTO api_local_links(
        remote_local_id,remote_site_id,local_installation_id,designation,reference_json,remote_present
      ) VALUES('501','101','installation-merged','Chaufferie','{"local":{"id":"501"},"site":{"id":"101"}}',1);
    `);

    const repair = load('intranetIdentityRepairDb.js', {
      createId: () => `repair-id-${++id}`,
    });

    const first = await repair.repairIntranetSiteLocalIdentityOnce(server.db);
    const markerAfterFirst = await server.db.getFirstAsync(
      `SELECT value FROM _meta WHERE key='intranet_identity_repair_build424_v1'`
    );
    check(Boolean(markerAfterFirst?.value), 'startup repair persists a non-NULL _meta marker with Expo transaction semantics');
    const storedSummary = JSON.parse(markerAfterFirst.value);
    check(storedSummary.siteSplits === 1 && storedSummary.localSplits === 1,
      'stored _meta repair summary matches the first repair result');
    check(first.siteSplits === 1, 'two distinct remote sites sharing one local site are split once');
    check(first.localSplits === 1, 'two distinct remote locals sharing one installation are split once');

    const siteLinks = await server.db.getAllAsync(
      `SELECT remote_site_id,local_site_id FROM api_site_links
       WHERE remote_site_id IN ('100','101') ORDER BY remote_site_id`
    );
    check(siteLinks.length === 2 && siteLinks[0].local_site_id !== siteLinks[1].local_site_id,
      'remote_site_id remains the authoritative site identity even for case-only name differences');

    const localLinks = await server.db.getAllAsync(
      `SELECT remote_local_id,remote_site_id,local_installation_id FROM api_local_links
       WHERE remote_local_id IN ('500','501') ORDER BY remote_local_id`
    );
    check(localLinks.length === 2 && localLinks[0].local_installation_id !== localLinks[1].local_installation_id,
      'remote_local_id remains the authoritative local identity even with identical designations');

    for (const link of localLinks) {
      const visit = await server.db.getFirstAsync(
        `SELECT site_id,installation_id FROM visites WHERE api_remote_local_id=?`,
        [link.remote_local_id]
      );
      const site = siteLinks.find((row) => row.remote_site_id === link.remote_site_id);
      check(visit?.site_id === site?.local_site_id && visit?.installation_id === link.local_installation_id,
        `visit for remote local ${link.remote_local_id} follows the repaired site/local pair`);
    }

    const equipmentA = await server.db.getFirstAsync(`SELECT installation_id FROM equipements WHERE id='equipment-a'`);
    const equipmentB = await server.db.getFirstAsync(`SELECT installation_id FROM equipements WHERE id='equipment-b'`);
    const local500 = localLinks.find((row) => row.remote_local_id === '500');
    const local501 = localLinks.find((row) => row.remote_local_id === '501');
    check(
      equipmentA?.installation_id === local500?.local_installation_id
      && equipmentB?.installation_id === local501?.local_installation_id,
      'remote equipment provenance follows the corresponding repaired local'
    );

    const legacy = await server.db.getFirstAsync(`SELECT installation_id FROM visites WHERE id='visit-legacy'`);
    check(Boolean(legacy?.installation_id), 'legacy visit is attached only when its remaining site has one unambiguous active local');

    const afterFirstCounts = {
      sites: Number((await server.db.getFirstAsync(`SELECT COUNT(*) AS n FROM sites`))?.n || 0),
      installations: Number((await server.db.getFirstAsync(`SELECT COUNT(*) AS n FROM installations`))?.n || 0),
    };

    // Reproduit exactement l'etat laisse par le build 429: l'ancienne
    // implementation avait deja COMMIT la reparation, puis plantait en
    // essayant d'ecrire undefined dans _meta.value. La base utilisateur peut
    // donc etre reparee mais sans marqueur. Le build suivant doit reprendre
    // sans dupliquer ni perdre de donnees.
    await server.db.runAsync(
      `DELETE FROM _meta WHERE key='intranet_identity_repair_build424_v1'`
    );
    const recovered = await repair.repairIntranetSiteLocalIdentityOnce(server.db);
    const afterRecoveryCounts = {
      sites: Number((await server.db.getFirstAsync(`SELECT COUNT(*) AS n FROM sites`))?.n || 0),
      installations: Number((await server.db.getFirstAsync(`SELECT COUNT(*) AS n FROM installations`))?.n || 0),
    };
    check(
      afterFirstCounts.sites === afterRecoveryCounts.sites
      && afterFirstCounts.installations === afterRecoveryCounts.installations,
      'recovery from build 429 committed-without-marker state does not duplicate sites or locals'
    );
    check(recovered.siteSplits === 0 && recovered.localSplits === 0,
      'recovery recognizes already repaired SITE/LOCAL identities without replaying splits');

    const recoveredMarker = await server.db.getFirstAsync(
      `SELECT value FROM _meta WHERE key='intranet_identity_repair_build424_v1'`
    );
    check(Boolean(recoveredMarker?.value),
      'recovery from build 429 state persists the missing non-NULL _meta marker');

    const beforeSecond = {
      sites: Number((await server.db.getFirstAsync(`SELECT COUNT(*) AS n FROM sites`))?.n || 0),
      installations: Number((await server.db.getFirstAsync(`SELECT COUNT(*) AS n FROM installations`))?.n || 0),
    };
    const second = await repair.repairIntranetSiteLocalIdentityOnce(server.db);
    const afterSecond = {
      sites: Number((await server.db.getFirstAsync(`SELECT COUNT(*) AS n FROM sites`))?.n || 0),
      installations: Number((await server.db.getFirstAsync(`SELECT COUNT(*) AS n FROM installations`))?.n || 0),
    };
    check(beforeSecond.sites === afterSecond.sites && beforeSecond.installations === afterSecond.installations,
      'repair is idempotent and does not duplicate sites or locals on next startup');
    check(second.siteSplits === recovered.siteSplits && second.localSplits === recovered.localSplits,
      'next startup reads the stored recovery summary instead of repairing again');

    const audit = await server.db.getFirstAsync(
      `SELECT COUNT(*) AS n FROM journal_modifications
       WHERE auteur='METRA identity repair'`
    );
    check(Number(audit?.n || 0) >= 2, 'repair actions are auditable in the existing modification journal');
    check((await server.db.getAllAsync('PRAGMA foreign_key_check')).length === 0,
      'identity repair leaves SQLite foreign keys valid');

    console.log(`\n${checks} SITE/LOCAL identity repair checks passed on real SQLite.`);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
