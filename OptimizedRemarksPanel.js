/** Synthèse des réserves optimisée pour les longues visites tablette. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { styles, FONTS } from './styles.js';
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
  modifierCriticiteRemarque,
  supprimerRemarqueVisite,
  supprimerReservesReprises,
  rattacherRemarqueVisite,
} from './remarkDb.js';
import { cleanLabel, ChipSelector } from './GenericFields.js';
import { useDurableAutosave } from './durableAutosave.js';
import { PhotoButton } from './PhotoButton.js';
import { ReserveSeveritySlider } from './ReserveSeveritySlider.js';
import { BoundedLruMap } from './boundedCache.js';
import { useListScrollMemory } from './useListScrollMemory.js';
import { ButtonGlow } from './ButtonGlow.js';
import { EmptyIcon } from './EmptyState.js';
import { COLORS } from './styles.js';
import { listerAnomaliesPrecedentes } from './terrainVisitDb.js';
import { CvcIcon } from './MetraCvcIcons.js';

// Garde la dernière version saisie en mémoire entre deux montages de l'onglet.
// SQLite reste la source durable ; ce cache évite qu'un retour instantané sur
// l'onglet réaffiche une valeur ancienne pendant qu'un flush est encore en cours.
const remarksCache = new BoundedLruMap(3);

function nombreOuNull(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function libellePhotoRemarque(remarque, prestation) {
  if (String(remarque?.reference_libelle || '').trim()) return String(remarque.reference_libelle).trim();
  if (String(remarque?.controle_key || '').includes('||')) return String(remarque.controle_key).split('||').pop() || 'Anomalie';
  return prestation || 'Anomalie';
}

function ReserveCard({ remarque, visiteId, onPatch, onDelete, onRattacher, panelLabels, intranetLinked = false, reseauChaleur = false }) {
  const [expanded, setExpanded] = useState(false);
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
  const dateReserveInitiale = remarque.intranet_date_reserve || String(remarque.cree_le || '').slice(0, 10);
  const [dateReserve, setDateReserve, blurDateReserve] = useDurableAutosave(dateReserveInitiale, async (v) => {
    await modifierRemarqueVisite(remarque.id, { intranet_date_reserve: v });
  });
  const [echeance, setEcheance, blurEcheance] = useDurableAutosave(remarque.intranet_delai || '', async (v) => {
    await modifierRemarqueVisite(remarque.id, { intranet_delai: v });
  });
  const [etatAvancement, setEtatAvancement] = useState(remarque.intranet_etat_avancement || '');

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
  const changerDateReserve = useCallback((v) => {
    setDateReserve(v);
    onPatch(remarque.id, { intranet_date_reserve: v });
  }, [onPatch, remarque.id, setDateReserve]);
  const changerEcheance = useCallback((v) => {
    setEcheance(v);
    onPatch(remarque.id, { intranet_delai: v });
  }, [onPatch, remarque.id, setEcheance]);
  const changerEtatAvancement = useCallback(async (v) => {
    const next = etatAvancement === v ? '' : v;
    setEtatAvancement(next);
    onPatch(remarque.id, { intranet_etat_avancement: next || null });
    await modifierRemarqueVisite(remarque.id, { intranet_etat_avancement: next || null });
  }, [etatAvancement, onPatch, remarque.id]);
  const changerCriticite = useCallback(async (value) => {
    await modifierCriticiteRemarque(remarque.id, value);
    onPatch(remarque.id, {
      criticite: value,
      criticite_modifiee: Number(value) === Number(remarque.criticite_defaut ?? 2) ? 0 : 1,
    });
  }, [onPatch, remarque.id, remarque.criticite_defaut]);

  return (
    <View style={styles.remarqueCard}>
      <Text style={styles.importHint}>{remarque.reference_type === 'reserve_historique' ? `Reprise d'une visite précédente${remarque.intranet_date_reserve ? ` · ${remarque.intranet_date_reserve}` : ''}` : (panelLabels[remarque.reference_onglet] || 'Anomalie de la visite')}</Text>
      <Text style={styles.cardTitle}>{remarque.reference_libelle || remarque.poste || 'Observation'}</Text>
      <Text style={{fontFamily:FONTS.body,color:COLORS.inkSoft,marginVertical:10}}>{prestation || 'Préconisation à compléter'}</Text>
      <View style={{flexDirection:'row',gap:8,marginBottom:8}}><TouchableOpacity style={styles.btnSecondary} onPress={()=>setExpanded(v=>!v)}><Text style={styles.btnSecondaryText}>{expanded?'Réduire':'Modifier'}</Text></TouchableOpacity><TouchableOpacity style={[styles.btnSecondary,{flex:1,backgroundColor:remarque.intranet_etat_avancement==='Terminé'?COLORS.green:'rgba(46,157,91,0.1)'}]} onPress={async()=>{const value=remarque.intranet_etat_avancement==='Terminé'?null:'Terminé';await modifierRemarqueVisite(remarque.id,{intranet_etat_avancement:value});setEtatAvancement(value||'');onPatch(remarque.id,{intranet_etat_avancement:value})}}><CvcIcon name="check" size={18} color={remarque.intranet_etat_avancement==='Terminé'?'#fff':COLORS.green}/><Text style={[styles.btnSecondaryText,{color:remarque.intranet_etat_avancement==='Terminé'?'#fff':COLORS.green}]}>{remarque.intranet_etat_avancement==='Terminé'?'Levée · réouvrir':'Levée sur place'}</Text></TouchableOpacity></View>
      {expanded ? <>
      <View style={styles.remarqueTop}>
        <Text style={styles.remarquePoste}>Réserve de la visite</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PhotoButton visiteId={visiteId} entiteKey={`remarque||${remarque.id}`} label={libellePhotoRemarque(remarque, prestation)} />
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

      {reseauChaleur ? <View style={{ marginTop: 10 }}>
        <Text style={styles.fieldLabel}>Périmètre{remarque.controle_key ? ' · automatique' : ' · obligatoire'}</Text>
        {remarque.controle_key ? <View style={[styles.persistentEquipmentBadge, { alignSelf: 'flex-start', marginTop: 5 }]}>
          <Text style={styles.persistentEquipmentBadgeText}>{remarque.perimetre || 'À classer'}</Text>
        </View> : <View style={{ marginTop: 6 }}>
          <ChipSelector
            valeur={remarque.perimetre || ''}
            options={['Primaire', 'Secondaire']}
            onChange={async (v) => {
              await modifierRemarqueVisite(remarque.id, { perimetre: v });
              onPatch(remarque.id, { perimetre: v });
            }}
          />
        </View>}
      </View> : null}

      <ReserveSeveritySlider
        value={remarque.criticite ?? remarque.criticite_defaut ?? 2}
        defaultValue={remarque.criticite_defaut ?? 2}
        onChange={(v) => changerCriticite(v).catch(console.warn)}
      />

      <View style={{ height: 8 }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Prix estimatif HT</Text>
          <TextInput style={styles.input} value={prix} onChangeText={changerPrix} onBlur={() => { blurPrix().catch(() => {}); }} placeholder="€ HT" keyboardType="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Délai interne</Text>
          <TextInput style={styles.input} value={delai} onChangeText={changerDelai} onBlur={() => { blurDelai().catch(() => {}); }} placeholder="Mois" keyboardType="numeric" />
        </View>
      </View>
      {intranetLinked ? <>
      <View style={{ marginTop: 10, padding: 10, borderWidth: 1, borderColor: '#E6E8EC', borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.66)' }}>
        <Text style={[styles.fieldLabel, { marginBottom: 3 }]}>Suivi Intranet de la réserve</Text>
        <Text style={[styles.importHint, { marginBottom: 8 }]}>Le délai interne en mois reste inchangé. L’API Intranet attend séparément une date d’échéance.</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Date réserve</Text><TextInput style={styles.input} value={dateReserve} onChangeText={changerDateReserve} onBlur={() => { blurDateReserve().catch(() => {}); }} placeholder="AAAA-MM-JJ" autoCapitalize="none" /></View>
          <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Échéance</Text><TextInput style={styles.input} value={echeance} onChangeText={changerEcheance} onBlur={() => { blurEcheance().catch(() => {}); }} placeholder="AAAA-MM-JJ ou vide" autoCapitalize="none" /></View>
        </View>
        <Text style={[styles.fieldLabel, { marginTop: 9 }]}>État d’avancement</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 5 }}>
          {['Non réalisé', 'Devis émis', 'En cours', 'Terminé', 'Annulé'].map((etat) => <TouchableOpacity key={etat} onPress={() => changerEtatAvancement(etat).catch(() => {})} style={{ minHeight: 38, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: etatAvancement === etat ? '#E86F2D' : '#D0D5DD', borderRadius: 19, backgroundColor: etatAvancement === etat ? '#FFF3E8' : '#FFF' }}><Text style={{ fontSize: 11, fontFamily: FONTS.bold, color: etatAvancement === etat ? '#9A4C0A' : '#475467' }}>{etat}</Text></TouchableOpacity>)}
        </ScrollView>
      </View>
      </> : null}
      <View style={styles.remarqueMeta}>
        <Text style={styles.remarqueMetaTxt}>Origine : <Text style={styles.bold}>{remarque.origine || 'Manuelle'}</Text></Text>
      </View>
      <Text style={styles.importHint}>Modification locale à cette visite — la bibliothèque reste inchangée.</Text>
      <TouchableOpacity style={styles.remarqueLinkBtn} onPress={() => onRattacher(remarque)}>
        <Text style={styles.remarqueLinkBtnText}>
          {remarque.reference_onglet ? `↗ ${panelLabels[remarque.reference_onglet] || remarque.reference_onglet} · ${remarque.reference_libelle || ''}` : '+ Rattacher à un onglet ou un élément'}
        </Text>
      </TouchableOpacity>
      </> : null}
    </View>
  );
}

function OptimizedRemarksPanel({ visiteId, tabOrder = [], panelLabels = {}, panels = {}, intranetLinked = false, trameId = 'icpe_v1' }) {
  const reseauChaleur = trameId === 'reseau_chaleur_v1';
  const [remarques, setRemarques] = useState(() => remarksCache.get(visiteId) || []);
  const [filtre, setFiltre] = useState('actuelles');
  const [precedentes, setPrecedentes] = useState([]);
  useEffect(()=>{let alive=true;listerAnomaliesPrecedentes(visiteId).then(rows=>{if(alive)setPrecedentes(rows)}).catch(console.warn);return()=>{alive=false}},[visiteId]);
  const actuelles=remarques.filter(r=>r.intranet_etat_avancement!=='Terminé'), levees=remarques.filter(r=>r.intranet_etat_avancement==='Terminé');
  const visibles=filtre==='precedentes'?precedentes:filtre==='levees'?levees:actuelles;
  const { listRef, onScroll } = useListScrollMemory(`visit-panel:${visiteId}:p-remarques`, remarques.length);
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

  const reprises = useMemo(() => remarques.filter((r) => r.reference_type === 'reserve_historique' && r.intranet_etat_avancement !== 'Terminé'), [remarques]);
  const retirerReprises = useCallback(() => {
    const n = reprises.length;
    if (!n) return;
    Alert.alert(
      'Supprimer les anciennes réserves ?',
      `${n} réserve${n > 1 ? 's' : ''} reprise${n > 1 ? 's' : ''} des visites précédentes ${n > 1 ? 'seront retirées' : 'sera retirée'} de cette visite et ne ${n > 1 ? 'seront' : 'sera'} plus reprise${n > 1 ? 's' : ''} aux prochaines visites. Les réserves créées ou levées pendant cette visite sont conservées.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: async () => {
          try {
            await supprimerReservesReprises(visiteId);
          } catch (e) {
            Alert.alert('Suppression incomplète', String(e?.message || e));
          }
          remarksCache.delete(visiteId);
          await charger().catch(console.warn);
        } },
      ]
    );
  }, [reprises.length, visiteId, charger]);

  const ouvrirBiblio = async () => {
    setBiblio(await listerBibliothequeReserves());
    setBiblioVisible(true);
  };
  const choisirDepuisBiblio = async (item) => {
    await ajouterRemarqueDepuisBibliotheque(visiteId, item);
    setBiblioVisible(false);
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
      setCibles(items.map((m) => ({ id: m.equipement_id || m.id, type: 'equipement', libelle: [m.designation, m.marque, m.modele].filter(Boolean).join(' · ') || 'Équipement sans nom', perimetre: m.perimetre || null })));
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
        ...(fields || []).filter((f) => f?.hiddenInApp !== true).map((f) => ({ id: `${panelId}:${section}:${f.cle}`, type: f.type || 'champ', libelle: `${section} · ${cleanLabel(f.cle)}` })),
      ]));
    }
  };

  const enregistrerRattachement = async (cible) => {
    if (!remarqueARattacher) return;
    const perimetreHerite = remarqueARattacher.controle_key ? null : (cible.perimetre || null);
    await rattacherRemarqueVisite(remarqueARattacher.id, { onglet: ongletChoisi, type: cible.type, id: cible.id, libelle: cible.libelle, perimetre: perimetreHerite });
    patchLocal(remarqueARattacher.id, { reference_onglet: ongletChoisi, reference_type: cible.type, reference_id: cible.id, reference_libelle: cible.libelle, ...(perimetreHerite ? { perimetre: perimetreHerite } : {}) });
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
        <View style={{flexDirection:'row',gap:4,marginBottom:12}}>{[['actuelles','À traiter',actuelles.length],['levees','Levées',levees.length],['precedentes','Précédentes',precedentes.length]].map(([key,label,count])=><TouchableOpacity key={key} style={[filtre===key?styles.btnPrimary:styles.btnSecondary,{paddingHorizontal:8}]} onPress={()=>setFiltre(key)}>{filtre===key?<ButtonGlow/>:null}<Text style={filtre===key?styles.btnPrimaryText:styles.btnSecondaryText}>{label} {count}</Text></TouchableOpacity>)}</View>
        {filtre==='actuelles'&&reprises.length?<TouchableOpacity accessibilityRole="button" onPress={retirerReprises} style={[styles.btnSecondary,{marginBottom:12,borderColor:COLORS.red}]}><Text style={[styles.btnSecondaryText,{color:COLORS.red}]}>Supprimer les {reprises.length} réserve{reprises.length>1?'s':''} des visites précédentes</Text></TouchableOpacity>:null}
        {filtre==='precedentes'?<Text style={styles.importHint}>Historique du même local et de la même trame. Ces réserves ne sont pas des constats de cette visite.</Text>:null}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={visibles}
        onScroll={onScroll}
        scrollEventThrottle={100}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => filtre==='precedentes'?<View style={styles.remarqueCard}><Text style={styles.importHint}>Visite {item.date_source}</Text><Text style={styles.cardTitle}>{item.reference_libelle||item.poste}</Text><Text style={{fontFamily:FONTS.body,color:COLORS.inkSoft,marginTop:8}}>{item.prestation}</Text></View>:<ReserveCard remarque={item} visiteId={visiteId} onPatch={patchLocal} onDelete={deleteLocal} onRattacher={ouvrirRattachement} panelLabels={panelLabels} intranetLinked={intranetLinked} reseauChaleur={reseauChaleur} />}
        ListHeaderComponent={header}
        ListEmptyComponent={<View style={styles.empty}><EmptyIcon name="remark" /><Text style={styles.emptyText}>Aucune réserve pour l'instant.</Text><Text style={styles.emptySub}>Passe un point de contrôle en N.S pour en générer une.</Text></View>}
        ListFooterComponent={<TouchableOpacity style={styles.addBtn} onPress={ouvrirBiblio}><Text style={styles.addBtnText}>+ Ajouter une réserve manuelle</Text></TouchableOpacity>}
        contentContainerStyle={styles.panelContent}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={5}
        maxToRenderPerBatch={4}
        windowSize={5}
        updateCellsBatchingPeriod={80}
        removeClippedSubviews={false}
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
            <TouchableOpacity style={styles.btnPrimary} onPress={ajouterVierge}><ButtonGlow /><Text style={styles.btnPrimaryText}>Réserve vierge</Text></TouchableOpacity>
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
            <TouchableOpacity style={styles.btnPrimary} onPress={() => setRemarqueARattacher(null)}><ButtonGlow /><Text style={styles.btnPrimaryText}>Fermer</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}

export { OptimizedRemarksPanel };
