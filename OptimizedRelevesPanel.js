/** Panneau Relevés optimisé pour Android natif. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { TRAME_DATA } from './data.js';
import {
  ajouterCompteur,
  getChampsVisite,
  getControlesVisite,
  listerCompteurs,
  supprimerCompteur,
  upsertCompteurChamp,
} from './db.js';
import { cleanLabel, useSaisieAvecAutoSave } from './GenericFields.js';
import { DurableChampGenerique } from './DurableChampGenerique.js';
import { PhotoButton } from './PhotoButton.js';
import { useListScrollMemory } from './useListScrollMemory.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { FONTS } from './styles.js';
import { pictoReleve, pictoTemperature } from './relevePictos.js';
import { PersistentControleGenerique } from './PersistentControleGenerique.js';
import { controlerIndex, destinationDepuisLibelle, destinationsDisponibles, libelleDestination } from './meterDestinations.js';

const COMPTEUR_TYPES = [
  'Compteur gaz', 'Compteur énergie chauffage', 'Compteur énergie ECS', 'Compteur eau appoint chauffage',
  'Compteur eau froide ECS', 'Compteur eau froide générale', 'Compteur électrique', 'Compteur fioul',
  'Compteur calories', 'Compteur volumétrique', 'Manomètre chauffage', 'Manomètre ECS',
];
const UNITES = ['m³', 'L', 'MWh', 'kWh', 'bar', '%'];

function mapperChamps(rows = []) {
  const map = {};
  rows.forEach((row) => {
    if (row?.section_code && row?.cle) map[`${row.section_code}||${row.cle}`] = row.valeur;
  });
  return map;
}

/** Choix de la ligne du rapport (Excel + Intranet), indépendante du nom. */
function DestinationSheet({ visible, valeur, options, onClose, onPick }) {
  const [saving, setSaving] = useState(false);
  const choisir = async (cle) => {
    if (saving) return;
    setSaving(true);
    try { if (await onPick(cle) !== false) onClose(); }
    finally { setSaving(false); }
  };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalOverlay}><View style={styles.modalSheet}>
      <Text style={styles.modalTitle}>Ligne du rapport</Text>
      <Text style={styles.importHint}>Où ce compteur apparaît dans l’Excel et l’envoi Intranet. Son nom reste libre.</Text>
      <ScrollView style={{ maxHeight: 360, marginTop: 10 }}>
        {options.map((o) => (
          <TouchableOpacity key={o.cle} disabled={saving} accessibilityRole="button" style={[styles.biblioRow, { minHeight: 52, flexDirection: 'row', alignItems: 'center' }, valeur === o.cle && { borderColor: COLORS.primary, borderWidth: 1 }]} onPress={() => choisir(o.cle)}>
            <Text style={[styles.biblioRowTitle, { flex: 1 }]}>{o.label}</Text>
            {valeur === o.cle ? <CvcIcon name="check" size={20} color={COLORS.primary} strokeWidth={2.4} /> : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={styles.modalActions}>
        <TouchableOpacity style={styles.btnSecondary} onPress={onClose}><Text style={styles.btnSecondaryText}>Fermer</Text></TouchableOpacity>
      </View>
    </View></View>
  </Modal>;
}

const CompteurCard = React.memo(function CompteurCard({ compteur, visiteId, onRemove, champsSection, doublonDestination, onDestinationChange }) {
  const [label, setLabel, surBlurLabel] = useSaisieAvecAutoSave(
    compteur.label,
    (v) => upsertCompteurChamp(compteur.id, 'label', v)
  );
  const [unite, setUnite] = useState(compteur.unite || 'm³');
  const [editNom, setEditNom] = useState(false);
  const [destination, setDestination] = useState(compteur.destination || null);
  const [choixDestination, setChoixDestination] = useState(false);
  const picto = pictoReleve(label);
  const [valeur, setValeur, surBlurValeur] = useSaisieAvecAutoSave(
    compteur.valeur,
    (v) => upsertCompteurChamp(compteur.id, 'valeur', v)
  );
  const options = useMemo(() => destinationsDisponibles(champsSection), [champsSection]);
  // Destination effective affichée : enregistrée, sinon celle que l'export
  // déduit aujourd'hui du nom (compteur historique).
  const destinationAffichee = destination || destinationDepuisLibelle(label, unite, champsSection);
  const controle = controlerIndex(valeur, /^Index/i.test(destinationAffichee) ? compteur.valeur_precedente : null);

  useEffect(() => { setUnite(compteur.unite || 'm³'); }, [compteur.unite]);
  useEffect(() => { setDestination(compteur.destination || null); }, [compteur.destination]);

  const enregistrerDestination = useCallback(async (cle) => {
    try {
      await upsertCompteurChamp(compteur.id, 'destination', cle);
      setDestination(cle);
      onDestinationChange?.(compteur.id, cle);
      return true;
    } catch (e) {
      console.warn('Destination compteur non sauvegardée', e);
      Alert.alert('Sauvegarde impossible', 'La ligne du rapport n’a pas été enregistrée. Réessaie avant de renommer ce compteur.');
      return false;
    }
  }, [compteur.id, onDestinationChange]);

  // Avant le premier renommage d'un compteur historique, sa ligne actuelle est
  // figée : le nouveau nom ne peut plus le faire disparaître du rapport.
  const commencerRenommage = useCallback(async () => {
    if (!destination && !await enregistrerDestination(destinationDepuisLibelle(label, unite, champsSection))) return;
    setEditNom(true);
  }, [destination, enregistrerDestination, label, unite, champsSection]);

  const retirer = () => {
    Alert.alert('Retirer ce compteur ?', `« ${label || 'Compteur'} » ne sera plus proposé aux prochaines visites de ce local.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: async () => {
        try { await supprimerCompteur(compteur.id); onRemove(compteur.id); }
        catch (e) { console.warn('Suppression compteur impossible', e); Alert.alert('Suppression impossible', 'Le compteur a été conservé. Réessaie.'); }
      } },
    ]);
  };

  return (
    <View style={styles.compteurRow}>
      <View style={styles.compteurRowTop}>
        {/* Pictogramme + nom court ; le nom complet (rapports) reste modifiable d'un appui. */}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: `${picto.teinte}18` }}><CvcIcon name={picto.icon} size={23} color={picto.teinte} strokeWidth={2.1} /></View>
          {editNom || !label ? <TextInput style={[styles.input, { flex: 1 }]} value={label} onChangeText={setLabel} onBlur={() => { surBlurLabel(); setEditNom(false); }} autoFocus={editNom} placeholder="Nom du compteur" />
            : <TouchableOpacity accessibilityLabel={`${label}, toucher pour renommer`} onPress={commencerRenommage} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 15, fontFamily: FONTS.bold, color: COLORS.ink }}>{picto.court || label}</Text>
                {picto.court ? <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 11, color: COLORS.inkFaint }}>{label}</Text> : null}
              </View>
              <CvcIcon name="edit" size={16} color={COLORS.inkFaint} strokeWidth={2} />
            </TouchableOpacity>}
        </View>
        <PhotoButton visiteId={visiteId} entiteKey={compteur.compteur_site_id ? `compteur_site||${compteur.compteur_site_id}` : `compteur||${compteur.id}`} label={label || 'Compteur'} />
        <TouchableOpacity accessibilityLabel="Retirer ce compteur" onPress={retirer} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(185,28,28,0.08)' }}>
          <CvcIcon name="trash" size={18} color={COLORS.red} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Ligne du rapport : ${libelleDestination(destinationAffichee)}, modifier`} onPress={() => setChoixDestination(true)} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 10, borderRadius: 12, backgroundColor: COLORS.bg, marginBottom: 8 }}>
        <Text style={{ fontSize: 12, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft }}>Ligne du rapport · <Text style={{ color: COLORS.ink, fontFamily: FONTS.bold }}>{libelleDestination(destinationAffichee)}</Text></Text>
        <CvcIcon name="chevron-down" size={14} color={COLORS.inkSoft} strokeWidth={2.2} />
      </TouchableOpacity>
      {doublonDestination ? <Text style={{ fontSize: 12, color: COLORS.amber, fontFamily: FONTS.bodyMedium, marginBottom: 6 }}>Un autre compteur occupe déjà cette ligne : l’envoi Intranet sera bloqué tant qu’ils ne sont pas séparés.</Text> : null}
      {compteur.compteur_site_id && (
        <View style={styles.persistentEquipmentBadge}>
          <Text style={styles.persistentEquipmentBadgeText}>Compteur permanent · {compteur.nb_releves || 0} relevé{compteur.nb_releves > 1 ? 's' : ''}</Text>
        </View>
      )}
      <View style={styles.compteurRowBody}>
        <TextInput style={styles.compteurValInput} value={valeur} onChangeText={setValeur} onBlur={surBlurValeur} placeholder={compteur.valeur_precedente ? `Précédent : ${compteur.valeur_precedente}` : 'Index relevé'} keyboardType="decimal-pad" accessibilityLabel="Index relevé, saisie manuelle" />
        {controle ? <Text style={{ fontSize: 12, fontFamily: FONTS.bodyMedium, color: controle.niveau === 'erreur' ? COLORS.red : COLORS.amber }}>{controle.message}</Text>
          : compteur.valeur_precedente ? <Text style={{ fontSize: 11, color: COLORS.inkFaint }}>Relevé précédent : {compteur.valeur_precedente}{unite ? ` ${unite}` : ''}</Text> : null}
        <View style={styles.uniteRow}>
          {UNITES.map((u) => (
            <TouchableOpacity key={u} style={[styles.uniteChip, unite === u && styles.uniteChipSelected]} onPress={() => {
              setUnite(u);
              upsertCompteurChamp(compteur.id, 'unite', u).catch((e) => console.warn('Unité compteur non sauvegardée', e));
            }}>
              <Text style={[styles.uniteChipText, unite === u && styles.uniteChipTextSelected]}>{u}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <DestinationSheet visible={choixDestination} valeur={destinationAffichee} options={options} onClose={() => setChoixDestination(false)} onPick={enregistrerDestination} />
    </View>
  );
});

export function OptimizedRelevesPanel({ visiteId, onSaved, trameId = 'icpe_v1', panels = null }) {
  const [champsMap, setChampsMap] = useState({});
  const [controlesMap, setControlesMap] = useState({});
  const [compteurs, setCompteurs] = useState([]);
  const [ajoutCompteurVisible, setAjoutCompteurVisible] = useState(false);
  const [nomCompteurChoisi, setNomCompteurChoisi] = useState('');
  const [nomCompteurLibre, setNomCompteurLibre] = useState('');
  const [modeNomLibre, setModeNomLibre] = useState(false);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const autoSeedFaitRef = useRef(false);

  const sections = panels?.['p-releves'] || TRAME_DATA['p-releves'];
  const reseauChaleur = trameId === 'reseau_chaleur_v1';
  const champsTemp = useMemo(() => sections['Températures et pH'] || [], [sections]);
  const champsCompteursIndex = useMemo(() => (sections['Relevés des compteurs et manomètres'] || []).filter((f) => /^Index/i.test(f.cle)), [sections]);
  const champsPression = useMemo(() => (sections['Relevés des compteurs et manomètres'] || []).filter((f) => !/^Index/i.test(f.cle)), [sections]);
  const champsSectionCompteurs = useMemo(() => sections['Relevés des compteurs et manomètres'] || [], [sections]);
  const [destinationChoisie, setDestinationChoisie] = useState(null);

  const chargerInitial = useCallback(async () => {
    const [champs, controles, compteursDb] = await Promise.all([getChampsVisite(visiteId), getControlesVisite(visiteId), listerCompteurs(visiteId)]);
    setChampsMap(mapperChamps(champs));
    setControlesMap(Object.fromEntries((controles || []).map((row) => [`${row.section_code}||${row.cle}`, row])));
    setCompteurs(compteursDb);

    if (!autoSeedFaitRef.current && compteursDb.length === 0 && champsCompteursIndex.length > 0) {
      autoSeedFaitRef.current = true;
      const crees = [];
      for (const f of champsCompteursIndex) {
        const label = cleanLabel(f.cle);
        const id = await ajouterCompteur(visiteId, label, f.cle);
        crees.push({ id, visite_id: visiteId, label, unite: null, valeur: null, destination: f.cle });
      }
      if (crees.length) setCompteurs(await listerCompteurs(visiteId));
    }
  }, [visiteId, champsCompteursIndex]);

  useEffect(() => {
    let actif = true;
    chargerInitial().catch((e) => { if (actif) console.warn('Chargement relevés impossible', e); });
    return () => { actif = false; };
  }, [chargerInitial]);

  const ouvrirAjoutCompteur = () => {
    setNomCompteurChoisi(''); setNomCompteurLibre(''); setModeNomLibre(false); setDestinationChoisie(null); setAjoutCompteurVisible(true);
  };

  const creerCompteurChoisi = async () => {
    const label = modeNomLibre ? nomCompteurLibre.trim() : nomCompteurChoisi.trim();
    if (!label || creationEnCours) return;
    setCreationEnCours(true);
    try {
      await ajouterCompteur(visiteId, label, destinationChoisie || destinationDepuisLibelle(label, '', champsSectionCompteurs));
      setCompteurs(await listerCompteurs(visiteId));
      setAjoutCompteurVisible(false); setNomCompteurChoisi(''); setNomCompteurLibre(''); setModeNomLibre(false);
    } catch (e) { console.warn('Création compteur impossible', e); }
    finally { setCreationEnCours(false); }
  };

  const retirerLocalement = useCallback((id) => setCompteurs((courants) => courants.filter((c) => c.id !== id)), []);
  const changerDestinationLocalement = useCallback((id, destination) => setCompteurs((courants) => courants.map((c) => c.id === id ? { ...c, destination } : c)), []);
  // Deux compteurs sur la même ligne : l'Excel les concatène, l'Intranet refuse
  // l'envoi (règle de sécurité existante). On le signale dès la saisie.
  const destinationsEnDoublon = useMemo(() => {
    const compte = new Map();
    compteurs.forEach((c) => {
      const d = c.destination || destinationDepuisLibelle(c.label, c.unite, champsSectionCompteurs);
      if (d && d !== 'supplementaire') compte.set(d, (compte.get(d) || 0) + 1);
    });
    return new Set([...compte.entries()].filter(([, n]) => n > 1).map(([d]) => d));
  }, [compteurs, champsSectionCompteurs]);

  const rows = useMemo(() => {
    const result = [];
    champsPression.forEach((f) => { const p = pictoReleve(f.cle); result.push({ type: 'champ', id: `pression-${f.cle}`, section: 'releves.compteurs', field: f, picto: p.court ? { icon: p.icon, teinte: p.teinte, texte: p.court } : null }); });
    result.push({ type: 'titre', id: 'titre-compteurs', label: 'Compteurs relevés' });
    compteurs.forEach((c) => result.push({ type: 'compteur', id: `compteur-${c.id}`, compteur: c }));
    result.push({ type: 'ajout', id: 'ajout-compteur' });
    result.push({ type: 'titre', id: 'titre-temperatures', label: 'Températures et pH' });
    // Températures groupées par circuit, chaque ligne repérée par son sens
    // (départ, retour, stockage) : pictogrammes plutôt que libellés longs.
    let circuitCourant = null;
    champsTemp.forEach((f) => {
      const t = pictoTemperature(f.cle);
      if (t.circuit && t.circuit !== circuitCourant && t.sens !== 'pH') {
        circuitCourant = t.circuit;
        result.push({ type: 'circuit', id: `circuit-${t.circuit}`, label: t.circuit, icon: t.circuitIcon });
      }
      const texte = t.sens === 'pH' ? 'pH' : t.sens ? `${t.sens}${t.circuit ? ' · ' + t.circuit : ''}` : null;
      result.push({ type: 'champ', id: `temp-${f.cle}`, section: 'releves.temperatures', field: f, picto: texte ? { icon: t.sensIcon, teinte: t.teinte, texte } : null });
    });
    return result;
  }, [champsPression, champsTemp, compteurs]);

  const { listRef, onScroll } = useListScrollMemory(`visit-panel:${visiteId}:p-releves`, rows.length);

  return <>
    <FlatList
      ref={listRef}
      data={rows}
      onScroll={onScroll}
      scrollEventThrottle={100}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.panelContent}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      windowSize={5}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews={false}
      ListHeaderComponent={<Text style={styles.sectionTitle}>Pressions</Text>}
      renderItem={({ item }) => {
        if (item.type === 'titre') return <Text style={styles.sectionTitle}>{item.label}</Text>;
        if (item.type === 'circuit') return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6, marginBottom: 6 }}><CvcIcon name={item.icon} size={17} color={COLORS.orangeDark} strokeWidth={2.1} /><Text style={{ fontSize: 12, fontFamily: FONTS.bold, color: COLORS.inkSoft, letterSpacing: 0.6, textTransform: 'uppercase' }}>{item.label}</Text></View>;
        if (item.type === 'compteur') return <CompteurCard compteur={item.compteur} visiteId={visiteId} onRemove={retirerLocalement} champsSection={champsSectionCompteurs} onDestinationChange={changerDestinationLocalement}
          doublonDestination={destinationsEnDoublon.has(item.compteur.destination || destinationDepuisLibelle(item.compteur.label, item.compteur.unite, champsSectionCompteurs))} />;
        if (item.type === 'ajout') return <TouchableOpacity style={styles.addBtn} onPress={ouvrirAjoutCompteur}><Text style={styles.addBtnText}>+ Ajouter un compteur</Text></TouchableOpacity>;
        const key = `${item.section}||${item.field.cle}`;
        if (reseauChaleur && item.field.type === 'controle') {
          return <View style={styles.formCard}><PersistentControleGenerique
            visiteId={visiteId}
            sectionCode={item.section}
            field={item.field}
            etatInitial={controlesMap[key]}
            trameId={trameId}
            onEtatChange={(patch) => setControlesMap((old) => ({ ...old, [key]: { ...(old[key] || {}), ...patch } }))}
            onSaved={onSaved}
          /></View>;
        }
        return <View style={styles.formCard}><DurableChampGenerique visiteId={visiteId} sectionCode={item.section} field={item.field} picto={item.picto} valeurInitiale={champsMap[key]} onSaved={(v) => {
          setChampsMap((old) => ({ ...old, [key]: v }));
          onSaved?.();
        }} /></View>;
      }}
    />

    <Modal visible={ajoutCompteurVisible} transparent animationType="fade" onRequestClose={() => setAjoutCompteurVisible(false)}>
      <View style={styles.modalOverlay}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Ajouter un compteur</Text>
        <Text style={styles.importHint}>Choisis le type de compteur. Son nom pourra être modifié ensuite directement dans la visite.</Text>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 320, marginTop: 10 }}>
          {COMPTEUR_TYPES.map((nom) => (
            <TouchableOpacity key={nom} style={[styles.biblioRow, nomCompteurChoisi === nom && { borderColor: COLORS.primary, borderWidth: 1 }]} onPress={() => { setNomCompteurChoisi(nom); setModeNomLibre(false); setNomCompteurLibre(''); }}>
              <Text style={styles.biblioRowTitle}>{nom}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.biblioRow, modeNomLibre && { borderColor: COLORS.primary, borderWidth: 1 }]} onPress={() => { setModeNomLibre(true); setNomCompteurChoisi(''); }}>
            <Text style={styles.biblioRowTitle}>+ Autre / nom personnalisé</Text>
          </TouchableOpacity>
          {modeNomLibre && <TextInput style={[styles.input, { marginTop: 10 }]} value={nomCompteurLibre} onChangeText={setNomCompteurLibre} placeholder="Ex. Compteur primaire RCU bâtiment A" autoFocus />}
          {(nomCompteurChoisi || nomCompteurLibre.trim()) ? <View style={{ marginTop: 14 }}>
            <Text style={styles.fieldLabel}>Ligne du rapport</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {destinationsDisponibles(champsSectionCompteurs).map((o) => {
                const actif = (destinationChoisie || destinationDepuisLibelle(modeNomLibre ? nomCompteurLibre : nomCompteurChoisi, '', champsSectionCompteurs)) === o.cle;
                return <TouchableOpacity key={o.cle} accessibilityRole="button" onPress={() => setDestinationChoisie(o.cle)} style={[styles.uniteChip, { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 }, actif && styles.uniteChipSelected]}>
                  <Text style={[styles.uniteChipText, actif && styles.uniteChipTextSelected]}>{o.label}</Text>
                </TouchableOpacity>;
              })}
            </View>
          </View> : null}
        </ScrollView>
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setAjoutCompteurVisible(false)} disabled={creationEnCours}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrimary, ((!nomCompteurChoisi && !nomCompteurLibre.trim()) || creationEnCours) ? { opacity: 0.45 } : null]} disabled={(!nomCompteurChoisi && !nomCompteurLibre.trim()) || creationEnCours} onPress={creerCompteurChoisi}>
            <Text style={styles.btnPrimaryText}>{creationEnCours ? 'Ajout…' : 'Ajouter'}</Text>
          </TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </>;
}
