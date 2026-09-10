import React, { useCallback, useEffect, useState } from 'react';
import { Keyboard, Modal, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { resolvePhotoContexts, getVisitPhotoReference, readPhotoLocalChoice } from './latestVisitPhotosDb.js';
import { filterLatestVisitPhotos, photoSummary, photoStatusLabel } from './latestVisitPhotoModel.js';
import { usePhotoDownloadState } from './PhotoDownloadStatus.js';

export function PhotoReferenceAccess({ siteId = null, visiteId = null, remoteLocalId = null, contextKey = 'visit', contextTitle = null, remoteClientId = null, remoteSiteId = null, clientName = null }) {
  const [contexts, setContexts] = useState([]), [selected, setSelected] = useState(null), [picker, setPicker] = useState(false);
  const [status, setStatus] = useState(null), [activated, setActivated] = useState(false), [error, setError] = useState(null);
  const [revision, setRevision] = useState(0);
  const tasks = usePhotoDownloadState();
  const taskKey = tasks.tasks.map((t) => `${t.id}:${t.status}`).join('|');
  const isPreLocal = contextKey.startsWith('preallumage-local:');
  const readContexts = useCallback(async () => remoteClientId && remoteSiteId ? [{
    client: { remote_client_id: String(remoteClientId), nom: clientName }, remoteSiteId: String(remoteSiteId), remoteLocalId,
  }] : resolvePhotoContexts({ visiteId, siteId, remoteLocalId, ignoreVisitLocal: isPreLocal }), [siteId, visiteId, remoteLocalId, remoteClientId, remoteSiteId, clientName, isPreLocal]);

  useEffect(() => {
    let alive = true;
    setStatus(null); setError(null);
    (async () => {
      const rows = await readContexts();
      if (!alive) return;
      setContexts(rows);
      if (rows.length !== 1) return;
      const ctx = rows[0], clientId = ctx.client.remote_client_id;
      const { loadCachedLatestVisitPhotos, hydrateLatestVisitPhotosCache } = require('./latestVisitPhotosStorage.js');
      const latest = await loadCachedLatestVisitPhotos(clientId);
      const pinned = visiteId ? await getVisitPhotoReference(visiteId, clientId, ctx.remoteSiteId, latest) : null;
      const manifest = pinned ? await hydrateLatestVisitPhotosCache(clientId, pinned) : latest;
      const choice = !ctx.remoteLocalId && visiteId ? await readPhotoLocalChoice(visiteId, contextKey, clientId, ctx.remoteSiteId) : null;
      const localId = ctx.remoteLocalId || choice;
      const scoped = filterLatestVisitPhotos(manifest, { siteIds: [ctx.remoteSiteId], localIds: localId ? [localId] : null });
      if (alive) setStatus(visiteId && !localId ? 'Choisir le local de référence' : photoStatusLabel(photoSummary(scoped)));
    })().catch(() => { if (alive) setError('Photos de référence : réessayer'); });
    return () => { alive = false; };
  }, [readContexts, visiteId, contextKey, revision, taskKey]);

  const open = async (event) => {
    event?.stopPropagation?.(); Keyboard.dismiss();
    try {
      const { getActivationStatus } = require('./symfonyApi.js');
      const rows = await readContexts();
      setContexts(rows);
      const connection = await getActivationStatus().catch(() => ({ activated: false }));
      setActivated(Boolean(connection.activated));
      if (rows.length === 1) setSelected(rows[0]);
      else if (rows.length > 1) setPicker(true);
      else setError('Aucun lien Intranet connu pour ce site.');
    } catch { setError('Impossible d’ouvrir les photos. Réessaie.'); }
  };
  if (!contexts.length && !error) return null;
  const Gallery = selected ? require('./ClientLatestVisitPhotosModal.js').ClientLatestVisitPhotosModal : null;
  return <View style={{ marginVertical: 6 }}>
    <TouchableOpacity accessibilityRole="button" onPress={open} style={{ minHeight: 52, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, backgroundColor: '#F4F7FA', paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center' }}>
      <Text style={{ color: COLORS.ink, fontSize: 13, fontWeight: '700' }}>{contextTitle ? `Photos de référence · ${contextTitle}` : 'Photos de référence Intranet'}</Text>
      <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 4 }}>{error || status || (contexts.length > 1 ? 'Choisir le client Intranet' : 'Consulter sans quitter la visite')}</Text>
    </TouchableOpacity>
    <Modal visible={picker} transparent animationType="fade" onRequestClose={() => setPicker(false)}><View style={styles.modalOverlay}><View style={styles.modalSheet}><Text style={styles.modalTitle}>Choisir le client de référence</Text>{contexts.map((ctx) => <TouchableOpacity key={`${ctx.client.remote_client_id}-${ctx.remoteSiteId}`} onPress={() => { setPicker(false); setSelected(ctx); }} style={{ minHeight: 48, justifyContent: 'center' }}><Text>{ctx.client.nom || ctx.client.remote_client_id}</Text></TouchableOpacity>)}<TouchableOpacity onPress={() => setPicker(false)} style={[styles.btnSecondary, { minHeight: 48 }]}><Text style={styles.btnSecondaryText}>Fermer</Text></TouchableOpacity></View></View></Modal>
    {Gallery ? <Gallery visible client={selected.client} activated={activated} siteIds={[selected.remoteSiteId]} localIds={selected.remoteLocalId ? [selected.remoteLocalId] : null} visiteId={visiteId} contextKey={contextKey} contextTitle={contextTitle || selected.siteName} requireLocalChoice={Boolean(visiteId)} onClose={() => { setSelected(null); setRevision((n) => n + 1); }} /> : null}
  </View>;
}
