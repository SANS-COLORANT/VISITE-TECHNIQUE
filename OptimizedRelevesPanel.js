/** Panneau Relevés virtualisé pour Android natif. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { TRAME_DATA } from './data.js';
import { ajouterCompteur, getChampsVisite, listerCompteurs, supprimerCompteur, upsertCompteurChamp } from './db.js';
import { ChampGenerique, cleanLabel, useSaisieAvecAutoSave } from './GenericFields.js';
import { PhotoButton } from './PhotoButton.js';

const COMPTEUR_TYPES = ['Compteur gaz','Compteur énergie chauffage','Compteur énergie ECS','Compteur eau appoint chauffage','Compteur eau froide ECS','Compteur eau froide générale','Compteur électrique','Compteur fioul','Compteur calories','Compteur volumétrique','Manomètre chauffage','Manomètre ECS'];
const UNITES = ['m³', 'L', 'MWh', 'kWh', 'bar', '%'];

function mapperChamps(rows = []) {
  const map = {};
  rows.forEach((row) => { if (row?.section_code && row?.cle) map[`${row.section_code}||${row.cle}`] = row.valeur; });
  return map;
}

const CompteurCard = React.memo(function CompteurCard({ compteur, visiteId, onRemove }) {
  const [label, setLabel, blurLabel] = useSaisieAvecAutoSave(compteur.label, (v) => upsertCompteurChamp(compteur.id, 'label', v));
  const [unite, setUnite] = useState(compteur.unite || 'm³');
  const [valeur, setValeur, blurValeur] = useSaisieAvecAutoSave(compteur.valeur, (v) => upsertCompteurChamp(compteur.id, 'valeur', v));
  useEffect(() => { setUnite(compteur.unite || 'm³'); }, [compteur.unite]);

  const retirer = async () => {
    onRemove(compteur.id);
    try { await supprimerCompteur(compteur.id); } catch (e) { console.warn('Suppression compteur impossible', e); }
  };

  return <View style={styles.compteurRow}>
    <View style={styles.compteurRowTop}>
      <View style={{ flex: 1 }}><TextInput style={styles.input} value={label} onChangeText={setLabel} onBlur={blurLabel} placeholder="Nom du compteur" /></View>
      <PhotoButton visiteId={visiteId} entiteKey={compteur.compteur_site_id ? `compteur_site||${compteur.compteur_site_id}` : `compteur||${compteur.id}`} label={label || 'Compteur'} />
      <TouchableOpacity onPress={retirer}><Text style={styles.removeLink}>Retirer</Text></TouchableOpacity>
    </View>
    <View style={styles.compteurRowBody}>
      <TextInput style={styles.compteurValInput} value={valeur} onChangeText={setValeur} onBlur={blurValeur} placeholder="Valeur relevée" keyboardType="numeric" />
      <View style={styles.uniteRow}>{UNITES.map((u) => <TouchableOpacity key={u} style={[styles.uniteChip, unite === u && styles.uniteChipSelected]} onPress={() => { setUnite(u); upsertCompteurChamp(compteur.id, 'unite', u).catch(console.warn); }}><Text style={[styles.uniteChipText, unite === u && styles.uniteChipTextSelected]}>{u}</Text></TouchableOpacity>)}</View>
    </View>
  </View>;
});

export function OptimizedRelevesPanel({ visiteId, onSaved }) {
  const [champsMap, setChampsMap] = useState({});
  const [compteurs, setCompteurs] = useState([]);
  const [ajoutCompteurVisible, setAjoutCompteurVisible] = useState(false);
  const [nomCompteurChoisi, setNomCompteurChoisi] = useState('');
  const [nomCompteurLibre, setNomCompteurLibre] = useState('');
  const [modeNomLibre, setModeNomLibre] = useState(false);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const autoSeedFaitRef = useRef(false);

  const sections = TRAME_DATA['p-releves'];
  const champsTemp = useMemo(() => sections['Températures et pH'] || [], [sections]);
  const champsCompteursIndex = useMemo(() => (sections['Relevés des compteurs et manomètres'] || []).filter((f) => /^Index/i.test(f.cle)), [sections]);
  const champsPression = useMemo(() => (sections['Relevés des compteurs et manomètres'] || []).filter((f) => !/^Index/i.test(f.cle)), [sections]);

  const chargerInitial = useCallback(async () => {
    const [champs, compteursDb] = await Promise.all([getChampsVisite(visiteId), listerCompteurs(visiteId)]);
    setChampsMap(mapperChamps(champs));
    setCompteurs(compteursDb);
    if (!autoSeedFaitRef.current && compteursDb.length === 0 && champsCompteursIndex.length > 0) {
      autoSeedFaitRef.current = true;
      const crees = [];
      for (const f of champsCompteursIndex) {
        const label = cleanLabel(f.cle);
        const id = await ajouterCompteur(visiteId, label);
        crees.push({ id, visite_id: visiteId, label, unite: null, valeur: null });
      }
      if (crees.length) setCompteurs(crees);
    }
  }, [visiteId, champsCompteursIndex]);

  useEffect(() => { chargerInitial().catch((e) => console.warn('Chargement relevés impossible', e)); }, [chargerInitial]);

  const creerCompteurChoisi = async () => {
    const label = modeNomLibre ? nomCompteurLibre.trim() : nomCompteurChoisi.trim();
    if (!label || creationEnCours) return;
    setCreationEnCours(true);
    try {
      const id = await ajouterCompteur(visiteId, label);
      setCompteurs((c) => [...c, { id, visite_id: visiteId, label, unite: null, valeur: null }]);
      setAjoutCompteurVisible(false); setNomCompteurChoisi(''); setNomCompteurLibre(''); setModeNomLibre(false);
    } finally { setCreationEnCours(false); }
  };

  const retirerLocalement = useCallback((id) => setCompteurs((c) => c.filter((x) => x.id !== id)), []);

  const rows = useMemo(() => [
    { key: 'title-pressure', type: 'title', label: 'Pressions' },
    ...champsPression.map((f) => ({ key: `pressure-${f.cle}`, type: 'field', field: f, sectionCode: 'releves.compteurs' })),
    { key: 'title-counters', type: 'title', label: 'Compteurs relevés' },
    ...compteurs.map((c) => ({ key: `counter-${c.id}`, type: 'counter', compteur: c })),
    { key: 'add-counter', type: 'add' },
    { key: 'title-temp', type: 'title', label: 'Températures et pH' },
    ...champsTemp.map((f) => ({ key: `temp-${f.cle}`, type: 'field', field: f, sectionCode: 'releves.temperatures' })),
  ], [champsPression, champsTemp, compteurs]);

  return <>
    <FlatList
      data={rows}
      keyExtractor={(item) => item.key}
      renderItem={({ item }) => {
        if (item.type === 'title') return <Text style={styles.sectionTitle}>{item.label}</Text>;
        if (item.type === 'add') return <TouchableOpacity style={styles.addBtn} onPress={() => { setNomCompteurChoisi(''); setNomCompteurLibre(''); setModeNomLibre(false); setAjoutCompteurVisible(true); }}><Text style={styles.addBtnText}>+ Ajouter un compteur</Text></TouchableOpacity>;
        if (item.type === 'counter') return <CompteurCard compteur={item.compteur} visiteId={visiteId} onRemove={retirerLocalement} />;
        return <View style={styles.formCard}><ChampGenerique visiteId={visiteId} sectionCode={item.sectionCode} field={item.field} valeurInitiale={champsMap[`${item.sectionCode}||${item.field.cle}`]} onSaved={onSaved} /></View>;
      }}
      contentContainerStyle={styles.panelContent}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      windowSize={5}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews
    />

    <Modal visible={ajoutCompteurVisible} transparent animationType="fade" onRequestClose={() => setAjoutCompteurVisible(false)}>
      <View style={styles.modalOverlay}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Ajouter un compteur</Text>
        <Text style={styles.importHint}>Choisis le type de compteur. Son nom pourra être modifié ensuite directement dans la visite.</Text>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 320, marginTop: 10 }}>
          {COMPTEUR_TYPES.map((nom) => <TouchableOpacity key={nom} style={[styles.biblioRow, nomCompteurChoisi === nom && { borderColor: COLORS.primary, borderWidth: 1 }]} onPress={() => { setNomCompteurChoisi(nom); setModeNomLibre(false); setNomCompteurLibre(''); }}><Text style={styles.biblioRowTitle}>{nom}</Text></TouchableOpacity>)}
          <TouchableOpacity style={[styles.biblioRow, modeNomLibre && { borderColor: COLORS.primary, borderWidth: 1 }]} onPress={() => { setModeNomLibre(true); setNomCompteurChoisi(''); }}><Text style={styles.biblioRowTitle}>+ Autre / nom personnalisé</Text></TouchableOpacity>
          {modeNomLibre && <TextInput style={[styles.input, { marginTop: 10 }]} value={nomCompteurLibre} onChangeText={setNomCompteurLibre} placeholder="Ex. Compteur primaire RCU bâtiment A" autoFocus />}
        </ScrollView>
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setAjoutCompteurVisible(false)} disabled={creationEnCours}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, ((!nomCompteurChoisi && !nomCompteurLibre.trim()) || creationEnCours) ? { opacity: 0.45 } : null]} disabled={(!nomCompteurChoisi && !nomCompteurLibre.trim()) || creationEnCours} onPress={creerCompteurChoisi}><Text style={styles.btnPrimaryText}>{creationEnCours ? 'Ajout…' : 'Ajouter'}</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </>;
}
