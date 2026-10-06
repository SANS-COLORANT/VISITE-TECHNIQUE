/** Panneau Relevés optimisé pour Android natif. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
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

const CompteurCard = React.memo(function CompteurCard({ compteur, visiteId, onRemove }) {
  const [label, setLabel, surBlurLabel] = useSaisieAvecAutoSave(
    compteur.label,
    (v) => upsertCompteurChamp(compteur.id, 'label', v)
  );
  const [unite, setUnite] = useState(compteur.unite || 'm³');
  const [editNom, setEditNom] = useState(false);
  const picto = pictoReleve(label);
  const [valeur, setValeur, surBlurValeur] = useSaisieAvecAutoSave(
    compteur.valeur,
    (v) => upsertCompteurChamp(compteur.id, 'valeur', v)
  );

  useEffect(() => { setUnite(compteur.unite || 'm³'); }, [compteur.unite]);

  const retirer = async () => {
    onRemove(compteur.id);
    try { await supprimerCompteur(compteur.id); }
    catch (e) { console.warn('Suppression compteur impossible', e); }
  };

  return (
    <View style={styles.compteurRow}>
      <View style={styles.compteurRowTop}>
        {/* Pictogramme + nom court ; le nom complet (rapports) reste modifiable d'un appui. */}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: `${picto.teinte}18` }}><CvcIcon name={picto.icon} size={23} color={picto.teinte} strokeWidth={2.1} /></View>
          {editNom || !label ? <TextInput style={[styles.input, { flex: 1 }]} value={label} onChangeText={setLabel} onBlur={() => { surBlurLabel(); setEditNom(false); }} autoFocus={editNom} placeholder="Nom du compteur" />
            : <TouchableOpacity accessibilityLabel={`${label}, toucher pour renommer`} onPress={() => setEditNom(true)} style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 15, fontFamily: FONTS.bold, color: COLORS.ink }}>{picto.court || label}</Text>
              {picto.court ? <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 11, color: COLORS.inkFaint }}>{label}</Text> : null}
            </TouchableOpacity>}
        </View>
        <PhotoButton visiteId={visiteId} entiteKey={compteur.compteur_site_id ? `compteur_site||${compteur.compteur_site_id}` : `compteur||${compteur.id}`} label={label || 'Compteur'} />
        <TouchableOpacity accessibilityLabel="Retirer ce compteur" onPress={retirer} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(185,28,28,0.08)' }}><CvcIcon name="trash" size={17} color={COLORS.red} /></TouchableOpacity>
      </View>
      {compteur.compteur_site_id && (
        <View style={styles.persistentEquipmentBadge}>
          <Text style={styles.persistentEquipmentBadgeText}>↻ Compteur permanent · {compteur.nb_releves || 0} relevé{compteur.nb_releves > 1 ? 's' : ''}</Text>
        </View>
      )}
      <View style={styles.compteurRowBody}>
        <TextInput style={styles.compteurValInput} value={valeur} onChangeText={setValeur} onBlur={surBlurValeur} placeholder="Valeur relevée" keyboardType="numeric" />
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
        const id = await ajouterCompteur(visiteId, label);
        crees.push({ id, visite_id: visiteId, label, unite: null, valeur: null });
      }
      if (crees.length) setCompteurs(crees);
    }
  }, [visiteId, champsCompteursIndex]);

  useEffect(() => {
    let actif = true;
    chargerInitial().catch((e) => { if (actif) console.warn('Chargement relevés impossible', e); });
    return () => { actif = false; };
  }, [chargerInitial]);

  const ouvrirAjoutCompteur = () => {
    setNomCompteurChoisi(''); setNomCompteurLibre(''); setModeNomLibre(false); setAjoutCompteurVisible(true);
  };

  const creerCompteurChoisi = async () => {
    const label = modeNomLibre ? nomCompteurLibre.trim() : nomCompteurChoisi.trim();
    if (!label || creationEnCours) return;
    setCreationEnCours(true);
    try {
      await ajouterCompteur(visiteId, label);
      setCompteurs(await listerCompteurs(visiteId));
      setAjoutCompteurVisible(false); setNomCompteurChoisi(''); setNomCompteurLibre(''); setModeNomLibre(false);
    } catch (e) { console.warn('Création compteur impossible', e); }
    finally { setCreationEnCours(false); }
  };

  const retirerLocalement = useCallback((id) => setCompteurs((courants) => courants.filter((c) => c.id !== id)), []);

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
        if (item.type === 'compteur') return <CompteurCard compteur={item.compteur} visiteId={visiteId} onRemove={retirerLocalement} />;
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
