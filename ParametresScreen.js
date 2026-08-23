/** Écran Paramètres — bibliothèques de réserves et d'équipements. */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert, ScrollView, useWindowDimensions } from 'react-native';
import { COLORS, styles } from './styles.js';
import { BrandMark, getBrandColor, mixWithWhite } from './BrandLogo.js';
import {
  listerBibliothequeReserves, ajouterReserveBiblio, modifierReserveBiblio, supprimerReserveBiblio,
  listerBibliothequeEquipements, ajouterEquipementBiblio, modifierEquipementBiblio, supprimerEquipementBiblio,
  listerCategoriesEquipement, listerMarquesEquipement, rechercherModelesEquipement,
  ajouterCategorieEquipement, ajouterMarqueEquipement, ajouterModeleEquipement,
  desactiverCategorieEquipement, desactiverMarqueEquipement,
} from './db.js';
import { CategorieCritereSelector } from './GenericFields.js';

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
  const [onglet, setOnglet] = useState('reserves');
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
    setEditId(null); setNom(''); setDescription(''); setPrix(''); setPoste(''); setDelai(''); setModalVisible(true);
  };
  const ouvrirEdition = (r) => {
    setEditId(r.id); setNom(r.nom); setDescription(r.description || '');
    setPrix(r.prix ? String(r.prix) : ''); setPoste(r.poste || ''); setDelai(r.delai ? String(r.delai) : ''); setModalVisible(true);
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
      setModalVisible(false); await charger();
    } catch (e) { Alert.alert('Erreur d\'enregistrement', String(e.message || e)); }
  };
  const supprimer = (r) => Alert.alert('Supprimer', `Supprimer "${r.nom}" de la bibliothèque ?`, [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Supprimer', style: 'destructive', onPress: async () => { await supprimerReserveBiblio(r.id); charger(); } },
  ]);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        contentContainerStyle={styles.content}
        data={reserves}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={<View style={styles.sectionHeaderRow}><Text style={styles.sectionLabel}>Bibliothèque de réserves</Text><TouchableOpacity onPress={ouvrirNouveau}><Text style={styles.addLink}>+ Ajouter</Text></TouchableOpacity></View>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => ouvrirEdition(item)}>
            <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.nom}</Text>{item.description ? <Text style={styles.cardSub} numberOfLines={2}>{item.description}</Text> : null}</View>
            <TouchableOpacity onPress={() => supprimer(item)}><Text style={styles.removeLink}>Suppr.</Text></TouchableOpacity>
          </TouchableOpacity>
        )}
      />
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}><View style={styles.modalSheet}><ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.modalTitle}>{editId ? 'Modifier la réserve' : 'Nouvelle réserve'}</Text>
          {!editId && <View style={{ marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: COLORS.line }}><CategorieCritereSelector onRempli={(r) => { setNom(r.nom); setDescription(r.description); setPoste(r.poste || ''); setDelai(r.delai ? String(r.delai) : ''); setPrix(r.prix ? String(Math.round(r.prix)) : ''); }} /></View>}
          <TextInput style={styles.input} placeholder="Nom" value={nom} onChangeText={setNom} />
          <TextInput style={[styles.input, { marginTop: 10, height: 70, textAlignVertical: 'top' }]} placeholder="Description / prestation" value={description} onChangeText={setDescription} multiline />
          <TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Poste" value={poste} onChangeText={setPoste} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}><TextInput style={[styles.input, { flex: 1 }]} placeholder="Prix (€HT)" value={prix} onChangeText={setPrix} keyboardType="numeric" /><TextInput style={[styles.input, { flex: 1 }]} placeholder="Délai (mois)" value={delai} onChangeText={setDelai} keyboardType="numeric" /></View>
          <View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={() => setModalVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={enregistrer}><Text style={styles.btnPrimaryText}>Enregistrer</Text></TouchableOpacity></View>
        </ScrollView></View></View>
      </Modal>
    </View>
  );
}

function GradientStrips({ marque }) {
  const base = getBrandColor(marque);
  const steps = 42;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0, borderRadius: 13, overflow: 'hidden', flexDirection: 'row' }}>
      {Array.from({ length: steps }, (_, i) => {
        const t = i / (steps - 1);
        const eased = Math.pow(Math.max(0, (t - 0.06) / 0.94), 1.05);
        return <View key={i} style={{ flex: 1, backgroundColor: mixWithWhite(base, Math.min(0.985, eased)) }} />;
      })}
    </View>
  );
}

function BrandCatalogueCard({ item, vue, marqueObjet, onRetirer, tablet }) {
  const isModel = vue === 'modeles';
  const isBrand = vue === 'marques';
  const marqueNom = isModel ? item.marque : item.nom;
  if (!isModel && !isBrand) {
    return (
      <View style={[styles.catalogueCard, tablet && { flex: 1 }]}>
        <Text style={styles.equipmentIcon}>{item.icone || '⚙️'}</Text>
        <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.nom}</Text><Text style={styles.cardSub}>{item.nb_modeles} modèle{item.nb_modeles > 1 ? 's' : ''}</Text></View>
        <TouchableOpacity onPress={() => onRetirer(item)}><Text style={styles.removeLink}>Retirer</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: tablet ? 1 : undefined, minHeight: tablet ? 76 : 82, marginBottom: tablet ? 10 : 11, borderRadius: 13, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(20,20,20,0.07)', backgroundColor: '#fff' }}>
      <GradientStrips marque={marqueNom} />
      <View style={{ flex: 1, minHeight: tablet ? 76 : 82, flexDirection: 'row', alignItems: 'center', paddingHorizontal: tablet ? 12 : 14, paddingVertical: 10, gap: tablet ? 10 : 12 }}>
        <View style={{ width: tablet ? 96 : 104, alignItems: 'center', justifyContent: 'center' }}>
          <BrandMark marque={marqueObjet} onColor compact={tablet} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: tablet ? 13.5 : 15, fontWeight: '800', color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.16)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>
            {item.nom}
          </Text>
          <Text numberOfLines={1} style={{ marginTop: 2, fontSize: tablet ? 10.5 : 11.5, fontWeight: '600', color: 'rgba(255,255,255,0.95)' }}>
            {isModel ? `${item.marque} · ${item.categorie}${item.reference ? ' · ' + item.reference : ''}` : `${item.nb_modeles} modèle${item.nb_modeles > 1 ? 's' : ''}`}
          </Text>
          {isModel && item.caracteristiques ? <Text numberOfLines={1} style={{ marginTop: 3, fontSize: tablet ? 9.5 : 10.5, color: 'rgba(255,255,255,0.82)' }}>{item.caracteristiques}</Text> : null}
        </View>
        <TouchableOpacity onPress={() => onRetirer(item)} style={{ alignSelf: 'stretch', justifyContent: 'center', paddingLeft: 8 }}>
          <Text style={{ fontSize: 11, color: '#777', fontWeight: '600' }}>Retirer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function BibliothequeEquipements() {
  const { width } = useWindowDimensions();
  const tablet = width >= 700;
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

  const chargerReferentiels = useCallback(async () => { const [cats, brands] = await Promise.all([listerCategoriesEquipement(), listerMarquesEquipement()]); setCategories(cats); setMarques(brands); }, []);
  const chargerModeles = useCallback(async () => setModeles(await rechercherModelesEquipement({ recherche, categorieId: categorieFiltre })), [recherche, categorieFiltre]);
  useEffect(() => { chargerReferentiels(); }, [chargerReferentiels]);
  useEffect(() => { chargerModeles(); }, [chargerModeles]);

  const ouvrirNouveau = () => { setNom(''); setIcone('⚙️'); setLogoUri(''); setCategorieId(null); setMarqueId(null); setReference(''); setCaracteristiques(''); setModalVisible(true); };
  const enregistrer = async () => {
    if (!nom.trim()) { Alert.alert('Nom requis', 'Merci de saisir un nom.'); return; }
    try {
      if (vue === 'categories') await ajouterCategorieEquipement({ nom: nom.trim(), icone });
      else if (vue === 'marques') await ajouterMarqueEquipement({ nom: nom.trim(), logoUri: logoUri.trim() || null });
      else {
        if (!categorieId || !marqueId) { Alert.alert('Informations requises', 'Choisis une catégorie et une marque.'); return; }
        await ajouterModeleEquipement({ categorieId, marqueId, nom: nom.trim(), reference: reference.trim(), caracteristiques: caracteristiques.trim(), motsCles: `${nom} ${reference} ${caracteristiques}` });
      }
      setModalVisible(false); await Promise.all([chargerReferentiels(), chargerModeles()]);
    } catch (e) { Alert.alert('Erreur d\'enregistrement', String(e.message || e)); }
  };
  const retirer = (item) => Alert.alert('Retirer du catalogue', `Retirer « ${item.nom} » ? Les équipements déjà utilisés dans les visites seront conservés.`, [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Retirer', style: 'destructive', onPress: async () => { if (vue === 'categories') await desactiverCategorieEquipement(item.id); else if (vue === 'marques') await desactiverMarqueEquipement(item.id); else await supprimerEquipementBiblio(item.id); await Promise.all([chargerReferentiels(), chargerModeles()]); } },
  ]);

  const donnees = vue === 'categories' ? categories : vue === 'marques' ? marques : modeles;
  const titreAjout = vue === 'categories' ? 'Nouvelle catégorie' : vue === 'marques' ? 'Nouvelle marque' : 'Nouveau modèle';
  const marquePourModele = (item) => { const ref = marques.find((b) => String(b.nom || '').trim().toLowerCase() === String(item.marque || '').trim().toLowerCase()); return { marque: item.marque || '', logo_uri: item.logo_uri || ref?.logo_uri || null }; };
  const filtered = donnees.filter((item) => vue === 'modeles' || !recherche.trim() || item.nom.toLowerCase().includes(recherche.trim().toLowerCase()));
  const numColumns = tablet && vue !== 'categories' ? 2 : 1;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.catalogueSearchBox}><TextInput style={styles.catalogueSearchInput} placeholder="Rechercher une marque, catégorie ou modèle…" value={recherche} onChangeText={setRecherche} /></View>
      <View style={styles.catalogueTabs}>{[['modeles', 'Modèles'], ['marques', 'Marques'], ['categories', 'Catégories']].map(([id, label]) => <TouchableOpacity key={id} style={[styles.catalogueTab, vue === id && styles.catalogueTabActive]} onPress={() => setVue(id)}><Text style={[styles.catalogueTabText, vue === id && styles.catalogueTabTextActive]}>{label}</Text></TouchableOpacity>)}</View>
      {vue === 'modeles' && <View style={styles.catalogueFilters}><TouchableOpacity style={[styles.catalogueFilter, !categorieFiltre && styles.catalogueFilterActive]} onPress={() => setCategorieFiltre(null)}><Text style={[styles.catalogueFilterText, !categorieFiltre && styles.catalogueFilterTextActive]}>Tout</Text></TouchableOpacity>{categories.map((c) => <TouchableOpacity key={c.id} style={[styles.catalogueFilter, categorieFiltre === c.id && styles.catalogueFilterActive]} onPress={() => setCategorieFiltre(c.id)}><Text style={[styles.catalogueFilterText, categorieFiltre === c.id && styles.catalogueFilterTextActive]}>{c.icone} {c.nom}</Text></TouchableOpacity>)}</View>}
      <FlatList
        key={`${vue}-${numColumns}`}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? { gap: 12 } : undefined}
        contentContainerStyle={[styles.content, tablet && { paddingHorizontal: 24 }]}
        data={filtered}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<View style={styles.sectionHeaderRow}><Text style={styles.sectionLabel}>{modeles.length} modèles · {marques.length} marques · {categories.length} catégories</Text><TouchableOpacity onPress={ouvrirNouveau}><Text style={styles.addLink}>+ Ajouter</Text></TouchableOpacity></View>}
        renderItem={({ item }) => <BrandCatalogueCard item={item} vue={vue} marqueObjet={vue === 'modeles' ? marquePourModele(item) : item} onRetirer={retirer} tablet={tablet} />}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Aucun résultat.</Text><Text style={styles.emptySub}>Modifie la recherche ou ajoute une nouvelle référence.</Text></View>}
      />
      <Modal visible={modalVisible} transparent animationType="fade"><View style={styles.modalOverlay}><View style={styles.modalSheet}><ScrollView keyboardShouldPersistTaps="handled">
        <Text style={styles.modalTitle}>{titreAjout}</Text>
        {vue === 'modeles' && <><Text style={styles.fieldLabel}>Catégorie</Text><View style={styles.catalogueChoiceGrid}>{categories.map((c) => <TouchableOpacity key={c.id} style={[styles.catalogueChoice, categorieId === c.id && styles.catalogueChoiceActive]} onPress={() => setCategorieId(c.id)}><Text>{c.icone} {c.nom}</Text></TouchableOpacity>)}</View><Text style={[styles.fieldLabel, { marginTop: 12 }]}>Marque</Text><View style={styles.catalogueChoiceGrid}>{marques.map((b) => <TouchableOpacity key={b.id} style={[styles.catalogueChoice, marqueId === b.id && styles.catalogueChoiceActive]} onPress={() => setMarqueId(b.id)}><Text>{b.nom}</Text></TouchableOpacity>)}</View></>}
        {vue === 'categories' && <TextInput style={styles.input} placeholder="Symbole (ex : 💧)" value={icone} onChangeText={setIcone} maxLength={3} />}
        <TextInput style={[styles.input, { marginTop: 10 }]} placeholder={vue === 'modeles' ? 'Nom du modèle' : 'Nom'} value={nom} onChangeText={setNom} />
        {vue === 'marques' && <TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Adresse du logo (facultatif)" value={logoUri} onChangeText={setLogoUri} autoCapitalize="none" />}
        {vue === 'modeles' && <><TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Référence (facultatif)" value={reference} onChangeText={setReference} /><TextInput style={[styles.input, { marginTop: 10, minHeight: 70, textAlignVertical: 'top' }]} placeholder="Caractéristiques" value={caracteristiques} onChangeText={setCaracteristiques} multiline /></>}
        <View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={() => setModalVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={enregistrer}><Text style={styles.btnPrimaryText}>Enregistrer</Text></TouchableOpacity></View>
      </ScrollView></View></View></Modal>
    </View>
  );
}

export { ParametresScreen, CATEGORIES_EQUIPEMENT, MARQUES_EQUIPEMENT };
