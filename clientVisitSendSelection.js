/** Only the newest visit per local and per template belongs to the quick-send shortlist.
 * Historical duplicates and older unsent visits must not be bulk-posted as
 * extra Symfony visits behind the technician's back.
 */
export function latestClientVisitsByLocalAndTemplate(rows = []) {
  const sorted=[...rows].sort((a,b)=>
    String(b.date_visite||'').localeCompare(String(a.date_visite||'')) ||
    String(b.modifie_le||'').localeCompare(String(a.modifie_le||'')) ||
    Number(b.local_rowid||0)-Number(a.local_rowid||0));
  const visited=new Set(),result=[];
  for(const row of sorted){
    const site=String(row.site_id||'');
    const local=String(row.installation_id||row.api_remote_local_id||'non_rattache');
    const trame=String(row.trame_id||'icpe_v1');
    const key=JSON.stringify([site,local,trame]);
    if(visited.has(key))continue;
    visited.add(key);result.push(row);
  }
  return result;
}
