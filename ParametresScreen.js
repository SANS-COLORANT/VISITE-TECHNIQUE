/** Écran Paramètres — deux bibliothèques distinctes : réserves et équipements. */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert, ScrollView, Image } from 'react-native';
import { COLORS, styles } from './styles.js';
import {
  listerBibliothequeReserves, ajouterReserveBiblio, modifierReserveBiblio, supprimerReserveBiblio,
  listerBibliothequeEquipements, ajouterEquipementBiblio, modifierEquipementBiblio, supprimerEquipementBiblio,
  listerCategoriesEquipement, listerMarquesEquipement, rechercherModelesEquipement,
  ajouterCategorieEquipement, ajouterMarqueEquipement, ajouterModeleEquipement,
  desactiverCategorieEquipement, desactiverMarqueEquipement,
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
    try {
      if (editId) await modifierReserveBiblio(editId, data); else await ajouterReserveBiblio(data);
      setModalVisible(false);
      await charger();
    } catch (e) {
      Alert.alert('Erreur d\'enregistrement', String(e.message || e));
    }
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
  const [vue, setVue] = useState('modeles');
  const [modeles, setModeles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [marques, setMarques] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [categorieFiltre, setCategorieFiltre] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [nom, setNom] = useState('');
  const [icone, setIcone] = useState('⚙️');
  const [logoUri, setLogoUri] = useState('');
  const [categorieId, setCategorieId] = useState(null);
  const [marqueId, setMarqueId] = useState(null);
  const [reference, setReference] = useState('');
  const [caracteristiques, setCaracteristiques] = useState('');

  const chargerReferentiels = useCallback(async () => {
    const [cats, brands] = await Promise.all([listerCategoriesEquipement(), listerMarquesEquipement()]);
    setCategories(cats); setMarques(brands);
  }, []);
  const chargerModeles = useCallback(async () => {
    setModeles(await rechercherModelesEquipement({ recherche, categorieId: categorieFiltre }));
  }, [recherche, categorieFiltre]);

  useEffect(() => { chargerReferentiels(); }, [chargerReferentiels]);
  useEffect(() => { chargerModeles(); }, [chargerModeles]);

  const ouvrirNouveau = () => {
    setNom(''); setIcone('⚙️'); setLogoUri(''); setCategorieId(null); setMarqueId(null);
    setReference(''); setCaracteristiques(''); setModalVisible(true);
  };
  const enregistrer = async () => {
    if (!nom.trim()) { Alert.alert('Nom requis', 'Merci de saisir un nom.'); return; }
    try {
      if (vue === 'categories') {
        await ajouterCategorieEquipement({ nom: nom.trim(), icone });
      } else if (vue === 'marques') {
        await ajouterMarqueEquipement({ nom: nom.trim(), logoUri: logoUri.trim() || null });
      } else {
        if (!categorieId || !marqueId) { Alert.alert('Informations requises', 'Choisis une catégorie et une marque.'); return; }
        await ajouterModeleEquipement({
          categorieId, marqueId, nom: nom.trim(), reference: reference.trim(),
          caracteristiques: caracteristiques.trim(), motsCles: `${nom} ${reference} ${caracteristiques}`,
        });
      }
      setModalVisible(false);
      await Promise.all([chargerReferentiels(), chargerModeles()]);
    } catch (e) {
      Alert.alert('Erreur d\'enregistrement', String(e.message || e));
    }
  };

  const retirer = (item) => {
    Alert.alert('Retirer du catalogue', `Retirer « ${item.nom} » ? Les équipements déjà utilisés dans les visites seront conservés.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: async () => {
        if (vue === 'categories') await desactiverCategorieEquipement(item.id);
        else if (vue === 'marques') await desactiverMarqueEquipement(item.id);
        else await supprimerEquipementBiblio(item.id);
        await Promise.all([chargerReferentiels(), chargerModeles()]);
      } },
    ]);
  };

  const donnees = vue === 'categories' ? categories : vue === 'marques' ? marques : modeles;
  const titreAjout = vue === 'categories' ? 'Nouvelle catégorie' : vue === 'marques' ? 'Nouvelle marque' : 'Nouveau modèle';

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.catalogueSearchBox}>
        <TextInput
          style={styles.catalogueSearchInput}
          placeholder="Rechercher une marque, catégorie ou modèle…"
          value={recherche} onChangeText={setRecherche}
        />
      </View>
      <View style={styles.catalogueTabs}>
        {[['modeles', 'Modèles'], ['marques', 'Marques'], ['categories', 'Catégories']].map(([id, label]) => (
          <TouchableOpacity key={id} style={[styles.catalogueTab, vue === id && styles.catalogueTabActive]} onPress={() => setVue(id)}>
            <Text style={[styles.catalogueTabText, vue === id && styles.catalogueTabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {vue === 'modeles' && (
        <View style={styles.catalogueFilters}>
          <TouchableOpacity style={[styles.catalogueFilter, !categorieFiltre && styles.catalogueFilterActive]} onPress={() => setCategorieFiltre(null)}>
            <Text style={[styles.catalogueFilterText, !categorieFiltre && styles.catalogueFilterTextActive]}>Tout</Text>
          </TouchableOpacity>
          {categories.map((c) => (
            <TouchableOpacity key={c.id} style={[styles.catalogueFilter, categorieFiltre === c.id && styles.catalogueFilterActive]} onPress={() => setCategorieFiltre(c.id)}>
              <Text style={[styles.catalogueFilterText, categorieFiltre === c.id && styles.catalogueFilterTextActive]}>{c.icone} {c.nom}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <FlatList
        contentContainerStyle={styles.content}
        data={donnees.filter((item) => vue === 'modeles' || !recherche.trim() || item.nom.toLowerCase().includes(recherche.trim().toLowerCase()))}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>{modeles.length} modèles · {marques.length} marques · {categories.length} catégories</Text>
            <TouchableOpacity onPress={ouvrirNouveau}><Text style={styles.addLink}>+ Ajouter</Text></TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.catalogueCard}>
            {vue === 'modeles' ? <Text style={styles.equipmentIcon}>{item.icone || '⚙️'}</Text> : vue === 'marques' ? <BrandMark marque={item} /> : <Text style={styles.equipmentIcon}>{item.icone || '⚙️'}</Text>}
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{vue === 'modeles' ? item.nom : item.nom}</Text>
              <Text style={styles.cardSub}>
                {vue === 'modeles' ? `${item.marque} · ${item.categorie}${item.reference ? ' · ' + item.reference : ''}` : `${item.nb_modeles} modèle${item.nb_modeles > 1 ? 's' : ''}`}
              </Text>
              {vue === 'modeles' && item.caracteristiques ? <Text style={styles.catalogueDescription}>{item.caracteristiques}</Text> : null}
            </View>
            <TouchableOpacity onPress={() => retirer(item)}><Text style={styles.removeLink}>Retirer</Text></TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucun résultat.</Text>
            <Text style={styles.emptySub}>Modifie la recherche ou ajoute une nouvelle référence.</Text>
          </View>
        }
      />
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>{titreAjout}</Text>
              {vue === 'modeles' && (
                <>
                  <Text style={styles.fieldLabel}>Catégorie</Text>
                  <View style={styles.catalogueChoiceGrid}>{categories.map((c) => <TouchableOpacity key={c.id} style={[styles.catalogueChoice, categorieId === c.id && styles.catalogueChoiceActive]} onPress={() => setCategorieId(c.id)}><Text>{c.icone} {c.nom}</Text></TouchableOpacity>)}</View>
                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Marque</Text>
                  <View style={styles.catalogueChoiceGrid}>{marques.map((b) => <TouchableOpacity key={b.id} style={[styles.catalogueChoice, marqueId === b.id && styles.catalogueChoiceActive]} onPress={() => setMarqueId(b.id)}><Text>{b.nom}</Text></TouchableOpacity>)}</View>
                </>
              )}
              {vue === 'categories' && <TextInput style={styles.input} placeholder="Symbole (ex : 💧)" value={icone} onChangeText={setIcone} maxLength={3} />}
              <TextInput style={[styles.input, { marginTop: 10 }]} placeholder={vue === 'modeles' ? 'Nom du modèle' : 'Nom'} value={nom} onChangeText={setNom} />
              {vue === 'marques' && <TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Adresse du logo (facultatif)" value={logoUri} onChangeText={setLogoUri} autoCapitalize="none" />}
              {vue === 'modeles' && <>
                <TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Référence (facultatif)" value={reference} onChangeText={setReference} />
                <TextInput style={[styles.input, { marginTop: 10, minHeight: 70, textAlignVertical: 'top' }]} placeholder="Caractéristiques" value={caracteristiques} onChangeText={setCaracteristiques} multiline />
              </>}
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

function BrandMark({ marque }) {
  if (marque.logo_uri) return <Image source={{ uri: marque.logo_uri }} style={styles.brandLogo} resizeMode="contain" />;
  const initiales = marque.nom.split(/\s+/).map((mot) => mot[0]).join('').slice(0, 2).toUpperCase();
  return <View style={styles.brandFallback}><Text style={styles.brandFallbackText}>{initiales}</Text></View>;
}

export { ParametresScreen, CATEGORIES_EQUIPEMENT, MARQUES_EQUIPEMENT };
