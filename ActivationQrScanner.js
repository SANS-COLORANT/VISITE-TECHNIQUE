import React, { useEffect, useRef, useState } from 'react';
import { AppState, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { COLORS, FONTS, styles } from './styles.js';
import { ButtonGlow } from './ButtonGlow.js';
import { createActivationQrGate } from './activationCode.js';

// Mounted only inside the existing activation modal. No second Android modal,
// photo capture, storage, network request, token handling or raw QR logging.
export function ActivationQrScanner({ onRead, onCancel }) {
  const { height } = useWindowDimensions();
  const [phase, setPhase] = useState('permission');
  const [invalid, setInvalid] = useState(false);
  const gate = useRef(null);
  const live = useRef(false);

  useEffect(() => {
    live.current = true;
    gate.current = createActivationQrGate();
    let cancelled = false;
    (async () => {
      try {
        const current = await Camera.getCameraPermissionsAsync();
        if (cancelled) return;
        const result = current.granted || current.canAskAgain === false
          ? current : await Camera.requestCameraPermissionsAsync();
        if (cancelled) return;
        if (!result.granted) {
          onCancel('Accès à la caméra refusé. La saisie manuelle reste disponible.');
          return;
        }
        setPhase('starting');
      } catch {
        if (!cancelled) onCancel('Caméra indisponible. Utilise la saisie manuelle.');
      }
    })();
    return () => {
      cancelled = true;
      live.current = false;
      gate.current?.close();
    };
  }, [onCancel]);

  const close = (message) => {
    if (!live.current) return;
    live.current = false;
    gate.current?.close();
    onCancel(message);
  };

  useEffect(() => {
    if (phase !== 'starting') return undefined;
    const timeout = setTimeout(() => {
      if (!live.current) return;
      live.current = false;
      gate.current?.close();
      onCancel('La caméra ne démarre pas. Utilise la saisie manuelle.');
    }, 15000);
    return () => clearTimeout(timeout);
  }, [phase, onCancel]);

  useEffect(() => {
    if (phase === 'permission') return undefined;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' && live.current) {
        live.current = false;
        gate.current?.close();
        onCancel('Lecteur fermé. Tu peux saisir le code ou relancer le scan.');
      }
    });
    return () => sub.remove();
  }, [phase, onCancel]);

  const handleBarcode = (event) => {
    if (!live.current || phase !== 'ready') return;
    const result = gate.current?.read(event?.data);
    if (result?.kind === 'invalid') setInvalid(true);
    if (result?.kind === 'valid') {
      live.current = false;
      onRead(result.code);
    }
  };
  const retry = () => {
    if (!live.current) return;
    gate.current?.retry();
    setInvalid(false);
  };

  return <>
    <Text style={[styles.modalTitle, { marginTop: 5 }]}>Scanner le QR code</Text>
    <Text style={[styles.cardSub, { marginBottom: 12, lineHeight: 18 }]}>
      Cadre le QR code d’activation affiché sur le portail. Aucun envoi ne sera effectué avant ta confirmation.
    </Text>
    <View style={{ height: Math.min(300, Math.max(150, height * 0.38)), borderRadius: 14, overflow: 'hidden', backgroundColor: '#17212B', justifyContent: 'center' }}>
      {phase !== 'permission' ? <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onCameraReady={() => { if (live.current) setPhase('ready'); }}
        onMountError={() => close('Caméra indisponible. Utilise la saisie manuelle.')}
        onBarcodeScanned={phase === 'ready' && !invalid ? handleBarcode : undefined}
      /> : null}
      {phase !== 'ready' ? <View pointerEvents="none" style={{ position: 'absolute', left: 8, right: 8, bottom: 12 }}>
        <Text style={{ color: '#FFF', textAlign: 'center', fontFamily: FONTS.bold }}>
          {phase === 'permission' ? 'Autorisation caméra…' : 'Ouverture de la caméra…'}
        </Text>
      </View> : null}
      {phase === 'ready' && !invalid ? <View pointerEvents="none" style={{ position: 'absolute', top: 16, bottom: 16, left: '23%', right: '23%', borderWidth: 2, borderRadius: 14, borderColor: '#FFF' }} /> : null}
    </View>
    {invalid ? <Text accessibilityLiveRegion="polite" style={{ color: '#9A4C0A', marginTop: 10, fontFamily: FONTS.bold, fontSize: 13 }}>
      QR code invalide : le code doit contenir exactement 48 caractères hexadécimaux minuscules.
    </Text> : null}
    <View style={[styles.modalActions, { marginTop: 14 }]}>
      <TouchableOpacity accessibilityRole="button" style={styles.btnSecondary} onPress={() => close('Scan annulé. La saisie manuelle reste disponible.')}>
        <Text style={styles.btnSecondaryText}>Saisie manuelle</Text>
      </TouchableOpacity>
      {invalid ? <TouchableOpacity accessibilityRole="button" style={styles.btnPrimary} onPress={retry}>
        <ButtonGlow /><Text style={styles.btnPrimaryText}>Scanner à nouveau</Text>
      </TouchableOpacity> : null}
    </View>
  </>;
}
