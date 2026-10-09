/**
 * Courbe des derniers index d'un compteur et repère d'écart, sous le champ de
 * saisie. Silencieuse tant qu'il n'y a pas assez d'historique.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { COLORS, FONTS } from './styles.js';
import { analyserHistorique, coordonneesCourbe, libelleTaux } from './releveHistorique.js';
import { listerHistoriqueReleves } from './releveHistoriqueDb.js';

const H = 64;
const fmt = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);
const aujourdhui = () => new Date().toISOString().slice(0, 10);

export function CourbeReleves({ compteurSiteId, visiteId, valeur, unite, dateVisite }) {
  const [historique, setHistorique] = useState([]);
  useEffect(() => {
    let vivant = true;
    listerHistoriqueReleves(compteurSiteId, visiteId).then((h) => { if (vivant) setHistorique(h); }).catch(() => {});
    return () => { vivant = false; };
  }, [compteurSiteId, visiteId]);
  const [largeur, setLargeur] = useState(240);
  const analyse = useMemo(() => analyserHistorique(historique, { valeur, date: dateVisite || aujourdhui() }), [historique, valeur, dateVisite]);
  if (!analyse.utile) return null;
  const pts = coordonneesCourbe(analyse.points, largeur, H);
  const ligne = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const aire = `${ligne} L${pts[pts.length - 1].x.toFixed(1)} ${H} L${pts[0].x.toFixed(1)} ${H} Z`;
  const couleur = analyse.niveau === 'normal' ? COLORS.orange : '#B45309';
  return <View style={{ marginTop: 8, gap: 4 }}>
    {analyse.ecart != null ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99, backgroundColor: COLORS.orangeLight }}>
        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 10.5, color: COLORS.orangeDark }}>+{fmt(analyse.ecart)} {unite} en {analyse.jours} j</Text>
      </View>
      {analyse.niveau !== 'normal' ? <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99, backgroundColor: '#FFF4D6' }}>
        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 10.5, color: '#8A5A00' }}>{libelleTaux(analyse.tauxPct)}</Text>
      </View> : null}
    </View> : null}
    <View onLayout={(e) => setLargeur(Math.max(120, Math.round(e.nativeEvent.layout.width)))}>
    <Svg width={largeur} height={H} accessibilityLabel="Courbe des derniers relevés">
      <Defs><LinearGradient id="aireReleve" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={couleur} stopOpacity="0.3" /><Stop offset="1" stopColor={couleur} stopOpacity="0" /></LinearGradient></Defs>
      <Path d={aire} fill="url(#aireReleve)" />
      <Path d={ligne} fill="none" stroke={couleur} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={p.courant ? 4.5 : 3} fill={p.courant ? couleur : '#fff'} stroke={couleur} strokeWidth={2} />)}
    </Svg>
    </View>
  </View>;
}
