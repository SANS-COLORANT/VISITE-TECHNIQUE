// Recover a committed private rollback snapshot before any SQLite connection opens.
// The injected filesystem makes the ordering and failure paths executable in Node tests.
// No customer data, passwords or external paths are written to the journal marker.
export const RESTORE_ROOTS = Object.freeze(['visite-technique/', 'metra-missions/']);
export const RESTORE_MARKER = 'metra-restore-pending-v1.json';
const PREFIX = 'metra-restore-rollback-';
const validId = id => typeof id === 'string' && /^\d{4}-\d{2}-\d{2}T[\d-]+Z$/.test(id);
export function createRestoreJournal(fs, root, databaseName) {
  if (!root || !root.endsWith('/') || !databaseName || /[\\/]/.test(databaseName)) throw new Error('Invalid private restore root');
  const marker = root + RESTORE_MARKER;
  const dbPath = 'database/' + databaseName;
  const liveDb = root + 'SQLite/' + databaseName;
  const info = (path, md5 = false) => fs.getInfoAsync(path, {size:true,md5});
  const exists = async path => Boolean((await info(path)).exists);
  const remove = path => fs.deleteAsync(path,{idempotent:true});
  const safeChild = name => typeof name === 'string' && name.length > 0 && name !== '.' && name !== '..' && !/[\\/\0]/.test(name);
  function snapshotPath(id) {
    if (!validId(id)) throw new Error('Identifiant de récupération invalide.');
    return root + PREFIX + id + '/';
  }
  async function inventory(base, relative, result) {
    const item = await info(base+relative);
    if (!item.exists) throw new Error('Fichier de récupération introuvable.');
    if (item.isDirectory) {
      result[relative] = {directory:true};
      const children = (await fs.readDirectoryAsync(base+relative)).sort();
      for (const child of children) {
        if (!safeChild(child)) throw new Error('Chemin de récupération invalide.');
        const name = relative + (relative.endsWith('/')?'':'/') + child;
        await inventory(base,name,result);
      }
    } else {
      const value = await info(base+relative,true);
      if (!value.exists || value.isDirectory || !Number.isSafeInteger(value.size) || value.size < 0 || !/^[a-f0-9]{32}$/i.test(value.md5 || '')) {
        throw new Error('Impossible de contrôler un fichier de récupération.');
      }
      result[relative] = {size:value.size,md5:value.md5.toLowerCase()};
    }
  }
  async function scanSnapshot(base) {
    const result=Object.create(null);
    await inventory(base,dbPath,result);
    if (result[dbPath].directory || result[dbPath].size < 1024) throw new Error('Copie SQLite de sécurité invalide.');
    for (const dir of RESTORE_ROOTS) {
      await inventory(base,dir,result);
      if (!result[dir].directory) throw new Error('Dossier de sécurité invalide.');
    }
    return result;
  }
  async function scanLive() {
    const result=Object.create(null);
    await inventory(root,'SQLite/'+databaseName,result);
    result[dbPath]=result['SQLite/'+databaseName];
    delete result['SQLite/'+databaseName];
    for (const dir of RESTORE_ROOTS) await inventory(root,dir,result);
    return result;
  }
  function same(a,b) {
    if (!a || !b) return false;
    const keys=Object.keys(a).sort(), other=Object.keys(b).sort();
    return keys.length===other.length && keys.every((k,i)=>k===other[i] &&
      a[k]?.directory===b[k]?.directory && a[k]?.size===b[k]?.size && a[k]?.md5===b[k]?.md5);
  }
  async function readMarker() {
    const entry=JSON.parse(await fs.readAsStringAsync(marker));
    if (entry?.protocol!==1 || !validId(entry.id) || !entry.inventory || typeof entry.inventory!=='object') throw new Error('Journal de restauration invalide : ne pas effacer METRA.');
    return entry;
  }
  async function clearMarkerAndSnapshot(safety) {
    // Delete the marker first, but ONLY after the live data has been verified.
    // If deletion fails, keep the entire immutable safety copy for the next boot.
    await remove(marker);
    if (await exists(marker)) throw new Error('Le journal de récupération est encore actif.');
    await remove(safety).catch(()=>{});
  }
  return {
    snapshotPath,
    async hasPending(){return exists(marker);},
    async arm(id) {
      if (await exists(marker)) throw new Error('Une restauration précédente doit être récupérée.');
      const safety=snapshotPath(id);
      const manifest=await scanSnapshot(safety);
      const temporary=marker+'.tmp-'+id;
      await fs.writeAsStringAsync(temporary,JSON.stringify({protocol:1,id,inventory:manifest}));
      // Same private filesystem. No live data is changed until the marker can be read back.
      await fs.moveAsync({from:temporary,to:marker});
      const entry=await readMarker();
      if(entry.id!==id || !same(entry.inventory,manifest)) throw new Error('Journal de récupération non confirmé.');
    },
    async complete(id) {
      const entry=await readMarker();
      if(entry.id!==id) throw new Error('Journal de restauration inattendu.');
      await clearMarkerAndSnapshot(snapshotPath(id));
    },
    async recover() {
      if (!(await exists(marker))) return false;
      const entry=await readMarker();
      const safety=snapshotPath(entry.id);
      // Validate the original backup BEFORE deleting a single live file.
      const original=await scanSnapshot(safety);
      if (!same(original,entry.inventory)) throw new Error('Copie de sécurité incomplète : ne pas effacer METRA.');
      // Retry-safe: the marker and source remain untouched during each copy.
      for(const suffix of ['-wal','-shm','-journal']) await remove(liveDb+suffix);
      await remove(liveDb);
      await fs.makeDirectoryAsync(root+'SQLite/',{intermediates:true});
      await fs.copyAsync({from:safety+dbPath,to:liveDb});
      for(const dir of RESTORE_ROOTS) {
        await remove(root+dir);
        await fs.copyAsync({from:safety+dir,to:root+dir});
      }
      if(!same(await scanLive(),entry.inventory)) throw new Error('Retour arrière incomplet : copie privée conservée.');
      await clearMarkerAndSnapshot(safety);
      return true;
    }
  };
}
