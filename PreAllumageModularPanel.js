import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, SectionList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getChampsVisite, getControlesVisite } from './db.js';
import { DurableChampGenerique } from './DurableChampGenerique.js';
import { PersistentControleGenerique } from './PersistentControleGenerique.js';
import { PresetControleGenerique } from './PresetControleGenerique.js';
import { PreAllumagePlanCard } from './PreAllumagePlanCard.js';
import { COLORS, styles } from './styles.js';
import {
  PREALLUMAGE_TYPES_LOCAUX,
  ajouterChampPreAllumage,
  ajouterLocalPreAllumage,
  ajouterRubriquePreAllumage,
  chargerPreAllumageModulaire,
  renommerChampPreAllumage,
  renommerLocalPreAllumage,
  renommerRubriquePreAllumage,
  rubriquesVersSections,
  supprimerChampPreAllumage,
  supprimerLocalPreAllumage,
  supprimerRubriquePreAllumage,
} from './preAllumageModularDb.js';

const ACTION = '#0B6B52';
const DANGER = '#B42318';

function mapChamps(rows) {
  return Object.fromEntries((rows || []).map((r) => [`${r.section_code}||${r.cle}`, r.valeur]));
}
function mapControles(rows) {
  return Object.fromEntries((rows || []).map((r) => [`${r.section_code}||${r.cle}`, r]));
}

function PetitBouton({ label, onPress, danger = false }) {
  return <TouchableOpacity onPress={onPress} style={{ borderWidth: 1, borderColor: danger ? '#FDA29B' : '#A6F4C5', backgroundColor: danger ? '#FEF3F2' : '#ECFDF3', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 }}>
    <Text style={{ color: danger ? DANGER : ACTION, fontWeight: '700', fontSize: 12 }}>{label}</Text>
  </TouchableOpacity>;
}

function SaisieNom({ value, onSave, style }) {
  const [texte, setTexte] = useState(value || '');
  useEffect(() => setTexte(value || ''), [value]);
  return <TextInput value={texte} onChangeText={setTexte} onBlur={() => onSave(texte)} style={style} />;
}

function GestionModal({ visible, mode, panelId, onClose, onSubmit }) {
  const [nom, setNom] = useState('');
  const [typeCode, setTypeCode] = useState('sous_station');
  const [chauffage, setChauffage] = useState(true);
  const [ecs, setEcs] = useState(true);
  useEffect(() => { if (visible) { setNom(''); setTypeCode('sous_station'); setChauffage(true); setEcs(true); } }, [visible, mode]);
  const estLocal = mode === 'local';
  const estControle = ['p-pa-chaufferie', 'p-pa-sst'].includes(panelId);
  const titre = estLocal ? 'Ajouter un local / site' : mode === 'rubrique' ? 'Ajouter une rubrique' : estControle ? 'Ajouter un contrôle' : 'Ajouter un champ';
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(16,24,40,.45)' }}>
      <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 14 }}>{titre}</Text>
        <TextInput style={styles.input} value={nom} onChangeText={setNom} placeholder={estLocal ? 'Ex. SST 12, Chaufferie Nord…' : 'Nom'} autoFocus />
        {estLocal ? <>
          <Text style={{ fontWeight: '700', marginTop: 14, marginBottom: 7 }}>Type</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{PREALLUMAGE_TYPES_LOCAUX.map((t) => <TouchableOpacity key={t.code} onPress={() => setTypeCode(t.code)} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20, backgroundColor: typeCode === t.code ? ACTION : '#F2F4F7' }}><Text style={{ color: typeCode === t.code ? '#fff' : '#344054', fontWeight: '700' }}>{t.label}</Text></TouchableOpacity>)}</View>
          {typeCode !== 'chaufferie' ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <TouchableOpacity onPress={() => setChauffage(!chauffage)} style={{ flex: 1, padding: 11, borderRadius: 10, backgroundColor: chauffage ? '#D1FADF' : '#F2F4F7' }}><Text style={{ textAlign: 'center', fontWeight: '700' }}>{chauffage ? '✓ ' : ''}Chauffage</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setEcs(!ecs)} style={{ flex: 1, padding: 11, borderRadius: 10, backgroundColor: ecs ? '#D1FADF' : '#F2F4F7' }}><Text style={{ textAlign: 'center', fontWeight: '700' }}>{ecs ? '✓ ' : ''}ECS</Text></TouchableOpacity>
          </View> : null}
        </> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 18 }}>
          <PetitBouton label="Annuler" onPress={onClose} />
          <TouchableOpacity onPress={() => onSubmit({ nom, typeCode, chauffage, ecs })} style={{ backgroundColor: ACTION, borderRadius: 9, paddingHorizontal: 16, paddingVertical: 9 }}><Text style={{ color: '#fff', fontWeight: '800' }}>Ajouter</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>;
}

export function PreAllumageModularPanel({ visiteId, panelId, onSaved }) {
  const [modele, setModele] = useState(null);
  const [champsMap, setChampsMap] = useState({});
  const [controlesMap, setControlesMap] = useState({});
  const [modal, setModal] = useState(null);
  const [rubriqueCible, setRubriqueCible] = useState(null);

  const recharger = useCallback(async () => {
    const [m, champs, controles] = await Promise.all([
      chargerPreAllumageModulaire(visiteId),
      getChampsVisite(visiteId),
      getControlesVisite(visiteId),
    ]);
    setModele(m); setChampsMap(mapChamps(champs)); setControlesMap(mapControles(controles));
  }, [visiteId]);
  useEffect(() => { recharger().catch((e) => Alert.alert('Pré-allumage', e.message)); }, [recharger]);

  const sections = useMemo(() => rubriquesVersSections(modele?.rubriques || [], panelId).map((r) => ({
    ...r,
    data: r.fields.map((field) => ({ field, key: `${r.sectionCode}||${field.cle}` })),
  })), [modele, panelId]);

  const localParId = useMemo(() => new Map((modele?.locaux || []).map((l) => [l.id, l])), [modele]);
  const ouvrirChamp = (rubrique) => { setRubriqueCible(rubrique); setModal('champ'); };
  const confirmerSuppressionRubrique = (rubrique) => Alert.alert('Supprimer cette rubrique ?', `Les saisies de « ${rubrique.nom} » seront supprimées.`, [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Supprimer', style: 'destructive', onPress: async () => { await supprimerRubriquePreAllumage(rubrique.id); await recharger(); onSaved?.(); } },
  ]);
  const confirmerSuppressionLocal = (local) => Alert.alert('Supprimer ce local ?', `Tous les compteurs, réglages et contrôles liés à « ${local.nom} » seront supprimés.`, [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Supprimer', style: 'destructive', onPress: async () => { await supprimerLocalPreAllumage(local.id); await recharger(); onSaved?.(); } },
  ]);

  const soumettre = async ({ nom, typeCode, chauffage, ecs }) => {
    try {
      if (modal === 'local') await ajouterLocalPreAllumage(visiteId, { nom, typeCode, chauffage, ecs });
      else if (modal === 'rubrique') await ajouterRubriquePreAllumage(visiteId, panelId, nom);
      else if (modal === 'champ' && rubriqueCible) await ajouterChampPreAllumage(rubriqueCible.id, { libelle: nom, type: ['p-pa-chaufferie', 'p-pa-sst'].includes(panelId) ? 'controle' : 'champ', numericIndex: panelId === 'p-pa-compteurs' });
      setModal(null); setRubriqueCible(null); await recharger(); onSaved?.();
    } catch (e) { Alert.alert('Impossible d’ajouter', e.message); }
  };

  if (!modele) return <View style={{ padding: 30 }}><ActivityIndicator color={COLORS.orange} /></View>;
  return <>
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.key}
      ListHeaderComponent={<View>
        {panelId === 'p-pa-batiments' ? <PreAllumagePlanCard visiteId={visiteId} onSaved={onSaved} /> : null}
        <View style={{ backgroundColor: '#F0FDF4', borderColor: '#ABEFC6', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <Text style={{ fontWeight: '800', color: '#075E45', marginBottom: 9 }}>Structure modulaire</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <PetitBouton label="+ Local / site" onPress={() => setModal('local')} />
            <PetitBouton label="+ Rubrique" onPress={() => setModal('rubrique')} />
          </View>
          <Text style={{ color: '#475467', fontSize: 12, marginTop: 8 }}>Les locaux alimentent automatiquement les compteurs, la régulation et les contrôles associés.</Text>
        </View>
      </View>}
      renderSectionHeader={({ section }) => {
        const local = section.local_id ? localParId.get(section.local_id) : null;
        return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, marginBottom: 9 }}>
          <SaisieNom value={section.nom} onSave={async (nom) => { if (local) await renommerLocalPreAllumage(local.id, nom); else await renommerRubriquePreAllumage(section.id, nom); await recharger(); onSaved?.(); }} style={[styles.sectionTitle, { flex: 1, marginBottom: 0, borderBottomWidth: 1, borderBottomColor: '#D0D5DD', paddingVertical: 3 }]} />
          <PetitBouton label="+ Champ" onPress={() => ouvrirChamp(section)} />
          {section.supprimable ? <PetitBouton label="Supprimer" danger onPress={() => local ? confirmerSuppressionLocal(local) : confirmerSuppressionRubrique(section)} /> : null}
        </View>;
      }}
      renderItem={({ item, section }) => <View style={styles.formCard}>
        <View style={{ alignItems: 'flex-end', marginBottom: 3 }}><PetitBouton label="Retirer" danger onPress={() => Alert.alert('Retirer ce champ ?', `La saisie « ${item.field.displayLabel} » sera supprimée.`, [{ text: 'Annuler', style: 'cancel' }, { text: 'Retirer', style: 'destructive', onPress: async () => { await supprimerChampPreAllumage(item.field.modularFieldId); await recharger(); onSaved?.(); } }])} /></View>
        {item.field.type === 'controle' ? <SaisieNom value={item.field.displayLabel} onSave={async (nom) => { await renommerChampPreAllumage(item.field.modularFieldId, nom); await recharger(); onSaved?.(); }} style={[styles.fieldLabel, { borderBottomWidth: 1, borderBottomColor: '#D0D5DD', marginBottom: 8, paddingVertical: 4 }]} /> : null}
        {item.field.type === 'champ' ? <DurableChampGenerique visiteId={visiteId} sectionCode={section.sectionCode} field={{ ...item.field, renamable: true }} valeurInitiale={champsMap[item.key]} displayLabel={item.field.displayLabel} onRename={async (nom) => { await renommerChampPreAllumage(item.field.modularFieldId, nom); await recharger(); onSaved?.(); }} onSaved={(valeur) => { setChampsMap((m) => ({ ...m, [item.key]: valeur })); onSaved?.(); }} /> : item.field.presets ? <PresetControleGenerique visiteId={visiteId} sectionCode={section.sectionCode} field={item.field} displayLabel={item.field.displayLabel} etatInitial={controlesMap[item.key]} onEtatChange={(patch) => setControlesMap((m) => ({ ...m, [item.key]: { ...(m[item.key] || {}), ...patch } }))} onSaved={onSaved} /> : <PersistentControleGenerique visiteId={visiteId} sectionCode={section.sectionCode} field={item.field} etatInitial={controlesMap[item.key]} onSaved={onSaved} />}
      </View>}
      ListEmptyComponent={<Text style={{ color: '#667085', textAlign: 'center', padding: 24 }}>Aucune rubrique. Utilisez « + Rubrique » ou ajoutez un local.</Text>}
      contentContainerStyle={styles.panelContent}
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled={false}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={5}
    />
    <GestionModal visible={Boolean(modal)} mode={modal} panelId={panelId} onClose={() => { setModal(null); setRubriqueCible(null); }} onSubmit={soumettre} />
  </>;
}
