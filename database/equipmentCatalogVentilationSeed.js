import { createId } from './ids.js';

const VERIFIED_AT = '2026-09-02';
const META_KEY = 'equipment_catalog_ventilation_v2';

async function ensureCategory(db, nom, icone = '🌬️', ordre = 84) {
  let row = await db.getFirstAsync('SELECT id FROM categories_equipement WHERE nom=? COLLATE NOCASE', [nom]);
  const id = row?.id || createId('cat');
  if (!row) await db.runAsync('INSERT INTO categories_equipement(id,nom,icone,ordre) VALUES(?,?,?,?)', [id, nom, icone, ordre]);
  else await db.runAsync('UPDATE categories_equipement SET actif=1,icone=? WHERE id=?', [icone, id]);
  return id;
}

async function ensureBrand(db, nom) {
  let row = await db.getFirstAsync('SELECT id FROM marques_equipement WHERE nom=? COLLATE NOCASE', [nom]);
  const id = row?.id || createId('brand');
  if (!row) await db.runAsync('INSERT INTO marques_equipement(id,nom) VALUES(?,?)', [id, nom]);
  else await db.runAsync('UPDATE marques_equipement SET actif=1 WHERE id=?', [id]);
  return id;
}

async function ensureFamily(db, { category, brand, name, status = 'reference', desc = '', keywords = '' }) {
  const cid = await ensureCategory(db, category, category === 'VMC' ? '🌀' : category === 'CTA' ? '🌬️' : '💨', category === 'CTA' ? 80 : category === 'VMC' ? 81 : 82);
  const bid = await ensureBrand(db, brand);
  let row = await db.getFirstAsync(
    'SELECT id FROM modeles_equipement WHERE categorie_id=? AND marque_id=? AND nom=? COLLATE NOCASE',
    [cid, bid, name]
  );
  const id = row?.id || createId('model');
  const quality = status === 'verified' ? 'verified_range' : status === 'legacy' ? 'legacy_reference' : 'reference_range';
  const description = desc || `${category} ${brand} ${name}. Référence de recherche terrain ; confirmer la variante exacte sur la plaque signalétique ou la documentation constructeur.`;
  const mots = `${category} ${brand} ${name} ${keywords} ${status === 'legacy' ? 'ancien historique obsolete' : 'actuel ventilation air'}`.trim();
  if (!row) {
    await db.runAsync(
      `INSERT INTO modeles_equipement(id,categorie_id,marque_id,nom,caracteristiques,mots_cles,data_quality,verified_at)
       VALUES(?,?,?,?,?,?,?,?)`,
      [id, cid, bid, name, description, mots, quality, status === 'verified' ? VERIFIED_AT : null]
    );
  } else {
    await db.runAsync(
      `UPDATE modeles_equipement SET actif=1,caracteristiques=?,mots_cles=?,data_quality=?,verified_at=COALESCE(verified_at,?) WHERE id=?`,
      [description, mots, quality, status === 'verified' ? VERIFIED_AT : null, id]
    );
  }
  return id;
}

const FAMILIES = [
  ['VMC','Aldes','EasyVEC C4','verified'],['VMC','Aldes','EasyVEC Compact','reference'],['VMC','Aldes','EasyVEC Micro-watt','reference'],['VMC','Aldes','VEC','legacy'],['VMC','Aldes','Bahia Curve','reference'],['VMC','Aldes','Bahia Optima','legacy'],['VMC','Aldes','Dee Fly Cube','reference'],['VMC','Aldes','InspirAIR Home SC','reference'],['VMC','Aldes','InspirAIR Home 240','reference'],['VMC','Aldes','InspirAIR Home 370','reference'],['Ventilateur','Aldes','VC','legacy'],['Ventilateur','Aldes','VMP','legacy'],
  ['VMC','Atlantic','Comète','verified'],['VMC','Atlantic','Copernic V','verified'],['VMC','Atlantic','Hygrocosy BC','reference'],['VMC','Atlantic','Hygrocosy BC Flex','reference'],['VMC','Atlantic','Autocosy','reference'],['VMC','Atlantic','Autocosy IH','reference'],['VMC','Atlantic','Duolix Max','reference'],['VMC','Atlantic','Duolix Max Hygro','reference'],['VMC','Atlantic','Optimocosy HR Plus','reference'],['VMC','Atlantic','VMC collective ancienne gamme','legacy'],
  ['VMC','S&P Unelvent','CACB MV','verified'],['VMC','S&P Unelvent','CACB ECM','verified'],['VMC','S&P Unelvent','CACB ECM ECO','verified'],['VMC','S&P Unelvent','CRCB ECOWATT PM','verified'],['VMC','S&P Unelvent','CRCB ECOWATT PR','verified'],['CTA','S&P Unelvent','CADB-HE','reference'],['Ventilateur','S&P Unelvent','TD-MIXVENT','reference'],['Ventilateur','S&P Unelvent','TD-SILENT','reference'],['Ventilateur','S&P Unelvent','JETLINE','reference'],['Ventilateur','S&P Unelvent','CAB','reference'],['Tourelle','S&P Unelvent','CRHB / CRHT','reference'],['Ventilateur','S&P Unelvent','CHGT','reference'],
  ['VMC','VIM','KMDT','reference'],['VMC','VIM','KMDT ECOWATT','reference'],['VMC','VIM','KVB','reference'],['VMC','VIM','KVB ECOWATT','reference'],['Ventilateur','VIM','KUBAIR','reference'],['Tourelle','VIM','TVD','reference'],['Tourelle','VIM','TVEC','reference'],['VMC','VIM','Caisson C4 ancienne gamme','legacy'],
  ['VMC','France Air','Modulys EXT','reference'],['VMC','France Air','Modulys ECM','reference'],['Ventilateur','France Air','Silensair','reference'],['Ventilateur','France Air','Silensair EC','reference'],['Tourelle','France Air','Defumair','reference'],['CTA','France Air','Power Box','reference'],['CTA','France Air','Centrale double flux compacte','reference'],['VMC','France Air','Caisson collectif ancienne gamme','legacy'],
  ['CTA','Systemair','Geniox','verified'],['CTA','Systemair','Geniox GO','reference'],['CTA','Systemair','Topvex TC','verified'],['CTA','Systemair','Topvex TR','verified'],['CTA','Systemair','Topvex SC','verified'],['CTA','Systemair','Topvex SR','verified'],['CTA','Systemair','Topvex FC','verified'],['CTA','Systemair','Topvex FR','verified'],['CTA','Systemair','Topvex SF','reference'],['CTA','Systemair','Topvex SRHP','reference'],['CTA','Systemair','Topvex TRHP','reference'],['CTA','Systemair','DVCompact','reference'],['VMC','Systemair','SAVE VTR','reference'],['VMC','Systemair','SAVE VSR','reference'],['Ventilateur','Systemair','K EC','reference'],['Ventilateur','Systemair','RVK','reference'],['Ventilateur','Systemair','MUB','reference'],['Tourelle','Systemair','DVG','reference'],
  ['CTA','Swegon','GOLD RX','verified'],['CTA','Swegon','GOLD PX','reference'],['CTA','Swegon','GOLD CX','reference'],['CTA','Swegon','GOLD SD','reference'],['CTA','Swegon','SILVER C RX','reference'],['CTA','Swegon','SILVER C PX','reference'],['CTA','Swegon','SILVER C CX','reference'],['CTA','Swegon','GLOBAL RX','reference'],['CTA','Swegon','GLOBAL PX','reference'],['CTA','Swegon','GLOBAL LP','reference'],['VMC','Swegon','CASA R','reference'],['VMC','Swegon','CASA W','reference'],['CTA','Swegon','COMPACT Air','legacy'],
  ['CTA','FläktGroup','eQ','reference'],['CTA','FläktGroup','eQ Prime','reference'],['CTA','FläktGroup','CAIRplus','reference'],['CTA','FläktGroup','CAIRcompact','reference'],['CTA','FläktGroup','CAIRfricostar','reference'],['CTA','FläktGroup','SEMCO','reference'],['Ventilateur','FläktGroup','JM Aerofoil','reference'],['Ventilateur','FläktGroup','Centrimaster','reference'],['CTA','Fläkt Woods','EUVE / EUVV','legacy'],
  ['CTA','CIAT','ClimaCIAT Airtech','reference'],['CTA','CIAT','ClimaCIAT Airclean','reference'],['CTA','CIAT','ClimaCIAT Airaccess','reference'],['CTA','CIAT','Floway','reference'],['CTA','CIAT','Floway Access','reference'],['CTA','CIAT','Floway Classic','reference'],['CTA','CIAT','DFU','reference'],['CTA','CIAT','Air Compact','legacy'],
  ['CTA','Daikin','D-AHU Professional','verified'],['CTA','Daikin','D-AHU Modular P','verified'],['CTA','Daikin','D-AHU Modular R','reference'],['CTA','Daikin','Compact T','verified'],['CTA','Daikin','Compact R','verified'],['CTA','Daikin','D-AHU Energy','reference'],
  ['CTA','WOLF','KG Top','reference'],['CTA','WOLF','KG Flex','reference'],['CTA','WOLF','CKL evo','reference'],['CTA','WOLF','CRL evo max','reference'],['CTA','WOLF','CRL evo','reference'],['CTA','WOLF','CRL','legacy'],['CTA','WOLF','CFL-WRG','reference'],['CTA','WOLF','CSL','reference'],['CTA','WOLF','KG / KGW ancienne gamme','legacy'],
  ['CTA','TROX','X-CUBE','reference'],['CTA','TROX','X-CUBE compact','reference'],['CTA','TROX','X-CUBE X2','reference'],['Ventilateur','TROX','X-FANS','reference'],['CTA','TROX','TROX ancienne CTA','legacy'],
  ['VMC','Helios','KWL EC','reference'],['VMC','Helios','KWL EC 200','reference'],['VMC','Helios','KWL EC 300','reference'],['VMC','Helios','KWL EC 500','reference'],['CTA','Helios','KWL Yoga','reference'],['CTA','Helios','AIR1 XC','reference'],['CTA','Helios','AIR1 XH','reference'],['CTA','Helios','AIR1 RH','reference'],['Ventilateur','Helios','RR EC','reference'],
  ['VMC','Vortice','VORT NRG','reference'],['VMC','Vortice','VORT HRI','reference'],['VMC','Vortice','VORT HR','reference'],['Ventilateur','Vortice','LINEO','reference'],['Ventilateur','Vortice','LINEO QUIET','reference'],['Ventilateur','Vortice','CA MD','reference'],['Tourelle','Vortice','TRM','reference'],
  ['CTA','Komfovent','VERSO Standard','reference'],['CTA','Komfovent','VERSO Pro 2','reference'],['CTA','Komfovent','VERSO RHP','reference'],['VMC','Komfovent','DOMEKT R','reference'],['VMC','Komfovent','DOMEKT CF','reference'],['CTA','Komfovent','KLASIK','reference'],['CTA','Komfovent','VERSO S','reference'],
  ['CTA','Salda','AmberAir Compact','reference'],['CTA','Salda','AmberAir','reference'],['VMC','Salda','RIS','reference'],['VMC','Salda','RIRS','reference'],['VMC','Salda','Smarty','reference'],['Ventilateur','Salda','VKA','reference'],
  ['VMC','Zehnder','ComfoAir Q350','reference'],['VMC','Zehnder','ComfoAir Q450','reference'],['VMC','Zehnder','ComfoAir Q600','reference'],['VMC','Zehnder','ComfoAir XL','reference'],['VMC','Zehnder','ComfoAir 70','reference'],['VMC','Zehnder','ComfoAir 200','legacy'],['VMC','Zehnder','ComfoAir 350','legacy'],['VMC','Zehnder','ComfoAir 550','legacy'],
  ['VMC','Nilan','Compact P','reference'],['VMC','Nilan','Compact P2','reference'],['VMC','Nilan','Comfort 300','reference'],['VMC','Nilan','Comfort 350','reference'],['VMC','Nilan','Comfort CT300','reference'],['CTA','Nilan','VPL','reference'],['CTA','Nilan','VPR','reference'],
  ['CTA','Rosenberg','SupraBox','reference'],['CTA','Rosenberg','Airbox S40','reference'],['Ventilateur','Rosenberg','UnoBox','reference'],['Ventilateur','Rosenberg','ECFanGrid','reference'],['Ventilateur','Rosenberg','DKH','reference'],['Ventilateur','Rosenberg','ERND','reference'],
  ['Ventilateur','Nicotra Gebhardt','RZR','reference'],['Ventilateur','Nicotra Gebhardt','RZM','reference'],['Ventilateur','Nicotra Gebhardt','RER','reference'],['Ventilateur','Nicotra Gebhardt','RQM','reference'],['Ventilateur','Nicotra Gebhardt','COPRA','reference'],['Ventilateur','Nicotra Gebhardt','Evo','reference'],
  ['CTA','Aircalo','AirMaster','reference'],['CTA','Aircalo','AirMaster C','reference'],['CTA','Aircalo','AirMaster B','reference'],['Ventilateur','Aircalo','Aérotherme / ventilation ancienne gamme','legacy'],
  ['CTA','Carrier','39HQ','reference'],['CTA','Carrier','39CP','reference'],['CTA','Carrier','39CZ','reference'],['CTA','Carrier','39M','legacy'],['CTA','Trane','Climate Changer','reference'],['CTA','Trane','Performance Climate Changer','reference'],['CTA','Trane','M-Series Climate Changer','reference'],['CTA','Lennox','CLEANAIR','reference'],['CTA','Lennox','Air Handling Unit - ancienne gamme','legacy'],
  ['CTA','Schako','NOVENCO / CTA ancienne gamme','legacy'],['Ventilateur','Novenco','NovAx','reference'],['Ventilateur','Novenco','ZerAx','reference'],['CTA','Halton','Halton AHU / air handling family','reference'],
  ['VMC','Aldes','Modèle ancien / plaque à identifier','legacy'],['VMC','Atlantic','Modèle ancien / plaque à identifier','legacy'],['VMC','S&P Unelvent','Modèle ancien / plaque à identifier','legacy'],['VMC','VIM','Modèle ancien / plaque à identifier','legacy'],['VMC','France Air','Modèle ancien / plaque à identifier','legacy'],['CTA','Systemair','Modèle ancien / plaque à identifier','legacy'],['CTA','Swegon','Modèle ancien / plaque à identifier','legacy'],['CTA','FläktGroup','Modèle ancien / plaque à identifier','legacy'],['CTA','CIAT','Modèle ancien / plaque à identifier','legacy'],['CTA','Daikin','Modèle ancien / plaque à identifier','legacy'],['CTA','WOLF','Modèle ancien / plaque à identifier','legacy'],['CTA','TROX','Modèle ancien / plaque à identifier','legacy'],
];

export async function seedEquipmentCatalogVentilation(db) {
  const done = await db.getFirstAsync(`SELECT value FROM _meta WHERE key=?`, [META_KEY]);
  if (done) return;
  for (const [category, brand, name, status] of FAMILIES) {
    await ensureFamily(db, { category, brand, name, status });
  }
  await db.runAsync(
    `INSERT INTO _meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [META_KEY, `${FAMILIES.length} familles VMC/CTA/ventilation - ${VERIFIED_AT}`]
  );
}
