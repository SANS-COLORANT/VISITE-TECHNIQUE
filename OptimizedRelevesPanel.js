/** Panneau Relevés optimisé pour Android natif. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { TRAME_DATA } from './data.js';
import {
  ajouterCompteur,
  getChampsVisite,
  listerCompteurs,
  supprimerCompteur,
  upsertCompteurChamp,
} from './db.js';
import { ChampGenerique, cleanLabel, useSaisieAvecAutoSave } from './GenericFields.js';
import { PhotoButton } from './PhotoButton.js';

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
  const [valeur, setValeur, surBlurValeur] = useSaisieAvecAutoSave(
    compteur.valeur,
    (v) => upsertCompteurChamp(compteur.id, 'valeur', v)
  );

  useEffect(() => { setUnite(compteur.unite || 'm³'); }, [compteur.unite]);

  const retirer = async () => {
    onRemove(compteur.id);
    try {
      await supprimerCompteur(compteur.id);
    } catch (e) {
      console.warn('Suppression compteur impossible', e);
    }
  };

  return (
    <View style={styles.compteurRow}>
      <View style={styles.compteurRowTop}>
        <View style={{ flex: 1 }}>
          <TextInput style={styles.input} value={label} onChangeText={setLabel} onBlur={surBlurLabel} placeholder="Nom du compteur" />
        </View>
        <PhotoButton
          visiteId={visiteId}
          entiteKey={compteur.compteur_site_id ? `compteur_site||${compteur.compteur_site_id}` : `compteur||${compteur.id}`}
          label={label || 'Compteur'}
        />
        <TouchableOpacity onPress={retirer}><Text style={styles.removeLink}>Retirer</Text></TouchableOpacity>
      </View>
      {compteur.compteur_site_id && (
        <View style={styles.persistentEquipmentBadge}>
          <Text style={styles.persistentEquipmentBadgeText}>↻ Compteur permanent · {compteur.nb_releves || 0} relevé{compteur.nb_releves > 1 ? 's' : ''}</Text>
        </View>
      )}
      <View style={styles.compteurRowBody}>
        <TextInput
          style={styles.compteurValInput}
          value={valeur}
          onChangeText={setValeur}
          onBlur={surBlurValeur}
          placeholder="Valeur relevée"
          keyboardType="numeric"
        />
        <View style={styles.uniteRow}>
          {UNITES.map((u) => (
            <TouchableOpacity
              key={u}
              style={[styles.uniteChip, unite === u && styles.uniteChipSelected]}
              onPress={() => {
                setUnite(u);
                upsertCompteurChamp(compteur.id, 'unite', u).catch((e) => console.warn('Unité compteur non sauvegardée', e));
              }}
            >
              <Text style={[styles.uniteChipText, unite === u && styles.uniteChipTextSelected]}>{u}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
});

export function OptimizedRelevesPanel({ visiteId, onSaved }) {
  const [champsMap, setChampsMap] = useState({});
  const [compteurs, setCompteurs] = useState([]);
  const [ajoutCompteurVisible, setAjoutCompteurVisible] = useState(false);
  const [nomCompteurChoisi, setNomCompteurChoisi] = useState('');
  const [nomCompteurLibre, setNomCompteurLibre] = useState('');
  const [modeNomLibre, setModeNomLibre] = useState(false);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const autoSeedFaitRef = useRef(false);

  const sections = TRAME_DATA['p-releves'];
  const champsTemp = useMemo(() => sections['Températures et pH'] || [], [sections]);
  const champsCompteursIndex = useMemo(
    () => (sections['Relevés des compteurs et manomètres'] || []).filter((f) => /^Index/i.test(f.cle)),
    [sections]
  );
  const champsPression = useMemo(
    () => (sections['Relevés des compteurs et manomètres'] || []).filter((f) => !/^Index/i.test(f.cle)),
    [sections]
  );

  const chargerInitial = useCallback(async () => {
    const [champs, compteursDb] = await Promise.all([
      getChampsVisite(visiteId),
      listerCompteurs(visiteId),
    ]);
    setChampsMap(mapperChamps(champs));
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
    chargerInitial().catch((e) => {
      if (actif) console.warn('Chargement relevés impossible', e);
    });
    return () => { actif = false; };
  }, [chargerInitial]);

  const ouvrirAjoutCompteur = () => {
    setNomCompteurChoisi('');
    setNomCompteurLibre('');
    setModeNomLibre(false);
    setAjoutCompteurVisible(true);
  };

  const creerCompteurChoisi = async () => {
    const label = modeNomLibre ? nomCompteurLibre.trim() : nomCompteurChoisi.trim();
    if (!label || creationEnCours) return;
    setCreationEnCours(true);
    try {
      const id = await ajouterCompteur(visiteId, label);
      setCompteurs((courants) => [...courants, { id, visite_id: visiteId, label, unite: null, valeur: null }]);
      setAjoutCompteurVisible(false);
      setNomCompteurChoisi('');
      setNomCompteurLibre('');
      setModeNomLibre(false);
    } catch (e) {
      console.warn('Création compteur impossible', e);
    } finally {
      setCreationEnCours(false);
    }
  };

  const retirerLocalement = useCallback((id) => {
    setCompteurs((courants) => courants.filter((c) => c.id !== id));
  }, []);

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelContent}>
      <Text style={styles.sectionTitle}>Pressions</Text>
      <View style={styles.formCard}>
        {champsPression.map((f) => (
          <ChampGenerique
            key={f.cle}
            visiteId={visiteId}
            sectionCode="releves.compteurs"
            field={f}
            valeurInitiale={champsMap[`releves.compteurs||${f.cle}`]}
            onSaved={onSaved}
          />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Compteurs relevés</Text>
      {compteurs.map((c) => (
        <CompteurCard key={c.id} compteur={c} visiteId={visiteId} onRemove={retirerLocalement} />
      ))}
      <TouchableOpacity style={styles.addBtn} onPress={ouvrirAjoutCompteur}>
        <Text style={styles.addBtnText}>+ Ajouter un compteur</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Températures et pH</Text>
      <View style={styles.formCard}>
        {champsTemp.map((f) => (
          <ChampGenerique
            key={f.cle}
            visiteId={visiteId}
            sectionCode="releves.temperatures"
            field={f}
            valeurInitiale={champsMap[`releves.temperatures||${f.cle}`]}
            onSaved={onSaved}
          />
        ))}
      </View>

      <Modal visible={ajoutCompteurVisible} transparent animationType="fade" onRequestClose={() => setAjoutCompteurVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Ajouter un compteur</Text>
            <Text style={styles.importHint}>Choisis le type de compteur. Son nom pourra être modifié ensuite directement dans la visite.</Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 320, marginTop: 10 }}>
              {COMPTEUR_TYPES.map((nom) => (
                <TouchableOpacity
                  key={nom}
                  style={[styles.biblioRow, nomCompteurChoisi === nom && { borderColor: COLORS.primary, borderWidth: 1 }]}
                  onPress={() => { setNomCompteurChoisi(nom); setModeNomLibre(false); setNomCompteurLibre(''); }}
                >
                  <Text style={styles.biblioRowTitle}>{nom}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.biblioRow, modeNomLibre && { borderColor: COLORS.primary, borderWidth: 1 }]}
                onPress={() => { setModeNomLibre(true); setNomCompteurChoisi(''); }}
              >
                <Text style={styles.biblioRowTitle}>+ Autre / nom personnalisé</Text>
              </TouchableOpacity>
              {modeNomLibre && (
                <TextInput
                  style={[styles.input, { marginTop: 10 }]}
                  value={nomCompteurLibre}
                  onChangeText={setNomCompteurLibre}
                  placeholder="Ex. Compteur primaire RCU bâtiment A"
                  autoFocus
                />
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setAjoutCompteurVisible(false)} disabled={creationEnCours}>
                <Text style={styles.btnSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, ((!nomCompteurChoisi && !nomCompteurLibre.trim()) || creationEnCours) ? { opacity: 0.45 } : null]}
                disabled={(!nomCompteurChoisi && !nomCompteurLibre.trim()) || creationEnCours}
                onPress={creerCompteurChoisi}
              >
                <Text style={styles.btnPrimaryText}>{creationEnCours ? 'Ajout…' : 'Ajouter'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
