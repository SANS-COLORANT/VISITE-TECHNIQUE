/** Informations Pré-allumage métier : saisons, exploitants et rédacteurs sélectionnables. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, SectionList, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { getChampsVisite, upsertChamp } from './db.js';
import { chargerPreAllumageModulaire } from './preAllumageModularDb.js';
import { synchroniserNombreLocauxPreAllumage } from './preAllumageBusinessDb.js';
import {
  ajouterReferentielPreAllumage,
  listerReferentielsPreAllumage,
  PREALLUMAGE_REFERENCE_CATEGORIES,
} from './preAllumageReferenceDb.js';
import { COLORS, styles } from './styles.js';

function mapChamps(rows) { return Object.fromEntries((rows || []).map((r) => [`${r.section_code}||${r.cle}`, r.valeur])); }
function masquerDate(value) {
  const chiffres = String(value || '').replace(/\D/g, '').slice(0, 8);
  if (chiffres.length <= 2) return chiffres.length === 2 ? `${chiffres}/` : chiffres;
  if (chiffres.length <= 4) return `${chiffres.slice(0, 2)}/${chiffres.slice(2)}${chiffres.length === 4 ? '/' : ''}`;
  return `${chiffres.slice(0, 2)}/${chiffres.slice(2, 4)}/${chiffres.slice(4)}`;
}
function dateAffichee(value) {
  const t = String(value || '').trim(); const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : t;
}
function dateValide(v) {
  const m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (!m) return false;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return d.getFullYear() === Number(m[3]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[1]);
}
function saisonOptions(valeur) {
  const now = new Date().getFullYear();
  const match = String(valeur || '').match(/^(\d{4})-(\d{4})$/);
  const pivot = match ? Number(match[1]) : now;
  const starts = new Set();
  for (let y = Math.min(now, pivot) - 3; y <= Math.max(now, pivot) + 3; y += 1) starts.add(y);
  return [...starts].sort((a, b) => a - b).map((y) => `${y}-${y + 1}`);
}
function Chip({ label, selected, onPress }) {
  return <TouchableOpacity onPress={onPress} style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 18, borderWidth: 1, borderColor: selected ? COLORS.orange : COLORS.line, backgroundColor: selected ? COLORS.orangeLight : COLORS.white }}><Text style={{ color: selected ? COLORS.orangeDark : COLORS.inkSoft, fontSize: 11, fontWeight: '900' }}>{selected ? '✓ ' : ''}{label}</Text></TouchableOpacity>;
}

function AddReferenceModal({ visible, title, onClose, onSave }) {
  const [value, setValue] = useState('');
  useEffect(() => { if (visible) setValue(''); }, [visible]);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalOverlay}><View style={styles.modalSheet}>
    <Text style={styles.modalTitle}>{title}</Text>
    <Text style={[styles.importHint, { marginBottom: 10 }]}>La nouvelle valeur restera disponible pour les prochaines visites.</Text>
    <TextInput autoFocus value={value} onChangeText={setValue} style={styles.input} placeholder="Code ou nom" autoCapitalize="characters" />
    <View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={onClose}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={() => onSave(value)}><Text style={styles.btnPrimaryText}>Ajouter</Text></TouchableOpacity></View>
  </View></View></Modal>;
}

function ReferenceSingleField({ label, value, items, onSelect, onAdd }) {
  const options = [...items];
  if (value && !options.some((x) => x.code === value)) options.unshift({ id: `current-${value}`, code: value, libelle: value });
  return <View style={{ paddingVertical: 6 }}><Text style={{ color: COLORS.ink, fontSize: 12, fontWeight: '900', marginBottom: 7 }}>{label}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{options.map((x) => <Chip key={x.id || x.code} label={x.libelle || x.code} selected={value === x.code} onPress={() => onSelect(x.code)} />)}<TouchableOpacity onPress={onAdd} style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.orange }}><Text style={{ color: COLORS.orangeDark, fontSize: 11, fontWeight: '900' }}>+ Ajouter</Text></TouchableOpacity></View></View>;
}

function PeopleCompositeField({ value, chargeAffaires, redacteurs, onSave, onAddCharge, onAddRedacteur }) {
  const [principalBrut, secondaireBrut] = String(value || '').split('/').map((x) => x.trim());
  const save = (p, r) => onSave([p, r].filter(Boolean).join(' / '));
  const principaux = [...chargeAffaires];
  if (principalBrut && !principaux.some((x) => x.code === principalBrut)) principaux.unshift({ id: `current-ca-${principalBrut}`, code: principalBrut });
  const seconds = [...redacteurs];
  if (secondaireBrut && !seconds.some((x) => x.code === secondaireBrut)) seconds.unshift({ id: `current-red-${secondaireBrut}`, code: secondaireBrut });
  return <View style={{ paddingVertical: 6 }}>
    <Text style={{ color: COLORS.ink, fontSize: 12, fontWeight: '900' }}>Chargé d’affaires / rédacteur</Text>
    <Text style={{ color: COLORS.inkSoft, fontSize: 10, fontWeight: '800', marginTop: 7, marginBottom: 5 }}>1 · Chargé d’affaires</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{principaux.map((x) => <Chip key={x.id || x.code} label={x.code} selected={principalBrut === x.code} onPress={() => save(x.code, secondaireBrut)} />)}<Chip label="+ Ajouter" selected={false} onPress={onAddCharge} /></View>
    <Text style={{ color: COLORS.inkSoft, fontSize: 10, fontWeight: '800', marginTop: 9, marginBottom: 5 }}>2 · Rédacteur complémentaire (facultatif)</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{seconds.map((x) => <Chip key={x.id || x.code} label={`+ ${x.code}`} selected={secondaireBrut === x.code} onPress={() => save(principalBrut, secondaireBrut === x.code ? '' : x.code)} />)}<Chip label="+ Ajouter" selected={false} onPress={onAddRedacteur} /></View>
    {value ? <Text style={{ color: COLORS.orangeDark, fontSize: 11, fontWeight: '900', marginTop: 8 }}>Valeur rapport : {value}</Text> : null}
  </View>;
}

function StandardField({ visiteId, sectionCode, field, value, onSaved }) {
  const label = field.displayLabel || field.libelle || field.cle;
  const estDate = field.cle === 'Date de la visite';
  const multiline = /Observations générales/i.test(field.cle) || /adresse/i.test(label);
  const [texte, setTexte] = useState(estDate ? dateAffichee(value) : String(value || ''));
  const [error, setError] = useState(false);
  useEffect(() => { setTexte(estDate ? dateAffichee(value) : String(value || '')); setError(false); }, [value, estDate]);
  const save = async () => {
    const propre = String(texte || '').trim();
    if (estDate && !dateValide(propre)) { setError(true); return; }
    await upsertChamp(visiteId, sectionCode, field.cle, propre);
    if (estDate) await upsertChamp(visiteId, 'pa-infos.informations_g_n_rales', 'Date de visite', propre);
    onSaved(propre);
  };
  return <View style={{ paddingVertical: 6 }}><Text style={{ color: COLORS.ink, fontSize: 12, fontWeight: '800', marginBottom: 5 }}>{label}</Text><TextInput style={[styles.input, { minHeight: multiline ? 68 : 42, textAlignVertical: multiline ? 'top' : 'center', fontSize: 12 }, error && { borderColor: COLORS.red }]} multiline={multiline} value={texte} onChangeText={(v) => { setError(false); setTexte(estDate ? masquerDate(v) : v); }} onBlur={() => save().catch(console.warn)} keyboardType={estDate ? 'number-pad' : 'default'} placeholder={estDate ? 'JJ/MM/AAAA' : 'Saisir…'} />{error ? <Text style={{ color: COLORS.red, fontSize: 10, marginTop: 4 }}>Date attendue au format JJ/MM/AAAA.</Text> : null}</View>;
}

function grouper(items, twoCols) {
  const rows = []; let buf = [];
  const flush = () => { if (buf.length) rows.push({ key: buf.map((x) => x.key).join('|'), items: buf }); buf = []; };
  for (const item of items) {
    const large = /Observations générales|Nom du local \/ adresse|Saison de chauffe|Exploitant|Chargé d’affaires|Nombre de sous-stations/i.test(item.field.cle);
    if (large) { flush(); rows.push({ key: item.key, items: [item], large: true }); continue; }
    buf.push(item); if (!twoCols || buf.length === 2) flush();
  }
  flush(); return rows;
}

export function PreAllumageInfoPanelV3({ visiteId, onSaved }) {
  const { width } = useWindowDimensions(); const twoCols = width >= 720;
  const [modele, setModele] = useState(null); const [champs, setChamps] = useState({});
  const [refs, setRefs] = useState({ exploitant: [], charge_affaires: [], redacteur: [] });
  const [addTarget, setAddTarget] = useState(null);

  const loadRefs = useCallback(async () => {
    const [exploitant, charge_affaires, redacteur] = await Promise.all([
      listerReferentielsPreAllumage(PREALLUMAGE_REFERENCE_CATEGORIES.EXPLOITANT),
      listerReferentielsPreAllumage(PREALLUMAGE_REFERENCE_CATEGORIES.CHARGE_AFFAIRES),
      listerReferentielsPreAllumage(PREALLUMAGE_REFERENCE_CATEGORIES.REDACTEUR),
    ]);
    setRefs({ exploitant, charge_affaires, redacteur });
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([chargerPreAllumageModulaire(visiteId), getChampsVisite(visiteId), synchroniserNombreLocauxPreAllumage(visiteId), loadRefs()]).then(async ([m, c]) => {
      if (!alive) return;
      setModele(m); setChamps(mapChamps(await getChampsVisite(visiteId)));
    }).catch(console.warn);
    return () => { alive = false; };
  }, [visiteId, loadRefs]);

  const saveValue = async (sectionCode, key, value) => {
    await upsertChamp(visiteId, sectionCode, key, value);
    setChamps((m) => ({ ...m, [`${sectionCode}||${key}`]: value })); onSaved?.();
  };

  const addReference = async (raw) => {
    if (!addTarget || !String(raw || '').trim()) { setAddTarget(null); return; }
    await ajouterReferentielPreAllumage(addTarget.category, raw); await loadRefs();
    const code = String(raw).trim().toUpperCase();
    if (addTarget.sectionCode && addTarget.key && addTarget.mode === 'single') await saveValue(addTarget.sectionCode, addTarget.key, code);
    setAddTarget(null);
  };

  const sections = useMemo(() => {
    if (!modele) return [];
    return (modele.rubriques || []).filter((r) => r.panel_id === 'p-pa-infos').map((r) => {
      const items = (r.champs || []).filter((c) => c.field.cle !== 'Date de visite').map((c) => ({ key: `${r.section_code}||${c.field.cle}`, field: { ...c.field, displayLabel: c.libelle } }));
      return { id: r.id, title: r.nom, sectionCode: r.section_code, data: grouper(items, twoCols) };
    }).filter((s) => s.data.length);
  }, [modele, twoCols]);

  if (!modele) return <View style={{ padding: 30 }}><ActivityIndicator color={COLORS.orange} /></View>;
  const renderField = (x, sectionCode) => {
    const value = champs[x.key] || '';
    if (x.field.cle === 'Saison de chauffe') return <View style={{ paddingVertical: 6 }}><Text style={{ color: COLORS.ink, fontSize: 12, fontWeight: '900', marginBottom: 7 }}>Saison de chauffe</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 10 }}>{saisonOptions(value).map((s) => <Chip key={s} label={s} selected={value === s} onPress={() => saveValue(sectionCode, x.field.cle, s).catch(console.warn)} />)}</ScrollView></View>;
    if (x.field.cle === 'Exploitant') return <ReferenceSingleField label="Exploitant" value={value} items={refs.exploitant} onSelect={(v) => saveValue(sectionCode, x.field.cle, v).catch(console.warn)} onAdd={() => setAddTarget({ category: PREALLUMAGE_REFERENCE_CATEGORIES.EXPLOITANT, title: 'Ajouter un exploitant', sectionCode, key: x.field.cle, mode: 'single' })} />;
    if (x.field.cle === 'Chargé d’affaires / rédacteur') return <PeopleCompositeField value={value} chargeAffaires={refs.charge_affaires} redacteurs={refs.redacteur} onSave={(v) => saveValue(sectionCode, x.field.cle, v).catch(console.warn)} onAddCharge={() => setAddTarget({ category: PREALLUMAGE_REFERENCE_CATEGORIES.CHARGE_AFFAIRES, title: 'Ajouter un chargé d’affaires' })} onAddRedacteur={() => setAddTarget({ category: PREALLUMAGE_REFERENCE_CATEGORIES.REDACTEUR, title: 'Ajouter un rédacteur' })} />;
    if (x.field.cle === 'Nombre de sous-stations') return <View style={{ paddingVertical: 6 }}><Text style={{ color: COLORS.ink, fontSize: 12, fontWeight: '900' }}>Nb de locaux</Text><View style={{ marginTop: 6, minHeight: 42, justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 9, backgroundColor: '#F9FAFB', paddingHorizontal: 12 }}><Text style={{ color: COLORS.ink, fontSize: 14, fontWeight: '900' }}>{value || '0'}</Text></View><Text style={{ color: COLORS.inkSoft, fontSize: 9, marginTop: 4 }}>Calculé automatiquement à partir des locaux ajoutés, quel que soit leur type.</Text></View>;
    return <StandardField visiteId={visiteId} sectionCode={sectionCode} field={x.field} value={value} onSaved={(v) => { setChamps((m) => ({ ...m, [x.key]: v })); onSaved?.(); }} />;
  };

  return <>
    <SectionList sections={sections} keyExtractor={(r) => r.key} renderSectionHeader={({ section }) => <View style={{ marginTop: 5, marginBottom: 4 }}><Text style={{ color: COLORS.ink, fontSize: 14, fontWeight: '900' }}>{section.title}</Text></View>} renderItem={({ item, section }) => <View style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 3, marginBottom: 7 }}><View style={{ flexDirection: item.large || !twoCols ? 'column' : 'row', gap: item.large || !twoCols ? 0 : 12 }}>{item.items.map((x, i) => <View key={x.key} style={{ flex: 1, minWidth: 0, paddingLeft: twoCols && !item.large && i > 0 ? 10 : 0, borderLeftWidth: twoCols && !item.large && i > 0 ? 1 : 0, borderLeftColor: COLORS.line }}>{renderField(x, section.sectionCode)}</View>)}</View></View>} contentContainerStyle={styles.panelContent} keyboardShouldPersistTaps="handled" stickySectionHeadersEnabled={false} />
    <AddReferenceModal visible={!!addTarget} title={addTarget?.title || 'Ajouter une valeur'} onClose={() => setAddTarget(null)} onSave={(v) => addReference(v).catch(console.warn)} />
  </>;
}
