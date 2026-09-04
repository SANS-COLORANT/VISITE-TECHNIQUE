/** Pré-allumage V3 : aucun local imposé, chaufferies et équipements ajoutés au fil de la visite. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, SectionList, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { getChampsVisite, getControlesVisite } from './db.js';
import { PreAllumageCompactField } from './PreAllumageCompactField.js';
import { PreAllumageCompactControl } from './PreAllumageCompactControl.js';
import { PreAllumageHeatCurve } from './PreAllumageHeatCurve.js';
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
import {
  ajouterEquipementControlePreAllumage,
  dupliquerEquipementPreAllumage,
  estRubriqueEquipementPreAllumage,
  normaliserLocauxPreAllumage,
  PREALLUMAGE_CONTROL_EQUIPMENT_TYPES,
  supprimerEquipementPreAllumage,
  synchroniserNombreLocauxPreAllumage,
} from './preAllumageBusinessDb.js';
import { preparerChaufferieDynamiquePreAllumage } from './preAllumageChaufferieDb.js';
import { COLORS, styles } from './styles.js';

const PANEL_ORDER = { 'p-pa-batiments': 10, 'p-pa-compteurs': 20, 'p-pa-regulation': 30, 'p-pa-chaufferie': 40, 'p-pa-sst': 50 };
const A_COMPLETER = 'À compléter';

function mapChamps(rows) { return Object.fromEntries((rows || []).map((r) => [`${r.section_code}||${r.cle}`, r.valeur])); }
function mapControles(rows) { return Object.fromEntries((rows || []).map((r) => [`${r.section_code}||${r.cle}`, r])); }
function normalize(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function typeLabel(local) { return local?.type_code === 'chaufferie' ? 'Chaufferie' : local?.type_code === 'sous_station' ? 'Sous-station' : 'Local technique'; }
function usagesLabel(local) {
  if (!local) return '';
  const usages = [];
  if (Number(local.chauffage) !== 0) usages.push('Chauffage');
  if (Number(local.ecs) !== 0) usages.push('ECS');
  if (local.type_code === 'chaufferie' && Number(local.primaire) !== 0) usages.push('Primaire');
  return usages.length ? usages.join(' + ') : 'Aucun usage sélectionné';
}
function titreRubrique(r) {
  if (r.panel_id === 'p-pa-batiments') return 'Informations';
  if (r.panel_id === 'p-pa-compteurs') return /g[ée]n[ée]raux/i.test(r.nom) ? 'Compteurs généraux' : 'Compteurs';
  if (r.panel_id === 'p-pa-regulation') return 'Régulation & températures';
  if (r.panel_id === 'p-pa-sst') return /ECS|traitement d.?eau/i.test(r.nom) ? 'ECS / traitement d’eau' : 'Contrôles chauffage';
  return r.nom || 'Contrôles';
}
function estEcs(text) { return /\bECS\b|primaire ECS|traitement d.?eau|bouclage/i.test(String(text || '')); }
function estChauffage(text) { return /chauffage|courbe de chauffe|non chauffe|réduit de jour|horaires|température extérieure/i.test(String(text || '')); }
function estPointCourbe(item) { return /courbe de chauffe/i.test(`${item?.field?.displayLabel || ''} ${item?.field?.cle || ''}`); }
function filtrerConfig(r, local) {
  if (!local || local.type_code === 'chaufferie') return r;
  const chauffage = Number(local.chauffage) !== 0; const ecs = Number(local.ecs) !== 0;
  if (r.panel_id === 'p-pa-sst' && ((!ecs && estEcs(r.nom)) || (!chauffage && /chauffage/i.test(r.nom)))) return null;
  const champs = (r.champs || []).filter((c) => {
    const text = `${c.libelle || ''} ${c.field?.cle || ''}`;
    if (!ecs && estEcs(text)) return false;
    if (!chauffage && r.panel_id === 'p-pa-regulation' && estChauffage(text) && !estEcs(text)) return false;
    return true;
  });
  return { ...r, champs };
}
function statsRubriques(rubriques, champsMap, controlesMap) {
  let total = 0; let done = 0; let ns = 0; let later = 0;
  (rubriques || []).forEach((r) => (r.champs || []).forEach((c) => {
    total += 1; const key = `${r.section_code}||${c.field.cle}`;
    if (c.field.type === 'controle') { const a = controlesMap[key]?.avis; if (a) done += 1; if (a === 'N.S') ns += 1; }
    else { const v = String(champsMap[key] ?? '').trim(); if (v === A_COMPLETER) later += 1; else if (v) done += 1; }
  }));
  return { total, done, ns, later, missing: Math.max(0, total - done - later), pct: total ? Math.round((done / total) * 100) : 0 };
}
function groupItems(items, twoCols) {
  const rows = []; let buf = [];
  const flush = () => { if (buf.length) rows.push({ kind: 'fields', key: buf.map((x) => x.key).join('|'), items: buf }); buf = []; };
  for (const x of items) { if (x.field.type === 'controle') { flush(); rows.push({ kind: 'control', key: x.key, item: x }); continue; } buf.push(x); if (!twoCols || buf.length === 2) flush(); }
  flush(); return rows;
}
function groupRegulationItems(items) {
  const visibles = items.filter((x) => !estPointCourbe(x));
  const groups = [
    { id: 'conditions', icon: '◎', title: 'Réglages & extérieur', match: (t) => /température extérieure|température de non chauffe|réduit de jour|horaires?/i.test(t) },
    { id: 'chauffage', icon: '♨', title: 'Chauffage', match: (t) => /départ chauffage|retour chauffage/i.test(t) },
    { id: 'ecs', icon: '💧', title: 'ECS / primaire', match: (t) => /ecs|primaire/i.test(t) },
  ];
  const deja = new Set();
  const rows = [{ kind: 'curve', key: 'heat-curve' }];
  groups.forEach((g) => {
    const selection = visibles.filter((x) => {
      const t = `${x.field?.displayLabel || ''} ${x.field?.cle || ''}`;
      const ok = !deja.has(x.key) && g.match(t);
      if (ok) deja.add(x.key);
      return ok;
    });
    if (selection.length) rows.push({ kind: 'regulationGroup', key: `reg-${g.id}`, icon: g.icon, title: g.title, items: selection });
  });
  const autres = visibles.filter((x) => !deja.has(x.key));
  if (autres.length) rows.push({ kind: 'regulationGroup', key: 'reg-autres', icon: '⌁', title: 'Autres paramètres', items: autres });
  return rows;
}
function PetitBouton({ label, onPress, primary = false, danger = false }) {
  return <TouchableOpacity onPress={onPress} style={{ minHeight: 38, justifyContent: 'center', borderWidth: 1, borderColor: danger ? COLORS.red : primary ? COLORS.orange : COLORS.line, backgroundColor: danger ? COLORS.redBg : primary ? COLORS.orange : COLORS.white, borderRadius: 10, paddingHorizontal: 11 }}><Text style={{ color: danger ? COLORS.red : primary ? COLORS.white : COLORS.inkSoft, fontSize: 11, fontWeight: '900' }}>{label}</Text></TouchableOpacity>;
}
function Toggle({ label, value, onPress }) { return <TouchableOpacity onPress={onPress} style={{ flex: 1, minHeight: 43, justifyContent: 'center', borderWidth: 1, borderColor: value ? COLORS.orange : COLORS.line, backgroundColor: value ? COLORS.orangeLight : COLORS.white, borderRadius: 10 }}><Text style={{ textAlign: 'center', color: value ? COLORS.orangeDark : COLORS.inkSoft, fontWeight: '900' }}>{value ? '✓ ' : ''}{label}</Text></TouchableOpacity>; }

function AddLocalModal({ visible, onClose, onSubmit }) {
  const [nom, setNom] = useState(''); const [typeCode, setTypeCode] = useState('sous_station'); const [chauffage, setChauffage] = useState(true); const [ecs, setEcs] = useState(true); const [primaire, setPrimaire] = useState(false);
  useEffect(() => { if (visible) { setNom(''); setTypeCode('sous_station'); setChauffage(true); setEcs(true); setPrimaire(false); } }, [visible]);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalOverlay}><View style={styles.modalSheet}>
    <Text style={styles.modalTitle}>Ajouter un local</Text><Text style={[styles.importHint, { marginBottom: 10 }]}>Aucun local n’est imposé : ajoutez uniquement les locaux réellement présents sur le site.</Text>
    <TextInput autoFocus style={styles.input} value={nom} onChangeText={setNom} placeholder="Ex. Chaufferie principale, SST 1, Piscine…" />
    <Text style={{ color: COLORS.ink, fontWeight: '900', marginTop: 12, marginBottom: 7 }}>Type de local</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{PREALLUMAGE_TYPES_LOCAUX.map((t) => <TouchableOpacity key={t.code} onPress={() => { setTypeCode(t.code); if (t.code !== 'chaufferie') setPrimaire(false); }} style={{ minHeight: 38, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 19, borderWidth: 1, borderColor: typeCode === t.code ? COLORS.orange : COLORS.line, backgroundColor: typeCode === t.code ? COLORS.orangeLight : COLORS.white }}><Text style={{ color: typeCode === t.code ? COLORS.orangeDark : COLORS.inkSoft, fontWeight: '900', fontSize: 11 }}>{t.label}</Text></TouchableOpacity>)}</View>
    <Text style={{ color: COLORS.ink, fontWeight: '900', marginTop: 12, marginBottom: 7 }}>Usages desservis</Text><View style={{ flexDirection: 'row', gap: 8 }}><Toggle label="Chauffage" value={chauffage} onPress={() => setChauffage((v) => !v)} /><Toggle label="ECS" value={ecs} onPress={() => setEcs((v) => !v)} />{typeCode === 'chaufferie' ? <Toggle label="Primaire" value={primaire} onPress={() => setPrimaire((v) => !v)} /> : null}</View>
    <View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={onClose}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={() => onSubmit({ nom, typeCode, chauffage, ecs, primaire: typeCode === 'chaufferie' ? primaire : false })}><Text style={styles.btnPrimaryText}>Ajouter</Text></TouchableOpacity></View>
  </View></View></Modal>;
}
function AddEquipmentModal({ visible, onClose, onAdd, local }) {
  const [name, setName] = useState(''); const [type, setType] = useState('pompe_chauffage'); const [controle, setControle] = useState('');
  const types = useMemo(() => PREALLUMAGE_CONTROL_EQUIPMENT_TYPES.filter((x) => local?.type_code === 'chaufferie' || !['chaudiere', 'bruleur'].includes(x.code)), [local?.type_code]);
  useEffect(() => { if (visible) { setName(''); setType(local?.type_code === 'chaufferie' ? 'chaudiere' : 'pompe_chauffage'); setControle(''); } }, [visible, local?.type_code]);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalOverlay}><View style={styles.modalSheet}>
    <Text style={styles.modalTitle}>Ajouter un équipement</Text><Text style={[styles.importHint, { marginBottom: 10 }]}>Ajoutez dans {local?.nom || 'ce local'} les équipements réellement présents. Chaque équipement crée ses contrôles S / N.S / N.R / S.O / N.V.</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{types.map((x) => <TouchableOpacity key={x.code} onPress={() => setType(x.code)} style={{ minHeight: 38, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 19, borderWidth: 1, borderColor: type === x.code ? COLORS.orange : COLORS.line, backgroundColor: type === x.code ? COLORS.orangeLight : COLORS.white }}><Text style={{ color: type === x.code ? COLORS.orangeDark : COLORS.inkSoft, fontSize: 11, fontWeight: '900' }}>{x.label}</Text></TouchableOpacity>)}</View>
    <TextInput style={[styles.input, { marginTop: 12 }]} value={name} onChangeText={setName} placeholder="Nom facultatif : ex. Pompe chauffage n°3" />
    <TextInput style={[styles.input, { marginTop: 8 }]} value={controle} onChangeText={setControle} placeholder="Contrôle personnalisé (optionnel)" />
    <Text style={{ color: COLORS.inkSoft, fontSize: 9, marginTop: 4 }}>Laissez vide pour utiliser les contrôles préconfigurés. Sinon le texte saisi devient directement le contrôle à vérifier.</Text>
    <View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={onClose}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={() => onAdd(type, name, controle)}><Text style={styles.btnPrimaryText}>Ajouter</Text></TouchableOpacity></View>
  </View></View></Modal>;
}
function ConfigModal({ visible, local, onClose, onSave }) {
  const [chauffage, setChauffage] = useState(true); const [ecs, setEcs] = useState(true); const [primaire, setPrimaire] = useState(false);
  useEffect(() => { if (visible && local) { setChauffage(Number(local.chauffage) !== 0); setEcs(Number(local.ecs) !== 0); setPrimaire(local.type_code === 'chaufferie' && Number(local.primaire) !== 0); } }, [visible, local]);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalOverlay}><View style={styles.modalSheet}><Text style={styles.modalTitle}>Configurer {local?.nom}</Text><Text style={[styles.importHint, { marginTop: 4 }]}>Sélectionnez uniquement les usages réellement présents dans ce local.</Text><View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}><Toggle label="Chauffage" value={chauffage} onPress={() => setChauffage((v) => !v)} /><Toggle label="ECS" value={ecs} onPress={() => setEcs((v) => !v)} />{local?.type_code === 'chaufferie' ? <Toggle label="Primaire" value={primaire} onPress={() => setPrimaire((v) => !v)} /> : null}</View><View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={onClose}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={() => onSave({ chauffage, ecs, primaire: local?.type_code === 'chaufferie' ? primaire : false })}><Text style={styles.btnPrimaryText}>Appliquer</Text></TouchableOpacity></View></View></View></Modal>;
}
function ActionsModal({ visible, local, canUp, canDown, onClose, onAction }) {
  if (!local) return null;
  const configLabel = local.type_code === 'chaufferie' ? 'Configurer Chauffage / ECS / Primaire' : 'Configurer Chauffage / ECS';
  const entries = [['rename', 'Renommer'], ['config', configLabel], ['duplicate', 'Dupliquer sans les relevés du jour'], ['copy', 'Copier les réglages de régulation aux autres locaux'], ...(canUp ? [['up', 'Déplacer plus tôt']] : []), ...(canDown ? [['down', 'Déplacer plus tard']] : []), ['delete', 'Supprimer le local']];
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalOverlay}><View style={styles.modalSheet}><Text style={styles.modalTitle}>{local.nom}</Text>{entries.map(([id, label]) => <TouchableOpacity key={id} onPress={() => { onClose(); setTimeout(() => onAction(id), 0); }} style={{ minHeight: 46, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.line }}><Text style={{ color: id === 'delete' ? COLORS.red : COLORS.ink, fontWeight: '900', fontSize: 12 }}>{label}</Text></TouchableOpacity>)}<TouchableOpacity style={[styles.btnSecondary, { marginTop: 12 }]} onPress={onClose}><Text style={styles.btnSecondaryText}>Fermer</Text></TouchableOpacity></View></View></Modal>;
}

export function PreAllumageInstallationPanelV3({ visiteId, onSaved }) {
  const { width } = useWindowDimensions(); const twoCols = width >= 720;
  const listRef = useRef(null); const [model, setModel] = useState(null); const [champs, setChamps] = useState({}); const [controls, setControls] = useState({});
  const [activeId, setActiveId] = useState(null); const [search, setSearch] = useState(''); const [collapsed, setCollapsed] = useState({});
  const [addLocal, setAddLocal] = useState(false); const [addEquipment, setAddEquipment] = useState(false); const [config, setConfig] = useState(false); const [actions, setActions] = useState(false); const [rename, setRename] = useState(false); const [name, setName] = useState('');

  const reload = useCallback(async (select = null) => {
    await chargerPreAllumageModulaire(visiteId); await normaliserLocauxPreAllumage(visiteId);
    const [m, c, ct] = await Promise.all([chargerPreAllumageModulaire(visiteId), getChampsVisite(visiteId), getControlesVisite(visiteId)]);
    setModel(m); setChamps(mapChamps(c)); setControls(mapControles(ct)); if (select) setActiveId(select);
  }, [visiteId]);
  useEffect(() => { reload().catch((e) => Alert.alert('Pré-allumage', e.message)); }, [reload]);

  const locals = useMemo(() => [...(model?.locaux || [])].sort((a, b) => Number(a.ordre || 0) - Number(b.ordre || 0)), [model]);
  useEffect(() => { if (!locals.length) setActiveId(null); else if (!locals.some((l) => l.id === activeId)) setActiveId(locals[0].id); }, [locals, activeId]);
  const active = useMemo(() => locals.find((l) => l.id === activeId) || null, [locals, activeId]);
  useEffect(() => { setName(active?.nom || ''); setRename(false); }, [active?.id, active?.nom]);

  const rubriquesFor = useCallback((local) => {
    if (!local) return [];
    return (model?.rubriques || []).filter((r) => r.local_id === local.id).map((r) => filtrerConfig(r, local)).filter((r) => r && (r.champs || []).length).sort((a, b) => (PANEL_ORDER[a.panel_id] ?? 99) - (PANEL_ORDER[b.panel_id] ?? 99) || Number(a.ordre || 0) - Number(b.ordre || 0));
  }, [model]);
  const rubriques = useMemo(() => rubriquesFor(active), [rubriquesFor, active]);
  const stats = useMemo(() => statsRubriques(rubriques, champs, controls), [rubriques, champs, controls]);
  const sections = useMemo(() => rubriques.map((r) => {
    const raw = (r.champs || []).map((c) => ({ key: `${r.section_code}||${c.field.cle}`, field: { ...c.field, displayLabel: c.libelle, modularFieldId: c.id } }));
    const data = r.panel_id === 'p-pa-regulation' ? groupRegulationItems(raw) : groupItems(raw, twoCols);
    return { ...r, title: titreRubrique(r), raw, data: collapsed[r.id] ? [] : data, collapsed: Boolean(collapsed[r.id]) };
  }), [rubriques, collapsed, twoCols]);

  const q = normalize(search);
  const visibleLocals = useMemo(() => !q ? locals : locals.filter((l) => normalize(`${l.nom} ${typeLabel(l)} ${rubriquesFor(l).map((r) => `${r.nom} ${(r.champs || []).map((c) => c.libelle).join(' ')}`).join(' ')}`).includes(q)), [locals, q, rubriquesFor]);
  const idx = locals.findIndex((l) => l.id === active?.id); const prev = idx > 0 ? locals[idx - 1] : null; const next = idx >= 0 && idx < locals.length - 1 ? locals[idx + 1] : null;

  const submitLocal = async ({ nom, typeCode, chauffage, ecs, primaire }) => {
    try { const id = await ajouterLocalPreAllumage(visiteId, { nom, typeCode, chauffage, ecs, primaire }); if (typeCode === 'chaufferie') await preparerChaufferieDynamiquePreAllumage(visiteId, id); await synchroniserNombreLocauxPreAllumage(visiteId); setAddLocal(false); await reload(id); onSaved?.(); } catch (e) { Alert.alert('Ajout impossible', e.message); }
  };
  const submitEquipment = async (type, customName, customControl) => {
    try { await ajouterEquipementControlePreAllumage(visiteId, active.id, type, customName, customControl); setAddEquipment(false); await reload(active.id); onSaved?.(); } catch (e) { Alert.alert('Ajout impossible', e.message); }
  };
  const saveName = async () => { if (!active) return; const clean = String(name || '').trim(); if (!clean) return; try { await renommerLocalPreAllumage(active.id, clean); setRename(false); await reload(active.id); onSaved?.(); } catch (e) { Alert.alert('Renommage impossible', e.message); } };
  const saveConfig = async (patch) => { try { await mettreAJourConfigurationLocalPreAllumage(active.id, patch); setConfig(false); await reload(active.id); onSaved?.(); } catch (e) { Alert.alert('Configuration impossible', e.message); } };
  const localAction = async (action) => {
    if (!active) return;
    if (action === 'rename') { setRename(true); return; } if (action === 'config') { setConfig(true); return; }
    if (action === 'delete') { Alert.alert('Supprimer ce local ?', `« ${active.nom} » et les saisies de ce local seront supprimés.`, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: async () => { const sel = next?.id || prev?.id || null; await supprimerLocalPreAllumage(active.id); await synchroniserNombreLocauxPreAllumage(visiteId); await reload(sel); onSaved?.(); } }]); return; }
    if (action === 'duplicate') { const r = await dupliquerLocalPreAllumage(active.id); await synchroniserNombreLocauxPreAllumage(visiteId); await reload(r.id); onSaved?.(); return; }
    if (action === 'copy') { const n = await copierReglagesPreAllumage(active.id); await reload(active.id); onSaved?.(); Alert.alert('Réglages copiés', `${n} local(aux) mis à jour.`); return; }
    if (action === 'up' || action === 'down') { await deplacerLocalPreAllumage(active.id, action === 'up' ? -1 : 1); await reload(active.id); onSaved?.(); }
  };
  const removeEquipment = (section) => Alert.alert('Supprimer cet équipement ?', section.nom, [{ text: 'Annuler', style: 'cancel' }, { text: 'Supprimer', style: 'destructive', onPress: async () => { await supprimerEquipementPreAllumage(section.id); await reload(active.id); onSaved?.(); } }]);
  const duplicateEquipment = async (section) => { try { await dupliquerEquipementPreAllumage(section.id); await reload(active.id); onSaved?.(); } catch (e) { Alert.alert('Duplication impossible', e.message); } };
  const nextIncomplete = () => { const si = rubriques.findIndex((r) => { const s = statsRubriques([r], champs, controls); return s.done < s.total; }); if (si < 0) return; setCollapsed((m) => ({ ...m, [rubriques[si].id]: false })); setTimeout(() => { try { listRef.current?.scrollToLocation({ sectionIndex: si, itemIndex: 0, viewOffset: 8, animated: true }); } catch {} }, 120); };

  if (!model) return <View style={{ padding: 30 }}><ActivityIndicator color={COLORS.orange} /></View>;
  const header = <View>
    <View style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, padding: 12, marginBottom: 10 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1 }}><Text style={{ color: COLORS.ink, fontSize: 16, fontWeight: '900' }}>Locaux de la visite</Text><Text style={{ color: COLORS.inkSoft, fontSize: 11, marginTop: 2 }}>Aucun local par défaut. Ajoutez Chaufferie, Sous-station, Église, Piscine, Centre commercial… selon le site réel.</Text></View><PetitBouton primary label="+ Local" onPress={() => setAddLocal(true)} /></View>
    {locals.length ? <><View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, paddingHorizontal: 9, backgroundColor: '#F9FAFB' }}><Text style={{ marginRight: 6 }}>⌕</Text><TextInput value={search} onChangeText={setSearch} placeholder="Rechercher un local, ECS, pompe…" style={{ flex: 1, minHeight: 40, fontSize: 12 }} />{search ? <TouchableOpacity onPress={() => setSearch('')}><Text>✕</Text></TouchableOpacity> : null}</View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingTop: 10 }}>{visibleLocals.map((l) => { const s = statsRubriques(rubriquesFor(l), champs, controls); return <TouchableOpacity key={l.id} onPress={() => setActiveId(l.id)} style={{ minHeight: 45, justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderColor: l.id === active?.id ? COLORS.orange : s.ns ? COLORS.red : COLORS.line, backgroundColor: l.id === active?.id ? COLORS.orangeLight : COLORS.white, borderRadius: 11 }}><Text style={{ color: l.id === active?.id ? COLORS.orangeDark : COLORS.ink, fontSize: 11, fontWeight: '900' }}>{s.ns ? '⚠ ' : s.pct === 100 && s.total ? '✓ ' : ''}{l.nom}</Text><Text style={{ color: s.ns ? COLORS.red : COLORS.inkSoft, fontSize: 9 }}>{s.pct}%{s.ns ? ` · ${s.ns} N.S` : ''}</Text></TouchableOpacity>; })}</ScrollView></> : null}</View>
    {!active ? <View style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 14, padding: 22, alignItems: 'center' }}><Text style={{ color: COLORS.ink, fontSize: 16, fontWeight: '900' }}>Aucun local</Text><Text style={{ color: COLORS.inkSoft, textAlign: 'center', fontSize: 11, marginTop: 5, marginBottom: 12 }}>Commencez par ajouter le premier local rencontré sur le site et choisissez son type.</Text><PetitBouton primary label="+ Ajouter le premier local" onPress={() => setAddLocal(true)} /></View> : <View style={{ backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: stats.ns ? '#F4C7C7' : COLORS.line, borderRadius: 14, padding: 12, marginBottom: 10 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1 }}>{rename ? <TextInput value={name} onChangeText={setName} autoFocus onBlur={saveName} onSubmitEditing={saveName} style={{ fontSize: 18, fontWeight: '900', borderBottomWidth: 1, borderBottomColor: COLORS.orange }} /> : <Text style={{ color: COLORS.ink, fontSize: 18, fontWeight: '900' }}>{active.nom}</Text>}<Text style={{ color: COLORS.inkSoft, fontSize: 11, marginTop: 3 }}>{typeLabel(active)} · {usagesLabel(active)} · {stats.done}/{stats.total} renseignés · {stats.pct}%{stats.ns ? ` · ${stats.ns} N.S` : ''}{stats.later ? ` · ${stats.later} à compléter` : ''}</Text></View><PhotoButton visiteId={visiteId} entiteKey={`preallumage_local||${active.id}`} label={active.nom} style={{ minHeight: 38, paddingHorizontal: 8 }} /><PetitBouton primary label="+ Équipement" onPress={() => setAddEquipment(true)} /><PetitBouton label="⋯" onPress={() => setActions(true)} /></View>{(stats.missing || stats.later) ? <TouchableOpacity onPress={nextIncomplete} style={{ marginTop: 8 }}><Text style={{ color: COLORS.orangeDark, fontSize: 10, fontWeight: '900' }}>Aller au prochain champ incomplet →</Text></TouchableOpacity> : null}{!rubriques.some(estRubriqueEquipementPreAllumage) ? <View style={{ marginTop: 9, backgroundColor: '#F9FAFB', borderRadius: 9, padding: 9 }}><Text style={{ color: COLORS.inkSoft, fontSize: 10 }}>Ajoutez ici les pompes, vannes trois voies, régulations, échangeurs ou autres équipements réellement présents dans ce local. Ils pourront ensuite être dupliqués ou supprimés indépendamment.</Text></View> : null}</View>}
  </View>;
  const footer = active ? <View style={{ paddingTop: 10, paddingBottom: 24 }}><View style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 11, padding: 10, marginBottom: 9 }}><Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 11 }}>Synthèse {active.nom}</Text><Text style={{ color: COLORS.inkSoft, fontSize: 10, marginTop: 3 }}>{stats.done} renseignés · {stats.ns} N.S · {stats.later} à compléter · {stats.missing} non renseignés</Text></View><View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}>{prev ? <PetitBouton label={`‹ ${prev.nom}`} onPress={() => setActiveId(prev.id)} /> : null}</View><View style={{ flex: 1, alignItems: 'flex-end' }}>{next ? <PetitBouton primary label={`${next.nom} ›`} onPress={() => setActiveId(next.id)} /> : <PetitBouton primary label="+ Local" onPress={() => setAddLocal(true)} />}</View></View></View> : null;

  const renderCompactField = (x, section, extraProps = {}) => <PreAllumageCompactField visiteId={visiteId} sectionCode={section.section_code} field={x.field} valeurInitiale={champs[x.key]} localName={active?.nom} showPhoto={section.panel_id === 'p-pa-compteurs'} onSaved={(value) => { setChamps((m) => ({ ...m, [x.key]: value })); onSaved?.(); }} {...extraProps} />;

  return <>
    <SectionList ref={listRef} sections={active ? sections : []} keyExtractor={(item) => item.key} ListHeaderComponent={header} ListFooterComponent={footer} renderSectionHeader={({ section }) => { const s = statsRubriques([section], champs, controls); const dyn = estRubriqueEquipementPreAllumage(section); return <View style={{ marginTop: 5, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: s.ns ? '#F4C7C7' : COLORS.line, borderRadius: 11, backgroundColor: COLORS.white }}><TouchableOpacity onPress={() => setCollapsed((m) => ({ ...m, [section.id]: !section.collapsed }))} style={{ flex: 1, minHeight: 43, justifyContent: 'center', paddingHorizontal: 12 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Text style={{ flex: 1, color: COLORS.ink, fontSize: 13, fontWeight: '900' }}>{section.title}</Text><Text style={{ color: s.ns ? COLORS.red : COLORS.inkSoft, fontSize: 9, fontWeight: '800' }}>{s.done}/{s.total}{s.ns ? ` · ⚠ ${s.ns}` : ''}</Text><Text style={{ color: COLORS.inkSoft }}>{section.collapsed ? '⌄' : '⌃'}</Text></View></TouchableOpacity>{dyn ? <><TouchableOpacity onPress={() => duplicateEquipment(section)} style={{ minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: COLORS.line }}><Text style={{ color: COLORS.orangeDark, fontWeight: '900', fontSize: 16 }}>⧉</Text></TouchableOpacity><TouchableOpacity onPress={() => removeEquipment(section)} style={{ minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: COLORS.line }}><Text style={{ color: COLORS.red, fontWeight: '900' }}>✕</Text></TouchableOpacity></> : null}</View>; }} renderItem={({ item, section, index }) => <View style={{ backgroundColor: COLORS.white, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: index === section.data.length - 1 ? 1 : 0, borderColor: COLORS.line, paddingHorizontal: 10, paddingVertical: 4 }}>{item.kind === 'curve' ? <PreAllumageHeatCurve visiteId={visiteId} sectionCode={section.section_code} fields={section.champs} champsMap={champs} onSaved={(key, value) => { setChamps((m) => ({ ...m, [key]: value })); onSaved?.(); }} onStructureChanged={() => reload(active?.id).catch(() => {})} /> : item.kind === 'regulationGroup' ? <View style={{ marginVertical: 5, padding: 9, borderRadius: 11, borderWidth: 1, borderColor: COLORS.line, backgroundColor: item.title === 'Chauffage' ? '#FFF9F2' : item.title === 'ECS / primaire' ? '#F5FAFF' : '#F9FAFB' }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}><Text style={{ fontSize: 16 }}>{item.icon}</Text><Text style={{ color: COLORS.ink, fontSize: 12, fontWeight: '900' }}>{item.title}</Text></View><View style={{ flexDirection: twoCols ? 'row' : 'column', flexWrap: twoCols ? 'wrap' : 'nowrap', gap: twoCols ? 10 : 0 }}>{item.items.map((x) => <View key={x.key} style={{ width: twoCols ? '48.8%' : '100%', minWidth: 0 }}>{renderCompactField(x, section, { showThermalBadge: false })}</View>)}</View></View> : item.kind === 'fields' ? <View style={{ flexDirection: twoCols ? 'row' : 'column', gap: twoCols ? 12 : 0 }}>{item.items.map((x, i) => <View key={x.key} style={{ flex: 1, minWidth: 0, paddingLeft: twoCols && i > 0 ? 10 : 0, borderLeftWidth: twoCols && i > 0 ? 1 : 0, borderLeftColor: COLORS.line }}>{renderCompactField(x, section)}</View>)}</View> : <PreAllumageCompactControl visiteId={visiteId} sectionCode={section.section_code} field={item.item.field} etatInitial={controls[item.item.key]} localName={active?.nom} localType={active?.type_code} contextLabel={section.title} onEtatChange={(patch) => setControls((m) => ({ ...m, [item.item.key]: { ...(m[item.item.key] || {}), ...patch } }))} onSaved={onSaved} />}</View>} contentContainerStyle={styles.panelContent} keyboardShouldPersistTaps="handled" stickySectionHeadersEnabled={false} initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7} />
    <AddLocalModal visible={addLocal} onClose={() => setAddLocal(false)} onSubmit={submitLocal} /><AddEquipmentModal visible={addEquipment} onClose={() => setAddEquipment(false)} onAdd={submitEquipment} local={active} /><ConfigModal visible={config} local={active} onClose={() => setConfig(false)} onSave={saveConfig} /><ActionsModal visible={actions} local={active} canUp={idx > 0} canDown={idx >= 0 && idx < locals.length - 1} onClose={() => setActions(false)} onAction={(a) => localAction(a).catch((e) => Alert.alert('Action impossible', e.message))} />
  </>;
}
