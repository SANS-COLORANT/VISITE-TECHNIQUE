import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { CvcIcon } from './MetraCvcIcons.js';
import { prendrePhoto } from './PhotoButton.js';
import {
  connectCompanion,
  decodeCompanionQr,
  disconnectCompanion,
  isCompanionNativeAvailable,
  sendCompanionFile,
  sendCompanionMessage,
  subscribeCompanion,
} from './companionNative.js';
import { parseCompanionQrPayload } from './companionProtocol.js';
import { enqueueCompanionPhoto, listCompanionOutbox, removeCompanionOutboxItem } from './companionOutbox.js';
import { COLORS } from './styles.js';
import { prewarmCameraRuntime } from './cameraRuntime.js';
import { getRuntimeAccent, getRuntimePalette } from './visual-packs/runtime/visualPaletteRuntime.js';

const FALLBACK_MODULES = [
  { id: 'equipment', label: 'Équipements', icon: 'tools', count: 0, targets: [] },
  { id: 'meters', label: 'Compteurs', icon: 'meter', count: 0, targets: [] },
  { id: 'temperatures', label: 'Températures', icon: 'temperature', count: 0, targets: [] },
  { id: 'locals', label: 'Locaux', icon: 'local', count: 0, targets: [] },
  { id: 'distribution', label: 'Distribution', icon: 'distribution', count: 0, targets: [] },
  { id: 'regulation', label: 'Régulation', icon: 'regulation', count: 0, targets: [] },
  { id: 'remarks', label: 'Remarques', icon: 'remark', count: 0, targets: [] },
  { id: 'controls', label: 'Contrôles', icon: 'control', count: 0, targets: [] },
  { id: 'photos', label: 'Photos', icon: 'photo', count: 0, targets: [] },
];

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

function ModuleTile({ item, onPress, accent, light }) {
  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      activeOpacity={0.84}
      style={{
        width: '48.5%',
        minHeight: 128,
        padding: 15,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.line,
        backgroundColor: COLORS.white,
        justifyContent: 'space-between',
      }}
    >
      <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: light, alignItems: 'center', justifyContent: 'center' }}>
        <CvcIcon name={item.icon} size={30} color={accent} />
      </View>
      <View>
        <Text style={{ fontSize: 14.5, fontWeight: '900', color: COLORS.ink }}>{item.label}</Text>
        <Text style={{ marginTop: 3, fontSize: 23, lineHeight: 27, fontWeight: '900', color: accent }}>{Number(item.count || 0)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function TargetRow({ item, onCapture, onWarm, busy, accent, light }) {
  const value = [item.value, item.unit].filter(Boolean).join(' ');
  return (
    <TouchableOpacity
      disabled={busy}
      onPressIn={() => onWarm?.(item)}
      onPress={() => onCapture(item)}
      activeOpacity={0.82}
      style={{
        marginBottom: 9,
        paddingHorizontal: 14,
        paddingVertical: 13,
        minHeight: 70,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: COLORS.line,
        backgroundColor: COLORS.white,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        opacity: busy ? 0.62 : 1,
      }}
    >
      <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: light, alignItems: 'center', justifyContent: 'center' }}>
        {busy ? <ActivityIndicator color={accent} /> : <CvcIcon name="camera" size={25} color={accent} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: '900', color: COLORS.ink }}>{item.label}</Text>
        {item.subtitle ? <Text numberOfLines={1} style={{ marginTop: 3, fontSize: 11.5, color: COLORS.inkSoft }}>{item.subtitle}</Text> : null}
        {value ? <Text style={{ marginTop: 3, fontSize: 12, fontWeight: '800', color: accent }}>{value}</Text> : null}
      </View>
      <Text style={{ fontSize: 21, color: COLORS.inkFaint }}>›</Text>
    </TouchableOpacity>
  );
}

function ClientSiteRow({ site, onPress, accent, light }) {
  return (
    <TouchableOpacity
      onPress={() => onPress(site)}
      activeOpacity={0.84}
      style={{
        marginBottom: 9,
        padding: 14,
        minHeight: 76,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: COLORS.line,
        backgroundColor: COLORS.white,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: light, alignItems: 'center', justifyContent: 'center' }}>
        <CvcIcon name="building" size={27} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, fontWeight: '900', color: COLORS.ink }}>{site.name || 'Site'}</Text>
        {site.address ? <Text numberOfLines={1} style={{ marginTop: 3, color: COLORS.inkSoft, fontSize: 11.5 }}>{site.address}</Text> : null}
        <Text style={{ marginTop: 4, color: accent, fontSize: 11.5, fontWeight: '800' }}>
          {Number(site.visitCount || 0)} visite{Number(site.visitCount || 0) > 1 ? 's' : ''}
          {Number(site.activeVisitCount || 0) > 0 ? ` · ${site.activeVisitCount} en cours` : ''}
        </Text>
      </View>
      <Text style={{ fontSize: 22, color: COLORS.inkFaint }}>›</Text>
    </TouchableOpacity>
  );
}

function VisitChoiceRow({ visit, onPress, busy, accent, light }) {
  const status = visit.status === 'en_cours' ? 'En cours' : 'Terminée';
  return (
    <TouchableOpacity
      onPress={() => onPress(visit)}
      disabled={busy}
      activeOpacity={0.84}
      style={{
        marginBottom: 9,
        padding: 14,
        minHeight: 74,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: busy ? accent : COLORS.line,
        backgroundColor: busy ? light : COLORS.white,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: light, alignItems: 'center', justifyContent: 'center' }}>
        {busy ? <ActivityIndicator color={accent} /> : <CvcIcon name="document" size={26} color={accent} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '900', color: COLORS.ink }}>{visit.local || 'Visite site'}</Text>
        <Text style={{ marginTop: 3, color: COLORS.inkSoft, fontSize: 11.5 }}>
          {visit.date || 'Date non renseignée'} · {status}
        </Text>
        <Text style={{ marginTop: 3, color: accent, fontSize: 11, fontWeight: '800' }}>{Number(visit.progress || 0)}%</Text>
      </View>
      <Text style={{ fontSize: 22, color: COLORS.inkFaint }}>›</Text>
    </TouchableOpacity>
  );
}

function CompanionPhoneScreen({ onExit }) {
  const palette = getRuntimePalette();
  const accent = getRuntimeAccent();
  const light = palette.light || COLORS.orangeLight;
  const nativeAvailable = isCompanionNativeAvailable();

  const [phase, setPhase] = useState('idle');
  const [snapshot, setSnapshot] = useState(null);
  const [clientSnapshot, setClientSnapshot] = useState(null);
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [selectedModuleId, setSelectedModuleId] = useState(null);
  const [status, setStatus] = useState(nativeAvailable ? 'Aucune tablette connectée' : 'Mode Compagnon indisponible dans ce build');
  const [busyTarget, setBusyTarget] = useState(null);
  const [busyVisitId, setBusyVisitId] = useState(null);
  const [pending, setPending] = useState(0);
  const connectedRef = useRef(false);
  const connectionRef = useRef(null);

  const isVisitSnapshot = snapshot?.type === 'visitSnapshot';
  const isClientSnapshot = snapshot?.type === 'clientSnapshot';
  const modules = isVisitSnapshot && snapshot?.modules?.length ? snapshot.modules : FALLBACK_MODULES;
  const selectedModule = useMemo(() => modules.find((m) => m.id === selectedModuleId) || null, [modules, selectedModuleId]);
  const selectedSite = useMemo(
    () => (isClientSnapshot ? (snapshot.sites || []).find((site) => String(site.id) === String(selectedSiteId)) : null),
    [isClientSnapshot, snapshot, selectedSiteId]
  );

  const refreshPending = useCallback(async () => {
    const items = await listCompanionOutbox();
    setPending(items.length);
    return items;
  }, []);

  const flushOutbox = useCallback(async () => {
    if (!connectedRef.current) return;
    const items = await refreshPending();
    for (const item of items) {
      try {
        await sendCompanionFile(item.meta, item.uri);
      } catch {
        break;
      }
    }
  }, [refreshPending]);

  useEffect(() => {
    prewarmCameraRuntime().catch(() => {});
    refreshPending().catch(() => {});

    if (!nativeAvailable) return undefined;

    const unsubscribe = subscribeCompanion(async (event) => {
      if (event?.type === 'status') {
        connectedRef.current = event.status === 'connected';
        if (event.status === 'connected') {
          setPhase('connected');
          setStatus('Connecté à la tablette');
          await sendCompanionMessage({ type: 'requestSnapshot' }).catch(() => {});
          await flushOutbox().catch(() => {});
        } else if (event.status === 'disconnected') {
          setStatus('Connexion perdue · les photos restent en attente');
          setPhase((p) => p === 'idle' ? p : 'disconnected');
        } else if (event.status === 'error') {
          setStatus('Erreur de liaison locale');
          setPhase('disconnected');
        }
        return;
      }

      if (event?.type === 'message') {
        const message = event.message || {};
        if (message.type === 'clientSnapshot') {
          setClientSnapshot(message);
          setSnapshot(message);
          setSelectedSiteId(null);
          setSelectedModuleId(null);
          setBusyVisitId(null);
          setPhase('connected');
          setStatus('Client synchronisé');
          return;
        }
        if (message.type === 'visitSnapshot') {
          setSnapshot(message);
          setSelectedModuleId(null);
          setBusyVisitId(null);
          setPhase('connected');
          setStatus('Visite prête');
          return;
        }
        if (message.type === 'visitSelectionError') {
          setBusyVisitId(null);
          setStatus(message.message || 'Impossible d’ouvrir cette visite');
          Alert.alert('Visite indisponible', message.message || 'Impossible d’ouvrir cette visite.');
          return;
        }
        if (message.type === 'photoImported' && message.transferId) {
          await removeCompanionOutboxItem(message.transferId);
          await refreshPending();
          setStatus(`Photo classée · ${message.label || 'élément'}`);
          return;
        }
        if (message.type === 'photoImportError') {
          setStatus(`Photo en attente · ${message.message || 'import tablette impossible'}`);
        }
      }
    });

    return () => unsubscribe();
  }, [flushOutbox, refreshPending, nativeAvailable]);

  const scan = useCallback(async () => {
    if (!nativeAvailable) {
      Alert.alert('Mode Compagnon indisponible', 'Installe le dernier build Android contenant le module Compagnon.');
      return;
    }
    if (phase === 'scanning' || phase === 'connecting') return;

    setPhase('scanning');
    setStatus('Ouverture du scanner QR…');

    try {
      const raw = await withTimeout(
        decodeCompanionQr(),
        45000,
        'Le scanner QR ne répond pas. Ferme puis réessaie, ou vérifie les services Google Play.'
      );
      if (!raw) {
        setPhase('idle');
        setStatus('Scan annulé');
        return;
      }

      const connection = parseCompanionQrPayload(raw);
      connectionRef.current = connection;
      setPhase('connecting');
      setStatus(connection.scope === 'client'
        ? `Connexion au client ${connection.label || ''}…`
        : 'Connexion à la visite…');

      await withTimeout(
        connectCompanion(connection),
        9000,
        'La tablette ne répond pas. Vérifie que les deux appareils sont sur le même réseau Wi‑Fi.'
      );
    } catch (e) {
      setPhase('idle');
      setStatus('Connexion non établie');
      Alert.alert('Connexion impossible', String(e?.message || e));
    }
  }, [nativeAvailable, phase]);

  const reconnect = useCallback(async () => {
    const connection = connectionRef.current;
    if (!connection) return scan();

    setPhase('connecting');
    setStatus('Reconnexion à la tablette…');
    try {
      await withTimeout(
        connectCompanion(connection),
        9000,
        'La tablette ne répond pas. Vérifie le Wi‑Fi local.'
      );
    } catch (e) {
      setPhase('disconnected');
      setStatus('Tablette indisponible · rescanner si nécessaire');
      Alert.alert('Reconnexion impossible', String(e?.message || e));
    }
  }, [scan]);

  const selectVisit = useCallback(async (visit) => {
    if (!visit?.id || busyVisitId) return;
    setBusyVisitId(visit.id);
    setStatus('Ouverture de la visite…');
    try {
      await withTimeout(
        sendCompanionMessage({ type: 'selectVisit', visitId: visit.id }),
        7000,
        'La tablette ne répond pas.'
      );
    } catch (e) {
      setBusyVisitId(null);
      setStatus('Visite non ouverte');
      Alert.alert('Visite indisponible', String(e?.message || e));
    }
  }, [busyVisitId]);

  const backToClient = useCallback(async () => {
    if (!clientSnapshot) return;
    setSnapshot(clientSnapshot);
    setSelectedModuleId(null);
    setSelectedSiteId(null);
    setStatus('Client synchronisé');
    await sendCompanionMessage({ type: 'requestClientSnapshot' }).catch(() => {});
  }, [clientSnapshot]);

  const capture = useCallback(async (target) => {
    if (!target?.targetKey || busyTarget || !snapshot?.visit?.id) return;
    setBusyTarget(target.id);
    let uri = null;
    try {
      uri = await prendrePhoto();
    } catch (e) {
      Alert.alert('Photo impossible', String(e?.message || e));
    } finally {
      setBusyTarget(null);
    }
    if (!uri) return;

    setPending((value) => value + 1);
    setStatus(`Photo capturée · classement ${target.label}`);

    void (async () => {
      try {
        const queued = await enqueueCompanionPhoto({
          uri,
          meta: {
            targetKey: target.targetKey,
            label: target.label,
            moduleId: selectedModule?.id || null,
            visitId: snapshot.visit.id,
          },
        });
        await refreshPending();
        if (connectedRef.current) {
          await sendCompanionFile(queued.meta, queued.uri);
          setStatus(`Photo envoyée · ${target.label}`);
        } else {
          setStatus(`Photo conservée · ${target.label}`);
        }
      } catch (e) {
        await refreshPending().catch(() => {});
        setStatus(`Photo à reprendre · ${target.label}`);
        Alert.alert('Photo non envoyée', String(e?.message || e));
      }
    })();
  }, [busyTarget, refreshPending, selectedModule?.id, snapshot?.visit?.id]);

  const quit = useCallback(async () => {
    connectedRef.current = false;
    await disconnectCompanion().catch(() => {});
    onExit?.();
  }, [onExit]);

  if (selectedModule && isVisitSnapshot) {
    const targets = selectedModule.targets || [];
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View style={{ paddingTop: 48, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => setSelectedModuleId(null)} style={{ width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.ink }}>←</Text>
            </TouchableOpacity>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: light, alignItems: 'center', justifyContent: 'center' }}>
              <CvcIcon name={selectedModule.icon} size={28} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 19, fontWeight: '900', color: COLORS.ink }}>{selectedModule.label}</Text>
              <Text style={{ marginTop: 2, color: COLORS.inkSoft, fontSize: 12 }}>{targets.length} élément{targets.length > 1 ? 's' : ''} · toucher pour photographier</Text>
            </View>
          </View>
        </View>
        <FlatList
          data={targets}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 34 }}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          renderItem={({ item }) => <TargetRow item={item} onCapture={capture} onWarm={() => prewarmCameraRuntime().catch(() => {})} busy={busyTarget === item.id} accent={accent} light={light} />}
          ListEmptyComponent={<View style={{ marginTop: 60, alignItems: 'center', paddingHorizontal: 28 }}><CvcIcon name={selectedModule.icon} size={54} color={accent} /><Text style={{ marginTop: 14, fontWeight: '900', fontSize: 16, color: COLORS.ink }}>Aucun élément dans cette rubrique</Text><Text style={{ marginTop: 6, textAlign: 'center', color: COLORS.inkSoft }}>La tablette transmet automatiquement les éléments présents dans la visite.</Text></View>}
        />
      </View>
    );
  }

  if (isClientSnapshot) {
    if (selectedSite) {
      return (
        <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
          <View style={{ paddingTop: 48, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity onPress={() => setSelectedSiteId(null)} style={{ width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.ink }}>←</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.ink }}>{selectedSite.name}</Text>
                <Text style={{ marginTop: 2, color: COLORS.inkSoft, fontSize: 12 }}>Choisir une visite · aucun nouveau QR nécessaire</Text>
              </View>
            </View>
          </View>
          <FlatList
            data={selectedSite.visits || []}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ padding: 14, paddingBottom: 36 }}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={7}
            renderItem={({ item }) => <VisitChoiceRow visit={item} onPress={selectVisit} busy={busyVisitId === item.id} accent={accent} light={light} />}
            ListEmptyComponent={<View style={{ marginTop: 60, alignItems: 'center', paddingHorizontal: 28 }}><Text style={{ fontWeight: '900', fontSize: 16, color: COLORS.ink }}>Aucune visite sur ce site</Text><Text style={{ marginTop: 6, textAlign: 'center', color: COLORS.inkSoft }}>Crée ou ouvre d’abord une visite sur la tablette.</Text></View>}
          />
        </View>
      );
    }

    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View style={{ paddingTop: 48, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={quit} style={{ width: 40, height: 40, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 20, color: COLORS.ink }}>←</Text></TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: COLORS.ink }}>{snapshot.client?.name || 'Client'}</Text>
              <Text style={{ marginTop: 2, fontSize: 12, color: COLORS.inkSoft }}>{status}</Text>
            </View>
            {pending > 0 ? <View style={{ minWidth: 38, height: 30, paddingHorizontal: 9, borderRadius: 15, backgroundColor: light, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: accent, fontWeight: '900' }}>{pending}</Text></View> : null}
          </View>
          <Text style={{ marginTop: 10, color: COLORS.inkSoft, fontSize: 11.5 }}>
            {snapshot.counts?.sites || 0} sites · {snapshot.counts?.locals || 0} locaux · {snapshot.counts?.visits || 0} visites
          </Text>
        </View>
        <FlatList
          data={snapshot.sites || []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 36 }}
          initialNumToRender={14}
          maxToRenderPerBatch={10}
          windowSize={7}
          renderItem={({ item }) => <ClientSiteRow site={item} onPress={(site) => setSelectedSiteId(site.id)} accent={accent} light={light} />}
          ListEmptyComponent={<View style={{ marginTop: 60, alignItems: 'center' }}><Text style={{ color: COLORS.inkSoft }}>Aucun site pour ce client.</Text></View>}
          ListFooterComponent={phase === 'disconnected' ? <TouchableOpacity onPress={reconnect} style={{ marginTop: 8, minHeight: 50, borderRadius: 14, backgroundColor: light, borderWidth: 1, borderColor: accent, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: accent, fontWeight: '900' }}>Reconnecter à la tablette</Text></TouchableOpacity> : null}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: 50, paddingHorizontal: 14, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <TouchableOpacity onPress={quit} style={{ width: 40, height: 40, borderRadius: 13, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 20, color: COLORS.ink }}>←</Text></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 21, fontWeight: '900', color: COLORS.ink }}>Compagnon</Text>
            <Text style={{ marginTop: 2, fontSize: 12, color: COLORS.inkSoft }}>{status}</Text>
          </View>
          {pending > 0 ? <View style={{ minWidth: 38, height: 30, paddingHorizontal: 9, borderRadius: 15, backgroundColor: light, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: accent, fontWeight: '900' }}>{pending}</Text></View> : null}
        </View>

        {!snapshot ? (
          <View style={{ marginTop: 24, padding: 22, borderRadius: 20, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center' }}>
            <View style={{ width: 82, height: 82, borderRadius: 26, backgroundColor: light, alignItems: 'center', justifyContent: 'center' }}>
              <CvcIcon name="camera" size={50} color={accent} />
            </View>
            <Text style={{ marginTop: 16, fontSize: 18, fontWeight: '900', color: COLORS.ink }}>Associer la tablette</Text>
            <Text style={{ marginTop: 7, color: COLORS.inkSoft, textAlign: 'center', lineHeight: 19 }}>
              Scanne le QR d’une visite ou directement le QR d’un client. Avec un QR client, tu peux changer de site et de visite sans refaire l’association.
            </Text>

            {!nativeAvailable ? (
              <View style={{ marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: COLORS.redBg, borderWidth: 1, borderColor: COLORS.red }}>
                <Text style={{ color: COLORS.red, textAlign: 'center', fontWeight: '800', fontSize: 12 }}>Ce build Android n’intègre pas le module Compagnon. Installe le dernier APK.</Text>
              </View>
            ) : (
              <TouchableOpacity onPress={scan} disabled={phase === 'scanning' || phase === 'connecting'} style={{ marginTop: 18, minHeight: 52, paddingHorizontal: 20, borderRadius: 15, backgroundColor: accent, minWidth: 210, alignItems: 'center', justifyContent: 'center' }}>
                {phase === 'scanning' || phase === 'connecting' ? <ActivityIndicator color={COLORS.white} /> : <Text style={{ color: COLORS.white, fontWeight: '900', fontSize: 14 }}>Scanner le QR</Text>}
              </TouchableOpacity>
            )}

            {(phase === 'scanning' || phase === 'connecting') ? <Text style={{ marginTop: 10, color: COLORS.inkSoft, fontSize: 11.5, textAlign: 'center' }}>{phase === 'scanning' ? 'Scanner ouvert · tu peux annuler avec Retour' : 'Connexion locale en cours…'}</Text> : null}
            {pending > 0 ? <Text style={{ marginTop: 14, color: accent, fontWeight: '800', fontSize: 12 }}>{pending} photo{pending > 1 ? 's' : ''} conservée{pending > 1 ? 's' : ''} en attente d'une tablette</Text> : null}
          </View>
        ) : isVisitSnapshot ? (
          <>
            <View style={{ padding: 14, borderRadius: 16, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, marginBottom: 12 }}>
              <Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 16 }}>{snapshot.visit?.site || 'Visite'}</Text>
              <Text style={{ marginTop: 3, color: COLORS.inkSoft, fontSize: 12 }}>{snapshot.visit?.client || ''} · {snapshot.visit?.date || ''}</Text>
              {clientSnapshot ? <TouchableOpacity onPress={backToClient} style={{ marginTop: 10, alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14, backgroundColor: light }}><Text style={{ color: accent, fontSize: 11.5, fontWeight: '900' }}>← Revenir au client</Text></TouchableOpacity> : null}
            </View>

            {phase === 'disconnected' ? <TouchableOpacity onPress={reconnect} style={{ marginBottom: 12, minHeight: 50, borderRadius: 15, backgroundColor: light, borderWidth: 1, borderColor: accent, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: accent, fontWeight: '900' }}>Reconnecter à la tablette</Text><Text style={{ marginTop: 2, color: COLORS.inkSoft, fontSize: 10.5 }}>{pending > 0 ? `${pending} photo${pending > 1 ? 's' : ''} en attente` : 'Les nouvelles photos resteront sur le téléphone'}</Text></TouchableOpacity> : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
              {modules.map((item) => <ModuleTile key={item.id} item={item} accent={accent} light={light} onPress={(m) => {
                if (m.id === 'photos') {
                  Alert.alert('Photos de la visite', `${m.count || 0} photo${Number(m.count || 0) > 1 ? 's' : ''} actuellement enregistrée${Number(m.count || 0) > 1 ? 's' : ''} sur la tablette.`);
                  return;
                }
                setSelectedModuleId(m.id);
              }} />)}
            </View>

            <TouchableOpacity onPress={() => sendCompanionMessage({ type: 'requestSnapshot' }).catch(() => {})} style={{ marginTop: 14, minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontWeight: '900', color: COLORS.ink }}>Actualiser depuis la tablette</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

export { CompanionPhoneScreen };
