import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { COLORS, FONTS } from './styles.js';
import { hapticSuccess } from './fieldFeedback.js';
import { rendrePagePdfLocale, renduPdfLocalDisponible } from './missionNativeTools.js';

// Success screen shown once a PDF or Word report has been written.
// `files` is the list of { nom, uri } the exporter returned (one for a single
// document, several for "one document per site / per local"). The report is
// already saved in the METRA folders; this screen only previews and shares it.

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const MIME = { pdf: 'application/pdf', word: 'application/msword' };
const BADGE = 112;
const BADGE_R = 50;
const BADGE_C = 2 * Math.PI * BADGE_R;
const CHECK_LEN = 64;
const BURST = Array.from({ length: 10 }, (_, i) => i);

function tailleLisible(bytes) {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' Mo';
}

async function lireInfos(file, format, withThumb) {
  const out = { size: null, pages: null, thumb: null };
  try { const info = await FileSystem.getInfoAsync(file.uri, { size: true }); out.size = info?.size || null; } catch (_) {}
  if (format === 'pdf' && withThumb && renduPdfLocalDisponible()) {
    try {
      const page = await rendrePagePdfLocale(file.uri, 0, 360);
      out.thumb = page?.uri || null; out.pages = page?.pageCount || null;
    } catch (_) {}
  }
  return out;
}

// expo-sharing only accepts local files: copy the saved report to the cache first.
async function partager(file, format) {
  const dir = FileSystem.cacheDirectory + 'rapports-partage/';
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const dest = dir + String(file.nom || 'Rapport').replace(/[\\/:*?"<>|]/g, '_');
  await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
  await FileSystem.copyAsync({ from: file.uri, to: dest });
  await Sharing.shareAsync(dest, { mimeType: MIME[format] || MIME.pdf, dialogTitle: 'Ouvrir ou partager le rapport' });
}

function ShareGlyph({ size = 20, color }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M8 11H6.5A2.5 2.5 0 0 0 4 13.5v5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-5A2.5 2.5 0 0 0 17.5 11H16" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
  </Svg>;
}

export function SuccessBadge({ visible }) {
  const pop = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const check = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return undefined;
    [pop, ring, check, burst].forEach((v) => v.setValue(0));
    const anim = Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: false }),
      Animated.timing(ring, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.parallel([
        Animated.timing(check, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(burst, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [visible, pop, ring, check, burst]);
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const ringOffset = ring.interpolate({ inputRange: [0, 1], outputRange: [BADGE_C, 0] });
  const checkOffset = check.interpolate({ inputRange: [0, 1], outputRange: [CHECK_LEN, 0] });
  const fill = ring.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1] });
  return <View style={{ width: BADGE + 60, height: BADGE + 60, alignItems: 'center', justifyContent: 'center' }}>
    {BURST.map((i) => {
      const angle = (i / BURST.length) * 2 * Math.PI;
      const dist = burst.interpolate({ inputRange: [0, 1], outputRange: [BADGE / 2 - 6, BADGE / 2 + 24] });
      const tx = Animated.multiply(dist, Math.cos(angle));
      const ty = Animated.multiply(dist, Math.sin(angle));
      const opacity = burst.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] });
      return <Animated.View key={i} style={{ position: 'absolute', width: i % 2 ? 6 : 8, height: i % 2 ? 6 : 8, borderRadius: 4, backgroundColor: i % 3 === 0 ? '#FFB37A' : COLORS.orange, opacity, transform: [{ translateX: tx }, { translateY: ty }] }} />;
    })}
    <Animated.View style={{ width: BADGE, height: BADGE, transform: [{ scale }] }}>
      <Animated.View style={{ position: 'absolute', left: 6, top: 6, width: BADGE - 12, height: BADGE - 12, borderRadius: BADGE, backgroundColor: COLORS.orange, opacity: fill }} />
      <Svg width={BADGE} height={BADGE} style={{ position: 'absolute', left: 0, top: 0 }}>
        <Circle cx={BADGE / 2} cy={BADGE / 2} r={BADGE_R} stroke="#F6E3D6" strokeWidth={6} fill="none" />
        <AnimatedCircle cx={BADGE / 2} cy={BADGE / 2} r={BADGE_R} stroke={COLORS.orange} strokeWidth={6} fill="none" strokeLinecap="round"
          strokeDasharray={`${BADGE_C} ${BADGE_C}`} strokeDashoffset={ringOffset} transform={`rotate(-90 ${BADGE / 2} ${BADGE / 2})`} />
        <AnimatedPath d="M 35 58 L 50 72 L 78 42" stroke="#FFFFFF" strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={`${CHECK_LEN} ${CHECK_LEN}`} strokeDashoffset={checkOffset} />
      </Svg>
    </Animated.View>
  </View>;
}

function FileRow({ file, info, format, onShare, sharing, compact }) {
  const meta = [format === 'word' ? 'Word' : 'PDF', info?.pages ? info.pages + ' pages' : null, tailleLisible(info?.size)].filter(Boolean).join(' · ');
  return <View style={{ flexDirection: 'row', alignItems: 'center', padding: compact ? 10 : 12, borderRadius: 14, backgroundColor: '#F7F5F1', borderWidth: 1, borderColor: COLORS.line, marginTop: 8 }}>
    <View style={{ width: compact ? 38 : 54, height: compact ? 50 : 72, borderRadius: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E0D8', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {info?.thumb ? <Image source={{ uri: info.thumb }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        : <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, backgroundColor: format === 'word' ? '#2B5797' : '#C62828' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 9, fontFamily: FONTS.black }}>{format === 'word' ? 'DOC' : 'PDF'}</Text>
        </View>}
    </View>
    <View style={{ flex: 1, marginLeft: 12 }}>
      <Text numberOfLines={2} style={{ color: COLORS.ink, fontFamily: FONTS.bodyBold, fontSize: 13.5 }}>{file.nom || 'Rapport'}</Text>
      <Text style={{ color: COLORS.inkSoft, fontSize: 12, marginTop: 3 }}>{meta}</Text>
    </View>
    {compact ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Partager ' + (file.nom || 'le rapport')} disabled={sharing} onPress={onShare}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: sharing ? 0.4 : 1 }}>
      <ShareGlyph size={20} color={COLORS.orangeDark} />
    </TouchableOpacity> : null}
  </View>;
}

export function ReportReadyModal({ visible, format = 'pdf', files = [], onClose }) {
  const [infos, setInfos] = useState({});
  const [sharing, setSharing] = useState(null);
  const [error, setError] = useState(null);
  const appear = useRef(new Animated.Value(0)).current;
  const single = files.length === 1;

  useEffect(() => {
    if (!visible) return undefined;
    let alive = true;
    setInfos({}); setError(null); setSharing(null);
    hapticSuccess();
    appear.setValue(0);
    Animated.timing(appear, { toValue: 1, duration: 380, delay: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    (async () => {
      for (let i = 0; i < files.length && alive; i += 1) {
        const info = await lireInfos(files[i], format, i < 6);
        if (alive) setInfos((prev) => ({ ...prev, [i]: info }));
      }
    })();
    return () => { alive = false; };
  }, [visible, files, format, appear]);

  const share = async (index) => {
    setSharing(index); setError(null);
    try { await partager(files[index], format); } catch (e) { setError('Partage impossible : ' + String(e?.message || e)); } finally { setSharing(null); }
  };

  const slide = appear.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  const titre = single ? 'Rapport prêt' : files.length + ' rapports prêts';

  return <Modal visible={Boolean(visible)} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: 'rgba(12,17,24,0.78)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <View style={{ width: '100%', maxWidth: 400, maxHeight: '92%', borderRadius: 24, backgroundColor: '#FFFFFF', paddingHorizontal: 22, paddingTop: 10, paddingBottom: 16, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 14 }}>
        <SuccessBadge visible={visible} />
        <Animated.View style={{ alignSelf: 'stretch', alignItems: 'center', opacity: appear, transform: [{ translateY: slide }] }}>
          <Text style={{ color: COLORS.ink, fontFamily: FONTS.black, fontSize: 24 }}>{titre}</Text>
          <Text style={{ color: COLORS.inkSoft, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
            {single ? 'Rapport généré et enregistré dans le dossier Rapports du client.' : 'Rapports générés et enregistrés dans les dossiers Rapports du client.'}
          </Text>
          <ScrollView style={{ alignSelf: 'stretch', maxHeight: single ? undefined : 260, marginTop: 10 }} contentContainerStyle={{ paddingBottom: 2 }}>
            {files.map((file, i) => <FileRow key={file.uri || i} file={file} info={infos[i]} format={format} compact={!single}
              sharing={sharing !== null} onShare={() => share(i)} />)}
          </ScrollView>
          {error ? <Text style={{ color: COLORS.red, fontSize: 12.5, marginTop: 8, textAlign: 'center' }}>{error}</Text> : null}
          {single ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ouvrir ou partager le rapport" disabled={sharing !== null} onPress={() => share(0)}
            style={{ alignSelf: 'stretch', marginTop: 16, minHeight: 52, borderRadius: 14, backgroundColor: COLORS.orange, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', opacity: sharing !== null ? 0.6 : 1 }}>
            <ShareGlyph size={19} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontFamily: FONTS.bodyBold, fontSize: 15.5, marginLeft: 8 }}>{sharing !== null ? 'Préparation…' : 'Ouvrir ou partager'}</Text>
          </TouchableOpacity> : null}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose}
            style={{ alignSelf: 'stretch', marginTop: single ? 8 : 16, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: single ? 'transparent' : COLORS.orange }}>
            <Text style={{ color: single ? COLORS.inkSoft : '#FFFFFF', fontFamily: FONTS.bodyBold, fontSize: 15 }}>Fermer</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  </Modal>;
}
