/**
 * Feuille d'état de la visite (refonte 661, §5.0) : ouverte en touchant la
 * jauge de l'en-tête, elle remplace l'ancienne carte d'avancement. Elle
 * n'écrit rien : elle affiche ce que l'écran Visite calcule déjà
 * (progression, état des onglets, avis) et reçoit l'état de sauvegarde et
 * d'envoi Intranet sous forme d'éléments prêts à afficher.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { COLORS, FONTS } from './styles.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { BottomSheet, KIT } from './VisitKit.js';
import { Picto, pictoTrame, ACTION_PICTOS } from './MetraPictos.js';

const AVIS = [
  ['S', 'Satisfaisant', KIT.green],
  ['N.S', 'Non satisfaisant', KIT.red],
  ['N.R', 'Non renseigné', COLORS.ink],
  ['S.O', 'Sans objet', COLORS.inkFaint],
  ['N.V', 'Non vérifié', COLORS.ink],
];

export function VisitStatusSheet({
  visible,
  onClose,
  pct = 0,
  done = 0,
  total = 0,
  avis = null,
  trameId,
  trameNom,
  saveStatus = null,
  intranet = null,
  express = false,
  onVoirReserves = null,
}) {
  const pourcent = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  const reste = Math.max(0, Number(total || 0) - Number(done || 0));
  const ns = Number(avis?.['N.S'] || 0);
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={`Visite à ${pourcent} %`}
      subtitle={total ? `${done} sur ${total} élément${total > 1 ? 's' : ''} renseigné${done > 1 ? 's' : ''}` : trameNom || null}
      picto={pictoTrame(trameId)}
      maxHeight="80%"
    >
      <View style={s.track} accessibilityLabel={`Avancement ${pourcent} %`}>
        <View style={[s.fill, { width: `${pourcent}%` }]} />
      </View>
      <View style={s.grid}>
        {AVIS.map(([cle, libelle, color]) => (
          <View key={cle} style={s.cell} accessibilityLabel={`${Number(avis?.[cle] || 0)} ${libelle}`}>
            <Text style={[s.cellValue, { color }]}>{Number(avis?.[cle] || 0)}</Text>
            <Text style={s.cellLabel}>{cle}</Text>
          </View>
        ))}
      </View>
      <View style={s.line}>
        <Text style={s.lineLabel}>Reste à renseigner</Text>
        <Text style={s.lineValue}>{total ? reste : '—'}</Text>
      </View>
      <View style={s.line}>
        <Text style={s.lineLabel}>Sauvegarde</Text>
        <View style={s.lineRight}>{saveStatus}</View>
      </View>
      {intranet ? (
        <View style={s.line}>
          <Text style={s.lineLabel}>Intranet</Text>
          <View style={s.lineRight}>{intranet}</View>
        </View>
      ) : null}
      {express ? (
        <View style={s.express}>
          <Picto name={ACTION_PICTOS.reprise} size={18} mono={COLORS.amber} />
          <Text style={s.expressText}>Mode Express : données reprises de la visite précédente. Index et mesures variables à actualiser.</Text>
        </View>
      ) : null}
      {ns > 0 && onVoirReserves ? (
        <TouchableOpacity accessibilityRole="button" onPress={onVoirReserves} activeOpacity={0.85} style={s.link}>
          <Text style={s.linkText}>{`Voir ${ns > 1 ? `les ${ns} N.S` : 'le N.S'} dans Réserves`}</Text>
          <CvcIcon name="chevron-right" size={16} color={KIT.red} strokeWidth={2.2} />
        </TouchableOpacity>
      ) : null}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(22,21,15,0.08)', overflow: 'hidden', marginTop: 2, marginBottom: 14 },
  fill: { height: 8, borderRadius: 4, backgroundColor: COLORS.orange },
  grid: { flexDirection: 'row', gap: 7, marginBottom: 8 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: KIT.border, backgroundColor: KIT.card },
  cellValue: { fontSize: 20, fontFamily: FONTS.black },
  cellLabel: { fontSize: 10.5, fontFamily: FONTS.bodyBold, color: COLORS.inkSoft, marginTop: 1 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 44, borderTopWidth: 1, borderTopColor: KIT.border },
  lineLabel: { fontSize: 13.5, fontFamily: FONTS.bodySemi, color: COLORS.ink },
  lineValue: { fontSize: 13.5, fontFamily: FONTS.bodyBold, color: COLORS.inkSoft },
  lineRight: { flexShrink: 1, alignItems: 'flex-end', paddingVertical: 6 },
  express: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 12, backgroundColor: KIT.amberBg, marginTop: 6 },
  expressText: { flex: 1, fontSize: 12, lineHeight: 16, fontFamily: FONTS.bodySemi, color: COLORS.amber },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 46, paddingHorizontal: 14, borderRadius: 14, backgroundColor: KIT.redBg, marginTop: 10 },
  linkText: { fontSize: 13.5, fontFamily: FONTS.bodyBold, color: KIT.red },
});
