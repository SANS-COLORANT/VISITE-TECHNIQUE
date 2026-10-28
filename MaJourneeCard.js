/**
 * « Ma journée » : carte d'accueil qui regroupe l'itinéraire, les visites à
 * envoyer et les réserves ouvertes, avec un bouton pour reprendre au prochain
 * local à faire. Masquée quand il n'y a rien à suivre.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Modal, Text, TouchableOpacity, View } from 'react-native';
import { CvcIcon } from './MetraCvcIcons.js';
import { COLORS, FONTS } from './styles.js';
import { FadeUp, GlassCard, ProgressRing } from './premiumChrome.js';
import { ButtonGlow } from './ButtonGlow.js';
import { chargerJournee } from './journeeDb.js';
import { journeeUtile, libelleCible, libelleReprise } from './journeeModel.js';

let CACHE = null;

function Pastille({ valeur, libelle, alerte = false }) {
  return <View style={{ flex: 1, minWidth: 0, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', paddingVertical: 9, paddingHorizontal: 12 }}>
    <Text style={{ fontFamily: FONTS.black, fontSize: 20, color: alerte && valeur > 0 ? COLORS.red : COLORS.ink }}>{valeur}</Text>
    <Text numberOfLines={1} style={{ fontFamily: FONTS.bodyMedium, fontSize: 11, color: COLORS.inkSoft }}>{libelle}</Text>
  </View>;
}

export function MaJourneeCard({ navigation, refreshKey = 0 }) {
  const [data, setData] = useState(CACHE);
  const [toutVoir, setToutVoir] = useState(false);
  const charger = useCallback(() => chargerJournee().then((d) => { CACHE = d; setData(d); }).catch(() => {}), []);
  useEffect(() => { charger(); }, [charger, refreshKey]);
  // Les changements Client > À faire doivent réapparaître sans redémarrer
  // METRA ni valider artificiellement la première étape.
  useEffect(() => navigation.addListener('focus', charger), [navigation, charger]);
  if (!data || !journeeUtile(data)) return null;
  const { itineraire, aEnvoyer, reserves } = data;
  const prochain = itineraire.prochain;
  const ouvrirCible = (cible) => {
    if (!cible) return;
    setToutVoir(false);
    navigation.navigate('SiteLocals', {
      siteId: cible.siteId, nomSite: cible.nomSite, clientId: cible.clientId, nomClient: cible.nomClient,
      focusInstallationId: cible.installationId || null,
      focusRequest: String(Date.now()) + ':' + String(cible.id),
    });
  };
  const reprendre = () => ouvrirCible(prochain);
  const cibles = itineraire.cibles || [];
  const ligneCible = (cible) => <TouchableOpacity key={cible.id}
    accessibilityRole="button"
    accessibilityLabel={`Ouvrir la visite de ${libelleCible(cible)}`}
    onPress={() => ouvrirCible(cible)}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 42, paddingVertical: 8, paddingHorizontal: 10,
      borderRadius: 11, borderWidth: 1, borderColor: 'rgba(22,21,15,0.10)', backgroundColor: 'rgba(255,255,255,0.78)' }}>
    <CvcIcon name="map-pin" size={15} color={COLORS.orangeDark} />
    <Text style={{ flex: 1, color: COLORS.ink, fontFamily: FONTS.bodySemi, fontSize: 12.5 }} numberOfLines={2}>
      {libelleCible(cible)}{cible.nomClient ? ` · ${cible.nomClient}` : ''}
    </Text>
    <CvcIcon name="chevron-right" size={16} color={COLORS.orangeDark} />
  </TouchableOpacity>;
  return <FadeUp style={{ marginBottom: 14 }}>
    <GlassCard>
      <View style={{ padding: 14, gap: 12 }}>
        <Text style={{ fontSize: 10, fontFamily: FONTS.bodyBold, letterSpacing: 0.6, textTransform: 'uppercase', color: COLORS.inkFaint }}>Ma journée</Text>
        {itineraire.total > 0 ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 56, height: 56 }}>
            <ProgressRing pct={itineraire.pct} size={56} strokeWidth={6} accent={COLORS.orange} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: FONTS.black, fontSize: 12, color: COLORS.ink }}>{itineraire.faits}/{itineraire.total}</Text>
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 15, fontFamily: FONTS.bold, color: COLORS.ink }}>{itineraire.restants === 0 ? 'Itinéraire terminé' : `${itineraire.restants} à faire`}</Text>
            <Text numberOfLines={1} style={{ fontSize: 12, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, marginTop: 2 }}>
              {prochain ? `Prochain : ${libelleCible(prochain)}` : 'Tout est fait'}
            </Text>
          </View>
        </View> : null}
        {prochain ? <TouchableOpacity activeOpacity={0.85} accessibilityLabel={libelleReprise(itineraire)} onPress={reprendre}
          style={{ minHeight: 46, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.orange, paddingHorizontal: 12 }}>
          <ButtonGlow />
          <Text numberOfLines={1} style={{ color: '#fff', fontFamily: FONTS.bodyBold, fontSize: 13.5 }}>{libelleReprise(itineraire)}</Text>
        </TouchableOpacity> : null}
        {cibles.length ? <View style={{ gap: 6 }}>
          <Text style={{ color: COLORS.inkSoft, fontFamily: FONTS.bodyBold, fontSize: 11 }}>
            Visites programmées · ordre libre
          </Text>
          {cibles.slice(0, 4).map(ligneCible)}
          {cibles.length > 4 ? <TouchableOpacity accessibilityRole="button"
            accessibilityLabel={`Voir toutes les ${cibles.length} visites programmées`}
            onPress={() => setToutVoir(true)} style={{ paddingVertical: 9, alignItems: 'center' }}>
            <Text style={{ fontFamily: FONTS.bold, color: COLORS.orangeDark, fontSize: 12.5 }}>
              Voir les {cibles.length} visites
            </Text>
          </TouchableOpacity> : null}
        </View> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pastille valeur={aEnvoyer} libelle={aEnvoyer > 1 ? 'à envoyer' : 'à envoyer'} />
          <Pastille valeur={reserves} libelle={reserves > 1 ? 'réserves ouvertes' : 'réserve ouverte'} alerte />
        </View>
        {itineraire.clients.length > 1 ? <View style={{ gap: 6 }}>
          {itineraire.clients.slice(0, 3).map((c) => <TouchableOpacity key={c.clientId} activeOpacity={0.8} onPress={() => navigation.navigate('ClientSites', { clientId: c.clientId, nomClient: c.nomClient })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.orange }} />
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONTS.bodySemi, fontSize: 12.5, color: COLORS.ink }}>{c.nomClient}</Text>
            <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.inkSoft }}>{c.faits}/{c.total}</Text>
            <CvcIcon name="chevron-right" size={14} color={COLORS.orangeDark} strokeWidth={2.2} />
          </TouchableOpacity>)}
        </View> : null}
      </View>
    </GlassCard>
    <Modal visible={toutVoir} transparent animationType="fade" onRequestClose={() => setToutVoir(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.5)', padding: 18, justifyContent: 'center' }}>
        <View style={{ maxHeight: '82%', borderRadius: 20, backgroundColor: '#FFF', padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: FONTS.black, color: COLORS.ink, fontSize: 17 }}>Ma journée · {cibles.length} visites</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer la liste des visites"
              onPress={() => setToutVoir(false)} style={{ padding: 12 }}>
              <CvcIcon name="x" size={22} color={COLORS.ink} />
            </TouchableOpacity>
          </View>
          <FlatList data={cibles} keyExtractor={(item) => item.id}
            renderItem={({ item }) => <View style={{ marginBottom: 8 }}>{ligneCible(item)}</View>}
            initialNumToRender={9} maxToRenderPerBatch={8} windowSize={7}
            removeClippedSubviews={false}/>
        </View>
      </View>
    </Modal>
  </FadeUp>;
}
