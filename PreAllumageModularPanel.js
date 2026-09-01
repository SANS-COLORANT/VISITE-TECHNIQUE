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

function mapChamps(rows) {
  return Object.fromEntries((rows || []).map((r) => [`${r.section_code}||${r.cle}`, r.valeur]));
}
function mapControles(rows) {
  return Object.fromEntries((rows || []).map((r) => [`${r.section_code}||${r.cle}`, r]));
}

function PetitBouton({ label, onPress, danger = false, primary = false }) {
  const backgroundColor = danger ? COLORS.redBg : primary ? COLORS.orange : COLORS.orangeLight;
  const borderColor = danger ? COLORS.red : COLORS.orange;
  const color = danger ? COLORS.red : primary ? COLORS.white : COLORS.orangeDark;
  return <TouchableOpacity onPress={onPress} style={{ borderWidth: 1, borderColor, backgroundColor, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 }}>
    <Text style={{ color, fontWeight: '700', fontSize: 12 }}>{label}</Text>
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
    <View style={styles.modalOverlay}>
      <View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>{titre}</Text>
        <TextInput style={styles.input} value={nom} onChangeText={setNom} placeholder={estLocal ? 'Ex. SST 12, Chaufferie Nord…' : 'Nom'} autoFocus />
        {estLocal ? <>
          <Text style={{ fontWeight: '700', color: COLORS.ink, marginTop: 14, marginBottom: 7 }}>Type</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{PREALLUMAGE_TYPES_LOCAUX.map((t) => {
            const selected = typeCode === t.code;
            return <TouchableOpacity key={t.code} onPress={() => setTypeCode(t.code)} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: selected ? COLORS.orange : COLORS.line, backgroundColor: selected ? COLORS.orange : COLORS.white }}><Text style={{ color: selected ? COLORS.white : COLORS.inkSoft, fontWeight: '700' }}>{t.label}</Text></TouchableOpacity>;
          })}</View>
          {typeCode !== 'chaufferie' ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <TouchableOpacity onPress={() => setChauffage(!chauffage)} style={{ flex: 1, padding: 11, borderRadius: 10, borderWidth: 1, borderColor: chauffage ? COLORS.orange : COLORS.line, backgroundColor: chauffage ? COLORS.orangeLight : COLORS.white }}><Text style={{ textAlign: 'center', fontWeight: '700', color: chauffage ? COLORS.orangeDark : COLORS.inkSoft }}>{chauffage ? '✓ ' : ''}Chauffage</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setEcs(!ecs)} style={{ flex: 1, padding: 11, borderRadius: 10, borderWidth: 1, borderColor: ecs ? COLORS.orange : COLORS.line, backgroundColor: ecs ? COLORS.orangeLight : COLORS.white }}><Text style={{ textAlign: 'center', fontWeight: '700', color: ecs ? COLORS.orangeDark : COLORS.inkSoft }}>{ecs ? '✓ ' : ''}ECS</Text></TouchableOpacity>
          </View> : null}
        </> : null}
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.btnSecondary} onPress={onClose}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={() => onSubmit({ nom, typeCode, chauffage, ecs })}><Text style={styles.btnPrimaryText}>Ajouter</Text></TouchableOpacity>
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
  const [editionStructure, setEditionStructure] = useState(false);

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
        <View style={{ backgroundColor: COLORS.white, borderColor: editionStructure ? COLORS.orange : COLORS.line, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: COLORS.ink }}>Structure de la visite</Text>
              <Text style={{ color: COLORS.inkSoft, fontSize: 12, marginTop: 3 }}>Les locaux alimentent automatiquement les compteurs, la régulation et les contrôles associés.</Text>
            </View>
            <PetitBouton label={editionStructure ? 'Terminer' : 'Modifier'} primary={editionStructure} onPress={() => setEditionStructure((v) => !v)} />
          </View>
          {editionStructure ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <PetitBouton label="+ Local / site" onPress={() => setModal('local')} />
            <PetitBouton label="+ Rubrique" onPress={() => setModal('rubrique')} />
          </View> : null}
        </View>
      </View>}
      renderSectionHeader={({ section }) => {
        const local = section.local_id ? localParId.get(section.local_id) : null;
        return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, marginBottom: 9 }}>
          {editionStructure ? <SaisieNom value={section.nom} onSave={async (nom) => { if (local) await renommerLocalPreAllumage(local.id, nom); else await renommerRubriquePreAllumage(section.id, nom); await recharger(); onSaved?.(); }} style={[styles.sectionTitle, { flex: 1, marginBottom: 0, borderBottomWidth: 1, borderBottomColor: COLORS.line, paddingVertical: 3 }]} /> : <Text style={[styles.sectionTitle, { flex: 1, marginBottom: 0 }]}>{section.nom}</Text>}
          {editionStructure ? <PetitBouton label="+ Champ" onPress={() => ouvrirChamp(section)} /> : null}
          {editionStructure && section.supprimable ? <PetitBouton label="Supprimer" danger onPress={() => local ? confirmerSuppressionLocal(local) : confirmerSuppressionRubrique(section)} /> : null}
        </View>;
      }}
      renderItem={({ item, section }) => <View style={styles.formCard}>
        {editionStructure ? <View style={{ alignItems: 'flex-end', marginBottom: 3 }}><PetitBouton label="Retirer" danger onPress={() => Alert.alert('Retirer ce champ ?', `La saisie « ${item.field.displayLabel} » sera supprimée.`, [{ text: 'Annuler', style: 'cancel' }, { text: 'Retirer', style: 'destructive', onPress: async () => { await supprimerChampPreAllumage(item.field.modularFieldId); await recharger(); onSaved?.(); } }])} /></View> : null}
        {item.field.type === 'controle' ? (editionStructure ? <SaisieNom value={item.field.displayLabel} onSave={async (nom) => { await renommerChampPreAllumage(item.field.modularFieldId, nom); await recharger(); onSaved?.(); }} style={[styles.fieldLabel, { borderBottomWidth: 1, borderBottomColor: COLORS.line, marginBottom: 8, paddingVertical: 4 }]} /> : null) : null}
        {item.field.type === 'champ' ? <DurableChampGenerique visiteId={visiteId} sectionCode={section.sectionCode} field={{ ...item.field, renamable: editionStructure }} valeurInitiale={champsMap[item.key]} displayLabel={item.field.displayLabel} onRename={editionStructure ? async (nom) => { await renommerChampPreAllumage(item.field.modularFieldId, nom); await recharger(); onSaved?.(); } : null} onSaved={(valeur) => { setChampsMap((m) => ({ ...m, [item.key]: valeur })); onSaved?.(); }} /> : item.field.presets ? <PresetControleGenerique visiteId={visiteId} sectionCode={section.sectionCode} field={item.field} displayLabel={item.field.displayLabel} etatInitial={controlesMap[item.key]} onEtatChange={(patch) => setControlesMap((m) => ({ ...m, [item.key]: { ...(m[item.key] || {}), ...patch } }))} onSaved={onSaved} /> : <PersistentControleGenerique visiteId={visiteId} sectionCode={section.sectionCode} field={item.field} etatInitial={controlesMap[item.key]} onSaved={onSaved} />}
      </View>}
      ListEmptyComponent={<Text style={{ color: COLORS.inkSoft, textAlign: 'center', padding: 24 }}>Aucune rubrique. Activez « Modifier » pour ajouter un local ou une rubrique.</Text>}
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
