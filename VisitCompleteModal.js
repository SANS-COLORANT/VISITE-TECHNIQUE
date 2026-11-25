import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { COLORS, FONTS } from './styles.js';
import { getDb } from './db.js';
import { hapticSuccess } from './fieldFeedback.js';
import { SuccessBadge } from './ReportReadyModal.js';

// Celebration shown when a visit reaches 100 % ("complete") or once its
// end-of-visit Excel export is done ("exported"). Purely visual: it reads a
// few counts and never changes the visit.

const CONFETTI_COLORS = ['#F26426', '#D9531A', '#FFB37A', '#FCE4D3', '#2E7D32', '#FFFFFF'];
const CONFETTI = Array.from({ length: 22 }, (_, i) => ({
  x: ((i * 37) % 100) / 100,          // spread across the card, deterministic
  drift: ((i * 53) % 40) - 20,         // px sideways while falling
  delay: (i % 7) * 60,
  turn: (i % 2 ? 1 : -1) * (180 + (i * 29) % 360),
  w: i % 3 === 0 ? 5 : 7,
  h: i % 3 === 0 ? 10 : 5,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
}));

async function lireStats(visiteId) {
  const db = await getDb();
  const one = async (sql) => {
    try { const r = await db.getFirstAsync(sql, [visiteId]); return Number(r?.n || 0); } catch (_) { return null; }
  };
  const [photos, reserves, controles] = await Promise.all([
    one('SELECT COUNT(*) n FROM photos WHERE visite_id=?'),
    one('SELECT COUNT(*) n FROM remarques WHERE visite_id=?'),
    one(`SELECT COUNT(*) n FROM controles_visite WHERE visite_id=? AND (avis IS NOT NULL OR (commentaire IS NOT NULL AND trim(commentaire)<>''))`),
  ]);
  return { photos, reserves, controles };
}

function Confetti({ run, height }) {
  const fall = useRef(CONFETTI.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (!run) return undefined;
    fall.forEach((v) => v.setValue(0));
    const anim = Animated.parallel(CONFETTI.map((c, i) => Animated.sequence([
      Animated.delay(450 + c.delay),
      Animated.timing(fall[i], { toValue: 1, duration: 1500 + (i % 5) * 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ])));
    anim.start();
    return () => anim.stop();
  }, [run, fall]);
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height }}>
    {CONFETTI.map((c, i) => <Animated.View key={i} style={{
      position: 'absolute', top: -12, left: `${c.x * 100}%`, width: c.w, height: c.h, borderRadius: 1.5, backgroundColor: c.color,
      opacity: fall[i].interpolate({ inputRange: [0, .05, .8, 1], outputRange: [0, 1, 1, 0] }),
      transform: [
        { translateY: fall[i].interpolate({ inputRange: [0, 1], outputRange: [0, height * .75] }) },
        { translateX: fall[i].interpolate({ inputRange: [0, 1], outputRange: [0, c.drift] }) },
        { rotate: fall[i].interpolate({ inputRange: [0, 1], outputRange: ['0deg', c.turn + 'deg'] }) },
      ],
    }} />)}
  </View>;
}

function StatTile({ value, label, index, appear }) {
  const pop = appear.interpolate({ inputRange: [0, .3 + index * .15, .6 + index * .15, 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' });
  return <Animated.View style={{ flex: 1, alignItems: 'center', paddingVertical: 12, marginHorizontal: 4, borderRadius: 14, backgroundColor: '#FFF6EF', borderWidth: 1, borderColor: '#F6E1D2',
    opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [.7, 1] }) }] }}>
    <Text style={{ color: COLORS.orangeDark, fontFamily: FONTS.black, fontSize: 24, fontVariant: ['tabular-nums'] }}>{value === null || value === undefined ? '—' : value}</Text>
    <Text style={{ color: COLORS.inkSoft, fontSize: 11.5, marginTop: 2, fontFamily: FONTS.bodySemi }}>{label}</Text>
  </Animated.View>;
}

export function VisitCompleteModal({ visible, kind = 'complete', visiteId, subtitle, onClose, onFinish }) {
  const { height } = useWindowDimensions();
  const [stats, setStats] = useState(null);
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return undefined;
    let alive = true;
    setStats(null);
    hapticSuccess();
    appear.setValue(0);
    Animated.timing(appear, { toValue: 1, duration: 1100, delay: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    lireStats(visiteId).then((s) => { if (alive) setStats(s); }).catch(() => {});
    return () => { alive = false; };
  }, [visible, visiteId, appear]);

  const titre = kind === 'exported' ? 'Visite terminée' : 'Visite complète !';
  const message = kind === 'exported'
    ? 'Export Excel prêt. Beau travail sur le terrain.'
    : 'Tous les éléments sont renseignés. Tu peux terminer la visite.';
  const textIn = appear.interpolate({ inputRange: [0, .35], outputRange: [0, 1], extrapolate: 'clamp' });
  const textY = appear.interpolate({ inputRange: [0, .35], outputRange: [12, 0], extrapolate: 'clamp' });

  return <Modal visible={Boolean(visible)} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: 'rgba(12,17,24,0.72)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <View style={{ width: '100%', maxWidth: 400, borderRadius: 26, backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, alignItems: 'center', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 14 }}>
        <Confetti run={visible} height={Math.min(520, height * .7)} />
        <SuccessBadge visible={visible} />
        <Animated.View style={{ alignSelf: 'stretch', alignItems: 'center', opacity: textIn, transform: [{ translateY: textY }] }}>
          <Text style={{ color: COLORS.ink, fontFamily: FONTS.black, fontSize: 25 }}>{titre}</Text>
          {subtitle ? <Text numberOfLines={2} style={{ color: COLORS.orangeDark, fontFamily: FONTS.bodyBold, fontSize: 13.5, marginTop: 4, textAlign: 'center' }}>{subtitle}</Text> : null}
          <Text style={{ color: COLORS.inkSoft, fontSize: 13, marginTop: 6, textAlign: 'center' }}>{message}</Text>
        </Animated.View>
        <View style={{ flexDirection: 'row', alignSelf: 'stretch', marginTop: 16 }}>
          <StatTile value={stats?.controles} label="Contrôles" index={0} appear={appear} />
          <StatTile value={stats?.photos} label="Photos" index={1} appear={appear} />
          <StatTile value={stats?.reserves} label="Réserves" index={2} appear={appear} />
        </View>
        {kind === 'complete' && onFinish ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Terminer la visite" onPress={onFinish}
          style={{ alignSelf: 'stretch', marginTop: 18, minHeight: 52, borderRadius: 14, backgroundColor: COLORS.orange, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontFamily: FONTS.bodyBold, fontSize: 15.5 }}>Terminer la visite</Text>
        </TouchableOpacity> : null}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={kind === 'complete' ? 'Continuer la visite' : 'Fermer'} onPress={onClose}
          style={{ alignSelf: 'stretch', marginTop: kind === 'complete' && onFinish ? 8 : 18, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: kind === 'complete' && onFinish ? 'transparent' : COLORS.orange }}>
          <Text style={{ color: kind === 'complete' && onFinish ? COLORS.inkSoft : '#FFFFFF', fontFamily: FONTS.bodyBold, fontSize: 15 }}>{kind === 'complete' ? 'Continuer la visite' : 'Fermer'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>;
}
