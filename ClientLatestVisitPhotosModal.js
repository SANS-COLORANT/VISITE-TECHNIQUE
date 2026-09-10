import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { flattenLatestVisitPhotos } from './latestVisitPhotosDb.js';
import {
  downloadClientLatestVisitPhotos,
  loadCachedLatestVisitPhotos,
  syncLatestVisitPhotosManifest,
} from './latestVisitPhotosStorage.js';

const SURFACE = '#FFFFFF';
const BORDER = '#E6E8EC';
const INK = COLORS.ink || '#17212B';
const MUTED = COLORS.muted || '#667085';
const ACCENT = COLORS.orange || '#E86F2D';
const SUCCESS = '#16794B';

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Ko`;
  return `${(bytes / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}

function formatDate(value) {
  if (!value) return 'Date non renseignée';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('fr-FR');
}

function manifestGroups(manifest) {
  const groups = [];
  for (const siteEntry of manifest?.sites || []) {
    for (let index = 0; index < (siteEntry.locaux || []).length; index += 1) {
      const localEntry = siteEntry.locaux[index];
      groups.push({
        id: `${siteEntry.site?.id || 'site'}-${localEntry.local?.id || index}`,
        site: siteEntry.site,
        local: localEntry.local,
        derniereVisite: localEntry.derniereVisite,
        photos: localEntry.photos || [],
        firstOfSite: index === 0,
      });
    }
    if (!(siteEntry.locaux || []).length) {
      groups.push({ id: `${siteEntry.site?.id || 'site'}-empty`, site: siteEntry.site, local: null, derniereVisite: null, photos: [], firstOfSite: true });
    }
  }
  return groups;
}

const PhotoThumbnail = memo(function PhotoThumbnail({ photo, onPress }) {
  const availableLocally = Boolean(photo.localAvailable && photo.localUri);
  return <TouchableOpacity
    disabled={!availableLocally}
    onPress={() => onPress(photo)}
    activeOpacity={0.82}
    accessibilityRole="button"
    accessibilityLabel={availableLocally ? `Ouvrir ${photo.description || 'la photo'}` : 'Photo à télécharger'}
    style={{ width: 126, marginRight: 9 }}
  >
    <View style={{ width: 126, height: 92, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: availableLocally ? '#D9DEE5' : BORDER, backgroundColor: '#F3F5F7', alignItems: 'center', justifyContent: 'center' }}>
      {availableLocally
        ? <Image source={{ uri: photo.localUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" resizeMethod="resize" fadeDuration={0} />
        : <><Text style={{ fontSize: 22, color: photo.disponible ? ACCENT : '#98A2B3' }}>{photo.downloadStatus === 'error' ? '!' : '▧'}</Text><Text style={{ color: MUTED, fontSize: 10.5, fontWeight: '800', marginTop: 4 }}>{photo.disponible ? 'À télécharger' : 'Indisponible'}</Text></>}
    </View>
    <Text numberOfLines={2} style={{ color: INK, fontSize: 11.5, lineHeight: 15, marginTop: 5 }}>{photo.description || `Photo ${Number(photo.ordre || 0) + 1}`}</Text>
    {photo.downloadStatus === 'error' ? <Text numberOfLines={1} style={{ color: '#B42318', fontSize: 10, marginTop: 2 }}>Échec du téléchargement</Text> : null}
  </TouchableOpacity>;
});

const LocalPhotoGroup = memo(function LocalPhotoGroup({ group, onOpenPhoto }) {
  const address = [group.site?.adresse, group.site?.codePostal, group.site?.ville].filter(Boolean).join(' · ');
  return <View style={{ marginBottom: 15 }}>
    {group.firstOfSite ? <View style={{ marginBottom: 7 }}>
      <Text style={{ color: ACCENT, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 }}>SITE</Text>
      <Text style={{ color: INK, fontSize: 15, fontWeight: '900', marginTop: 2 }}>{group.site?.nom || 'Site'}</Text>
      {address ? <Text style={{ color: MUTED, fontSize: 11.5, marginTop: 2 }}>{address}</Text> : null}
    </View> : null}
    <View style={{ backgroundColor: '#F8F9FB', borderRadius: 14, borderWidth: 1, borderColor: '#ECEEF1', padding: 11 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: INK, fontSize: 13, fontWeight: '900' }}>{group.local?.designation || 'Aucun local recensé'}</Text>
          <Text style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{group.derniereVisite ? `Dernière visite du ${formatDate(group.derniereVisite.date)} · ${group.derniereVisite.statut || 'statut non renseigné'}` : 'Aucune visite disponible'}</Text>
        </View>
        <Text style={{ color: MUTED, fontSize: 11, fontWeight: '800' }}>{group.photos.length} photo{group.photos.length > 1 ? 's' : ''}</Text>
      </View>
      {group.photos.length ? <FlatList
        horizontal
        data={group.photos}
        keyExtractor={(photo) => String(photo.id)}
        renderItem={({ item }) => <PhotoThumbnail photo={item} onPress={onOpenPhoto} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 10, paddingRight: 3 }}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={3}
      /> : <Text style={{ color: '#98A2B3', fontSize: 11.5, fontStyle: 'italic', marginTop: 9 }}>Aucune photo pour la dernière visite de ce local.</Text>}
    </View>
  </View>;
});

function ClientLatestVisitPhotosModal({ visible, client, activated, onClose }) {
  const remoteClientId = client?.remote_client_id;
  const [manifest, setManifest] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [notice, setNotice] = useState(null);
  const [viewerPhoto, setViewerPhoto] = useState(null);
  const syncRequestRef = useRef(0);

  const refreshManifest = useCallback(async ({ quiet = false } = {}) => {
    if (!remoteClientId || !activated) return null;
    const requestId = ++syncRequestRef.current;
    setSyncing(true);
    if (!quiet) setNotice(null);
    try {
      const next = await syncLatestVisitPhotosManifest(remoteClientId);
      if (requestId === syncRequestRef.current) setManifest(next);
      return next;
    } catch (error) {
      if (requestId === syncRequestRef.current) setNotice({ tone: 'warning', text: `${String(error?.message || error)} Les photos déjà enregistrées restent accessibles hors connexion.` });
      return null;
    } finally {
      if (requestId === syncRequestRef.current) setSyncing(false);
    }
  }, [activated, remoteClientId]);

  useEffect(() => {
    if (!visible || !remoteClientId) return undefined;
    let active = true;
    syncRequestRef.current += 1;
    setManifest(null);
    setProgress(null);
    setNotice(null);
    setViewerPhoto(null);
    (async () => {
      const cached = await loadCachedLatestVisitPhotos(remoteClientId);
      if (!active) return;
      setManifest(cached);
      if (activated) await refreshManifest({ quiet: Boolean(cached) });
    })().catch((error) => {
      if (active) setNotice({ tone: 'warning', text: String(error?.message || error) });
    });
    return () => { active = false; syncRequestRef.current += 1; };
  }, [activated, refreshManifest, remoteClientId, visible]);

  const photos = useMemo(() => flattenLatestVisitPhotos(manifest), [manifest]);
  const groups = useMemo(() => manifestGroups(manifest), [manifest]);
  const missingPhotos = useMemo(() => photos.filter((photo) => photo.disponible && !photo.localAvailable), [photos]);
  const missingBytes = useMemo(() => missingPhotos.reduce((total, photo) => total + Number(photo.tailleOctets || 0), 0), [missingPhotos]);
  const localCount = photos.filter((photo) => photo.localAvailable).length;
  const unavailableCount = photos.filter((photo) => !photo.disponible && !photo.localAvailable).length;

  const downloadAll = async () => {
    if (!manifest || !remoteClientId || downloading || !missingPhotos.length) return;
    setDownloading(true);
    setProgress(null);
    setNotice(null);
    try {
      const result = await downloadClientLatestVisitPhotos(remoteClientId, manifest, setProgress);
      setManifest(result.manifest);
      setNotice(result.failed
        ? { tone: 'warning', text: `${result.downloaded} photo(s) téléchargée(s), ${result.failed} en échec. Une nouvelle tentative reprendra uniquement les fichiers manquants.` }
        : { tone: 'success', text: `${result.downloaded} photo(s) enregistrée(s) dans le stockage privé de METRA.` });
    } catch (error) {
      setNotice({ tone: 'warning', text: String(error?.message || error) });
    } finally { setDownloading(false); }
  };

  const footerLabel = downloading
    ? `Téléchargement ${progress?.completed || 0}/${progress?.total || missingPhotos.length}`
    : missingPhotos.length
      ? `Télécharger ${missingPhotos.length} photo${missingPhotos.length > 1 ? 's' : ''} · ${formatBytes(missingBytes)}`
      : localCount
        ? 'Toutes les photos disponibles sont hors connexion'
        : 'Aucune photo disponible à télécharger';

  return <>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!downloading) onClose?.(); }}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, { height: '94%', maxHeight: '94%', borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ color: ACCENT, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }}>HISTORIQUE INTRANET</Text>
            <Text style={[styles.modalTitle, { marginTop: 4 }]}>Photos des dernières visites</Text>
            <Text style={styles.cardSub}>{client?.nom || manifest?.client?.nom || 'Client'}</Text>
          </View>
          <TouchableOpacity disabled={downloading} onPress={onClose} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: downloading ? 0.45 : 1 }}><Text style={{ color: MUTED, fontSize: 19 }}>✕</Text></TouchableOpacity>
        </View>

        {manifest ? <View style={{ backgroundColor: '#F8F9FB', borderRadius: 15, borderWidth: 1, borderColor: '#ECEEF1', padding: 12, marginTop: 14, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Text style={{ color: INK, fontSize: 19, fontWeight: '900' }}>{manifest.nombreSites}</Text><Text style={{ color: MUTED, fontSize: 10.5 }}>sites</Text></View>
            <View style={{ flex: 1 }}><Text style={{ color: INK, fontSize: 19, fontWeight: '900' }}>{manifest.nombrePhotosDisponibles}</Text><Text style={{ color: MUTED, fontSize: 10.5 }}>photos disponibles</Text></View>
            <View style={{ flex: 1 }}><Text style={{ color: INK, fontSize: 19, fontWeight: '900' }}>{formatBytes(manifest.volumePhotosDisponibles)}</Text><Text style={{ color: MUTED, fontSize: 10.5 }}>volume total</Text></View>
            <View style={{ flex: 1 }}><Text style={{ color: SUCCESS, fontSize: 19, fontWeight: '900' }}>{localCount}</Text><Text style={{ color: MUTED, fontSize: 10.5 }}>hors connexion</Text></View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            <Text style={{ color: MUTED, fontSize: 10.5 }}>{manifest.syncedAt ? `Manifeste actualisé le ${new Date(manifest.syncedAt).toLocaleString('fr-FR')}` : 'Manifeste enregistré localement'}</Text>
            {activated ? <TouchableOpacity disabled={syncing || downloading} onPress={() => refreshManifest()} style={{ paddingHorizontal: 8, paddingVertical: 5 }}>{syncing ? <ActivityIndicator size="small" /> : <Text style={{ color: ACCENT, fontSize: 11.5, fontWeight: '900' }}>↻ Actualiser</Text>}</TouchableOpacity> : null}
          </View>
        </View> : null}

        {notice ? <View style={{ backgroundColor: notice.tone === 'success' ? '#EAF8F1' : '#FFF4E8', borderWidth: 1, borderColor: notice.tone === 'success' ? '#CDEEDF' : '#F3D9B8', borderRadius: 12, padding: 10, marginBottom: 9 }}><Text style={{ color: notice.tone === 'success' ? SUCCESS : '#9A4C0A', fontSize: 11.5, lineHeight: 16 }}>{notice.text}</Text></View> : null}
        {unavailableCount ? <Text style={{ color: '#9A4C0A', fontSize: 11, marginBottom: 8 }}>{unavailableCount} référence{unavailableCount > 1 ? 's' : ''} indisponible{unavailableCount > 1 ? 's' : ''} sur le serveur — le reste du chargement peut continuer.</Text> : null}

        {!manifest && (syncing || activated) ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={ACCENT} /><Text style={{ color: MUTED, fontSize: 12, marginTop: 10 }}>Chargement du manifeste…</Text></View> : null}
        {!manifest && !activated ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}><Text style={{ color: INK, fontSize: 15, fontWeight: '900', textAlign: 'center' }}>Aucune photo enregistrée hors connexion</Text><Text style={{ color: MUTED, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 8 }}>Active la tablette et reconnecte-la pour charger une première fois les photos de ce client.</Text></View> : null}
        {manifest ? <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 12 }}
          data={groups}
          keyExtractor={(group) => group.id}
          renderItem={({ item }) => <LocalPhotoGroup group={item} onOpenPhoto={setViewerPhoto} />}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          updateCellsBatchingPeriod={40}
          windowSize={5}
          removeClippedSubviews={false}
        /> : null}

        {manifest ? <View style={{ flexShrink: 0, borderTopWidth: 1, borderTopColor: '#EEF0F2', paddingTop: 10, backgroundColor: SURFACE }}>
          <TouchableOpacity
            disabled={downloading || !missingPhotos.length || !activated}
            onPress={downloadAll}
            style={[styles.btnPrimary, { flex: 0, minHeight: 50, alignItems: 'center', justifyContent: 'center', opacity: downloading || !missingPhotos.length || !activated ? 0.58 : 1 }]}
          >
            {downloading ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><ActivityIndicator color="#FFF" /><Text style={styles.btnPrimaryText}>{footerLabel}</Text></View> : <Text style={styles.btnPrimaryText}>{footerLabel}</Text>}
          </TouchableOpacity>
          {!activated && missingPhotos.length ? <Text style={{ color: MUTED, fontSize: 10.5, textAlign: 'center', marginTop: 6 }}>Connexion sécurisée requise pour télécharger les fichiers manquants.</Text> : null}
          <Text style={{ color: MUTED, fontSize: 10.5, textAlign: 'center', marginTop: 6 }}>Cache historique séparé · aucune photo n’est recopiée dans une nouvelle visite.</Text>
        </View> : null}
      </View></View>
    </Modal>

    <Modal visible={!!viewerPhoto} transparent animationType="fade" onRequestClose={() => setViewerPhoto(null)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(9,14,20,0.96)', alignItems: 'center', justifyContent: 'center' }}>
        <TouchableOpacity activeOpacity={1} onPress={() => setViewerPhoto(null)} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
        {viewerPhoto?.localUri ? <Image source={{ uri: viewerPhoto.localUri }} style={{ width: '94%', height: '72%' }} resizeMode="contain" /> : null}
        <View style={{ position: 'absolute', left: 20, right: 20, bottom: 24, backgroundColor: 'rgba(18,24,31,0.94)', borderRadius: 15, padding: 13 }}>
          <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '900' }}>{viewerPhoto?.description || 'Photo de visite'}</Text>
          <Text style={{ color: '#D0D5DD', fontSize: 11.5, lineHeight: 17, marginTop: 4 }}>{[viewerPhoto?.site?.nom, viewerPhoto?.local?.designation, viewerPhoto?.derniereVisite?.date ? `visite du ${formatDate(viewerPhoto.derniereVisite.date)}` : null].filter(Boolean).join(' · ')}</Text>
          <TouchableOpacity onPress={() => setViewerPhoto(null)} style={{ alignSelf: 'flex-end', marginTop: 9, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 10, backgroundColor: ACCENT }}><Text style={{ color: '#FFF', fontWeight: '900' }}>Fermer</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  </>;
}

export { ClientLatestVisitPhotosModal, formatBytes };
