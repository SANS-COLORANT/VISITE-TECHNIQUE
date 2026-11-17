/**
 * Real SQLite v51 regression for deleting a site with REMAR CTA/VMC children
 * and queued structure operations. Do not connect to the real Intranet.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
const migrationDir = path.join(root,'database/migrations');
for(const name of fs.readdirSync(migrationDir).filter(x=>/^\d{3}_.*\.js$/.test(x)).sort()) {
  const raw = fs.readFileSync(path.join(migrationDir,name),'utf8');
  const sqlText = raw.match(/sql:\s*`([\s\S]*?)`/);
  if(sqlText) sql.exec(sqlText[1]);
}
const db = {
  getAllAsync: async(query,params=[]) => sql.prepare(query).all(...params),
  getFirstAsync: async(query,params=[]) => sql.prepare(query).get(...params) || null,
  runAsync: async(query,params=[]) => sql.prepare(query).run(...params),
  withTransactionAsync: async callback => {
    sql.exec('BEGIN IMMEDIATE');
    try { const result=await callback();sql.exec('COMMIT');return result; }
    catch(error) { sql.exec('ROLLBACK');throw error; }
  },
};
const source=fs.readFileSync(path.join(root,'entityManagementDb.js'),'utf8')
  .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm,'')
  .replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g,'');
const {supprimerSiteComplet,getResumeSuppressionSite} = new Function(
  'getDb','FileSystem','supprimerCopiePhotoDocuments','supprimerImagePatrimoine',
  source+'\nreturn {supprimerSiteComplet,getResumeSuppressionSite};'
)(async()=>db,{documentDirectory:'file:///app/',deleteAsync:async()=>null},
  async()=>null,async()=>null);
const count=q=>sql.prepare(q).get().n;
(async()=>{
  sql.exec(`
    INSERT INTO clients(id,nom) VALUES('client','Syndic de test');
    INSERT INTO sites(id,client_id,nom_site,statut) VALUES
      ('delete-me','client','Copie supprimable','Actif'),
      ('neighbor','client','Autre site','Actif');
    INSERT INTO installations(id,site_id,type_code,nom) VALUES
      ('local-a','delete-me','chaufferie','Chaufferie A'),
      ('local-b','neighbor','chaufferie','Chaufferie B');
    INSERT INTO equipements(id,installation_id,type_code,designation) VALUES
      ('cta-a','local-a','CTA','CTA soufflage'),
      ('cta-b','local-b','CTA','CTA voisin');
    INSERT INTO reseaux_site(id,installation_id,type_code,nom) VALUES
      ('network-a','local-a','chauffage','Boucle ECS');
    INSERT INTO visites(id,site_id,installation_id,trame_id,date_visite,statut) VALUES
      ('visit-a','delete-me','local-a','remar_v1','2026-11-17','terminee'),
      ('visit-b','neighbor','local-b','remar_v1','2026-11-17','terminee');
    INSERT INTO remar_items(id,installation_id,parent_equipement_id,type_code,nom) VALUES
      ('filter-a','local-a','cta-a','filtre_cta','Filtre F7'),
      ('filter-b','local-b','cta-b','filtre_cta','Filtre G4');
    INSERT INTO remar_item_visits(visite_id,item_id) VALUES
      ('visit-a','filter-a'),('visit-b','filter-b');
    INSERT INTO remar_values(visite_id,owner_type,owner_id,panel_id,section_code,cle,avis) VALUES
      ('visit-a','item','filter-a','p-remar-filtres','Filtration','Etat du filtre','N.S');
    INSERT INTO remar_report_focus(visite_id,famille,equipement_id) VALUES
      ('visit-a','cta','cta-a');
    INSERT INTO materiel(id,visite_id,equipement_id,categorie,designation) VALUES
      ('material-a','visit-a','cta-a','CTA','CTA soufflage');
    INSERT INTO attributs_libres(id,entite_type,entite_id,cle,valeur) VALUES
      ('free-a','remar_item','filter-a','test','oui'),
      ('free-b','equipement','cta-a','test','oui');
    INSERT INTO api_client_links(remote_client_id,local_client_id,nom,payload_json,autorise)
      VALUES('101','client','Syndic de test','{}',1);
    INSERT INTO api_site_links(remote_site_id,remote_client_id,local_site_id,nom,payload_json)
      VALUES('201','101','delete-me','Copie supprimable','{}');
    INSERT INTO api_client_site_links(remote_client_id,remote_site_id,local_site_id)
      VALUES('101','201','delete-me');
    INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,reference_json,local_installation_id)
      VALUES('301','201','Chaufferie A','{}','local-a');
    INSERT INTO api_structure_outbox(operation_id,resource_type,creation_id,remote_client_id,local_site_id,payload_json,payload_bytes,status)
      VALUES('op1','site','550e8400-e29b-41d4-a716-446655440000','101','delete-me','{}',2,'pending');
  `);
  const summary=await getResumeSuppressionSite('delete-me');
  assert.equal(summary.visites,1);
  assert.equal(summary.equipements,1);
  await supprimerSiteComplet('delete-me');
  assert.equal(count("SELECT COUNT(*) n FROM sites WHERE id='delete-me'"),0);
  assert.equal(count("SELECT COUNT(*) n FROM sites WHERE id='neighbor'"),1);
  assert.equal(count("SELECT COUNT(*) n FROM equipements WHERE id='cta-a'"),0);
  assert.equal(count("SELECT COUNT(*) n FROM equipements WHERE id='cta-b'"),1);
  assert.equal(count("SELECT COUNT(*) n FROM remar_items WHERE id='filter-a'"),0);
  assert.equal(count("SELECT COUNT(*) n FROM remar_items WHERE id='filter-b'"),1);
  assert.equal(count("SELECT COUNT(*) n FROM remar_item_visits WHERE visite_id='visit-b'"),1);
  assert.equal(count("SELECT COUNT(*) n FROM api_structure_outbox WHERE local_site_id='delete-me'"),0);
  assert.equal(sql.prepare("SELECT local_site_id,remote_present FROM api_site_links WHERE remote_site_id='201'").get().local_site_id,null);
  assert.equal(sql.prepare("SELECT remote_present FROM api_site_links WHERE remote_site_id='201'").get().remote_present,1,
    'local-only deletion must leave remote site untouched');
  assert.equal(sql.prepare("SELECT local_installation_id FROM api_local_links WHERE remote_local_id='301'").get().local_installation_id,null);
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
  console.log('PASS: real SQLite 51 site deletion with REMAR FK restrictions, structure outbox cancellation, detached remote IDs and preserved neighbor.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>sql.close());
