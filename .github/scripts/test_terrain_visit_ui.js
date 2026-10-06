/** Terrain UI data: migration, explicit pointage, isolation and trame coverage. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const root = path.resolve(__dirname, '../..');

function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map((m) => m[1]);
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) names.push(...match[1].split(',').map((s) => s.trim()).filter(Boolean));
  const script = source.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/export\s*\{[^}]+\};?/g, '').replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)/g, '');
  return new Function(...Object.keys(dependencies), `${script}\nreturn {${[...new Set(names)].join(',')}};`)(...Object.values(dependencies));
}

function databaseProcess(filename) {
  const child = spawn(process.env.PYTHON || 'python3', [path.join(__dirname, 'photo_sqlite_harness.py'), filename]);
  const pending = new Map(); let seq = 0;
  child.stderr.pipe(process.stderr);
  child.on('error', (error) => { for (const waiter of pending.values()) waiter.reject(error); });
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const response = JSON.parse(line); const waiter = pending.get(response.id); pending.delete(response.id);
    if (response.error) waiter.reject(new Error(response.error)); else waiter.resolve(response.result);
  });
  const send = (method, sql = '', params = []) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, method, sql, params }) + '\n');
  });
  const db = {
    getAllAsync: (sql, params) => send('all', sql, params),
    getFirstAsync: async (sql, params) => (await send('all', sql, params))[0] || null,
    runAsync: (sql, params) => send('run', sql, params), execAsync: (sql) => send('exec', sql),
    withTransactionAsync: async (fn) => {
      await send('run', 'BEGIN');
      try { const result = await fn(); await send('run', 'COMMIT'); return result; }
      catch (error) { await send('run', 'ROLLBACK'); throw error; }
    },
  };
  return { db, send, close: () => new Promise((resolve) => { child.once('exit', resolve); child.stdin.end(); }) };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-terrain-'));
  const filename = path.join(dir, 'terrain.db');
  let server = databaseProcess(filename), seq = 0;
  const createId = () => `terrain-${++seq}`;
  try {
    await server.send('migrate', '', [0,45]);
    await server.db.execAsync(`INSERT INTO clients(id,nom) VALUES('c','Client');
      INSERT INTO sites(id,client_id,nom_site) VALUES('s','c','Site');
      INSERT INTO installations(id,site_id,type_code,nom) VALUES('i','s','chaufferie','Local'),('other','s','chaufferie','Autre local');
      INSERT INTO visites(id,site_id,installation_id,trame_id,date_visite,statut) VALUES('old','s','i','reseau_chaleur_v1','2026-01-01','terminee'),('v','s','i','reseau_chaleur_v1','2026-02-01','en_cours'),('other-v','s','other','reseau_chaleur_v1','2026-01-15','terminee'),('future','s','i','reseau_chaleur_v1','2027-01-01','terminee');
      INSERT INTO equipements(id,installation_id,type_code,designation,marque,modele,statut) VALUES('e','i','Chaudière','Chaudière 1','Marque','Modèle','actif');
      INSERT INTO equipement_trames(equipement_id,trame_id,perimetre) VALUES('e','reseau_chaleur_v1','Primaire');
      INSERT INTO materiel(id,visite_id,equipement_id,categorie,designation,marque,modele,numero_materiel,annee,etat,perimetre) VALUES('m-old','old','e','Chaudière','Chaudière 1','Marque','Modèle','SERIE-1','2014','Bon','Primaire'),('m','v','e','Chaudière','Chaudière 1','Marque','Modèle','SERIE-1','2014',NULL,'Primaire');
      INSERT INTO remarques(id,visite_id,prestation) VALUES('r-old','old','Ancienne réserve'),('r-other','other-v','Autre local'),('r-future','future','Future'),('r-current','v','Actuelle');`);
    await server.send('migrate', '', [45,46]);
    assert.equal((await server.db.getFirstAsync('SELECT confirme_le,ajoute_pendant_visite FROM materiel WHERE id=?',['m'])).confirme_le,null);
    let equipment = load('persistentEquipmentDb.js', { openAppDatabase:async()=>server.db,createId });
    let terrain = load('terrainVisitDb.js', {getDb:async()=>server.db,uuidv4:createId,ajouterMateriel:equipment.ajouterMaterielPersistant,upsertMaterielChamp:equipment.upsertMaterielPersistant,listerMaterielPersistant:equipment.listerMaterielPersistant,equipementCompatible:equipment.equipementCompatible});
    const model = load('terrainVisitModel.js');
    let rows = await terrain.listerEquipementsPointage('v');
    assert.equal(model.etatPointageEquipement(rows[0]),'a-voir');
    await assert.rejects(terrain.confirmerEquipementVisite('other-v','m'),/ne fait pas partie/);
    await terrain.confirmerEquipementVisite('v','m');
    rows=await terrain.listerEquipementsPointage('v');
    assert.equal(model.etatPointageEquipement(rows[0]),'vus');
    assert.equal(rows[0].etat,null,'pointage does not invent an equipment condition');
    assert.equal((await server.db.getFirstAsync('SELECT count(*) n FROM observations_equipement WHERE visite_id=?',['v'])).n,0);
    await server.close();server=databaseProcess(filename);
    equipment = load('persistentEquipmentDb.js', { openAppDatabase:async()=>server.db,createId });
    terrain = load('terrainVisitDb.js', {getDb:async()=>server.db,uuidv4:createId,ajouterMateriel:equipment.ajouterMaterielPersistant,upsertMaterielChamp:equipment.upsertMaterielPersistant,listerMaterielPersistant:equipment.listerMaterielPersistant,equipementCompatible:equipment.equipementCompatible});
    assert.ok((await server.db.getFirstAsync('SELECT confirme_le FROM materiel WHERE id=?',['m'])).confirme_le,'pointage survives reopening');
    const duplicate=await terrain.dupliquerEquipementVisite('v','m');
    const copy=await server.db.getFirstAsync('SELECT * FROM materiel WHERE id=?',[duplicate]);
    assert.notEqual(copy.equipement_id,'e');assert.equal(copy.marque,'Marque');assert.equal(copy.modele,'Modèle');
    assert.equal(copy.numero_materiel,null);assert.equal(copy.annee,null);assert.equal(copy.etat,null);assert.equal(copy.confirme_le,null);
    assert.equal(model.etatPointageEquipement((await terrain.listerEquipementsPointage('v')).find(m=>m.id===duplicate)),'nouveaux');
    await server.db.runAsync('UPDATE materiel SET perimetre=NULL WHERE id=?',[duplicate]);
    await assert.rejects(terrain.confirmerEquipementVisite('v',duplicate),/Primaire ou Secondaire/);
    assert.deepEqual((await terrain.listerAnomaliesPrecedentes('v')).map(r=>r.id),['r-old']);
    assert.equal((await server.db.getFirstAsync('SELECT count(*) n FROM remarques WHERE visite_id=?',['v'])).n,1,'history remains read-only and separate');
    await server.db.execAsync(`INSERT INTO equipements(id,installation_id,type_code,designation) VALUES('e-other','other','Échangeur','Échangeur trouvé'),('e-vmc','other','VMC','VMC');
      INSERT INTO equipement_trames(equipement_id,trame_id) VALUES('e-other','reseau_chaleur_v1'),('e-vmc','vmc');`);
    assert.deepEqual((await terrain.listerEquipementsAutresLocaux('v')).map(e=>e.id),['e-other']);
    await assert.rejects(terrain.rattacherEquipementAuLocal('v','e-vmc'),/incompatible/);
    await terrain.rattacherEquipementAuLocal('v','e-other');
    assert.equal((await server.db.getFirstAsync("SELECT installation_id FROM equipements WHERE id='e-other'")).installation_id,'i');
    assert.ok((await terrain.listerEquipementsPointage('v')).some(e=>e.equipement_id==='e-other'&&!e.confirme_le));
    await server.db.runAsync("INSERT INTO visites(id,site_id,installation_id,trame_id,date_visite,statut) VALUES('next','s','i','reseau_chaleur_v1','2026-03-01','en_cours')");
    assert.ok((await terrain.listerEquipementsPointage('next')).every(m=>!m.confirme_le),'new visit never inherits pointage');
    const point=await terrain.ajouterPointMesureVisite('v','Primaire · départ','°C');
    await terrain.modifierPointMesureVisite('v',point,'valeur','-12,5');
    await terrain.modifierPointMesureVisite('other-v',point,'valeur','999');
    assert.equal((await terrain.listerPointsMesureVisite('v'))[0].valeur,'-12,5','measurement writes remain scoped to their visit');
    assert.deepEqual(await terrain.listerPointsMesureVisite('next'),[],'measurements never become next visit readings');
    await assert.rejects(terrain.modifierPointMesureVisite('v',point,'valeur','12 bar'),/numérique/);
    const data=load('data.js'), XLSX=require('xlsx');
    const rcu=load('reseauChaleurTrame.js',{TRAME_DATA:data.TRAME_DATA,TEMPLATE_RESEAU_CHALEUR_BASE64:'fixture'});
    const registry=load('trameRegistry.js',{...data,...rcu,TEMPLATE_EXCEL_BASE64:'fixture',...load('vmcTrame.js',{XLSX}),...load('preAllumageTrame.js',{XLSX}),...load('trameValidation.js')});
    for(const id of ['icpe_v1','reseau_chaleur_v1','vmc','pre_allumage']){
      const def=registry.obtenirTrame(id),panels=def.ui.panels;
      const expected=Object.entries(panels).filter(([p])=>!['p-equip','p-remarques','p-photos'].includes(p)).flatMap(([p,sections])=>Object.entries(sections).flatMap(([section,fields])=>fields.filter(f=>f?.cle&&!f.hiddenInApp).map(f=>`${model.terrainSectionCode(p,section)}||${f.cle}`)));
      const actual=model.construireEspacesVisite(panels,id,def.ui.labels).flatMap(s=>s.rows.map(r=>r.key));
      assert.deepEqual(actual.slice().sort(),expected.slice().sort(),`${id}: no field removed, storage keys unchanged`);
    }
    const parsed=load('photoModeData.js').extraireChampsPlaque('De Dietrich\nModèle: C330\nN° de série: SN42\n2014\n100 kW');
    assert.ok(model.lignesLecturePlaque(parsed,{modele:'Autre modèle'}).find(r=>r.key==='modele').current==='Autre modèle','OCR review retains existing value for comparison');
    assert.deepEqual(await server.db.getAllAsync('PRAGMA foreign_key_check'),[]);
    console.log('Terrain UI validated: explicit durable pointage, no invented condition, safe duplication/reattachment, history and measurement isolation, all fields in all four trames, OCR comparison.');
  }finally{await server.close();fs.rmSync(dir,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exit(1);});

