/**
 * Clone the last visit's entered values only for the same installation and
 * the same published METRA template. This is a draft, not a new remote visit.
 *
 * Historical photos and closed reserves are intentionally retained in their
 * original dated visits; copying their files or reopening closed reserves
 * would misrepresent evidence and could delete shared media.
 */
import { DEFAULT_TRAME_ID } from './trameRegistry.js';
import { createId } from './database/ids.js';

const CURRENT_VISIT_FIELDS = new Set([
  'date de visite', 'date de la visite', 'heure de visite',
  'nom du client', 'nom du site', 'nom du local',
  'nom du local / adresse', 'trame utilisee', 'adresse',
]);
function normalizeKey(key) {
  return String(key || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
export function isCurrentVisitMetadata(key) {
  return CURRENT_VISIT_FIELDS.has(normalizeKey(key));
}

export async function copyLatestSameTrameVisit(db, newVisitId) {
  const id = String(newVisitId || '').trim();
  if (!id) throw new Error('Nouvelle visite sans identifiant');
  const visit = await db.getFirstAsync(
    'SELECT id,site_id,installation_id,trame_id,statut,date_visite FROM visites WHERE id=?', [id]);
  if (!visit || visit.statut !== 'en_cours') return { sourceVisitId: null, skipped: true };
  // A Symfony historical visit can be imported *after* the draft row was
  // inserted. Chronology is the dated visit, not SQLite rowid.
  const source = await db.getFirstAsync(
    `SELECT id, date_visite FROM visites
      WHERE id<>? AND site_id=? AND COALESCE(trame_id,?)=?
        AND ((? IS NOT NULL AND installation_id=?) OR (? IS NULL AND installation_id IS NULL))
        AND (date_visite IS NULL OR date_visite<=?)
      ORDER BY COALESCE(date_visite,'') DESC,modifie_le DESC,rowid DESC LIMIT 1`,
    [id, visit.site_id, DEFAULT_TRAME_ID, visit.trame_id || DEFAULT_TRAME_ID,
      visit.installation_id, visit.installation_id, visit.installation_id,
      visit.date_visite]);
  if (!source?.id) return { sourceVisitId: null, copiedFields: 0, copiedControls: 0, copiedDynamic: 0 };

  // Re-copying only on first creation; a repeated call must never overwrite
  // later edits performed by the technician on this new visit.
  const metaKey = `visit_full_copy_done::${id}`;
  const done = await db.getFirstAsync('SELECT value FROM _meta WHERE key=?', [metaKey]);
  if (done?.value === '1') return { sourceVisitId: source.id, alreadyCopied: true };

  // A single SQLite INSERT..SELECT copies every opinion and observation,
  // without a JS/SQLite round trip for each historical record.
  // All writes remain atomic and are complete before opening the visit.
  const metadataKeys = [
    'date de visite', 'date de la visite', 'heure de visite',
    'nom du client', 'nom du site', 'nom du local', 'nom du local / adresse',
    'trame utilisee', 'trame utilisée', 'adresse',
  ];
  const metadataSlots = metadataKeys.map(() => '?').join(',');
  const result = { sourceVisitId: source.id, copiedFields: 0, copiedControls: 0, copiedDynamic: 0 };
  await db.withTransactionAsync(async () => {
    const copiedFields = await db.runAsync(
      `INSERT INTO champs_visite(visite_id,section_code,cle,valeur)
       SELECT ?, c.section_code, c.cle, c.valeur
       FROM champs_visite c
       WHERE c.visite_id=? AND lower(trim(c.cle)) NOT IN (${metadataSlots})
       ON CONFLICT(visite_id,section_code,cle) DO UPDATE
         SET valeur=excluded.valeur`,
      [id,source.id,...metadataKeys]
    );
    result.copiedFields = Number(copiedFields?.changes || 0);

    const copiedControls = await db.runAsync(
      `INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire)
       SELECT ?, c.section_code, c.cle, c.avis, c.commentaire
       FROM controles_visite c WHERE c.visite_id=?
       ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET
         avis=excluded.avis,commentaire=excluded.commentaire`,
      [id,source.id]
    );
    result.copiedControls = Number(copiedControls?.changes || 0);

    // Owner IDs are shared only within the same physical installation.
    const copiedDynamic = await db.runAsync(
      `INSERT INTO remar_values(
          visite_id,owner_type,owner_id,panel_id,section_code,cle,
          valeur,avis,commentaire,source_visite_id,confirme_le)
       SELECT ?,r.owner_type,r.owner_id,r.panel_id,r.section_code,r.cle,
         r.valeur,r.avis,r.commentaire,?,r.confirme_le
       FROM remar_values r
       WHERE r.visite_id=?
         AND (
           (r.owner_type='equipement' AND EXISTS(
             SELECT 1 FROM equipements e
             WHERE e.id=r.owner_id AND e.installation_id=?))
           OR (r.owner_type='item' AND EXISTS(
             SELECT 1 FROM remar_items i
             WHERE i.id=r.owner_id AND i.installation_id=?))
         )
       ON CONFLICT(visite_id,owner_type,owner_id,panel_id,section_code,cle)
       DO UPDATE SET
         valeur=excluded.valeur,avis=excluded.avis,
         commentaire=excluded.commentaire,
         source_visite_id=excluded.source_visite_id,
         confirme_le=excluded.confirme_le`,
      [id,`copie_locale:${source.id}`,source.id,visit.installation_id,visit.installation_id]
    );
    result.copiedDynamic = Number(copiedDynamic?.changes || 0);

    await db.runAsync(
      `INSERT INTO notes(visite_id,contenu)
       SELECT ?,n.contenu FROM notes n
       WHERE n.visite_id=? AND trim(COALESCE(n.contenu,''))<>''
       ON CONFLICT(visite_id) DO UPDATE SET contenu=excluded.contenu`,
      [id,source.id]
    );
    await db.runAsync(
      `INSERT INTO _meta(key,value) VALUES(?,'1')
       ON CONFLICT(key) DO UPDATE SET value='1'`,[metaKey]);
  });
  return result;
}


/**
 * Pre-allumage generates new local/rubrique IDs for each visit.
 * A raw copy of controles_visite would remain stored under old section_codes
 * and be invisible. Re-key by unique local business name/type and rubrique
 * identity after the new visit's modular structure has been created.
 * Also restores previously custom-added rubriques/champs (not only defaults).
 */
export async function restorePreAllumageSnapshot(db, sourceVisitId, visitId) {
  if (!sourceVisitId || !visitId || String(sourceVisitId)===String(visitId))
    return {fields:0,controls:0,sections:0,skipped:true};
  const marker=`visit_pa_snapshot_done::${visitId}`;
  const done=await db.getFirstAsync('SELECT value FROM _meta WHERE key=?',[marker]);
  if(done?.value==='1')return {fields:0,controls:0,sections:0,alreadyCopied:true};
  const oldLocals=await db.getAllAsync(
    'SELECT id,nom,type_code FROM pre_allumage_locaux WHERE visite_id=?',[sourceVisitId]);
  const newLocals=await db.getAllAsync(
    'SELECT id,nom,type_code FROM pre_allumage_locaux WHERE visite_id=?',[visitId]);
  const identity=x=>[normalizeKey(x.nom),String(x.type_code||'')].join('||');
  const matches=new Map();
  for(const old of oldLocals){
    const candidates=newLocals.filter(n=>identity(n)===identity(old));
    if(candidates.length===1) matches.set(String(old.id),String(candidates[0].id));
  }
  const oldSections=await db.getAllAsync(
    'SELECT * FROM pre_allumage_rubriques WHERE visite_id=?',[sourceVisitId]);
  const targetSections=await db.getAllAsync(
    'SELECT * FROM pre_allumage_rubriques WHERE visite_id=?',[visitId]);
  const oldFields=await db.getAllAsync(
    `SELECT c.*,r.section_code AS section_code FROM pre_allumage_champs c
      JOIN pre_allumage_rubriques r ON r.id=c.rubrique_id WHERE r.visite_id=?`,[sourceVisitId]);
  const targetFields=await db.getAllAsync(
    `SELECT c.*,r.section_code AS section_code FROM pre_allumage_champs c
      JOIN pre_allumage_rubriques r ON r.id=c.rubrique_id WHERE r.visite_id=?`,[visitId]);
  const sourceValues=await db.getAllAsync(
    'SELECT section_code,cle,valeur FROM champs_visite WHERE visite_id=?',[sourceVisitId]);
  const sourceControls=await db.getAllAsync(
    'SELECT section_code,cle,avis,commentaire FROM controles_visite WHERE visite_id=?',[sourceVisitId]);
  let fields=0,controls=0,sections=0,unmatched=0;
  await db.withTransactionAsync(async()=>{
    for(const old of oldSections){
      if(!old.local_id)continue; // Official generic/global section codes already copied.
      const newLocalId=matches.get(String(old.local_id));
      if(!newLocalId){unmatched++;continue;} // Never send old local's data to another local.
      const oldCode=String(old.section_code||'');
      const prefix=`pa.local.${old.local_id}.`;
      const newCode=oldCode.startsWith(prefix)
        ?`pa.local.${newLocalId}.${oldCode.slice(prefix.length)}`
        :`pa.local.${newLocalId}.historique.${old.id}`;
      let target=targetSections.find(t=>t.local_id===newLocalId&&t.section_code===newCode);
      if(!target){
        let candidates=targetSections.filter(t=>t.local_id===newLocalId &&
          t.panel_id===old.panel_id && normalizeKey(t.nom)===normalizeKey(old.nom));
        if(candidates.length>1)candidates=candidates.filter(t=>Number(t.ordre)===Number(old.ordre));
        if(candidates.length===1)target=candidates[0];
      }
      if(!target){
        const id=createId('pa-rubrique');
        await db.runAsync(
          `INSERT INTO pre_allumage_rubriques(id,visite_id,local_id,panel_id,
             section_code,nom,ordre,supprimable) VALUES(?,?,?,?,?,?,?,?)`,
          [id,visitId,newLocalId,old.panel_id,newCode,old.nom,old.ordre,old.supprimable]);
        target={...old,id,visite_id:visitId,local_id:newLocalId,section_code:newCode};
        targetSections.push(target);
        sections++;
      }
      const known=targetFields.filter(f=>f.rubrique_id===target.id);
      const fieldMap=new Map();
      for(const sourceField of oldFields.filter(f=>f.rubrique_id===old.id)){
        let f=known.find(f=>f.cle_stockage===sourceField.cle_stockage);
        if(!f){
          const equivalents=known.filter(f=>f.type_code===sourceField.type_code &&
            normalizeKey(f.libelle)===normalizeKey(sourceField.libelle));
          if(equivalents.length===1)f=equivalents[0];
        }
        if(!f){
          const id=createId('pa-champ');
          await db.runAsync(
            `INSERT INTO pre_allumage_champs(id,rubrique_id,cle_stockage,libelle,
               type_code,ordre,options_json) VALUES(?,?,?,?,?,?,?)`,
            [id,target.id,sourceField.cle_stockage,sourceField.libelle,
              sourceField.type_code,sourceField.ordre,sourceField.options_json]);
          f={...sourceField,id,rubrique_id:target.id};
          known.push(f); targetFields.push(f);
        }
        fieldMap.set(String(sourceField.cle_stockage),String(f.cle_stockage));
      }
      for(const row of sourceValues.filter(r=>r.section_code===oldCode)){
        const key=fieldMap.get(String(row.cle));
        if(!key){unmatched++;continue;}
        await db.runAsync(
          `INSERT INTO champs_visite(visite_id,section_code,cle,valeur)
           VALUES(?,?,?,?) ON CONFLICT(visite_id,section_code,cle) DO UPDATE
           SET valeur=excluded.valeur
           WHERE champs_visite.valeur IS NULL OR trim(champs_visite.valeur)=''`,
          [visitId,target.section_code,key,row.valeur??null]); fields++;
      }
      for(const row of sourceControls.filter(r=>r.section_code===oldCode)){
        const key=fieldMap.get(String(row.cle));
        if(!key){unmatched++;continue;}
        await db.runAsync(
          `INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire)
           VALUES(?,?,?,?,?) ON CONFLICT(visite_id,section_code,cle) DO UPDATE
           SET avis=excluded.avis,commentaire=excluded.commentaire
           WHERE (controles_visite.avis IS NULL OR trim(controles_visite.avis)='')
             AND (controles_visite.commentaire IS NULL OR trim(controles_visite.commentaire)='')`,
          [visitId,target.section_code,key,row.avis??null,row.commentaire??null]); controls++;
      }
    }
    await db.runAsync(
      `INSERT INTO _meta(key,value) VALUES(?,'1') ON CONFLICT(key)
       DO UPDATE SET value='1'`,[marker]);
  });
  return {fields,controls,sections,unmatched};
}
