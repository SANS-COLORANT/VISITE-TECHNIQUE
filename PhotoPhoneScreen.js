import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CvcIcon } from './MetraCvcIcons.js';
import { COLORS, FONTS } from './styles.js';
import { getRuntimeAccent, getRuntimePalette } from './visual-packs/runtime/visualPaletteRuntime.js';
import { openAppDatabase } from './database/index.js';
import { applyCompanionTargetUpdate, buildCompanionVisitSnapshot, importCompanionPhoto } from './companionData.js';
import { prendrePhoto } from './PhotoButton.js';
import { prewarmCameraRuntime } from './cameraRuntime.js';
import { demarrerDicteeLocale, dicteeLocaleDisponible, reconnaitreTexteImageLocale } from './missionNativeTools.js';
import { ajouterRemarqueVisite, modifierRemarqueVisite } from './remarkDb.js';
import { extraireChampsPlaque, extraireValeurOcr } from './photoModeData.js';
import { IconOrb, FadeUp } from './premiumChrome.js';
import { ajouterCompteur, ajouterMateriel } from './db.js';
import { ButtonGlow } from './ButtonGlow.js';
import { feedback, hapticTick } from './fieldFeedback.js';

const clean = (v) => String(v == null ? '' : v).trim();
const card = {
  borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', borderRadius: 18, backgroundColor: '#FDFCFA',
  shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2,
};
const iconBox = (light, size = 46) => ({ width: size, height: size, borderRadius: 14, backgroundColor: light, alignItems: 'center', justifyContent: 'center' });

function Header({ title, subtitle, icon = 'camera', onBack, onExit, accent, light }) {
  return <View style={{ paddingTop: 47, paddingHorizontal: 14, paddingBottom: 11, backgroundColor: 'transparent' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {onBack ? <TouchableOpacity accessibilityLabel="Retour" onPress={onBack} style={[iconBox(COLORS.white, 42), { borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)' }]}><CvcIcon name="chevron-left" size={23} color={COLORS.ink} strokeWidth={2.1} /></TouchableOpacity> : null}
      <IconOrb accent={accent} light={light} size={44}><CvcIcon name={icon} size={26} color={accent} /></IconOrb>
      <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ fontSize: 18.5, fontFamily: FONTS.black, color: COLORS.ink }}>{title}</Text>{subtitle ? <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 11.5, color: COLORS.inkSoft }}>{subtitle}</Text> : null}</View>
      {onExit ? <TouchableOpacity accessibilityLabel="Quitter le mode Photo" onPress={onExit} style={[iconBox(COLORS.white, 42), { borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)' }]}><CvcIcon name="close" size={21} color={COLORS.inkSoft} strokeWidth={2.1} /></TouchableOpacity> : null}
    </View>
  </View>;
}

function Status({ text, accent, light }) {
  if (!text) return null;
  return <View style={{ alignSelf: 'center', marginTop: 8, maxWidth: '92%', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: light }}><Text style={{ color: accent, fontSize: 11, fontFamily: FONTS.black, textAlign: 'center' }}>{text}</Text></View>;
}

function ModuleTile({ item, onPress, accent, light }) {
  const count = Number(item.count || 0);
  return <TouchableOpacity accessibilityLabel={item.label + ' : ' + count} onPress={() => onPress(item)} style={[card, { width: '100%', minHeight: 60, paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 9 }]}>
    <IconOrb accent={accent} light={light} size={36}><CvcIcon name={item.icon} size={20} color={accent} /></IconOrb>
    <Text numberOfLines={1} style={{ flex: 1, color: COLORS.ink, fontFamily: FONTS.bold, fontSize: 12.5 }}>{item.label}</Text>
    <Text style={{ color: count ? accent : COLORS.inkFaint, fontSize: 15, fontFamily: FONTS.black }}>{count}</Text>
  </TouchableOpacity>;
}

function VisitRow({ item, onPress, accent, light }) {
  const active = clean(item.statut) === 'en_cours';
  return <TouchableOpacity onPress={() => onPress(item)} style={[card, { marginBottom: 9, minHeight: 76, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderColor: active ? accent : COLORS.line }]}>
    <IconOrb accent={accent} light={light} size={44}><CvcIcon name="camera" size={25} color={accent} /></IconOrb>
    <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ fontFamily: FONTS.black, color: COLORS.ink }}>{item.nom_local || item.nom_site || 'Visite'}</Text><Text numberOfLines={1} style={{ marginTop: 3, color: COLORS.inkSoft, fontSize: 11 }}>{[item.nom_client, item.nom_site].filter(Boolean).join(' · ')}</Text><Text style={{ marginTop: 3, color: active ? accent : COLORS.inkFaint, fontSize: 10.5 }}>{active ? 'EN COURS · ' : ''}{item.date_visite || ''} · {item.trame_id || 'ICPE'}</Text></View>
    <CvcIcon name="chevron-right" size={23} color={COLORS.inkFaint} strokeWidth={2.1} />
  </TouchableOpacity>;
}

function TargetRow({ item, module, onOpen, onCapture, busy, accent, light }) {
  const value = [clean(item.value), clean(item.unit)].filter(Boolean).join(' ');
  return <View style={[card, { marginBottom: 9, minHeight: 68, flexDirection: 'row', overflow: 'hidden' }]}>
    <TouchableOpacity onPress={() => onOpen(item)} style={{ flex: 1, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <IconOrb accent={accent} light={light} size={40}><CvcIcon name={module.icon} size={22} color={accent} /></IconOrb>
      <View style={{ flex: 1 }}><Text numberOfLines={2} style={{ color: COLORS.ink, fontFamily: FONTS.black, fontSize: 13.5 }}>{item.label}</Text>{value ? <Text style={{ marginTop: 3, color: accent, fontFamily: FONTS.black, fontSize: 12 }}>{value}</Text> : null}{item.subtitle ? <Text numberOfLines={1} style={{ marginTop: 2, color: COLORS.inkSoft, fontSize: 10.5 }}>{item.subtitle}</Text> : null}</View>
    </TouchableOpacity>
    <TouchableOpacity accessibilityLabel={'Photographier ' + item.label} onPressIn={() => prewarmCameraRuntime().catch(() => {})} onPress={() => onCapture(item)} disabled={busy} style={{ width: 58, borderLeftWidth: 1, borderLeftColor: COLORS.line, backgroundColor: light, alignItems: 'center', justifyContent: 'center' }}>{busy ? <ActivityIndicator color={accent} /> : <CvcIcon name="camera" size={27} color={accent} />}</TouchableOpacity>
  </View>;
}

function Field({ field, onSave, saving, accent, light }) {
  const [value, setValue] = useState(field?.value == null ? '' : String(field.value));
  useEffect(() => setValue(field?.value == null ? '' : String(field.value)), [field?.id, field?.value]);
  if (Array.isArray(field?.options) && field.options.length) return <View style={{ marginBottom: 12 }}><Text style={{ marginBottom: 6, color: COLORS.inkSoft, fontSize: 11.5, fontFamily: FONTS.black }}>{field.label}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{field.options.map((option) => { const selected = String(field.value ?? '') === String(option); return <TouchableOpacity key={String(option)} disabled={saving} onPress={() => onSave(field, String(option))} style={{ minWidth: 44, minHeight: 40, paddingHorizontal: 9, borderRadius: 11, borderWidth: 1, borderColor: selected ? accent : COLORS.line, backgroundColor: selected ? light : COLORS.white, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: selected ? accent : COLORS.ink, fontFamily: FONTS.black }}>{option}</Text></TouchableOpacity>; })}</View></View>;
  const save = () => { if (value !== String(field.value ?? '')) onSave(field, value); };
  return <View style={{ marginBottom: 12 }}><Text style={{ marginBottom: 6, color: COLORS.inkSoft, fontSize: 11.5, fontFamily: FONTS.black }}>{field.label}{field.unit ? ' · ' + field.unit : ''}</Text><TextInput value={value} onChangeText={setValue} onBlur={save} onSubmitEditing={() => { if (!field.multiline) save(); }} keyboardType={field.input === 'numeric' ? 'decimal-pad' : 'default'} multiline={Boolean(field.multiline)} placeholder="Saisir…" style={{ minHeight: field.multiline ? 78 : 46, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', paddingHorizontal: 11, paddingVertical: field.multiline ? 9 : 0, textAlignVertical: field.multiline ? 'top' : 'center', color: COLORS.ink }} /></View>;
}

function RemarkEditor({ remark, onClose, onChanged, accent, light }) {
  const [value, setValue] = useState(remark.text || '');
  const [severity, setSeverity] = useState(Number(remark.criticite || 2));
  const [dictating, setDictating] = useState(false);
  const save = async (next) => { await modifierRemarqueVisite(remark.id, { prestation: next }); onChanged?.(); };
  const dictate = async () => { if (dictating) return; setDictating(true); try { if (!await dicteeLocaleDisponible()) throw new Error('Dictée Android indisponible.'); const out = await demarrerDicteeLocale('fr-FR'); const spoken = clean(out?.text); if (spoken) { const merged = clean(value) ? clean(value) + ' ' + spoken : spoken; setValue(merged); await save(merged); } } catch (e) { Alert.alert('Dictée impossible', String(e?.message || e)); } finally { setDictating(false); } };
  const changeSeverity = async (n) => { setSeverity(n); await modifierRemarqueVisite(remark.id, { criticite: n }); onChanged?.(); };
  return <View style={{ flex: 1, backgroundColor: 'transparent' }}><Header title="Remarque" subtitle="Enregistrement automatique" icon="remark" onBack={onClose} accent={accent} light={light} /><ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled"><View style={[card, { padding: 14 }]}><View style={{ flexDirection: 'row', gap: 8 }}><TextInput autoFocus multiline value={value} onChangeText={setValue} onBlur={() => save(value)} placeholder="Décrire la remarque…" style={{ flex: 1, minHeight: 112, borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)', borderRadius: 12, padding: 10, textAlignVertical: 'top', color: COLORS.ink }} /><TouchableOpacity accessibilityLabel="Dicter" onPress={dictate} style={[iconBox(light, 52), { alignSelf: 'stretch', height: 'auto' }]}>{dictating ? <ActivityIndicator color={accent} /> : <CvcIcon name="microphone" size={27} color={accent} />}</TouchableOpacity></View><Text style={{ marginTop: 17, marginBottom: 7, fontFamily: FONTS.black, color: COLORS.ink }}>Criticité</Text><View style={{ flexDirection: 'row', gap: 6 }}>{[1,2,3,4,5].map((n) => <TouchableOpacity key={n} onPress={() => changeSeverity(n)} style={{ flex: 1, minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: severity === n ? accent : COLORS.line, backgroundColor: severity === n ? light : COLORS.white, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: severity === n ? accent : COLORS.ink, fontFamily: FONTS.black }}>{n}</Text></TouchableOpacity>)}</View></View></ScrollView></View>;
}

const COMPTEUR_TYPES = [
  'Compteur gaz', 'Compteur énergie chauffage', 'Compteur énergie ECS', 'Compteur eau appoint chauffage',
  'Compteur eau froide ECS', 'Compteur eau froide générale', 'Compteur électrique', 'Compteur fioul',
  'Compteur calories', 'Compteur volumétrique', 'Manomètre chauffage', 'Manomètre ECS',
];
const UNITES = ['m³', 'L', 'MWh', 'kWh', 'bar', '%'];

// Tuile de saisie rapide (écran principal du Mode Photo).
function QuickTile({ icon, label, hint, onPress, busy, accent, light, primary = false }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} disabled={busy} onPressIn={() => prewarmCameraRuntime().catch(() => {})} onPress={onPress} activeOpacity={0.86} style={[card, { flex: 1, minHeight: 96, padding: 12, justifyContent: 'space-between', overflow: 'hidden' }, primary ? { borderColor: 'transparent' } : null]}>
    {primary ? <ButtonGlow radius={18} /> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? 'rgba(255,255,255,0.22)' : light }}>
        {busy ? <ActivityIndicator color={primary ? COLORS.white : accent} /> : <CvcIcon name={icon} size={23} color={primary ? COLORS.white : accent} />}
      </View>
      <CvcIcon name="plus" size={16} color={primary ? COLORS.white : accent} strokeWidth={2.4} />
    </View>
    <View>
      <Text numberOfLines={1} style={{ color: primary ? COLORS.white : COLORS.ink, fontFamily: FONTS.black, fontSize: 14 }}>{label}</Text>
      {hint ? <Text numberOfLines={1} style={{ marginTop: 1, color: primary ? 'rgba(255,255,255,0.85)' : COLORS.inkSoft, fontSize: 10.5, fontFamily: FONTS.bodySemi }}>{hint}</Text> : null}
    </View>
  </TouchableOpacity>;
}

// Ligne de relevé : valeur saisie directement (clavier numérique, « Suivant »
// enchaîne sur la ligne suivante) ou lue sur photo (OCR local).
const QuickValueRow = React.forwardRef(function QuickValueRow({ item, module, onSave, onCapture, onOpen, onNext, busy, highlight, accent, light }, ref) {
  const field = numericField(module.id, item);
  const unitField = (item.fields || []).find((f) => f?.edit?.kind === 'counter' && f?.edit?.key === 'unite');
  const initial = field?.value == null ? '' : String(field.value);
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  const unit = clean(unitField?.value || field?.unit || item.unit);
  const lastSaved = React.useRef(initial);
  useEffect(() => { lastSaved.current = initial; }, [initial]);
  const commit = () => {
    const next = value.replace(',', '.').trim();
    if (!field?.edit || next === lastSaved.current) return;
    lastSaved.current = next; onSave(field, next);
  };
  const cycleUnit = () => {
    if (!unitField?.edit) return;
    const next = UNITES[(UNITES.indexOf(unit) + 1) % UNITES.length] || UNITES[0];
    hapticTick(); onSave(unitField, next);
  };
  const filled = clean(initial) !== '';
  return <View style={[card, { marginBottom: 8, minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, overflow: 'hidden' }, highlight ? { borderColor: accent, borderWidth: 1.5 } : null]}>
    <TouchableOpacity accessibilityLabel={'Détails ' + item.label} onPress={() => onOpen(item)} style={{ flex: 1, minWidth: 0, paddingVertical: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: filled ? '#2E9D5B' : '#D6D1C6' }} />
        <Text numberOfLines={2} style={{ flex: 1, color: COLORS.ink, fontFamily: FONTS.bold, fontSize: 13 }}>{item.label}</Text>
      </View>
    </TouchableOpacity>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 8 }}>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={setValue}
        onBlur={commit}
        onSubmitEditing={() => { commit(); onNext?.(); }}
        blurOnSubmit={false}
        returnKeyType="next"
        keyboardType="decimal-pad"
        placeholder="—"
        placeholderTextColor={COLORS.inkFaint}
        selectTextOnFocus
        style={{ width: 92, minHeight: 44, paddingHorizontal: 10, borderRadius: 12, backgroundColor: COLORS.white, borderWidth: 1, borderColor: filled ? 'rgba(46,157,91,0.35)' : 'rgba(22,21,15,0.12)', textAlign: 'right', fontSize: 16, fontFamily: FONTS.black, color: COLORS.ink }}
      />
      {unitField ? <TouchableOpacity accessibilityLabel={'Unité ' + (unit || 'à choisir')} onPress={cycleUnit} style={{ minWidth: 40, minHeight: 36, paddingHorizontal: 7, borderRadius: 10, backgroundColor: light, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: accent, fontFamily: FONTS.black, fontSize: 11.5 }}>{unit || 'Unité'}</Text></TouchableOpacity>
        : unit ? <Text style={{ color: COLORS.inkSoft, fontFamily: FONTS.bodySemi, fontSize: 11.5 }}>{unit}</Text> : null}
    </View>
    <TouchableOpacity accessibilityLabel={'Lire la valeur sur photo : ' + item.label} onPressIn={() => prewarmCameraRuntime().catch(() => {})} onPress={() => onCapture(item)} disabled={busy} style={{ width: 54, alignSelf: 'stretch', marginLeft: 8, borderLeftWidth: 1, borderLeftColor: COLORS.line, backgroundColor: light, alignItems: 'center', justifyContent: 'center' }}>
      {busy ? <ActivityIndicator color={accent} /> : <CvcIcon name="camera" size={24} color={accent} />}
    </TouchableOpacity>
  </View>;
});

// Choix rapide du type de compteur (1 appui = compteur créé + appareil photo).
function CounterTypeSheet({ visible, onClose, onPick, accent, light }) {
  const [libre, setLibre] = useState('');
  useEffect(() => { if (visible) setLibre(''); }, [visible]);
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(22,21,15,0.36)', padding: 10 }}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1 }} />
      <View style={{ backgroundColor: '#FBFAF7', borderRadius: 26, padding: 18, maxHeight: '80%' }}>
        <Text style={{ fontSize: 18.5, fontFamily: FONTS.black, color: COLORS.ink }}>Nouveau compteur</Text>
        <Text style={{ marginTop: 3, marginBottom: 12, fontSize: 12, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft }}>Choisis le type : l'appareil photo s'ouvre pour lire l'index.</Text>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {COMPTEUR_TYPES.map((t) => <TouchableOpacity key={t} onPress={() => onPick(t)} style={{ minHeight: 42, paddingHorizontal: 13, borderRadius: 21, backgroundColor: COLORS.white, borderWidth: 1, borderColor: 'rgba(22,21,15,0.12)', justifyContent: 'center' }}><Text style={{ fontSize: 12.5, fontFamily: FONTS.bodySemi, color: COLORS.ink }}>{t.replace(/^Compteur /, '')}</Text></TouchableOpacity>)}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <TextInput value={libre} onChangeText={setLibre} placeholder="Autre nom…" placeholderTextColor={COLORS.inkFaint} returnKeyType="done" onSubmitEditing={() => { if (clean(libre)) onPick(clean(libre)); }} style={{ flex: 1, minHeight: 46, paddingHorizontal: 13, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: 'rgba(22,21,15,0.12)', fontSize: 14, fontFamily: FONTS.bodyMedium, color: COLORS.ink }} />
          <TouchableOpacity disabled={!clean(libre)} onPress={() => onPick(clean(libre))} style={{ minHeight: 46, paddingHorizontal: 16, borderRadius: 14, backgroundColor: clean(libre) ? accent : light, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: clean(libre) ? COLORS.white : accent, fontFamily: FONTS.bodyBold }}>Créer</Text></TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function numericField(moduleId, target) {
  const fields = target?.fields || [];
  if (moduleId === 'meters') return fields.find((f) => f?.edit?.kind === 'counter' && f?.edit?.key === 'valeur') || fields.find((f) => f?.input === 'numeric');
  if (moduleId === 'temperatures') return fields.find((f) => f?.input === 'numeric') || fields[0];
  return null;
}

function PhotoPhoneScreen({ onExit, visiteId: visiteInitiale = null }) {
  const palette = getRuntimePalette();
  const accent = getRuntimeAccent();
  const light = palette.light || COLORS.orangeLight;
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState([]);
  const [snapshot, setSnapshot] = useState(null);
  const [moduleId, setModuleId] = useState(null);
  const [targetId, setTargetId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [savingField, setSavingField] = useState(null);
  const [status, setStatus] = useState('');
  const [remark, setRemark] = useState(null);
  const [counterSheet, setCounterSheet] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const valueRefs = React.useRef({});
  const modules = snapshot?.modules || [];
  const module = useMemo(() => modules.find((m) => m.id === moduleId) || null, [modules, moduleId]);
  const target = useMemo(() => module?.targets?.find((t) => String(t.id) === String(targetId)) || null, [module, targetId]);

  const openSnapshot = useCallback(async (id, reset = false) => { const next = await buildCompanionVisitSnapshot(id); setSnapshot(next); if (reset) { setModuleId(null); setTargetId(null); } return next; }, []);
  const refresh = useCallback(() => snapshot?.visit?.id ? openSnapshot(snapshot.visit.id) : Promise.resolve(null), [openSnapshot, snapshot?.visit?.id]);

  const loadVisits = useCallback(async () => {
    setLoading(true);
    try {
      const db = await openAppDatabase();
      const sql = "SELECT v.id,v.date_visite,v.statut,v.trame_id,v.modifie_le,s.nom_site,c.nom AS nom_client,i.nom AS nom_local FROM visites v JOIN sites s ON s.id=v.site_id JOIN clients c ON c.id=s.client_id LEFT JOIN installations i ON i.id=v.installation_id ORDER BY CASE WHEN v.statut='en_cours' THEN 0 ELSE 1 END,COALESCE(v.modifie_le,v.date_visite,'') DESC LIMIT 40";
      const rows = await db.getAllAsync(sql); setVisits(rows || []);
      const active = (rows || []).filter((r) => clean(r.statut) === 'en_cours');
      if (active.length === 1) { await openSnapshot(active[0].id, true); setStatus('Visite en cours ouverte'); }
    } catch (e) { Alert.alert('Mode Photo', String(e?.message || e)); } finally { setLoading(false); }
  }, [openSnapshot]);

  useEffect(() => {
    prewarmCameraRuntime().catch(() => {});
    if (visiteInitiale) {
      // Ouvert depuis une visite : pas de liste, on entre directement dedans.
      openSnapshot(visiteInitiale, true).catch((e) => Alert.alert('Mode Photo', String(e?.message || e))).finally(() => setLoading(false));
      return;
    }
    loadVisits().catch(() => {});
  }, [loadVisits, openSnapshot, visiteInitiale]);

  const saveField = useCallback(async (field, value) => {
    if (!snapshot?.visit?.id || !field?.edit) return;
    setSavingField(String(field.id));
    try { setSnapshot(await applyCompanionTargetUpdate({ visiteId: snapshot.visit.id, edit: field.edit, value })); setStatus('✓ Enregistré'); }
    catch (e) { Alert.alert('Enregistrement impossible', String(e?.message || e)); }
    finally { setSavingField(null); }
  }, [snapshot?.visit?.id]);

  const capture = useCallback(async ({ currentModule, currentTarget = null, plaque = false, label = null } = {}) => {
    if (!snapshot?.visit?.id || busy) return;
    const key = (currentModule?.id || 'photos') + ':' + (currentTarget?.id || 'general') + ':' + (plaque ? 'plate' : 'shot');
    setBusy(key);
    try {
      const uri = await prendrePhoto(); if (!uri) return;
      const wantsOcr = plaque || currentModule?.id === 'meters' || currentModule?.id === 'temperatures';
      const ocrPromise = wantsOcr ? reconnaitreTexteImageLocale(uri).catch(() => null) : Promise.resolve(null);
      const storePromise = importCompanionPhoto({ visiteId: snapshot.visit.id, uri, meta: { targetKey: currentTarget?.targetKey || null, label: label || (plaque ? 'Plaque signalétique' : currentTarget?.label || 'Photo terrain'), moduleId: currentModule?.id || 'photos' } });
      const [ocr] = await Promise.all([ocrPromise, storePromise]);
      if ((currentModule?.id === 'meters' || currentModule?.id === 'temperatures') && ocr?.text) {
        const field = numericField(currentModule.id, currentTarget);
        const found = extraireValeurOcr(ocr.text, { kind: currentModule.id, unit: field?.unit || currentTarget?.unit, label: currentTarget?.label });
        if (found && field?.edit) { setSnapshot(await applyCompanionTargetUpdate({ visiteId: snapshot.visit.id, edit: field.edit, value: found.value })); setStatus('✓ ' + found.value + (field.unit || currentTarget?.unit ? ' ' + (field.unit || currentTarget.unit) : '')); setHighlightId(currentTarget?.id || null); feedback('Valeur lue : ' + found.value); return; }
        setHighlightId(currentTarget?.id || null); setStatus('Photo enregistrée · saisis la valeur'); await refresh(); setTimeout(() => valueRefs.current[currentTarget?.id]?.focus?.(), 350); return;
      }
      if (plaque && ocr?.text && currentTarget) {
        const data = extraireChampsPlaque(ocr.text); let next = snapshot; let count = 0;
        for (const field of currentTarget.fields || []) { const value = data?.[field.id]; if (!value || clean(field.value) || !field.edit) continue; next = await applyCompanionTargetUpdate({ visiteId: snapshot.visit.id, edit: field.edit, value }); count += 1; }
        setSnapshot(next); setStatus(count ? '✓ Plaque lue · ' + count + ' donnée' + (count > 1 ? 's' : '') : 'Plaque enregistrée'); feedback(count ? 'Plaque lue' : 'Plaque enregistrée'); return;
      }
      await refresh(); setStatus('✓ Photo enregistrée'); feedback('Photo ajoutée');
    } catch (e) { setStatus('Capture non enregistrée'); Alert.alert('Capture impossible', String(e?.message || e)); }
    finally { setBusy(null); }
  }, [busy, refresh, snapshot]);

  const newRemark = useCallback(async () => {
    if (!snapshot?.visit?.id || busy) return; setBusy('remark:new');
    try { const uri = await prendrePhoto(); if (!uri) return; const id = await ajouterRemarqueVisite(snapshot.visit.id, { prestation: '', poste: 'Observation', criticite: 2, origine: 'Mode Photo' }); await importCompanionPhoto({ visiteId: snapshot.visit.id, uri, meta: { targetKey: 'remarque||' + id, label: 'Remarque', moduleId: 'remarks' } }); await refresh(); setRemark({ id, text: '', criticite: 2 }); setStatus('✓ Remarque créée'); }
    catch (e) { Alert.alert('Remarque impossible', String(e?.message || e)); } finally { setBusy(null); }
  }, [busy, refresh, snapshot?.visit?.id]);

  const targetForRow = (snap, moduleKey, rowId) => {
    const mod = (snap?.modules || []).find((m) => m.id === moduleKey) || null;
    const row = mod?.targets?.find((t) => (t.fields || []).some((f) => String(f?.edit?.id) === String(rowId))) || null;
    return { mod, row };
  };

  // + Compteur : type choisi → compteur créé → photo de l'index (OCR).
  const addCounter = useCallback(async (label) => {
    setCounterSheet(false);
    if (!snapshot?.visit?.id || !clean(label)) return;
    try {
      const id = await ajouterCompteur(snapshot.visit.id, clean(label));
      const next = await openSnapshot(snapshot.visit.id);
      const { mod, row } = targetForRow(next, 'meters', id);
      setModuleId('meters'); setTargetId(null); setHighlightId(row?.id || null); setStatus(clean(label) + ' ajouté');
      if (mod && row) await capture({ currentModule: mod, currentTarget: row });
    } catch (e) { Alert.alert('Compteur impossible', String(e?.message || e)); }
  }, [capture, openSnapshot, snapshot?.visit?.id]);

  // + Équipement : fiche créée → photo de la plaque signalétique (OCR).
  const addEquipment = useCallback(async () => {
    if (!snapshot?.visit?.id || busy) return;
    try {
      const id = await ajouterMateriel(snapshot.visit.id);
      const next = await openSnapshot(snapshot.visit.id);
      const { mod, row } = targetForRow(next, 'equipment', id);
      setModuleId('equipment'); setTargetId(row?.id || null); setStatus('Équipement ajouté');
      if (mod && row) await capture({ currentModule: mod, currentTarget: row, plaque: true, label: 'Plaque signalétique' });
    } catch (e) { Alert.alert('Équipement impossible', String(e?.message || e)); }
  }, [busy, capture, openSnapshot, snapshot?.visit?.id]);

  const openModule = (id) => { setModuleId(id); setTargetId(null); setHighlightId(null); setStatus(''); };

  const dictateExisting = useCallback(async () => {
    const field = target?.fields?.find((f) => f?.edit?.kind === 'remark' && f?.edit?.key === 'prestation'); if (!field) return;
    try { const out = await demarrerDicteeLocale('fr-FR'); const spoken = clean(out?.text); if (spoken) await saveField(field, clean(field.value) ? clean(field.value) + ' ' + spoken : spoken); }
    catch (e) { Alert.alert('Dictée impossible', String(e?.message || e)); }
  }, [saveField, target]);

  if (remark) return <RemarkEditor remark={remark} accent={accent} light={light} onChanged={() => refresh().catch(() => {})} onClose={() => { setRemark(null); refresh().catch(() => {}); }} />;

  if (module && target && snapshot?.visit) {
    const fields = target.fields || [];
    const shotKey = module.id + ':' + target.id + ':shot';
    const plateKey = module.id + ':' + target.id + ':plate';
    return <View style={{ flex: 1, backgroundColor: 'transparent' }}><Header title={target.label} subtitle={module.label} icon={module.icon} onBack={() => setTargetId(null)} accent={accent} light={light} /><Status text={status} accent={accent} light={light} /><ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 36 }} keyboardShouldPersistTaps="handled">
      {module.id === 'equipment' ? <View style={{ flexDirection: 'row', gap: 9 }}><TouchableOpacity disabled={Boolean(busy)} onPressIn={() => prewarmCameraRuntime().catch(() => {})} onPress={() => capture({ currentModule: module, currentTarget: target, label: target.label + ' · Équipement' })} style={{ flex: 1, minHeight: 82, borderRadius: 16, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', gap: 6 }}>{busy === shotKey ? <ActivityIndicator color={COLORS.white} /> : <CvcIcon name="camera" size={30} color={COLORS.white} />}<Text style={{ color: COLORS.white, fontFamily: FONTS.black }}>Équipement</Text></TouchableOpacity><TouchableOpacity disabled={Boolean(busy)} onPressIn={() => prewarmCameraRuntime().catch(() => {})} onPress={() => capture({ currentModule: module, currentTarget: target, plaque: true, label: target.label + ' · Plaque signalétique' })} style={{ flex: 1, minHeight: 82, borderRadius: 16, borderWidth: 1.5, borderColor: accent, backgroundColor: light, alignItems: 'center', justifyContent: 'center', gap: 6 }}>{busy === plateKey ? <ActivityIndicator color={accent} /> : <CvcIcon name="plate" size={30} color={accent} />}<Text style={{ color: accent, fontFamily: FONTS.black }}>Plaque</Text></TouchableOpacity></View> : <TouchableOpacity accessibilityRole="button" accessibilityLabel="Prendre une photo" disabled={Boolean(busy)} onPressIn={() => prewarmCameraRuntime().catch(() => {})} onPress={() => capture({ currentModule: module, currentTarget: target })} style={{ minHeight: 64, borderRadius: 16, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>{busy === shotKey ? <ActivityIndicator color={COLORS.white} /> : <CvcIcon name="camera" size={31} color={COLORS.white} />}</TouchableOpacity>}
      {module.id === 'remarks' ? <TouchableOpacity onPress={dictateExisting} style={[card, { marginTop: 11, minHeight: 50, backgroundColor: light, borderColor: accent, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }]}><CvcIcon name="microphone" size={23} color={accent} /><Text style={{ color: accent, fontFamily: FONTS.black }}>Dicter</Text></TouchableOpacity> : null}
      <View style={[card, { marginTop: 12, padding: 13 }]}><Text style={{ marginBottom: fields.length ? 11 : 0, color: COLORS.ink, fontFamily: FONTS.black }}>Données</Text>{fields.map((field) => <Field key={String(field.id)} field={field} onSave={saveField} saving={savingField === String(field.id)} accent={accent} light={light} />)}{!fields.length ? <Text style={{ color: COLORS.inkSoft, fontSize: 11.5 }}>Aucune donnée complémentaire.</Text> : null}</View>
    </ScrollView></View>;
  }

  const sheet = <CounterTypeSheet visible={counterSheet} onClose={() => setCounterSheet(false)} onPick={(label) => { addCounter(label).catch(() => {}); }} accent={accent} light={light} />;

  if (module && snapshot?.visit) {
    const targets = module.targets || [];
    const quickValues = module.id === 'meters' || module.id === 'temperatures';
    const filled = quickValues ? targets.filter((t) => clean(numericField(module.id, t)?.value) !== '').length : null;
    const addButton = module.id === 'meters' ? { label: 'Compteur', onPress: () => setCounterSheet(true) }
      : module.id === 'equipment' ? { label: 'Équipement', onPress: addEquipment } : null;
    const focusNext = (index) => { const nextRow = targets[index + 1]; if (nextRow) valueRefs.current[nextRow.id]?.focus?.(); };
    return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'transparent' }}><Header title={module.label} subtitle={quickValues ? filled + ' / ' + targets.length + ' renseigné' + (filled > 1 ? 's' : '') : targets.length + ' élément' + (targets.length > 1 ? 's' : '')} icon={module.icon} onBack={() => { setTargetId(null); setModuleId(null); setHighlightId(null); }} accent={accent} light={light} /><Status text={status} accent={accent} light={light} />
      {addButton ? <TouchableOpacity accessibilityRole="button" disabled={Boolean(busy)} onPressIn={() => prewarmCameraRuntime().catch(() => {})} onPress={addButton.onPress} activeOpacity={0.86} style={{ marginHorizontal: 14, marginTop: 10, minHeight: 54, borderRadius: 17, overflow: 'hidden', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}><ButtonGlow radius={17} /><CvcIcon name="plus" size={19} color={COLORS.white} strokeWidth={2.4} /><Text style={{ color: COLORS.white, fontFamily: FONTS.black, fontSize: 14.5 }}>{addButton.label}</Text><CvcIcon name="camera" size={19} color={COLORS.white} /></TouchableOpacity> : null}
      {module.id === 'remarks' ? <TouchableOpacity disabled={Boolean(busy)} onPressIn={() => prewarmCameraRuntime().catch(() => {})} onPress={newRemark} style={{ margin: 14, marginBottom: 0, minHeight: 62, borderRadius: 16, backgroundColor: accent, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>{busy === 'remark:new' ? <ActivityIndicator color={COLORS.white} /> : <><CvcIcon name="camera" size={27} color={COLORS.white} /><CvcIcon name="plus" size={18} color={COLORS.white} /></>}<Text style={{ color: COLORS.white, fontFamily: FONTS.black }}>Nouvelle remarque</Text></TouchableOpacity> : null}
      {module.id === 'photos' ? <View style={{ padding: 14 }}><TouchableOpacity disabled={Boolean(busy)} onPressIn={() => prewarmCameraRuntime().catch(() => {})} onPress={() => capture({ currentModule: module, label: 'Photo générale' })} style={[card, { minHeight: 150, backgroundColor: light, borderColor: accent, alignItems: 'center', justifyContent: 'center', gap: 9 }]}>{busy ? <ActivityIndicator color={accent} /> : <CvcIcon name="camera" size={48} color={accent} />}<Text style={{ color: accent, fontFamily: FONTS.black }}>Capture libre</Text></TouchableOpacity></View> : <FlatList data={targets} keyExtractor={(item) => String(item.id)} keyboardShouldPersistTaps="handled" extraData={[busy, highlightId]} contentContainerStyle={{ padding: 14, paddingBottom: 34 }} ListHeaderComponent={quickValues && targets.length ? <Text style={{ marginBottom: 8, color: COLORS.inkSoft, fontSize: 11.5, fontFamily: FONTS.bodySemi }}>Tape la valeur ou photographie l'afficheur · « Suivant » passe à la ligne d'après</Text> : null} renderItem={({ item, index }) => quickValues
        ? <QuickValueRow ref={(r) => { valueRefs.current[item.id] = r; }} item={item} module={module} onSave={saveField} onOpen={(row) => setTargetId(row.id)} onCapture={(row) => capture({ currentModule: module, currentTarget: row })} onNext={() => focusNext(index)} busy={busy === module.id + ':' + item.id + ':shot'} highlight={highlightId === item.id} accent={accent} light={light} />
        : <TargetRow item={item} module={module} onOpen={(row) => setTargetId(row.id)} onCapture={(row) => capture({ currentModule: module, currentTarget: row })} busy={busy === module.id + ':' + item.id + ':shot'} accent={accent} light={light} />} ListEmptyComponent={module.id === 'remarks' || addButton ? null : <View style={{ marginTop: 60, alignItems: 'center' }}><CvcIcon name={module.icon} size={50} color={accent} /><Text style={{ marginTop: 12, color: COLORS.ink, fontFamily: FONTS.black }}>Aucun élément</Text></View>} />}
      {sheet}
    </KeyboardAvoidingView>;
  }

  if (snapshot?.visit) {
    const count = (id) => Number(modules.find((m) => m.id === id)?.count || 0);
    return <View style={{ flex: 1, backgroundColor: 'transparent' }}><Header title="Mode Photo" subtitle={[snapshot.visit.site, snapshot.visit.date].filter(Boolean).join(' · ')} onBack={visiteInitiale ? null : () => { setSnapshot(null); setStatus(''); }} onExit={onExit} accent={accent} light={light} /><Status text={status} accent={accent} light={light} /><ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 38 }}>
      <Text style={{ marginBottom: 8, color: COLORS.inkSoft, fontSize: 11, fontFamily: FONTS.bodyBold, letterSpacing: 0.6, textTransform: 'uppercase' }}>Ajout rapide</Text>
      <View style={{ flexDirection: 'row', gap: 9 }}>
        <QuickTile primary icon="meter" label="Compteur" hint={count('meters') + ' relevé' + (count('meters') > 1 ? 's' : '') + ' · photo OCR'} onPress={() => setCounterSheet(true)} busy={Boolean(busy)} accent={accent} light={light} />
        <QuickTile icon="temperature" label="Températures" hint={count('temperatures') + ' mesures'} onPress={() => openModule('temperatures')} accent={accent} light={light} />
      </View>
      <View style={{ flexDirection: 'row', gap: 9, marginTop: 9 }}>
        <QuickTile icon="plate" label="Équipement" hint="Photo de la plaque" onPress={addEquipment} busy={Boolean(busy)} accent={accent} light={light} />
        <QuickTile icon="remark" label="Remarque" hint="Photo + dictée" onPress={newRemark} busy={busy === 'remark:new'} accent={accent} light={light} />
      </View>
      <TouchableOpacity accessibilityRole="button" disabled={Boolean(busy)} onPressIn={() => prewarmCameraRuntime().catch(() => {})} onPress={() => capture({ currentModule: modules.find((m) => m.id === 'photos'), label: 'Photo générale' })} style={[card, { marginTop: 9, minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }]}><CvcIcon name="camera" size={22} color={accent} /><Text style={{ color: COLORS.ink, fontFamily: FONTS.black, fontSize: 13.5 }}>Photo libre</Text></TouchableOpacity>
      <Text style={{ marginTop: 20, marginBottom: 8, color: COLORS.inkSoft, fontSize: 11, fontFamily: FONTS.bodyBold, letterSpacing: 0.6, textTransform: 'uppercase' }}>Tout parcourir</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>{modules.map((m, i) => <FadeUp key={m.id} delay={i * 40} style={{ width: '48.5%' }}><ModuleTile item={m} onPress={(row) => openModule(row.id)} accent={accent} light={light} /></FadeUp>)}</View>
    </ScrollView>{sheet}</View>;
  }

  return <View style={{ flex: 1, backgroundColor: 'transparent' }}><Header title="Mode Photo" subtitle="Capture terrain rapide · hors ligne" onExit={onExit} accent={accent} light={light} />{loading ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={accent} /></View> : <FlatList data={visits} keyExtractor={(item) => String(item.id)} contentContainerStyle={{ padding: 14, paddingBottom: 34 }} ListHeaderComponent={<Text style={{ marginBottom: 10, color: COLORS.inkSoft, fontSize: 11.5, fontFamily: FONTS.bold }}>Sélectionner la visite à renseigner</Text>} renderItem={({ item }) => <VisitRow item={item} onPress={(row) => openSnapshot(row.id, true).catch((e) => Alert.alert('Visite indisponible', String(e?.message || e)))} accent={accent} light={light} />} ListEmptyComponent={<View style={{ marginTop: 70, alignItems: 'center', paddingHorizontal: 26 }}><CvcIcon name="camera" size={52} color={accent} /><Text style={{ marginTop: 13, color: COLORS.ink, fontFamily: FONTS.black }}>Aucune visite locale</Text><Text style={{ marginTop: 6, textAlign: 'center', color: COLORS.inkSoft }}>Le Mode Photo utilise les visites déjà présentes sur ce téléphone.</Text></View>} />}</View>;
}

export { PhotoPhoneScreen };
