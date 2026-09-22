import { createId } from './database/ids.js';

const META_KEY = 'intranet_identity_repair_build424_v1';
const clean = (value) => String(value ?? '').trim();

function parseJson(value) {
  try { return JSON.parse(value || 'null'); } catch { return null; }
}

async function journal(db, entityType, entityId, action, before, after) {
  await db.runAsync(
    `INSERT INTO journal_modifications(
      id,entite_type,entite_id,action,ancienne_valeur_json,nouvelle_valeur_json,auteur
    ) VALUES(?,?,?,?,?,?,?)`,
    [
      createId(),
      entityType,
      String(entityId || ''),
      action,
      before == null ? null : JSON.stringify(before),
      after == null ? null : JSON.stringify(after),
      'METRA identity repair',
    ]
  );
}

function remoteSiteAddress(row, fallback = null) {
  const line1 = clean(row?.adresse);
  const line2 = [clean(row?.code_postal), clean(row?.ville)].filter(Boolean).join(' ');
  return [line1, line2].filter(Boolean).join('\n') || fallback || null;
}

async function boundVisitCountForSite(db, remoteSiteId) {
  const row = await db.getFirstAsync(
    `SELECT COUNT(*) AS n
     FROM visites v
     JOIN api_local_links l ON l.remote_local_id=v.api_remote_local_id
     WHERE l.remote_site_id=?`,
    [String(remoteSiteId)]
  );
  return Number(row?.n || 0);
}

async function boundVisitCountForLocal(db, remoteLocalId) {
  const row = await db.getFirstAsync(
    `SELECT COUNT(*) AS n FROM visites WHERE api_remote_local_id=?`,
    [String(remoteLocalId)]
  );
  return Number(row?.n || 0);
}

async function localClientForRemoteSite(db, remoteSiteId, fallbackClientId) {
  const rows = await db.getAllAsync(
    `SELECT c.local_client_id
     FROM api_client_site_links cs
     JOIN api_client_links c ON c.remote_client_id=cs.remote_client_id
     WHERE cs.remote_site_id=? AND cs.remote_present=1
       AND c.local_client_id IS NOT NULL
     ORDER BY CASE WHEN c.local_client_id=? THEN 0 ELSE 1 END,cs.synced_at DESC`,
    [String(remoteSiteId), fallbackClientId]
  );
  return rows[0]?.local_client_id || fallbackClientId || null;
}

async function splitMergedSites(db) {
  const groups = await db.getAllAsync(
    `SELECT local_site_id
     FROM api_site_links
     WHERE local_site_id IS NOT NULL AND trim(local_site_id)<>''
     GROUP BY local_site_id
     HAVING COUNT(DISTINCT remote_site_id)>1`
  );
  let split = 0;

  for (const group of groups) {
    const oldSiteId = clean(group.local_site_id);
    const site = await db.getFirstAsync(`SELECT * FROM sites WHERE id=?`, [oldSiteId]);
    if (!site) continue;

    const remotes = await db.getAllAsync(
      `SELECT * FROM api_site_links WHERE local_site_id=? ORDER BY remote_site_id`,
      [oldSiteId]
    );
    for (const row of remotes) {
      row.__visits = await boundVisitCountForSite(db, row.remote_site_id);
      row.__exactName = clean(row.nom) === clean(site.nom_site) ? 1 : 0;
    }
    remotes.sort((a, b) =>
      (b.__visits - a.__visits)
      || (b.__exactName - a.__exactName)
      || String(a.remote_site_id).localeCompare(String(b.remote_site_id))
    );
    const keeper = remotes[0];
    if (!keeper) continue;

    for (const remote of remotes.slice(1)) {
      const remoteSiteId = clean(remote.remote_site_id);
      const clientId = await localClientForRemoteSite(db, remoteSiteId, site.client_id);
      if (!clientId) continue;

      const newSiteId = createId();
      await db.runAsync(
        `INSERT INTO sites(id,client_id,nom_site,adresse,statut)
         VALUES(?,?,?,?,?)`,
        [
          newSiteId,
          clientId,
          clean(remote.nom) || site.nom_site || `Site ${remoteSiteId}`,
          remoteSiteAddress(remote, site.adresse),
          site.statut || 'Actif',
        ]
      );

      await db.runAsync(
        `UPDATE api_site_links SET local_site_id=?,cree_localement=1 WHERE remote_site_id=?`,
        [newSiteId, remoteSiteId]
      );
      await db.runAsync(
        `UPDATE api_client_site_links SET local_site_id=?,cree_localement=1 WHERE remote_site_id=?`,
        [newSiteId, remoteSiteId]
      );

      const uniqueInstallations = await db.getAllAsync(
        `SELECT DISTINCT l.local_installation_id
         FROM api_local_links l
         WHERE l.remote_site_id=? AND l.local_installation_id IS NOT NULL
           AND 1=(SELECT COUNT(*) FROM api_local_links x WHERE x.local_installation_id=l.local_installation_id)`,
        [remoteSiteId]
      );
      for (const item of uniqueInstallations) {
        await db.runAsync(
          `UPDATE installations SET site_id=?,modifie_le=datetime('now') WHERE id=? AND site_id=?`,
          [newSiteId, item.local_installation_id, oldSiteId]
        );
      }

      await db.runAsync(
        `UPDATE visites SET site_id=?,modifie_le=datetime('now')
         WHERE api_remote_local_id IN (
           SELECT remote_local_id FROM api_local_links WHERE remote_site_id=?
         )`,
        [newSiteId, remoteSiteId]
      );

      await journal(db, 'site', oldSiteId, 'split_remote_site_identity', {
        remoteSiteId,
        localSiteId: oldSiteId,
        keeperRemoteSiteId: keeper.remote_site_id,
      }, {
        remoteSiteId,
        localSiteId: newSiteId,
        name: remote.nom || null,
      });
      split += 1;
    }
  }
  return split;
}

async function moveRemoteEquipment(db, oldInstallationId, newInstallationId, remoteLocalId) {
  const rows = await db.getAllAsync(
    `SELECT p.entite_id,p.details_json
     FROM provenances p
     JOIN equipements e ON e.id=p.entite_id
     WHERE p.entite_type='equipement' AND p.origine='api_symfony'
       AND e.installation_id=?`,
    [oldInstallationId]
  );
  let moved = 0;
  for (const row of rows) {
    const details = parseJson(row.details_json);
    if (clean(details?.remoteLocalId) !== clean(remoteLocalId)) continue;
    await db.runAsync(
      `UPDATE equipements SET installation_id=?,modifie_le=datetime('now') WHERE id=?`,
      [newInstallationId, row.entite_id]
    );
    moved += 1;
  }
  return moved;
}

async function ensureInstallationProvenance(db, installationId, remoteLocal) {
  const remoteLocalId = clean(remoteLocal?.remote_local_id);
  if (!remoteLocalId) return;
  const existing = await db.getFirstAsync(
    `SELECT id FROM provenances
     WHERE entite_type='installation' AND entite_id=?
       AND origine='api_symfony' AND reference_externe=?
     LIMIT 1`,
    [installationId, remoteLocalId]
  );
  if (existing?.id) return;
  await db.runAsync(
    `INSERT INTO provenances(id,entite_type,entite_id,origine,reference_externe,details_json)
     VALUES(?,?,?,?,?,?)`,
    [
      createId(),
      'installation',
      installationId,
      'api_symfony',
      remoteLocalId,
      JSON.stringify({
        sourceType: 'local',
        remoteLocalId,
        remoteSiteId: clean(remoteLocal?.remote_site_id) || null,
        designation: remoteLocal?.designation || null,
        repaired: true,
      }),
    ]
  );
}

async function splitMergedLocals(db) {
  const groups = await db.getAllAsync(
    `SELECT local_installation_id
     FROM api_local_links
     WHERE local_installation_id IS NOT NULL AND trim(local_installation_id)<>''
     GROUP BY local_installation_id
     HAVING COUNT(DISTINCT remote_local_id)>1`
  );
  let split = 0;

  for (const group of groups) {
    const oldInstallationId = clean(group.local_installation_id);
    const installation = await db.getFirstAsync(
      `SELECT * FROM installations WHERE id=?`,
      [oldInstallationId]
    );
    if (!installation) continue;

    const locals = await db.getAllAsync(
      `SELECT l.*,s.local_site_id AS target_site_id
       FROM api_local_links l
       LEFT JOIN api_site_links s ON s.remote_site_id=l.remote_site_id
       WHERE l.local_installation_id=?
       ORDER BY l.remote_local_id`,
      [oldInstallationId]
    );
    for (const local of locals) {
      local.__visits = await boundVisitCountForLocal(db, local.remote_local_id);
      local.__sameSite = clean(local.target_site_id) === clean(installation.site_id) ? 1 : 0;
      local.__exactName = clean(local.designation) === clean(installation.nom) ? 1 : 0;
    }
    locals.sort((a, b) =>
      (b.__visits - a.__visits)
      || (b.__sameSite - a.__sameSite)
      || (b.__exactName - a.__exactName)
      || String(a.remote_local_id).localeCompare(String(b.remote_local_id))
    );

    const keeper = locals[0];
    if (!keeper) continue;
    const keeperSiteId = clean(keeper.target_site_id) || clean(installation.site_id);
    if (keeperSiteId && keeperSiteId !== clean(installation.site_id)) {
      await db.runAsync(
        `UPDATE installations SET site_id=?,modifie_le=datetime('now') WHERE id=?`,
        [keeperSiteId, oldInstallationId]
      );
    }
    await db.runAsync(
      `UPDATE visites SET site_id=COALESCE(?,site_id),installation_id=?,modifie_le=datetime('now')
       WHERE api_remote_local_id=?`,
      [keeperSiteId || null, oldInstallationId, String(keeper.remote_local_id)]
    );
    await ensureInstallationProvenance(db, oldInstallationId, keeper);

    for (const local of locals.slice(1)) {
      const targetSiteId = clean(local.target_site_id);
      if (!targetSiteId) continue;
      const newInstallationId = createId();
      await db.runAsync(
        `INSERT INTO installations(id,site_id,type_code,nom,description,actif)
         VALUES(?,?,?,?,?,1)`,
        [
          newInstallationId,
          targetSiteId,
          installation.type_code || 'installation_technique',
          clean(local.designation) || installation.nom || 'Local technique',
          installation.description || 'Local technique Intranet',
        ]
      );
      await db.runAsync(
        `UPDATE api_local_links SET local_installation_id=? WHERE remote_local_id=?`,
        [newInstallationId, String(local.remote_local_id)]
      );
      await db.runAsync(
        `UPDATE visites SET site_id=?,installation_id=?,modifie_le=datetime('now')
         WHERE api_remote_local_id=?`,
        [targetSiteId, newInstallationId, String(local.remote_local_id)]
      );
      const equipmentMoved = await moveRemoteEquipment(
        db,
        oldInstallationId,
        newInstallationId,
        local.remote_local_id
      );
      await ensureInstallationProvenance(db, newInstallationId, local);
      await journal(db, 'installation', oldInstallationId, 'split_remote_local_identity', {
        remoteLocalId: local.remote_local_id,
        localInstallationId: oldInstallationId,
        keeperRemoteLocalId: keeper.remote_local_id,
      }, {
        remoteLocalId: local.remote_local_id,
        localInstallationId: newInstallationId,
        targetSiteId,
        equipmentMoved,
      });
      split += 1;
    }
  }
  return split;
}

async function alignMappedLocalsToSites(db) {
  const rows = await db.getAllAsync(
    `SELECT l.remote_local_id,l.local_installation_id,s.local_site_id,i.site_id
     FROM api_local_links l
     JOIN api_site_links s ON s.remote_site_id=l.remote_site_id
     JOIN installations i ON i.id=l.local_installation_id
     WHERE l.local_installation_id IS NOT NULL AND s.local_site_id IS NOT NULL`
  );
  let aligned = 0;
  for (const row of rows) {
    const shared = await db.getFirstAsync(
      `SELECT COUNT(*) AS n FROM api_local_links WHERE local_installation_id=?`,
      [row.local_installation_id]
    );
    if (Number(shared?.n || 0) !== 1) continue;
    if (clean(row.site_id) !== clean(row.local_site_id)) {
      await db.runAsync(
        `UPDATE installations SET site_id=?,modifie_le=datetime('now') WHERE id=?`,
        [row.local_site_id, row.local_installation_id]
      );
      aligned += 1;
    }
    await db.runAsync(
      `UPDATE visites SET site_id=?,installation_id=?,modifie_le=datetime('now')
       WHERE api_remote_local_id=?`,
      [row.local_site_id, row.local_installation_id, String(row.remote_local_id)]
    );
  }
  return aligned;
}

async function attachUnambiguousLegacyVisits(db) {
  const sites = await db.getAllAsync(
    `SELECT s.id,
            (SELECT COUNT(*) FROM installations i WHERE i.site_id=s.id AND i.actif=1) AS local_count,
            (SELECT i.id FROM installations i WHERE i.site_id=s.id AND i.actif=1 ORDER BY i.cree_le,i.id LIMIT 1) AS only_local_id
     FROM sites s
     WHERE EXISTS(
       SELECT 1 FROM visites v WHERE v.site_id=s.id AND v.installation_id IS NULL
     )`
  );
  let attached = 0;
  for (const site of sites) {
    if (Number(site.local_count || 0) !== 1 || !clean(site.only_local_id)) continue;
    const countRow = await db.getFirstAsync(
      `SELECT COUNT(*) AS n FROM visites WHERE site_id=? AND installation_id IS NULL`,
      [site.id]
    );
    const count = Number(countRow?.n || 0);
    if (!count) continue;
    await db.runAsync(
      `UPDATE visites SET installation_id=?,modifie_le=datetime('now')
       WHERE site_id=? AND installation_id IS NULL`,
      [site.only_local_id, site.id]
    );
    await journal(db, 'site', site.id, 'attach_unambiguous_legacy_visits', null, {
      installationId: site.only_local_id,
      visitCount: count,
    });
    attached += count;
  }
  return attached;
}

export async function repairIntranetSiteLocalIdentityOnce(db) {
  const done = await db.getFirstAsync(`SELECT value FROM _meta WHERE key=?`, [META_KEY]);
  if (done?.value) {
    try { return JSON.parse(done.value); } catch { return { alreadyDone: true }; }
  }

  const summary = await db.withTransactionAsync(async () => {
    const siteSplits = await splitMergedSites(db);
    const localSplits = await splitMergedLocals(db);
    const alignedLocals = await alignMappedLocalsToSites(db);
    const legacyVisitsAttached = await attachUnambiguousLegacyVisits(db);
    return { siteSplits, localSplits, alignedLocals, legacyVisitsAttached };
  });

  await db.runAsync(
    `INSERT OR REPLACE INTO _meta(key,value) VALUES(?,?)`,
    [META_KEY, JSON.stringify(summary)]
  );
  return summary;
}
