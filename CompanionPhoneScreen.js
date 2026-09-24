import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { CvcIcon } from './MetraCvcIcons.js';
import { prendrePhoto } from './PhotoButton.js';
import {
  connectCompanion,
  decodeCompanionQr,
  disconnectCompanion,
  sendCompanionFile,
  sendCompanionMessage,
  subscribeCompanion,
} from './companionNative.js';
import { parseCompanionQrPayload } from './companionProtocol.js';
import { enqueueCompanionPhoto, listCompanionOutbox, removeCompanionOutboxItem } from './companionOutbox.js';
import { COLORS, styles } from './styles.js';

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

function ModuleTile({ item, onPress }) {
  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      activeOpacity={0.84}
      style={{
        width: '48.5%',
        minHeight: 132,
        padding: 15,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#D8DEE3',
        backgroundColor: '#FFFFFF',
        justifyContent: 'space-between',
      }}
    >
      <CvcIcon name={item.icon} size={42} color="#10384B" />
      <View>
        <Text style={{ fontSize: 15, fontWeight: '900', color: '#16242E' }}>{item.label}</Text>
        <Text style={{ marginTop: 3, fontSize: 24, lineHeight: 28, fontWeight: '900', color: '#E46F2E' }}>{Number(item.count || 0)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function TargetRow({ item, onCapture, busy }) {
  const value = [item.value, item.unit].filter(Boolean).join(' ');
  return (
    <TouchableOpacity
      disabled={busy}
      onPress={() => onCapture(item)}
      activeOpacity={0.82}
      style={{
        marginBottom: 9,
        paddingHorizontal: 14,
        paddingVertical: 13,
        minHeight: 70,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#DCE2E6',
        backgroundColor: '#FFF',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: '#F3F6F7', alignItems: 'center', justifyContent: 'center' }}>
        <CvcIcon name="camera" size={25} color="#10384B" />
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: '900', color: '#17242C' }}>{item.label}</Text>
        {item.subtitle ? <Text numberOfLines={1} style={{ marginTop: 3, fontSize: 11.5, color: '#697780' }}>{item.subtitle}</Text> : null}
        {value ? <Text style={{ marginTop: 3, fontSize: 12, fontWeight: '800', color: '#E46F2E' }}>{value}</Text> : null}
      </View>
      <Text style={{ fontSize: 21, color: '#87939A' }}>›</Text>
    </TouchableOpacity>
  );
}

function CompanionPhoneScreen({ onExit }) {
  const [phase, setPhase] = useState('idle');
  const [snapshot, setSnapshot] = useState(null);
  const [selectedModuleId, setSelectedModuleId] = useState(null);
  const [status, setStatus] = useState('Aucune tablette connectée');
  const [busyTarget, setBusyTarget] = useState(null);
  const [pending, setPending] = useState(0);
  const connectedRef = useRef(false);

  const modules = snapshot?.modules?.length ? snapshot.modules : FALLBACK_MODULES;
  const selectedModule = useMemo(() => modules.find((m) => m.id === selectedModuleId) || null, [modules, selectedModuleId]);

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
    refreshPending().catch(() => {});
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
        }
        return;
      }
      if (event?.type === 'message') {
        const message = event.message || {};
        if (message.type === 'visitSnapshot') {
          setSnapshot(message);
          setPhase('connected');
          setStatus('Visite synchronisée');
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
  }, [flushOutbox, refreshPending]);

  const scan = useCallback(async () => {
    if (phase === 'scanning') return;
    setPhase('scanning');
    setStatus('Scanner le QR affiché sur la tablette');
    try {
      const raw = await decodeCompanionQr();
      if (!raw) {
        setPhase('idle');
        setStatus('Scan annulé');
        return;
      }
      const connection = parseCompanionQrPayload(raw);
      await connectCompanion(connection);
      setStatus('Connexion à la tablette…');
    } catch (e) {
      setPhase('idle');
      Alert.alert('Connexion impossible', String(e?.message || e));
      setStatus('Aucune tablette connectée');
    }
  }, [phase]);

  const capture = useCallback(async (target) => {
    if (!target?.targetKey || busyTarget) return;
    setBusyTarget(target.id);
    try {
      const uri = await prendrePhoto();
      if (!uri) return;
      const queued = await enqueueCompanionPhoto({
        uri,
        meta: {
          targetKey: target.targetKey,
          label: target.label,
          moduleId: selectedModule?.id || null,
          visitId: snapshot?.visit?.id || null,
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
      Alert.alert('Photo non envoyée', String(e?.message || e));
    } finally {
      setBusyTarget(null);
    }
  }, [busyTarget, refreshPending, selectedModule?.id, snapshot?.visit?.id]);

  const quit = useCallback(async () => {
    connectedRef.current = false;
    await disconnectCompanion().catch(() => {});
    onExit?.();
  }, [onExit]);

  if (selectedModule) {
    const targets = selectedModule.targets || [];
    return (
      <View style={{ flex: 1, backgroundColor: '#F5F7F7' }}>
        <View style={{ paddingTop: 48, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E6E8' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => setSelectedModuleId(null)} style={{ width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: '#D8DEE2', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22, fontWeight: '800' }}>←</Text></TouchableOpacity>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: '#F2F5F6', alignItems: 'center', justifyContent: 'center' }}><CvcIcon name={selectedModule.icon} size={28} color="#10384B" /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 19, fontWeight: '900', color: '#16242E' }}>{selectedModule.label}</Text>
              <Text style={{ marginTop: 2, color: '#697780', fontSize: 12 }}>{targets.length} élément{targets.length > 1 ? 's' : ''} · toucher pour photographier</Text>
            </View>
          </View>
        </View>
        <FlatList
          data={targets}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 34 }}
          renderItem={({ item }) => <TargetRow item={item} onCapture={capture} busy={busyTarget === item.id} />}
          ListEmptyComponent={<View style={{ marginTop: 60, alignItems: 'center', paddingHorizontal: 28 }}><CvcIcon name={selectedModule.icon} size={54} color="#87949A" /><Text style={{ marginTop: 14, fontWeight: '900', fontSize: 16, color: '#36454D' }}>Aucun élément dans cette rubrique</Text><Text style={{ marginTop: 6, textAlign: 'center', color: '#7A878E' }}>La tablette transmet automatiquement les éléments présents dans la visite.</Text></View>}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F6F6' }}>
      <ScrollView contentContainerStyle={{ paddingTop: 50, paddingHorizontal: 14, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <TouchableOpacity onPress={quit} style={{ width: 40, height: 40, borderRadius: 13, borderWidth: 1, borderColor: '#D8DEE2', backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 20 }}>←</Text></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 21, fontWeight: '900', color: '#14242D' }}>Mode Compagnon</Text>
            <Text style={{ marginTop: 2, fontSize: 12, color: '#6E7B83' }}>{status}</Text>
          </View>
          {pending > 0 ? <View style={{ minWidth: 38, height: 30, paddingHorizontal: 9, borderRadius: 15, backgroundColor: '#FFF0E6', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#B85A20', fontWeight: '900' }}>{pending}</Text></View> : null}
        </View>

        {!snapshot ? (
          <View style={{ marginTop: 32, padding: 22, borderRadius: 22, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DAE0E3', alignItems: 'center' }}>
            <CvcIcon name="camera" size={64} color="#10384B" />
            <Text style={{ marginTop: 16, fontSize: 18, fontWeight: '900', color: '#15252E' }}>Associer la tablette</Text>
            <Text style={{ marginTop: 7, color: '#6B7981', textAlign: 'center', lineHeight: 19 }}>Sur la tablette, ouvre la visite puis « Téléphone ». Scanne ensuite son QR code.</Text>
            <TouchableOpacity onPress={scan} disabled={phase === 'scanning'} style={{ marginTop: 18, minHeight: 52, paddingHorizontal: 20, borderRadius: 16, backgroundColor: '#10384B', minWidth: 210, alignItems: 'center', justifyContent: 'center' }}>
              {phase === 'scanning' ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 14 }}>Scanner le QR</Text>}
            </TouchableOpacity>
            {pending > 0 ? <Text style={{ marginTop: 14, color: '#B85A20', fontWeight: '800', fontSize: 12 }}>{pending} photo{pending > 1 ? 's' : ''} conservée{pending > 1 ? 's' : ''} en attente d'une tablette</Text> : null}
          </View>
        ) : (
          <>
            <View style={{ padding: 14, borderRadius: 18, backgroundColor: '#10384B', marginBottom: 12 }}>
              <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 16 }}>{snapshot.visit?.site || 'Visite'}</Text>
              <Text style={{ marginTop: 3, color: '#D5E3E9', fontSize: 12 }}>{snapshot.visit?.client || ''} · {snapshot.visit?.date || ''}</Text>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
              {modules.map((item) => <ModuleTile key={item.id} item={item} onPress={(m) => {
                if (m.id === 'photos') {
                  Alert.alert('Photos de la visite', `${m.count || 0} photo${Number(m.count || 0) > 1 ? 's' : ''} actuellement enregistrée${Number(m.count || 0) > 1 ? 's' : ''} sur la tablette.`);
                  return;
                }
                setSelectedModuleId(m.id);
              }} />)}
            </View>

            <TouchableOpacity onPress={() => sendCompanionMessage({ type: 'requestSnapshot' }).catch(() => {})} style={{ marginTop: 14, minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: '#D6DDE1', backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontWeight: '900', color: '#34454D' }}>Actualiser depuis la tablette</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

export { CompanionPhoneScreen };
