/**
 * Constructeur de trame : nom, cible (Mission, site, local, équipement, fiches
 * libres) et champs. Chaque champ se règle dans une feuille : libellé, aide,
 * obligatoire, choix ou liste de référence, unité et seuils, formule, avis qui
 * crée une réserve, condition d'affichage. Réordonner par flèches (pas de
 * glisser-déposer obligatoire). Les erreurs de conception sont signalées sans
 * bloquer l'enregistrement.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { ButtonGlow } from './ButtonGlow.js';
import { BottomSheet } from './VisitKit.js';
import { showToast } from './PremiumDialogs.js';
import { hapticSuccess, hapticTick } from './fieldFeedback.js';
import { missionSheetStore } from './missionSheetStore.js';
import {
  CONDITION_OPS,
  createField,
  FIELD_TYPE_BY_KEY,
  FIELD_TYPES,
  FORM_TARGETS,
  formulaRefs,
  moveField,
  normalizeField,
  normalizeFormFields,
  validateFormDefinition,
  VERDICTS,
} from './missionFormEngine.js';
import { enregistrerTrame, listerListesRef, lireTrame, rattacherTrame } from './missionFormsDb.js';
import { SHEET_TONES, SHEET_TYPE, SheetButton, SheetCard, SheetChip, SheetEmptyLine, SheetErgoProvider, SheetIconButton, StatusPill, useSheetErgo } from './missionSheetUi.js';

const errorText = (e) => String(e?.message || e || 'Erreur inconnue');
const NUMERIC = new Set(['number', 'calc']);

function fieldMeta(field, fields) {
  const parts = [FIELD_TYPE_BY_KEY[field.type]?.label];
  if (field.required) parts.push('obligatoire');
  if (field.unit) parts.push(field.unit);
  if (field.min != null || field.max != null) parts.push(`seuils ${field.min ?? '…'} – ${field.max ?? '…'}`);
  if (field.type === 'calc' && field.formula) parts.push(`= ${field.formula}`);
  if (field.reserveOnNok) parts.push('réserve si non conforme');
  if (field.listId) parts.push('liste de référence');
  if (field.showIf) {
    const parent = fields.find((f) => f.key === field.showIf.field);
    parts.push(`si « ${parent?.label || field.showIf.field} » ${CONDITION_OPS.find((o) => o.key === field.showIf.op)?.label || ''}${field.showIf.value != null && field.showIf.value !== '' ? ` ${field.showIf.value}` : ''}`);
  }
  return parts.filter(Boolean).join(' · ');
}

function Input({ label, value, onChangeText, placeholder, multiline = false, keyboardType = 'default' }) {
  const ergo = useSheetErgo();
  return (
    <View style={{ gap: 6, marginTop: 12 }}>
      <Text style={SHEET_TYPE.label}>{label}</Text>
      <TextInput value={value == null ? '' : String(value)} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={COLORS.inkFaint} multiline={multiline} keyboardType={keyboardType} style={[s.input, { minHeight: multiline ? 96 : ergo.target + 4 }, multiline && { textAlignVertical: 'top' }]} accessibilityLabel={label} />
    </View>
  );
}

function FieldEditor({ visible, field, fields, lists, onClose, onApply, onDelete, onDuplicate }) {
  const [draft, setDraft] = useState(field);
  const [optionsText, setOptionsText] = useState('');
  useEffect(() => {
    if (!visible || !field) return;
    setDraft(field);
    setOptionsText((field.options || []).join('\n'));
  }, [visible, field]);
  if (!draft) return null;
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const index = fields.findIndex((f) => f.key === field?.key);
  const above = fields.slice(0, index < 0 ? fields.length : index).filter((f) => f.type !== 'section');
  const parent = draft.showIf ? fields.find((f) => f.key === draft.showIf.field) : null;
  const apply = () => {
    const others = fields.filter((f) => f.key !== field.key).map((f) => f.key);
    const options = optionsText.split('\n');
    onApply(normalizeField({ ...draft, key: field.key, options }, others));
  };
  const conditionValues = parent?.type === 'select' || parent?.type === 'multiselect' ? parent.options || []
    : parent?.type === 'verdict' ? VERDICTS.map((v) => v.key)
      : parent?.type === 'yesno' ? ['true', 'false'] : null;
  const valueLabel = (v) => (parent?.type === 'verdict' ? VERDICTS.find((x) => x.key === v)?.label : parent?.type === 'yesno' ? (v === 'true' ? 'Oui' : 'Non') : v);
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={FIELD_TYPE_BY_KEY[draft.type]?.label || 'Champ'}
      subtitle={`Balise Word et colonne Excel : {{${field?.key}}}`}
      footer={(
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SheetIconButton icon="trash" tone="danger" label="Supprimer ce champ" onPress={onDelete} />
          <SheetIconButton icon="copy" tone="neutral" label="Dupliquer ce champ" onPress={onDuplicate} />
          <TouchableOpacity accessibilityRole="button" onPress={apply} style={s.apply}><Text style={s.applyText}>Valider</Text></TouchableOpacity>
        </View>
      )}
    >
      <Input label="Libellé" value={draft.label} onChangeText={(v) => set({ label: v })} placeholder="Ex. Pression réseau" />
      {draft.type !== 'section' ? <Input label="Aide (facultatif)" value={draft.help} onChangeText={(v) => set({ help: v })} placeholder="Ce qu’il faut relever, où, comment" /> : null}
      {draft.type !== 'section' && draft.type !== 'calc' ? (
        <View style={s.wrap}><SheetChip icon={draft.required ? 'check' : 'plus'} label="Obligatoire" active={Boolean(draft.required)} onPress={() => set({ required: !draft.required })} /></View>
      ) : null}

      {draft.type === 'select' || draft.type === 'multiselect' ? (
        <>
          <Input label="Choix (un par ligne)" value={optionsText} onChangeText={setOptionsText} placeholder={'Gaz\nFioul\nBois'} multiline />
          <Text style={[SHEET_TYPE.label, { marginTop: 12 }]}>Liste de référence (facultatif)</Text>
          <View style={s.wrap}>
            <SheetChip label="Aucune" active={!draft.listId} onPress={() => set({ listId: null })} />
            {lists.map((list) => <SheetChip key={list.id} label={list.label} active={draft.listId === list.id} onPress={() => set({ listId: list.id })} />)}
          </View>
        </>
      ) : null}

      {NUMERIC.has(draft.type) ? (
        <View style={s.grid}>
          <View style={{ flex: 1 }}><Input label="Unité" value={draft.unit} onChangeText={(v) => set({ unit: v })} placeholder="bar, °C, kW" /></View>
          <View style={{ flex: 1 }}><Input label="Décimales" value={draft.decimals} onChangeText={(v) => set({ decimals: v })} keyboardType="numeric" placeholder="auto" /></View>
        </View>
      ) : null}
      {NUMERIC.has(draft.type) ? (
        <View style={s.grid}>
          <View style={{ flex: 1 }}><Input label="Seuil bas" value={draft.min} onChangeText={(v) => set({ min: v })} keyboardType="numeric" placeholder="aucun" /></View>
          <View style={{ flex: 1 }}><Input label="Seuil haut" value={draft.max} onChangeText={(v) => set({ max: v })} keyboardType="numeric" placeholder="aucun" /></View>
        </View>
      ) : null}

      {draft.type === 'calc' ? (
        <>
          <Input label="Formule" value={draft.formula} onChangeText={(v) => set({ formula: v })} placeholder="{t_depart} - {t_retour}" />
          <Text style={[SHEET_TYPE.meta, { marginTop: 6 }]}>Opérations + − × ÷, parenthèses, min( ), max( ), abs( ), round(x, 2), sqrt( ). Touche un champ pour l’insérer :</Text>
          <View style={[s.wrap, { marginTop: 8 }]}>
            {above.filter((f) => NUMERIC.has(f.type)).map((f) => <SheetChip key={f.key} label={`{${f.key}}`} tone="neutral" onPress={() => set({ formula: `${draft.formula || ''}{${f.key}}` })} accessibilityLabel={`Insérer ${f.label}`} />)}
          </View>
          {formulaRefs(draft.formula).some((ref) => !above.some((f) => f.key === ref)) ? <Text style={[SHEET_TYPE.meta, { color: SHEET_TONES.danger.fg, marginTop: 6 }]}>Une référence ne correspond à aucun nombre placé au-dessus.</Text> : null}
        </>
      ) : null}

      {draft.type === 'verdict' ? (
        <View style={[s.wrap, { marginTop: 12 }]}><SheetChip icon={draft.reserveOnNok ? 'check' : 'flag'} label="Créer une réserve si « Non conforme »" active={Boolean(draft.reserveOnNok)} onPress={() => set({ reserveOnNok: !draft.reserveOnNok })} /></View>
      ) : null}

      <Text style={[SHEET_TYPE.label, { marginTop: 18 }]}>Afficher</Text>
      <View style={s.wrap}>
        <SheetChip label="Toujours" active={!draft.showIf} onPress={() => set({ showIf: null })} />
        {above.map((f) => <SheetChip key={f.key} label={`Si « ${f.label} »`} active={draft.showIf?.field === f.key} onPress={() => set({ showIf: { field: f.key, op: 'eq', value: '' } })} />)}
      </View>
      {draft.showIf ? (
        <>
          <View style={[s.wrap, { marginTop: 8 }]}>
            {CONDITION_OPS.map((op) => <SheetChip key={op.key} label={op.label} tone="neutral" active={draft.showIf.op === op.key} onPress={() => set({ showIf: { ...draft.showIf, op: op.key } })} />)}
          </View>
          {!['filled', 'empty'].includes(draft.showIf.op) ? (conditionValues ? (
            <View style={[s.wrap, { marginTop: 8 }]}>
              {conditionValues.map((v) => <SheetChip key={v} label={valueLabel(v)} active={String(draft.showIf.value) === String(v)} onPress={() => set({ showIf: { ...draft.showIf, value: v } })} />)}
            </View>
          ) : <Input label="Valeur" value={draft.showIf.value} onChangeText={(v) => set({ showIf: { ...draft.showIf, value: v } })} placeholder="Valeur à comparer" />) : null}
        </>
      ) : null}
    </BottomSheet>
  );
}

export function MissionFormBuilderScreen({ navigation, route }) {
  const formId = route?.params?.formId || null;
  const missionId = route?.params?.missionId || null;
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [targetType, setTargetType] = useState('mission');
  const [fields, setFields] = useState([]);
  const [lists, setLists] = useState([]);
  const [editing, setEditing] = useState(null);
  const [typePicker, setTypePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(!formId);
  const gloves = useMemo(() => missionSheetStore.getGloves(), []);

  useEffect(() => {
    listerListesRef().then(setLists).catch(() => setLists([]));
    if (!formId) return;
    lireTrame(formId).then((form) => {
      if (!form) return;
      setLabel(form.label || '');
      setDescription(form.description || '');
      setTargetType(form.target_type || 'mission');
      setFields(normalizeFormFields(form.fields_json));
    }).catch((e) => Alert.alert('Trame indisponible', errorText(e))).finally(() => setLoaded(true));
  }, [formId]);

  const issues = useMemo(() => validateFormDefinition(fields, { lists }), [fields, lists]);
  const editingField = fields.find((f) => f.key === editing) || null;

  const addField = (type) => {
    setTypePicker(false);
    const field = createField(type, fields);
    setFields((list) => [...list, field]);
    hapticTick();
    setTimeout(() => setEditing(field.key), 250);
  };

  const save = async () => {
    if (saving) return;
    if (!label.trim()) { Alert.alert('Nom manquant', 'Donne un nom à la trame.'); return; }
    setSaving(true);
    try {
      const id = await enregistrerTrame({ id: formId, label, description, targetType, fields });
      if (!formId && missionId) await rattacherTrame(missionId, id);
      hapticSuccess();
      showToast(issues.length ? `${issues.length} point(s) à revoir dans la trame.` : `${fields.length} champ(s).`, { title: 'Trame enregistrée', tone: issues.length ? 'warning' : 'success' });
      navigation.goBack();
    } catch (e) {
      Alert.alert('Trame non enregistrée', errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const groups = [...new Set(FIELD_TYPES.map((t) => t.group))];

  return (
    <SheetErgoProvider gloves={gloves}>
      <View style={[{ flex: 1 }, missionStyles.screen]}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <SheetCard title="Trame" icon="control">
            <Input label="Nom" value={label} onChangeText={setLabel} placeholder="Ex. Contrôle chaufferie P2" />
            <Input label="Description (facultatif)" value={description} onChangeText={setDescription} placeholder="Quand l’utiliser" />
            <Text style={[SHEET_TYPE.label, { marginTop: 12 }]}>Une fiche pour</Text>
            <View style={s.wrap}>
              {FORM_TARGETS.map((t) => <SheetChip key={t.key} label={t.label} active={targetType === t.key} onPress={() => setTargetType(t.key)} accessibilityLabel={`${t.label} : ${t.hint}`} />)}
            </View>
          </SheetCard>

          <SheetCard title="Champs" icon="list" count={fields.length || null}>
            {fields.length ? fields.map((field, index) => (
              <View key={field.key} style={[s.field, field.type === 'section' && s.section]}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Modifier ${field.label}`} onPress={() => setEditing(field.key)} style={s.fieldMain}>
                  <CvcIcon name={FIELD_TYPE_BY_KEY[field.type]?.icon || 'edit'} size={20} color={MISSION_COLORS.accentDark} strokeWidth={2} />
                  <View style={{ flex: 1 }}>
                    <Text style={field.type === 'section' ? SHEET_TYPE.label : SHEET_TYPE.bodyStrong} numberOfLines={2}>{field.label}</Text>
                    <Text style={SHEET_TYPE.meta} numberOfLines={2}>{fieldMeta(field, fields)}</Text>
                  </View>
                </TouchableOpacity>
                <View style={s.arrows}>
                  <SheetIconButton icon="chevron-up" tone="neutral" label={`Monter ${field.label}`} disabled={index === 0} onPress={() => setFields((list) => moveField(list, field.key, -1))} />
                  <SheetIconButton icon="chevron-down" tone="neutral" label={`Descendre ${field.label}`} disabled={index === fields.length - 1} onPress={() => setFields((list) => moveField(list, field.key, 1))} />
                </View>
              </View>
            )) : <SheetEmptyLine icon="plus" text="Aucun champ. Ajoute le premier." />}
            <SheetButton icon="plus" label="Ajouter un champ" onPress={() => setTypePicker(true)} />
          </SheetCard>

          {issues.length ? (
            <View style={s.issues} accessibilityLiveRegion="polite">
              <Text style={[SHEET_TYPE.bodyStrong, { color: SHEET_TONES.warning.fg }]}>{issues.length} point(s) à revoir</Text>
              {issues.slice(0, 6).map((issue, i) => (
                <TouchableOpacity key={`${issue.key}-${i}`} onPress={() => issue.key && setEditing(issue.key)}><Text style={SHEET_TYPE.meta}>• {issue.message}</Text></TouchableOpacity>
              ))}
            </View>
          ) : fields.length ? <StatusPill label="Trame cohérente" tone="accent" /> : null}

          <TouchableOpacity accessibilityRole="button" disabled={saving || !loaded} onPress={save} style={s.primary}>
            <ButtonGlow tone="mission" radius={17} />
            <CvcIcon name="tick" size={20} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={s.primaryText}>{saving ? 'Enregistrement…' : 'Enregistrer la trame'}</Text>
          </TouchableOpacity>
          <Text style={[SHEET_TYPE.meta, { textAlign: 'center' }]}>Modifier une trame ne change pas les fiches déjà remplies : chacune garde ses valeurs.</Text>
        </ScrollView>

        <BottomSheet visible={typePicker} onClose={() => setTypePicker(false)} title="Ajouter un champ">
          {groups.map((group) => (
            <View key={group} style={{ marginBottom: 12 }}>
              <Text style={SHEET_TYPE.label}>{group}</Text>
              <View style={[s.wrap, { marginTop: 8 }]}>
                {FIELD_TYPES.filter((t) => t.group === group).map((t) => <SheetChip key={t.key} icon={t.icon} label={t.label} onPress={() => addField(t.key)} />)}
              </View>
            </View>
          ))}
        </BottomSheet>

        <FieldEditor
          visible={Boolean(editingField)}
          field={editingField}
          fields={fields}
          lists={lists}
          onClose={() => setEditing(null)}
          onApply={(next) => { setFields((list) => list.map((f) => (f.key === editing ? next : f))); setEditing(null); }}
          onDelete={() => {
            const removed = editingField;
            setFields((list) => list.filter((f) => f.key !== removed.key).map((f) => (f.showIf?.field === removed.key ? { ...f, showIf: undefined } : f)));
            setEditing(null);
            showToast(removed.label, { title: 'Champ supprimé' });
          }}
          onDuplicate={() => {
            const copy = normalizeField({ ...editingField, key: undefined, label: `${editingField.label} (copie)` }, fields.map((f) => f.key));
            setFields((list) => { const i = list.findIndex((f) => f.key === editing); const next = list.slice(); next.splice(i + 1, 0, copy); return next; });
            setEditing(null);
          }}
        />
      </View>
    </SheetErgoProvider>
  );
}

const s = StyleSheet.create({
  content: { padding: 16, paddingBottom: 132, gap: 12 },
  input: { borderRadius: 14, borderWidth: 1, borderColor: MISSION_COLORS.accentLine, backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10, fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grid: { flexDirection: 'row', gap: 10 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: MISSION_COLORS.accentLine },
  section: { backgroundColor: MISSION_COLORS.accentSoft, borderRadius: 12, paddingHorizontal: 8 },
  fieldMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  arrows: { flexDirection: 'row', gap: 6 },
  issues: { borderRadius: 16, backgroundColor: SHEET_TONES.warning.bg, borderWidth: 1, borderColor: SHEET_TONES.warning.line, padding: 14, gap: 6 },
  primary: { minHeight: 54, borderRadius: 17, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryText: { color: '#FFFFFF', fontFamily: FONTS.bold, fontSize: 16 },
  apply: { flex: 1, minHeight: 48, borderRadius: 16, backgroundColor: MISSION_COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  applyText: { color: '#FFFFFF', fontFamily: FONTS.bold, fontSize: 15 },
});
