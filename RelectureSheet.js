/**
 * Relecture avant envoi : feuille qui liste les points à vérifier avant l'envoi
 * Intranet. Un appui sur un point ouvre l'onglet concerné ; « Envoyer quand même »
 * poursuit l'envoi. Sans point à vérifier, l'envoi continue sans rien afficher.
 */
import React, { useCallback, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { BottomSheet } from './VisitKit.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { COLORS, FONTS } from './styles.js';
import { ButtonGlow } from './ButtonGlow.js';
import { analyserRelecture } from './relectureModel.js';
import { chargerElementsRelecture } from './relectureDb.js';

const COULEUR = { erreur: COLORS.red, alerte: COLORS.orange, info: COLORS.inkFaint };

function Pastille({ couleur, glyph }) {
  return <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: couleur, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: '#fff', fontFamily: FONTS.bodyBold, fontSize: 12 }}>{glyph}</Text>
  </View>;
}

/** Retourne { demander, sheet } : `await demander()` vaut true quand l'envoi peut continuer. */
export function useRelecture({ visiteId, getOnglets, labels, ordre, onOpenOnglet }) {
  const [etat, setEtat] = useState(null);
  const resolveRef = useRef(null);

  const terminer = useCallback((continuer) => {
    const r = resolveRef.current; resolveRef.current = null;
    setEtat(null);
    r?.(continuer);
  }, []);

  const demander = useCallback(async () => {
    let analyse;
    try {
      const elements = await chargerElementsRelecture(visiteId);
      analyse = analyserRelecture({ onglets: getOnglets(), labels, ordre, ...elements });
    } catch (e) {
      return true; // la relecture est une aide : jamais un obstacle à l'envoi
    }
    if (analyse.propre) return true;
    return new Promise((resolve) => { resolveRef.current = resolve; setEtat(analyse); });
  }, [visiteId, getOnglets, labels, ordre]);

  const sheet = <BottomSheet
    visible={Boolean(etat)}
    onClose={() => terminer(false)}
    title="Avant d’envoyer"
    subtitle={etat ? `${etat.aVerifier} point${etat.aVerifier > 1 ? 's' : ''} à vérifier` : ''}
    footer={<View style={{ gap: 10 }}>
      <TouchableOpacity activeOpacity={0.85} onPress={() => terminer(true)} style={{ minHeight: 48, borderRadius: 15, overflow: 'hidden', backgroundColor: COLORS.orange, alignItems: 'center', justifyContent: 'center' }}>
        <ButtonGlow /><Text style={{ color: '#fff', fontFamily: FONTS.bodyBold, fontSize: 14 }}>Envoyer quand même</Text>
      </TouchableOpacity>
      <TouchableOpacity activeOpacity={0.7} onPress={() => terminer(false)} style={{ minHeight: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: COLORS.inkSoft, fontFamily: FONTS.bodySemi, fontSize: 13 }}>Revenir à la visite</Text>
      </TouchableOpacity>
    </View>}
  >
    {etat ? <View style={{ gap: 8 }}>
      {etat.points.map((p) => <TouchableOpacity key={p.id} activeOpacity={0.85}
        onPress={() => { terminer(false); setTimeout(() => onOpenOnglet?.(p.cible.id), 240); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)' }}>
        <Pastille couleur={COULEUR[p.niveau]} glyph={p.niveau === 'info' ? 'i' : '!'} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={{ fontFamily: FONTS.bold, fontSize: 13.5, color: COLORS.ink }}>{p.titre}</Text>
          <Text numberOfLines={2} style={{ fontFamily: FONTS.bodyMedium, fontSize: 11.5, color: COLORS.inkSoft, marginTop: 2 }}>{p.detail}</Text>
        </View>
        <CvcIcon name="chevron-right" size={16} color={COLORS.orangeDark} strokeWidth={2.2} />
      </TouchableOpacity>)}
      {etat.ok.map((o) => <View key={o.titre} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Pastille couleur={COLORS.green} glyph="✓" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.ink }}>{o.titre}</Text>
          <Text numberOfLines={1} style={{ fontFamily: FONTS.bodyMedium, fontSize: 11, color: COLORS.inkSoft }}>{o.detail}</Text>
        </View>
      </View>)}
    </View> : null}
  </BottomSheet>;

  return { demander, sheet };
}
