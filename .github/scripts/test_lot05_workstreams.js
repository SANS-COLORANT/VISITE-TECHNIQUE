// LOT05: isolated executable regressions for F02/F03/F09 and code contracts for F04/F05/F08/F10.
// No real application database, React renderer, or Android environment is used.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

class BoundedLruMap extends Map {
  constructor(limit) { super(); this.limit = limit; }
  get(k) {
    if (!super.has(k)) return undefined;
    const v = super.get(k);
    super.delete(k); super.set(k, v);
    return v;
  }
  set(k, v) {
    super.delete(k); super.set(k, v);
    while (this.size > this.limit) super.delete(this.keys().next().value);
    return this;
  }
}
function load(file, deps, symbols) {
  const body = read(file)
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g, '');
  return new Function(...Object.keys(deps), body + '\nreturn {' + symbols.join(',') + '};')(...Object.values(deps));
}

test('F02: completed prewarm is reused; invalidation and staleness force recheck', async () => {
  let reads = 0;
  const nav = load('navigationPrewarm.js', {
    BoundedLruMap,
    listerSitesClient: async () => { reads++; return [{ id: 's1' }]; },
    listerAppartenancesClient: async () => [],
    getDb: async () => null, getSiteLocalisation: async () => null,
    listerVisitesLocal: async () => [], listerVisitesSite: async () => [],
  }, ['prewarmClientSites', 'peekClientSites', 'needsPrewarmRefresh', 'invalidateClientSites']);
  const first = await nav.prewarmClientSites('client');
  const second = await nav.prewarmClientSites('client');
  assert.equal(reads, 1);
  assert.equal(second, first);
  assert.equal(nav.needsPrewarmRefresh(first, first.loadedAt + 100), false);
  assert.equal(nav.needsPrewarmRefresh(first, first.loadedAt + 3000), true);
  nav.invalidateClientSites('client');
  await nav.prewarmClientSites('client');
  assert.equal(reads, 2);
});

test('F03: site prewarm exposes remote-only placeholder and never mutates', async () => {
  let writes = 0;
  const db = {
    getAllAsync: async (sql) => {
      if (sql.includes('AND NOT EXISTS (SELECT 1 FROM installations i')) return [{
        remote_local_id: 'r77', remote_site_id: 'remoteSite',
        designation: 'Chaufferie Intranet', remote_trame_id: '16',
        remote_trame_nom: 'REMAR', remote_client_id: 'clientRemote',
      }];
      if (sql.includes('FROM installations i')) return [{ installation_id: 'installed', nom: 'SST A' }];
      if (sql.includes('FROM api_local_links l')) return [{
        remote_local_id: 'r77', remote_site_id: 'remoteSite',
        designation: 'Chaufferie Intranet', remote_trame_id: '16',
        remote_trame_nom: 'REMAR', remote_client_id: 'clientRemote',
      }];
      throw Error('Unexpected query: ' + sql);
    },
    getFirstAsync: async () => ({ n: 2 }),
    runAsync: async () => { writes++; throw Error('Unexpected mutation'); },
  };
  const nav = load('navigationPrewarm.js', {
    BoundedLruMap, getDb: async () => db,
    listerSitesClient: async () => [], listerAppartenancesClient: async () => [],
    listerVisitesLocal: async () => [], listerVisitesSite: async () => [],
    getSiteLocalisation: async () => null,
  }, ['prewarmSiteLocals']);
  const bundle = await nav.prewarmSiteLocals('localSite');
  assert.equal(bundle.rows.length, 2);
  const pending = bundle.rows.find((r) => r.remote_local_id === 'r77');
  assert.equal(pending.installation_id, 'remote:r77');
  assert.equal(pending.pendingMaterialization, true);
  assert.equal(bundle.legacyCount, 2);
  assert.equal(writes, 0);
  const screen = read('SiteLocalsScreen.js');
  assert.match(screen, /if \(!local\.pendingMaterialization\)/);
  assert.match(screen, /materializeCachedLocalForSite\(siteId, local\.remote_local_id\)/);
  assert.match(screen, /if \(!item\.pendingMaterialization\) prewarmLocalVisits/);
});

test('F04/F05: PA preparation and restored local stay stable across loading', () => {
  const wrapper = read('PreAllumageInstallationPanelBusiness.js');
  const editor = read('PreAllumageInstallationPanelV3.js');
  assert.match(wrapper, /await initialiserPreAllumageModulaire\(props\.visiteId\)/);
  assert.match(wrapper, /await assurerStructureSitePreAllumage\(props\.visiteId\)/);
  assert.match(wrapper, /await preparerStructurePreAllumage\(props\.visiteId\)/);
  assert.doesNotMatch(wrapper, /await chargerPreAllumageModulaire\(props\.visiteId\)/);
  const firstPrepare = wrapper.indexOf('await preparerStructurePreAllumage(props.visiteId)');
  const siteBootstrap = wrapper.indexOf('await assurerStructureSitePreAllumage(props.visiteId)');
  const finalPrepare = wrapper.lastIndexOf('await preparerStructurePreAllumage(props.visiteId)');
  assert.ok(0 <= firstPrepare && firstPrepare < siteBootstrap && siteBootstrap < finalPrepare,
    'PA legacy mapping must run before site bootstrap and be reconciled afterwards');
  assert.match(editor, /await normaliserLocauxPreAllumage\(visiteId\)/);
  assert.match(editor, /if \(!model \|\| !uiHydrated\) return/);
  assert.match(editor, /if \(!uiHydrated \|\| !model \|\| \(locals\.length/);
  const visit = read('VisiteScreen.js');
  assert.match(visit, /trame\.id === 'vmc' && !vmcConfigReady/);
  assert.match(visit, /navigationTouchedRef\.current/);
});

test('F09: shared progression/status reuses two SQLite row reads', async () => {
  const trame = { id: 'icpe_v1', ui: { panels: { 'p-conf': { General: [
    { type: 'champ', cle: 'Temperature' }, { type: 'controle', cle: 'Avis' },
  ] } } } };
  const normaliserSectionCode = (panel, section) => panel.replace('p-', '') + '.' + section.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const visite = { progression_pct: 0, trame_id: 'icpe_v1' };
  let allReads = 0, writes = 0;
  const db = {
    getAllAsync: async (sql) => {
      allReads++;
      return sql.includes('champs_visite')
        ? [{ section_code: 'conf.general', cle: 'Temperature', valeur: '60' }]
        : [{ section_code: 'conf.general', cle: 'Avis', avis: 'N.S' }];
    },
    getFirstAsync: async () => visite,
    runAsync: async (_sql, vals) => { writes++; visite.progression_pct = vals[0]; },
  };
  const getDb = async () => db;
  const obtenirTrame = () => trame;
  const status = load('visitTabStatusDb.js', {
    getDb, obtenirTrame, normaliserSectionCode,
    DEFAULT_TRAME_ID: 'icpe_v1', remarFamilleEquipement: () => null,
  }, ['calculerEtatOnglets']);
  const progress = load('visitProgressDb.js', {
    obtenirTrame, normaliserSectionCode, DEFAULT_TRAME_ID: 'icpe_v1',
    calculerEtatOnglets: status.calculerEtatOnglets,
  }, ['recalculerProgressionVisite']);
  const result = await progress.recalculerProgressionVisite(db, 'v', { withStatus: true });
  assert.equal(result.pct, 100);
  assert.equal(result.etat.tabs['p-conf'].done, 2);
  assert.equal(result.etat.tabs['p-conf'].ns, 1);
  assert.equal(allReads, 2);
  assert.equal(writes, 1);
  const oldApi = await progress.recalculerProgressionVisite(db, 'v');
  assert.equal(oldApi, 100);
});

test('F08: search keeps exact panel/section/field identity and opens correct row', () => {
  const search = read('VisitSearchSheet.js');
  const visit = read('VisiteScreen.js');
  const panel = read('TrameGenericPanel.js');
  assert.match(search, /onOpen\?\.\(\{ pid: item\.pid, section: item\.section, fieldKey:/);
  assert.match(visit, /setSearchTarget\(\{ \.\.\.item, nonce:/);
  assert.match(visit, /searchTarget=\{searchTarget\?\.pid === panelId/);
  assert.match(panel, /open\(\[target\.sectionCode\]\)/);
  assert.match(panel, /scrollToLocation\(\{ sectionIndex, itemIndex,/);
});

test('F10: large meter rows are virtualized and REMAR uses one vertical list', () => {
  const meters = read('OptimizedRelevesPanel.js');
  const networks = read('OptimizedRegulationPanel.js');
  const remar = read('RemarDynamicPanel.js');
  const durable = read('durableAutosave.js');
  assert.match(meters, /compteurs\.length >= 20/);
  assert.match(meters, /virtualiserCompteurs && compteursOuverts/);
  assert.match(meters, /if \(item\.compteur\) return/);
  assert.match(meters, /ListFooterComponent=\{listFooter\}/);
  assert.match(networks, /if \(embedded && !listFooter\)/);
  assert.match(remar, /networksOnly\s+listFooter=/);
  assert.match(remar, /metersOnly remarMinimal\s+listFooter=/);
  assert.match(durable, /if \(valeurRef\.current !== persisteeRef\.current\)/);
});
