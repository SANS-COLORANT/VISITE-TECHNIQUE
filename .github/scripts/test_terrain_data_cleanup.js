/** Real SQLite regression: removing one visit cannot orphan new polymorphic attrs or affect a neighbor. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'entityManagementDb.js'), 'utf8')
  .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g, '');
const { supprimerDonneesVisite } = new Function(
  'getDb', 'FileSystem', 'supprimerCopiePhotoDocuments', 'supprimerImagePatrimoine',
  src + '\nreturn { supprimerDonneesVisite };'
)(async()=>null,{},async()=>null,async()=>null);

const sql = new DatabaseSync(':memory:');
const tables = [
  'photos','remarques','notes','controles_visite','champs_visite',
  'reseaux','compteurs','materiel','mesures','controles',
  'observations_equipement','observations_reseau','releves_compteur',
  'journal_modifications'
];
sql.exec('CREATE TABLE visites(id TEXT PRIMARY KEY);');
for(const t of tables) sql.exec(
  'CREATE TABLE ' + t + '(id TEXT PRIMARY KEY,visite_id TEXT' + (t==='photos'?',uri TEXT':'') + ');');
sql.exec('CREATE TABLE attributs_libres(id TEXT PRIMARY KEY,entite_type TEXT,entite_id TEXT,cle TEXT);');
sql.exec('CREATE TABLE provenances(id TEXT PRIMARY KEY,entite_type TEXT,entite_id TEXT);');
sql.exec("INSERT INTO visites(id) VALUES('v1'),('v2');");
for(const t of ['reseaux','remarques','compteurs']) {
  const one={reseaux:'r1',remarques:'remark1',compteurs:'meter1'}[t];
  const two={reseaux:'r2',remarques:'remark2',compteurs:'meter2'}[t];
  sql.prepare('INSERT INTO '+t+'(id,visite_id) VALUES(?,?)').run(one,'v1');
  sql.prepare('INSERT INTO '+t+'(id,visite_id) VALUES(?,?)').run(two,'v2');
}
sql.prepare('INSERT INTO photos(id,visite_id,uri) VALUES(?,?,?)').run('p1','v1','file:///old-photo.jpg');
sql.prepare('INSERT INTO photos(id,visite_id,uri) VALUES(?,?,?)').run('p2','v2','file:///new-photo.jpg');
let seq=0;
for(const [type,id] of [
  ['reseau','r1'],['remarque','remark1'],['compteur','meter1'],['visite','v1'],
  ['reseau','r2'],['remarque','remark2'],['compteur','meter2'],['visite','v2'],
  ['reseau_site','permanent-reference'],
]) {
  sql.prepare('INSERT INTO attributs_libres(id,entite_type,entite_id,cle) VALUES(?,?,?,?)')
    .run('a'+ ++seq,type,id,'historique');
  sql.prepare('INSERT INTO provenances(id,entite_type,entite_id) VALUES(?,?,?)')
    .run('p'+ seq,type,id);
}
const db = {
  getAllAsync:async(query,params=[])=>sql.prepare(query).all(...params),
  runAsync:async(query,params=[])=>sql.prepare(query).run(...params),
};
(async()=>{
  const deleted = await supprimerDonneesVisite(db,'v1');
  assert.deepEqual(deleted,['file:///old-photo.jpg']);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM visites WHERE id='v1'").get().n,0);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM photos WHERE visite_id='v2'").get().n,1,
    'other-visit photo must not be deleted');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM attributs_libres').get().n,5,
    'four attrs of deleted visit gone, other visit and permanent network retained');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM provenances').get().n,5);
  assert.deepEqual(sql.prepare('SELECT entite_id FROM attributs_libres ORDER BY entite_id')
    .all().map(x=>x.entite_id).sort(),
    ['meter2','permanent-reference','r2','remark2','v2'].sort());
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM remarques WHERE visite_id='v2'").get().n,1);
  const net = fs.readFileSync(path.join(root,'db.js'),'utf8');
  const remark = fs.readFileSync(path.join(root,'remarkDb.js'),'utf8');
  assert.ok(net.includes("DELETE FROM attributs_libres WHERE entite_type='reseau' AND entite_id=?"),
    'single network deletion must clean its own settings');
  assert.ok(remark.includes("DELETE FROM attributs_libres WHERE entite_type='remarque' AND entite_id=?"),
    'single reserve deletion must clean its own verification marker');
  console.log('OK: SQLite cleanup preserves neighboring visits, photos and permanent network references.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sql.close());
