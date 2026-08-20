/** Écran Paramètres — bibliothèque de réserves personnalisées (CRUD). */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert, ScrollView } from 'react-native';
import { COLORS, styles } from './styles.js';
import {
  listerBibliothequeReserves, ajouterReserveBiblio, modifierReserveBiblio, supprimerReserveBiblio,
} from './db.js';
import { CategorieCritereSelector } from './GenericFields.js';

function ParametresScreen() {
  const [reserves, setReserves] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editId, setEditId] = useState(null);
  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [prix, setPrix] = useState('');
  const [poste, setPoste] = useState('');
  const [delai, setDelai] = useState('');

  const charger = useCallback(() => {
    listerBibliothequeReserves().then(setReserves);
  }, []);

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
      poste: poste.trim() || null,
      delai: delai ? parseInt(delai, 10) : null,
    };
    if (editId) await modifierReserveBiblio(editId, data);
    else await ajouterReserveBiblio(data);
    setModalVisible(false);
    charger();
  };

  const supprimer = (r) => {
    Alert.alert('Supprimer', `Supprimer "${r.nom}" de la bibliothèque ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { await supprimerReserveBiblio(r.id); charger(); } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <FlatList
        contentContainerStyle={styles.content}
        data={reserves}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Bibliothèque de réserves</Text>
            <TouchableOpacity onPress={ouvrirNouveau}>
              <Text style={styles.addLink}>+ Ajouter</Text>
            </TouchableOpacity>
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
            <TouchableOpacity onPress={() => supprimer(item)}>
              <Text style={styles.removeLink}>Suppr.</Text>
            </TouchableOpacity>
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
            <ScrollView>
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
                placeholder="Description / prestation"
                value={description} onChangeText={setDescription} multiline
              />
              <TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Poste (ex: Travaux de conformité)" value={poste} onChangeText={setPoste} />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Prix (€HT)" value={prix} onChangeText={setPrix} keyboardType="numeric" />
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="Délai (mois)" value={delai} onChangeText={setDelai} keyboardType="numeric" />
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setModalVisible(false)}>
                  <Text style={styles.btnSecondaryText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnPrimary} onPress={enregistrer}>
                  <Text style={styles.btnPrimaryText}>Enregistrer</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export { ParametresScreen };
