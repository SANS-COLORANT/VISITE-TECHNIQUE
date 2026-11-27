/**
 * Saisie d'une fiche de trame.
 *
 * Chaque modification est enregistrée automatiquement (règle 10 : on peut
 * quitter et reprendre sans perte). Les conditions masquent ou affichent les
 * champs en direct, les calculs se mettent à jour, les seuils et les champs
 * obligatoires sont signalés sans jamais bloquer. « Terminer » crée les
 * réserves des avis non conformes qui le demandent.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { ButtonGlow } from './ButtonGlow.js';
import { showToast } from './PremiumDialogs.js';
import { hapticSuccess, hapticTick } from './fieldFeedback.js';
import { missionSheetStore } from './missionSheetStore.js';
import { capturerPhotoMission } from './missionMediaDb.js';
import { fieldOptions, formatFieldValue, normalizeFormFields, summarizeEntry, VERDICTS } from './missionFormEngine.js';
import { enregistrerFiche, lireFiche, lireTrame, listerListesRef, rouvrirFiche, terminerFiche } from './missionFormsDb.js';
import { ProgressBar, SHEET_TONES, SHEET_TYPE, SheetButton, SheetChip, SheetErgoProvider, StatusPill, useSheetErgo } from './missionSheetUi.js';

const errorText = (e) => String(e?.message || e || 'Erreur inconnue');
const SAVE_DELAY = 500;
const todayIso = () => new Date().toISOString().slice(0, 10);

function FieldShell({ field, missing, outOfRange, children }) {
  return (
    <View style={[s.field, missing && s.fieldMissing]}>
      <Text style={SHEET_TYPE.bodyStrong}>{field.label}{field.required ? <Text style={{ color: SHEET_TONES.danger.fg }}> *</Text> : null}</Text>
      {field.help ? <Text style={SHEET_TYPE.meta}>{field.help}</Text> : null}
      {children}
      {outOfRange ? <Text style={[SHEET_TYPE.meta, { color: SHEET_TONES.warning.fg }]}>Hors seuil ({field.min ?? '…'} – {field.max ?? '…'}{field.unit ? ` ${field.unit}` : ''})</Text> : null}
      {missing ? <Text style={[SHEET_TYPE.meta, { color: SHEET_TONES.danger.fg }]}>À renseigner</Text> : null}
    </View>
  );
}

function FieldInput({ field, value, onChange, lists, missionId, entry }) {
  const ergo = useSheetErgo();
  const [busy, setBusy] = useState(false);
  const inputStyle = [s.input, { minHeight: ergo.target + 4 }];
  switch (field.type) {
    case 'text':
      return <TextInput value={value ?? ''} onChangeText={onChange} style={inputStyle} placeholderTextColor={COLORS.inkFaint} placeholder="Saisir" accessibilityLabel={field.label} />;
    case 'longtext':
      return <TextInput value={value ?? ''} onChangeText={onChange} multiline style={[s.input, { minHeight: 96, textAlignVertical: 'top' }]} placeholderTextColor={COLORS.inkFaint} placeholder="Saisir" accessibilityLabel={field.label} />;
    case 'number':
      return (
        <View style={s.inline}>
          <TextInput value={value == null ? '' : String(value)} onChangeText={onChange} keyboardType="decimal-pad" style={[inputStyle, { flex: 1 }]} placeholderTextColor={COLORS.inkFaint} placeholder="0" accessibilityLabel={`${field.label}${field.unit ? ` en ${field.unit}` : ''}`} />
          {field.unit ? <Text style={s.unit}>{field.unit}</Text> : null}
        </View>
      );
    case 'date':
      return (
        <View style={s.inline}>
          <TextInput value={value ?? ''} onChangeText={onChange} style={[inputStyle, { flex: 1 }]} placeholder="AAAA-MM-JJ" placeholderTextColor={COLORS.inkFaint} accessibilityLabel={field.label} />
          <SheetButton label="Aujourd’hui" onPress={() => onChange(todayIso())} />
        </View>
      );
    case 'yesno':
      return (
        <View style={s.wrap}>
          <SheetChip label="Oui" active={value === true} onPress={() => onChange(value === true ? null : true)} />
          <SheetChip label="Non" active={value === false} onPress={() => onChange(value === false ? null : false)} />
        </View>
      );
    case 'select':
      return <View style={s.wrap}>{fieldOptions(field, lists).map((opt) => <SheetChip key={opt} label={opt} active={value === opt} onPress={() => onChange(value === opt ? null : opt)} />)}</View>;
    case 'multiselect': {
      const list = Array.isArray(value) ? value : [];
      return <View style={s.wrap}>{fieldOptions(field, lists).map((opt) => <SheetChip key={opt} icon={list.includes(opt) ? 'check' : null} label={opt} active={list.includes(opt)} onPress={() => onChange(list.includes(opt) ? list.filter((x) => x !== opt) : [...list, opt])} />)}</View>;
    }
    case 'verdict':
      return (
        <View style={s.wrap}>
          {VERDICTS.map((v) => <SheetChip key={v.key} label={v.label} tone={v.tone} active={value === v.key} onPress={() => onChange(value === v.key ? null : v.key)} />)}
          {value === 'nok' && field.reserveOnNok ? <Text style={[SHEET_TYPE.meta, { width: '100%' }]}>Une réserve sera créée en terminant la fiche.</Text> : null}
        </View>
      );
    case 'calc':
      return <Text style={s.calc}>{value == null ? '—' : formatFieldValue(field, value)}</Text>;
    case 'photo': {
      const photos = Array.isArray(value) ? value : [];
      const take = async () => {
        if (busy) return;
        setBusy(true);
        try {
          const photo = await capturerPhotoMission({ missionId, label: field.label, type: 'trame', equipmentId: entry?.target_type === 'equipment' ? entry.target_id : null, siteId: entry?.target_type === 'site' ? entry.target_id : null, locationId: entry?.target_type === 'location' ? entry.target_id : null });
          if (photo) onChange([...photos, { id: photo.id, uri: photo.thumbnailUri || photo.fileUri }]);
        } catch (e) {
          Alert.alert('Photo impossible', errorText(e));
        } finally {
          setBusy(false);
        }
      };
      return (
        <View style={{ gap: 8 }}>
          {photos.length ? <View style={s.wrap}>{photos.map((p) => <Image key={p.id} source={{ uri: p.uri }} style={s.thumb} accessibilityLabel={field.label} />)}</View> : null}
          <SheetButton icon="camera" label={busy ? 'Appareil photo…' : photos.length ? 'Ajouter une photo' : 'Prendre une photo'} onPress={take} />
        </View>
      );
    }
    default:
      return null;
  }
}

export function MissionFormFillScreen({ navigation, route }) {
  const entryId = route?.params?.entryId;
  const missionId = route?.params?.missionId;
  const [entry, setEntry] = useState(null);
  const [form, setForm] = useState(null);
  const [lists, setLists] = useState([]);
  const [values, setValues] = useState({});
  const [saveState, setSaveState] = useState('saved');
  const [showMissing, setShowMissing] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const timer = useRef(null);
  const pending = useRef(null);
  const gloves = useMemo(() => missionSheetStore.getGloves(), []);

  useEffect(() => {
    (async () => {
      const e = await lireFiche(entryId);
      if (!e) return;
      const [f, l] = await Promise.all([lireTrame(e.form_id), listerListesRef()]);
      setEntry(e);
      setForm(f);
      setLists(l);
      try { setValues(JSON.parse(e.values_json || '{}')); } catch { setValues({}); }
    })().catch((e) => Alert.alert('Fiche indisponible', errorText(e)));
  }, [entryId]);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!pending.current) return;
    const next = pending.current;
    pending.current = null;
    try {
      await enregistrerFiche(entryId, next);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [entryId]);

  // Enregistrer avant de quitter l'écran : rien n'est perdu.
  useEffect(() => () => { flush(); }, [flush]);

  const fields = useMemo(() => normalizeFormFields(form?.fields_json), [form?.fields_json]);
  const summary = useMemo(() => summarizeEntry(fields, values), [fields, values]);

  const setValue = (key, value) => {
    setValues((current) => {
      const next = { ...current, [key]: value };
      pending.current = next;
      return next;
    });
    setSaveState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  };

  const finish = async () => {
    if (finishing) return;
    const run = async () => {
      setFinishing(true);
      try {
        await flush();
        const result = await terminerFiche(entryId);
        hapticSuccess();
        showToast(result.reserves.length ? `${result.reserves.length} réserve(s) créée(s) depuis les avis non conformes.` : 'Elle apparaît dans l’Excel et les modèles Word.', { title: 'Fiche terminée', tone: 'success' });
        navigation.goBack();
      } catch (e) {
        Alert.alert('Fiche non terminée', errorText(e));
      } finally {
        setFinishing(false);
      }
    };
    if (summary.missing.length) {
      setShowMissing(true);
      Alert.alert(`${summary.missing.length} champ(s) obligatoire(s) vide(s)`, 'Tu peux terminer quand même et compléter plus tard.', [
        { text: 'Compléter', style: 'cancel' },
        { text: 'Terminer quand même', onPress: run },
      ]);
      return;
    }
    run();
  };

  const reopen = async () => {
    await rouvrirFiche(entryId);
    setEntry((e) => ({ ...e, status: 'draft' }));
    hapticTick();
  };

  if (!entry || !form) return <View style={[{ flex: 1 }, missionStyles.screen]} />;
  const missing = new Set(showMissing ? summary.missing : []);
  const out = new Set(summary.outOfRange);

  return (
    <SheetErgoProvider gloves={gloves}>
      <View style={[{ flex: 1 }, missionStyles.screen]}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.head}>
            <Text style={SHEET_TYPE.title} numberOfLines={3}>{form.label}</Text>
            <Text style={SHEET_TYPE.meta}>{entry.target_label || 'Fiche'}</Text>
            <View style={s.inline}>
              <View style={{ flex: 1 }}><ProgressBar pct={summary.progress} /></View>
              <Text style={SHEET_TYPE.meta}>{summary.filled}/{summary.total}</Text>
            </View>
            <View style={s.wrap}>
              <StatusPill label={entry.status === 'done' ? 'Terminée' : 'Brouillon'} tone={entry.status === 'done' ? 'info' : 'warning'} />
              <StatusPill label={saveState === 'saving' ? 'Enregistrement…' : saveState === 'error' ? 'Non enregistré' : 'Enregistré'} tone={saveState === 'error' ? 'danger' : 'accent'} />
              {summary.nonConform.length ? <StatusPill label={`${summary.nonConform.length} non conforme(s)`} tone="danger" /> : null}
              {summary.outOfRange.length ? <StatusPill label={`${summary.outOfRange.length} hors seuil`} tone="warning" /> : null}
            </View>
          </View>

          {summary.visible.map((field) => (field.type === 'section'
            ? <Text key={field.key} style={[SHEET_TYPE.label, s.sectionTitle]}>{field.label}</Text>
            : (
              <FieldShell key={field.key} field={field} missing={missing.has(field.key)} outOfRange={out.has(field.key)}>
                <FieldInput field={field} value={field.type === 'calc' ? summary.values[field.key] : values[field.key]} onChange={(v) => setValue(field.key, v)} lists={lists} missionId={missionId || entry.mission_id} entry={entry} />
                {field.type === 'verdict' && values[field.key] === 'nok' ? (
                  <TextInput value={values[`${field.key}__note`] ?? ''} onChangeText={(v) => setValue(`${field.key}__note`, v)} multiline placeholder="Constat (repris dans la réserve)" placeholderTextColor={COLORS.inkFaint} style={[s.input, { minHeight: 72, textAlignVertical: 'top' }]} accessibilityLabel={`Constat pour ${field.label}`} />
                ) : null}
              </FieldShell>
            )))}

          {entry.status === 'done' ? (
            <SheetButton icon="undo" label="Rouvrir la fiche" tone="neutral" onPress={reopen} />
          ) : (
            <TouchableOpacity accessibilityRole="button" disabled={finishing} onPress={finish} style={s.primary}>
              <ButtonGlow tone="mission" radius={17} />
              <CvcIcon name="tick" size={20} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={s.primaryText}>{finishing ? 'Patiente…' : 'Terminer la fiche'}</Text>
            </TouchableOpacity>
          )}
          <Text style={[SHEET_TYPE.meta, { textAlign: 'center' }]}>Tout est enregistré au fil de la saisie : tu peux quitter et reprendre plus tard.</Text>
        </ScrollView>
      </View>
    </SheetErgoProvider>
  );
}

const s = StyleSheet.create({
  content: { padding: 16, paddingBottom: 132, gap: 12 },
  head: { gap: 8, paddingHorizontal: 4 },
  field: { backgroundColor: MISSION_COLORS.card, borderWidth: StyleSheet.hairlineWidth, borderColor: MISSION_COLORS.accentLine, borderRadius: 18, padding: 14, gap: 8 },
  fieldMissing: { borderColor: SHEET_TONES.danger.line, borderWidth: 1 },
  sectionTitle: { marginTop: 8, paddingHorizontal: 4 },
  input: { borderRadius: 14, borderWidth: 1, borderColor: MISSION_COLORS.accentLine, backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10, fontFamily: FONTS.bodyMedium, fontSize: 16, color: COLORS.ink },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unit: { fontFamily: FONTS.bodyBold, fontSize: 15, color: MISSION_COLORS.accentDark, minWidth: 32 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  calc: { fontFamily: FONTS.black, fontSize: 22, color: MISSION_COLORS.accentStrong },
  thumb: { width: 84, height: 84, borderRadius: 12, backgroundColor: MISSION_COLORS.accentSoft },
  primary: { minHeight: 54, borderRadius: 17, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryText: { color: '#FFFFFF', fontFamily: FONTS.bold, fontSize: 16 },
});
