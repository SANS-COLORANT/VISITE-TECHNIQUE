import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { FONTS } from './styles.js';
import { CvcIcon } from './MetraCvcIcons.js';

// Credits shown as a space-opera style opening crawl.
// `code` is the stable key; `label` is kept for older checks; `subtitle` is shown under the name when set.
export const METRA_CREDITS = Object.freeze([
  { code: 'EAL', label: 'Pour Erwan', name: 'ERWAN', reason: 'Merci d’avoir partagé mes toutes premières idées de visites techniques. Tout est parti de là.' },
  { code: 'TCA', label: 'Pour Thibault', name: 'THIBAULT', reason: 'Merci de m’avoir fait confiance sur ce projet. Sans cette confiance, rien n’aurait décollé.' },
  { code: 'TSAI', label: 'Pour Thomas', name: 'THOMAS', reason: 'Merci pour ta rigueur pendant les visites techniques : aucun détail ne t’échappe.' },
  { code: 'BENOÎT', name: 'BENOÎT', reason: 'Merci pour toutes les visites que tu m’as fait faire. Chaque chaufferie a nourri cette application.' },
  { code: 'LYON', name: 'L’ÉQUIPE DE LYON', subtitle: 'Astrid · Thibault · Loïc · Dylan', reason: 'Merci à nos bêta-testeurs d’avoir essuyé les plâtres et fait remonter chaque bug !' },
  { code: 'DEV', name: 'L’ÉQUIPE DÉVELOPPEUR', subtitle: 'et tout particulièrement Rémy', reason: 'Merci à Rémy d’avoir pris le temps de m’accompagner tout au long du projet.' },
]);

const YELLOW = '#FFE81F';
const INTRO_BLUE = '#4BD5EE';
// Whole sequence lasts about 21 s: 1.6 s intro, then the title and the crawl.
const INTRO_MS = 1600;
const TITLE_MS = 2400;
const CRAWL_DELAY_MS = 500;
const CRAWL_MS = 18500;
const STAR_COUNT = 60;

function makeStars(width, height) {
  const stars = [];
  for (let i = 0; i < STAR_COUNT; i += 1) {
    stars.push({
      key: i,
      left: Math.random() * width,
      top: Math.random() * height,
      size: Math.random() < 0.12 ? 2.4 : Math.random() < 0.5 ? 1.6 : 1,
      opacity: 0.35 + Math.random() * 0.65,
    });
  }
  return stars;
}

function Starfield({ width, height }) {
  const stars = useMemo(() => makeStars(width, height), [width, height]);
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
    {stars.map((s) => <View key={s.key} style={{ position: 'absolute', left: s.left, top: s.top, width: s.size, height: s.size, borderRadius: s.size, backgroundColor: '#FFFFFF', opacity: s.opacity }} />)}
  </View>;
}

export function CreditsModal({ visible, onClose }) {
  const { width, height } = useWindowDimensions();
  const intro = useRef(new Animated.Value(0)).current;
  const title = useRef(new Animated.Value(0)).current;
  const crawl = useRef(new Animated.Value(0)).current;
  const sequence = useRef(null);
  const [run, setRun] = useState(0);
  const [finished, setFinished] = useState(false);

  const [crawlHeight, setCrawlHeight] = useState(0);
  const crawlWidth = Math.min(width * 0.86, 520);
  // Scroll just past the end of the text, so it does not linger as a tiny
  // block at the horizon.
  const crawlTravel = (crawlHeight || height * 1.6) + height * 0.15;

  const stop = useCallback(() => {
    if (sequence.current) sequence.current.stop();
    sequence.current = null;
  }, []);

  useEffect(() => {
    if (!visible) { stop(); return undefined; }
    intro.setValue(0); title.setValue(0); crawl.setValue(0);
    setFinished(false);
    const anim = Animated.sequence([
      Animated.timing(intro, { toValue: 1, duration: INTRO_MS, easing: Easing.linear, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(title, { toValue: 1, duration: TITLE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(CRAWL_DELAY_MS),
          Animated.timing(crawl, { toValue: 1, duration: CRAWL_MS, easing: Easing.linear, useNativeDriver: true }),
        ]),
      ]),
    ]);
    sequence.current = anim;
    anim.start(({ finished: done }) => { if (done) setFinished(true); });
    return stop;
  }, [visible, run, intro, title, crawl, stop]);

  const skip = useCallback(() => {
    stop();
    intro.setValue(1); title.setValue(1); crawl.setValue(1);
    setFinished(true);
  }, [stop, intro, title, crawl]);

  const replay = useCallback(() => setRun((n) => n + 1), []);

  // Intro: fade in, hold, fade out.
  const introOpacity = intro.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] });
  // Title: starts huge, shrinks into the distance, fades at the end.
  const titleScale = title.interpolate({ inputRange: [0, 1], outputRange: [2.6, 0.05] });
  const titleOpacity = title.interpolate({ inputRange: [0, 0.02, 0.8, 1], outputRange: [0, 1, 1, 0] });
  // Crawl: rises from below the screen and recedes towards the horizon.
  const crawlY = crawl.interpolate({ inputRange: [0, 1], outputRange: [height * 0.95, -crawlTravel] });
  const crawlOpacity = crawl.interpolate({ inputRange: [0, 0.02, 0.7, 1], outputRange: [0, 1, 1, 0] });

  const para = { color: YELLOW, fontFamily: FONTS.bodyBold, fontSize: 19, lineHeight: 27, textAlign: 'justify', marginBottom: 22 };

  return <Modal visible={Boolean(visible)} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={{ flex: 1, backgroundColor: '#000000', overflow: 'hidden' }}>
      <Starfield width={width} height={height} />

      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: height * 0.38, paddingHorizontal: 32, opacity: introOpacity }}>
        <Text style={{ color: INTRO_BLUE, fontFamily: FONTS.bodySemi, fontSize: 18, lineHeight: 26 }}>
          Il y a bien longtemps, dans une chaufferie{'\n'}lointaine, très lointaine…
        </Text>
      </Animated.View>

      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: height * 0.36, alignItems: 'center', opacity: titleOpacity, transform: [{ scale: titleScale }] }}>
        <Text style={{ color: YELLOW, fontFamily: FONTS.black, fontSize: 64, letterSpacing: 6 }}>MERCI</Text>
        <Text style={{ color: YELLOW, fontFamily: FONTS.bold, fontSize: 15, letterSpacing: 5, marginTop: 4 }}>METRA · VISITE TECHNIQUE</Text>
      </Animated.View>

      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', transform: [{ perspective: 320 }, { rotateX: '24deg' }] }}>
        <Animated.View onLayout={(e) => setCrawlHeight(e.nativeEvent.layout.height)} style={{ width: crawlWidth, opacity: crawlOpacity, transform: [{ translateY: crawlY }] }}>
          <Text style={{ color: YELLOW, fontFamily: FONTS.bold, fontSize: 17, letterSpacing: 2, textAlign: 'center' }}>ÉPISODE 54</Text>
          <Text style={{ color: YELLOW, fontFamily: FONTS.black, fontSize: 30, letterSpacing: 3, textAlign: 'center', marginTop: 6, marginBottom: 26 }}>LE RETOUR DU TERRAIN</Text>
          <Text style={para}>
            Chaufferies, sous-stations et compteurs se dressent face aux techniciens. Mais une poignée de héros a rendu possible la naissance de cette application…
          </Text>
          {METRA_CREDITS.map((entry) => <View key={entry.code} style={{ marginBottom: 26 }}>
            <Text style={{ color: YELLOW, fontFamily: FONTS.black, fontSize: 26, letterSpacing: 3, textAlign: 'center' }}>{entry.name}</Text>
            {entry.subtitle ? <Text style={{ color: YELLOW, fontFamily: FONTS.bold, fontSize: 14, letterSpacing: 2, textAlign: 'center', marginBottom: 8 }}>{entry.subtitle}</Text> : <View style={{ height: 8 }} />}
            <Text style={[para, { textAlign: 'center', marginBottom: 0 }]}>{entry.reason}</Text>
          </View>)}
          <Text style={[para, { textAlign: 'center' }]}>
            Grâce à vous, la paix règne de nouveau sur les trames, les photos et les rapports.
          </Text>
          <Text style={{ color: YELLOW, fontFamily: FONTS.black, fontSize: 24, letterSpacing: 3, textAlign: 'center', marginTop: 10 }}>MERCI À TOUS</Text>
        </Animated.View>
      </View>

      {finished ? <View style={{ position: 'absolute', left: 0, right: 0, top: height * 0.4, alignItems: 'center', paddingHorizontal: 24 }}>
        <Text style={{ color: YELLOW, fontFamily: FONTS.black, fontSize: 30, letterSpacing: 3, textAlign: 'center' }}>MERCI</Text>
        <Text style={{ color: YELLOW, fontFamily: FONTS.bold, fontSize: 14, letterSpacing: 3, textAlign: 'center', marginTop: 8 }}>
          ERWAN · THIBAULT · THOMAS · BENOÎT{'\n'}L’ÉQUIPE DE LYON · L’ÉQUIPE DÉVELOPPEUR
        </Text>
        <View style={{ flexDirection: 'row', marginTop: 26 }}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Rejouer le générique" onPress={replay} style={{ minHeight: 48, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1.5, borderColor: YELLOW, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <Text style={{ color: YELLOW, fontFamily: FONTS.bold, fontSize: 15 }}>Rejouer</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} style={{ minHeight: 48, paddingHorizontal: 24, borderRadius: 12, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#000000', fontFamily: FONTS.bold, fontSize: 15 }}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </View> : null}

      <View style={{ position: 'absolute', top: 36, right: 12, flexDirection: 'row' }}>
        {!finished ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Passer le générique" onPress={skip} style={{ minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', opacity: 0.75, fontFamily: FONTS.bodySemi, fontSize: 14 }}>Passer</Text>
        </TouchableOpacity> : null}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer les crédits" onPress={onClose} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <CvcIcon name="close" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  </Modal>;
}
