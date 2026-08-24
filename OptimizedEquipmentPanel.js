/** Liste équipements virtualisée avec recommandations contextuelles issues du catalogue. */

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
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
import { styles } from './styles.js';

const CATEGORIES_FALLBACK = ['Adoucisseur','Armoire électrique','Ballon ECS','Chaudière','Circulateur','Coffret gaz','Compteur','Désemboueur','Détendeur','Échangeur','Extincteur','Filtre','Manomètre','Pompe','Robinetterie','Soupape','Vanne',"Vase d'expansion"];
const MARQUES_FALLBACK = ['De Dietrich','Viessmann','Grundfos','Wilo','Saunier Duval','Atlantic','Frisquet','Chappée','Chaffoteaux','Elm Leblanc','Bosch','Vaillant','Fernox','Alfa Laval'];

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map((v) => String(v).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
function fusionnerOptions(base, rows) { return unique([...base, ...rows.map((r) => r.nom)]); }
function egal(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }

function Suggestions({ titre, valeurs, actif, onPick }) {
  if (!valeurs?.length) return null;
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.importHint}>{titre}</Text>
      <View style={styles.catalogueChoiceGrid}>
        {valeurs.slice(0, 6).map((v) => (
          <TouchableOpacity key={v} style={[styles.catalogueChoice, egal(actif, v) && styles.catalogueChoiceActive]} onPress={() => onPick(v)}>
            <Text style={styles.catalogueFilterText}>{v}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const EquipmentCard = memo(function EquipmentCard({ item, visiteId, onChange, categories, marques, catalogue, designationOptions }) {
  const [categorie, setCategorie] = useState(item.categorie || '');
  const [marque, setMarque] = useState(item.marque || '');
  const [etat, setEtat] = useState(item.etat || '');
  const [biblioVisible, setBiblioVisible] = useState(false);
  const [designation, setDesignation, blurDesignation, setDesignationImmediate] = useDurableAutosave(item.designation, (v) => upsertMaterielChamp(item.id, 'designation', v));
  const [modele, setModele, blurModele, setModeleImmediate] = useDurableAutosave(item.modele, (v) => upsertMaterielChamp(item.id, 'modele', v));
  const [annee, setAnnee, blurAnnee] = useDurableAutosave(item.annee, (v) => upsertMaterielChamp(item.id, 'annee', v));

  useEffect(() => {
    setCategorie(item.categorie || '');
    setMarque(item.marque || '');
    setEtat(item.etat || '');
  }, [item.categorie, item.marque, item.etat]);

  const catalogueCategorie = useMemo(
    () => catalogue.filter((e) => !categorie || egal(e.categorie, categorie)),
    [catalogue, categorie]
  );
  const marquesContextuelles = useMemo(
    () => unique(catalogueCategorie.map((e) => e.marque)),
    [catalogueCategorie]
  );
  const modelesRecommandes = useMemo(() => {
    const candidats = catalogue.filter((e) => (!categorie || egal(e.categorie, categorie)) && (!marque || egal(e.marque, marque)) && e.modele);
    return unique(candidats.map((e) => e.modele));
  }, [catalogue, categorie, marque]);
  const designationsRecommandees = useMemo(() => unique([
    ...designationOptions,
    categorie,
    categorie && marque ? `${categorie} ${marque}` : null,
    categorie && modele ? `${categorie} ${modele}` : null,
  ]), [designationOptions, categorie, marque, modele]);

  const sauverCategorie = async (v) => {
    setCategorie(v);
    await upsertMaterielChamp(item.id, 'categorie', v);
    if ((!designation || egal(designation, 'Équipement')) && v) setDesignationImmediate(v).catch(() => {});
  };
  const sauverMarque = async (v) => { setMarque(v); await upsertMaterielChamp(item.id, 'marque', v); };
  const sauverEtat = async (v) => { setEtat(v); await upsertMaterielChamp(item.id, 'etat', v); };

  const choisirModele = async (nomModele) => {
    const ref = catalogue.find((e) => egal(e.modele, nomModele) && (!categorie || egal(e.categorie, categorie)) && (!marque || egal(e.marque, marque)))
      || catalogue.find((e) => egal(e.modele, nomModele));
    if (ref?.categorie && !egal(ref.categorie, categorie)) { setCategorie(ref.categorie); await upsertMaterielChamp(item.id, 'categorie', ref.categorie); }
    if (ref?.marque && !egal(ref.marque, marque)) { setMarque(ref.marque); await upsertMaterielChamp(item.id, 'marque', ref.marque); }
    await setModeleImmediate(nomModele);
    if ((!designation || egal(designation, 'Équipement')) && (ref?.categorie || categorie)) {
      setDesignationImmediate(ref?.categorie || categorie).catch(() => {});
    }
  };

  const choisirCatalogue = async (e) => {
    const nouvelleCategorie = e.categorie || '';
    const nouvelleMarque = e.marque || '';
    setCategorie(nouvelleCategorie);
    setMarque(nouvelleMarque);
    await Promise.all([
      upsertMaterielChamp(item.id, 'categorie', nouvelleCategorie),
      upsertMaterielChamp(item.id, 'marque', nouvelleMarque),
      upsertMaterielChamp(item.id, 'modele', e.modele || ''),
    ]);
    await setModeleImmediate(e.modele || '');
    if (!designation || egal(designation, 'Équipement')) await setDesignationImmediate(nouvelleCategorie || 'Équipement');
    setBiblioVisible(false);
  };

  return (
    <View style={styles.formCard}>
      <View style={styles.equipmentBrandHeader}>
        <BrandMark marque={marque} compact />
        <TouchableOpacity style={[styles.biblioShortcutBtn, { flex: 1 }]} onPress={() => setBiblioVisible(true)}>
          <Text style={styles.biblioShortcutBtnText}>📚 Catalogue complet</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.materielTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Type d’équipement</Text>
          <TypeAheadInput valeur={categorie} options={categories} placeholder="Ex. Chaudière, pompe, échangeur…" onChange={sauverCategorie} />
        </View>
        <PhotoButton visiteId={visiteId} entiteKey={item.equipement_id ? `equipement||${item.equipement_id}` : `materiel||${item.id}`} label={designation || categorie || 'Équipement'} />
      </View>

      {item.equipement_id ? <View style={styles.persistentEquipmentBadge}><Text style={styles.persistentEquipmentBadgeText}>↻ Équipement permanent · {item.nb_observations || 0} visite{item.nb_observations > 1 ? 's' : ''}</Text></View> : null}

      <View style={{ height: 8 }} />
      <Text style={styles.fieldLabel}>Désignation</Text>
      <TextInput style={styles.input} placeholder="Ex. Chaudière n°1" value={designation} onChangeText={setDesignation} onBlur={blurDesignation} />
      <Suggestions titre="Désignations suggérées" valeurs={designationsRecommandees} actif={designation} onPick={(v) => setDesignationImmediate(v).catch(() => {})} />

      <View style={{ height: 10 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Marque</Text>
          <TypeAheadInput valeur={marque} options={marquesContextuelles.length ? marquesContextuelles : marques} placeholder="Marque" onChange={sauverMarque} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Modèle</Text>
          <TextInput style={styles.input} placeholder="Modèle" value={modele} onChangeText={setModele} onBlur={blurModele} />
        </View>
        <View style={{ width: 76 }}>
          <Text style={styles.fieldLabel}>Année</Text>
          <TextInput style={styles.input} placeholder="Année" value={annee} onChangeText={setAnnee} onBlur={blurAnnee} keyboardType="numeric" />
        </View>
      </View>
      <Suggestions titre={categorie && marque ? `Modèles ${categorie} · ${marque}` : 'Modèles recommandés'} valeurs={modelesRecommandes} actif={modele} onPick={choisirModele} />

      <View style={{ height: 10 }} />
      <Text style={styles.fieldLabel}>État constaté pendant cette visite</Text>
      <View style={{ height: 6 }} />
      <ChipSelector valeur={etat} options={['Bon', 'À surveiller', 'Dégradé', 'Hors service']} onChange={sauverEtat} />

      <TouchableOpacity style={{ marginTop: 10 }} onPress={async () => { await supprimerMateriel(item.id); await onChange(); }}>
        <Text style={styles.removeLink}>Déclarer cet équipement retiré</Text>
      </TouchableOpacity>

      <Modal visible={biblioVisible} transparent animationType="fade" onRequestClose={() => setBiblioVisible(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Catalogue équipements</Text>
          <Text style={styles.importHint}>Les références compatibles avec le type et la marque sélectionnés sont affichées en premier.</Text>
          <FlatList
            data={[...catalogue].sort((a, b) => {
              const sa = (categorie && egal(a.categorie, categorie) ? 2 : 0) + (marque && egal(a.marque, marque) ? 1 : 0);
              const sb = (categorie && egal(b.categorie, categorie) ? 2 : 0) + (marque && egal(b.marque, marque) ? 1 : 0);
              return sb - sa || String(a.categorie || '').localeCompare(String(b.categorie || '')) || String(a.marque || '').localeCompare(String(b.marque || ''));
            })}
            keyExtractor={(e) => e.id}
            style={{ maxHeight: 380 }}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews
            renderItem={({ item: e }) => (
              <TouchableOpacity style={styles.biblioRow} onPress={() => choisirCatalogue(e)}>
                <View style={styles.equipmentLibraryRow}>
                  <BrandMark marque={e} compact />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.biblioRowTitle}>{e.categorie}</Text>
                    <Text style={styles.biblioRowSub}>{[e.marque, e.modele].filter(Boolean).join(' — ') || '—'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptySub}>Catalogue vide.</Text>}
          />
          <TouchableOpacity style={[styles.btnSecondary, { marginTop: 14 }]} onPress={() => setBiblioVisible(false)}><Text style={styles.btnSecondaryText}>Fermer</Text></TouchableOpacity>
        </View></View>
      </Modal>
    </View>
  );
});

function OptimizedEquipmentPanel({ visiteId }) {
  const [materiel, setMateriel] = useState([]);
  const [categories, setCategories] = useState(CATEGORIES_FALLBACK);
  const [marques, setMarques] = useState(MARQUES_FALLBACK);
  const [catalogue, setCatalogue] = useState([]);

  const charger = useCallback(async () => setMateriel(await listerMateriel(visiteId)), [visiteId]);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => {
    let actif = true;
    Promise.all([listerCategoriesEquipement(), listerMarquesEquipement(), listerBibliothequeEquipements()])
      .then(([c, m, refs]) => {
        if (!actif) return;
        setCategories(fusionnerOptions(CATEGORIES_FALLBACK, c));
        setMarques(fusionnerOptions(MARQUES_FALLBACK, m));
        setCatalogue(refs || []);
      })
      .catch(() => {});
    return () => { actif = false; };
  }, []);

  const designationParCategorie = useMemo(() => {
    const map = new Map();
    for (const m of materiel) {
      if (!m.categorie || !m.designation || egal(m.designation, 'Équipement')) continue;
      if (!map.has(m.categorie)) map.set(m.categorie, []);
      map.get(m.categorie).push(m.designation);
    }
    return map;
  }, [materiel]);

  const ajouter = useCallback(async () => { await ajouterMateriel(visiteId); await charger(); }, [charger, visiteId]);

  return (
    <FlatList
      data={materiel}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <EquipmentCard
          item={item}
          visiteId={visiteId}
          onChange={charger}
          categories={categories}
          marques={marques}
          catalogue={catalogue}
          designationOptions={designationParCategorie.get(item.categorie) || []}
        />
      )}
      contentContainerStyle={styles.panelContent}
      ListHeaderComponent={<View><Text style={styles.sectionTitle}>Équipements — feuille MATERIEL · {materiel.length}</Text><Text style={styles.importHint}>Sélectionne d’abord le type puis la marque : les modèles du catalogue sont proposés automatiquement.</Text></View>}
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
