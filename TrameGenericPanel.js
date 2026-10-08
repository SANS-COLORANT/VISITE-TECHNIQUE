/** Panneau de saisie générique virtualisé piloté par la définition de la trame. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, SectionList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getChampsVisite, getControlesVisite, getVisite, upsertChamp } from './db.js';
import { DurableChampGenerique } from './DurableChampGenerique.js';
import { PersistentControleGenerique } from './PersistentControleGenerique.js';
import { VmcControleGenerique } from './VmcControleGenerique.js';
import { PresetControleGenerique } from './PresetControleGenerique.js';
import { PreAllumagePlanCard } from './PreAllumagePlanCard.js';
import { COLORS, FONTS, styles } from './styles.js';
import { enregistrerAliasPreAllumage, fieldAliasKey, libelleChamp, listerAliasesPreAllumage, sectionAliasDescriptor } from './preAllumageAliases.js';
import { PreAllumageModularPanel } from './PreAllumageModularPanel.js';
import { PreAllumageInfoPanelBusiness } from './PreAllumageInfoPanelBusiness.js';
import { PreAllumageInstallationPanelBusiness } from './PreAllumageInstallationPanelBusiness.js';
import { PreAllumageConclusionPanel } from './PreAllumageConclusionPanel.js';
import { BoundedLruMap } from './boundedCache.js';
import { getNavigationScrollOffset, hydrateNavigationState, setNavigationScrollOffset } from './navigationMemory.js';
import { upsertControlePartiel } from './controlDb.js';
import { feedback } from './fieldFeedback.js';
import { ButtonGlow } from './ButtonGlow.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { BottomSheet, EmptyLine, FilterSeg, KIT, PictoOrb, SectionBanner, SubGroupTitle, useSectionsOuvertes } from './VisitKit.js';
import { groupeDistribution, pictoIncendie, pictoSection, pictoTrame } from './MetraPictos.js';
import { PhotoButton } from './PhotoButton.js';
import { obtenirTrame } from './trameRegistry.js';

const visiteDataCache = new BoundedLruMap(3);

function EditableAlias({ valeur, suffix = '', onSave }) {
  const [texte, setTexte] = useState(valeur || '');
  useEffect(() => { setTexte(valeur || ''); }, [valeur]);
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    <TextInput style={[styles.sectionTitle, { flex: 1, borderBottomWidth: 1, borderBottomColor: '#D0D5DD', paddingVertical: 3 }]} value={texte} onChangeText={setTexte} onBlur={() => onSave(texte)} />
    {suffix ? <Text style={styles.sectionTitle}>{suffix}</Text> : null}
  </View>;
}

function codeSection(panelId, section) {
  return panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
}
function mapperChamps(rows = []) {
  const map = {};
  rows.forEach((row) => { if (row?.section_code && row?.cle) map[`${row.section_code}||${row.cle}`] = row.valeur; });
  return map;
}
function mapperControles(rows = []) {
  const map = {};
  rows.forEach((row) => { if (row?.section_code && row?.cle) map[`${row.section_code}||${row.cle}`] = row; });
  return map;
}
async function chargerDonneesVisite(visiteId, force = false) {
  const existant = visiteDataCache.get(visiteId);
  if (!force && existant?.data) return existant.data;
  if (!force && existant?.promise) return existant.promise;
  const promise = Promise.all([getChampsVisite(visiteId), getControlesVisite(visiteId)])
    .then(([champs, controles]) => {
      const data = { champsMap: mapperChamps(champs), controlesMap: mapperControles(controles) };
      visiteDataCache.set(visiteId, { data, promise: null });
      return data;
    })
    .catch((e) => { visiteDataCache.delete(visiteId); throw e; });
  visiteDataCache.set(visiteId, { data: existant?.data || null, promise });
  return promise;
}
export function prechargerDonneesTrameGenerique(visiteId, force = false) { return chargerDonneesVisite(visiteId, force); }
export function invaliderCacheTrameGenerique(visiteId) { visiteDataCache.delete(visiteId); }
export function mettreAJourCacheChamp(visiteId, key, valeur) {
  const courant = visiteDataCache.get(visiteId); if (!courant?.data) return;
  visiteDataCache.set(visiteId, { data: { ...courant.data, champsMap: { ...courant.data.champsMap, [key]: valeur } }, promise: courant.promise || null });
}
export function mettreAJourCacheControle(visiteId, key, patch) {
  const courant = visiteDataCache.get(visiteId); if (!courant?.data) return;
  const ancien = courant.data.controlesMap?.[key] || {};
  visiteDataCache.set(visiteId, { data: { ...courant.data, controlesMap: { ...courant.data.controlesMap, [key]: { ...ancien, ...patch } } }, promise: courant.promise || null });
}

// Refonte des onglets (docs/refonte-visite-661/README.md §4, §5.1, §5.2, §5.5) :
// chaque rubrique est une carte à bannière, TOUT EST FERMÉ au départ
// (useSectionsOuvertes, mémoire par visite + onglet pendant la session) ; un
// filtre « À faire / N.S » ouvre les rubriques concernées. Affichage seulement :
// section_code, clés, compteurs et rapports sont inchangés.
const AVIS_EN_MASSE = ['S', 'S.O', 'N.S', 'N.R', 'N.V'];
const SEUIL_DECOUPAGE = 12;
const FILTRES_PAR_PANNEAU = new Map();

// Découpage d'affichage des grandes catégories (ex. « Lutte contre
// l'incendie ») en sous-groupes selon le préfixe « Extincteurs: … ». Rien ne
// change en base ni dans les rapports : section_code et clés sont identiques.
function decouperSection(section) {
  if (section.data.length < SEUIL_DECOUPAGE) return null;
  const groupes = [];
  for (const item of section.data) {
    const cle = String(item.field.cle || '');
    const i = cle.indexOf(':');
    const prefixe = i > 0 ? cle.slice(0, i).trim() : null;
    const nom = prefixe || 'Autres points';
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.nom === nom) dernier.items.push(item);
    else groupes.push({ nom, items: [item] });
  }
  return groupes.length < 2 ? null : groupes;
}

// Distribution : libellés courts à l'affichage, clés internes inchangées.
const LIBELLES_DISTRIBUTION = {
  'Matériaux tuyauterie': 'Matériaux',
  'Type de distribution': 'Distribution',
  'Equipement sur aller': 'Aller',
  'Equipement sur retour': 'Retour',
  "Type d'émetteur": 'Émetteur',
  'Type de robinetterie': 'Robinetterie',
  'Calorifuge (type / état)': 'Calorifuge',
  'Variation de vitesse': 'Variation de vitesse',
  'Présence mitigeur': 'Mitigeur',
};
// « Idem chauffage » : champs recopiés de la section chauffage vers l'ECS.
const CLES_IDEM_CHAUFFAGE = ['Matériaux tuyauterie', 'Type de distribution', 'Equipement sur aller', 'Equipement sur retour', 'Calorifuge (type / état)'];

// Informations : libellés courts et champs courts posés côte à côte.
const LIBELLES_INFOS = {
  'Energie - pression': 'Énergie · pression',
  'Exploitant - marché': 'Exploitant · marché',
  'Puissance totale installée (kW)': 'Puissance totale',
  'Puissance, volume, nb de plaques...': 'Puissance, volume, nb de plaques',
};
const PAIRES_INFOS = [
  ['Date de visite', 'Heure de visite'],
  ['N° de site', 'Référence du site'],
];
const TITRES_INFOS = { 'Description des principaux équipements': 'Équipements principaux' };
const RE_DATE_VISITE = /date\s*(de\s*)?(la\s*)?visite/i;

function dateAujourdhuiFr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function dateAffichee(valeur) {
  const texte = String(valeur || '').trim();
  const iso = texte.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : texte;
}
function nomTrame(trameId) {
  try { return obtenirTrame(trameId)?.nom || ''; } catch { return ''; }
}

function estVide(valeur) { return String(valeur ?? '').trim() === ''; }

// Bandeau « Visite » en lecture seule (client · site · local · trame · date) à
// la place du bloc « Général » ; les champs restent en base et s'éditent dans
// une feuille (ils sont préremplis à l'ouverture de la visite).
function BandeauVisite({ lignes, trameId, editable, onPress }) {
  const contenu = <>
    <PictoOrb picto={pictoTrame(trameId)} size={34} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={bandeau.titre}>{lignes[0] || 'Visite'}</Text>
      {lignes[1] ? <Text numberOfLines={1} style={bandeau.sous}>{lignes[1]}</Text> : null}
    </View>
    {editable ? <CvcIcon name="edit" size={16} color={COLORS.inkSoft} strokeWidth={2.1} /> : null}
  </>;
  if (!editable) return <View style={bandeau.box}>{contenu}</View>;
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Visite : ${lignes.join(', ')}. Modifier`} onPress={onPress} activeOpacity={0.8} style={bandeau.box}>{contenu}</TouchableOpacity>;
}

function construireLignes(section, mode) {
  const lignes = [];
  if (mode === 'distrib') {
    let groupeCourant = null;
    for (const item of section.data) {
      const groupe = item.field.type === 'champ' ? groupeDistribution(item.field.cle) : null;
      if (groupe && groupe.key !== groupeCourant) {
        const membres = section.data.filter((it) => groupeDistribution(it.field.cle)?.key === groupe.key);
        lignes.push({ kind: 'sub', key: `${section.sectionCode}::g:${groupe.key}`, title: groupe.label, picto: groupe.picto, items: membres });
      }
      groupeCourant = groupe ? groupe.key : groupeCourant;
      lignes.push({ kind: 'item', key: item.key, item, label: LIBELLES_DISTRIBUTION[item.field.cle] || null });
    }
    return lignes;
  }
  if (mode === 'infos') {
    const parCle = new Map(section.data.map((item) => [item.field.cle, item]));
    const pris = new Set();
    for (const item of section.data) {
      if (pris.has(item.key)) continue;
      const paire = PAIRES_INFOS.find((p) => p[0] === item.field.cle || p[1] === item.field.cle);
      const autre = paire ? parCle.get(paire[0] === item.field.cle ? paire[1] : paire[0]) : null;
      if (autre && !pris.has(autre.key)) {
        const items = paire[0] === item.field.cle ? [item, autre] : [autre, item];
        items.forEach((it) => pris.add(it.key));
        lignes.push({ kind: 'pair', key: `${items[0].key}&&${items[1].key}`, items });
      } else {
        pris.add(item.key);
        lignes.push({ kind: 'item', key: item.key, item, label: LIBELLES_INFOS[item.field.cle] || null });
      }
    }
    return lignes;
  }
  const groupes = decouperSection(section);
  if (!groupes) return section.data.map((item) => ({ kind: 'item', key: item.key, item, label: null }));
  groupes.forEach((g, idx) => {
    lignes.push({ kind: 'sub', key: `${section.sectionCode}::${idx}:${g.nom}`, title: g.nom, picto: pictoIncendie(g.nom), items: g.items, masse: true });
    g.items.forEach((item) => {
      const cle = String(item.field.cle || '');
      const i = cle.indexOf(':');
      lignes.push({ kind: 'item', key: item.key, item, label: i > 0 && cle.slice(0, i).trim() === g.nom ? cle.slice(i + 1).trim() : null });
    });
  });
  return lignes;
}

export function TrameGenericPanel(props) {
  if (props.panelId === 'p-pa-infos') return <PreAllumageInfoPanelBusiness {...props} />;
  if (props.panelId === 'p-pa-batiments') return <PreAllumageInstallationPanelBusiness {...props} />;
  if (props.panelId === 'p-pa-conclusion') return <PreAllumageConclusionPanel {...props} />;
  if (props.panelId.startsWith('p-pa-')) return <PreAllumageModularPanel {...props} />;
  return <TrameGenericStaticPanel {...props} />;
}

function TrameGenericStaticPanel({ visiteId, panelId, sections, onSaved, nextPanel = null, onNextPanel = null, trameId = 'icpe_v1', navigationScope = '' }) {
  const cacheInitial = visiteDataCache.get(visiteId)?.data;
  const listRef = useRef(null);
  const navKey = `visit-panel:${String(visiteId || '')}:${String(panelId || '')}${navigationScope ? `:${navigationScope}` : ''}`;
  const [champsMap, setChampsMap] = useState(cacheInitial?.champsMap || {});
  const [controlesMap, setControlesMap] = useState(cacheInitial?.controlesMap || {});
  const [donneesChargees, setDonneesChargees] = useState(Boolean(cacheInitial));
  const [aliases, setAliases] = useState({});
  const patchRef = useRef(null);
  const champRef = useRef(null);
  const handlersRef = useRef({});
  const estPreAllumage = panelId.startsWith('p-pa-');
  const mode = panelId === 'p-distrib' ? 'distrib' : (panelId === 'p-infos' || panelId === 'p-vmc-infos') ? 'infos' : 'conf';
  const scopeOuvertes = `${visiteId}|${panelId}|${navigationScope || ''}`;
  const { isOpen, toggle, open } = useSectionsOuvertes(scopeOuvertes);
  const [filtre, setFiltreState] = useState(() => FILTRES_PAR_PANNEAU.get(scopeOuvertes) || 'all');
  const [visite, setVisite] = useState(null);
  const [ficheVisite, setFicheVisite] = useState(false);

  useEffect(() => {
    let actif = true;
    if (!estPreAllumage) return () => { actif = false; };
    listerAliasesPreAllumage(visiteId).then((r) => { if (actif) setAliases(r); }).catch((e) => console.warn('Noms personnalisés non chargés', e));
    return () => { actif = false; };
  }, [visiteId, estPreAllumage]);

  useEffect(() => {
    let actif = true;
    const cache = visiteDataCache.get(visiteId)?.data;
    if (cache) { setChampsMap(cache.champsMap); setControlesMap(cache.controlesMap); setDonneesChargees(true); return () => { actif = false; }; }
    chargerDonneesVisite(visiteId).then((data) => { if (actif) { setChampsMap(data.champsMap); setControlesMap(data.controlesMap); setDonneesChargees(true); } });
    return () => { actif = false; };
  }, [visiteId]);

  useEffect(() => {
    if (mode !== 'infos') return undefined;
    let actif = true;
    getVisite(visiteId).then((v) => { if (actif) setVisite(v || null); }).catch(() => {});
    return () => { actif = false; };
  }, [visiteId, mode]);

  const listeSections = useMemo(() => {
    if (!sections) return [];
    return Object.entries(sections).map(([sub, fields]) => {
      const sectionCode = codeSection(panelId, sub);
      return { title: sub, sectionCode, data: (fields || []).filter((field) => field?.hiddenInApp !== true).map((field) => ({ field, sectionCode, key: `${sectionCode}||${field.cle}` })) };
    }).filter((section) => section.data.length > 0);
  }, [panelId, sections]);

  // Rubriques affichées : en Informations, « Général » devient le bandeau.
  const sectionGenerale = mode === 'infos' ? listeSections.find((sec) => sec.title === 'Général') || null : null;
  const structure = useMemo(() => listeSections
    .filter((sec) => !(mode === 'infos' && sec.title === 'Général'))
    .map((sec) => {
      const picto = pictoSection(sec.title, panelId);
      return { ...sec, picto: picto.name, water: picto.water, lignes: estPreAllumage ? sec.data.map((item) => ({ kind: 'item', key: item.key, item, label: null })) : construireLignes(sec, mode) };
    }), [listeSections, mode, panelId, estPreAllumage]);

  // La date de visite se renseignait seule à l'affichage du champ ; les
  // rubriques étant fermées au départ, on la pose ici (même valeur, même clé).
  const dateFaiteRef = useRef(false);
  useEffect(() => {
    if (mode !== 'infos' || !donneesChargees || dateFaiteRef.current) return;
    dateFaiteRef.current = true;
    const aujourdHui = dateAujourdhuiFr();
    const cibles = listeSections
      .filter((sec) => sec.title === 'Général' || /informations_g_n_rales$/.test(sec.sectionCode))
      .flatMap((sec) => sec.data)
      .filter((item) => item.field.type === 'champ' && RE_DATE_VISITE.test(String(item.field.cle || '')) && estVide(champsMap[item.key]));
    cibles.forEach((item) => {
      upsertChamp(visiteId, item.sectionCode, item.field.cle, aujourdHui)
        .then(() => champRef.current?.(item.key, aujourdHui))
        .catch(() => {});
    });
  }, [mode, donneesChargees, listeSections, champsMap, visiteId]);

  // Parcours terrain (une seule rubrique dans une fenêtre) : ouverte d'emblée.
  useEffect(() => {
    if (navigationScope) open(listeSections.map((sec) => sec.sectionCode));
  }, [navigationScope, listeSections, open]);

  const basculerRepli = useCallback((key) => toggle(key), [toggle]);

  useEffect(() => {
    let alive = true;
    hydrateNavigationState(navKey).then((state) => {
      if (!alive) return;
      const offset = Number(state?.scrollY || 0);
      if (offset) setTimeout(() => listRef.current?.scrollToOffset?.({ offset, animated: false }), 50);
    }).catch(() => {});
    return () => { alive = false; };
  }, [navKey]);

  useEffect(() => {
    const offset = getNavigationScrollOffset(navKey);
    if (!offset || !listeSections.length) return undefined;
    const timer = setTimeout(() => listRef.current?.scrollToOffset?.({ offset, animated: false }), 50);
    return () => clearTimeout(timer);
  }, [navKey, listeSections.length]);

  if (!sections) return null;
  const patchControle = (key, patch) => {
    setControlesMap((courant) => ({ ...courant, [key]: { ...(courant[key] || {}), ...patch } }));
    mettreAJourCacheControle(visiteId, key, patch);
  };
  // Rappels stables par ligne : les cartes (mémoïsées) ne se redessinent plus
  // toutes à chaque saisie, seule la ligne modifiée change.
  patchRef.current = patchControle;
  champRef.current = (key, valeur) => { setChampsMap((courant) => ({ ...courant, [key]: valeur })); mettreAJourCacheChamp(visiteId, key, valeur); onSaved?.(); };
  const etatHandler = (key) => handlersRef.current[`e:${key}`] || (handlersRef.current[`e:${key}`] = (patch) => patchRef.current?.(key, patch));
  const champHandler = (key) => handlersRef.current[`c:${key}`] || (handlersRef.current[`c:${key}`] = (valeur) => champRef.current?.(key, valeur));

  const estControle = (item) => item.field.type !== 'champ';
  const avisDe = (item) => String(controlesMap[item.key]?.avis ?? '').trim();

  // Avis en masse sur les contrôles encore sans avis (« Tout en S » ; appui
  // long : S.O, N.S, N.R, N.V), annulable depuis le toast.
  const avisEnMasse = async (items, avis) => {
    const cibles = items.filter((item) => item.field.type !== 'champ' && !String(controlesMap[item.key]?.avis ?? '').trim());
    if (!cibles.length) return;
    try {
      for (const item of cibles) {
        const commentaire = item.field.presets?.[avis]?.[0]?.commentaire || '';
        await upsertControlePartiel(visiteId, item.sectionCode, item.field.cle, { avis, commentaire });
        patchControle(item.key, { avis, commentaire });
      }
      onSaved?.();
      const n = cibles.length;
      feedback(`${n} contrôle${n > 1 ? 's' : ''} passé${n > 1 ? 's' : ''} en ${avis}${avis === 'N.S' ? ' · anomalies à préciser' : ''}`, {
        action: { label: 'Annuler', onPress: async () => {
          for (const item of cibles) {
            await upsertControlePartiel(visiteId, item.sectionCode, item.field.cle, { avis: null, commentaire: '' });
            patchControle(item.key, { avis: null, commentaire: '' });
          }
          onSaved?.();
        } },
      });
    } catch (e) { console.warn('Avis en masse impossible', e); }
  };
  const toutEnS = (items) => avisEnMasse(items, 'S');
  const menuAvisEnMasse = (items, titre) => {
    const n = items.filter((item) => item.field.type !== 'champ' && !String(controlesMap[item.key]?.avis ?? '').trim()).length;
    Alert.alert(`${titre}`, `${n} contrôle${n > 1 ? 's' : ''} sans avis. Tout passer en :`, [
      ...AVIS_EN_MASSE.map((avis) => ({ text: `Tout en ${avis}`, onPress: () => avisEnMasse(items, avis) })),
      { text: 'Annuler', style: 'cancel' },
    ]);
  };
  const compter = (items) => {
    let faits = 0; let sansAvis = 0; let ns = 0;
    for (const item of items) {
      if (item.field.type === 'champ') { if (String(champsMap[item.key] ?? '').trim() !== '') faits += 1; }
      else if (String(controlesMap[item.key]?.avis ?? '').trim() !== '') { faits += 1; if (avisDe(item) === 'N.S') ns += 1; }
      else sansAvis += 1;
    }
    return { faits, sansAvis, ns, total: items.length };
  };
  const boutonMasse = (items, titre, sansAvis, petit = false) => sansAvis > 1 ? <TouchableOpacity
    accessibilityRole="button"
    accessibilityLabel={`Passer ${sansAvis} contrôles en S`}
    accessibilityHint="Appui long : choisir S.O, N.S, N.R ou N.V"
    onPress={() => toutEnS(items)}
    onLongPress={() => menuAvisEnMasse(items, titre)}
    delayLongPress={350}
    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
    style={[carte.masse, petit && carte.massePetit]}
  ><Text style={[carte.masseTexte, petit && { fontSize: 11 }]}>Tout en S</Text></TouchableOpacity> : null;

  // Filtre « À faire / N.S / Tout » (contrôles) : un filtre actif masque les
  // lignes hors filtre et ouvre les rubriques concernées.
  const aDesControles = !estPreAllumage && listeSections.some((sec) => sec.data.some(estControle));
  const filtreActif = aDesControles ? filtre : 'all';
  const visibleSelonFiltre = (item, f = filtreActif) => {
    if (f === 'all') return true;
    if (!estControle(item)) return f === 'todo' && estVide(champsMap[item.key]);
    return f === 'todo' ? avisDe(item) === '' : avisDe(item) === 'N.S';
  };
  const changerFiltre = (f) => {
    FILTRES_PAR_PANNEAU.set(scopeOuvertes, f);
    setFiltreState(f);
    if (f !== 'all') open(structure.filter((sec) => sec.data.some((item) => visibleSelonFiltre(item, f))).map((sec) => sec.sectionCode));
  };

  // « Idem chauffage » (Distribution ECS) : recopie via le même enregistrement
  // que les champs ; « Annuler » rétablit les valeurs ECS précédentes.
  const sectionChauffage = mode === 'distrib' ? listeSections.find((sec) => /chauffage/i.test(sec.title)) : null;
  const idemChauffage = async (sectionEcs) => {
    if (!sectionChauffage) return;
    const copies = CLES_IDEM_CHAUFFAGE.map((cle) => {
      const source = `${sectionChauffage.sectionCode}||${cle}`;
      const cible = sectionEcs.data.find((item) => item.field.cle === cle);
      const valeur = String(champsMap[source] ?? '').trim();
      return cible && valeur ? { item: cible, valeur, avant: champsMap[cible.key] ?? '' } : null;
    }).filter(Boolean).filter((c) => String(c.avant).trim() !== c.valeur);
    if (!copies.length) { feedback('Rien à recopier depuis le chauffage', { tone: 'neutral', haptic: false }); return; }
    const ecrire = async (liste, champ) => {
      for (const c of liste) {
        await upsertChamp(visiteId, c.item.sectionCode, c.item.field.cle, c[champ]);
        champRef.current?.(c.item.key, c[champ]);
      }
    };
    try {
      await ecrire(copies, 'valeur');
      open([sectionEcs.sectionCode]);
      feedback(`${copies.length} valeur${copies.length > 1 ? 's' : ''} reprise${copies.length > 1 ? 's' : ''} du chauffage`, {
        action: { label: 'Annuler', onPress: () => { ecrire(copies, 'avant').catch((e) => console.warn('Annulation impossible', e)); } },
      });
    } catch (e) { console.warn('Recopie impossible', e); }
  };

  const visibles = structure.map((sec) => {
    const stats = compter(sec.data);
    const correspondances = filtreActif === 'all' ? sec.data.length : sec.data.filter((item) => visibleSelonFiltre(item)).length;
    const ouverte = isOpen(sec.sectionCode);
    const lignes = !ouverte ? [] : sec.lignes.filter((ligne) => {
      if (filtreActif === 'all') return true;
      if (ligne.kind === 'item') return visibleSelonFiltre(ligne.item);
      return ligne.items.some((item) => visibleSelonFiltre(item));
    });
    return { ...sec, key: sec.sectionCode, allData: sec.data, data: lignes, ouverte, stats, correspondances };
  }).filter((sec) => filtreActif === 'all' || sec.correspondances > 0);

  const restants = listeSections.reduce((n, section) => n + section.data.filter((item) => item.field.type === 'champ'
    ? String(champsMap[item.key] ?? '').trim() === ''
    : String(controlesMap[item.key]?.avis ?? '').trim() === '').length, 0);
  const sauverAlias = (key, valeur, defaut) => {
    setAliases((courant) => ({ ...courant, [key]: valeur }));
    enregistrerAliasPreAllumage(visiteId, key, valeur, defaut).catch((e) => console.warn('Nom personnalisé non enregistré', e));
  };

  const rendreChampOuControle = (item, label) => {
    if (item.field.type === 'champ') {
      return <DurableChampGenerique
        visiteId={visiteId}
        sectionCode={item.sectionCode}
        field={item.field}
        valeurInitiale={champsMap[item.key]}
        displayLabel={estPreAllumage ? libelleChamp(item.sectionCode, item.field.cle, aliases) : (label || undefined)}
        onRename={item.field.renamable ? (v) => sauverAlias(fieldAliasKey(item.sectionCode, item.field.cle), v, item.field.cle) : null}
        onSaved={champHandler(item.key)}
        choix={mode === 'distrib' || mode === 'infos'}
        compact={mode === 'infos'}
        water={mode === 'distrib' && /ecs/i.test(item.sectionCode)}
        photo={mode !== 'distrib' && mode !== 'infos'}
      />;
    }
    if (item.field.vmc === true) return <VmcControleGenerique visiteId={visiteId} sectionCode={item.sectionCode} field={item.field} etatInitial={controlesMap[item.key]} onEtatChange={etatHandler(item.key)} onSaved={onSaved} />;
    if (item.field.presets) return <PresetControleGenerique visiteId={visiteId} sectionCode={item.sectionCode} field={item.field} etatInitial={controlesMap[item.key]} onEtatChange={etatHandler(item.key)} onSaved={onSaved} displayLabel={label || undefined} />;
    return <PersistentControleGenerique visiteId={visiteId} sectionCode={item.sectionCode} field={item.field} etatInitial={controlesMap[item.key]} onEtatChange={etatHandler(item.key)} onSaved={onSaved} trameId={trameId} displayLabel={label || undefined} />;
  };

  const actionsBanniere = (section) => {
    const parties = [];
    const masse = boutonMasse(section.allData, section.title, section.stats.sansAvis);
    if (masse) parties.push(<View key="masse">{masse}</View>);
    if (mode === 'distrib') {
      if (section.water && sectionChauffage && sectionChauffage.sectionCode !== section.sectionCode) {
        parties.push(<TouchableOpacity key="idem" accessibilityRole="button" accessibilityLabel="Reprendre les valeurs du chauffage" onPress={() => idemChauffage(section)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} style={[carte.masse, { borderColor: KIT.water + '66', backgroundColor: KIT.waterLight }]}>
          <Text style={[carte.masseTexte, { color: '#0B6372' }]}>Idem chauffage</Text>
        </TouchableOpacity>);
      }
      // Un seul accès photo par rubrique (remplace un bouton par champ).
      parties.push(<PhotoButton key="photo" visiteId={visiteId} entiteKey={`${section.sectionCode}||${section.title}`} label={section.title} style={carte.photo} />);
    }
    return parties.length ? <View style={carte.actions}>{parties}</View> : null;
  };

  const lignesBandeau = (() => {
    if (mode !== 'infos') return [];
    const general = sectionGenerale?.sectionCode;
    const champ = (code, cle) => (code ? String(champsMap[`${code}||${cle}`] ?? '').trim() : '');
    const infos = listeSections.find((sec) => /informations_g_n_rales$/.test(sec.sectionCode))?.sectionCode;
    const client = champ(general, 'Nom du client') || visite?.nom_client || '';
    const site = champ(general, 'Nom du site') || visite?.nom_site || '';
    const local = champ(general, 'Nom du local') || visite?.nom_installation || '';
    const trame = champ(general, 'Trame utilisée') || nomTrame(trameId);
    const date = champ(general, 'Date de la visite') || champ(infos, 'Date de visite') || dateAffichee(visite?.date_visite);
    return [[client, site, local].filter(Boolean).join(' · '), [trame, date].filter(Boolean).join(' · ')];
  })();

  const enTeteListe = panelId === 'p-pa-batiments' ? <PreAllumagePlanCard visiteId={visiteId} onSaved={onSaved} /> : <>
    {mode === 'infos' ? <BandeauVisite lignes={lignesBandeau} trameId={trameId} editable={Boolean(sectionGenerale)} onPress={() => setFicheVisite(true)} /> : null}
    {aDesControles ? (() => {
      let aFaire = 0; let ns = 0;
      for (const sec of listeSections) for (const item of sec.data) {
        if (!estControle(item)) continue;
        const avis = avisDe(item);
        if (!avis) aFaire += 1; else if (avis === 'N.S') ns += 1;
      }
      return <FilterSeg value={filtreActif} onChange={changerFiltre} options={[
        { key: 'todo', label: 'À faire', count: aFaire },
        { key: 'ns', label: 'N.S', count: ns, danger: true },
        { key: 'all', label: 'Tout' },
      ]} />;
    })() : null}
  </>;

  return <>
    <SectionList
      ref={listRef}
      sections={visibles}
      extraData={{ champsMap, controlesMap, filtreActif }}
      onScroll={(event) => setNavigationScrollOffset(navKey, event.nativeEvent.contentOffset.y)}
      scrollEventThrottle={100}
      keyExtractor={(ligne) => ligne.key}
      ListHeaderComponent={enTeteListe}
      ListEmptyComponent={filtreActif !== 'all' ? <EmptyLine text={filtreActif === 'ns' ? 'Aucun contrôle N.S dans cet onglet' : 'Tout est renseigné dans cet onglet'} /> : null}
      renderSectionHeader={({ section }) => {
        if (estPreAllumage) {
          const d = sectionAliasDescriptor(panelId, section.title);
          return <EditableAlias valeur={aliases[d.key] || d.base} suffix={d.suffix} onSave={(v) => sauverAlias(d.key, v, d.base)} />;
        }
        const { faits, ns, total } = section.stats;
        return <View style={[carte.haut, !section.ouverte && carte.fermee]}>
          <SectionBanner
            picto={section.picto}
            water={section.water}
            title={mode === 'distrib' ? section.title.replace(/^Distribution\s+/i, '').replace(/^ecs$/i, 'ECS').replace(/^./, (c) => c.toUpperCase()) : (TITRES_INFOS[section.title] || section.title)}
            open={section.ouverte}
            onToggle={() => basculerRepli(section.sectionCode)}
            done={faits}
            total={total}
            alert={ns || null}
            right={actionsBanniere(section)}
          />
        </View>;
      }}
      renderSectionFooter={({ section }) => (!estPreAllumage && section.ouverte ? <View style={carte.bas} /> : null)}
      renderItem={({ item: ligne, index }) => {
        if (estPreAllumage) {
          const item = ligne.item;
          return <View style={item.field.type === 'champ' ? [styles.fieldGroupItem, styles.fieldGroupFirst, styles.fieldGroupLast] : styles.formCard}>{rendreChampOuControle(item, null)}</View>;
        }
        if (ligne.kind === 'sub') {
          const { faits, sansAvis, total } = compter(ligne.items);
          return <View style={carte.ligne}>
            <SubGroupTitle picto={ligne.picto} title={ligne.title} right={<View style={carte.actions}>
              {ligne.masse ? boutonMasse(ligne.items, ligne.title, sansAvis, true) : null}
              <Text style={[carte.sousCompte, faits >= total && { color: KIT.green }]}>{faits}/{total}</Text>
            </View>} />
          </View>;
        }
        if (ligne.kind === 'pair') {
          return <View style={carte.ligne}>
            <View style={carte.paire}>
              {ligne.items.map((item) => <View key={item.key} style={{ flex: 1, minWidth: 0 }}>{rendreChampOuControle(item, LIBELLES_INFOS[item.field.cle] || null)}</View>)}
            </View>
          </View>;
        }
        const item = ligne.item;
        return <View style={carte.ligne}>
          <View style={[index > 0 && mode === 'conf' && carte.separateur, item.field.type === 'champ' && mode === 'conf' && { paddingTop: 10 }]}>
            {rendreChampOuControle(item, ligne.label)}
          </View>
        </View>;
      }}
      ListFooterComponent={nextPanel && onNextPanel ? <View style={styles.nextTabCard}>
        <Text style={styles.nextTabHint}>{restants ? `${restants} élément${restants > 1 ? 's' : ''} encore à renseigner dans cet onglet` : 'Onglet complet'}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => onNextPanel(nextPanel.id)} activeOpacity={0.85} style={[styles.btnPrimary, { flex: 0, flexDirection: 'row', gap: 8 }]}>
          <ButtonGlow /><Text style={styles.btnPrimaryText}>{nextPanel.label}</Text><CvcIcon name="chevron-right" size={18} color="#FFFFFF" strokeWidth={2.4} />
        </TouchableOpacity>
      </View> : null}
      contentContainerStyle={styles.panelContent}
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled={false}
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      windowSize={5}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews={false}
    />
    {sectionGenerale ? <BottomSheet visible={ficheVisite} onClose={() => setFicheVisite(false)} title="Visite" subtitle="Informations reprises dans le rapport" picto={pictoTrame(trameId)}>
      {ficheVisite ? sectionGenerale.data.map((item) => <DurableChampGenerique key={item.key} visiteId={visiteId} sectionCode={item.sectionCode} field={item.field} valeurInitiale={champsMap[item.key]} onSaved={champHandler(item.key)} photo={false} />) : null}
    </BottomSheet> : null}
  </>;
}

// Carte opaque découpée pour la liste virtualisée : bannière (haut), lignes
// (côtés), pied (bas). Pas d'elevation : surfaces opaques #FDFCFA.
const carte = StyleSheet.create({
  haut: { backgroundColor: KIT.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderBottomWidth: 0, borderColor: KIT.border },
  fermee: { borderBottomWidth: 1, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, marginBottom: 10 },
  ligne: { backgroundColor: KIT.card, borderLeftWidth: 1, borderRightWidth: 1, borderColor: KIT.border, paddingHorizontal: 12 },
  separateur: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line },
  bas: { height: 10, backgroundColor: KIT.card, borderWidth: 1, borderTopWidth: 0, borderColor: KIT.border, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, marginBottom: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  masse: { borderWidth: 1, borderColor: 'rgba(46,157,91,0.45)', backgroundColor: KIT.greenBg, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  massePetit: { paddingHorizontal: 8, paddingVertical: 3 },
  masseTexte: { fontSize: 11.5, fontFamily: FONTS.bodyBold, color: '#227A4A' },
  sousCompte: { fontSize: 11, fontFamily: FONTS.semi, color: COLORS.inkFaint, minWidth: 30, textAlign: 'right' },
  photo: { width: 34, minWidth: 34, height: 34, minHeight: 34, paddingHorizontal: 0, paddingVertical: 0, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  paire: { flexDirection: 'row', gap: 10, paddingTop: 4 },
});

const bandeau = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, borderRadius: 16, borderWidth: 1, borderColor: KIT.border, backgroundColor: KIT.card },
  titre: { fontSize: 13.5, fontFamily: FONTS.bold, color: COLORS.ink },
  sous: { fontSize: 11.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, marginTop: 2 },
});
