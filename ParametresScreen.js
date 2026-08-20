/** Écran Paramètres — deux bibliothèques distinctes : réserves et équipements. */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert, ScrollView } from 'react-native';
import { COLORS, styles } from './styles.js';
import {
  listerBibliothequeReserves, ajouterReserveBiblio, modifierReserveBiblio, supprimerReserveBiblio,
  listerBibliothequeEquipements, ajouterEquipementBiblio, modifierEquipementBiblio, supprimerEquipementBiblio,
} from './db.js';
import { CategorieCritereSelector, TypeAheadInput } from './GenericFields.js';

const CATEGORIES_EQUIPEMENT = [
  'Adoucisseur', 'Armoire électrique', 'Ballon ECS', 'Chaudière', 'Circulateur',
  'Coffret gaz', 'Compteur', 'Désemboueur', 'Détendeur', 'Échangeur',
  'Extincteur', 'Filtre', 'Manomètre', 'Pompe', 'Robinetterie', 'Soupape',
  'Vanne', "Vase d'expansion",
];
const MARQUES_EQUIPEMENT = [
  'De Dietrich', 'Viessmann', 'Grundfos', 'Wilo', 'Saunier Duval',
  'Atlantic', 'Frisquet', 'Chappée', 'Chaffoteaux', 'Elm Leblanc',
  'Bosch', 'Vaillant', 'Fernox', 'Alfa Laval',
];

function ParametresScreen() {
  const [onglet, setOnglet] = useState('reserves'); // 'reserves' | 'equipements'

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={styles.paramTabs}>
        <TouchableOpacity style={[styles.paramTab, onglet === 'reserves' && styles.paramTabActive]} onPress={() => setOnglet('reserves')}>
          <Text style={[styles.paramTabText, onglet === 'reserves' && styles.paramTabTextActive]}>Réserves</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.paramTab, onglet === 'equipements' && styles.paramTabActive]} onPress={() => setOnglet('equipements')}>
          <Text style={[styles.paramTabText, onglet === 'equipements' && styles.paramTabTextActive]}>Équipements</Text>
        </TouchableOpacity>
      </View>
      {onglet === 'reserves' ? <BibliothequeReserves /> : <BibliothequeEquipements />}
    </View>
  );
}

// ----------------------------------------------------------------------------
// Bibliothèque de réserves
// ----------------------------------------------------------------------------

function BibliothequeReserves() {
  const [reserves, setReserves] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editId, setEditId] = useState(null);
  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [prix, setPrix] = useState('');
  const [poste, setPoste] = useState('');
  const [delai, setDelai] = useState('');

  const charger = useCallback(() => { listerBibliothequeReserves().then(setReserves); }, []);
  useEffect(() => { charger(); }, [charger]);

  const ouvrirNouveau = () => {
    setEditId(null); setNom(''); setDescription(''); setPrix(''); setPoste(''); setDelai('');
    setModalVisible(true);
  };
  const ouvrirEdition = (r) => {
    setEditId(r.id); setNom(r.nom); setDescription(r.description || '');
    setPrix(r.prix ? String(r.prix) : ''); setPoste(r.poste || ''); setDelai(r.delai ? String(r.delai) : '');
    setModalVisible(true);
  };
  const enregistrer = async () => {
    if (!nom.trim()) { Alert.alert('Nom requis', 'Merci de donner un nom à cette réserve.'); return; }
    const data = {
      nom: nom.trim(), description: description.trim() || null,
      prix: prix ? parseFloat(prix.replace(',', '.')) : null,
      poste: poste.trim() || null, delai: delai ? parseInt(delai, 10) : null,
    };
    if (editId) await modifierReserveBiblio(editId, data); else await ajouterReserveBiblio(data);
    setModalVisible(false); charger();
  };
  const supprimer = (r) => {
    Alert.alert('Supprimer', `Supprimer "${r.nom}" de la bibliothèque ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { await supprimerReserveBiblio(r.id); charger(); } },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        contentContainerStyle={styles.content}
        data={reserves}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Bibliothèque de réserves</Text>
            <TouchableOpacity onPress={ouvrirNouveau}><Text style={styles.addLink}>+ Ajouter</Text></TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => ouvrirEdition(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.nom}</Text>
              {item.description ? <Text style={styles.cardSub} numberOfLines={2}>{item.description}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                {item.poste ? <Text style={styles.remarqueMetaTxt}>{item.poste}</Text> : null}
                {item.delai ? <Text style={styles.remarqueMetaTxt}>{item.delai} mois</Text> : null}
                {item.prix ? <Text style={styles.remarqueMetaTxt}>{Math.round(item.prix)} €</Text> : null}
              </View>
            </View>
            <TouchableOpacity onPress={() => supprimer(item)}><Text style={styles.removeLink}>Suppr.</Text></TouchableOpacity>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucune réserve personnalisée pour l'instant.</Text>
            <Text style={styles.emptySub}>Crées-en pour aller plus vite lors des visites.</Text>
          </View>
        }
      />
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>{editId ? 'Modifier la réserve' : 'Nouvelle réserve'}</Text>
              {!editId && (
                <View style={{ marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: COLORS.line }}>
                  <CategorieCritereSelector
                    onRempli={(r) => {
                      setNom(r.nom); setDescription(r.description);
                      setPoste(r.poste || ''); setDelai(r.delai ? String(r.delai) : '');
                      setPrix(r.prix ? String(Math.round(r.prix)) : '');
                    }}
                  />
                  <Text style={styles.emptySub}>Choisis une catégorie et une cause pour pré-remplir, ou saisis librement ci-dessous.</Text>
                </View>
              )}
              <TextInput style={styles.input} placeholder="Nom" value={nom} onChangeText={setNom} />
              <TextInput
                style={[styles.input, { marginTop: 10, height: 70, textAlignVertical: 'top' }]}
                placeholder="Description / prestation" value={description} onChangeText={setDescription} multiline
              />
              <TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Poste (ex: Travaux de conformité)" value={poste} onChangeText={setPoste} />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Prix (€HT)" value={prix} onChangeText={setPrix} keyboardType="numeric" />
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Délai (mois)" value={delai} onChangeText={setDelai} keyboardType="numeric" />
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setModalVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
                <TouchableOpacity style={styles.btnPrimary} onPress={enregistrer}><Text style={styles.btnPrimaryText}>Enregistrer</Text></TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ----------------------------------------------------------------------------
// Bibliothèque d'équipements — combinaisons catégorie/marque/modèle
// ----------------------------------------------------------------------------

function BibliothequeEquipements() {
  const [items, setItems] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editId, setEditId] = useState(null);
  const [categorie, setCategorie] = useState('');
  const [marque, setMarque] = useState('');
  const [modele, setModele] = useState('');

  const charger = useCallback(() => { listerBibliothequeEquipements().then(setItems); }, []);
  useEffect(() => { charger(); }, [charger]);

  const ouvrirNouveau = () => { setEditId(null); setCategorie(''); setMarque(''); setModele(''); setModalVisible(true); };
  const ouvrirEdition = (e) => { setEditId(e.id); setCategorie(e.categorie); setMarque(e.marque || ''); setModele(e.modele || ''); setModalVisible(true); };
  const enregistrer = async () => {
    if (!categorie.trim()) { Alert.alert('Catégorie requise', 'Merci de choisir ou saisir une catégorie.'); return; }
    const data = { categorie: categorie.trim(), marque: marque.trim() || null, modele: modele.trim() || null };
    if (editId) await modifierEquipementBiblio(editId, data); else await ajouterEquipementBiblio(data);
    setModalVisible(false); charger();
  };
  const supprimer = (e) => {
    Alert.alert('Supprimer', `Supprimer "${e.categorie}${e.marque ? ' — ' + e.marque : ''}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { await supprimerEquipementBiblio(e.id); charger(); } },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        contentContainerStyle={styles.content}
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Bibliothèque d'équipements</Text>
            <TouchableOpacity onPress={ouvrirNouveau}><Text style={styles.addLink}>+ Ajouter</Text></TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => ouvrirEdition(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.categorie}</Text>
              <Text style={styles.cardSub}>{[item.marque, item.modele].filter(Boolean).join(' — ') || 'Sans marque/modèle'}</Text>
            </View>
            <TouchableOpacity onPress={() => supprimer(item)}><Text style={styles.removeLink}>Suppr.</Text></TouchableOpacity>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucun équipement dans la bibliothèque.</Text>
            <Text style={styles.emptySub}>Ajoutes-en pour les sélectionner d'un coup pendant les visites.</Text>
          </View>
        }
      />
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>{editId ? "Modifier l'équipement" : 'Nouvel équipement'}</Text>
              <Text style={styles.fieldLabel}>Catégorie</Text>
              <TypeAheadInput valeur={categorie} options={CATEGORIES_EQUIPEMENT} placeholder="Ex: Chaudière..." onChange={setCategorie} />
              <View style={{ height: 10 }} />
              <Text style={styles.fieldLabel}>Marque</Text>
              <TypeAheadInput valeur={marque} options={MARQUES_EQUIPEMENT} placeholder="Ex: De Dietrich..." onChange={setMarque} />
              <View style={{ height: 10 }} />
              <TextInput style={styles.input} placeholder="Modèle" value={modele} onChangeText={setModele} />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setModalVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
                <TouchableOpacity style={styles.btnPrimary} onPress={enregistrer}><Text style={styles.btnPrimaryText}>Enregistrer</Text></TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export { ParametresScreen, CATEGORIES_EQUIPEMENT, MARQUES_EQUIPEMENT };
