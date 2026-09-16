import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import {
  MISSION_FAMILIES,
  creerMissionClient,
  creerMissionDraft,
  creerMissionSite,
  listerMissionClients,
  listerMissionSites,
} from './missionsDb.js';

function Choice({ selected, label, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.78}
      style={{ borderWidth: selected ? 2 : 1, borderColor: selected ? MISSION_COLORS.accent : MISSION_COLORS.accentLine, backgroundColor: selected ? MISSION_COLORS.accentLight : COLORS.white, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11, marginRight: 8, marginBottom: 8 }}
    >
      <Text style={{ color: selected ? MISSION_COLORS.accentDark : COLORS.ink, fontWeight: '800', fontSize: 11.5 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function MissionCreateScreen({ navigation }) {
  const [family, setFamily] = useState(null);
  const [type, setType] = useState(null);
  const [label, setLabel] = useState('');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [responsible, setResponsible] = useState('');
  const [clients, setClients] = useState([]);
  const [sites, setSites] = useState([]);
  const [clientId, setClientId] = useState(null);
  const [siteId, setSiteId] = useState(null);
  const [newClient, setNewClient] = useState('');
  const [newSite, setNewSite] = useState('');
  const [saving, setSaving] = useState(false);

  const reloadClients = useCallback(async () => setClients(await listerMissionClients()), []);
  useEffect(() => { reloadClients().catch(() => {}); }, [reloadClients]);
  useEffect(() => {
    setSiteId(null);
    listerMissionSites(clientId).then(setSites).catch(() => setSites([]));
  }, [clientId]);

  const familyDef = useMemo(() => MISSION_FAMILIES.find((item) => item.key === family), [family]);

  const selectFamily = (key) => {
    setFamily(key);
    setType(null);
  };

  const addClient = async () => {
    if (!newClient.trim()) return;
    try {
      const id = await creerMissionClient({ name: newClient });
      setNewClient('');
      await reloadClients();
      setClientId(id);
    } catch (e) { Alert.alert('Client non créé', String(e.message || e)); }
  };

  const addSite = async () => {
    if (!newSite.trim()) return;
    try {
      const id = await creerMissionSite({ clientId, name: newSite });
      setNewSite('');
      setSites(await listerMissionSites(clientId));
      setSiteId(id);
    } catch (e) { Alert.alert('Site non créé', String(e.message || e)); }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const missionId = await creerMissionDraft({
        family,
        type,
        label,
        reference,
        description,
        responsibleName: responsible,
        clientId,
        siteIds: siteId ? [siteId] : [],
        startDate: new Date().toISOString().slice(0, 10),
      });
      navigation.navigate('Mission', { missionId });
    } catch (e) {
      Alert.alert('Mission non créée', String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={[{ flex: 1 }, missionStyles.screen]} contentContainerStyle={{ padding: 16, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
      <View style={[{ borderRadius: 14, padding: 13, marginBottom: 18 }, missionStyles.infoBox]}>
        <Text style={[{ fontWeight: '900', fontSize: 12.5 }, missionStyles.accentText]}>Tout est modifiable plus tard</Text>
        <Text style={{ color: COLORS.inkSoft, marginTop: 4, fontSize: 10.5, lineHeight: 15 }}>
          Tu peux créer un brouillon immédiatement. Aucun champ ci-dessous n’est exigé pour enregistrer la Mission.
        </Text>
      </View>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>1 · Famille proposée</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
        {MISSION_FAMILIES.map((item) => <Choice key={item.key} selected={family === item.key} label={item.label} onPress={() => selectFamily(item.key)} />)}
      </View>

      {familyDef ? <>
        <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 8 }]}>2 · Type de mission</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          {familyDef.types.map(([key, text]) => <Choice key={key} selected={type === key} label={text} onPress={() => setType(key)} />)}
        </View>
      </> : null}

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel, { marginTop: 8 }]}>Contexte</Text>
      <TextInput style={[styles.input, missionStyles.input, { marginBottom: 9 }]} value={label} onChangeText={setLabel} placeholder="Objet / nom de la Mission (optionnel)" />
      <TextInput style={[styles.input, missionStyles.input, { marginBottom: 9 }]} value={reference} onChangeText={setReference} placeholder="Référence affaire (optionnelle)" />
      <TextInput style={[styles.input, missionStyles.input, { marginBottom: 9 }]} value={responsible} onChangeText={setResponsible} placeholder="Responsable E&S (optionnel)" />
      <TextInput style={[styles.input, missionStyles.input, { marginBottom: 14, minHeight: 76, textAlignVertical: 'top' }]} multiline value={description} onChangeText={setDescription} placeholder="Contexte / point de départ (optionnel)" />

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Client Missions</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
        {clients.map((client) => <Choice key={client.id} selected={clientId === client.id} label={client.name} onPress={() => setClientId(client.id)} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        <TextInput style={[styles.input, missionStyles.input, { flex: 1 }]} value={newClient} onChangeText={setNewClient} placeholder="Nouveau client Missions" />
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={addClient}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Client</Text></TouchableOpacity>
      </View>

      <Text style={[styles.sectionLabel, missionStyles.sectionLabel]}>Site Missions</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
        {sites.map((site) => <Choice key={site.id} selected={siteId === site.id} label={site.name} onPress={() => setSiteId(site.id)} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
        <TextInput style={[styles.input, missionStyles.input, { flex: 1 }]} value={newSite} onChangeText={setNewSite} placeholder="Nouveau site Missions" />
        <TouchableOpacity style={[styles.btnSecondary, missionStyles.secondaryButton]} onPress={addSite}><Text style={[styles.btnSecondaryText, missionStyles.secondaryButtonText]}>＋ Site</Text></TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.btnPrimary, missionStyles.primaryButton, { alignItems: 'center', paddingVertical: 13 }]} disabled={saving} onPress={save}>
        <Text style={[styles.btnPrimaryText, missionStyles.primaryButtonText]}>{saving ? 'Création…' : 'Créer / enregistrer le brouillon'}</Text>
      </TouchableOpacity>
      <Text style={{ color: MISSION_COLORS.accentDark, fontSize: 9.5, textAlign: 'center', marginTop: 8 }}>
        Données locales Missions uniquement · aucune lecture ou remontée Intranet
      </Text>
    </ScrollView>
  );
}
