/** Carte « Depuis la dernière visite » en tête de l'écran d'un local. */
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { COLORS, FONTS } from './styles.js';
import { GlassCard } from './premiumChrome.js';
import { chargerDepuisDerniereVisite } from './depuisDerniereVisiteDb.js';

const COULEUR = { erreur: COLORS.red, alerte: COLORS.orange };
const Titre = ({ children }) => <Text style={{ fontSize: 10, fontFamily: FONTS.bodyBold, letterSpacing: 0.6, textTransform: 'uppercase', color: COLORS.inkFaint, marginBottom: 6 }}>{children}</Text>;

export function DepuisDerniereVisiteCard({ siteId, installationId, refreshKey = 0 }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let vivant = true;
    chargerDepuisDerniereVisite({ siteId, installationId }).then((d) => { if (vivant) setData(d); }).catch(() => {});
    return () => { vivant = false; };
  }, [siteId, installationId, refreshKey]);
  if (!data) return null;
  const { aSurveiller, releves, equipements } = data;
  return <View style={{ marginBottom: 12 }}>
    <GlassCard>
      <View style={{ padding: 14, gap: 12 }}>
        <View>
          <Text style={{ fontFamily: FONTS.bold, fontSize: 15, color: COLORS.ink }}>Depuis la dernière visite</Text>
          {data.date ? <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.inkSoft, marginTop: 2 }}>{data.date}</Text> : null}
        </View>
        <View>
          <Titre>À surveiller</Titre>
          {aSurveiller.length ? aSurveiller.map((p, i) => <View key={`${p.titre}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: i ? 8 : 0 }}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: COULEUR[p.niveau] }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: COLORS.ink }}>{p.titre}</Text>
              {p.detail ? <Text numberOfLines={1} style={{ fontFamily: FONTS.bodyMedium, fontSize: 11.5, color: COLORS.inkSoft }}>{p.detail}</Text> : null}
            </View>
          </View>) : <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: COLORS.green }}>Rien de signalé : réserves levées, équipements en ordre.</Text>}
        </View>
        {releves.length ? <View>
          <Titre>Derniers relevés</Titre>
          {releves.map((r, i) => <View key={`${r.label}-${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: i ? 3 : 0 }}>
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONTS.bodyMedium, fontSize: 12.5, color: COLORS.inkSoft }}>{r.label}</Text>
            <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 12.5, color: COLORS.ink }}>{r.valeur}{r.unite ? ` ${r.unite}` : ''}</Text>
          </View>)}
        </View> : null}
        {equipements.total ? <View>
          <Titre>Équipements</Titre>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Chip fond={COLORS.greenBg} texte={COLORS.green}>{equipements.inchanges} en ordre</Chip>
            {equipements.surveilles ? <Chip fond={COLORS.orangeLight} texte={COLORS.orangeDark}>{equipements.surveilles} à surveiller</Chip> : null}
            {equipements.ajoutes ? <Chip fond="#fff" texte={COLORS.inkSoft}>{equipements.ajoutes} ajouté{equipements.ajoutes > 1 ? 's' : ''}</Chip> : null}
          </View>
        </View> : null}
      </View>
    </GlassCard>
  </View>;
}

function Chip({ fond, texte, children }) {
  return <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99, backgroundColor: fond, borderWidth: 1, borderColor: 'rgba(22,21,15,0.08)' }}>
    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 10.5, color: texte }}>{children}</Text>
  </View>;
}
