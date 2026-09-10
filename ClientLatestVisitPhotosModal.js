import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Keyboard, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { flattenLatestVisitPhotos, getVisitPhotoReference, readPhotoLocalChoice, savePhotoLocalChoice } from './latestVisitPhotosDb.js';
import { hydrateLatestVisitPhotosCache, loadCachedLatestVisitPhotos, syncLatestVisitPhotosManifest } from './latestVisitPhotosStorage.js';
import { filterLatestVisitPhotos, photoSummary, photoStatusLabel, mapLatestVisitPhotos, photoFileKey, referenceSignature, formatPhotoBytes, formatPhotoDate } from './latestVisitPhotoModel.js';
import { startPhotoDownload } from './latestVisitPhotoTasks.js';
import { PhotoTaskList, usePhotoDownloadState } from './PhotoDownloadStatus.js';
import { ReferencePhotoViewer } from './ReferencePhotoViewer.js';

const ink = COLORS.ink || '#17212B', muted = COLORS.muted || '#667085';
function Button({ label, onPress, disabled = false, primary = false }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ minHeight: 48, paddingHorizontal: 12, paddingVertical: 9, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: primary ? COLORS.primary : '#F3F5F7', opacity: disabled ? 0.5 : 1 }}><Text style={{ color: primary ? '#FFF' : ink, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>{label}</Text></TouchableOpacity>;
}
const PhotoThumbnail = memo(function PhotoThumbnail({ photo, onPress }) {
  const local = photo.localAvailable && photo.localUri;
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${local ? 'Ouvrir' : 'Télécharger'} ${photo.description || 'la photo'}`} onPress={() => onPress(photo)} disabled={!local && !photo.disponible} style={{ width: 132, marginRight: 10 }}>
    <View style={{ width: 132, height: 96, borderRadius: 10, backgroundColor: '#E9EEF2', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {local ? <Image source={{ uri: photo.localUri }} resizeMode="cover" style={{ width: '100%', height: '100%' }} /> : <Text style={{ color: muted, fontSize: 12, padding: 8, textAlign: 'center' }}>{photo.disponible ? (photo.downloadStatus === 'error' ? 'À reprendre' : 'Toucher pour récupérer') : 'Indisponible'}</Text>}
    </View>
    <Text numberOfLines={2} style={{ color: ink, fontSize: 12, lineHeight: 16, marginTop: 5 }}>{photo.description || 'Photo de référence'}</Text>
  </TouchableOpacity>;
});
const LocalPhotoGroup = memo(function LocalPhotoGroup({ group, onPhoto, onDownload, activated }) {
  const summary = photoSummary({ sites: [{ locaux: [group] }] });
  return <View style={{ borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 12, marginBottom: 12, backgroundColor: '#FFF' }}>
    <Text style={{ color: muted, fontSize: 12 }}>{group.site?.nom || 'Site'}</Text>
    <Text style={{ color: ink, fontSize: 15, fontWeight: '700', marginTop: 3 }}>{group.local?.designation || 'Aucun local recensé'}</Text>
    <Text style={{ color: muted, fontSize: 12, marginVertical: 5 }}>{group.derniereVisite ? `Visite du ${formatPhotoDate(group.derniereVisite.date)} · ${group.derniereVisite.statut || ''}` : 'Aucune visite disponible'}</Text>
    {group.photos.length ? <FlatList horizontal data={group.photos} keyExtractor={(p) => String(p.id)} renderItem={({ item }) => <PhotoThumbnail photo={item} onPress={onPhoto} />} contentContainerStyle={{ paddingVertical: 7 }} initialNumToRender={4} maxToRenderPerBatch={4} windowSize={3} /> : <Text style={{ color: muted, paddingVertical: 9 }}>Aucune photo dans cette visite.</Text>}
    <Text style={{ color: muted, fontSize: 12, marginVertical: 5 }}>{photoStatusLabel(summary)}</Text>
    {summary.missing ? <Button disabled={!activated} label={`Enregistrer ce local · ${summary.missing} photos · ${formatPhotoBytes(summary.bytes)}`} onPress={() => onDownload({ siteIds: [group.site.id], localIds: [group.local.id] }, group.local.designation)} /> : null}
  </View>;
});

function ClientLatestVisitPhotosModal({ visible, client, activated, onClose, siteIds = null, localIds = null, visiteId = null, contextKey = null, contextTitle = null, requireLocalChoice = false }) {
  const clientId = client?.remote_client_id;
  const scopeKey = JSON.stringify([clientId, siteIds, localIds, visiteId, contextKey]);
  const request = useRef(0), alive = useRef(false), wantedPhoto = useRef(null);
  const [latest, setLatest] = useState(null), [reference, setReference] = useState(null);
  const [loading, setLoading] = useState(false), [syncing, setSyncing] = useState(false), [notice, setNotice] = useState(null);
  const [search, setSearch] = useState(''), [selectedLocal, setSelectedLocal] = useState(null), [showLatest, setShowLatest] = useState(false);
  const [viewerPhoto, setViewerPhoto] = useState(null), [showTasks, setShowTasks] = useState(false);
  const taskState = usePhotoDownloadState();
  const pinnedSiteId = visiteId && siteIds?.length === 1 ? siteIds[0] : null;

  const installManifest = async (manifest, token) => {
    let pinned = pinnedSiteId && manifest ? await getVisitPhotoReference(visiteId, clientId, pinnedSiteId, manifest) : null;
    if (pinned) pinned = await hydrateLatestVisitPhotosCache(clientId, pinned);
    if (alive.current && token === request.current) { setLatest(manifest); if (pinned) setReference(pinned); }
  };
  const refreshManifest = async () => {
    if (!clientId || !activated || syncing) return;
    const token = ++request.current;
    setSyncing(true); setNotice(null);
    try { await installManifest(await syncLatestVisitPhotosManifest(clientId), token); }
    catch (e) { if (alive.current && token === request.current) setNotice('Impossible d’actualiser les photos. Vérifie la connexion et les droits Intranet. Les photos déjà enregistrées restent consultables.'); }
    finally { if (alive.current && token === request.current) { setSyncing(false); setLoading(false); } }
  };
  useEffect(() => {
    if (!visible || !clientId) return undefined;
    alive.current = true;
    const token = ++request.current;
    setLatest(null); setReference(null); setNotice(null); setSearch(''); setSelectedLocal(null); setShowLatest(false); setViewerPhoto(null); setShowTasks(false);
    wantedPhoto.current = null; setLoading(true); setSyncing(false);
    (async () => {
      const cached = await loadCachedLatestVisitPhotos(clientId);
      const choice = pinnedSiteId ? await readPhotoLocalChoice(visiteId, contextKey, clientId, pinnedSiteId) : null;
      let pinned = pinnedSiteId ? await getVisitPhotoReference(visiteId, clientId, pinnedSiteId, cached) : null;
      if (pinned) pinned = await hydrateLatestVisitPhotosCache(clientId, pinned);
      if (!alive.current || token !== request.current) return;
      setLatest(cached); setReference(pinned); setSelectedLocal(choice); setLoading(false);
      // Cached content is immediately usable; refreshing never replaces a pinned reference.
      if (activated) {
        setSyncing(true);
        try { await installManifest(await syncLatestVisitPhotosManifest(clientId), token); }
        catch { if (alive.current && token === request.current) setNotice('Actualisation indisponible. Les photos enregistrées restent accessibles hors connexion.'); }
        finally { if (alive.current && token === request.current) setSyncing(false); }
      }
    })().catch(() => { if (alive.current && token === request.current) { setLoading(false); setSyncing(false); setNotice('Impossible de lire les photos enregistrées. Ferme puis rouvre cette fenêtre pour réessayer.'); } });
    return () => { alive.current = false; request.current += 1; wantedPhoto.current = null; };
  }, [visible, scopeKey, activated]);

  useEffect(() => {
    const event = taskState.event;
    if (!visible || event?.clientId !== String(clientId) || !event.photo) return;
    const key = photoFileKey(event.photo);
    const update = (m) => mapLatestVisitPhotos(m, (photo) => photoFileKey(photo) === key ? { ...photo, ...event.photo } : photo);
    setLatest(update); setReference(update);
    if (wantedPhoto.current === String(event.photo.id) && event.photo.localAvailable) { setViewerPhoto(event.photo.id); wantedPhoto.current = null; }
  }, [taskState.revision, visible, clientId]);

  const taskStatusKey = taskState.tasks.filter((task) => task.clientId === String(clientId))
    .map((task) => `${task.id}:${task.status}`).join('|');
  useEffect(() => {
    if (!visible || !clientId) return undefined;
    let cancelled = false;
    const token = request.current;
    const refresh = async (manifest, setter) => {
      if (!manifest) return;
      const next = await hydrateLatestVisitPhotosCache(clientId, manifest);
      if (!cancelled && alive.current && token === request.current) setter(next);
    };
    if (taskState.tasks.some((task) => task.clientId === String(clientId) && ['done', 'partial', 'paused', 'error'].includes(task.status))) {
      Promise.all([refresh(latest, setLatest), refresh(reference, setReference)]).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [visible, clientId, taskStatusKey]);

  const base = showLatest ? latest : reference || latest;
  const effectiveLocalIds = localIds || (selectedLocal ? [selectedLocal] : null);
  const manifest = useMemo(() => filterLatestVisitPhotos(base, { siteIds, localIds: effectiveLocalIds }), [base, scopeKey, selectedLocal]);
  const needsChoice = requireLocalChoice && !localIds?.length && !selectedLocal;
  const summary = photoSummary(manifest);
  const query = search.trim().toLocaleLowerCase('fr');
  const groups = useMemo(() => (manifest?.sites || []).flatMap((s) => (s.locaux || []).map((l) => ({ ...l, site: s.site,
    photos: l.photos.map((p) => ({ ...p, site: s.site, local: l.local, derniereVisite: l.derniereVisite })) })))
    .filter((g) => !query || `${g.site.nom} ${g.local.designation} ${g.photos.map((p) => p.description || '').join(' ')}`.toLocaleLowerCase('fr').includes(query)), [manifest, query]);
  const availablePhotos = flattenLatestVisitPhotos(manifest).filter((p) => p.localAvailable && p.localUri);
  const newer = reference && latest && referenceSignature(filterLatestVisitPhotos(reference, { siteIds, localIds })) !== referenceSignature(filterLatestVisitPhotos(latest, { siteIds, localIds }));

  const download = (scope = {}, label = null, openPhoto = null) => {
    if (!activated) { setNotice('Une connexion Intranet activée est nécessaire pour récupérer ces photos.'); return; }
    const selected = filterLatestVisitPhotos(manifest, scope), stats = photoSummary(selected);
    if (!stats.missing) return;
    Keyboard.dismiss();
    const name = [contextTitle || client?.nom, label || (siteIds ? 'Sites sélectionnés' : 'Tous les sites')].filter(Boolean).join(' · ');
    wantedPhoto.current = openPhoto == null ? null : String(openPhoto);
    try {
      const task = startPhotoDownload({ clientId, manifest: selected, label: name });
      setNotice('Téléchargement lancé. Tu peux fermer cette fenêtre et continuer ta visite.');
      // Refresh all flags once on completion, including a duplicate already queued request.
      const token = request.current;
      task.completion.then(async () => {
        if (!alive.current || token !== request.current) return;
        const updated = await hydrateLatestVisitPhotosCache(clientId, base);
        if (!alive.current || token !== request.current) return;
        if (!showLatest && reference) setReference(updated); else setLatest(updated);
        if (openPhoto != null) {
          const photo = flattenLatestVisitPhotos(updated).find((p) => String(p.id) === String(openPhoto));
          if (photo?.localAvailable) setViewerPhoto(photo.id);
        }
      }).catch(() => {});
    } catch (e) { setNotice(String(e.message || e)); }
  };
  const onPhoto = (photo) => {
    if (photo.localAvailable && photo.localUri) { setViewerPhoto(photo.id); return; }
    if (!photo.disponible) return;
    if (!activated) { setNotice('Reconnecte la tablette pour récupérer cette photo.'); return; }
    Alert.alert('Enregistrer cette photo ?', `${photo.description || 'Photo de référence'} · ${formatPhotoBytes(photo.tailleOctets)}. Elle sera conservée hors connexion, sans être ajoutée au rapport.`, [
      { text: 'Annuler', style: 'cancel' }, { text: 'Télécharger et ouvrir', onPress: () => download({ photoIds: [photo.id], siteIds: [photo.site.id], localIds: [photo.local.id] }, photo.description, photo.id) },
    ]);
  };
  const chooseLocal = async (localId) => {
    setSelectedLocal(String(localId));
    try { if (pinnedSiteId) await savePhotoLocalChoice(visiteId, contextKey, clientId, pinnedSiteId, localId); }
    catch { setNotice('Le local est affiché, mais son choix n’a pas pu être mémorisé.'); }
  };
  const close = () => { wantedPhoto.current = null; setViewerPhoto(null); onClose?.(); };
  return <>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, { height: '94%', maxHeight: '94%', paddingBottom: 14 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ flex: 1 }}>
          <Text style={{ color: muted, fontSize: 11, fontWeight: '700' }}>{showLatest ? 'INTRANET RÉCENT' : reference ? 'RÉFÉRENCE CONSERVÉE' : 'HISTORIQUE INTRANET'}</Text>
          <Text style={[styles.modalTitle, { marginTop: 4, marginBottom: 3 }]}>Photos de référence</Text>
          <Text style={{ color: muted, fontSize: 12 }}>{contextTitle || client?.nom || 'Client'}</Text>
        </View><Button label="Fermer" onPress={close} /></View>
        <Text style={{ color: muted, fontSize: 11, marginVertical: 7 }}>Cache historique séparé · aucune photo recopiée dans la visite ou le rapport.</Text>
        {reference?.pinnedAt ? <Text style={{ color: muted, fontSize: 11, marginBottom: 5 }}>Référence fixée le {formatPhotoDate(reference.pinnedAt)} pour cette visite.</Text> : null}
        {newer ? <Button label={showLatest ? 'Revenir à la référence conservée' : 'Une version différente existe · la consulter'} onPress={() => { setShowLatest(!showLatest); setViewerPhoto(null); }} /> : null}
        {notice ? <Text accessibilityLiveRegion="polite" style={{ backgroundColor: '#FFF4E8', color: '#805017', padding: 10, fontSize: 12, lineHeight: 17, marginVertical: 7 }}>{notice}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6 }}>
          <TextInput value={search} onChangeText={setSearch} placeholder="Rechercher un site, un local, une photo" accessibilityLabel="Rechercher dans les photos de référence" style={{ flex: 1, minHeight: 48, borderWidth: 1, borderColor: COLORS.line, borderRadius: 9, paddingHorizontal: 10, fontSize: 13 }} />
          <Button label={syncing ? 'Actualisation…' : 'Actualiser'} disabled={!activated || syncing || loading} onPress={refreshManifest} />
        </View>
        {manifest && !needsChoice ? <Text style={{ color: muted, fontSize: 12, marginBottom: 7 }}>{photoStatusLabel(summary)} · volume total restant {formatPhotoBytes(summary.bytes)}{summary.unknownSizes ? ' (taille partiellement inconnue)' : ''}</Text> : null}
        {requireLocalChoice && selectedLocal && !localIds ? <Button label="Changer le local de référence" onPress={() => setSelectedLocal(null)} /> : null}
        {loading || (!base && syncing) ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={COLORS.primary} /><Text style={{ color: muted, marginTop: 10 }}>Chargement des photos…</Text></View>
          : !base ? <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}><Text style={{ color: ink, fontWeight: '700', textAlign: 'center', fontSize: 16 }}>Photos non enregistrées sur cette tablette</Text><Text style={{ color: muted, textAlign: 'center', marginVertical: 12, lineHeight: 20 }}>Une connexion est nécessaire pour les récupérer. Tu peux continuer ta visite sans elles.</Text><Button label="Réessayer" disabled={!activated || syncing} onPress={refreshManifest} /></View>
          : needsChoice ? <FlatList data={groups} keyExtractor={(g) => `${g.site.id}-${g.local.id}`} ListHeaderComponent={<Text style={{ color: ink, paddingVertical: 12 }}>Choisis le local Intranet correspondant. Aucun rapprochement n'est fait automatiquement par le nom.</Text>} renderItem={({ item }) => <View style={{ marginBottom: 7 }}><Button label={`${item.site.nom} · ${item.local.designation}`} onPress={() => chooseLocal(item.local.id)} /></View>} ListEmptyComponent={<Text style={{ color: muted, padding: 12 }}>Aucun local correspondant dans cette référence.</Text>} />
          : <FlatList style={{ flex: 1 }} data={groups} keyExtractor={(g) => `${g.site.id}-${g.local.id}`} renderItem={({ item }) => <LocalPhotoGroup group={item} activated={activated} onPhoto={onPhoto} onDownload={download} />} initialNumToRender={5} maxToRenderPerBatch={5} windowSize={5} removeClippedSubviews={false} keyboardShouldPersistTaps="handled" ListEmptyComponent={<Text style={{ color: muted, padding: 16 }}>{search ? 'Aucun résultat.' : 'Aucun local ni photo dans ce périmètre.'}</Text>} />}
        {showTasks ? <View style={{ maxHeight: 180 }}><FlatList data={[1]} keyExtractor={String} renderItem={() => <PhotoTaskList clientId={clientId} />} /></View> : null}
        {taskState.tasks.some((t) => t.clientId === String(clientId)) ? <Button label={showTasks ? 'Masquer le suivi' : 'Suivre / mettre en pause les téléchargements'} onPress={() => setShowTasks(!showTasks)} /> : null}
        {manifest && !needsChoice ? <Button primary disabled={!activated || !summary.missing || loading} label={summary.missing ? `Télécharger ${siteIds ? 'ce périmètre' : 'tout le client'} · ${summary.missing} photos · ${formatPhotoBytes(summary.bytes)}` : summary.total ? 'Aucune photo disponible restante à télécharger' : 'Aucune photo dans cette référence'} onPress={() => download()} /> : null}
      </View></View>
    </Modal>
    <ReferencePhotoViewer photos={availablePhotos} photoId={visible ? viewerPhoto : null} onClose={() => setViewerPhoto(null)} onSelect={setViewerPhoto} />
  </>;
}
export { ClientLatestVisitPhotosModal, formatPhotoBytes as formatBytes };
