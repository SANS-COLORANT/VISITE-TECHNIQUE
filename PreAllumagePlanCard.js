import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Text, TouchableOpacity, View } from 'react-native';
import { choisirEtSauverPlanSite, getPlanSitePourVisite, supprimerPlanSitePourVisite } from './sitePlanDb.js';
import { COLORS, styles } from './styles.js';

export function PreAllumagePlanCard({ visiteId, onSaved }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    try { setPlan(await getPlanSitePourVisite(visiteId)); }
    catch (e) { console.warn('Plan du site non chargé', e); }
  }, [visiteId]);

  useEffect(() => { charger(); }, [charger]);

  const choisir = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await choisirEtSauverPlanSite(visiteId);
      if (uri) {
        setPlan((p) => ({ ...(p || {}), uri }));
        onSaved?.();
      }
    } catch (e) {
      Alert.alert('Plan du site', String(e?.message || e));
    } finally { setBusy(false); }
  };

  const supprimer = () => {
    if (!plan?.uri || busy) return;
    Alert.alert('Supprimer le plan du site ?', 'Le plan ne sera plus repris automatiquement dans les rapports Pré-allumage de ce site.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          await supprimerPlanSitePourVisite(visiteId);
          setPlan((p) => ({ ...(p || {}), uri: null }));
          onSaved?.();
        } catch (e) { Alert.alert('Suppression impossible', String(e?.message || e)); }
        finally { setBusy(false); }
      } },
    ]);
  };

  return <View style={[styles.formCard, { marginBottom: 12 }]}>
    <Text style={styles.cardTitle}>Plan du site</Text>
    <Text style={[styles.importHint, { marginTop: 4, marginBottom: 10 }]}>Ce plan est enregistré au niveau du site. Il sera réutilisé lors des prochaines visites Pré-allumage et placé sur la page « Plan et informations bâtiments » des exports PDF et Word.</Text>
    {plan?.uri ? <View style={{ borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', marginBottom: 10 }}>
      <Image source={{ uri: plan.uri }} style={{ width: '100%', height: 240 }} resizeMode="contain" />
    </View> : <View style={{ minHeight: 120, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.line, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', marginBottom: 10, padding: 16 }}>
      <Text style={{ color: COLORS.muted, textAlign: 'center' }}>Aucun plan enregistré pour ce site.</Text>
    </View>}
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <TouchableOpacity style={[styles.btnPrimary, { flex: 1, opacity: busy ? 0.55 : 1 }]} disabled={busy} onPress={choisir}>
        <Text style={styles.btnPrimaryText}>{busy ? 'Traitement…' : (plan?.uri ? 'Remplacer le plan' : 'Sélectionner le plan')}</Text>
      </TouchableOpacity>
      {plan?.uri ? <TouchableOpacity style={[styles.btnSecondary, { minWidth: 110 }]} disabled={busy} onPress={supprimer}><Text style={styles.btnSecondaryText}>Supprimer</Text></TouchableOpacity> : null}
    </View>
  </View>;
}
