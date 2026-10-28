/** Regression terrain : vérifiée != levée, sans migration et sans impact Intranet. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'remarkVerificationDb.js'), 'utf8')
  .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g, '');
const sql = new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE remarques(id TEXT PRIMARY KEY,visite_id TEXT NOT NULL,intranet_etat_avancement TEXT,poste TEXT);
CREATE TABLE attributs_libres(id TEXT PRIMARY KEY,entite_type TEXT NOT NULL,entite_id TEXT NOT NULL,
  cle TEXT NOT NULL,valeur TEXT,type_valeur TEXT NOT NULL DEFAULT 'texte',
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),modifie_le TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(entite_type,entite_id,cle));
INSERT INTO remarques(id,visite_id,intranet_etat_avancement,poste) VALUES
('r1','v1','Non réalisé','Observation'),('r2','v2','Non réalisé','Observation'),
('r3','v1','Terminé','Entretien P2');`);
const db = {
  getAllAsync: async (q,p=[]) => sql.prepare(q).all(...p),
  getFirstAsync: async (q,p=[]) => sql.prepare(q).get(...p) || null,
  runAsync: async (q,p=[]) => sql.prepare(q).run(...p),
};
let seq = 0;
const m = new Function('getDb','createId',source + '\nreturn { listerVerificationsRemarques, marquerRemarqueVerifiee };')(
  async () => db, () => 'test-verif-' + ++seq);
async function test() {
  assert.deepEqual(await m.listerVerificationsRemarques('v1'), {});
  const date = await m.marquerRemarqueVerifiee('v1','r1',true);
  assert.match(date, /^20\d{2}-/);
  assert.deepEqual(Object.keys(await m.listerVerificationsRemarques('v1')), ['r1']);
  assert.deepEqual(await m.listerVerificationsRemarques('v2'), {}, 'the other visit has no check');
  await m.marquerRemarqueVerifiee('v1','r1',true);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM attributs_libres WHERE entite_id='r1'").get().n, 1,
    'repeat taps are idempotent');
  assert.equal(sql.prepare("SELECT intranet_etat_avancement FROM remarques WHERE id='r1'").get().intranet_etat_avancement,
    'Non réalisé', 'checking never lifts a reserve');
  await assert.rejects(() => m.marquerRemarqueVerifiee('v1','r2',true), /absente de cette visite/);
  await m.marquerRemarqueVerifiee('v1','r1',false);
  assert.deepEqual(await m.listerVerificationsRemarques('v1'), {});
  assert.equal(sql.prepare("SELECT intranet_etat_avancement FROM remarques WHERE id='r3'").get().intranet_etat_avancement,
    'Terminé', 'historically lifted reserves stay lifted');
  const ui = fs.readFileSync(path.join(root,'OptimizedRemarksPanel.js'),'utf8');
  assert.equal((ui.match(/onToggleLevee=\{confirmerLevee\}/g) || []).length, 2,
    'both reserve list and detail use the same lift confirmation');
  assert.ok(ui.includes('onToggleVerifiee={basculerVerifiee}') &&
    ui.includes('Confirmer la levée de la réserve') &&
    ui.includes("'Observation', 'Entretien P2'"),
    'separate checkbox, explicit lift confirmation, historic observation post');
  console.log('OK: verified versus lifted, local identity, idempotence, legacy posts.');
}
test().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => sql.close());
