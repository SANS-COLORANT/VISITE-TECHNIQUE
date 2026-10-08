/**
 * Onglet Photos (refonte build 661, docs/refonte-visite-661/README.md §5.8).
 *
 * - en-tête : nombre de photos, « Photo générale », filtres par origine ;
 * - groupes par origine (déduite de `entite_key`) fermés au départ, avec trois
 *   mini-vignettes dans la bannière ; un filtre actif ouvre son groupe ;
 * - grille de trois colonnes (plus sur grande tablette) avec légende ;
 * - liste virtualisée (une rangée de vignettes par cellule), pré-chargement
 *   caméra, index photo partagé (photoRuntimeCache) et journal d'attente
 *   (photoPersistenceJournal) inchangés ;
 * - visionneuse : légende, précédente / suivante, HD, suppression confirmée
 *   puis annulable quelques secondes.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ajouterPhoto } from './db.js';
import { supprimerPhotoComplete } from './photoDb.js';
import { prendrePhoto, preparerPhotoNommee } from './PhotoButton.js';
import { COLORS, FONTS, styles } from './styles.js';
import { PhotoVariantImage } from './PhotoVariantImage.js';
import { confirmerPhotoJournalisee, journaliserPhotoEnAttente } from './photoPersistenceJournal.js';
import { beginExternalSave, endExternalSave } from './saveActivity.js';
import { useListScrollMemory } from './useListScrollMemory.js';
import { prewarmCameraRuntime } from './cameraRuntime.js';
import { prewarmPhotoCaptureContext } from './photoCaptureContext.js';
import { loadVisitPhotos, peekVisitPhotos, removeRuntimePhoto, replaceRuntimePhoto, subscribeVisitPhotos, upsertRuntimePhoto } from './photoRuntimeCache.js';
import { EmptyIcon } from './EmptyState.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { Picto, originePhoto, PHOTO_ORIGINES } from './MetraPictos.js';
import { KIT, SectionBanner, confirmer, teinte, useSectionsOuvertes } from './VisitKit.js';
import { showToast } from './PremiumDialogs.js';
import { hapticTick } from './fieldFeedback.js';

const ESPACE = 8;
const PADDING_CARTE = 10;
const DELAI_ANNULATION_MS = 4500;

// Suppressions confirmées mais encore annulables (photoId → minuterie).
const suppressionsEnAttente = new Map();

function legendePhoto(photo) {
  const brut = String(photo?.label || '').split('||')[0].trim();
  return brut || 'Photo';
}

function libelleOrigine(key) {
  return PHOTO_ORIGINES.find((o) => o.key === key)?.label || 'Photos';
}

const PhotoTile = memo(function PhotoTile({ photo, taille, onPress }) {
  const legende = legendePhoto(photo);
  return (
    <TouchableOpacity
      style={[styles.photoThumb, st.tile, { width: taille, height: taille }]}
      onPress={() => onPress(photo)}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir ${legende}`}
    >
      <PhotoVariantImage
        uri={photo.uri}
        variant={photo.pending ? 'original' : 'thumb'}
        style={[styles.photoThumbImg, { width: '100%', height: '100%' }]}
        resizeMode="cover"
      />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.62)']} style={st.tileCaption} pointerEvents="none">
        <Text numberOfLines={1} style={st.tileCaptionText}>{legende}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
});

const MiniVignettes = memo(function MiniVignettes({ photos }) {
  const premieres = photos.slice(0, 3);
  if (!premieres.length) return null;
  return (
    <View style={st.minis} pointerEvents="none">
      {premieres.map((p, i) => (
        <View key={String(p.id)} style={[st.mini, i > 0 && { marginLeft: -9 }]}>
          <PhotoVariantImage uri={p.uri} variant={p.pending ? 'original' : 'thumb'} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        </View>
      ))}
    </View>
  );
});

function OptimizedPhotoPanel({ visiteId, onAllerAElement }) {
  const { width } = useWindowDimensions();
  const [photos, setPhotos] = useState(() => peekVisitPhotos(visiteId) || []);
  const [viewerPhoto, setViewerPhoto] = useState(null);
  const [viewerHd, setViewerHd] = useState(false);
  const [cameraEnCours, setCameraEnCours] = useState(false);
  const [filtre, setFiltre] = useState('toutes');
  const sections = useSectionsOuvertes(`${visiteId}:p-photos`);
  const { listRef, onScroll } = useListScrollMemory(`visit-panel:${visiteId}:p-photos`, photos.length);

  useEffect(() => {
    let alive = true;
    const cached = peekVisitPhotos(visiteId);
    if (cached) setPhotos(cached);
    const unsubscribe = subscribeVisitPhotos(visiteId, (rows) => {
      if (!alive) return;
      setPhotos(rows);
      setViewerPhoto((current) => {
        if (!current) return null;
        const byId = rows.find((row) => String(row.id) === String(current.id));
        if (byId) return byId;
        return current.pending ? current : null;
      });
    });
    if (!cached) loadVisitPhotos(visiteId).catch(() => {});
    prewarmCameraRuntime().catch(() => {});
    prewarmPhotoCaptureContext(visiteId).catch(() => {});
    return () => { alive = false; unsubscribe(); };
  }, [visiteId]);

  // Trois colonnes sur téléphone, davantage sur grande tablette.
  const colonnes = width >= 1200 ? 6 : width >= 900 ? 5 : width >= 600 ? 4 : 3;
  const largeurDisponible = Math.max(240, width - (width >= 900 ? 270 : 36));
  const taille = useMemo(
    () => Math.max(84, Math.floor((largeurDisponible - 2 - PADDING_CARTE * 2 - ESPACE * (colonnes - 1)) / colonnes)),
    [largeurDisponible, colonnes]
  );

  const groupes = useMemo(() => {
    const parOrigine = new Map(PHOTO_ORIGINES.map((o) => [o.key, []]));
    for (const p of photos) {
      const key = originePhoto(p.entite_key);
      (parOrigine.get(key) || parOrigine.get('conformite')).push(p);
    }
    return PHOTO_ORIGINES.map((o) => ({ ...o, photos: parOrigine.get(o.key) || [] })).filter((g) => g.photos.length);
  }, [photos]);

  const filtreEffectif = filtre !== 'toutes' && groupes.some((g) => g.key === filtre) ? filtre : 'toutes';

  // Groupes fermés au départ ; l'état est gardé pendant la session (VisitKit).
  const ouvertesSignature = PHOTO_ORIGINES.map((o) => (sections.isOpen(o.key) ? '1' : '0')).join('');

  // Une cellule = une bannière de groupe ou une rangée de vignettes : la liste reste virtualisée.
  const { cellules, visibles } = useMemo(() => {
    const out = [];
    const ordre = [];
    for (const g of groupes) {
      if (filtreEffectif !== 'toutes' && g.key !== filtreEffectif) continue;
      const open = filtreEffectif !== 'toutes' || ouvertesSignature[PHOTO_ORIGINES.findIndex((o) => o.key === g.key)] === '1';
      out.push({ type: 'head', key: `h:${g.key}`, groupe: g, open });
      if (!open) continue;
      ordre.push(...g.photos);
      for (let i = 0; i < g.photos.length; i += colonnes) {
        out.push({ type: 'row', key: `r:${g.key}:${i}`, photos: g.photos.slice(i, i + colonnes), last: i + colonnes >= g.photos.length });
      }
    }
    return { cellules: out, visibles: ordre };
  }, [groupes, filtreEffectif, ouvertesSignature, colonnes]);

  // Navigation de la visionneuse : photos affichées, sinon toutes.
  const navigation = useMemo(() => {
    if (viewerPhoto && visibles.some((p) => String(p.id) === String(viewerPhoto.id))) return visibles;
    return groupes.flatMap((g) => g.photos);
  }, [visibles, groupes, viewerPhoto]);
  const viewerIndex = viewerPhoto ? navigation.findIndex((p) => String(p.id) === String(viewerPhoto.id)) : -1;

  const ouvrir = useCallback((photo) => { setViewerHd(false); setViewerPhoto(photo); }, []);
  const deplacer = useCallback((dir) => {
    if (!navigation.length) return;
    const base = viewerIndex < 0 ? 0 : viewerIndex;
    const next = navigation[(base + dir + navigation.length) % navigation.length];
    if (next) { setViewerHd(false); setViewerPhoto(next); }
  }, [navigation, viewerIndex]);

  const onAjouter = useCallback(async () => {
    if (cameraEnCours) return;
    setCameraEnCours(true);
    prewarmPhotoCaptureContext(visiteId).catch(() => {});
    let captureUri = null;
    try {
      captureUri = await prendrePhoto();
    } catch (e) {
      Alert.alert('Erreur photo', String(e?.message || e));
    } finally {
      // Le bouton redevient disponible dès le retour de l'appareil photo.
      setCameraEnCours(false);
    }
    if (!captureUri) return;

    const tempId = `photo-pending:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
    const optimistic = {
      id: tempId,
      visite_id: visiteId,
      entite_key: null,
      uri: captureUri,
      label: 'Photo générale',
      cree_le: new Date().toISOString(),
      pending: true,
    };
    upsertRuntimePhoto(visiteId, optimistic);

    // Toute la persistance est découplée du retour caméra pour permettre une
    // nouvelle prise immédiatement, y compris en série.
    void (async () => {
      const saveKey = `photo-panel:${visiteId}:${Date.now()}`;
      let journalKey = null;
      beginExternalSave(saveKey);
      try {
        const photo = await preparerPhotoNommee({
          visiteId,
          entiteKey: null,
          label: 'Photo générale',
          uri: captureUri,
        });
        if (!photo.uri) throw new Error('Photo non préparée');
        const labelDb = photo.nom ? `Photo générale||${photo.nom}` : 'Photo générale';

        replaceRuntimePhoto(visiteId, tempId, {
          ...optimistic,
          id: tempId,
          uri: photo.uri,
          label: labelDb,
          pending: true,
        });

        journalKey = await journaliserPhotoEnAttente({ visiteId, entiteKey: null, uri: photo.uri, labelDb });
        const photoId = await ajouterPhoto(visiteId, null, photo.uri, labelDb);
        await confirmerPhotoJournalisee(journalKey).catch(() => {});
        journalKey = null;

        replaceRuntimePhoto(visiteId, tempId, {
          id: photoId,
          visite_id: visiteId,
          entite_key: null,
          uri: photo.uri,
          label: labelDb,
          cree_le: new Date().toISOString(),
          pending: false,
        });
        endExternalSave(saveKey);
      } catch (e) {
        if (!journalKey) removeRuntimePhoto(visiteId, tempId);
        endExternalSave(saveKey, e);
        Alert.alert('Erreur photo', String(e?.message || e));
      }
    })();
  }, [cameraEnCours, visiteId]);

  // Suppression confirmée, puis différée de quelques secondes pour permettre « Annuler ».
  const supprimerSelection = useCallback(() => {
    if (!viewerPhoto?.id || viewerPhoto.pending) return;
    const photo = { ...viewerPhoto };
    confirmer({
      title: 'Supprimer cette photo ?',
      message: 'La photo sera retirée de la visite et supprimée du stockage local de la tablette.',
      onConfirm: () => {
        setViewerPhoto(null);
        removeRuntimePhoto(visiteId, photo.id);
        const timer = setTimeout(async () => {
          suppressionsEnAttente.delete(photo.id);
          try {
            await supprimerPhotoComplete(photo.id);
            removeRuntimePhoto(visiteId, photo.id);
          } catch (e) {
            upsertRuntimePhoto(visiteId, photo);
            Alert.alert('Suppression impossible', String(e?.message || e));
          }
        }, DELAI_ANNULATION_MS);
        suppressionsEnAttente.set(photo.id, timer);
        showToast('Photo supprimée', {
          duration: DELAI_ANNULATION_MS - 500,
          action: {
            label: 'Annuler',
            onPress: () => {
              const t = suppressionsEnAttente.get(photo.id);
              if (!t) return;
              clearTimeout(t);
              suppressionsEnAttente.delete(photo.id);
              upsertRuntimePhoto(visiteId, photo);
            },
          },
        });
      },
    });
  }, [viewerPhoto, visiteId]);

  const t = teinte(false);
  const header = useMemo(() => (
    <View>
      <View style={st.headRow}>
        <Text style={st.headTitle}>{photos.length} photo{photos.length > 1 ? 's' : ''}</Text>
        <TouchableOpacity
          style={[st.addBtn, { borderColor: t.solid + '55', backgroundColor: t.light }, cameraEnCours && { opacity: 0.55 }]}
          onPressIn={() => { prewarmCameraRuntime().catch(() => {}); prewarmPhotoCaptureContext(visiteId).catch(() => {}); }}
          onPress={onAjouter}
          disabled={cameraEnCours}
          accessibilityRole="button"
          accessibilityLabel="Ajouter une photo générale"
        >
          <CvcIcon name="camera" size={16} color={t.dark} strokeWidth={2.2} />
          <Text style={[st.addBtnText, { color: t.dark }]}>{cameraEnCours ? 'Appareil photo…' : 'Photo générale'}</Text>
        </TouchableOpacity>
      </View>
      {groupes.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filters} keyboardShouldPersistTaps="handled">
          {[{ key: 'toutes', label: 'Toutes', count: photos.length }, ...groupes.map((g) => ({ key: g.key, label: g.label, count: g.photos.length, picto: g.picto }))].map((o) => {
            const on = o.key === filtreEffectif;
            return (
              <TouchableOpacity
                key={o.key}
                onPress={() => { hapticTick(); setFiltre(o.key); }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[st.filter, on && { backgroundColor: t.solid, borderColor: t.solid }]}
              >
                {o.picto ? <Picto name={o.picto} size={15} mono={on ? COLORS.white : undefined} /> : null}
                <Text style={[st.filterText, on && { color: COLORS.white }]}>{o.label}</Text>
                <Text style={[st.filterCount, on && { color: COLORS.white }]}>{o.count}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  ), [photos.length, groupes, filtreEffectif, cameraEnCours, onAjouter, visiteId, t]);

  const renderItem = useCallback(({ item }) => {
    if (item.type === 'head') {
      const g = item.groupe;
      const n = g.photos.length;
      return (
        <View style={[st.card, item.open ? st.cardTop : st.cardAlone]}>
          <SectionBanner
            picto={g.picto}
            title={g.label}
            subtitle={`${n} photo${n > 1 ? 's' : ''}`}
            open={item.open}
            onToggle={() => {
              if (filtreEffectif !== 'toutes') { setFiltre('toutes'); sections.open([g.key]); return; }
              sections.toggle(g.key);
            }}
            right={<MiniVignettes photos={g.photos} />}
          />
        </View>
      );
    }
    return (
      <View style={[st.card, st.cardRow, item.last && st.cardBottom]}>
        {item.photos.map((p) => <PhotoTile key={String(p.id)} photo={p} taille={taille} onPress={ouvrir} />)}
      </View>
    );
  }, [taille, ouvrir, sections, filtreEffectif]);

  const origineViewer = viewerPhoto ? libelleOrigine(originePhoto(viewerPhoto.entite_key)) : '';

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={cellules}
        onScroll={onScroll}
        scrollEventThrottle={100}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        contentContainerStyle={styles.panelContent}
        ListHeaderComponent={header}
        ListEmptyComponent={<View style={styles.empty}><EmptyIcon name="remark" /><Text style={styles.emptyText}>Aucune photo pour cette visite.</Text><Text style={styles.emptySub}>Les photos prises depuis les équipements, réserves et compteurs apparaîtront aussi ici.</Text></View>}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
      />

      <Modal visible={!!viewerPhoto} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setViewerPhoto(null)}>
        <View style={[styles.viewerOverlay, st.viewer]}>
          <View style={st.viewerHead}>
            <TouchableOpacity accessibilityLabel="Fermer" onPress={() => setViewerPhoto(null)} style={st.viewerRound}>
              <CvcIcon name="close" size={18} color={COLORS.white} strokeWidth={2.2} />
            </TouchableOpacity>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={2} style={st.viewerTitle}>{viewerPhoto ? legendePhoto(viewerPhoto) : ''}</Text>
              <Text numberOfLines={1} style={st.viewerSub}>{origineViewer}{viewerIndex >= 0 ? ` · ${viewerIndex + 1} / ${navigation.length}` : ''}</Text>
            </View>
            <TouchableOpacity onPress={() => setViewerHd((v) => !v)} style={[st.viewerPill, viewerHd && { backgroundColor: COLORS.white }]} accessibilityRole="button" accessibilityState={{ selected: viewerHd }}>
              <Text style={[st.viewerPillText, viewerHd && { color: COLORS.ink }]}>HD</Text>
            </TouchableOpacity>
          </View>
          <View style={st.viewerImgWrap}>
            {viewerPhoto ? <PhotoVariantImage uri={viewerPhoto.uri} variant={viewerPhoto.pending || viewerHd ? 'original' : 'preview'} style={st.viewerImg} resizeMode="contain" /> : null}
          </View>
          <View style={st.viewerBar}>
            <TouchableOpacity accessibilityLabel="Photo précédente" disabled={navigation.length < 2} onPress={() => deplacer(-1)} style={[st.viewerNav, navigation.length < 2 && { opacity: 0.35 }]}>
              <CvcIcon name="chevron-left" size={22} color={COLORS.white} strokeWidth={2.4} />
            </TouchableOpacity>
            {onAllerAElement && viewerPhoto?.entite_key ? (
              <TouchableOpacity style={st.viewerBtn} onPress={() => { const p = viewerPhoto; setViewerPhoto(null); onAllerAElement(p); }} accessibilityRole="button">
                <Text numberOfLines={1} style={st.viewerBtnText}>Aller à l’élément</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[st.viewerBtn, viewerPhoto?.pending && { opacity: 0.4 }]} disabled={!!viewerPhoto?.pending} onPress={supprimerSelection} accessibilityRole="button">
              <CvcIcon name="trash" size={16} color="#F4A493" strokeWidth={2.2} />
              <Text numberOfLines={1} style={[st.viewerBtnText, { color: '#F4A493' }]}>Supprimer</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityLabel="Photo suivante" disabled={navigation.length < 2} onPress={() => deplacer(1)} style={[st.viewerNav, navigation.length < 2 && { opacity: 0.35 }]}>
              <CvcIcon name="chevron-right" size={22} color={COLORS.white} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  headTitle: { fontSize: 18, fontFamily: FONTS.black, color: COLORS.ink },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, minHeight: 36 },
  addBtnText: { fontSize: 12.5, fontFamily: FONTS.bodyBold },
  filters: { gap: 6, paddingBottom: 12 },
  filter: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(22,21,15,0.12)', backgroundColor: KIT.card },
  filterText: { fontSize: 12.5, fontFamily: FONTS.bodySemi, color: COLORS.ink },
  filterCount: { fontSize: 11.5, fontFamily: FONTS.semi, color: COLORS.inkSoft },

  // Carte d'un groupe découpée en cellules (bannière + rangées) pour rester virtualisée.
  card: { backgroundColor: KIT.card, borderColor: KIT.border, borderLeftWidth: 1, borderRightWidth: 1 },
  cardAlone: { borderWidth: 1, borderRadius: 18, marginBottom: 10 },
  cardTop: { borderTopWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  cardRow: { flexDirection: 'row', gap: ESPACE, paddingHorizontal: PADDING_CARTE, paddingBottom: ESPACE },
  cardBottom: { borderBottomWidth: 1, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, paddingBottom: PADDING_CARTE, marginBottom: 10 },

  tile: { overflow: 'hidden', borderRadius: 12 },
  tileCaption: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 7, paddingTop: 14, paddingBottom: 5 },
  tileCaptionText: { fontSize: 11, fontFamily: FONTS.bodySemi, color: COLORS.white },
  minis: { flexDirection: 'row', alignItems: 'center' },
  mini: { width: 24, height: 24, borderRadius: 7, overflow: 'hidden', borderWidth: 1.5, borderColor: KIT.card, backgroundColor: '#EFEBE4' },

  viewer: { justifyContent: 'flex-start', alignItems: 'stretch', paddingTop: 36, paddingBottom: 22, paddingHorizontal: 14 },
  viewerHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12 },
  viewerRound: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  viewerTitle: { fontSize: 15.5, fontFamily: FONTS.bold, color: COLORS.white },
  viewerSub: { fontSize: 12, fontFamily: FONTS.bodyMedium, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  viewerPill: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.14)' },
  viewerPillText: { fontSize: 12.5, fontFamily: FONTS.bodyBold, color: COLORS.white },
  viewerImgWrap: { flex: 1, borderRadius: 18, overflow: 'hidden' },
  viewerImg: { width: '100%', height: '100%' },
  viewerBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12 },
  viewerNav: { width: 52, height: 50, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  viewerBtn: { flex: 1, flexDirection: 'row', gap: 7, minHeight: 50, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  viewerBtnText: { fontSize: 13.5, fontFamily: FONTS.bodyBold, color: COLORS.white },
});

export { OptimizedPhotoPanel };
