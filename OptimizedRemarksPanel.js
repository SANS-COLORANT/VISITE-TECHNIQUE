/** Synthèse des réserves optimisée pour les longues visites tablette. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { styles } from './styles.js';
import {
  listerBibliothequeReserves,
  listerMateriel,
  listerReseaux,
  listerCompteurs,
} from './db.js';
import {
  listerRemarquesVisite,
  ajouterRemarqueVisite,
  ajouterRemarqueDepuisBibliotheque,
  modifierRemarqueVisite,
  supprimerRemarqueVisite,
  rattacherRemarqueVisite,
} from './remarkDb.js';
import { cleanLabel } from './GenericFields.js';
import { useDurableAutosave } from './durableAutosave.js';
import { PhotoButton } from './PhotoButton.js';

// Garde la dernière version saisie en mémoire entre deux montages de l'onglet.
// SQLite reste la source durable ; ce cache évite qu'un retour instantané sur
// l'onglet réaffiche une valeur ancienne pendant qu'un flush est encore en cours.
const remarksCache = new Map();

function nombreOuNull(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function ReserveCard({ remarque, visiteId, onPatch, onDelete, onRattacher, panelLabels }) {
  const [prestation, setPrestation, blurPrestation] = useDurableAutosave(remarque.prestation, async (v) => {
    await modifierRemarqueVisite(remarque.id, { prestation: v });
  });
  const [poste, setPoste, blurPoste] = useDurableAutosave(remarque.poste, async (v) => {
    await modifierRemarqueVisite(remarque.id, { poste: v });
  });
  const [prix, setPrix, blurPrix] = useDurableAutosave(remarque.estimatif == null ? '' : String(remarque.estimatif), async (v) => {
    await modifierRemarqueVisite(remarque.id, { estimatif: v });
  });
  const [delai, setDelai, blurDelai] = useDurableAutosave(remarque.delai == null ? '' : String(remarque.delai), async (v) => {
    await modifierRemarqueVisite(remarque.id, { delai: v });
  });

  const changerPrestation = useCallback((v) => {
    setPrestation(v);
    onPatch(remarque.id, { prestation: v });
  }, [onPatch, remarque.id, setPrestation]);
  const changerPoste = useCallback((v) => {
    setPoste(v);
    onPatch(remarque.id, { poste: v });
  }, [onPatch, remarque.id, setPoste]);
  const changerPrix = useCallback((v) => {
    setPrix(v);
    onPatch(remarque.id, { estimatif: nombreOuNull(v) });
  }, [onPatch, remarque.id, setPrix]);
  const changerDelai = useCallback((v) => {
    setDelai(v);
    onPatch(remarque.id, { delai: nombreOuNull(v) });
  }, [onPatch, remarque.id, setDelai]);

  return (
    <View style={styles.remarqueCard}>
      <View style={styles.remarqueTop}>
        <Text style={styles.remarquePoste}>Réserve de la visite</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PhotoButton visiteId={visiteId} entiteKey={`remarque||${remarque.id}`} label={prestation || 'Anomalie'} />
          <TouchableOpacity onPress={async () => { await supprimerRemarqueVisite(remarque.id); onDelete(remarque.id); }}>
            <Text style={styles.removeLink}>Supprimer</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.fieldLabel}>Prestation / réserve</Text>
      <TextInput style={[styles.input, { minHeight: 76, textAlignVertical: 'top' }]} multiline value={prestation} onChangeText={changerPrestation} onBlur={() => { blurPrestation().catch(() => {}); }} placeholder="Décrire la réserve..." />
      <View style={{ height: 8 }} />
      <Text style={styles.fieldLabel}>Poste</Text>
      <TextInput style={styles.input} value={poste} onChangeText={changerPoste} onBlur={() => { blurPoste().catch(() => {}); }} placeholder="Ex. Entretien P2, Travaux de conformité..." />
      <View style={{ height: 8 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Prix estimatif HT</Text>
          <TextInput style={styles.input} value={prix} onChangeText={changerPrix} onBlur={() => { blurPrix().catch(() => {}); }} placeholder="€ HT" keyboardType="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Délai</Text>
          <TextInput style={styles.input} value={delai} onChangeText={changerDelai} onBlur={() => { blurDelai().catch(() => {}); }} placeholder="Mois" keyboardType="numeric" />
        </View>
      </View>
      <View style={styles.remarqueMeta}>
        <Text style={styles.remarqueMetaTxt}>Origine : <Text style={styles.bold}>{remarque.origine || 'Manuelle'}</Text></Text>
      </View>
      <Text style={styles.importHint}>Modification locale à cette visite — la bibliothèque reste inchangée.</Text>
      <TouchableOpacity style={styles.remarqueLinkBtn} onPress={() => onRattacher(remarque)}>
        <Text style={styles.remarqueLinkBtnText}>
          {remarque.reference_onglet ? `↗ ${panelLabels[remarque.reference_onglet] || remarque.reference_onglet} · ${remarque.reference_libelle || ''}` : '+ Rattacher à un onglet ou un élément'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function OptimizedRemarksPanel({ visiteId, tabOrder = [], panelLabels = {}, panels = {} }) {
  const [remarques, setRemarques] = useState(() => remarksCache.get(visiteId) || []);
  const [biblioVisible, setBiblioVisible] = useState(false);
  const [biblio, setBiblio] = useState([]);
  const [remarqueARattacher, setRemarqueARattacher] = useState(null);
  const [ongletChoisi, setOngletChoisi] = useState(null);
  const [cibles, setCibles] = useState([]);

  const ongletsRattachables = useMemo(
    () => tabOrder.filter((id) => id !== 'SEP' && id !== 'p-remarques' && id !== 'p-photos'),
    [tabOrder.join('|')]
  );

  const charger = useCallback(async () => {
    const rows = await listerRemarquesVisite(visiteId);
    const cached = remarksCache.get(visiteId) || [];
    const cachedById = new Map(cached.map((r) => [r.id, r]));
    // Les nouvelles réserves provenant d'un contrôle N.S sont ajoutées depuis la DB,
    // tandis que les valeurs saisies localement gagnent en cas d'écriture encore en cours.
    const fusionnees = rows.map((r) => cachedById.has(r.id) ? { ...r, ...cachedById.get(r.id) } : r);
    remarksCache.set(visiteId, fusionnees);
    setRemarques(fusionnees);
    return fusionnees;
  }, [visiteId]);
  useEffect(() => { charger().catch((e) => console.warn('Chargement réserves impossible', e)); }, [charger]);

  const stats = useMemo(() => ({
    total: remarques.length,
    estimatif: remarques.reduce((s, r) => s + (Number(r.estimatif) || 0), 0),
    urgentes: remarques.filter((r) => Number(r.delai) > 0 && Number(r.delai) <= 3).length,
  }), [remarques]);

  const patchLocal = useCallback((id, patch) => {
    setRemarques((actuelles) => {
      const suivantes = actuelles.map((r) => r.id === id ? { ...r, ...patch } : r);
      remarksCache.set(visiteId, suivantes);
      return suivantes;
    });
  }, [visiteId]);
  const deleteLocal = useCallback((id) => {
    setRemarques((actuelles) => {
      const suivantes = actuelles.filter((r) => r.id !== id);
      remarksCache.set(visiteId, suivantes);
      return suivantes;
    });
  }, [visiteId]);

  const ouvrirBiblio = async () => {
    setBiblio(await listerBibliothequeReserves());
    setBiblioVisible(true);
  };
  const choisirDepuisBiblio = async (item) => {
    await ajouterRemarqueDepuisBibliotheque(visiteId, item);
    setBiblioVisible(false);
    // Nouvelle ligne créée côté DB : on repart d'un cache vide pour la récupérer.
    remarksCache.delete(visiteId);
    await charger();
  };
  const ajouterVierge = async () => {
    await ajouterRemarqueVisite(visiteId);
    setBiblioVisible(false);
    remarksCache.delete(visiteId);
    await charger();
  };

  const ouvrirRattachement = (remarque) => {
    setRemarqueARattacher(remarque);
    setOngletChoisi(null);
    setCibles([]);
  };

  const choisirOnglet = async (panelId) => {
    setOngletChoisi(panelId);
    if (panelId === 'p-equip') {
      const items = await listerMateriel(visiteId);
      setCibles(items.map((m) => ({ id: m.equipement_id || m.id, type: 'equipement', libelle: [m.designation, m.marque, m.modele].filter(Boolean).join(' · ') || 'Équipement sans nom' })));
    } else if (panelId === 'p-regulation') {
      const items = await listerReseaux(visiteId);
      setCibles(items.map((r) => ({ id: r.reseau_site_id || r.id, type: 'reseau', libelle: r.nom_reseau || `Réseau ${r.ordre}` })));
    } else if (panelId === 'p-releves') {
      const items = await listerCompteurs(visiteId);
      setCibles(items.map((c) => ({ id: c.compteur_site_id || c.id, type: 'compteur', libelle: c.label || 'Compteur sans nom' })));
    } else {
      const sections = panels[panelId] || {};
      setCibles(Object.entries(sections).flatMap(([section, fields]) => [
        { id: `${panelId}:${section}`, type: 'section', libelle: section },
        ...(fields || []).map((f) => ({ id: `${panelId}:${section}:${f.cle}`, type: f.type || 'champ', libelle: `${section} · ${cleanLabel(f.cle)}` })),
      ]));
    }
  };

  const enregistrerRattachement = async (cible) => {
    if (!remarqueARattacher) return;
    await rattacherRemarqueVisite(remarqueARattacher.id, { onglet: ongletChoisi, type: cible.type, id: cible.id, libelle: cible.libelle });
    patchLocal(remarqueARattacher.id, { reference_onglet: ongletChoisi, reference_type: cible.type, reference_id: cible.id, reference_libelle: cible.libelle });
    setRemarqueARattacher(null); setOngletChoisi(null); setCibles([]);
  };
  const retirerRattachement = async () => {
    if (!remarqueARattacher) return;
    await rattacherRemarqueVisite(remarqueARattacher.id, {});
    patchLocal(remarqueARattacher.id, { reference_onglet: null, reference_type: null, reference_id: null, reference_libelle: null });
    setRemarqueARattacher(null); setOngletChoisi(null); setCibles([]);
  };

  const header = (
    <View>
      <View style={styles.totalsBar}>
        <View style={styles.totalsCard}><Text style={styles.totalsNum}>{stats.total}</Text><Text style={styles.totalsLabel}>Réserves</Text></View>
        <View style={styles.totalsCard}><Text style={styles.totalsNum}>{Math.round(stats.estimatif)} €</Text><Text style={styles.totalsLabel}>Estimatif HT</Text></View>
        <View style={styles.totalsCard}><Text style={styles.totalsNum}>{stats.urgentes}</Text><Text style={styles.totalsLabel}>≤ 3 mois</Text></View>
      </View>
      <Text style={styles.sectionTitle}>Synthèse des réserves — valeurs de cette visite</Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={remarques}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ReserveCard remarque={item} visiteId={visiteId} onPatch={patchLocal} onDelete={deleteLocal} onRattacher={ouvrirRattachement} panelLabels={panelLabels} />}
        ListHeaderComponent={header}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Aucune réserve pour l'instant.</Text><Text style={styles.emptySub}>Passe un point de contrôle en N.S pour en générer une.</Text></View>}
        ListFooterComponent={<TouchableOpacity style={styles.addBtn} onPress={ouvrirBiblio}><Text style={styles.addBtnText}>+ Ajouter une réserve manuelle</Text></TouchableOpacity>}
        contentContainerStyle={styles.panelContent}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={5}
        maxToRenderPerBatch={4}
        windowSize={5}
        updateCellsBatchingPeriod={80}
        removeClippedSubviews
      />

      <Modal visible={biblioVisible} transparent animationType="fade" onRequestClose={() => setBiblioVisible(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Choisir une réserve</Text>
          <Text style={styles.importHint}>La réserve choisie sera copiée dans cette visite et restera modifiable sans toucher à la bibliothèque.</Text>
          <FlatList
            data={biblio}
            keyExtractor={(item) => item.id}
            style={{ maxHeight: 320 }}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={10}
            windowSize={5}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.biblioRow} onPress={() => choisirDepuisBiblio(item)}>
                <Text style={styles.biblioRowTitle}>{item.nom}</Text>
                {item.description ? <Text style={styles.biblioRowSub} numberOfLines={2}>{item.description}</Text> : null}
                <Text style={styles.biblioRowSub}>{item.prix != null ? `${item.prix} €HT` : 'Prix libre'} · {item.delai != null ? `${item.delai} mois` : 'Délai libre'}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptySub}>Aucune réserve dans la bibliothèque.</Text>}
          />
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setBiblioVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={ajouterVierge}><Text style={styles.btnPrimaryText}>Réserve vierge</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      <Modal visible={!!remarqueARattacher} transparent animationType="fade" onRequestClose={() => setRemarqueARattacher(null)}>
        <View style={styles.modalOverlay}><View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>À quoi cette réserve fait-elle référence ?</Text>
          <Text style={styles.importHint}>Choisis d’abord l’onglet, puis l’élément précis concerné.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.remarqueTabsScroll}>
            {ongletsRattachables.map((id) => <TouchableOpacity key={id} style={[styles.remarqueTabChoice, ongletChoisi === id && styles.remarqueTabChoiceActive]} onPress={() => choisirOnglet(id)}><Text style={[styles.remarqueTabChoiceText, ongletChoisi === id && styles.remarqueTabChoiceTextActive]}>{panelLabels[id] || id}</Text></TouchableOpacity>)}
          </ScrollView>
          <FlatList
            data={cibles}
            keyExtractor={(item) => `${item.type}:${item.id}`}
            style={{ maxHeight: 280 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => <TouchableOpacity style={styles.biblioRow} onPress={() => enregistrerRattachement(item)}><Text style={styles.biblioRowTitle}>{item.libelle}</Text></TouchableOpacity>}
            ListEmptyComponent={ongletChoisi ? <Text style={styles.emptySub}>Aucun élément disponible dans cet onglet.</Text> : null}
          />
          <View style={styles.modalActions}>
            {remarqueARattacher?.reference_onglet ? <TouchableOpacity style={styles.btnSecondary} onPress={retirerRattachement}><Text style={styles.btnSecondaryText}>Détacher</Text></TouchableOpacity> : null}
            <TouchableOpacity style={styles.btnPrimary} onPress={() => setRemarqueARattacher(null)}><Text style={styles.btnPrimaryText}>Fermer</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}

export { OptimizedRemarksPanel };
