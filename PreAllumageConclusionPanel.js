/** Conclusion Pré-allumage proposée automatiquement depuis les remarques de la visite. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getChampsVisite, upsertChamp } from './db.js';
import { listerRemarquesVisite } from './remarkDb.js';
import { chargerPreAllumageModulaire } from './preAllumageModularDb.js';
import { reserveSeverityLabel } from './reserveSeverity.js';
import { COLORS, styles } from './styles.js';

function mapChamps(rows) { return Object.fromEntries((rows || []).map((r) => [`${r.section_code}||${r.cle}`, r.valeur])); }
function normaliserTexte(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function contexteRemarque(r) {
  const ref = String(r.reference_libelle || '').trim(); if (ref) return ref.split(' · ')[0].trim();
  const origine = String(r.origine || '').trim(); if (!origine) return 'Visite';
  return origine.split(' — ')[0].trim() || 'Visite';
}
function grouperRemarques(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const prestation = String(r.prestation || '').trim(); if (!prestation) continue;
    const key = normaliserTexte(prestation); if (!key) continue;
    const exist = map.get(key) || { prestation, count: 0, contexts: new Set(), criticite: 0, items: [] };
    exist.count += 1; exist.contexts.add(contexteRemarque(r)); exist.criticite = Math.max(exist.criticite, Number(r.criticite) || 0); exist.items.push(r); map.set(key, exist);
  }
  return [...map.values()].sort((a, b) => b.criticite - a.criticite || b.count - a.count || a.prestation.localeCompare(b.prestation));
}
function ligneSynthese(g) {
  const contexts = [...g.contexts];
  const suffix = g.count > 1 ? ` — ${g.count} constats regroupés${contexts.length ? ` : ${contexts.join(', ')}` : ''}` : (contexts[0] && contexts[0] !== 'Visite' ? ` — ${contexts[0]}` : '');
  return `• ${g.prestation}${suffix}`;
}

function LongField({ visiteId, sectionCode, label, storageKey, value, onSaved }) {
  const [text, setText] = useState(String(value || ''));
  useEffect(() => { setText(String(value || '')); }, [value]);
  const save = async () => { await upsertChamp(visiteId, sectionCode, storageKey, text); onSaved(text); };
  return <View style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 10, padding: 10, marginBottom: 7 }}><Text style={{ color: COLORS.ink, fontSize: 12, fontWeight: '900', marginBottom: 6 }}>{label}</Text><TextInput multiline value={text} onChangeText={setText} onBlur={() => save().catch(console.warn)} placeholder="Saisir ou compléter…" style={[styles.input, { minHeight: /Conclusion libre/i.test(label) ? 130 : 82, textAlignVertical: 'top', fontSize: 12 }]} /></View>;
}

export function PreAllumageConclusionPanel({ visiteId, onSaved }) {
  const [model, setModel] = useState(null); const [champs, setChamps] = useState({}); const [remarks, setRemarks] = useState([]); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { const [m, c, r] = await Promise.all([chargerPreAllumageModulaire(visiteId), getChampsVisite(visiteId), listerRemarquesVisite(visiteId)]); setModel(m); setChamps(mapChamps(c)); setRemarks(r || []); } finally { setLoading(false); }
  }, [visiteId]);
  useEffect(() => { load().catch(console.warn); }, [load]);

  const rubriques = useMemo(() => (model?.rubriques || []).filter((r) => r.panel_id === 'p-pa-conclusion'), [model]);
  const groupes = useMemo(() => grouperRemarques(remarks), [remarks]);
  const synthese = useMemo(() => groupes.length ? groupes.map(ligneSynthese).join('\n') : '', [groupes]);
  const doublons = useMemo(() => groupes.filter((g) => g.count > 1).reduce((s, g) => s + g.count - 1, 0), [groupes]);

  const inserer = async () => {
    const targetRubrique = rubriques.find((r) => (r.champs || []).some((c) => c.field.cle === 'Conclusion libre du chargé d’affaires'));
    if (!targetRubrique) return;
    const prefix = groupes.length ? `Synthèse issue de ${remarks.length} remarque${remarks.length > 1 ? 's' : ''} de la visite :\n` : '';
    const value = `${prefix}${synthese}`.trim();
    await upsertChamp(visiteId, targetRubrique.section_code, 'Conclusion libre du chargé d’affaires', value);
    const key = `${targetRubrique.section_code}||Conclusion libre du chargé d’affaires`;
    setChamps((m) => ({ ...m, [key]: value })); onSaved?.();
  };

  if (loading && !model) return <View style={{ padding: 30 }}><ActivityIndicator color={COLORS.orange} /></View>;
  return <ScrollView contentContainerStyle={styles.panelContent} keyboardShouldPersistTaps="handled">
    <View style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 13, padding: 12, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1 }}><Text style={{ color: COLORS.ink, fontSize: 15, fontWeight: '900' }}>Conclusion proposée depuis les remarques</Text><Text style={{ color: COLORS.inkSoft, fontSize: 10, marginTop: 3 }}>{remarks.length} remarque{remarks.length > 1 ? 's' : ''} · {groupes.length} sujet{groupes.length > 1 ? 's' : ''} synthétisé{groupes.length > 1 ? 's' : ''}{doublons ? ` · ${doublons} répétition${doublons > 1 ? 's' : ''} regroupée${doublons > 1 ? 's' : ''}` : ''}</Text></View><TouchableOpacity onPress={() => load().catch(console.warn)} style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: COLORS.line, borderRadius: 9 }}><Text style={{ color: COLORS.inkSoft, fontSize: 10, fontWeight: '900' }}>Actualiser</Text></TouchableOpacity></View>
      {groupes.length ? <View style={{ marginTop: 10, gap: 7 }}>{groupes.map((g, i) => <View key={`${normaliserTexte(g.prestation)}-${i}`} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.line, paddingTop: i ? 7 : 0 }}><View style={{ flexDirection: 'row', gap: 7 }}><Text style={{ flex: 1, color: COLORS.ink, fontSize: 11, lineHeight: 16 }}>{ligneSynthese(g)}</Text><Text style={{ color: g.criticite >= 4 ? COLORS.red : COLORS.inkSoft, fontSize: 9, fontWeight: '900' }}>C{g.criticite} · {reserveSeverityLabel(g.criticite)}</Text></View></View>)}</View> : <Text style={{ color: COLORS.inkSoft, fontSize: 11, marginTop: 10 }}>Aucune remarque : la conclusion reste entièrement libre.</Text>}
      {groupes.length ? <TouchableOpacity onPress={() => inserer().catch(console.warn)} style={{ alignSelf: 'flex-start', marginTop: 12, minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: COLORS.orange }}><Text style={{ color: COLORS.white, fontWeight: '900', fontSize: 11 }}>Insérer cette synthèse dans la conclusion</Text></TouchableOpacity> : null}
    </View>

    {rubriques.map((r) => <View key={r.id} style={{ marginBottom: 10 }}><Text style={{ color: COLORS.ink, fontSize: 14, fontWeight: '900', marginBottom: 5 }}>{r.nom}</Text>{(r.champs || []).map((c) => { const key = `${r.section_code}||${c.field.cle}`; return <LongField key={c.id} visiteId={visiteId} sectionCode={r.section_code} label={c.libelle || c.field.cle} storageKey={c.field.cle} value={champs[key]} onSaved={(value) => { setChamps((m) => ({ ...m, [key]: value })); onSaved?.(); }} />; })}</View>)}
  </ScrollView>;
}
