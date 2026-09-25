/**
 * Petits composants visuels partagés — socle "premium" appliqué au-dessus
 * des thèmes existants (orange Visite Technique / vert Missions / palette
 * runtime des visual packs). Ces composants ne redéfinissent aucune couleur :
 * ils reçoivent toujours `accent`/`light` de l'écran appelant, exactement
 * comme le fait déjà PhotoPhoneScreen.js.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from '@react-native-community/blur';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Carte "verre" : flou natif réel (contrairement à expo-blur, qui ne fait
 * jamais de vrai flou sur Android) posé derrière un voile blanc translucide,
 * avec bordure + ombre à deux niveaux — reproduit l'effet de la maquette.
 */
function GlassCard({ children, style, radius = 20 }) {
  return (
    <View style={[styles.glassShadow, { borderRadius: radius }, style]}>
      <View style={[styles.glassClip, { borderRadius: radius }]}>
        <BlurView style={StyleSheet.absoluteFill} blurType="light" blurAmount={18} reducedTransparencyFallbackColor="rgba(255,255,255,0.85)" />
        <View style={styles.glassTint} />
        <View style={styles.glassContent}>{children}</View>
      </View>
    </View>
  );
}

/**
 * Conteneur d'icône "duoton" : dégradé doux de la couleur d'accent vers
 * transparent, au lieu d'un simple carré à fond plat. Remplace l'usage de
 * `iconBox()` dans les écrans qui affichent des pictogrammes CvcIcon.
 */
function IconOrb({ accent, light, size = 44, radius, children }) {
  const r = radius ?? Math.round(size * 0.32);
  const base = light || '#FCE4D3';
  const ringR = size / 2 - 1;
  const circumference = 2 * Math.PI * ringR;
  return (
    <View style={[styles.orbShadow, { width: size, height: size, borderRadius: r }]}>
      <LinearGradient
        colors={[base, base + '45']}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.orbFill, { width: size, height: size, borderRadius: r, borderColor: accent + '70' }]}
      >
        {children}
      </LinearGradient>
      {/* Anneau partiel en couleur d'accent : RN n'a pas de conic-gradient,
          ceci approxime le fin anneau dégradé de la maquette autour de l'icône. */}
      <Svg width={size} height={size} style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Circle
          cx={size / 2} cy={size / 2} r={ringR}
          stroke={accent} strokeWidth={1.5} fill="none" strokeLinecap="round"
          strokeDasharray={`${circumference * 0.52}, ${circumference}`}
          rotation="-45" originX={size / 2} originY={size / 2}
        />
      </Svg>
    </View>
  );
}

/**
 * Fait apparaître son contenu en fondu + léger décalage vertical au montage.
 * Un seul enchaînement au chargement de l'écran, jamais répété au scroll —
 * volontairement discret (durée courte, pas de rebond).
 */
function FadeUp({ children, delay = 0, style }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const timer = Animated.timing(anim, {
      toValue: 1,
      duration: 360,
      delay,
      useNativeDriver: true,
    });
    timer.start();
    return () => timer.stop();
  }, [anim, delay]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Anneau de progression animé (ex: avancement d'une visite). Purement SVG,
 * aucune dépendance supplémentaire au-delà de react-native-svg déjà présent.
 */
function ProgressRing({ pct = 0, size = 56, strokeWidth = 6, accent, track = 'rgba(0,0,0,0.08)' }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = Animated.timing(anim, {
      toValue: Math.max(0, Math.min(100, pct)),
      duration: 700,
      useNativeDriver: false, // strokeDashoffset n'est pas pilotable par le native driver
    });
    timer.start();
    return () => timer.stop();
  }, [anim, pct]);

  const dashoffset = anim.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  });

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={track}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={accent}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${circumference}, ${circumference}`}
        strokeDashoffset={dashoffset}
        rotation="-90"
        originX={size / 2}
        originY={size / 2}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  orbShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  orbFill: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glassShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  glassClip: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(22,21,15,0.1)',
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  glassContent: {
    position: 'relative',
  },
});

export { IconOrb, FadeUp, ProgressRing, GlassCard };
