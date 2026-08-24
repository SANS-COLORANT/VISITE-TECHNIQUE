/** Liste équipements virtualisée et catalogue chargé uniquement à la demande. */

import React, { memo, useCallback, useEffect, useState } from 'react';
import { FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  listerMateriel,
  ajouterMateriel,
  upsertMaterielChamp,
  supprimerMateriel,
  listerBibliothequeEquipements,
  listerCategoriesEquipement,
  listerMarquesEquipement,
} from './db.js';
import { TypeAheadInput, ChipSelector } from './GenericFields.js';
import { useDurableAutosave } from './durableAutosave.js';
import { PhotoButton } from './PhotoButton.js';
import { BrandMark } from './BrandLogo.js';
import { COLORS, styles } from './styles.js';

const CATEGORIES_FALLBACK = ['Adoucisseur','Armoire électrique','Ballon ECS','Chaudière','Circulateur','Coffret gaz','Compteur','Désemboueur','Détendeur','Échangeur','Extincteur','Filtre','Manomètre','Pompe','Robinetterie','Soupape','Vanne',"Vase d'expansion"];
const MARQUES_FALLBACK = ['De Dietrich','Viessmann','Grundfos','Wilo','Saunier Duval','Atlantic','Frisquet','Chappée','Chaffoteaux','Elm Leblanc','Bosch','Vaillant','Fernox','Alfa Laval'];

function fusionnerOptions(base, rows) {
  return [...new Set([...base, ...rows.map((r) => r.nom).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
}

const EquipmentCard = memo(function EquipmentCard({ item, visiteId, onChange, categories, marques }) {
  const [categorie, setCategorie] = useState(item.categorie || '');
  const [marque, setMarque] = useState(item.marque || '');
  const [etat, setEtat] = useState(item.etat || '');
  const [biblioVisible, setBiblioVisible] = useState(false);
  const [biblio, setBiblio] = useState([]);
  const [biblioChargee, setBiblioChargee] = useState(false);
  const [designation, setDesignation, blurDesignation] = useDurableAutosave(item.designation, (v) => upsertMaterielChamp(item.id, 'designation', v));
  const [modele, setModele, blurModele] = useDurableAutosave(item.modele, (v) => upsertMaterielChamp(item.id, 'modele', v));
  const [annee, setAnnee, blurAnnee] = useDurableAutosave(item.annee, (v) => upsertMaterielChamp(item.id, 'annee', v));

  useEffect(() => {
    setCategorie(item.categorie || '');
    setMarque(item.marque || '');
    setEtat(item.etat || '');
  }, [item.categorie, item.marque, item.etat]);

  const sauverCategorie = async (v) => { setCategorie(v); await upsertMaterielChamp(item.id, 'categorie', v); };
  const sauverMarque = async (v) => { setMarque(v); await upsertMaterielChamp(item.id, 'marque', v); };
  const sauverEtat = async (v) => { setEtat(v); await upsertMaterielChamp(item.id, 'etat', v); };

  const ouvrirBibliotheque = async () => {
    setBiblioVisible(true);
    if (!biblioChargee) {
      setBiblio(await listerBibliothequeEquipements());
      setBiblioChargee(true);
    }
  };

  const choisir = async (e) => {
    const nouvelleCategorie = e.categorie || '';
    const nouvelleMarque = e.marque || '';
    setCategorie(nouvelleCategorie);
    setMarque(nouvelleMarque);
    await Promise.all([
      upsertMaterielChamp(item.id, 'categorie', nouvelleCategorie),
      upsertMaterielChamp(item.id, 'marque', nouvelleMarque),
      upsertMaterielChamp(item.id, 'modele', e.modele || ''),
    ]);
    setBiblioVisible(false);
    await onChange();
  };

  return (
    <View style={styles.formCard}>
      <View style={styles.equipmentBrandHeader}>
        <BrandMark marque={marque} compact />
        <TouchableOpacity style={[styles.biblioShortcutBtn, { flex: 1 }]} onPress={ouvrirBibliotheque}>
          <Text style={styles.biblioShortcutBtnText}>📚 Choisir dans la bibliothèque</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.materielTopRow}>
        <View style={{ flex: 1 }}>
          <TypeAheadInput valeur={categorie} options={categories} placeholder="Catégorie" onChange={sauverCategorie} />
        </View>
        <PhotoButton visiteId={visiteId} entiteKey={item.equipement_id ? `equipement||${item.equipement_id}` : `materiel||${item.id}`} label={designation || categorie || 'Équipement'} />
      </View>

      {item.equipement_id ? (
        <View style={styles.persistentEquipmentBadge}>
          <Text style={styles.persistentEquipmentBadgeText}>↻ Équipement permanent · {item.nb_observations || 0} visite{item.nb_observations > 1 ? 's' : ''}</Text>
        </View>
      ) : null}

      <View style={{ height: 8 }} />
      <TextInput style={styles.input} placeholder="Désignation" value={designation} onChangeText={setDesignation} onBlur={blurDesignation} />
      <View style={{ height: 8 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><TypeAheadInput valeur={marque} options={marques} placeholder="Marque" onChange={sauverMarque} /></View>
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Modèle" value={modele} onChangeText={setModele} onBlur={blurModele} />
        <TextInput style={[styles.input, { width: 76 }]} placeholder="Année" value={annee} onChangeText={setAnnee} onBlur={blurAnnee} keyboardType="numeric" />
      </View>

      <View style={{ height: 10 }} />
      <Text style={styles.fieldLabel}>État constaté pendant cette visite</Text>
      <View style={{ height: 6 }} />
      <ChipSelector valeur={etat} options={['Bon', 'À surveiller', 'Dégradé', 'Hors service']} onChange={sauverEtat} />

      <TouchableOpacity style={{ marginTop: 10 }} onPress={async () => { await supprimerMateriel(item.id); await onChange(); }}>
        <Text style={styles.removeLink}>Déclarer cet équipement retiré</Text>
      </TouchableOpacity>

      <Modal visible={biblioVisible} transparent animationType="fade" onRequestClose={() => setBiblioVisible(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Choisir un équipement</Text>
          <FlatList
            data={biblioChargee ? biblio : []}
            keyExtractor={(e) => e.id}
            style={{ maxHeight: 380 }}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews
            renderItem={({ item: e }) => (
              <TouchableOpacity style={styles.biblioRow} onPress={() => choisir(e)}>
                <View style={styles.equipmentLibraryRow}>
                  <BrandMark marque={e} compact />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.biblioRowTitle}>{e.categorie}</Text>
                    <Text style={styles.biblioRowSub}>{[e.marque, e.modele].filter(Boolean).join(' — ') || '—'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptySub}>{biblioChargee ? 'Bibliothèque vide.' : 'Chargement…'}</Text>}
          />
          <TouchableOpacity style={[styles.btnSecondary, { marginTop: 14 }]} onPress={() => setBiblioVisible(false)}>
            <Text style={styles.btnSecondaryText}>Fermer</Text>
          </TouchableOpacity>
        </View></View>
      </Modal>
    </View>
  );
});

function OptimizedEquipmentPanel({ visiteId }) {
  const [materiel, setMateriel] = useState([]);
  const [categories, setCategories] = useState(CATEGORIES_FALLBACK);
  const [marques, setMarques] = useState(MARQUES_FALLBACK);

  const charger = useCallback(async () => {
    setMateriel(await listerMateriel(visiteId));
  }, [visiteId]);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => {
    let actif = true;
    Promise.all([listerCategoriesEquipement(), listerMarquesEquipement()])
      .then(([c, m]) => {
        if (!actif) return;
        setCategories(fusionnerOptions(CATEGORIES_FALLBACK, c));
        setMarques(fusionnerOptions(MARQUES_FALLBACK, m));
      })
      .catch(() => {});
    return () => { actif = false; };
  }, []);

  const ajouter = useCallback(async () => {
    await ajouterMateriel(visiteId);
    await charger();
  }, [charger, visiteId]);

  return (
    <FlatList
      data={materiel}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <EquipmentCard item={item} visiteId={visiteId} onChange={charger} categories={categories} marques={marques} />
      )}
      contentContainerStyle={styles.panelContent}
      ListHeaderComponent={<Text style={styles.sectionTitle}>Équipements — feuille MATERIEL · {materiel.length}</Text>}
      ListFooterComponent={<TouchableOpacity style={styles.addBtn} onPress={ajouter}><Text style={styles.addBtnText}>+ Ajouter un équipement</Text></TouchableOpacity>}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Aucun équipement pour cette visite.</Text></View>}
      initialNumToRender={5}
      maxToRenderPerBatch={5}
      windowSize={5}
      updateCellsBatchingPeriod={60}
      removeClippedSubviews
      keyboardShouldPersistTaps="handled"
    />
  );
}

export { OptimizedEquipmentPanel };
