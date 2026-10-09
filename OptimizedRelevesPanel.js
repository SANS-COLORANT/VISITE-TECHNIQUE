/**
 * Panneau Relevés (refonte build 661, docs/refonte-visite-661/README.md §5.4).
 *
 * Rubriques repliables fermées au départ : Pressions, Compteurs, Températures
 * et pH (groupées par circuit, Départ / Retour côte à côte, ΔT), mesures
 * complémentaires. Les clés de données ne changent pas : champs_visite pour
 * pressions et températures, compteurs (label / destination / unité) et
 * points_mesure_visite pour les mesures ajoutées.
 *
 * Noms d'affichage (pressions, températures, pH, groupes) : table générique
 * attributs_libres, clés « releves.alias.* » rattachées au local (installation,
 * à défaut au site), sur le modèle de preAllumageAliases.js. Renommer ne
 * change jamais la ligne du rapport Excel.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS, styles } from './styles.js';
import { TRAME_DATA } from './data.js';
import {
  ajouterCompteur,
  getChampsVisite,
  getControlesVisite,
  getDb,
  listerCompteurs,
  supprimerCompteur,
  upsertCompteurChamp,
  uuidv4,
} from './db.js';
import { cleanLabel, getNumericConfig, useSaisieAvecAutoSave } from './GenericFields.js';
import { DurableChampGenerique } from './DurableChampGenerique.js';
import { PhotoButton } from './PhotoButton.js';
import { useListScrollMemory } from './useListScrollMemory.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { pictoReleve, pictoTemperature } from './relevePictos.js';
import { PersistentControleGenerique } from './PersistentControleGenerique.js';
import { controlerIndex, destinationDepuisLibelle, destinationsDisponibles, libelleDestination, nombreIndex } from './meterDestinations.js';
import { LecturePhotoButton } from './PhotoOcrReview.js';
import { CourbeReleves } from './CourbeReleves.js';
import { ChampMesureTile, ExtraMeasurementCard, nombreMesure } from './ExtraMeasurementCard.js';
import { listerPointsMesureVisite, ajouterPointMesureVisite, modifierPointMesureVisite } from './terrainVisitDb.js';
import {
  ActionMenu, BottomSheet, ChoiceField, InlineRename, KIT, PictoOrb, SectionCard, SmallButton, SubGroupTitle, TileRow, UnitPill, useSectionsOuvertes,
} from './VisitKit.js';
import { Picto, pictoCircuit, pictoCompteur } from './MetraPictos.js';
import { getPreviousVisitSnapshot, prewarmPreviousVisitSnapshot } from './visitPreviousSnapshot.js';

const COMPTEUR_TYPES = [
  'Compteur gaz', 'Compteur énergie chauffage', 'Compteur énergie ECS', 'Compteur eau appoint chauffage',
  'Compteur eau froide ECS', 'Compteur eau froide générale', 'Compteur électrique', 'Compteur fioul',
  'Compteur calories', 'Compteur volumétrique', 'Manomètre chauffage', 'Manomètre ECS',
];

// Températures ajoutées : points de mesure de la visite dont le libellé porte
// le groupe (« Chauffage · Départ 2 ») ; l'écran affiche le nom sans préfixe,
// l'annexe Excel garde le libellé complet.
const GROUPES_POINTS = Object.freeze({
  Chauffage: { prefixe: 'Chauffage · ', noms: ['Départ 2', 'Retour 2', 'Mélange'], ajout: '+ Ajouter une température chauffage' },
  ECS: { prefixe: 'ECS · ', noms: ['Ballon bas', 'Ballon haut', 'Bouclage'], ajout: '+ Ajouter une température ECS' },
});

function groupePoint(point) {
  const libelle = String(point?.libelle || '');
  return Object.keys(GROUPES_POINTS).find((g) => libelle.startsWith(GROUPES_POINTS[g].prefixe)) || null;
}
function nomPoint(point) {
  const g = groupePoint(point);
  return g ? String(point.libelle).slice(GROUPES_POINTS[g].prefixe.length) : String(point?.libelle || '');
}

// ---------------------------------------------------------------------------
// Noms d'affichage (alias) durables par local
// ---------------------------------------------------------------------------

const ALIAS_PREFIX = 'releves.alias.';
const slug = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
export const cleNomChamp = (sectionCode, cle) => `champ.${slug(sectionCode)}.${slug(cle)}`;
export const cleNomGroupe = (circuit) => `groupe.${slug(circuit)}`;

async function porteeNoms(db, visiteId) {
  const v = await db.getFirstAsync('SELECT site_id,installation_id FROM visites WHERE id=?', [visiteId]);
  if (v?.installation_id) return { type: 'installation', id: v.installation_id };
  if (v?.site_id) return { type: 'site', id: v.site_id };
  return null;
}

export async function listerNomsReleves(visiteId) {
  const db = await getDb();
  const portee = await porteeNoms(db, visiteId);
  if (!portee) return {};
  const rows = await db.getAllAsync('SELECT cle,valeur FROM attributs_libres WHERE entite_type=? AND entite_id=? AND cle LIKE ?', [portee.type, portee.id, `${ALIAS_PREFIX}%`]);
  return Object.fromEntries((rows || []).map((r) => [String(r.cle).slice(ALIAS_PREFIX.length), r.valeur || '']));
}

export async function enregistrerNomReleve(visiteId, key, valeur, valeurParDefaut = '') {
  const db = await getDb();
  const portee = await porteeNoms(db, visiteId);
  if (!portee) throw new Error('Local introuvable pour cette visite.');
  const propre = String(valeur || '').trim();
  const cle = `${ALIAS_PREFIX}${key}`;
  if (!propre || propre === String(valeurParDefaut || '').trim()) {
    await db.runAsync('DELETE FROM attributs_libres WHERE entite_type=? AND entite_id=? AND cle=?', [portee.type, portee.id, cle]);
    return '';
  }
  await db.runAsync(
    `INSERT INTO attributs_libres(id,entite_type,entite_id,cle,valeur,type_valeur) VALUES(?,?,?,?,?,'texte')
     ON CONFLICT(entite_type,entite_id,cle) DO UPDATE SET valeur=excluded.valeur,modifie_le=datetime('now')`,
    [uuidv4(), portee.type, portee.id, cle, propre]
  );
  return propre;
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function mapperChamps(rows = []) {
  const map = {};
  rows.forEach((row) => {
    if (row?.section_code && row?.cle) map[`${row.section_code}||${row.cle}`] = row.valeur;
  });
  return map;
}

/** 48150 -> « 48 150 », 1234.5 -> « 1 234,5 » (sans dépendre d'Intl). */
function fmtNombre(n) {
  const arrondi = Math.round(Number(n) * 1000) / 1000;
  const [entier, dec] = String(Math.abs(arrondi)).split('.');
  const groupe = entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${arrondi < 0 ? '−' : ''}${groupe}${dec ? `,${dec}` : ''}`;
}

const vide = (v) => v == null || String(v).trim() === '';

function chunk2(items) {
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

function PhotoSheet({ visible, onClose, visiteId, entiteKey, label }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Photos" subtitle={label} maxHeight="45%">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
        <PhotoButton visiteId={visiteId} entiteKey={entiteKey} label={label} />
        <Text style={[st.hint, { flex: 1 }]}>Prendre une photo, ou voir celles déjà prises.</Text>
      </View>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// Ligne du rapport d'un compteur
// ---------------------------------------------------------------------------

/** Choix de la ligne du rapport (Excel + Intranet), indépendante du nom. */
function DestinationSheet({ visible, valeur, options, onClose, onPick }) {
  const [saving, setSaving] = useState(false);
  const choisir = async (cle) => {
    if (saving) return;
    setSaving(true);
    try { if (await onPick(cle) !== false) onClose(); }
    finally { setSaving(false); }
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Ligne du rapport" subtitle="Où ce compteur apparaît dans l’Excel et l’envoi Intranet. Son nom reste libre." maxHeight="75%">
      {options.map((o) => (
        <TouchableOpacity key={o.cle} disabled={saving} accessibilityRole="button" accessibilityState={{ selected: valeur === o.cle }} style={[st.sheetRow, valeur === o.cle && st.sheetRowOn]} onPress={() => choisir(o.cle)}>
          <Text style={[st.sheetRowText, { flex: 1 }]}>{o.label}</Text>
          {valeur === o.cle ? <CvcIcon name="check" size={20} color={COLORS.orangeDark} strokeWidth={2.4} /> : null}
        </TouchableOpacity>
      ))}
    </BottomSheet>
  );
}

// ---------------------------------------------------------------------------
// Compteur sur deux lignes
// ---------------------------------------------------------------------------

const CompteurRow = memo(function CompteurRow({ compteur, visiteId, onRemove, champsSection, doublonDestination, onDestinationChange, onLive }) {
  const [label, , , setLabelImmediate] = useSaisieAvecAutoSave(compteur.label, (v) => upsertCompteurChamp(compteur.id, 'label', v));
  const [unite, setUnite] = useState(compteur.unite || 'm³');
  const [destination, setDestination] = useState(compteur.destination || null);
  const [choixDestination, setChoixDestination] = useState(false);
  const [photoVisible, setPhotoVisible] = useState(false);
  const [valeur, setValeur, surBlurValeur, setValeurImmediate] = useSaisieAvecAutoSave(compteur.valeur, (v) => upsertCompteurChamp(compteur.id, 'valeur', v));
  const options = useMemo(() => destinationsDisponibles(champsSection), [champsSection]);
  // Destination effective affichée : enregistrée, sinon celle que l'export
  // déduit aujourd'hui du nom (compteur historique).
  const destinationAffichee = destination || destinationDepuisLibelle(label, unite, champsSection);
  const suiviIndex = /^Index/i.test(destinationAffichee);
  const controle = controlerIndex(valeur, suiviIndex ? compteur.valeur_precedente : null);
  const picto = pictoCompteur(label);
  const court = pictoReleve(label).court;
  // Nom de la trame (« Index compteur… ») : nom court ; nom choisi : tel quel.
  const nomAffiche = (/^index\b/i.test(String(label || '')) && court) ? court : (label || 'Compteur');
  const entiteKey = compteur.compteur_site_id ? `compteur_site||${compteur.compteur_site_id}` : `compteur||${compteur.id}`;

  // On repart de l'ancien index : à l'ouverture d'un compteur sans relevé, le
  // dernier index connu est repris (modifiable) ; la croix l'efface d'un geste.
  const prefillFait = useRef(false);
  const precedentTexte = nombreIndex(compteur.valeur_precedente) !== null && !Number.isNaN(nombreIndex(compteur.valeur_precedente))
    ? String(compteur.valeur_precedente).trim() : '';
  useEffect(() => {
    if (prefillFait.current) return;
    prefillFait.current = true;
    if (!String(compteur.valeur ?? '').trim() && precedentTexte) {
      setValeurImmediate(precedentTexte);
      onLive?.(compteur.id, precedentTexte);
    }
  }, [compteur.id, compteur.valeur, precedentTexte, setValeurImmediate, onLive]);
  const inchange = Boolean(precedentTexte) && String(valeur ?? '').trim() === precedentTexte;
  // La croix efface et mémorise l'index effacé : elle devient alors un bouton
  // de retour en arrière, jusqu'à la première saisie d'un nouvel index.
  const [indexEfface, setIndexEfface] = useState(null);
  const effacerIndex = () => {
    prefillFait.current = true;
    setIndexEfface(String(valeur ?? ''));
    setValeurImmediate('');
    onLive?.(compteur.id, '');
    champIndex.current?.focus?.();
  };
  const annulerEffacement = () => {
    const ancien = indexEfface;
    setIndexEfface(null);
    if (ancien == null) return;
    setValeurImmediate(ancien);
    onLive?.(compteur.id, ancien);
  };
  const champIndex = useRef(null);
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
  const renommer = useCallback(async (nouveau) => {
    if (!destination && !await enregistrerDestination(destinationDepuisLibelle(label, unite, champsSection))) return;
    setLabelImmediate(nouveau);
  }, [destination, enregistrerDestination, label, unite, champsSection, setLabelImmediate]);

  const retirer = async () => {
    try { await supprimerCompteur(compteur.id); onRemove(compteur.id); }
    catch (e) { console.warn('Suppression compteur impossible', e); Alert.alert('Suppression impossible', 'Le compteur a été conservé. Réessaie.'); }
  };

  const changerValeur = (t) => { setIndexEfface(null); setValeur(t); onLive?.(compteur.id, t); };
  const changerUnite = (u) => {
    setUnite(u);
    upsertCompteurChamp(compteur.id, 'unite', u).catch((e) => console.warn('Unité compteur non sauvegardée', e));
  };

  // Résumé : relevé précédent et consommation en direct.
  const nPrec = nombreIndex(compteur.valeur_precedente);
  const nVal = nombreIndex(valeur);
  const precOk = nPrec !== null && !Number.isNaN(nPrec);
  const valOk = nVal !== null && !Number.isNaN(nVal);
  const baisse = suiviIndex && precOk && valOk && nVal < nPrec;
  let resume = null;
  if (precOk) {
    resume = `précédent ${fmtNombre(nPrec)} ${unite}`;
    if (inchange) resume += ' · à mettre à jour';
    else if (suiviIndex && valOk && !baisse) resume += ` · +${fmtNombre(nVal - nPrec)} ${unite}`;
  } else if (compteur.compteur_site_id) {
    resume = `Compteur permanent · ${compteur.nb_releves || 0} relevé${compteur.nb_releves > 1 ? 's' : ''}`;
  }

  return (
    <View style={st.cpt}>
      <View style={st.cptLine1}>
        <PictoOrb picto={picto.name} water={picto.water} size={34} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <InlineRename value={nomAffiche} onSubmit={renommer} style={st.cptName} placeholder="Nom du compteur" />
          {resume ? <Text numberOfLines={1} style={[st.cptSub, (baisse || inchange) && { color: KIT.amber }]}>{resume}</Text> : null}
        </View>
        <ActionMenu label={`Actions du compteur ${nomAffiche}`} items={[
          { label: 'Photo', icon: 'camera', onPress: () => setPhotoVisible(true) },
          { label: `Ligne du rapport · ${libelleDestination(destinationAffichee)}`, icon: 'document', onPress: () => setChoixDestination(true) },
          {
            label: 'Retirer', icon: 'trash', destructive: true, onPress: retirer,
            confirm: { title: 'Retirer ce compteur ?', message: `« ${nomAffiche} » ne sera plus proposé aux prochaines visites de ce local.`, label: 'Retirer' },
          },
        ]} />
      </View>
      <View style={st.cptLine2}>
        <TextInput
          ref={champIndex}
          style={[st.cptInput, baisse && st.cptInputWarn, controle?.niveau === 'erreur' && st.cptInputErr]}
          selectTextOnFocus
          value={valeur}
          onChangeText={changerValeur}
          onBlur={surBlurValeur}
          placeholder="Index"
          placeholderTextColor="#C9C4BA"
          keyboardType="decimal-pad"
          accessibilityLabel={`Index ${nomAffiche}`}
        />
        {String(valeur ?? '').length ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Effacer l’index ${nomAffiche}`} onPress={effacerIndex} hitSlop={6} style={st.cptClear}>
            <CvcIcon name="close" size={18} color={COLORS.inkSoft} />
          </TouchableOpacity>
        ) : indexEfface ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Rétablir l’index ${indexEfface}`} onPress={annulerEffacement} hitSlop={6} style={[st.cptClear, st.cptUndo]}>
            <CvcIcon name="undo" size={18} color={COLORS.orangeDark} />
          </TouchableOpacity>
        ) : null}
        <UnitPill value={unite} onChange={changerUnite} water={picto.water} />
        <LecturePhotoButton visiteId={visiteId} entiteKey={entiteKey} label={label || 'Compteur'} kind="meters" unit={unite} current={{ valeur }}
          onApply={async (values) => {
            const check = controlerIndex(values.valeur, null);
            if (check?.niveau === 'erreur') throw new Error(check.message);
            await setValeurImmediate(values.valeur);
            onLive?.(compteur.id, values.valeur);
          }} />
      </View>
      {controle ? <Text style={[st.cptMsg, { color: controle.niveau === 'erreur' ? KIT.red : KIT.amber }]}>{controle.message}</Text> : null}
      {suiviIndex && compteur.compteur_site_id ? <CourbeReleves compteurSiteId={compteur.compteur_site_id} visiteId={visiteId} valeur={valeur} unite={unite} /> : null}
      {doublonDestination ? <Text style={[st.cptMsg, { color: KIT.amber }]}>Plusieurs compteurs du même type : ils seront regroupés dans une seule cellule du rapport et de l’Intranet, une ligne chacun.</Text> : null}
      <DestinationSheet visible={choixDestination} valeur={destinationAffichee} options={options} onClose={() => setChoixDestination(false)} onPick={enregistrerDestination} />
      <PhotoSheet visible={photoVisible} onClose={() => setPhotoVisible(false)} visiteId={visiteId} entiteKey={entiteKey} label={label || 'Compteur'} />
    </View>
  );
});

// ---------------------------------------------------------------------------
// Panneau
// ---------------------------------------------------------------------------

function departParDefaut(t) {
  if (t?.sens === 'pH') return 7;
  if (t?.sens === 'Retour') return 50;
  return 60;
}

export function OptimizedRelevesPanel({ visiteId, onSaved, trameId = 'icpe_v1', panels = null }) {
  const [champsMap, setChampsMap] = useState({});
  const [controlesMap, setControlesMap] = useState({});
  const [compteurs, setCompteurs] = useState([]);
  const [points, setPoints] = useState([]);
  const [noms, setNoms] = useState({});
  const [precedent, setPrecedent] = useState(() => getPreviousVisitSnapshot(visiteId) || null);
  const [pointVisible, setPointVisible] = useState(false);
  const [pointNom, setPointNom] = useState('');
  const [pointUnite, setPointUnite] = useState('°C');
  const [ajoutCompteurVisible, setAjoutCompteurVisible] = useState(false);
  const [nomCompteurChoisi, setNomCompteurChoisi] = useState('');
  const [nomCompteurLibre, setNomCompteurLibre] = useState('');
  const [modeNomLibre, setModeNomLibre] = useState(false);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [destinationChoisie, setDestinationChoisie] = useState(null);
  const autoSeedFaitRef = useRef(false);
  const ouvertes = useSectionsOuvertes(`releves:${visiteId}`);

  const sections = panels?.['p-releves'] || TRAME_DATA['p-releves'];
  const reseauChaleur = trameId === 'reseau_chaleur_v1';
  const champsTemp = useMemo(() => sections['Températures et pH'] || [], [sections]);
  const champsCompteursIndex = useMemo(() => (sections['Relevés des compteurs et manomètres'] || []).filter((f) => /^Index/i.test(f.cle)), [sections]);
  const champsPression = useMemo(() => (sections['Relevés des compteurs et manomètres'] || []).filter((f) => !/^Index/i.test(f.cle)), [sections]);
  const champsSectionCompteurs = useMemo(() => sections['Relevés des compteurs et manomètres'] || [], [sections]);

  const chargerInitial = useCallback(async () => {
    const [champs, controles, compteursDb, pointsDb, nomsDb] = await Promise.all([
      getChampsVisite(visiteId), getControlesVisite(visiteId), listerCompteurs(visiteId),
      listerPointsMesureVisite(visiteId).catch(() => []), listerNomsReleves(visiteId).catch(() => ({})),
    ]);
    setChampsMap(mapperChamps(champs));
    setControlesMap(Object.fromEntries((controles || []).map((row) => [`${row.section_code}||${row.cle}`, row])));
    setCompteurs(compteursDb);
    setPoints(pointsDb || []);
    setNoms(nomsDb || {});

    if (!autoSeedFaitRef.current && compteursDb.length === 0 && champsCompteursIndex.length > 0) {
      autoSeedFaitRef.current = true;
      for (const f of champsCompteursIndex) await ajouterCompteur(visiteId, cleanLabel(f.cle), f.cle);
      setCompteurs(await listerCompteurs(visiteId));
    }
  }, [visiteId, champsCompteursIndex]);

  useEffect(() => {
    let actif = true;
    chargerInitial().catch((e) => { if (actif) console.warn('Chargement relevés impossible', e); });
    return () => { actif = false; };
  }, [chargerInitial]);

  useEffect(() => {
    let alive = true;
    prewarmPreviousVisitSnapshot(visiteId).then((snap) => { if (alive) setPrecedent(snap || null); }).catch(() => {});
    return () => { alive = false; };
  }, [visiteId]);

  // ---- noms d'affichage
  const nom = useCallback((key, defaut) => noms[key] || defaut, [noms]);
  const renommer = useCallback(async (key, valeur, defaut) => {
    const avant = noms[key];
    setNoms((old) => ({ ...old, [key]: String(valeur || '').trim() === defaut ? '' : valeur }));
    try { await enregistrerNomReleve(visiteId, key, valeur, defaut); }
    catch (e) {
      setNoms((old) => ({ ...old, [key]: avant }));
      Alert.alert('Renommage impossible', String(e?.message || e));
    }
  }, [noms, visiteId]);

  // ---- valeurs en direct (ΔT, compteurs de la bannière)
  const surLive = useCallback((key, v) => setChampsMap((old) => (old[key] === v ? old : { ...old, [key]: v })), []);
  const surSaved = useCallback(() => { onSaved?.(); }, [onSaved]);
  const valeurPrecedente = useCallback((key) => nombreMesure(precedent?.fields?.[key]), [precedent]);

  // ---- compteurs
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
      ouvertes.open(['compteurs']);
    } catch (e) { console.warn('Création compteur impossible', e); Alert.alert('Ajout impossible', String(e?.message || e)); }
    finally { setCreationEnCours(false); }
  };
  const retirerLocalement = useCallback((id) => setCompteurs((courants) => courants.filter((c) => c.id !== id)), []);
  const changerDestinationLocalement = useCallback((id, destination) => setCompteurs((courants) => courants.map((c) => c.id === id ? { ...c, destination } : c)), []);
  const compteurLive = useCallback((id, valeur) => setCompteurs((courants) => courants.map((c) => (c.id === id && c.valeur !== valeur ? { ...c, valeur } : c))), []);
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

  // ---- points de mesure
  const rechargerPoints = useCallback(async () => setPoints(await listerPointsMesureVisite(visiteId)), [visiteId]);
  const pointRetire = useCallback((id) => setPoints((old) => old.filter((p) => p.id !== id)), []);
  const ajouterTemperature = async (groupe) => {
    const cfg = GROUPES_POINTS[groupe];
    const pris = new Set(points.filter((p) => groupePoint(p) === groupe).map((p) => nomPoint(p).toLowerCase()));
    let nouveau = cfg.noms.find((n) => !pris.has(n.toLowerCase()));
    for (let i = pris.size + 1; !nouveau; i += 1) if (!pris.has(`mesure ${i}`)) nouveau = `Mesure ${i}`;
    try {
      await ajouterPointMesureVisite(visiteId, `${cfg.prefixe}${nouveau}`, '°C');
      await rechargerPoints();
      ouvertes.open(['temperatures']);
    } catch (e) { Alert.alert('Ajout impossible', String(e?.message || e)); }
  };
  const creerPointLibre = async () => {
    try {
      await ajouterPointMesureVisite(visiteId, pointNom, pointUnite);
      await rechargerPoints();
      setPointVisible(false);
      ouvertes.open(['mesures']);
    } catch (error) { Alert.alert('Ajout impossible', String(error?.message || error)); }
  };

  // ---- groupes de températures (Primaire, Chauffage, ECS, Eau/pH)
  const groupesTemp = useMemo(() => {
    const groupes = [];
    const index = new Map();
    champsTemp.forEach((f) => {
      const t = pictoTemperature(f.cle);
      const circuit = t.sens === 'pH' ? 'Eau' : (t.circuit || 'Autres');
      if (!index.has(circuit)) { const g = { circuit, items: [] }; index.set(circuit, g); groupes.push(g); }
      index.get(circuit).items.push({ field: f, t });
    });
    return groupes;
  }, [champsTemp]);
  const pointsParGroupe = useMemo(() => {
    const res = { libres: [] };
    points.forEach((p) => {
      const g = groupePoint(p);
      if (g && groupesTemp.some((x) => x.circuit === g)) (res[g] = res[g] || []).push(p);
      else res.libres.push(p);
    });
    return res;
  }, [points, groupesTemp]);

  // ---- avancement des bannières
  const nbPressions = champsPression.filter((f) => !vide(champsMap[`releves.compteurs||${f.cle}`])).length;
  const nbCompteurs = compteurs.filter((c) => !vide(c.valeur)).length;
  const estControleRc = (f) => reseauChaleur && f.type === 'controle';
  const nbTemp = champsTemp.filter((f) => {
    const key = `releves.temperatures||${f.cle}`;
    return estControleRc(f) ? Boolean(controlesMap[key]?.avis) : !vide(champsMap[key]);
  }).length;

  const { listRef, onScroll } = useListScrollMemory(`visit-panel:${visiteId}:p-releves`, 4);

  // ---- rendus
  const renderChampNumerique = (f, sectionCode, { label, renameKey, start, water, picto }) => {
    const key = `${sectionCode}||${f.cle}`;
    if (!getNumericConfig(f.cle)) {
      return <View key={f.cle} style={{ flex: 1 }}><DurableChampGenerique visiteId={visiteId} sectionCode={sectionCode} field={f} valeurInitiale={champsMap[key]} onSaved={(v) => { surLive(key, v); surSaved(); }} /></View>;
    }
    return (
      <ChampMesureTile key={f.cle} visiteId={visiteId} sectionCode={sectionCode} field={f} valeurInitiale={champsMap[key]}
        label={nom(renameKey, label)} onRenameLabel={(v) => renommer(renameKey, v, label)} start={start}
        onLive={surLive} onSaved={surSaved} water={water} picto={picto} />
    );
  };

  const renderPressions = () => {
    const tuiles = champsPression.map((f) => {
      const key = `releves.compteurs||${f.cle}`;
      const p = pictoCompteur(f.cle);
      const label = pictoReleve(f.cle).court || cleanLabel(f.cle);
      return renderChampNumerique(f, 'releves.compteurs', { label, renameKey: cleNomChamp('releves.compteurs', f.cle), start: valeurPrecedente(key) ?? 1.5, water: p.water, picto: p.name });
    });
    return (
      <SectionCard picto="rel/pressions" title="Pressions" open={ouvertes.isOpen('pressions')} onToggle={() => ouvertes.toggle('pressions')} done={nbPressions} total={champsPression.length}>
        {chunk2(tuiles).map((paire, i) => <TileRow key={i}>{paire}{paire.length < 2 ? <View style={{ flex: 1 }} /> : null}</TileRow>)}
      </SectionCard>
    );
  };

  const renderCompteurs = () => (
    <SectionCard picto="rel/compteurs" title="Compteurs" open={ouvertes.isOpen('compteurs')} onToggle={() => ouvertes.toggle('compteurs')}
      done={nbCompteurs} total={compteurs.length} actionLabel="+ Ajouter" onAction={ouvrirAjoutCompteur}>
      {compteurs.length ? compteurs.map((c) => (
        <CompteurRow key={c.id} compteur={c} visiteId={visiteId} onRemove={retirerLocalement} champsSection={champsSectionCompteurs}
          onDestinationChange={changerDestinationLocalement} onLive={compteurLive}
          doublonDestination={destinationsEnDoublon.has(c.destination || destinationDepuisLibelle(c.label, c.unite, champsSectionCompteurs))} />
      )) : <Text style={st.hint}>Aucun compteur. Touchez « + Ajouter ».</Text>}
    </SectionCard>
  );

  const renderGroupeTemp = (g) => {
    const pc = pictoCircuit(g.circuit);
    const cleGroupe = cleNomGroupe(g.circuit);
    const dep = g.items.find((x) => x.t.sens === 'Départ');
    const ret = g.items.find((x) => x.t.sens === 'Retour');
    const nDep = dep && !estControleRc(dep.field) ? nombreMesure(champsMap[`releves.temperatures||${dep.field.cle}`]) : null;
    const nRet = ret && !estControleRc(ret.field) ? nombreMesure(champsMap[`releves.temperatures||${ret.field.cle}`]) : null;
    const deltaT = nDep != null && nRet != null ? <Text style={st.delta}>ΔT {fmtNombre(nDep - nRet)} °C</Text> : null;

    const tuiles = [];
    const controles = [];
    g.items.forEach(({ field: f, t }) => {
      const key = `releves.temperatures||${f.cle}`;
      if (estControleRc(f)) {
        controles.push(<View key={f.cle} style={st.controle}><PersistentControleGenerique
          visiteId={visiteId} sectionCode="releves.temperatures" field={f} etatInitial={controlesMap[key]} trameId={trameId}
          onEtatChange={(patch) => setControlesMap((old) => ({ ...old, [key]: { ...(old[key] || {}), ...patch } }))}
          onSaved={onSaved} /></View>);
        return;
      }
      const label = t.sens === 'pH' ? 'pH' : (t.sens || cleanLabel(f.cle));
      const picto = t.sens === 'Départ' ? 'dist/t-de-depart' : t.sens === 'Retour' ? 'dist/t-de-retour' : t.sens === 'Stockage' ? 'rel/t-de-stockage' : null;
      tuiles.push(renderChampNumerique(f, 'releves.temperatures', {
        label, renameKey: cleNomChamp('releves.temperatures', f.cle), start: valeurPrecedente(key) ?? departParDefaut(t), water: pc.water, picto,
      }));
    });
    (pointsParGroupe[g.circuit] || []).forEach((p) => {
      const nomP = nomPoint(p);
      tuiles.push(<ExtraMeasurementCard key={p.id} point={p} visiteId={visiteId} displayName={nomP} water={pc.water}
        start={/retour/i.test(nomP) ? 50 : 60} onRemove={pointRetire}
        onRename={async (v) => { await modifierPointMesureVisite(visiteId, p.id, 'libelle', `${GROUPES_POINTS[g.circuit].prefixe}${v}`); setPoints((old) => old.map((x) => (x.id === p.id ? { ...x, libelle: `${GROUPES_POINTS[g.circuit].prefixe}${v}` } : x))); }} />);
    });
    return (
      <View key={g.circuit} style={st.groupe}>
        <SubGroupTitle picto={pc.name} water={pc.water} title={nom(cleGroupe, g.circuit)} onRename={(v) => renommer(cleGroupe, v, g.circuit)} right={deltaT} />
        {controles}
        {chunk2(tuiles).map((paire, i) => <TileRow key={i}>{paire}{paire.length < 2 ? <View style={{ flex: 1 }} /> : null}</TileRow>)}
        {GROUPES_POINTS[g.circuit] ? (
          <TouchableOpacity accessibilityRole="button" onPress={() => ajouterTemperature(g.circuit)} style={[st.addTemp, pc.water && { borderColor: KIT.water + '66' }]}>
            <CvcIcon name="plus" size={14} color={pc.water ? KIT.water : COLORS.orangeDark} strokeWidth={2.4} />
            <Text style={[st.addTempText, pc.water && { color: KIT.water }]}>{GROUPES_POINTS[g.circuit].ajout.replace(/^\+\s*/, '')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const renderTemperatures = () => (
    <SectionCard picto="rel/temperatures-et-ph" title="Températures et pH" open={ouvertes.isOpen('temperatures')} onToggle={() => ouvertes.toggle('temperatures')} done={nbTemp} total={champsTemp.length}>
      {groupesTemp.map(renderGroupeTemp)}
    </SectionCard>
  );

  const renderMesures = () => {
    const libres = pointsParGroupe.libres;
    return (
      <SectionCard picto="rel/temperatures-et-ph" title="Mesures complémentaires" subtitle={libres.length ? null : 'Annexe du rapport Excel'}
        open={ouvertes.isOpen('mesures')} onToggle={() => ouvertes.toggle('mesures')}
        done={libres.filter((p) => !vide(p.valeur)).length} total={libres.length}
        actionLabel="+ Ajouter" onAction={() => { setPointNom(''); setPointUnite('°C'); setPointVisible(true); }}>
        {libres.length ? chunk2(libres.map((p) => <ExtraMeasurementCard key={p.id} point={p} visiteId={visiteId} onRemove={pointRetire}
          start={p.unite === 'bar' ? 1.5 : p.unite === 'pH' ? 7 : 60}
          onRename={async (v) => { await modifierPointMesureVisite(visiteId, p.id, 'libelle', v); setPoints((old) => old.map((x) => (x.id === p.id ? { ...x, libelle: v } : x))); }} />))
          .map((paire, i) => <TileRow key={i}>{paire}{paire.length < 2 ? <View style={{ flex: 1 }} /> : null}</TileRow>)
          : <Text style={st.hint}>Mesure libre conservée dans cette visite et dans l’annexe Excel des mesures complémentaires.</Text>}
      </SectionCard>
    );
  };

  const data = useMemo(() => [
    champsPression.length ? { id: 'pressions' } : null,
    { id: 'compteurs' },
    champsTemp.length ? { id: 'temperatures' } : null,
    { id: 'mesures' },
  ].filter(Boolean), [champsPression.length, champsTemp.length]);

  const optionsDestination = destinationsDisponibles(champsSectionCompteurs);
  const nomEnCours = modeNomLibre ? nomCompteurLibre : nomCompteurChoisi;

  return <>
    <FlatList
      ref={listRef}
      data={data}
      extraData={[champsMap, controlesMap, compteurs, points, noms, precedent, destinationsEnDoublon]}
      onScroll={onScroll}
      scrollEventThrottle={100}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.panelContent}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      windowSize={5}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews={false}
      renderItem={({ item }) => {
        if (item.id === 'pressions') return renderPressions();
        if (item.id === 'compteurs') return renderCompteurs();
        if (item.id === 'temperatures') return renderTemperatures();
        return renderMesures();
      }}
    />

    <BottomSheet visible={pointVisible} onClose={() => setPointVisible(false)} title="Ajouter une mesure" picto="rel/temperatures-et-ph"
      subtitle="Conservée dans cette visite et l’annexe Excel des mesures complémentaires."
      footer={<View style={st.sheetActions}>
        <SmallButton label="Annuler" onPress={() => setPointVisible(false)} />
        <SmallButton label="Ajouter" filled disabled={!pointNom.trim()} onPress={creerPointLibre} />
      </View>}>
      <TextInput accessibilityLabel="Nom de la mesure" style={styles.input} value={pointNom} onChangeText={setPointNom} placeholder="Ex. Primaire · départ 2" placeholderTextColor={COLORS.inkFaint} />
      <ChoiceField label="Unité" value={pointUnite} options={['°C', 'bar', 'pH']} segments allowOther={false} onChange={(u) => setPointUnite(u || '°C')} />
    </BottomSheet>

    <BottomSheet visible={ajoutCompteurVisible} onClose={() => setAjoutCompteurVisible(false)} title="Ajouter un compteur" picto="rel/compteurs"
      subtitle="Choisissez le type de compteur. Son nom pourra être modifié ensuite dans la visite."
      footer={<View style={st.sheetActions}>
        <SmallButton label="Annuler" onPress={() => setAjoutCompteurVisible(false)} disabled={creationEnCours} />
        <SmallButton label={creationEnCours ? 'Ajout…' : 'Ajouter'} filled disabled={!nomEnCours.trim() || creationEnCours} onPress={creerCompteurChoisi} />
      </View>}>
      {COMPTEUR_TYPES.map((n) => {
        const p = pictoCompteur(n);
        const on = !modeNomLibre && nomCompteurChoisi === n;
        return (
          <TouchableOpacity key={n} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[st.sheetRow, on && st.sheetRowOn]} onPress={() => { setNomCompteurChoisi(n); setModeNomLibre(false); setNomCompteurLibre(''); }}>
            <Picto name={p.name} size={22} />
            <Text style={[st.sheetRowText, { flex: 1 }]}>{n}</Text>
            {on ? <CvcIcon name="check" size={18} color={COLORS.orangeDark} strokeWidth={2.4} /> : null}
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity accessibilityRole="radio" accessibilityState={{ checked: modeNomLibre }} style={[st.sheetRow, modeNomLibre && st.sheetRowOn]} onPress={() => { setModeNomLibre(true); setNomCompteurChoisi(''); }}>
        <CvcIcon name="plus" size={20} color={COLORS.inkSoft} strokeWidth={2.2} />
        <Text style={[st.sheetRowText, { flex: 1 }]}>Autre / nom personnalisé</Text>
      </TouchableOpacity>
      {modeNomLibre ? <TextInput style={[styles.input, { marginTop: 8 }]} value={nomCompteurLibre} onChangeText={setNomCompteurLibre} placeholder="Ex. Compteur primaire RCU bâtiment A" placeholderTextColor={COLORS.inkFaint} autoFocus /> : null}
      {nomEnCours.trim() ? <View style={{ marginTop: 12 }}>
        <Text style={st.sheetLabel}>Ligne du rapport</Text>
        <View style={st.chips}>
          {optionsDestination.map((o) => {
            const actif = (destinationChoisie || destinationDepuisLibelle(nomEnCours, '', champsSectionCompteurs)) === o.cle;
            return <TouchableOpacity key={o.cle} accessibilityRole="button" accessibilityState={{ selected: actif }} onPress={() => setDestinationChoisie(o.cle)} style={[st.chip, actif && st.chipOn]}>
              <Text style={[st.chipText, actif && st.chipTextOn]}>{o.label}</Text>
            </TouchableOpacity>;
          })}
        </View>
      </View> : null}
    </BottomSheet>
  </>;
}

const st = StyleSheet.create({
  hint: { fontSize: 12.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, paddingVertical: 8 },
  cpt: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line, paddingVertical: 8 },
  cptLine1: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cptName: { fontSize: 14.5, fontFamily: FONTS.bold, color: COLORS.ink },
  cptSub: { fontSize: 11.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, marginTop: 1 },
  cptLine2: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  cptInput: {
    flex: 1, minWidth: 0, height: 46, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white,
    paddingHorizontal: 12, fontSize: 20, fontFamily: FONTS.black, color: COLORS.ink,
  },
  cptClear: { width: 44, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.line + '55' },
  cptUndo: { backgroundColor: COLORS.orangeLight },
  cptInputWarn: { borderColor: KIT.amber, backgroundColor: KIT.amberBg },
  cptInputErr: { borderColor: KIT.red, backgroundColor: KIT.redBg },
  cptMsg: { fontSize: 11.5, fontFamily: FONTS.bodyMedium, marginTop: 5 },
  groupe: { marginBottom: 4 },
  controle: { marginTop: 4 },
  delta: { fontSize: 11.5, fontFamily: FONTS.bodyBold, color: COLORS.orangeDark, backgroundColor: COLORS.orangeLight, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  addTemp: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: 8, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.orange + '66' },
  addTempText: { fontSize: 12.5, fontFamily: FONTS.bodyBold, color: COLORS.orangeDark },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: 'transparent' },
  sheetRowOn: { borderColor: COLORS.orange + '66', backgroundColor: COLORS.orangeLight },
  sheetRowText: { fontSize: 14, fontFamily: FONTS.bodySemi, color: COLORS.ink },
  sheetLabel: { fontSize: 12, fontFamily: FONTS.bodyBold, color: COLORS.inkSoft, marginBottom: 6 },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingVertical: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(22,21,15,0.12)', backgroundColor: COLORS.white },
  chipOn: { backgroundColor: COLORS.orange, borderColor: COLORS.orange },
  chipText: { fontSize: 12.5, fontFamily: FONTS.bodySemi, color: COLORS.ink },
  chipTextOn: { color: COLORS.white, fontFamily: FONTS.bodyBold },
});
