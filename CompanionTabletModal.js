import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, styles, FONTS } from './styles.js';
import {
  applyCompanionTargetUpdate,
  assertVisitBelongsToCompanionClient,
  buildCompanionClientSnapshot,
  buildCompanionVisitSnapshot,
  importCompanionPhoto,
} from './companionData.js';
import { buildCompanionQrPayload } from './companionProtocol.js';
import {
  generateCompanionQr,
  sendCompanionMessage,
  startCompanionHost,
  stopCompanion,
  subscribeCompanion,
} from './companionNative.js';
import { getRuntimeAccent } from './visual-packs/runtime/visualPaletteRuntime.js';
import { ButtonGlow } from './ButtonGlow.js';

function withTimeout(promise, ms, message) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function CompanionTabletModal({ visible, visiteId = null, clientId = null, nomClient = null, onClose }) {
  const scope = visiteId ? 'visit' : 'client';
  const scopeId = visiteId || clientId;
  const [phase, setPhase] = useState('idle');
  const [qrUri, setQrUri] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [connection, setConnection] = useState('En attente du téléphone');
  const [lastEvent, setLastEvent] = useState('');
  const [phoneVisitId, setPhoneVisitId] = useState(null);
  const mountedRef = useRef(true);
  const accent = getRuntimeAccent();

  const stop = useCallback(async () => {
    try { await stopCompanion(); } catch {}
  }, []);

  const buildScopeSnapshot = useCallback(async () => {
    if (scope === 'visit') return buildCompanionVisitSnapshot(visiteId);
    return buildCompanionClientSnapshot(clientId);
  }, [scope, visiteId, clientId]);

  const launch = useCallback(async () => {
    if (!visible || !scopeId) return;
    setPhase('starting');
    setQrUri(null);
    setSnapshot(null);
    setPhoneVisitId(null);
    setConnection('Préparation de la session locale…');
    setLastEvent('');

    try {
      const nextSnapshot = await withTimeout(
        buildScopeSnapshot(),
        18000,
        scope === 'client'
          ? 'La préparation du client prend trop de temps. Réessaie après avoir rouvert le client.'
          : 'La préparation de la visite prend trop de temps. Réessaie après avoir rouvert la visite.'
      );

      const host = await withTimeout(
        startCompanionHost({
          scope,
          scopeId,
          visitId: visiteId || null,
          clientId: clientId || nextSnapshot?.client?.id || null,
          site: nextSnapshot?.visit?.site || '',
          client: nextSnapshot?.visit?.client || nextSnapshot?.client?.name || nomClient || '',
        }),
        10000,
        'Impossible de démarrer la liaison locale. Utilise le même Wi‑Fi, ou connecte la tablette au partage de connexion du téléphone.'
      );

      const payload = buildCompanionQrPayload({
        ...host,
        scope,
        scopeId,
        label: scope === 'client'
          ? (nextSnapshot?.client?.name || nomClient || 'Client')
          : (nextSnapshot?.visit?.site || 'Visite'),
      });

      const uri = await withTimeout(
        generateCompanionQr(payload, 720),
        8000,
        'Le QR code n’a pas pu être généré.'
      );

      if (!mountedRef.current) return;
      setSnapshot(nextSnapshot);
      setQrUri(uri);
      setConnection('En attente du téléphone');
      setPhase('ready');
    } catch (e) {
      await stop().catch(() => {});
      if (!mountedRef.current) return;
      setPhase('error');
      setConnection(String(e?.message || e));
    }
  }, [visible, scopeId, scope, visiteId, clientId, nomClient, buildScopeSnapshot, stop]);

  const refreshSnapshot = useCallback(async ({ notify = true } = {}) => {
    try {
      const next = await buildScopeSnapshot();
      setSnapshot(next);
      if (notify) await sendCompanionMessage(next);
      setLastEvent(scope === 'client' ? 'Patrimoine client actualisé sur le téléphone' : 'Données de visite actualisées sur le téléphone');
      return next;
    } catch (e) {
      Alert.alert('Actualisation impossible', String(e?.message || e));
      return null;
    }
  }, [buildScopeSnapshot, scope]);

  const sendVisitToPhone = useCallback(async (requestedVisitId) => {
    const id = String(requestedVisitId || '').trim();
    if (!id) throw new Error('Visite non sélectionnée');
    if (scope === 'client') await assertVisitBelongsToCompanionClient(clientId, id);
    else if (String(visiteId) !== id) throw new Error('Cette session est liée à une autre visite.');

    const next = await buildCompanionVisitSnapshot(id);
    setPhoneVisitId(id);
    await sendCompanionMessage(next);
    setLastEvent(`Visite ouverte sur le téléphone · ${next?.visit?.site || ''}`);
    return next;
  }, [scope, clientId, visiteId]);

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
            const next = snapshot || await buildScopeSnapshot();
            if (!snapshot) setSnapshot(next);
            await sendCompanionMessage(next);
          } catch (e) {
            setLastEvent(`Envoi des données impossible : ${String(e?.message || e)}`);
          }
        } else if (event.status === 'disconnected') {
          setConnection('Téléphone déconnecté');
          setPhoneVisitId(null);
        } else if (event.status === 'error') {
          setConnection('Erreur de liaison locale');
        }
        return;
      }

      if (event?.type === 'message') {
        const message = event.message || {};
        if (message.type === 'requestSnapshot') {
          await refreshSnapshot();
          return;
        }
        if (message.type === 'requestClientSnapshot' && scope === 'client') {
          const next = await buildCompanionClientSnapshot(clientId);
          setSnapshot(next);
          await sendCompanionMessage(next);
          setPhoneVisitId(null);
          setLastEvent('Retour au client sur le téléphone');
          return;
        }
        if (message.type === 'selectVisit') {
          try {
            await sendVisitToPhone(message.visitId);
          } catch (e) {
            await sendCompanionMessage({
              type: 'visitSelectionError',
              visitId: message.visitId || null,
              message: String(e?.message || e),
            }).catch(() => {});
            setLastEvent(`Visite non ouverte : ${String(e?.message || e)}`);
          }
          return;
        }
        if (message.type === 'updateTarget') {
          const targetVisitId = String(message.visitId || phoneVisitId || '').trim();
          try {
            if (!targetVisitId) throw new Error('Aucune visite ouverte sur le téléphone.');
            if (scope === 'client') await assertVisitBelongsToCompanionClient(clientId, targetVisitId);
            else if (String(visiteId) !== targetVisitId) throw new Error('Cette session est liée à une autre visite.');

            const next = await applyCompanionTargetUpdate({
              visiteId: targetVisitId,
              edit: message.edit || null,
              value: message.value,
            });
            setPhoneVisitId(targetVisitId);
            await sendCompanionMessage({
              type: 'targetUpdated',
              requestId: message.requestId || null,
              visitId: targetVisitId,
            }).catch(() => {});
            await sendCompanionMessage(next);
            setLastEvent('Valeur mise à jour depuis le téléphone');
          } catch (e) {
            await sendCompanionMessage({
              type: 'targetUpdateError',
              requestId: message.requestId || null,
              visitId: targetVisitId || null,
              message: String(e?.message || e),
            }).catch(() => {});
            setLastEvent(`Modification refusée : ${String(e?.message || e)}`);
          }
          return;
        }
      }

      if (event?.type === 'fileReceived') {
        const meta = event.meta || {};
        const targetVisitId = scope === 'client'
          ? String(meta.visitId || phoneVisitId || '').trim()
          : String(visiteId || '').trim();
        try {
          if (!targetVisitId) throw new Error('Choisis une visite sur le téléphone avant d’envoyer une photo.');
          if (scope === 'client') await assertVisitBelongsToCompanionClient(clientId, targetVisitId);
          const imported = await importCompanionPhoto({ visiteId: targetVisitId, uri: event.uri, meta });
          await sendCompanionMessage({
            type: 'photoImported',
            transferId: meta.transferId || null,
            photoId: imported.id,
            targetKey: imported.entiteKey,
            label: imported.label,
            visitId: targetVisitId,
          });
          setLastEvent(`Photo reçue · ${imported.label || 'élément'}`);

          const nextVisit = await buildCompanionVisitSnapshot(targetVisitId);
          setPhoneVisitId(targetVisitId);
          await sendCompanionMessage(nextVisit);
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
  }, [visible, visiteId, clientId, phoneVisitId, scope, snapshot, buildScopeSnapshot, refreshSnapshot, sendVisitToPhone, stop]);

  const close = useCallback(async () => {
    await stop();
    onClose?.();
  }, [onClose, stop]);

  const moduleSummary = useMemo(
    () => snapshot?.type === 'visitSnapshot'
      ? (snapshot?.modules || []).filter((m) => Number(m.count || 0) > 0)
      : [],
    [snapshot]
  );

  const clientCounts = snapshot?.type === 'clientSnapshot' ? snapshot.counts : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { width: '92%', maxWidth: 760, maxHeight: '92%' }]}>
          <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
            <Text style={styles.modalTitle}>
              {scope === 'client' ? 'Téléphone compagnon · Client' : 'Téléphone compagnon · Visite'}
            </Text>
            <Text style={[styles.importHint, { marginBottom: 12 }]}>
              {scope === 'client'
                ? 'Ce QR associe le téléphone à tout le client. Il suffit ensuite de choisir un site puis une visite sur le téléphone, sans rescanner de QR à chaque visite.'
                : 'Ce QR associe le téléphone à cette visite. Les photos sont classées directement sur le bon équipement, compteur, température, local, réseau ou remarque.'}
            </Text>

            {phase === 'starting' ? (
              <View style={{ minHeight: 260, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={accent} />
                <Text style={{ marginTop: 12, color: COLORS.inkSoft }}>
                  {scope === 'client' ? 'Préparation du client et du QR code…' : 'Création de la session locale…'}
                </Text>
                <Text style={{ marginTop: 6, color: COLORS.inkFaint, fontSize: 11, textAlign: 'center' }}>
                  Si le réseau local n’est pas disponible, un message d’erreur remplace automatiquement ce chargement.
                </Text>
              </View>
            ) : null}

            {phase === 'error' ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Impossible de créer la session</Text>
                <Text style={styles.emptySub}>{connection}</Text>
                <TouchableOpacity style={[styles.btnPrimary, { marginTop: 14 }]} onPress={launch}><ButtonGlow />
                  <Text style={styles.btnPrimaryText}>Réessayer</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {phase === 'ready' ? (
              <>
                <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                  {qrUri ? <Image source={{ uri: qrUri }} style={{ width: 300, height: 300, backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: 18 }} resizeMode="contain" /> : null}
                  <Text style={{ marginTop: 10, fontSize: 15, fontFamily: FONTS.black, color: COLORS.ink }}>{connection}</Text>
                  <Text style={{ marginTop: 4, fontSize: 12, color: COLORS.inkSoft, textAlign: 'center' }}>
                    Sur le téléphone : Compagnon → Scanner le QR de la tablette
                  </Text>
                  <Text style={{ marginTop: 5, fontSize: 10.5, color: COLORS.inkFaint, textAlign: 'center', lineHeight: 15 }}>
                    Même Wi-Fi, ou tablette connectée au partage de connexion du téléphone. Internet n’est pas nécessaire.
                  </Text>
                </View>

                <View style={{ marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', backgroundColor: COLORS.bg }}>
                  {snapshot?.type === 'clientSnapshot' ? (
                    <>
                      <Text style={{ fontFamily: FONTS.black, color: COLORS.ink }}>{snapshot?.client?.name || nomClient || 'Client'}</Text>
                      <Text style={{ marginTop: 3, color: COLORS.inkSoft, fontSize: 12 }}>
                        {clientCounts?.sites || 0} sites · {clientCounts?.locals || 0} locaux · {clientCounts?.visits || 0} visites
                      </Text>
                      {phoneVisitId ? <Text style={{ marginTop: 7, color: accent, fontSize: 11.5, fontFamily: FONTS.bold }}>Une visite est actuellement ouverte sur le téléphone.</Text> : null}
                    </>
                  ) : (
                    <>
                      <Text style={{ fontFamily: FONTS.black, color: COLORS.ink }}>{snapshot?.visit?.site || 'Visite'}</Text>
                      <Text style={{ marginTop: 3, color: COLORS.inkSoft, fontSize: 12 }}>{snapshot?.visit?.client || ''} · {snapshot?.visit?.date || ''}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
                        {moduleSummary.map((m) => (
                          <View key={m.id} style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.82)', borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)' }}>
                            <Text style={{ fontSize: 11, fontFamily: FONTS.bold, color: COLORS.ink }}>{m.label} · {m.count}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                </View>

                {lastEvent ? <Text style={{ marginTop: 10, textAlign: 'center', color: COLORS.inkSoft, fontSize: 12 }}>{lastEvent}</Text> : null}

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                  <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => refreshSnapshot()}>
                    <Text style={styles.btnSecondaryText}>Actualiser</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={close}><ButtonGlow />
                    <Text style={styles.btnPrimaryText}>Fermer</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export { CompanionTabletModal };
