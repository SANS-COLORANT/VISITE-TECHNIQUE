/**
 * Onglet Réserves (refonte build 661, docs/refonte-visite-661/README.md §5.7).
 *
 * - totaux sur une ligne, recalculés en direct ; filtres À traiter / Levées / Précédentes ;
 * - réserves regroupées par onglet d'origine (cartes fermées au départ), une ligne
 *   par réserve triée par criticité ; le rond de levée bascule l'état « Terminé »
 *   (annulable) ;
 * - la fiche s'ouvre dans une feuille du bas, avec les mêmes enregistrements
 *   qu'avant (remarkDb.js) ; aucune clé de données ne change.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { styles, FONTS, COLORS } from './styles.js';
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
import { RESERVE_SEVERITY_LEVELS, clampReserveSeverity, reserveSeverityLabel } from './reserveSeverity.js';
import { BoundedLruMap } from './boundedCache.js';
import { useListScrollMemory } from './useListScrollMemory.js';
import { ButtonGlow } from './ButtonGlow.js';
import { EmptyIcon } from './EmptyState.js';
import { listerAnomaliesPrecedentes } from './terrainVisitDb.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { normaliserSectionCode } from './trameRegistry.js';
import { feedback } from './fieldFeedback.js';
import { Picto, pictoOnglet, pictoCriticite, ACTION_PICTOS } from './MetraPictos.js';
import {
  KIT, SectionCard, useSectionsOuvertes, ChoiceField, FilterSeg, BottomSheet, ActionMenu, confirmer, SmallButton, PictoOrb,
} from './VisitKit.js';

// Garde la dernière version saisie en mémoire entre deux montages de l'onglet.
// SQLite reste la source durable ; ce cache évite qu'un retour instantané sur
// l'onglet réaffiche une valeur ancienne pendant qu'un flush est encore en cours.
const remarksCache = new BoundedLruMap(3);

const GROUPE_MANUELLES = '__manuelles';
const GROUPE_REPRISES = '__reprises';
const POSTES = ['Entretien P2', 'Entretien / P3', 'Travaux de conformité', 'Travaux d’amélioration'];
const ETATS_AVANCEMENT = ['Non réalisé', 'Devis émis', 'En cours', 'Terminé', 'Annulé'];

// Couleur de chaque niveau de criticité (0 Information → 5 Critique).
const SEVERITE = [
  { solid: '#6B7280', bg: '#EEF0F2' },
  { solid: '#2E9D5B', bg: '#E6F4EC' },
  { solid: '#B45309', bg: '#FEF3E2' },
  { solid: '#D9531A', bg: '#FCE4D3' },
  { solid: '#C23B2E', bg: '#FBE9E7' },
  { solid: '#8F1D14', bg: '#F6DCD8' },
];
const COURT = ['Info', 'Mineur', 'À prog.', 'Important', 'Prioritaire', 'Critique'];

function nombreOuNull(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function euros(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function criticiteDe(r) {
  return clampReserveSeverity(r?.criticite ?? r?.criticite_defaut ?? 2);
}

function estLevee(r) {
  return r?.intranet_etat_avancement === 'Terminé';
}

function titreReserve(r) {
  return String(r?.reference_libelle || r?.poste || 'Réserve').trim() || 'Réserve';
}

function libellePhotoRemarque(remarque, prestation) {
  if (String(remarque?.reference_libelle || '').trim()) return String(remarque.reference_libelle).trim();
  if (String(remarque?.controle_key || '').includes('||')) return String(remarque.controle_key).split('||').pop() || 'Anomalie';
  return prestation || 'Anomalie';
}

function ongletOrigine(r, sectionVersOnglet) {
  if (r.reference_onglet) return r.reference_onglet;
  const cle = String(r.controle_key || '');
  if (cle.includes('||')) {
    const code = cle.split('||')[0];
    if (sectionVersOnglet.has(code)) return sectionVersOnglet.get(code);
    const prefixe = code.split('.')[0];
    if (prefixe) return `p-${prefixe}`;
  }
  if (r.reference_type === 'reserve_historique') return GROUPE_REPRISES;
  return GROUPE_MANUELLES;
}

function libelleGroupe(key, panelLabels) {
  if (key === GROUPE_MANUELLES) return 'Réserves manuelles';
  if (key === GROUPE_REPRISES) return 'Reprises des visites précédentes';
  return panelLabels[key] || 'Autres réserves';
}

function pluriel(n, mot) {
  return `${n} ${mot}${n > 1 ? 's' : ''}`;
}

const SevPill = memo(function SevPill({ niveau, small }) {
  const n = clampReserveSeverity(niveau);
  const c = SEVERITE[n];
  return (
    <View style={[st.sevPill, { backgroundColor: c.solid }, small && st.sevPillSmall]} accessibilityLabel={`Criticité ${reserveSeverityLabel(n)}`}>
      <Picto name={pictoCriticite(n)} size={small ? 11 : 12} mono={COLORS.white} />
      <Text numberOfLines={1} style={[st.sevPillText, small && { fontSize: 10 }]}>{COURT[n]}</Text>
    </View>
  );
});

/** Une ligne par réserve : rond de levée, titre, début de prestation, criticité, prix et délai. */
const ReserveRow = memo(function ReserveRow({ remarque, onOpen, onToggleLevee, reseauChaleur, last }) {
  const levee = estLevee(remarque);
  const reprise = remarque.reference_type === 'reserve_historique';
  const prix = Number(remarque.estimatif) || 0;
  const delai = Number(remarque.delai) || 0;
  const meta = [prix ? `${euros(prix)} €` : null, delai ? `${delai} m` : null].filter(Boolean).join(' · ');
  const sous = [
    reseauChaleur && remarque.perimetre ? remarque.perimetre : null,
    reprise ? `Reprise${remarque.intranet_date_reserve ? ` · ${remarque.intranet_date_reserve}` : ''}` : null,
    remarque.prestation || 'Préconisation à compléter',
  ].filter(Boolean).join(' · ');
  return (
    <View style={[st.row, last && { borderBottomWidth: 0 }]}>
      <TouchableOpacity
        accessibilityRole="checkbox"
        accessibilityState={{ checked: levee }}
        accessibilityLabel={levee ? 'Réserve levée, toucher pour la rouvrir' : 'Lever la réserve sur place'}
        onPress={() => onToggleLevee(remarque)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 6 }}
        style={[st.leveeRond, levee && st.leveeRondOn]}
      >
        {levee ? <CvcIcon name="check" size={15} color={COLORS.white} strokeWidth={2.8} /> : null}
      </TouchableOpacity>
      <TouchableOpacity style={st.rowMain} activeOpacity={0.7} onPress={() => onOpen(remarque.id)} accessibilityRole="button" accessibilityHint="Ouvre la fiche de la réserve">
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[st.rowTitle, levee && st.rowTitleLevee]}>{titreReserve(remarque)}</Text>
          <Text numberOfLines={1} style={st.rowSub}>{sous}</Text>
        </View>
        <View style={st.rowRight}>
          <SevPill niveau={criticiteDe(remarque)} small />
          {meta ? <Text numberOfLines={1} style={st.rowMeta}>{meta}</Text> : null}
        </View>
      </TouchableOpacity>
    </View>
  );
});

/** Fiche d'une réserve, ouverte dans une feuille du bas. */
function ReserveFiche({ remarque, visiteId, onPatch, onDelete, onClose, onRattacher, onToggleLevee, panelLabels, origine, intranetLinked = false, reseauChaleur = false }) {
  const [suiviOuvert, setSuiviOuvert] = useState(false);
  const [criticite, setCriticite] = useState(() => criticiteDe(remarque));
  const [prestation, setPrestation, blurPrestation] = useDurableAutosave(remarque.prestation, async (v) => {
    await modifierRemarqueVisite(remarque.id, { prestation: v });
  });
  const [poste, setPoste] = useDurableAutosave(remarque.poste, async (v) => {
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
  const etatAvancement = remarque.intranet_etat_avancement || '';

  useEffect(() => { setCriticite(criticiteDe(remarque)); }, [remarque.criticite]); // eslint-disable-line react-hooks/exhaustive-deps

  const changerPrestation = useCallback((v) => { setPrestation(v); onPatch(remarque.id, { prestation: v }); }, [onPatch, remarque.id, setPrestation]);
  const changerPoste = useCallback((v) => { setPoste(v); onPatch(remarque.id, { poste: v }); }, [onPatch, remarque.id, setPoste]);
  const changerPrix = useCallback((v) => { setPrix(v); onPatch(remarque.id, { estimatif: nombreOuNull(v) }); }, [onPatch, remarque.id, setPrix]);
  const changerDelai = useCallback((v) => { setDelai(v); onPatch(remarque.id, { delai: nombreOuNull(v) }); }, [onPatch, remarque.id, setDelai]);
  const changerDateReserve = useCallback((v) => { setDateReserve(v); onPatch(remarque.id, { intranet_date_reserve: v }); }, [onPatch, remarque.id, setDateReserve]);
  const changerEcheance = useCallback((v) => { setEcheance(v); onPatch(remarque.id, { intranet_delai: v }); }, [onPatch, remarque.id, setEcheance]);
  const changerEtatAvancement = useCallback(async (v) => {
    const next = etatAvancement === v ? null : v;
    onPatch(remarque.id, { intranet_etat_avancement: next });
    await modifierRemarqueVisite(remarque.id, { intranet_etat_avancement: next });
  }, [etatAvancement, onPatch, remarque.id]);
  const changerCriticite = useCallback(async (value) => {
    setCriticite(value);
    await modifierCriticiteRemarque(remarque.id, value);
    onPatch(remarque.id, {
      criticite: value,
      criticite_modifiee: Number(value) === Number(remarque.criticite_defaut ?? 2) ? 0 : 1,
    });
  }, [onPatch, remarque.id, remarque.criticite_defaut]);

  const reprise = remarque.reference_type === 'reserve_historique';
  const demanderSuppression = () => confirmer({
    title: 'Supprimer cette réserve ?',
    message: reprise
      ? 'Cette réserve reprise d’une visite précédente sera retirée de cette visite et ne sera plus reprise aux prochaines visites. Ses photos seront aussi supprimées.'
      : 'La réserve et ses photos seront supprimées de cette visite.',
    onConfirm: async () => {
      onClose();
      try {
        await supprimerRemarqueVisite(remarque.id);
        onDelete(remarque.id);
        feedback('Réserve supprimée', { tone: 'neutral' });
      } catch (e) {
        Alert.alert('Suppression impossible', String(e?.message || e));
      }
    },
  });

  const defaut = remarque.criticite_defaut == null ? null : clampReserveSeverity(remarque.criticite_defaut);
  const levee = estLevee(remarque);

  return (
    <View>
      <Text style={st.ficheLabel}>Criticité · {reserveSeverityLabel(criticite)}{defaut !== null && defaut !== criticite ? `  (proposée : ${reserveSeverityLabel(defaut)})` : ''}</Text>
      <View style={st.sevRow} accessibilityRole="radiogroup">
        {RESERVE_SEVERITY_LEVELS.map((l) => {
          const on = l.value === criticite;
          const c = SEVERITE[l.value];
          return (
            <TouchableOpacity
              key={l.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={l.label}
              onPress={() => changerCriticite(l.value).catch(console.warn)}
              style={[st.sevChip, { borderColor: c.solid + '55', backgroundColor: c.bg }, on && { backgroundColor: c.solid, borderColor: c.solid }]}
            >
              <Text numberOfLines={1} style={[st.sevChipText, { color: on ? COLORS.white : c.solid }]}>{COURT[l.value]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={st.ficheLabel}>Prestation</Text>
      <TextInput style={[styles.input, { minHeight: 76, textAlignVertical: 'top' }]} multiline value={prestation} onChangeText={changerPrestation} onBlur={() => { blurPrestation().catch(() => {}); }} placeholder="Décrire la réserve…" placeholderTextColor={COLORS.inkFaint} />

      <ChoiceField label="Poste" value={poste} options={POSTES} onChange={changerPoste} hint="Choisir le poste" />

      {reseauChaleur ? <View style={{ marginTop: 8 }}>
        <Text style={st.ficheLabel}>Périmètre{remarque.controle_key ? ' · automatique' : ' · obligatoire'}</Text>
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

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        <View style={{ flex: 1 }}>
          <Text style={st.ficheLabel}>Prix estimatif HT</Text>
          <TextInput style={styles.input} value={prix} onChangeText={changerPrix} onBlur={() => { blurPrix().catch(() => {}); }} placeholder="€ HT" placeholderTextColor={COLORS.inkFaint} keyboardType="numeric" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.ficheLabel}>Délai interne (mois)</Text>
          <TextInput style={styles.input} value={delai} onChangeText={changerDelai} onBlur={() => { blurDelai().catch(() => {}); }} placeholder="Mois" placeholderTextColor={COLORS.inkFaint} keyboardType="numeric" />
        </View>
      </View>

      <View style={st.ficheActions}>
        <View style={st.ficheAction}>
          <PhotoButton visiteId={visiteId} entiteKey={`remarque||${remarque.id}`} label={libellePhotoRemarque(remarque, prestation)} />
          <Text style={st.ficheActionText}>Photo</Text>
        </View>
        <TouchableOpacity style={[st.ficheAction, { flex: 1.6 }]} onPress={() => onRattacher(remarque)} accessibilityRole="button">
          {remarque.reference_onglet && pictoOnglet(remarque.reference_onglet)
            ? <Picto name={pictoOnglet(remarque.reference_onglet)} size={18} />
            : <CvcIcon name="arrow-out" size={16} color={COLORS.orangeDark} strokeWidth={2.2} />}
          <Text numberOfLines={2} style={st.ficheActionText}>
            {remarque.reference_onglet ? `${panelLabels[remarque.reference_onglet] || 'Onglet'}${remarque.reference_libelle ? ` · ${remarque.reference_libelle}` : ''}` : 'Rattacher à un élément'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => onToggleLevee(remarque)} style={[st.leveeLigne, levee && { backgroundColor: KIT.greenBg, borderColor: KIT.green + '55' }]} accessibilityRole="checkbox" accessibilityState={{ checked: levee }}>
        <View style={[st.leveeRond, levee && st.leveeRondOn]}>{levee ? <CvcIcon name="check" size={15} color={COLORS.white} strokeWidth={2.8} /> : null}</View>
        <Text style={[st.leveeLigneText, levee && { color: KIT.green }]}>{levee ? 'Levée sur place · toucher pour rouvrir' : 'Levée sur place'}</Text>
      </TouchableOpacity>

      {intranetLinked ? <View style={st.suivi}>
        <TouchableOpacity style={st.suiviHead} onPress={() => setSuiviOuvert((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: suiviOuvert }}>
          <Text style={st.suiviTitle}>Suivi Intranet{etatAvancement ? ` · ${etatAvancement}` : ''}</Text>
          <CvcIcon name={suiviOuvert ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.inkSoft} strokeWidth={2.2} />
        </TouchableOpacity>
        {suiviOuvert ? <View style={{ paddingTop: 6 }}>
          <Text style={[st.ficheHint, { marginBottom: 6 }]}>Le délai interne en mois reste inchangé ; l’échéance est une date distincte.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Text style={st.ficheLabel}>Date réserve</Text><TextInput style={styles.input} value={dateReserve} onChangeText={changerDateReserve} onBlur={() => { blurDateReserve().catch(() => {}); }} placeholder="AAAA-MM-JJ" placeholderTextColor={COLORS.inkFaint} autoCapitalize="none" /></View>
            <View style={{ flex: 1 }}><Text style={st.ficheLabel}>Échéance</Text><TextInput style={styles.input} value={echeance} onChangeText={changerEcheance} onBlur={() => { blurEcheance().catch(() => {}); }} placeholder="AAAA-MM-JJ ou vide" placeholderTextColor={COLORS.inkFaint} autoCapitalize="none" /></View>
          </View>
          <Text style={[st.ficheLabel, { marginTop: 8 }]}>État d’avancement</Text>
          <View style={st.etatRow}>
            {ETATS_AVANCEMENT.map((etat) => {
              const on = etatAvancement === etat;
              return (
                <TouchableOpacity key={etat} onPress={() => changerEtatAvancement(etat).catch(() => {})} style={[st.etatChip, on && st.etatChipOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                  <Text style={[st.etatChipText, on && { color: COLORS.white }]}>{etat}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View> : null}
      </View> : null}

      <Text style={st.ficheHint}>Origine : {origine}{remarque.origine ? ` · ${remarque.origine}` : ''}</Text>
      <Text style={st.ficheHint}>Modification locale à cette visite : la bibliothèque reste inchangée.</Text>

      <View style={st.ficheFooter}>
        <TouchableOpacity onPress={demanderSuppression} style={st.btnDanger} accessibilityRole="button">
          <CvcIcon name="trash" size={16} color={KIT.red} strokeWidth={2.2} />
          <Text style={st.btnDangerText}>Supprimer</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={[styles.btnPrimary, { flex: 1 }]} accessibilityRole="button">
          <ButtonGlow />
          <Text style={styles.btnPrimaryText}>Fermer</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function OptimizedRemarksPanel({ visiteId, tabOrder = [], panelLabels = {}, panels = {}, intranetLinked = false, trameId = 'icpe_v1' }) {
  const reseauChaleur = trameId === 'reseau_chaleur_v1';
  const [remarques, setRemarques] = useState(() => remarksCache.get(visiteId) || []);
  const [filtre, setFiltre] = useState('actuelles');
  const [precedentes, setPrecedentes] = useState([]);
  useEffect(() => {
    let alive = true;
    listerAnomaliesPrecedentes(visiteId).then((rows) => { if (alive) setPrecedentes(rows || []); }).catch(console.warn);
    return () => { alive = false; };
  }, [visiteId]);
  const { listRef, onScroll } = useListScrollMemory(`visit-panel:${visiteId}:p-remarques`, remarques.length);
  const sections = useSectionsOuvertes(`${visiteId}:p-remarques`);
  const [ficheId, setFicheId] = useState(null);
  const [biblioVisible, setBiblioVisible] = useState(false);
  const [biblio, setBiblio] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [remarqueARattacher, setRemarqueARattacher] = useState(null);
  const [ongletChoisi, setOngletChoisi] = useState(null);
  const [cibles, setCibles] = useState([]);

  const ongletsRattachables = useMemo(
    () => tabOrder.filter((id) => id !== 'SEP' && id !== 'p-remarques' && id !== 'p-photos'),
    [tabOrder.join('|')] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Code de section des contrôles (« conf-local.portes||… ») → onglet d'origine.
  const sectionVersOnglet = useMemo(() => {
    const map = new Map();
    for (const [panelId, secs] of Object.entries(panels || {})) {
      for (const section of Object.keys(secs || {})) map.set(normaliserSectionCode(panelId, section), panelId);
    }
    return map;
  }, [panels]);

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

  const actuelles = useMemo(() => remarques.filter((r) => !estLevee(r)), [remarques]);
  const levees = useMemo(() => remarques.filter(estLevee), [remarques]);

  const patchLocal = useCallback((id, patch) => {
    setRemarques((courantes) => {
      const suivantes = courantes.map((r) => r.id === id ? { ...r, ...patch } : r);
      remarksCache.set(visiteId, suivantes);
      return suivantes;
    });
  }, [visiteId]);
  const deleteLocal = useCallback((id) => {
    setRemarques((courantes) => {
      const suivantes = courantes.filter((r) => r.id !== id);
      remarksCache.set(visiteId, suivantes);
      return suivantes;
    });
  }, [visiteId]);

  // Rond de levée = état d'avancement « Terminé » (comme l'ancien bouton « Levée »), annulable.
  const basculerLevee = useCallback(async (remarque) => {
    const avant = remarque.intranet_etat_avancement || null;
    const apres = avant === 'Terminé' ? null : 'Terminé';
    patchLocal(remarque.id, { intranet_etat_avancement: apres });
    try {
      await modifierRemarqueVisite(remarque.id, { intranet_etat_avancement: apres });
    } catch (e) {
      patchLocal(remarque.id, { intranet_etat_avancement: avant });
      Alert.alert('Enregistrement impossible', String(e?.message || e));
      return;
    }
    feedback(apres ? 'Réserve levée' : 'Réserve rouverte', {
      tone: apres ? 'success' : 'neutral',
      action: {
        label: 'Annuler',
        onPress: () => {
          patchLocal(remarque.id, { intranet_etat_avancement: avant });
          modifierRemarqueVisite(remarque.id, { intranet_etat_avancement: avant }).catch(console.warn);
        },
      },
    });
  }, [patchLocal]);

  const reprises = useMemo(() => remarques.filter((r) => r.reference_type === 'reserve_historique' && !estLevee(r)), [remarques]);
  const retirerReprises = useCallback(async () => {
    let n = 0;
    try {
      n = await supprimerReservesReprises(visiteId);
    } catch (e) {
      Alert.alert('Suppression incomplète', String(e?.message || e));
    }
    remarksCache.delete(visiteId);
    await charger().catch(console.warn);
    if (n) feedback(`${pluriel(n, 'réserve')} des visites précédentes retirée${n > 1 ? 's' : ''}`, { tone: 'neutral' });
  }, [visiteId, charger]);

  // Regroupement par onglet d'origine, lignes triées par criticité décroissante.
  const groupes = useMemo(() => {
    const source = filtre === 'levees' ? levees : actuelles;
    const parCle = new Map();
    for (const r of source) {
      const key = ongletOrigine(r, sectionVersOnglet);
      if (!parCle.has(key)) parCle.set(key, []);
      parCle.get(key).push(r);
    }
    const ordre = (key) => {
      if (key === GROUPE_REPRISES) return 10000;
      if (key === GROUPE_MANUELLES) return 10001;
      const i = tabOrder.indexOf(key);
      return i >= 0 ? i : 9000;
    };
    return [...parCle.entries()]
      .map(([key, rows]) => {
        const tries = [...rows].sort((a, b) => criticiteDe(b) - criticiteDe(a) || String(a.cree_le || '').localeCompare(String(b.cree_le || '')));
        return {
          key,
          rows: tries,
          label: libelleGroupe(key, panelLabels),
          picto: key === GROUPE_REPRISES ? ACTION_PICTOS.reprise : (pictoOnglet(key, trameId) || 'onglets/reserves'),
          estimatif: rows.reduce((s, r) => s + (Number(r.estimatif) || 0), 0),
          max: tries.length ? criticiteDe(tries[0]) : 0,
        };
      })
      .sort((a, b) => ordre(a.key) - ordre(b.key));
  }, [filtre, actuelles, levees, sectionVersOnglet, tabOrder, panelLabels, trameId]);

  const ouvertesSignature = groupes.map((g) => (sections.isOpen(g.key) ? '1' : '0')).join('');

  const ouvrirBiblio = async () => {
    setRecherche('');
    setBiblioVisible(true);
    try { setBiblio(await listerBibliothequeReserves()); } catch (e) { console.warn(e); }
  };
  const ouvrirFicheApresAjout = async (id) => {
    setBiblioVisible(false);
    remarksCache.delete(visiteId);
    await charger();
    if (filtre !== 'actuelles') setFiltre('actuelles');
    // Laisse la feuille de la bibliothèque se refermer avant d'ouvrir la fiche.
    if (id) setTimeout(() => setFicheId(id), 280);
  };
  const choisirDepuisBiblio = async (item) => {
    const id = await ajouterRemarqueDepuisBibliotheque(visiteId, item);
    await ouvrirFicheApresAjout(id);
  };
  const ajouterVierge = async () => {
    const id = await ajouterRemarqueVisite(visiteId);
    await ouvrirFicheApresAjout(id);
  };
  const biblioFiltree = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const rows = q ? biblio.filter((b) => `${b.nom || ''} ${b.description || ''} ${b.poste || ''}`.toLowerCase().includes(q)) : biblio;
    return rows.slice(0, 80);
  }, [biblio, recherche]);

  const ouvrirRattachement = useCallback((remarque) => {
    setRemarqueARattacher(remarque);
    setOngletChoisi(null);
    setCibles([]);
  }, []);

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
      const secs = panels[panelId] || {};
      setCibles(Object.entries(secs).flatMap(([section, fields]) => [
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

  const fiche = ficheId ? remarques.find((r) => r.id === ficheId) || null : null;
  const fermerFiche = useCallback(() => setFicheId(null), []);

  const menu = [
    { label: 'Ouvrir tous les groupes', icon: 'chevron-down', onPress: () => sections.open(groupes.map((g) => g.key)) },
    { label: 'Replier tous les groupes', icon: 'chevron-up', onPress: () => sections.closeAll() },
    reprises.length ? {
      label: 'Supprimer les réserves des visites précédentes',
      icon: 'trash',
      destructive: true,
      onPress: () => { retirerReprises().catch(console.warn); },
      confirm: {
        title: 'Supprimer les anciennes réserves ?',
        message: `${pluriel(reprises.length, 'réserve')} reprise${reprises.length > 1 ? 's' : ''} des visites précédentes ${reprises.length > 1 ? 'seront retirées' : 'sera retirée'} de cette visite et ne ${reprises.length > 1 ? 'seront' : 'sera'} plus reprise${reprises.length > 1 ? 's' : ''} aux prochaines visites. Les réserves créées ou levées pendant cette visite sont conservées.`,
        label: 'Supprimer',
      },
    } : null,
  ];

  const header = (
    <View>
      <View style={st.totaux} accessibilityRole="summary">
        <Text style={st.totauxText} numberOfLines={1}>
          <Text style={st.totauxNum}>{stats.total}</Text> réserve{stats.total > 1 ? 's' : ''}
          <Text style={st.totauxSep}>  ·  </Text>
          <Text style={st.totauxNum}>{euros(stats.estimatif)} €</Text> HT
          <Text style={st.totauxSep}>  ·  </Text>
          <Text style={st.totauxNum}>{stats.urgentes}</Text> à ≤ 3 mois
        </Text>
      </View>
      <View style={st.toolbar}>
        <View style={{ flex: 1 }}>
          <FilterSeg
            value={filtre}
            onChange={setFiltre}
            options={[
              { key: 'actuelles', label: 'À traiter', count: actuelles.length },
              { key: 'levees', label: 'Levées', count: levees.length },
              { key: 'precedentes', label: 'Précéd.', count: precedentes.length },
            ]}
          />
        </View>
        <View style={st.toolbarActions}>
          <SmallButton label="Ajouter" icon="plus" onPress={ouvrirBiblio} />
          <ActionMenu items={menu} label="Plus d’actions sur les réserves" />
        </View>
      </View>
      {filtre === 'precedentes' ? <Text style={st.hint}>Historique du même local et de la même trame. Ces réserves ne sont pas des constats de cette visite.</Text> : null}
    </View>
  );

  const renderGroupe = useCallback(({ item }) => (
    <SectionCard
      picto={item.picto}
      title={item.label}
      subtitle={`${pluriel(item.rows.length, 'réserve')}${item.estimatif ? ` · ${euros(item.estimatif)} € HT` : ''}`}
      open={sections.isOpen(item.key)}
      onToggle={() => sections.toggle(item.key)}
      right={<SevPill niveau={item.max} />}
    >
      {item.rows.map((r, i) => (
        <ReserveRow key={r.id} remarque={r} onOpen={setFicheId} onToggleLevee={basculerLevee} reseauChaleur={reseauChaleur} last={i === item.rows.length - 1} />
      ))}
    </SectionCard>
  ), [sections, basculerLevee, reseauChaleur]);

  const renderPrecedente = useCallback(({ item }) => (
    <View style={st.precedente}>
      <PictoOrb picto={ACTION_PICTOS.reprise} size={30} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={st.rowTitle}>{item.reference_libelle || item.poste || 'Réserve'}</Text>
        <Text numberOfLines={2} style={st.rowSub}>{[item.date_source ? `Visite du ${item.date_source}` : null, item.prestation].filter(Boolean).join(' · ')}</Text>
      </View>
      <SevPill niveau={criticiteDe(item)} small />
    </View>
  ), []);

  const vide = filtre === 'precedentes'
    ? <View style={styles.empty}><EmptyIcon name="remark" /><Text style={styles.emptyText}>Aucune réserve dans la visite précédente.</Text></View>
    : filtre === 'levees'
      ? <View style={styles.empty}><EmptyIcon name="remark" /><Text style={styles.emptyText}>Aucune réserve levée.</Text><Text style={styles.emptySub}>Touche le rond d’une réserve pour la lever sur place.</Text></View>
      : <View style={styles.empty}><EmptyIcon name="remark" /><Text style={styles.emptyText}>Aucune réserve à traiter.</Text><Text style={styles.emptySub}>Passe un point de contrôle en N.S pour en générer une, ou touche « Ajouter ».</Text></View>;

  return (
    <View style={{ flex: 1 }}>
      {filtre === 'precedentes' ? (
        <FlatList
          key="precedentes"
          ref={listRef}
          data={precedentes}
          onScroll={onScroll}
          scrollEventThrottle={100}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderPrecedente}
          ListHeaderComponent={header}
          ListEmptyComponent={vide}
          contentContainerStyle={styles.panelContent}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={8}
          windowSize={5}
          removeClippedSubviews={false}
        />
      ) : (
        <FlatList
          key="groupes"
          ref={listRef}
          data={groupes}
          extraData={ouvertesSignature}
          onScroll={onScroll}
          scrollEventThrottle={100}
          keyExtractor={(item) => item.key}
          renderItem={renderGroupe}
          ListHeaderComponent={header}
          ListEmptyComponent={vide}
          contentContainerStyle={styles.panelContent}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={6}
          maxToRenderPerBatch={4}
          windowSize={5}
          updateCellsBatchingPeriod={80}
          removeClippedSubviews={false}
        />
      )}

      <BottomSheet
        visible={!!fiche}
        onClose={fermerFiche}
        title={fiche ? titreReserve(fiche) : ''}
        subtitle={fiche ? `Origine : ${libelleGroupe(ongletOrigine(fiche, sectionVersOnglet), panelLabels)}` : ''}
        picto={fiche ? pictoCriticite(criticiteDe(fiche)) : null}
      >
        {fiche ? (
          <ReserveFiche
            key={fiche.id}
            remarque={fiche}
            visiteId={visiteId}
            onPatch={patchLocal}
            onDelete={deleteLocal}
            onClose={fermerFiche}
            onRattacher={ouvrirRattachement}
            onToggleLevee={basculerLevee}
            panelLabels={panelLabels}
            origine={libelleGroupe(ongletOrigine(fiche, sectionVersOnglet), panelLabels)}
            intranetLinked={intranetLinked}
            reseauChaleur={reseauChaleur}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        visible={biblioVisible}
        onClose={() => setBiblioVisible(false)}
        title="Ajouter une réserve"
        picto="onglets/reserves"
        footer={(
          <View style={st.sheetActions}>
            <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => setBiblioVisible(false)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={() => { ajouterVierge().catch(console.warn); }}><ButtonGlow /><Text style={styles.btnPrimaryText}>Réserve vierge</Text></TouchableOpacity>
          </View>
        )}
      >
        <TextInput
          value={recherche}
          onChangeText={setRecherche}
          placeholder="Rechercher dans la bibliothèque…"
          placeholderTextColor={COLORS.inkFaint}
          style={[styles.input, { marginBottom: 6 }]}
          returnKeyType="search"
        />
        <Text style={st.ficheHint}>La réserve choisie est copiée dans cette visite et reste modifiable sans toucher à la bibliothèque.</Text>
        {biblioFiltree.map((item) => (
          <TouchableOpacity key={String(item.id)} style={styles.biblioRow} onPress={() => { choisirDepuisBiblio(item).catch(console.warn); }}>
            <Text style={styles.biblioRowTitle}>{item.nom}</Text>
            <Text style={styles.biblioRowSub} numberOfLines={2}>{[item.description, item.prix != null ? `${euros(item.prix)} € HT` : 'Prix libre', item.delai != null ? `${item.delai} mois` : 'Délai libre'].filter(Boolean).join(' · ')}</Text>
          </TouchableOpacity>
        ))}
        {!biblioFiltree.length ? <Text style={styles.emptySub}>{biblio.length ? 'Aucune réserve ne correspond à la recherche.' : 'Aucune réserve dans la bibliothèque.'}</Text> : null}
      </BottomSheet>

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

const st = StyleSheet.create({
  totaux: { backgroundColor: KIT.card, borderRadius: 14, borderWidth: 1, borderColor: KIT.border, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  totauxText: { fontSize: 12.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft },
  totauxNum: { fontSize: 14.5, fontFamily: FONTS.black, color: COLORS.ink },
  totauxSep: { color: COLORS.inkFaint },
  toolbar: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingTop: 3 },
  hint: { fontSize: 12, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, marginBottom: 10 },

  sevPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  sevPillSmall: { paddingHorizontal: 6, paddingVertical: 2 },
  sevPillText: { fontSize: 10.5, fontFamily: FONTS.bodyBold, color: COLORS.white },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.line },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, minWidth: 0 },
  rowTitle: { fontSize: 13.5, fontFamily: FONTS.bodyBold, color: COLORS.ink },
  rowTitleLevee: { color: COLORS.inkSoft, textDecorationLine: 'line-through' },
  rowSub: { fontSize: 11.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 4, maxWidth: 120 },
  rowMeta: { fontSize: 11, fontFamily: FONTS.semi, color: COLORS.inkSoft },
  leveeRond: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'rgba(22,21,15,0.22)', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  leveeRondOn: { backgroundColor: KIT.green, borderColor: KIT.green },

  precedente: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: KIT.card, borderRadius: 14, borderWidth: 1, borderColor: KIT.border, padding: 10, marginBottom: 8 },

  ficheLabel: { fontSize: 11, fontFamily: FONTS.bodyBold, color: COLORS.inkSoft, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 10, marginBottom: 5 },
  ficheHint: { fontSize: 11.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkFaint, marginTop: 6 },
  sevRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sevChip: { minHeight: 34, paddingHorizontal: 10, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sevChipText: { fontSize: 12, fontFamily: FONTS.bodyBold },
  ficheActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  ficheAction: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#FFFFFF', paddingHorizontal: 10 },
  ficheActionText: { flexShrink: 1, fontSize: 12.5, fontFamily: FONTS.bodySemi, color: COLORS.ink },
  leveeLigne: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#FFFFFF', paddingHorizontal: 10 },
  leveeLigneText: { fontSize: 13, fontFamily: FONTS.bodySemi, color: COLORS.ink },
  suivi: { marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 4 },
  suiviHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  suiviTitle: { fontSize: 13, fontFamily: FONTS.bodySemi, color: COLORS.ink },
  etatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 8 },
  etatChip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderColor: 'rgba(22,21,15,0.12)', borderRadius: 18, backgroundColor: '#FFFFFF' },
  etatChipOn: { backgroundColor: COLORS.orange, borderColor: COLORS.orange },
  etatChipText: { fontSize: 12, fontFamily: FONTS.bodyBold, color: COLORS.inkSoft },
  ficheFooter: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btnDanger: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 50, borderRadius: 17, borderWidth: 1, borderColor: KIT.red + '66', backgroundColor: '#FFFFFF' },
  btnDangerText: { fontSize: 14, fontFamily: FONTS.bodyBold, color: KIT.red },
  sheetActions: { flexDirection: 'row', gap: 10 },
});

export { OptimizedRemarksPanel };
