import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, PanResponder, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { formatPhotoDate } from './latestVisitPhotoModel.js';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
function ZoomablePhoto({ photo, onPrevious, onNext }) {
  const surface = useRef(null), viewport = useRef({ width: 1, height: 1, left: 0, top: 0 });
  const pose = useRef({ scale: 1, x: 0, y: 0 });
  const gesture = useRef(null), lastTap = useRef(0);
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current, translateY = useRef(new Animated.Value(0)).current;
  const [zoom, setZoom] = useState(1), [failed, setFailed] = useState(false);
  const current = useRef({ photo, onPrevious, onNext });
  current.current = { photo, onPrevious, onNext };
  const apply = (next) => {
    const v = viewport.current, p = current.current.photo;
    const imageWidth = Number(p.largeurPixels || v.width), imageHeight = Number(p.hauteurPixels || v.height);
    const fit = Math.min(v.width / imageWidth, v.height / imageHeight);
    const z = clamp(next.scale, 1, 8);
    const maxX = Math.max(0, (imageWidth * fit * z - v.width) / 2), maxY = Math.max(0, (imageHeight * fit * z - v.height) / 2);
    pose.current = { scale: z, x: clamp(next.x || 0, -maxX, maxX), y: clamp(next.y || 0, -maxY, maxY) };
    scale.setValue(z); translateX.setValue(pose.current.x); translateY.setValue(pose.current.y);
    setZoom(z);
  };
  const reset = () => { gesture.current = null; apply({ scale: 1 }); };
  useEffect(() => { reset(); setFailed(false); }, [photo.id, photo.localUri]);
  const touchState = (touches) => {
    if (touches.length > 1) return { mode: 'pinch', x: (touches[0].pageX + touches[1].pageX) / 2, y: (touches[0].pageY + touches[1].pageY) / 2,
      distance: Math.max(1, Math.hypot(touches[1].pageX - touches[0].pageX, touches[1].pageY - touches[0].pageY)) };
    return touches.length ? { mode: 'pan', x: touches[0].pageX, y: touches[0].pageY, distance: 1 } : null;
  };
  const begin = (event) => {
    const point = touchState(event.nativeEvent.touches || []);
    gesture.current = point ? { ...point, pose: { ...pose.current }, multi: point.mode === 'pinch' } : null;
  };
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      surface.current?.measureInWindow((left, top) => { viewport.current = { ...viewport.current, left, top }; });
      begin(e);
    },
    onPanResponderMove: (e) => {
      const point = touchState(e.nativeEvent.touches || []);
      if (!point) return;
      const start = gesture.current;
      if (!start || start.mode !== point.mode) { const multi = start?.multi || point.mode === 'pinch'; begin(e); if (gesture.current) gesture.current.multi = multi; return; }
      if (point.mode === 'pinch') {
        const z = clamp(start.pose.scale * point.distance / start.distance, 1, 8), ratio = z / start.pose.scale;
        const v = viewport.current, cx = v.left + v.width / 2, cy = v.top + v.height / 2;
        apply({ scale: z, x: point.x - cx - (start.x - cx - start.pose.x) * ratio, y: point.y - cy - (start.y - cy - start.pose.y) * ratio });
      } else if (pose.current.scale > 1) apply({ scale: start.pose.scale, x: start.pose.x + point.x - start.x, y: start.pose.y + point.y - start.y });
    },
    onPanResponderRelease: (e, g) => {
      const wasMulti = gesture.current?.multi;
      if (!wasMulti && pose.current.scale === 1 && Math.abs(g.dx) > 70 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5) {
        if (g.dx < 0) current.current.onNext?.(); else current.current.onPrevious?.();
      } else if (!wasMulti && Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) {
        const now = Date.now();
        if (now - lastTap.current < 300) { apply({ scale: pose.current.scale > 1 ? 1 : 2 }); lastTap.current = 0; }
        else lastTap.current = now;
      }
      gesture.current = null;
    },
    onPanResponderTerminate: () => { gesture.current = null; },
    onPanResponderTerminationRequest: () => false,
  })).current;
  return <>
    <View ref={surface} onLayout={(e) => { viewport.current = { ...viewport.current, ...e.nativeEvent.layout }; reset(); }} style={{ flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }} {...responder.panHandlers}>
      {failed ? <Text style={{ color: '#FFF', padding: 20 }}>Cette image ne peut pas être affichée.</Text> : <Animated.Image source={{ uri: photo.localUri }} onError={() => setFailed(true)} resizeMode="contain" style={{ width: '100%', height: '100%', transform: [{ translateX }, { translateY }, { scale }] }} />}
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14 }}>
      <ViewerButton label="−" accessibilityLabel="Réduire le zoom" onPress={() => apply({ ...pose.current, scale: pose.current.scale / 1.5 })} disabled={zoom <= 1} />
      <ViewerButton label={`${Math.round(zoom * 100)} % · Réinitialiser`} onPress={reset} />
      <ViewerButton label="+" accessibilityLabel="Agrandir la photo" onPress={() => apply({ ...pose.current, scale: pose.current.scale * 1.5 })} disabled={zoom >= 8} />
    </View>
  </>;
}
function ViewerButton({ label, accessibilityLabel, onPress, disabled = false }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} disabled={disabled} onPress={onPress} style={{ minWidth: 48, minHeight: 48, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', opacity: disabled ? 0.3 : 1 }}><Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>{label}</Text></TouchableOpacity>;
}
export function ReferencePhotoViewer({ photos, photoId, onClose, onSelect }) {
  const index = photos.findIndex((p) => String(p.id) === String(photoId));
  const photo = photos[index];
  const previous = index > 0 ? () => onSelect(photos[index - 1].id) : null;
  const next = index >= 0 && index < photos.length - 1 ? () => onSelect(photos[index + 1].id) : null;
  return <Modal visible={Boolean(photo)} animationType="fade" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: '#101820' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: '#FFF', paddingLeft: 16, fontWeight: '700' }}>Référence Intranet · {index + 1}/{photos.length}</Text><ViewerButton label="Fermer" onPress={onClose} /></View>
      {photo ? <ZoomablePhoto key={`${photo.id}-${photo.localUri}`} photo={photo} onPrevious={previous} onNext={next} /> : null}
      <ScrollView style={{ maxHeight: 110 }} contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 8 }}>
        <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '700' }}>{photo?.description || 'Photo de référence'}</Text>
        <Text style={{ color: '#D0D5DD', marginTop: 5, lineHeight: 19 }}>{[photo?.site?.nom, photo?.local?.designation, `Visite du ${formatPhotoDate(photo?.derniereVisite?.date)}`].filter(Boolean).join(' · ')}</Text>
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12 }}><ViewerButton label="‹ Précédente" disabled={!previous} onPress={previous} /><ViewerButton label="Suivante ›" disabled={!next} onPress={next} /></View>
    </SafeAreaView>
  </Modal>;
}
