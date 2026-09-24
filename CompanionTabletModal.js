import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { buildCompanionVisitSnapshot, importCompanionPhoto } from './companionData.js';
import { buildCompanionQrPayload } from './companionProtocol.js';
import {
  generateCompanionQr,
  sendCompanionMessage,
  startCompanionHost,
  stopCompanion,
  subscribeCompanion,
} from './companionNative.js';

function CompanionTabletModal({ visible, visiteId, onClose }) {
  const [phase, setPhase] = useState('idle');
  const [qrUri, setQrUri] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [connection, setConnection] = useState('En attente du téléphone');
  const [lastEvent, setLastEvent] = useState('');
  const mountedRef = useRef(true);

  const stop = useCallback(async () => {
    try { await stopCompanion(); } catch {}
  }, []);

  const launch = useCallback(async () => {
    if (!visible || !visiteId) return;
    setPhase('starting');
    setQrUri(null);
    setSnapshot(null);
    setConnection('Préparation de la session locale…');
    setLastEvent('');
    try {
      const nextSnapshot = await buildCompanionVisitSnapshot(visiteId);
      const host = await startCompanionHost({
        visitId: visiteId,
        site: nextSnapshot?.visit?.site || '',
        client: nextSnapshot?.visit?.client || '',
      });
      const payload = buildCompanionQrPayload(host);
      const uri = await generateCompanionQr(payload, 720);
      if (!mountedRef.current) return;
      setSnapshot(nextSnapshot);
      setQrUri(uri);
      setConnection('En attente du téléphone');
      setPhase('ready');
    } catch (e) {
      if (!mountedRef.current) return;
      setPhase('error');
      setConnection(String(e?.message || e));
    }
  }, [visible, visiteId]);

  const refreshSnapshot = useCallback(async () => {
    try {
      const next = await buildCompanionVisitSnapshot(visiteId);
      setSnapshot(next);
      await sendCompanionMessage(next);
      setLastEvent('Données de visite actualisées sur le téléphone');
    } catch (e) {
      Alert.alert('Actualisation impossible', String(e?.message || e));
    }
  }, [visiteId]);

  useEffect(() => {
    mountedRef.current = true;
    if (visible) launch();
    return () => { mountedRef.current = false; };
  }, [visible, launch]);

  useEffect(() => {
    if (!visible) {
      stop();
      return undefined;
    }
    const unsubscribe = subscribeCompanion(async (event) => {
      if (!mountedRef.current) return;
      if (event?.type === 'status') {
        if (event.status === 'connected') {
          setConnection('Téléphone connecté');
          setLastEvent('Connexion locale établie');
          try {
            const next = snapshot || await buildCompanionVisitSnapshot(visiteId);
            setSnapshot(next);
            await sendCompanionMessage(next);
          } catch (e) {
            setLastEvent(`Envoi des données impossible : ${String(e?.message || e)}`);
          }
        } else if (event.status === 'disconnected') {
          setConnection('Téléphone déconnecté');
        }
        return;
      }
      if (event?.type === 'message' && event.message?.type === 'requestSnapshot') {
        await refreshSnapshot();
        return;
      }
      if (event?.type === 'fileReceived') {
        const meta = event.meta || {};
        try {
          const imported = await importCompanionPhoto({ visiteId, uri: event.uri, meta });
          await sendCompanionMessage({
            type: 'photoImported',
            transferId: meta.transferId || null,
            photoId: imported.id,
            targetKey: imported.entiteKey,
            label: imported.label,
          });
          setLastEvent(`Photo reçue · ${imported.label || 'élément'}`);
          const next = await buildCompanionVisitSnapshot(visiteId);
          setSnapshot(next);
          await sendCompanionMessage(next);
        } catch (e) {
          await sendCompanionMessage({
            type: 'photoImportError',
            transferId: meta.transferId || null,
            message: String(e?.message || e),
          }).catch(() => {});
          setLastEvent(`Photo non importée : ${String(e?.message || e)}`);
        }
      }
    });
    return () => unsubscribe();
  }, [visible, visiteId, snapshot, refreshSnapshot, stop]);

  const close = useCallback(async () => {
    await stop();
    onClose?.();
  }, [onClose, stop]);

  const moduleSummary = useMemo(
    () => (snapshot?.modules || []).filter((m) => Number(m.count || 0) > 0),
    [snapshot]
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { width: '92%', maxWidth: 760, maxHeight: '92%' }]}>
          <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
            <Text style={styles.modalTitle}>Téléphone compagnon</Text>
            <Text style={[styles.importHint, { marginBottom: 12 }]}>
              Le QR code transmet uniquement une session locale temporaire. Le téléphone récupère le contexte de cette visite et peut envoyer ses photos directement au bon équipement, compteur, température, local, réseau ou remarque.
            </Text>

            {phase === 'starting' ? <View style={{ minHeight: 260, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={COLORS.primary} /><Text style={{ marginTop: 12, color: COLORS.muted }}>Création de la session locale…</Text></View> : null}

            {phase === 'error' ? <View style={styles.empty}><Text style={styles.emptyText}>Impossible de créer la session</Text><Text style={styles.emptySub}>{connection}</Text><TouchableOpacity style={[styles.btnPrimary, { marginTop: 14 }]} onPress={launch}><Text style={styles.btnPrimaryText}>Réessayer</Text></TouchableOpacity></View> : null}

            {phase === 'ready' ? <>
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                {qrUri ? <Image source={{ uri: qrUri }} style={{ width: 300, height: 300, backgroundColor: '#FFF', borderRadius: 18 }} resizeMode="contain" /> : null}
                <Text style={{ marginTop: 10, fontSize: 15, fontWeight: '900', color: COLORS.text }}>{connection}</Text>
                <Text style={{ marginTop: 4, fontSize: 12, color: COLORS.muted, textAlign: 'center' }}>Sur le téléphone : MÉTRA → Mode Compagnon → Scanner le QR de la tablette</Text>
              </View>

              <View style={{ marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#FAFBFC' }}>
                <Text style={{ fontWeight: '900', color: COLORS.text }}>{snapshot?.visit?.site || 'Visite'}</Text>
                <Text style={{ marginTop: 3, color: COLORS.muted, fontSize: 12 }}>{snapshot?.visit?.client || ''} · {snapshot?.visit?.date || ''}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
                  {moduleSummary.map((m) => <View key={m.id} style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: '#FFF', borderWidth: 1, borderColor: COLORS.line }}><Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.text }}>{m.label} · {m.count}</Text></View>)}
                </View>
              </View>

              {lastEvent ? <Text style={{ marginTop: 10, textAlign: 'center', color: COLORS.muted, fontSize: 12 }}>{lastEvent}</Text> : null}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={refreshSnapshot}><Text style={styles.btnSecondaryText}>Actualiser</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={close}><Text style={styles.btnPrimaryText}>Fermer</Text></TouchableOpacity>
              </View>
            </> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export { CompanionTabletModal };
