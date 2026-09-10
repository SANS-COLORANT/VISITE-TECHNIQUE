from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def replace(rel, old, new):
    p = ROOT / rel
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'missing replacement in {rel}: {old[:140]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')
    print('patched', rel)

replace('intranetVisitPayload.js', '''async function frozenContext(db, visite) {
  const rows = await db.getAllAsync(`SELECT details_json,reference_externe,importe_le FROM provenances
    WHERE entite_type='visite' AND entite_id=? AND origine='api_symfony' ORDER BY importe_le DESC`, [visite.id]);
  for (const row of rows || []) {
    try {
      const details = JSON.parse(row.details_json || 'null');
      if (details?.sourceType === 'imported_latest_visit') return { historical: true, details };
      if (details?.sourceType === 'preparation_visite' || details?.sourceType === 'upload_binding') return { historical: false, details };
    } catch {}
  }
  return null;
}
''', '''async function frozenContext(db, visite) {
  const rows = await db.getAllAsync(`SELECT details_json,reference_externe,importe_le FROM provenances
    WHERE entite_type='visite' AND entite_id=? AND origine='api_symfony' ORDER BY importe_le DESC`, [visite.id]);
  let preparedContext = null;
  for (const row of rows || []) {
    try {
      const details = JSON.parse(row.details_json || 'null');
      if (details?.sourceType === 'imported_latest_visit') return { historical: true, details };
      // An explicit send-time destination must win over an older preparation
      // reference, including when SQLite timestamps fall in the same second.
      if (details?.sourceType === 'upload_binding') return { historical: false, details };
      if (details?.sourceType === 'preparation_visite' && !preparedContext) preparedContext = { historical: false, details };
    } catch {}
  }
  return preparedContext;
}
''')

replace('intranetVisitBindingDb.js', '''  const existingProvenances = await db.getAllAsync(`SELECT details_json FROM provenances WHERE entite_type='visite' AND entite_id=? AND origine='api_symfony' ORDER BY importe_le DESC`, [String(visiteId)]);
  for (const row of existingProvenances) {
    const details = parseJson(row.details_json);
    if (details?.sourceType === 'imported_latest_visit') throw new Error('Une visite historique Intranet ne peut pas être réutilisée comme nouvelle visite.');
  }
''', '''  const existingProvenances = await db.getAllAsync(`SELECT id,details_json FROM provenances WHERE entite_type='visite' AND entite_id=? AND origine='api_symfony' ORDER BY importe_le DESC`, [String(visiteId)]);
  const previousBindingIds = [];
  for (const row of existingProvenances) {
    const details = parseJson(row.details_json);
    if (details?.sourceType === 'imported_latest_visit') throw new Error('Une visite historique Intranet ne peut pas être réutilisée comme nouvelle visite.');
    if (details?.sourceType === 'upload_binding' && row.id) previousBindingIds.push(String(row.id));
  }
''')
replace('intranetVisitBindingDb.js', '''  await db.withTransactionAsync(async () => {
    await db.runAsync(`UPDATE visites SET api_remote_client_id=?,api_remote_local_id=?,api_remote_trame_id=?,api_source_remote_visit_id=?,modifie_le=datetime('now') WHERE id=?`,
''', '''  await db.withTransactionAsync(async () => {
    for (const provenanceId of previousBindingIds) {
      await db.runAsync(`DELETE FROM provenances WHERE id=?`, [provenanceId]);
    }
    await db.runAsync(`UPDATE visites SET api_remote_client_id=?,api_remote_local_id=?,api_remote_trame_id=?,api_source_remote_visit_id=?,modifie_le=datetime('now') WHERE id=?`,
''')

replace('IntranetVisitSync.js', '''  const hardIdempotencyConflict = row?.error_code === 'idempotency_conflict';
  const invalidAck = row?.error_code === 'invalid_ack';
  const terminalEditable = row && row.status === 'validation_error';
  const retryable = row && ['pending', 'retry', 'auth_error'].includes(row.status);

  return <View''', '''  const hardIdempotencyConflict = row?.error_code === 'idempotency_conflict';
  const invalidAck = row?.error_code === 'invalid_ack';
  const terminalEditable = row && row.status === 'validation_error';
  const retryable = row && ['pending', 'retry', 'auth_error'].includes(row.status);
  const destinationChangeAllowed = !row || (
    ['validation_error', 'rejected', 'conflict'].includes(row.status)
    && !hardIdempotencyConflict
    && !invalidAck
  );
  const changeDestination = async () => {
    if (busy || !destinationChangeAllowed) return;
    if (row) {
      setBusy(true);
      try {
        const discarded = await discardTerminalVisitUpload(visiteId);
        if (!discarded) {
          Alert.alert('Destination verrouillée', 'Cet envoi ne peut pas changer de destination dans son état actuel.');
          return;
        }
        await refresh();
      } finally { setBusy(false); }
    }
    setBindingVisible(true);
  };

  return <View''')
replace('IntranetVisitSync.js', '''    {!row && linkedToIntranet ? <TouchableOpacity accessibilityRole="button" disabled={busy || loading} onPress={() => confirmAndQueue(false, !['terminee','exportee'].includes(visite.statut))} style={[styles.btnSecondary, { minHeight: 46, marginTop: 8 }]}><Text style={styles.btnSecondaryText}>{['terminee','exportee'].includes(visite.statut) ? 'Préparer et envoyer' : 'Finaliser et préparer l’envoi'}</Text></TouchableOpacity> : null}
    {retryable ?''', '''    {!row && linkedToIntranet ? <TouchableOpacity accessibilityRole="button" disabled={busy || loading} onPress={() => confirmAndQueue(false, !['terminee','exportee'].includes(visite.statut))} style={[styles.btnSecondary, { minHeight: 46, marginTop: 8 }]}><Text style={styles.btnSecondaryText}>{['terminee','exportee'].includes(visite.statut) ? 'Préparer et envoyer' : 'Finaliser et préparer l’envoi'}</Text></TouchableOpacity> : null}
    {!row && linkedToIntranet ? <TouchableOpacity accessibilityRole="button" disabled={busy || loading} onPress={changeDestination} style={{ minHeight: 38, marginTop: 4, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: COLORS.primary, fontSize: 11.5, fontWeight: '900' }}>Modifier la destination Intranet</Text></TouchableOpacity> : null}
    {row && destinationChangeAllowed ? <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={changeDestination} style={[styles.btnSecondary, { minHeight: 44, marginTop: 8 }]}><Text style={styles.btnSecondaryText}>Changer / actualiser la destination</Text></TouchableOpacity> : null}
    {retryable ?''')

replace('.github/scripts/check_intranet_any_visit_contract.js', '''need(sync, 'Choisir la destination Intranet', 'unbound visit action');
need(sync, '<IntranetVisitDestinationPicker', 'destination picker wiring');
''', '''need(sync, 'Choisir la destination Intranet', 'unbound visit action');
need(sync, 'Modifier la destination Intranet', 'pre-send destination correction');
need(sync, 'Changer / actualiser la destination', 'safe terminal destination correction');
need(sync, 'discardTerminalVisitUpload', 'terminal outbox reset before rebinding');
need(sync, '<IntranetVisitDestinationPicker', 'destination picker wiring');
''')
replace('.github/scripts/check_intranet_any_visit_contract.js', '''need(payload, "sourceType === 'upload_binding'", 'send-time frozen context');
''', '''need(payload, "sourceType === 'upload_binding'", 'send-time frozen context');
need(payload, 'preparedContext', 'explicit binding precedence over older preparation');
need(binding, 'previousBindingIds', 'single current explicit destination provenance');
''')

replace('.github/scripts/test_intranet_any_visit_binding.js', '''    check(links.local_client_id === 'local-client' && links.local_site_id === 'local-site', 'explicit successful association is remembered for future visits of the same client/site');

    const payload = load('intranetVisitPayload.js', { getDb: async () => server.db, obtenirTrame: () => localTrame });
''', '''    check(links.local_client_id === 'local-client' && links.local_site_id === 'local-site', 'explicit successful association is remembered for future visits of the same client/site');
    await binding.bindVisitToIntranetTarget('ordinary-visit', { remoteClientId: '12', remoteSiteId: '45', remoteLocalId: '501' });
    const bindingCount = await server.db.getFirstAsync(`SELECT COUNT(*) AS n FROM provenances WHERE entite_type='visite' AND entite_id='ordinary-visit' AND details_json LIKE '%\"sourceType\":\"upload_binding\"%'`);
    check(Number(bindingCount.n) === 1, 'changing the destination before queueing replaces the previous explicit binding instead of leaving ambiguous frozen references');

    const payload = load('intranetVisitPayload.js', { getDb: async () => server.db, obtenirTrame: () => localTrame });
''')

print('adjustments complete')
