from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: marker not found')
    return text.replace(old, new, 1)


p = Path('symfonyApiCacheDb.js')
s = p.read_text(encoding='utf-8')

# CLIENT.logo_client existe côté serveur. On conserve le chemin distant dans le
# cache, sans le confondre avec image_uri qui reste la photo offline choisie dans METRA.
old = """        `INSERT INTO api_client_links(remote_client_id,local_client_id,nom,categorie,code_everwin,adresse_postale,ville,agence_id,agence_libelle,autorise,payload_json,synced_at)
         VALUES(?,?,?,?,?,?,?,?,?,1,?,datetime('now'))
         ON CONFLICT(remote_client_id) DO UPDATE SET nom=excluded.nom,categorie=excluded.categorie,code_everwin=excluded.code_everwin,
           adresse_postale=excluded.adresse_postale,ville=excluded.ville,agence_id=excluded.agence_id,agence_libelle=excluded.agence_libelle,
           autorise=1,payload_json=excluded.payload_json,synced_at=datetime('now')`,
        [id, null, clean(client?.nom) || `Client ${id}`, client?.categorie ?? null, client?.code_everwin ?? null,
          client?.adresse_postale ?? null, client?.ville ?? null, agence?.id != null ? clean(agence.id) : null,
          agence?.libelle ?? null, json(client)]
"""
new = """        `INSERT INTO api_client_links(remote_client_id,local_client_id,nom,categorie,code_everwin,adresse_postale,ville,agence_id,agence_libelle,logo_client,autorise,payload_json,synced_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,1,?,datetime('now'))
         ON CONFLICT(remote_client_id) DO UPDATE SET nom=excluded.nom,categorie=excluded.categorie,code_everwin=excluded.code_everwin,
           adresse_postale=excluded.adresse_postale,ville=excluded.ville,agence_id=excluded.agence_id,agence_libelle=excluded.agence_libelle,
           logo_client=excluded.logo_client,autorise=1,payload_json=excluded.payload_json,synced_at=datetime('now')`,
        [id, null, clean(client?.nom) || `Client ${id}`, client?.categorie ?? null, client?.code_everwin ?? null,
          client?.adresse_postale ?? null, client?.ville ?? null, agence?.id != null ? clean(agence.id) : null,
          agence?.libelle ?? null, client?.logo_client ?? client?.logoClient ?? null, json(client)]
"""
s = replace_once(s, old, new, 'cache server client logo path')

# SITE contient réellement adresse/code postal/ville + métadonnées patrimoine.
old = """      await database.runAsync(
        `INSERT INTO api_site_links(remote_site_id,remote_client_id,nom,remote_present,payload_json,synced_at) VALUES(?,?,?,?,?,datetime('now'))
         ON CONFLICT(remote_site_id) DO UPDATE SET nom=excluded.nom,remote_present=1,payload_json=excluded.payload_json,synced_at=datetime('now')`,
        [siteId, clientId, clean(visite?.site?.nom) || `Site ${siteId}`, 1, json(visite?.site)]
      );
"""
new = """      await database.runAsync(
        `INSERT INTO api_site_links(
           remote_site_id,remote_client_id,nom,remote_present,payload_json,
           site_principal,adresse,code_postal,ville,code_exploitant,surface_batiment,date_batiment,nombre_logements,
           date_ajout,date_supression,code,energie,type_batiment,type_marche,service,agence,synced_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
         ON CONFLICT(remote_site_id) DO UPDATE SET
           nom=excluded.nom,remote_present=1,payload_json=excluded.payload_json,
           site_principal=excluded.site_principal,adresse=excluded.adresse,code_postal=excluded.code_postal,ville=excluded.ville,
           code_exploitant=excluded.code_exploitant,surface_batiment=excluded.surface_batiment,date_batiment=excluded.date_batiment,
           nombre_logements=excluded.nombre_logements,date_ajout=excluded.date_ajout,date_supression=excluded.date_supression,
           code=excluded.code,energie=excluded.energie,type_batiment=excluded.type_batiment,type_marche=excluded.type_marche,
           service=excluded.service,agence=excluded.agence,synced_at=datetime('now')`,
        [siteId, clientId, clean(visite?.site?.nom) || `Site ${siteId}`, 1, json(visite?.site),
          visite?.site?.sitePrincipal ?? visite?.site?.site_principal ?? null,
          visite?.site?.adresse ?? null,
          visite?.site?.codePostal ?? visite?.site?.code_postal ?? null,
          visite?.site?.ville ?? null,
          visite?.site?.codeExploitant ?? visite?.site?.code_exploitant ?? null,
          Number.isFinite(Number(visite?.site?.surfaceBatiment ?? visite?.site?.surface_batiment)) ? Number(visite?.site?.surfaceBatiment ?? visite?.site?.surface_batiment) : null,
          visite?.site?.dateBatiment ?? visite?.site?.date_batiment ?? null,
          visite?.site?.nombreLogements ?? visite?.site?.nombre_logements ?? null,
          visite?.site?.dateAjout ?? visite?.site?.date_ajout ?? null,
          visite?.site?.dateSupression ?? visite?.site?.date_supression ?? null,
          visite?.site?.code ?? null,
          visite?.site?.energie ?? null,
          visite?.site?.typeBatiment ?? visite?.site?.type_batiment ?? null,
          visite?.site?.typeMarche ?? visite?.site?.type_marche ?? null,
          visite?.site?.service ?? null,
          visite?.site?.agence ?? null]
      );
"""
s = replace_once(s, old, new, 'cache server site metadata')

# LOCAL porte un ordre métier, un type, une situation et une périodicité. L'ordre
# serveur devient l'ordre de navigation offline au lieu d'un tri alphabétique.
old = """      await database.runAsync(
        `INSERT INTO api_local_links(remote_local_id,remote_site_id,designation,remote_trame_id,remote_trame_nom,derniere_visite_id,derniere_visite_date,derniere_visite_statut,reference_json,remote_present,criteria_count,historical_criteria_count,remark_count,material_count,synced_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
         ON CONFLICT(remote_local_id) DO UPDATE SET remote_site_id=excluded.remote_site_id,designation=excluded.designation,
           remote_trame_id=excluded.remote_trame_id,remote_trame_nom=excluded.remote_trame_nom,derniere_visite_id=excluded.derniere_visite_id,
           derniere_visite_date=excluded.derniere_visite_date,derniere_visite_statut=excluded.derniere_visite_statut,reference_json=excluded.reference_json,
           remote_present=1,criteria_count=excluded.criteria_count,historical_criteria_count=excluded.historical_criteria_count,
           remark_count=excluded.remark_count,material_count=excluded.material_count,synced_at=datetime('now')`,
        [localId, siteId, visite?.local?.designation ?? null, visite?.trame?.id ?? null,
          visite?.trame?.nom ?? null, visite?.derniereVisite?.id ?? null,
          visite?.derniereVisite?.date ?? null, visite?.derniereVisite?.statut ?? null, json(visite), 1,
          Number(meta.criteriaCount || 0), Number(meta.historicalCriteriaCount || 0), Number(meta.remarkCount || 0), Number(meta.materialCount || 0)]
      );
"""
new = """      await database.runAsync(
        `INSERT INTO api_local_links(
           remote_local_id,remote_site_id,designation,remote_trame_id,remote_trame_nom,derniere_visite_id,derniere_visite_date,
           derniere_visite_statut,reference_json,remote_present,criteria_count,historical_criteria_count,remark_count,material_count,
           type_local,situation,periodicite_visite,prochaine_visite,visite_planifiee,ordre,remote_type_trame_id,synced_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
         ON CONFLICT(remote_local_id) DO UPDATE SET remote_site_id=excluded.remote_site_id,designation=excluded.designation,
           remote_trame_id=excluded.remote_trame_id,remote_trame_nom=excluded.remote_trame_nom,derniere_visite_id=excluded.derniere_visite_id,
           derniere_visite_date=excluded.derniere_visite_date,derniere_visite_statut=excluded.derniere_visite_statut,reference_json=excluded.reference_json,
           remote_present=1,criteria_count=excluded.criteria_count,historical_criteria_count=excluded.historical_criteria_count,
           remark_count=excluded.remark_count,material_count=excluded.material_count,type_local=excluded.type_local,
           situation=excluded.situation,periodicite_visite=excluded.periodicite_visite,prochaine_visite=excluded.prochaine_visite,
           visite_planifiee=excluded.visite_planifiee,ordre=excluded.ordre,remote_type_trame_id=excluded.remote_type_trame_id,
           synced_at=datetime('now')`,
        [localId, siteId, visite?.local?.designation ?? null, visite?.trame?.id ?? null,
          visite?.trame?.nom ?? null, visite?.derniereVisite?.id ?? null,
          visite?.derniereVisite?.date ?? null, visite?.derniereVisite?.statut ?? null, json(visite), 1,
          Number(meta.criteriaCount || 0), Number(meta.historicalCriteriaCount || 0), Number(meta.remarkCount || 0), Number(meta.materialCount || 0),
          visite?.local?.type ?? null,
          visite?.local?.situation ?? null,
          Number.isFinite(Number(visite?.local?.periodiciteVisite ?? visite?.local?.periodicite_visite)) ? Number(visite?.local?.periodiciteVisite ?? visite?.local?.periodicite_visite) : null,
          visite?.local?.prochaineVisite ?? visite?.local?.prochaine_visite ?? null,
          visite?.local?.visitePlanifiee ?? visite?.local?.visite_planifiee ?? null,
          Number.isFinite(Number(visite?.local?.ordre)) ? Number(visite.local.ordre) : null,
          visite?.local?.typeTrameId ?? visite?.local?.type_trame_id ?? null]
      );
"""
s = replace_once(s, old, new, 'cache server local metadata')

s = replace_once(
    s,
    "export async function listCachedLocals(remoteSiteId) {\n  return (await db()).getAllAsync(`SELECT * FROM api_local_links WHERE remote_site_id=? AND remote_present=1 ORDER BY designation`, [clean(remoteSiteId)]);\n}",
    "export async function listCachedLocals(remoteSiteId) {\n  return (await db()).getAllAsync(`SELECT * FROM api_local_links WHERE remote_site_id=? AND remote_present=1 ORDER BY COALESCE(ordre,1000000),designation,remote_local_id`, [clean(remoteSiteId)]);\n}",
    'respect server local order',
)

# Lorsqu'un client/site a déjà été matérialisé avant que la préparation complète
# arrive, on complète les champs encore vides sans écraser les saisies locales.
old = """  if (existing?.id) {
    await database.runAsync(`UPDATE api_client_links SET local_client_id=?,cree_localement=0 WHERE remote_client_id=?`, [existing.id, remote.remote_client_id]);
    return existing.id;
  }

  const id = createId();
  const adresse = [remote.adresse_postale, remote.ville].filter(Boolean).join(' ');
"""
new = """  const adresse = [remote.adresse_postale, remote.ville].filter(Boolean).join(' ');
  if (existing?.id) {
    await database.runAsync(
      `UPDATE clients SET
         code_exploitant=CASE WHEN trim(COALESCE(code_exploitant,''))='' THEN ? ELSE code_exploitant END,
         adresse=CASE WHEN trim(COALESCE(adresse,''))='' THEN ? ELSE adresse END
       WHERE id=?`, [remote.code_everwin || null, adresse || null, existing.id]
    );
    await database.runAsync(`UPDATE api_client_links SET local_client_id=?,cree_localement=0 WHERE remote_client_id=?`, [existing.id, remote.remote_client_id]);
    return existing.id;
  }

  const id = createId();
"""
s = replace_once(s, old, new, 'fill blank client metadata')

old = """  const existing = await database.getFirstAsync(`SELECT id FROM sites WHERE client_id=? AND lower(trim(nom_site))=lower(trim(?)) LIMIT 1`, [clientId, clean(remote.nom)]);
  const localSiteId = existing?.id || createId();
  const createdLocally = existing?.id ? 0 : 1;
  if (!existing?.id) {
    await database.runAsync(`INSERT INTO sites(id,client_id,nom_site,statut) VALUES(?,?,?,'Actif')`, [localSiteId, clientId, remote.nom]);
  }

  await database.runAsync(
"""
new = """  const existing = await database.getFirstAsync(`SELECT id FROM sites WHERE client_id=? AND lower(trim(nom_site))=lower(trim(?)) LIMIT 1`, [clientId, clean(remote.nom)]);
  const localSiteId = existing?.id || createId();
  const createdLocally = existing?.id ? 0 : 1;
  const cpVille = [remote.code_postal, remote.ville].filter(Boolean).join(' ');
  const adresse = [remote.adresse, cpVille].filter(Boolean).join('\\n');
  if (!existing?.id) {
    await database.runAsync(`INSERT INTO sites(id,client_id,nom_site,adresse,statut) VALUES(?,?,?,?,'Actif')`, [localSiteId, clientId, remote.nom, adresse || null]);
  } else if (adresse) {
    await database.runAsync(`UPDATE sites SET adresse=CASE WHEN trim(COALESCE(adresse,''))='' THEN ? ELSE adresse END WHERE id=?`, [adresse, localSiteId]);
  }

  await database.runAsync(
"""
s = replace_once(s, old, new, 'materialize server site address')

p.write_text(s, encoding='utf-8')

# Le dump confirme aussi les choix déjà sécurisés ailleurs :
# - SITE <-> CLIENT passe par LOT/SITE_LOT (relation potentiellement multiple),
# - VISITE_TECHNIQUE cible un seul LOCAL,
# - PHOTOGRAPHIE.local_critere_id est nullable,
# - COMPTEUR n'a aucune FK vers VISITE_TECHNIQUE ou LOCAL_CRITERE.
cache = p.read_text(encoding='utf-8')
payload = Path('intranetVisitPayload.js').read_text(encoding='utf-8')
photo = Path('intranetVisitPhotoOutboxDb.js').read_text(encoding='utf-8')
if 'api_client_site_links' not in cache:
    raise SystemExit('LOT/SITE_LOT multi-client relation protection missing')
if 'ORDER BY COALESCE(ordre,1000000),designation,remote_local_id' not in cache:
    raise SystemExit('LOCAL server order not preserved')
if "Pré-allumage : cette visite METRA contient plusieurs locaux" not in payload:
    raise SystemExit('one server visit per LOCAL protection missing')
if 'compteur correspondant introuvable ou ambigu' in payload:
    raise SystemExit('missing compteur still incorrectly blocks visit upload')
if 'criterionIds.every' not in photo:
    raise SystemExit('general photo nullable local_critere behavior missing')

print('Server SQL cache alignment applied: CLIENT logo metadata, full SITE metadata/address, LOCAL order/type/situation and schema guards.')
