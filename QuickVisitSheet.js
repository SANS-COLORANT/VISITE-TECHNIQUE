/**
 * Feuille « Nouvelle visite » ouverte par le bouton + de la barre du bas
 * (DA "Verre chaud"). Choix de la trame + nom provisoire, puis la visite
 * démarre sous le client local « À rattacher » (voir quickVisitDb.js).
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CvcIcon } from './MetraCvcIcons.js';
import { IconOrb } from './premiumChrome.js';
import { COLORS, FONTS } from './styles.js';
import { listerTramesDisponibles, DEFAULT_TRAME_ID } from './trameRegistry.js';
import { creerVisiteRapide } from './quickVisitDb.js';

const TRAME_PRESENTATION = {
  icpe_v1: { icon: 'temperature', sub: 'Chaufferie, distribution, régulation' },
  vmc: { icon: 'fan', sub: 'Caissons, réseau, gestion' },
  pre_allumage: { icon: 'flame', sub: 'Mise en route de la saison' },
};

function QuickVisitSheet({ visible, onClose, onCreated }) {
  const [trameId, setTrameId] = useState(DEFAULT_TRAME_ID);
  const [nom, setNom] = useState('');
  const [busy, setBusy] = useState(false);
  const trames = listerTramesDisponibles();

  useEffect(() => {
    if (!visible) return;
    setNom('');
    setBusy(false);
  }, [visible]);

  const demarrer = async () => {
    if (busy) return;
    Keyboard.dismiss();
    setBusy(true);
    try {
      const result = await creerVisiteRapide({ trameId, nom });
      onCreated?.(result);
    } catch (e) {
      Alert.alert('Création impossible', String(e?.message || e));
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!busy) onClose?.(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableOpacity activeOpacity={1} style={s.dim} onPress={() => { if (!busy) onClose?.(); }} />
        <View style={s.sheet}>
          <View style={s.grab} />
          <Text style={s.title}>Nouvelle visite</Text>
          <Text style={s.sub}>Sans client pour l’instant. Elle reste sur cet appareil, rangée dans « À rattacher » sur l’accueil.</Text>
          {trames.map((t) => {
            const on = t.id === trameId;
            const pres = TRAME_PRESENTATION[t.id] || { icon: 'document', sub: t.description || '' };
            return (
              <TouchableOpacity key={t.id} accessibilityRole="radio" accessibilityState={{ selected: on }} activeOpacity={0.85} onPress={() => setTrameId(t.id)} style={[s.type, on && s.typeOn]}>
                <IconOrb accent={COLORS.orange} light={COLORS.orangeLight} size={38}><CvcIcon name={pres.icon} size={19} color={COLORS.orangeDark} /></IconOrb>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.typeTitle}>{t.nom}</Text>
                  <Text numberOfLines={1} style={s.typeSub}>{pres.sub}</Text>
                </View>
                <View style={[s.radio, on && s.radioOn]} />
              </TouchableOpacity>
            );
          })}
          <TextInput
            value={nom}
            onChangeText={setNom}
            placeholder="Nom provisoire (facultatif) · ex. Chaufferie rue Pasteur"
            placeholderTextColor={COLORS.inkFaint}
            style={s.input}
            returnKeyType="go"
            onSubmitEditing={demarrer}
          />
          <TouchableOpacity accessibilityRole="button" onPress={demarrer} disabled={busy} activeOpacity={0.85}>
            <LinearGradient colors={[COLORS.orange, COLORS.orangeDark]} start={{ x: 0.15, y: 0 }} end={{ x: 0.9, y: 1 }} style={s.go}>
              {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.goText}>Démarrer la visite</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(22,21,15,0.32)' },
  sheet: { backgroundColor: '#FBFAF7', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: -8 }, elevation: 16 },
  grab: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#D6D1C6', marginBottom: 14 },
  title: { fontSize: 19, fontFamily: FONTS.black, color: COLORS.ink },
  sub: { fontSize: 12.5, lineHeight: 18, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, marginTop: 4, marginBottom: 14 },
  type: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: COLORS.white, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', marginBottom: 9 },
  typeOn: { borderWidth: 1.5, borderColor: COLORS.orange, backgroundColor: '#FFF8F3' },
  typeTitle: { fontSize: 14.5, fontFamily: FONTS.bold, color: COLORS.ink },
  typeSub: { fontSize: 11.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, marginTop: 1 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#D6D1C6' },
  radioOn: { borderWidth: 6, borderColor: COLORS.orange },
  input: { marginTop: 6, marginBottom: 14, minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', fontSize: 14, fontFamily: FONTS.bodyMedium, color: COLORS.ink },
  go: { minHeight: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.orange, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 6 },
  goText: { fontSize: 15, fontFamily: FONTS.bodyBold, color: COLORS.white },
});

export { QuickVisitSheet };
