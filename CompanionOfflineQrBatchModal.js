import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { COLORS, styles } from './styles.js';
import { buildCompanionOfflineClientSnapshot } from './companionData.js';
import { buildOfflineClientQrBatch } from './companionOfflineQr.js';
import { generateCompanionQr } from './companionNative.js';
import { listTabletQrBatches, saveTabletQrBatch } from './companionQrArchive.js';
import { getRuntimeAccent, getRuntimePalette } from './visual-packs/runtime/visualPaletteRuntime.js';

function dateCourte(value) {
  const text = String(value || '');
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text.slice(0, 10);
  return date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function CompanionOfflineQrBatchModal({ visible, clientId, nomClient, onClose }) {
  const { width } = useWindowDimensions();
  const accent = getRuntimeAccent();
  const palette = getRuntimePalette();
  const light = palette.light || COLORS.orangeLight;
  const pageWidth = Math.min(Math.max(300, width - 56), 620);
  const listRef = useRef(null);

  const [batches, setBatches] = useState([]);
  const [batch, setBatch] = useState(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [qrUris, setQrUris] = useState({});
  const [phase, setPhase] = useState('idle');
  const [message, setMessage] = useState('');

  const loadBatches = useCallback(async () => {
    if (!clientId) return [];
    const items = await listTabletQrBatches(clientId);
    setBatches(items);
    if (!batch && items[0]) setBatch(items[0]);
    return items;
  }, [clientId, batch]);

  useEffect(() => {
    if (!visible) return;
    setFrameIndex(0);
    loadBatches().catch((e) => setMessage(String(e?.message || e)));
  }, [visible, loadBatches]);

  useEffect(() => {
    if (!batch?.frames?.length) return;
    const frame = batch.frames[frameIndex];
    if (!frame || qrUris[frame.index]) return;
    let alive = true;
    generateCompanionQr(frame.payload, 840)
      .then((uri) => {
        if (!alive) return;
        setQrUris((current) => ({ ...current, [frame.index]: uri }));
      })
      .catch((e) => {
        if (alive) setMessage(`QR ${frame.index} impossible : ${String(e?.message || e)}`);
      });
    return () => { alive = false; };
  }, [batch, frameIndex, qrUris]);

  const createBatch = useCallback(async () => {
    if (!clientId || phase === 'building') return;
    setPhase('building');
    setMessage('Préparation des sites et des visites terrain…');
    try {
      const snapshot = await buildCompanionOfflineClientSnapshot(clientId);
      const next = buildOfflineClientQrBatch(snapshot);
      await saveTabletQrBatch(next);
      setBatch(next);
      setBatches((current) => [next, ...current.filter((item) => item.batchId !== next.batchId)]);
      setFrameIndex(0);
      setQrUris({});
      setMessage(`${next.totalFrames} QR · ${next.totalSites} site${next.totalSites > 1 ? 's' : ''} · ${next.totalDetailedVisits || 0} visite${Number(next.totalDetailedVisits || 0) > 1 ? 's' : ''} terrain`);
      requestAnimationFrame(() => listRef.current?.scrollTo({ x: 0, animated: false }));
    } catch (e) {
      Alert.alert('Création des QR impossible', String(e?.message || e));
      setMessage(String(e?.message || e));
    } finally {
      setPhase('idle');
    }
  }, [clientId, phase]);

  const selectBatch = useCallback((item) => {
    setBatch(item);
    setFrameIndex(0);
    setQrUris({});
    requestAnimationFrame(() => listRef.current?.scrollTo({ x: 0, animated: false }));
  }, []);

  const currentFrame = batch?.frames?.[frameIndex] || null;
  const siteNames = useMemo(() => currentFrame?.siteNames || [], [currentFrame]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { width: '95%', maxWidth: 760, maxHeight: '94%' }]}>
          <ScrollView contentContainerStyle={{ paddingBottom: 10 }} nestedScrollEnabled>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>QR hors connexion · {nomClient || batch?.clientName || 'Client'}</Text>
                <Text style={styles.importHint}>
                  Les QR sont découpés automatiquement. Le téléphone peut en scanner une partie, s’arrêter, puis reprendre plus tard sans perdre les sites déjà enregistrés.
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 20, color: COLORS.ink }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <TouchableOpacity
                onPress={createBatch}
                disabled={phase === 'building'}
                style={[styles.btnPrimary, { flex: 1, minHeight: 48 }]}
              >
                {phase === 'building'
                  ? <ActivityIndicator color={COLORS.white} />
                  : <Text style={styles.btnPrimaryText}>+ Nouveau lot QR</Text>}
              </TouchableOpacity>
              <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 13, backgroundColor: light }}>
                <Text style={{ color: accent, fontWeight: '900', fontSize: 12 }}>
                  {batch ? `${batch.totalSites || 0} sites · ${batch.totalDetailedVisits || 0} visites · ${batch.totalFrames || 0} QR` : 'Aucun lot enregistré'}
                </Text>
              </View>
            </View>

            {batches.length ? (
              <View style={{ marginTop: 14 }}>
                <Text style={{ color: COLORS.inkSoft, fontSize: 11.5, fontWeight: '800', marginBottom: 7 }}>LOTS ENREGISTRÉS POUR CE CLIENT</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
                  {batches.map((item) => {
                    const active = item.batchId === batch?.batchId;
                    return (
                      <TouchableOpacity
                        key={item.batchId}
                        onPress={() => selectBatch(item)}
                        style={{
                          minWidth: 150,
                          paddingHorizontal: 11,
                          paddingVertical: 9,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: active ? accent : COLORS.line,
                          backgroundColor: active ? light : COLORS.white,
                        }}
                      >
                        <Text style={{ color: active ? accent : COLORS.ink, fontWeight: '900', fontSize: 11.5 }}>
                          {item.totalSites || 0} sites · {item.totalFrames || 0} QR
                        </Text>
                        <Text style={{ marginTop: 2, color: COLORS.inkSoft, fontSize: 10.5 }}>{dateCourte(item.createdAt)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {!batch ? (
              <View style={{ marginTop: 26, padding: 22, borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center' }}>
                <Text style={{ fontSize: 16, color: COLORS.ink, fontWeight: '900' }}>Créer le premier lot</Text>
                <Text style={{ marginTop: 6, color: COLORS.inkSoft, textAlign: 'center', lineHeight: 18 }}>
                  METRA répartira automatiquement les sites et les visites terrain utiles sur autant de QR que nécessaire.
                </Text>
              </View>
            ) : (
              <>
                <View style={{ marginTop: 16, alignItems: 'center' }}>
                  <Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 16 }}>
                    {currentFrame?.title || `QR ${frameIndex + 1}/${batch.totalFrames}`}
                  </Text>
                  <Text style={{ marginTop: 4, color: COLORS.inkSoft, textAlign: 'center', fontSize: 12 }}>
                    {currentFrame?.description || ''}
                  </Text>
                  <Text style={{ marginTop: 3, color: accent, fontWeight: '900', fontSize: 11 }}>
                    Glisser horizontalement pour changer de QR
                  </Text>
                </View>

                <ScrollView
                  ref={listRef}
                  horizontal
                  pagingEnabled
                  decelerationRate="fast"
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={pageWidth}
                  onMomentumScrollEnd={(event) => {
                    const next = Math.max(0, Math.min(batch.frames.length - 1, Math.round(event.nativeEvent.contentOffset.x / pageWidth)));
                    setFrameIndex(next);
                  }}
                  style={{ alignSelf: 'center', width: pageWidth, marginTop: 10 }}
                >
                  {batch.frames.map((frame) => (
                    <View key={frame.index} style={{ width: pageWidth, alignItems: 'center', paddingVertical: 6 }}>
                      {qrUris[frame.index] ? (
                        <Image
                          source={{ uri: qrUris[frame.index] }}
                          style={{ width: Math.min(330, pageWidth - 30), height: Math.min(330, pageWidth - 30), backgroundColor: '#FFF', borderRadius: 18 }}
                          resizeMode="contain"
                        />
                      ) : (
                        <View style={{ width: Math.min(330, pageWidth - 30), height: Math.min(330, pageWidth - 30), alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF', borderRadius: 18 }}>
                          <ActivityIndicator color={accent} />
                        </View>
                      )}
                    </View>
                  ))}
                </ScrollView>

                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 7 }}>
                  {batch.frames.map((frame, index) => (
                    <TouchableOpacity
                      key={frame.index}
                      onPress={() => {
                        setFrameIndex(index);
                        listRef.current?.scrollTo({ x: index * pageWidth, animated: true });
                      }}
                      style={{ width: index === frameIndex ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: index === frameIndex ? accent : COLORS.line }}
                    />
                  ))}
                </View>

                <View style={{ marginTop: 14, padding: 13, borderRadius: 14, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.line }}>
                  <Text style={{ color: COLORS.ink, fontSize: 12.5, fontWeight: '900' }}>
                    Sites contenus dans ce QR
                  </Text>
                  <Text style={{ marginTop: 5, color: COLORS.inkSoft, lineHeight: 18, fontSize: 11.5 }}>
                    {siteNames.length ? siteNames.join(' · ') : (currentFrame?.detailLabels?.length ? currentFrame.detailLabels.join(' · ') : 'Fragment complémentaire de visite')}
                  </Text>
                  <Text style={{ marginTop: 8, color: COLORS.inkFaint, fontSize: 10.5 }}>
                    Lot {String(batch.batchId || '').slice(-8)} · créé le {dateCourte(batch.createdAt)}
                  </Text>
                </View>
              </>
            )}

            {message ? <Text style={{ marginTop: 10, color: COLORS.inkSoft, textAlign: 'center', fontSize: 11.5 }}>{message}</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export { CompanionOfflineQrBatchModal };
