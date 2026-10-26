import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { styles } from './styles.js';
import { ChampGenerique, ControleGenerique } from './GenericFields.js';
import { getChampsVisite, getControlesVisite } from './db.js';
import { getVisitFieldOverrides, saveVisitFieldOverride } from './visitCustomization.js';
import { getVisitTrameData, sectionCodeFor } from './visitFields.js';

/** The REMAR workbook shares the same observations, photos and reserve tools. */
export function RemarPanel({ visiteId, panelId, refreshKey, onSaved }) {
  const [champs, setChamps] = useState({});
  const [controles, setControles] = useState({});
  const [overrides, setOverrides] = useState([]);
  const [section, setSection] = useState(null);
  const [cle, setCle] = useState('');
  const [type, setType] = useState('champ');
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getChampsVisite(visiteId), getControlesVisite(visiteId), getVisitFieldOverrides(visiteId)])
      .then(([c, a, o]) => { if (active) { setChamps(c); setControles(a); setOverrides(o); setReady(true); } })
      .catch((e) => { if (active) Alert.alert('Chargement impossible', String(e.message || e)); });
    return () => { active = false; };
  }, [visiteId, refreshKey, revision]);

  const sections = getVisitTrameData('REMAR_CROUS', overrides)[panelId] || {};
  const modifier = async (field, hidden) => {
    try {
      await saveVisitFieldOverride(visiteId, { ...field, panel_id: panelId, masque: hidden });
      setRevision((r) => r + 1);
      onSaved?.();
    } catch (e) { Alert.alert('Modification impossible', String(e.message || e)); }
  };
  const retirer = (sub, field) => Alert.alert(
    'Retirer ce point de la visite ?',
    'Les observations sont conservées. Tu pourras réafficher ce point dans cette section.',
    [{ text: 'Annuler', style: 'cancel' }, { text: 'Retirer', onPress: () => modifier({ ...field, section: sub }, 1) }]
  );
  const ajouter = async () => {
    if (!cle.trim() || saving) return;
    if (sections[section]?.some((f) => f.cle.toLocaleLowerCase() === cle.trim().toLocaleLowerCase())) {
      Alert.alert('Point déjà présent', 'Choisis un autre intitulé.'); return;
    }
    setSaving(true);
    try {
      await saveVisitFieldOverride(visiteId, { panel_id: panelId, section, cle, type, masque: 0 });
      setSection(null); setRevision((r) => r + 1); onSaved?.();
    } catch (e) { Alert.alert('Ajout impossible', String(e.message || e)); }
    finally { setSaving(false); }
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelContent}>
      <Text style={styles.importHint}>Trame REMAR · CROUS — saisie enregistrée automatiquement. Adapte les points à cette visite.</Text>
      {!ready ? <Text>Chargement…</Text> : Object.entries(sections).map(([sub, fields]) => {
        const code = sectionCodeFor(panelId, sub);
        const hidden = overrides.filter((r) => r.panel_id === panelId && r.section === sub && r.masque);
        return <View key={sub}>
          <Text style={styles.sectionTitle}>{sub}</Text>
          <View style={styles.formCard}>
            {fields.map((field) => <View key={field.cle}>
              {field.type === 'champ' ?
                <ChampGenerique visiteId={visiteId} sectionCode={code} field={field} valeurInitiale={champs[`${code}||${field.cle}`]} onSaved={onSaved} /> :
                <ControleGenerique visiteId={visiteId} sectionCode={code} field={field} etatInitial={controles[`${code}||${field.cle}`]} onSaved={onSaved} trameCode="REMAR_CROUS" commentaireToujoursVisible />}
              <TouchableOpacity accessibilityLabel={`Retirer ${field.cle}`} style={styles.btnSecondary} onPress={() => retirer(sub, field)}>
                <Text style={styles.btnSecondaryText}>Retirer ce point</Text>
              </TouchableOpacity>
            </View>)}
            {!fields.length && <Text style={styles.importHint}>Aucun point actif dans cette section.</Text>}
            {hidden.map((field) => <TouchableOpacity key={field.cle} style={styles.addBtn} onPress={() => modifier(field, 0)}>
              <Text style={styles.addBtnText}>↩ Réafficher : {field.cle}</Text>
            </TouchableOpacity>)}
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => { setCle(''); setType('champ'); setSection(sub); }}>
            <Text style={styles.addBtnText}>+ Ajouter un point dans {sub}</Text>
          </TouchableOpacity>
        </View>;
      })}
      <Modal visible={section !== null} transparent animationType="fade" onRequestClose={() => !saving && setSection(null)}>
        <View style={styles.modalOverlay}><View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Ajouter un point</Text>
          <Text style={styles.importHint}>{section}</Text>
          <TextInput style={styles.input} value={cle} onChangeText={setCle} placeholder="Intitulé du point" maxLength={150} autoFocus />
          <View style={styles.modalActions}>
            {['champ', 'controle'].map((t) => <TouchableOpacity key={t} style={type === t ? styles.btnPrimary : styles.btnSecondary} onPress={() => setType(t)}>
              <Text style={type === t ? styles.btnPrimaryText : styles.btnSecondaryText}>{t === 'champ' ? 'Information / mesure' : 'Contrôle avec avis'}</Text>
            </TouchableOpacity>)}
          </View>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.btnSecondary} disabled={saving} onPress={() => setSection(null)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} disabled={saving || !cle.trim()} onPress={ajouter}><Text style={styles.btnPrimaryText}>{saving ? 'Ajout…' : 'Ajouter'}</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </ScrollView>
  );
}
