/**
 * Pré-allumage — espace terrain organisé par installation physique.
 * La structure Excel reste intacte ; l'interface regroupe les données dans
 * l'ordre réel de visite et optimise la saisie tablette.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, SectionList, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { getChampsVisite, getControlesVisite } from './db.js';
import { PreAllumageCompactField } from './PreAllumageCompactField.js';
import { PreAllumageCompactControl } from './PreAllumageCompactControl.js';
import { PhotoButton } from './PhotoButton.js';
import {
  PREALLUMAGE_TYPES_LOCAUX,
  ajouterLocalPreAllumage,
  chargerPreAllumageModulaire,
  renommerLocalPreAllumage,
  supprimerLocalPreAllumage,
} from './preAllumageModularDb.js';
import {
  copierReglagesPreAllumage,
  deplacerLocalPreAllumage,
  dupliquerLocalPreAllumage,
  mettreAJourConfigurationLocalPreAllumage,
} from './preAllumageErgonomyDb.js';
import { COLORS, styles } from './styles.js';

const VIRTUAL_CHAUFFERIE = '__pa_chaufferie__';
const VIRTUAL_SITE = '__pa_site__';
const VIRTUAL_PREFIX = '__pa_orphelin__:';
const PANEL_ORDER = {
  'p-pa-batiments': 10,
  'p-pa-compteurs': 20,
  'p-pa-regulation': 30,
  'p-pa-chaufferie': 40,
  'p-pa-sst': 40,
};
const A_COMPLETER = 'À compléter';

function mapChamps(rows) {
  return Object.fromEntries((rows || []).map((r) => [`${r.section_code}||${r.cle}`, r.valeur]));
}
function mapControles(rows) {
  return Object.fromEntries((rows || []).map((r) => [`${r.section_code}||${r.cle}`, r]));
}
function normaliserRecherche(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
function baseNomRubrique(nom) {
  return String(nom || '').split(' — ')[0].trim();
}
function typeLabel(local) {
  if (local?.type_code === 'chaufferie') return 'Chaufferie';
  if (local?.type_code === 'sous_station') return 'Sous-station';
  if (local?.type_code === 'site') return 'Site';
  return 'Installation';
}
function titreRubrique(rubrique, local) {
  if (rubrique.panel_id === 'p-pa-batiments') return 'Informations';
  if (rubrique.panel_id === 'p-pa-compteurs') return /g[ée]n[ée]raux/i.test(rubrique.nom) ? 'Compteurs généraux' : 'Compteurs';
  if (rubrique.panel_id === 'p-pa-regulation') return 'Régulation & températures';
  if (rubrique.panel_id === 'p-pa-chaufferie') return String(rubrique.nom || '').replace(/^Chaufferie\s*[—-]?\s*/i, '') || 'Essais chaufferie';
  if (rubrique.panel_id === 'p-pa-sst') {
    if (/ECS|traitement d.?eau/i.test(rubrique.nom)) return 'ECS / traitement d’eau';
    if (/chauffage/i.test(rubrique.nom)) return 'Contrôles chauffage';
  }
  const nom = String(rubrique.nom || 'Contrôles');
  if (local?.nom && nom.startsWith(`${local.nom} —`)) return nom.slice(local.nom.length + 2).trim();
  return nom;
}
function valeurComplete(v) {
  const t = String(v ?? '').trim();
  return Boolean(t && t !== A_COMPLETER);
}
function statsRubriques(rubriques, champsMap, controlesMap) {
  let total = 0;
  let faits = 0;
  let ns = 0;
  let aCompleter = 0;
  (rubriques || []).forEach((r) => (r.champs || []).forEach((c) => {
    total += 1;
    const key = `${r.section_code}||${c.field.cle}`;
    if (c.field.type === 'controle') {
      const avis = controlesMap[key]?.avis;
      if (avis) faits += 1;
      if (avis === 'N.S') ns += 1;
    } else {
      const valeur = champsMap[key];
      if (String(valeur ?? '').trim() === A_COMPLETER) aCompleter += 1;
      else if (valeurComplete(valeur)) faits += 1;
    }
  }));
  return {
    total,
    faits,
    ns,
    aCompleter,
    manquants: Math.max(0, total - faits - aCompleter),
    pct: total ? Math.round((faits / total) * 100) : 0,
  };
}
function fieldTexte(c) {
  return `${c?.libelle || ''} ${c?.field?.cle || ''}`;
}
function estEcs(texte) { return /\bECS\b|primaire ECS|traitement d.?eau|bouclage/i.test(String(texte || '')); }
function estChauffage(texte) { return /chauffage|courbe de chauffe|non chauffe|réduit de jour|horaires|température extérieure/i.test(String(texte || '')); }
function filtrerRubriqueSelonConfig(r, local) {
  if (!local || local.virtual || local.type_code === 'chaufferie' || local.type_code === 'site') return r;
  const chauffage = Number(local.chauffage) !== 0;
  const ecs = Number(local.ecs) !== 0;
  if (r.panel_id === 'p-pa-sst') {
    if (!ecs && estEcs(r.nom)) return null;
    if (!chauffage && /chauffage/i.test(r.nom)) return null;
  }
  const champs = (r.champs || []).filter((c) => {
    const texte = fieldTexte(c);
    if (!ecs && estEcs(texte)) return false;
    if (!chauffage && r.panel_id === 'p-pa-regulation' && estChauffage(texte) && !estEcs(texte)) return false;
    return true;
  });
  return { ...r, champs };
}
function nombre(v) {
  const t = String(v ?? '').trim();
  if (!t || ['N.R', 'N.A', A_COMPLETER, 'À l’arrêt'].includes(t)) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function analyserCoherence(rubriques, champsMap) {
  const values = [];
  (rubriques || []).forEach((r) => (r.champs || []).forEach((c) => {
    if (c.field.type !== 'champ') return;
    const key = `${r.section_code}||${c.field.cle}`;
    values.push({ label: `${c.libelle || ''} ${c.field.cle || ''}`, valeur: champsMap[key] });
  }));
  const trouver = (regex) => values.find((v) => regex.test(v.label));
  const warnings = [];
  const verifierPair = (titre, depRx, retRx) => {
    const dep = trouver(depRx); const ret = trouver(retRx);
    const a = nombre(dep?.valeur); const b = nombre(ret?.valeur);
    if (a !== null && b !== null && b > a) warnings.push(`${titre} : retour (${b} °C) supérieur au départ (${a} °C).`);
  };
  verifierPair('Chauffage', /Départ chauffage/i, /Retour chauffage/i);
  verifierPair('ECS', /Départ ECS/i, /Retour ECS/i);
  verifierPair('Primaire ECS', /Arrivée primaire ECS/i, /Retour primaire ECS/i);
  values.forEach((v) => {
    if (!/(température|départ|retour|primaire).*°C/i.test(v.label)) return;
    const n = nombre(v.valeur);
    if (n !== null && (n < -30 || n > 120)) warnings.push(`${String(v.label).split('(')[0].trim()} : ${n} °C paraît inhabituel.`);
  });
  return [...new Set(warnings)].slice(0, 4);
}
function rubriqueCorrespondRecherche(r, q) {
  if (!q) return false;
  const texte = normaliserRecherche(`${r.nom} ${(r.champs || []).map((c) => `${c.libelle} ${c.field?.cle}`).join(' ')}`);
  return texte.includes(q);
}

function PetitBouton({ label, onPress, primary = false, danger = false, disabled = false }) {
  const backgroundColor = danger ? COLORS.redBg : primary ? COLORS.orange : COLORS.white;
  const borderColor = danger ? COLORS.red : primary ? COLORS.orange : COLORS.line;
  const color = danger ? COLORS.red : primary ? COLORS.white : COLORS.inkSoft;
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={{ minHeight: 38, justifyContent: 'center', borderWidth: 1, borderColor, backgroundColor, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, opacity: disabled ? 0.45 : 1 }}>
    <Text style={{ color, fontWeight: '800', fontSize: 12 }}>{label}</Text>
  </TouchableOpacity>;
}
function Toggle({ label, value, onPress }) {
  return <TouchableOpacity onPress={onPress} style={{ flex: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: value ? COLORS.orange : COLORS.line, backgroundColor: value ? COLORS.orangeLight : COLORS.white }}><Text style={{ textAlign: 'center', color: value ? COLORS.orangeDark : COLORS.inkSoft, fontWeight: '800' }}>{value ? '✓ ' : ''}{label}</Text></TouchableOpacity>;
}

function AjouterInstallationModal({ visible, onClose, onSubmit }) {
  const [nom, setNom] = useState('');
  const [typeCode, setTypeCode] = useState('sous_station');
  const [chauffage, setChauffage] = useState(true);
  const [ecs, setEcs] = useState(true);
  useEffect(() => { if (visible) { setNom(''); setTypeCode('sous_station'); setChauffage(true); setEcs(true); } }, [visible]);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalOverlay}><View style={styles.modalSheet}>
      <Text style={styles.modalTitle}>Ajouter une installation</Text>
      <Text style={[styles.importHint, { marginBottom: 12 }]}>Ajoute le local dans l’ordre réel de la visite. Les blocs non applicables seront masqués.</Text>
      <TextInput style={styles.input} value={nom} onChangeText={setNom} placeholder="Ex. SST 11 — Entrée 82" autoFocus />
      <Text style={{ fontWeight: '800', color: COLORS.ink, marginTop: 14, marginBottom: 7 }}>Type</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{PREALLUMAGE_TYPES_LOCAUX.map((t) => {
        const selected = typeCode === t.code;
        return <TouchableOpacity key={t.code} onPress={() => setTypeCode(t.code)} style={{ paddingHorizontal: 11, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: selected ? COLORS.orange : COLORS.line, backgroundColor: selected ? COLORS.orange : COLORS.white }}><Text style={{ color: selected ? COLORS.white : COLORS.inkSoft, fontWeight: '800', fontSize: 12 }}>{t.label}</Text></TouchableOpacity>;
      })}</View>
      {typeCode !== 'chaufferie' ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}><Toggle label="Chauffage" value={chauffage} onPress={() => setChauffage((v) => !v)} /><Toggle label="ECS" value={ecs} onPress={() => setEcs((v) => !v)} /></View> : null}
      <View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={onClose}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={() => onSubmit({ nom, typeCode, chauffage, ecs })}><Text style={styles.btnPrimaryText}>Ajouter</Text></TouchableOpacity></View>
    </View></View>
  </Modal>;
}

function ConfigurationModal({ visible, local, onClose, onSave }) {
  const [chauffage, setChauffage] = useState(true);
  const [ecs, setEcs] = useState(true);
  useEffect(() => { if (visible && local) { setChauffage(Number(local.chauffage) !== 0); setEcs(Number(local.ecs) !== 0); } }, [visible, local]);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalOverlay}><View style={styles.modalSheet}>
      <Text style={styles.modalTitle}>Configurer {local?.nom || 'l’installation'}</Text>
      <Text style={[styles.importHint, { marginBottom: 12 }]}>Les rubriques qui ne s’appliquent pas disparaissent immédiatement, sans supprimer les anciennes saisies.</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}><Toggle label="Chauffage" value={chauffage} onPress={() => setChauffage((v) => !v)} /><Toggle label="ECS" value={ecs} onPress={() => setEcs((v) => !v)} /></View>
      <View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={onClose}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={() => onSave({ chauffage, ecs })}><Text style={styles.btnPrimaryText}>Appliquer</Text></TouchableOpacity></View>
    </View></View>
  </Modal>;
}

function ActionsModal({ visible, local, peutMonter, peutDescendre, onClose, onAction }) {
  if (!local) return null;
  const action = (id) => { onClose(); setTimeout(() => onAction(id), 0); };
  const items = [
    ['rename', 'Renommer'], ['config', 'Configurer Chauffage / ECS'], ['duplicate', 'Dupliquer sans les relevés du jour'],
    ['copy', 'Copier les réglages de régulation aux autres SST'],
    ...(peutMonter ? [['up', 'Déplacer plus tôt dans la visite']] : []),
    ...(peutDescendre ? [['down', 'Déplacer plus tard dans la visite']] : []),
    ['delete', 'Supprimer cette installation'],
  ];
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalOverlay}><View style={styles.modalSheet}>
    <Text style={styles.modalTitle}>{local.nom}</Text>
    <Text style={[styles.importHint, { marginBottom: 10 }]}>Actions sur cette installation</Text>
    {items.map(([id, label]) => <TouchableOpacity key={id} onPress={() => action(id)} style={{ minHeight: 46, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.line, paddingHorizontal: 6 }}><Text style={{ fontSize: 13, fontWeight: '800', color: id === 'delete' ? COLORS.red : COLORS.ink }}>{label}</Text></TouchableOpacity>)}
    <TouchableOpacity style={[styles.btnSecondary, { marginTop: 14 }]} onPress={onClose}><Text style={styles.btnSecondaryText}>Fermer</Text></TouchableOpacity>
  </View></View></Modal>;
}

function grouperItems(items, deuxColonnes) {
  const rows = [];
  let tampon = [];
  const vider = () => {
    if (!tampon.length) return;
    rows.push({ kind: 'fields', items: tampon, key: `fields-${tampon.map((i) => i.key).join('-')}` });
    tampon = [];
  };
  for (const item of items) {
    if (item.field.type === 'champ') {
      tampon.push(item);
      if (!deuxColonnes || tampon.length === 2) vider();
    } else {
      vider();
      rows.push({ kind: 'control', item, key: item.key });
    }
  }
  vider();
  return rows;
}

export function PreAllumageInstallationPanel({ visiteId, onSaved }) {
  const { width } = useWindowDimensions();
  const deuxColonnes = width >= 720;
  const listRef = useRef(null);
  const activeLocalRef = useRef(null);
  const positionsRef = useRef({});
  const pendingRechercheRef = useRef(null);

  const [modele, setModele] = useState(null);
  const [champsMap, setChampsMap] = useState({});
  const [controlesMap, setControlesMap] = useState({});
  const [activeLocalId, setActiveLocalId] = useState(null);
  const [ajoutVisible, setAjoutVisible] = useState(false);
  const [configVisible, setConfigVisible] = useState(false);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [editionNom, setEditionNom] = useState(false);
  const [nomLocal, setNomLocal] = useState('');
  const [replies, setReplies] = useState({});
  const [recherche, setRecherche] = useState('');

  const recharger = useCallback(async (selection = null) => {
    const [m, champs, controles] = await Promise.all([chargerPreAllumageModulaire(visiteId), getChampsVisite(visiteId), getControlesVisite(visiteId)]);
    setModele(m); setChampsMap(mapChamps(champs)); setControlesMap(mapControles(controles));
    if (selection) setActiveLocalId(selection);
  }, [visiteId]);
  useEffect(() => { recharger().catch((e) => Alert.alert('Pré-allumage', e.message)); }, [recharger]);
  useEffect(() => { activeLocalRef.current = activeLocalId; }, [activeLocalId]);

  const rubriquesOrphelines = useMemo(() => (modele?.rubriques || []).filter((r) => !r.local_id), [modele]);
  const chaufferiePhysique = useMemo(() => (modele?.locaux || []).find((l) => l.type_code === 'chaufferie') || null, [modele]);
  const rubriquesChaufferieOrphelines = useMemo(() => rubriquesOrphelines.filter((r) => r.panel_id === 'p-pa-chaufferie'), [rubriquesOrphelines]);
  const rubriquesSite = useMemo(() => rubriquesOrphelines.filter((r) => r.panel_id === 'p-pa-compteurs' && /g[ée]n[ée]raux/i.test(r.nom)), [rubriquesOrphelines]);
  const rubriquesOrphelinesPhysiques = useMemo(() => rubriquesOrphelines.filter((r) => ['p-pa-compteurs', 'p-pa-regulation', 'p-pa-sst'].includes(r.panel_id) && !/g[ée]n[ée]raux/i.test(r.nom)), [rubriquesOrphelines]);

  const locaux = useMemo(() => {
    const physiques = [...(modele?.locaux || [])].sort((a, b) => Number(a.ordre || 0) - Number(b.ordre || 0));
    const result = [];
    if (rubriquesSite.length) result.push({ id: VIRTUAL_SITE, nom: 'Site / général', type_code: 'site', virtual: true, ordre: -200 });
    if (rubriquesChaufferieOrphelines.length && !chaufferiePhysique) result.push({ id: VIRTUAL_CHAUFFERIE, nom: 'Chaufferie', type_code: 'chaufferie', virtual: true, ordre: -100 });
    result.push(...physiques);
    const existants = new Set(physiques.map((l) => String(l.nom || '').trim().toLowerCase()));
    [...new Set(rubriquesOrphelinesPhysiques.map((r) => baseNomRubrique(r.nom)).filter(Boolean))].forEach((nom) => {
      if (!existants.has(nom.toLowerCase())) result.push({ id: `${VIRTUAL_PREFIX}${nom}`, nom, type_code: 'autre', virtual: true, ordre: 10000 });
    });
    return result;
  }, [modele, rubriquesSite, rubriquesChaufferieOrphelines, chaufferiePhysique, rubriquesOrphelinesPhysiques]);

  useEffect(() => {
    if (!locaux.length) { setActiveLocalId(null); return; }
    if (!locaux.some((l) => l.id === activeLocalId)) setActiveLocalId(locaux[0].id);
  }, [locaux, activeLocalId]);

  const localActif = useMemo(() => locaux.find((l) => l.id === activeLocalId) || locaux[0] || null, [locaux, activeLocalId]);
  useEffect(() => { setNomLocal(localActif?.nom || ''); setEditionNom(false); }, [localActif?.id, localActif?.nom]);

  const rubriquesPourLocal = useCallback((local) => {
    if (!local) return [];
    let base;
    if (local.id === VIRTUAL_SITE) base = rubriquesSite;
    else if (local.id === VIRTUAL_CHAUFFERIE) base = rubriquesChaufferieOrphelines;
    else if (String(local.id).startsWith(VIRTUAL_PREFIX)) {
      const nom = String(local.id).slice(VIRTUAL_PREFIX.length);
      base = rubriquesOrphelinesPhysiques.filter((r) => baseNomRubrique(r.nom) === nom);
    } else {
      base = (modele?.rubriques || []).filter((r) => r.local_id === local.id);
      if (local.type_code === 'chaufferie' && chaufferiePhysique?.id === local.id) base = [...base, ...rubriquesChaufferieOrphelines];
    }
    return (base || []).map((r) => filtrerRubriqueSelonConfig(r, local)).filter((r) => r && (r.champs || []).length > 0);
  }, [modele, rubriquesSite, rubriquesChaufferieOrphelines, rubriquesOrphelinesPhysiques, chaufferiePhysique]);

  const rubriquesActives = useMemo(() => [...rubriquesPourLocal(localActif)].sort((a, b) => {
    const pa = PANEL_ORDER[a.panel_id] ?? 99; const pb = PANEL_ORDER[b.panel_id] ?? 99;
    return pa - pb || Number(a.ordre || 0) - Number(b.ordre || 0);
  }), [rubriquesPourLocal, localActif]);

  const sections = useMemo(() => rubriquesActives.map((r) => {
    const replie = replies[r.id] === true;
    const raw = (r.champs || []).map((c) => ({ field: { ...c.field, displayLabel: c.libelle, modularFieldId: c.id }, key: `${r.section_code}||${c.field.cle}` }));
    return { ...r, title: titreRubrique(r, localActif), sectionCode: r.section_code, rawData: raw, data: replie ? [] : grouperItems(raw, deuxColonnes), replie };
  }), [rubriquesActives, localActif, replies, deuxColonnes]);

  const stats = useMemo(() => statsRubriques(rubriquesActives, champsMap, controlesMap), [rubriquesActives, champsMap, controlesMap]);
  const warnings = useMemo(() => analyserCoherence(rubriquesActives, champsMap), [rubriquesActives, champsMap]);
  const idx = Math.max(0, locaux.findIndex((l) => l.id === localActif?.id));
  const precedent = idx > 0 ? locaux[idx - 1] : null;
  const suivant = idx >= 0 && idx < locaux.length - 1 ? locaux[idx + 1] : null;
  const physiques = locaux.filter((l) => !l.virtual);
  const idxPhysique = localActif?.virtual ? -1 : physiques.findIndex((l) => l.id === localActif?.id);

  const q = normaliserRecherche(recherche);
  const locauxAffiches = useMemo(() => {
    if (!q) return locaux;
    return locaux.filter((local) => {
      const texte = normaliserRecherche(`${local.nom} ${typeLabel(local)}`);
      return texte.includes(q) || rubriquesPourLocal(local).some((r) => rubriqueCorrespondRecherche(r, q));
    });
  }, [locaux, q, rubriquesPourLocal]);

  const changerLocal = useCallback((id, depuisRecherche = false) => {
    if (!id || id === activeLocalRef.current) return;
    if (depuisRecherche && q) pendingRechercheRef.current = q;
    setActiveLocalId(id);
    setTimeout(() => {
      const pos = positionsRef.current[id];
      if (pos && listRef.current) {
        try { listRef.current.scrollToLocation({ sectionIndex: pos.sectionIndex || 0, itemIndex: pos.itemIndex || 0, viewOffset: 8, animated: false }); } catch {}
      }
    }, 140);
  }, [q]);

  useEffect(() => {
    const attente = pendingRechercheRef.current;
    if (!attente || !sections.length) return;
    const sectionIndex = rubriquesActives.findIndex((r) => rubriqueCorrespondRecherche(r, attente));
    pendingRechercheRef.current = null;
    if (sectionIndex >= 0) {
      setReplies((m) => ({ ...m, [sections[sectionIndex].id]: false }));
      setTimeout(() => { try { listRef.current?.scrollToLocation({ sectionIndex, itemIndex: 0, viewOffset: 8, animated: true }); } catch {} }, 120);
    }
  }, [activeLocalId, sections, rubriquesActives]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 });
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const item = (viewableItems || []).find((v) => v.section && v.index !== null && v.index !== undefined);
    const id = activeLocalRef.current;
    if (!item || !id) return;
    const sectionIndex = sectionsRef.current.findIndex((s) => s.id === item.section.id);
    if (sectionIndex >= 0) positionsRef.current[id] = { sectionIndex, itemIndex: Math.max(0, item.index || 0) };
  });
  const sectionsRef = useRef(sections);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);

  const soumettreAjout = async ({ nom, typeCode, chauffage, ecs }) => {
    try {
      const id = await ajouterLocalPreAllumage(visiteId, { nom, typeCode, chauffage, ecs });
      setAjoutVisible(false); await recharger(id); onSaved?.();
    } catch (e) { Alert.alert('Impossible d’ajouter', e.message); }
  };
  const sauverNom = async () => {
    if (!localActif || localActif.virtual) { setEditionNom(false); return; }
    const propre = String(nomLocal || '').trim();
    if (!propre || propre === localActif.nom) { setNomLocal(localActif.nom); setEditionNom(false); return; }
    try { await renommerLocalPreAllumage(localActif.id, propre); setEditionNom(false); await recharger(localActif.id); onSaved?.(); } catch (e) { Alert.alert('Renommage impossible', e.message); }
  };
  const supprimer = () => {
    if (!localActif || localActif.virtual) return;
    Alert.alert('Supprimer cette installation ?', `Les saisies liées à « ${localActif.nom} » seront supprimées de cette visite.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { const selection = suivant?.id || precedent?.id || null; await supprimerLocalPreAllumage(localActif.id); await recharger(selection); onSaved?.(); } },
    ]);
  };
  const actionLocal = async (action) => {
    if (!localActif || localActif.virtual) return;
    if (action === 'rename') { setEditionNom(true); return; }
    if (action === 'config') { setConfigVisible(true); return; }
    if (action === 'delete') { supprimer(); return; }
    if (action === 'duplicate') {
      try { const r = await dupliquerLocalPreAllumage(localActif.id); await recharger(r.id); onSaved?.(); Alert.alert('Installation dupliquée', `${r.nom} a été créée sans les relevés ni les avis du jour.`); } catch (e) { Alert.alert('Duplication impossible', e.message); }
      return;
    }
    if (action === 'copy') {
      Alert.alert('Copier les réglages ?', 'Les courbes de chauffe, TNC, réduit de jour et horaires de cette installation seront appliqués aux autres installations disposant d’une régulation.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Copier', onPress: async () => { try { const n = await copierReglagesPreAllumage(localActif.id); await recharger(localActif.id); onSaved?.(); Alert.alert('Réglages copiés', `${n} installation(s) mise(s) à jour.`); } catch (e) { Alert.alert('Copie impossible', e.message); } } },
      ]);
      return;
    }
    if (action === 'up' || action === 'down') {
      await deplacerLocalPreAllumage(localActif.id, action === 'up' ? -1 : 1); await recharger(localActif.id); onSaved?.();
    }
  };
  const sauverConfig = async ({ chauffage, ecs }) => {
    try { await mettreAJourConfigurationLocalPreAllumage(localActif.id, { chauffage, ecs }); setConfigVisible(false); await recharger(localActif.id); onSaved?.(); } catch (e) { Alert.alert('Configuration impossible', e.message); }
  };

  const allerProchainIncomplet = () => {
    const sectionIndex = rubriquesActives.findIndex((r) => { const s = statsRubriques([r], champsMap, controlesMap); return s.faits < s.total; });
    if (sectionIndex < 0) return;
    const section = sections[sectionIndex];
    setReplies((m) => ({ ...m, [section.id]: false }));
    setTimeout(() => { try { listRef.current?.scrollToLocation({ sectionIndex, itemIndex: 0, viewOffset: 8, animated: true }); } catch {} }, 100);
  };

  if (!modele) return <View style={{ padding: 30 }}><ActivityIndicator color={COLORS.orange} /></View>;

  const header = <View>
    <View style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, padding: 12, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}><Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 16 }}>Installations de la visite</Text><Text style={{ color: COLORS.inkSoft, fontSize: 12, marginTop: 2 }}>Une installation = toutes les informations, relevés et conformités au même endroit.</Text></View>
        <PetitBouton label="+ Installation" primary onPress={() => setAjoutVisible(true)} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, backgroundColor: '#F9FAFB', paddingHorizontal: 10 }}>
        <Text style={{ marginRight: 7 }}>⌕</Text><TextInput value={recherche} onChangeText={setRecherche} placeholder="Rechercher SST 7, ECS, pompe, compteur…" style={{ flex: 1, minHeight: 40, fontSize: 12, color: COLORS.ink }} />{recherche ? <TouchableOpacity onPress={() => setRecherche('')}><Text style={{ color: COLORS.inkSoft, fontWeight: '900' }}>✕</Text></TouchableOpacity> : null}
      </View>
      {q && locauxAffiches.length === 0 ? <Text style={{ color: COLORS.inkSoft, fontSize: 11, marginTop: 8 }}>Aucune installation ne correspond à « {recherche} ».</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 7, paddingTop: 10, paddingRight: 8 }}>
        {locauxAffiches.map((local) => {
          const selected = local.id === localActif?.id; const s = statsRubriques(rubriquesPourLocal(local), champsMap, controlesMap); const alert = s.ns > 0;
          return <TouchableOpacity key={local.id} onPress={() => changerLocal(local.id, Boolean(q))} style={{ minHeight: 45, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: selected ? COLORS.orange : alert ? COLORS.red : COLORS.line, backgroundColor: selected ? COLORS.orangeLight : COLORS.white }}><Text style={{ color: selected ? COLORS.orangeDark : COLORS.ink, fontWeight: '800', fontSize: 12 }}>{alert ? '⚠ ' : s.pct === 100 && s.total ? '✓ ' : ''}{local.nom}</Text><Text style={{ color: alert ? COLORS.red : COLORS.inkSoft, fontSize: 10, marginTop: 1 }}>{s.pct}%{s.aCompleter ? ` · ${s.aCompleter} à compléter` : ''}{alert ? ` · ${s.ns} N.S` : ''}</Text></TouchableOpacity>;
        })}
      </ScrollView>
    </View>

    {localActif ? <View style={{ backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: stats.ns ? '#F4C7C7' : COLORS.line, borderRadius: 14, padding: 13, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <View style={{ flex: 1 }}>
          {editionNom ? <TextInput value={nomLocal} onChangeText={setNomLocal} onBlur={sauverNom} onSubmitEditing={sauverNom} autoFocus style={{ fontSize: 18, fontWeight: '900', color: COLORS.ink, borderBottomWidth: 1, borderBottomColor: COLORS.orange, paddingVertical: 3 }} /> : <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.ink }}>{localActif.nom}</Text>}
          <Text style={{ color: COLORS.inkSoft, marginTop: 3, fontSize: 12 }}>{typeLabel(localActif)} · {stats.faits}/{stats.total} renseignés · {stats.pct}%{stats.ns ? ` · ${stats.ns} N.S` : ''}{stats.aCompleter ? ` · ${stats.aCompleter} à compléter` : ''}</Text>
        </View>
        <PhotoButton visiteId={visiteId} entiteKey={`preallumage_local||${localActif.id}`} label={localActif.nom} style={{ minHeight: 38, paddingHorizontal: 9 }} />
        {!localActif.virtual ? <PetitBouton label="⋯" onPress={() => setActionsVisible(true)} /> : null}
      </View>
      <View style={{ height: 5, backgroundColor: COLORS.line, borderRadius: 3, marginTop: 11, overflow: 'hidden' }}><View style={{ height: 5, width: `${stats.pct}%`, backgroundColor: stats.ns ? COLORS.red : COLORS.orange, borderRadius: 3 }} /></View>
      {(stats.manquants || stats.aCompleter) ? <TouchableOpacity onPress={allerProchainIncomplet} style={{ alignSelf: 'flex-start', marginTop: 9 }}><Text style={{ color: COLORS.orangeDark, fontSize: 11, fontWeight: '800' }}>Aller au prochain champ incomplet →</Text></TouchableOpacity> : null}
    </View> : null}

    {warnings.length ? <View style={{ backgroundColor: '#FFFAEB', borderWidth: 1, borderColor: '#FEDF89', borderRadius: 12, padding: 10, marginBottom: 10 }}><Text style={{ color: '#93370D', fontWeight: '900', fontSize: 11 }}>⚠ Valeurs à vérifier — la saisie reste autorisée</Text>{warnings.map((w, i) => <Text key={`${w}-${i}`} style={{ color: '#93370D', fontSize: 10, marginTop: 3 }}>• {w}</Text>)}</View> : null}
  </View>;

  const footer = <View style={{ paddingTop: 10, paddingBottom: 24 }}>
    <View style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: stats.ns ? '#F4C7C7' : COLORS.line, borderRadius: 12, padding: 11, marginBottom: 10 }}><Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 12 }}>Synthèse {localActif?.nom}</Text><Text style={{ color: COLORS.inkSoft, fontSize: 11, marginTop: 4 }}>{stats.faits} renseignés · {stats.ns} N.S · {stats.aCompleter} à compléter · {stats.manquants} non renseignés</Text></View>
    <View style={{ flexDirection: 'row', gap: 9 }}><View style={{ flex: 1 }}>{precedent ? <PetitBouton label={`‹ ${precedent.nom}`} onPress={() => changerLocal(precedent.id)} /> : null}</View><View style={{ flex: 1, alignItems: 'flex-end' }}>{suivant ? <PetitBouton primary label={`${suivant.nom} ›`} onPress={() => changerLocal(suivant.id)} /> : <PetitBouton primary label="+ Installation" onPress={() => setAjoutVisible(true)} />}</View></View>
  </View>;

  return <>
    <SectionList
      ref={listRef}
      sections={sections}
      keyExtractor={(item) => item.key}
      ListHeaderComponent={header}
      renderSectionHeader={({ section }) => {
        const s = statsRubriques([section], champsMap, controlesMap);
        return <TouchableOpacity onPress={() => setReplies((m) => ({ ...m, [section.id]: !section.replie }))} style={{ marginTop: 5, paddingHorizontal: 13, paddingVertical: 10, backgroundColor: COLORS.white, borderWidth: 1, borderColor: s.ns ? '#F4C7C7' : COLORS.line, borderRadius: 11 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1, color: COLORS.ink, fontSize: 13, fontWeight: '900' }}>{section.title}</Text><Text style={{ color: s.ns ? COLORS.red : s.aCompleter ? '#B54708' : COLORS.inkSoft, fontWeight: '800', fontSize: 10 }}>{s.faits}/{s.total}{s.aCompleter ? ` · ${s.aCompleter} à compléter` : ''}{s.ns ? ` · ⚠ ${s.ns}` : ''}</Text><Text style={{ color: COLORS.inkSoft, fontSize: 14 }}>{section.replie ? '⌄' : '⌃'}</Text></View></TouchableOpacity>;
      }}
      renderItem={({ item, section, index }) => <View style={{ backgroundColor: COLORS.white, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: index === section.data.length - 1 ? 1 : 0, borderColor: COLORS.line, paddingHorizontal: 11, paddingVertical: 4, marginTop: -1, borderBottomLeftRadius: index === section.data.length - 1 ? 11 : 0, borderBottomRightRadius: index === section.data.length - 1 ? 11 : 0 }}>
        {item.kind === 'fields' ? <View style={{ flexDirection: deuxColonnes ? 'row' : 'column', gap: deuxColonnes ? 12 : 0 }}>{item.items.map((champ, champIndex) => <View key={champ.key} style={{ flex: 1, minWidth: 0, paddingLeft: deuxColonnes && champIndex > 0 ? 10 : 0, borderLeftWidth: deuxColonnes && champIndex > 0 ? 1 : 0, borderLeftColor: COLORS.line }}><PreAllumageCompactField visiteId={visiteId} sectionCode={section.sectionCode} field={champ.field} valeurInitiale={champsMap[champ.key]} localName={localActif?.nom} showPhoto={section.panel_id === 'p-pa-compteurs'} onSaved={(valeur) => { setChampsMap((m) => ({ ...m, [champ.key]: valeur })); onSaved?.(); }} /></View>)}</View> : <PreAllumageCompactControl visiteId={visiteId} sectionCode={section.sectionCode} field={item.item.field} etatInitial={controlesMap[item.item.key]} localName={localActif?.nom} onEtatChange={(patch) => setControlesMap((m) => ({ ...m, [item.item.key]: { ...(m[item.item.key] || {}), ...patch } }))} onSaved={onSaved} />}
      </View>}
      ListEmptyComponent={<View style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 18 }}><Text style={{ color: COLORS.inkSoft, textAlign: 'center' }}>Aucune donnée applicable à cette installation.</Text></View>}
      ListFooterComponent={footer}
      contentContainerStyle={styles.panelContent}
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled={false}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      onViewableItemsChanged={onViewableItemsChanged.current}
      viewabilityConfig={viewabilityConfig.current}
    />
    <AjouterInstallationModal visible={ajoutVisible} onClose={() => setAjoutVisible(false)} onSubmit={soumettreAjout} />
    <ConfigurationModal visible={configVisible} local={localActif} onClose={() => setConfigVisible(false)} onSave={sauverConfig} />
    <ActionsModal visible={actionsVisible} local={localActif} peutMonter={idxPhysique > 0} peutDescendre={idxPhysique >= 0 && idxPhysique < physiques.length - 1} onClose={() => setActionsVisible(false)} onAction={(id) => actionLocal(id).catch((e) => Alert.alert('Action impossible', e.message))} />
  </>;
}
