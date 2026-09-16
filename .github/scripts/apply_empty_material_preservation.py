from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: marker not found')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# 1. Empty Materials tab: preserve the frozen Intranet material list when the
#    full source objects are available. Never interpret an untouched empty tab
#    as a remote DELETE/clear operation.
# ---------------------------------------------------------------------------
p = Path('intranetVisitPayload.js')
s = p.read_text(encoding='utf-8')
old = """async function buildMaterials(db, visiteId, sourceMaterialCount, issues) {
  const rows = await db.getAllAsync(`SELECT m.*,
      (SELECT a.valeur FROM attributs_libres a WHERE a.entite_type='equipement' AND a.entite_id=m.equipement_id AND a.cle='api_symfony.etat_reference' ORDER BY a.modifie_le DESC LIMIT 1) AS intranet_reference_state
    FROM materiel m WHERE m.visite_id=? ORDER BY m.cree_le,m.id`, [visiteId]);
  const result = rows.map((row, index) => {
    const prefix = `Matériel ${index + 1}`;
    const currentState = nullable(row.etat);
    const referenceState = nullable(row.intranet_reference_state);
    const state = currentState || (INTRANET_MATERIAL_STATES.includes(referenceState) ? referenceState : null);
    if (state && !INTRANET_MATERIAL_STATES.includes(state)) {
      issues.push(`${prefix} / état « ${state} » non accepté par l’Intranet. Choisir ${INTRANET_MATERIAL_STATES.join(', ')} ou laisser vide.`);
    }
    return {
      categorie: limited(row.categorie, 255, `${prefix} / catégorie`, issues, { required: true }),
      nombre: limited(row.nombre, 255, `${prefix} / nombre`, issues, { required: true }),
      designation: limited(row.designation, 255, `${prefix} / désignation`, issues, { required: true }),
      numeroMateriel: limited(row.numero_materiel, 255, `${prefix} / numéro matériel`, issues),
      reseauDesservi: limited(row.reseau_desservi, 255, `${prefix} / réseau desservi`, issues),
      marque: limited(row.marque, 255, `${prefix} / marque`, issues),
      modele: limited(row.modele, 255, `${prefix} / modèle`, issues),
      caracteristiques: limited(row.caracteristiques, 255, `${prefix} / caractéristiques`, issues),
      annee: limited(row.annee, 128, `${prefix} / année`, issues),
      etat: state && INTRANET_MATERIAL_STATES.includes(state) ? state : state,
    };
  });
  const sourceCount = Number(sourceMaterialCount || 0);
  const removedSourceMaterialCount = Math.max(0, sourceCount - result.length);
  return {
    materiels: result,
    destructiveMaterialChange: removedSourceMaterialCount > 0,
    destructiveMaterialClear: result.length === 0 && sourceCount > 0,
    removedSourceMaterialCount,
    sourceMaterialCount: sourceCount,
  };
}
"""
new = """function materialWireFromReference(row, index, issues) {
  const prefix = `Matériel Intranet ${index + 1}`;
  const state = nullable(row?.etat);
  if (state && !INTRANET_MATERIAL_STATES.includes(state)) {
    issues.push(`${prefix} / état « ${state} » non accepté par l’Intranet. Actualise la préparation du client avant l’envoi.`);
  }
  return {
    categorie: limited(row?.categorie, 255, `${prefix} / catégorie`, issues, { required: true }),
    nombre: limited(row?.nombre, 255, `${prefix} / nombre`, issues, { required: true }),
    designation: limited(row?.designation, 255, `${prefix} / désignation`, issues, { required: true }),
    numeroMateriel: limited(row?.numeroMateriel ?? row?.numero_materiel, 255, `${prefix} / numéro matériel`, issues),
    reseauDesservi: limited(row?.reseauDesservi ?? row?.reseau_desservi, 255, `${prefix} / réseau desservi`, issues),
    marque: limited(row?.marque, 255, `${prefix} / marque`, issues),
    modele: limited(row?.modele, 255, `${prefix} / modèle`, issues),
    caracteristiques: limited(row?.caracteristiques, 255, `${prefix} / caractéristiques`, issues),
    annee: limited(row?.annee, 128, `${prefix} / année`, issues),
    etat: state && INTRANET_MATERIAL_STATES.includes(state) ? state : state,
  };
}

async function buildMaterials(db, visiteId, sourceMaterials, issues) {
  const rows = await db.getAllAsync(`SELECT m.*,
      (SELECT a.valeur FROM attributs_libres a WHERE a.entite_type='equipement' AND a.entite_id=m.equipement_id AND a.cle='api_symfony.etat_reference' ORDER BY a.modifie_le DESC LIMIT 1) AS intranet_reference_state
    FROM materiel m WHERE m.visite_id=? ORDER BY m.cree_le,m.id`, [visiteId]);
  const sourceRows = Array.isArray(sourceMaterials) ? sourceMaterials : [];
  const sourceCount = sourceRows.length || Number(sourceMaterials || 0);

  // Le POST Symfony remplace le listing matériel complet. Un onglet Matériels
  // vide parce que le technicien ne l'a pas renseigné ne doit donc surtout pas
  // être interprété comme « supprimer tous les matériels ». Si la préparation
  // figée contient les objets complets, on renvoie leur état serveur inchangé.
  if (rows.length === 0 && sourceRows.length > 0) {
    const preserved = sourceRows.map((row, index) => materialWireFromReference(row, index, issues));
    return {
      materiels: preserved,
      destructiveMaterialChange: false,
      destructiveMaterialClear: false,
      removedSourceMaterialCount: 0,
      sourceMaterialCount: sourceCount,
      preservedSourceMaterials: true,
    };
  }

  const result = rows.map((row, index) => {
    const prefix = `Matériel ${index + 1}`;
    const currentState = nullable(row.etat);
    const referenceState = nullable(row.intranet_reference_state);
    const state = currentState || (INTRANET_MATERIAL_STATES.includes(referenceState) ? referenceState : null);
    if (state && !INTRANET_MATERIAL_STATES.includes(state)) {
      issues.push(`${prefix} / état « ${state} » non accepté par l’Intranet. Choisir ${INTRANET_MATERIAL_STATES.join(', ')} ou laisser vide.`);
    }
    return {
      categorie: limited(row.categorie, 255, `${prefix} / catégorie`, issues, { required: true }),
      nombre: limited(row.nombre, 255, `${prefix} / nombre`, issues, { required: true }),
      designation: limited(row.designation, 255, `${prefix} / désignation`, issues, { required: true }),
      numeroMateriel: limited(row.numero_materiel, 255, `${prefix} / numéro matériel`, issues),
      reseauDesservi: limited(row.reseau_desservi, 255, `${prefix} / réseau desservi`, issues),
      marque: limited(row.marque, 255, `${prefix} / marque`, issues),
      modele: limited(row.modele, 255, `${prefix} / modèle`, issues),
      caracteristiques: limited(row.caracteristiques, 255, `${prefix} / caractéristiques`, issues),
      annee: limited(row.annee, 128, `${prefix} / année`, issues),
      etat: state && INTRANET_MATERIAL_STATES.includes(state) ? state : state,
    };
  });
  const removedSourceMaterialCount = Math.max(0, sourceCount - result.length);
  return {
    materiels: result,
    destructiveMaterialChange: removedSourceMaterialCount > 0,
    destructiveMaterialClear: result.length === 0 && sourceCount > 0,
    removedSourceMaterialCount,
    sourceMaterialCount: sourceCount,
    preservedSourceMaterials: false,
  };
}
"""
s = replace_once(s, old, new, 'preserve frozen materials on empty tab')
old_source = """  const sourceMaterials = Array.isArray(details?.materiels)
    ? details.materiels.length
    : Number(details?.preparationMeta?.materialCount ?? ((await db.getFirstAsync(
      `SELECT material_count FROM api_local_links WHERE remote_local_id=?`, [String(visite.api_remote_local_id)]
    ))?.material_count ?? 0));
"""
new_source = """  const sourceMaterials = Array.isArray(details?.materiels)
    ? details.materiels
    : Number(details?.preparationMeta?.materialCount ?? ((await db.getFirstAsync(
      `SELECT material_count FROM api_local_links WHERE remote_local_id=?`, [String(visite.api_remote_local_id)]
    ))?.material_count ?? 0));
"""
s = replace_once(s, old_source, new_source, 'pass complete frozen material reference')
s = replace_once(
    s,
    "    sourceMaterialCount: materialData.sourceMaterialCount,\n    summary: { criteria:",
    "    sourceMaterialCount: materialData.sourceMaterialCount,\n    preservedSourceMaterials: Boolean(materialData.preservedSourceMaterials),\n    summary: { criteria:",
    'expose preservation state',
)
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 2. Executable upload regression: empty Materials tab must preserve source.
# ---------------------------------------------------------------------------
p = Path('.github/scripts/test_intranet_visit_upload.js')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "  derniereVisite: { id: '812', date: '2026-09-01' }, trame: remoteTrame, materiels: [{ id: 1 }] };",
    "  derniereVisite: { id: '812', date: '2026-09-01' }, trame: remoteTrame, materiels: [{ id: 1, categorie: 'PRODUCTION CHAUD', nombre: '2', designation: 'Chaudière gaz', numeroMateriel: 'CHA-001', reseauDesservi: 'Bâtiment A', marque: 'Exemple', modele: 'G500', caracteristiques: '500 kW', annee: '2019', etat: 'Bon' }] };",
    'complete frozen material fixture',
)
s = replace_once(
    s,
    """    const emptyMaterial = await payloadModule.buildIntranetVisitPayload('visit-1', '11111111-1111-4111-8111-111111111111');
    check(emptyMaterial.destructiveMaterialClear && emptyMaterial.sourceMaterialCount === 1, 'empty local listing is flagged as destructive when remote reference had material');
""",
    """    const emptyMaterial = await payloadModule.buildIntranetVisitPayload('visit-1', '11111111-1111-4111-8111-111111111111');
    check(!emptyMaterial.destructiveMaterialClear && emptyMaterial.preservedSourceMaterials && emptyMaterial.sourceMaterialCount === 1,
      'empty local Materials tab preserves the frozen Intranet listing instead of clearing it');
    check(emptyMaterial.payload.visites[0].materiels[0]?.numeroMateriel === 'CHA-001',
      'preserved material keeps the exact remote business fields');
""",
    'empty material payload expectation',
)
s = replace_once(
    s,
    """    await seed(server.db, 'clear-list');
    await server.db.runAsync(`DELETE FROM materiel WHERE visite_id='clear-list'`);
    await assert.rejects(() => outbox.queueVisitUpload('clear-list'), (error) => error?.code === 'material_clear_confirmation_required');
    check(!(await outbox.getVisitUploadState('clear-list')), 'destructive empty material listing is not queued before explicit confirmation');
    const cleared = await outbox.queueVisitUpload('clear-list', { confirmMaterialClear: true });
    check(cleared.status === 'pending', 'explicit confirmation allows intentional remote material-list clearing');
    await server.db.runAsync(`DELETE FROM api_visit_outbox WHERE visite_id='clear-list'`);
""",
    """    await seed(server.db, 'clear-list');
    await server.db.runAsync(`DELETE FROM materiel WHERE visite_id='clear-list'`);
    const preservedEmpty = await outbox.queueVisitUpload('clear-list');
    check(preservedEmpty.status === 'pending', 'empty Materials tab queues normally without destructive-clear confirmation');
    const preservedQueuedBody = JSON.parse(preservedEmpty.payload_json);
    check(preservedQueuedBody.visites[0].materiels.length === 1 && preservedQueuedBody.visites[0].materiels[0].numeroMateriel === 'CHA-001',
      'queued empty Materials tab reuses the frozen remote material listing');
    await server.db.runAsync(`DELETE FROM api_visit_outbox WHERE visite_id='clear-list'`);
""",
    'empty material outbox expectation',
)
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 3. Static guard for future regressions.
# ---------------------------------------------------------------------------
p = Path('.github/scripts/check_partial_intranet_visit_contract.js')
s = p.read_text(encoding='utf-8')
marker = "requireText(payload, 'destructiveMaterialChange', 'material replacement safety retained');\n"
line = "requireText(payload, 'preservedSourceMaterials', 'empty material tab preserves frozen Intranet list');\n"
if line not in s:
    if marker not in s:
        raise SystemExit('partial contract material marker not found')
    s = s.replace(marker, marker + line, 1)
p.write_text(s, encoding='utf-8')

print('Empty Materials tab preservation applied.')
