import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CvcIcon } from './MetraCvcIcons.js';
import { COLORS } from './styles.js';
import { getRuntimeAccent, getRuntimePalette } from './visual-packs/runtime/visualPaletteRuntime.js';
import { openAppDatabase } from './database/index.js';
import { applyCompanionTargetUpdate, buildCompanionVisitSnapshot, importCompanionPhoto } from './companionData.js';
import { prendrePhoto } from './PhotoButton.js';
import { prewarmCameraRuntime } from './cameraRuntime.js';
import { demarrerDicteeLocale, dicteeLocaleDisponible, reconnaitreTexteImageLocale } from './missionNativeTools.js';
import { ajouterRemarqueVisite, modifierRemarqueVisite } from './remarkDb.js';
import { extraireChampsPlaque, extraireValeurOcr } from './photoModeData.js';
import { IconOrb, FadeUp } from './premiumChrome.js';

const clean = (v) => String(v == null ? '' : v).trim();
const card = {
  borderWidth: 1,
  borderColor: COLORS.line,
  borderRadius: 18,
  backgroundColor: COLORS.white,
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2
};
const iconBox = (light, size = 46) => ({
  width: size,
  height: size,
  borderRadius: 14,
  backgroundColor: light,
  alignItems: 'center',
  justifyContent: 'center'
});

function Header({ title, subtitle, icon = 'camera', onBack, onExit, accent, light }) {
  return (
    <View
      style={{
        paddingTop: 47,
        paddingHorizontal: 14,
        paddingBottom: 11,
        backgroundColor: COLORS.white,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.line
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {onBack ? (
          <TouchableOpacity
            accessibilityLabel="Retour"
            onPress={onBack}
            style={[iconBox(COLORS.white, 42), { borderWidth: 1, borderColor: COLORS.line }]}
          >
            <Text style={{ fontSize: 22, color: COLORS.ink }}>←</Text>
          </TouchableOpacity>
        ) : null}
        <IconOrb accent={accent} light={light} size={44}>
          <CvcIcon name={icon} size={26} color={accent} />
        </IconOrb>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 18.5, fontWeight: '900', color: COLORS.ink }}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 11.5, color: COLORS.inkSoft }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {onExit ? (
          <TouchableOpacity
            accessibilityLabel="Quitter le mode Photo"
            onPress={onExit}
            style={[iconBox(COLORS.white, 42), { borderWidth: 1, borderColor: COLORS.line }]}
          >
            <Text style={{ fontSize: 20, color: COLORS.inkSoft }}>×</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function Status({ text, accent, light }) {
  if (!text) return null;
  return (
    <View
      style={{
        alignSelf: 'center',
        marginTop: 8,
        maxWidth: '92%',
        paddingHorizontal: 11,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: light
      }}
    >
      <Text style={{ color: accent, fontSize: 11, fontWeight: '900', textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

function ModuleTile({ item, onPress, accent, light }) {
  const count = Number(item.count || 0);
  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      style={[card, { width: '100%', minHeight: 116, padding: 13, justifyContent: 'space-between' }]}
    >
      <IconOrb accent={accent} light={light} size={46}>
        <CvcIcon name={item.icon} size={27} color={accent} />
      </IconOrb>
      <View>
        <Text style={{ color: COLORS.ink, fontWeight: '900', fontSize: 14 }}>{item.label}</Text>
        <Text style={{ marginTop: 2, color: accent, fontSize: 20, fontWeight: '900' }}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

function VisitRow({ item, onPress, accent, light }) {
  const active = clean(item.statut) === 'en_cours';
  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      style={[
        card,
        {
          marginBottom: 9,
          minHeight: 76,
          padding: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 11,
          borderColor: active ? accent : COLORS.line
        }
      ]}
    >
      <IconOrb accent={accent} light={light} size={44}>
        <CvcIcon name="camera" size={25} color={accent} />
      </IconOrb>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontWeight: '900', color: COLORS.ink }}>
          {item.nom_local || item.nom_site || 'Visite'}
        </Text>
        <Text numberOfLines={1} style={{ marginTop: 3, color: COLORS.inkSoft, fontSize: 11 }}>
          {[item.nom_client, item.nom_site].filter(Boolean).join(' · ')}
        </Text>
        <Text style={{ marginTop: 3, color: active ? accent : COLORS.inkFaint, fontSize: 10.5 }}>
          {active ? 'EN COURS · ' : ''}
          {item.date_visite || ''} · {item.trame_id || 'ICPE'}
        </Text>
      </View>
      <Text style={{ color: COLORS.inkFaint, fontSize: 22 }}>›</Text>
    </TouchableOpacity>
  );
}

function TargetRow({ item, module, onOpen, onCapture, busy, accent, light }) {
  const value = [clean(item.value), clean(item.unit)].filter(Boolean).join(' ');
  return (
    <View style={[card, { marginBottom: 9, minHeight: 68, flexDirection: 'row', overflow: 'hidden' }]}>
      <TouchableOpacity
        onPress={() => onOpen(item)}
        style={{ flex: 1, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <IconOrb accent={accent} light={light} size={40}>
          <CvcIcon name={module.icon} size={22} color={accent} />
        </IconOrb>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ color: COLORS.ink, fontWeight: '900', fontSize: 13.5 }}>
            {item.label}
          </Text>
          {value ? <Text style={{ marginTop: 3, color: accent, fontWeight: '900', fontSize: 12 }}>{value}</Text> : null}
          {item.subtitle ? (
            <Text numberOfLines={1} style={{ marginTop: 2, color: COLORS.inkSoft, fontSize: 10.5 }}>
              {item.subtitle}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityLabel={'Photographier ' + item.label}
        onPressIn={() => prewarmCameraRuntime().catch(() => {})}
        onPress={() => onCapture(item)}
        disabled={busy}
        style={{
          width: 58,
          borderLeftWidth: 1,
          borderLeftColor: COLORS.line,
          backgroundColor: light,
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {busy ? <ActivityIndicator color={accent} /> : <CvcIcon name="camera" size={27} color={accent} />}
      </TouchableOpacity>
    </View>
  );
}

function Field({ field, onSave, saving, accent, light }) {
  const [value, setValue] = useState(field?.value == null ? '' : String(field.value));
  useEffect(() => setValue(field?.value == null ? '' : String(field.value)), [field?.id, field?.value]);
  if (Array.isArray(field?.options) && field.options.length)
    return (
      <View style={{ marginBottom: 12 }}>
        <Text style={{ marginBottom: 6, color: COLORS.inkSoft, fontSize: 11.5, fontWeight: '900' }}>{field.label}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {field.options.map((option) => {
            const selected = String(field.value ?? '') === String(option);
            return (
              <TouchableOpacity
                key={String(option)}
                disabled={saving}
                onPress={() => onSave(field, String(option))}
                style={{
                  minWidth: 44,
                  minHeight: 40,
                  paddingHorizontal: 9,
                  borderRadius: 11,
                  borderWidth: 1,
                  borderColor: selected ? accent : COLORS.line,
                  backgroundColor: selected ? light : COLORS.white,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Text style={{ color: selected ? accent : COLORS.ink, fontWeight: '900' }}>{option}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  const save = () => {
    if (value !== String(field.value ?? '')) onSave(field, value);
  };
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ marginBottom: 6, color: COLORS.inkSoft, fontSize: 11.5, fontWeight: '900' }}>
        {field.label}
        {field.unit ? ' · ' + field.unit : ''}
      </Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        onBlur={save}
        onSubmitEditing={() => {
          if (!field.multiline) save();
        }}
        keyboardType={field.input === 'numeric' ? 'decimal-pad' : 'default'}
        multiline={Boolean(field.multiline)}
        placeholder="Saisir…"
        style={{
          minHeight: field.multiline ? 78 : 46,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: COLORS.line,
          paddingHorizontal: 11,
          paddingVertical: field.multiline ? 9 : 0,
          textAlignVertical: field.multiline ? 'top' : 'center',
          color: COLORS.ink
        }}
      />
    </View>
  );
}

function RemarkEditor({ remark, onClose, onChanged, accent, light }) {
  const [value, setValue] = useState(remark.text || '');
  const [severity, setSeverity] = useState(Number(remark.criticite || 2));
  const [dictating, setDictating] = useState(false);
  const save = async (next) => {
    await modifierRemarqueVisite(remark.id, { prestation: next });
    onChanged?.();
  };
  const dictate = async () => {
    if (dictating) return;
    setDictating(true);
    try {
      if (!(await dicteeLocaleDisponible())) throw new Error('Dictée Android indisponible.');
      const out = await demarrerDicteeLocale('fr-FR');
      const spoken = clean(out?.text);
      if (spoken) {
        const merged = clean(value) ? clean(value) + ' ' + spoken : spoken;
        setValue(merged);
        await save(merged);
      }
    } catch (e) {
      Alert.alert('Dictée impossible', String(e?.message || e));
    } finally {
      setDictating(false);
    }
  };
  const changeSeverity = async (n) => {
    setSeverity(n);
    await modifierRemarqueVisite(remark.id, { criticite: n });
    onChanged?.();
  };
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <Header
        title="Remarque"
        subtitle="Enregistrement automatique"
        icon="remark"
        onBack={onClose}
        accent={accent}
        light={light}
      />
      <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
        <View style={[card, { padding: 14 }]}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              autoFocus
              multiline
              value={value}
              onChangeText={setValue}
              onBlur={() => save(value)}
              placeholder="Décrire la remarque…"
              style={{
                flex: 1,
                minHeight: 112,
                borderWidth: 1,
                borderColor: COLORS.line,
                borderRadius: 12,
                padding: 10,
                textAlignVertical: 'top',
                color: COLORS.ink
              }}
            />
            <TouchableOpacity
              accessibilityLabel="Dicter"
              onPress={dictate}
              style={[iconBox(light, 52), { alignSelf: 'stretch', height: 'auto' }]}
            >
              {dictating ? (
                <ActivityIndicator color={accent} />
              ) : (
                <CvcIcon name="microphone" size={27} color={accent} />
              )}
            </TouchableOpacity>
          </View>
          <Text style={{ marginTop: 17, marginBottom: 7, fontWeight: '900', color: COLORS.ink }}>Criticité</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => changeSeverity(n)}
                style={{
                  flex: 1,
                  minHeight: 42,
                  borderRadius: 11,
                  borderWidth: 1,
                  borderColor: severity === n ? accent : COLORS.line,
                  backgroundColor: severity === n ? light : COLORS.white,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Text style={{ color: severity === n ? accent : COLORS.ink, fontWeight: '900' }}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function numericField(moduleId, target) {
  const fields = target?.fields || [];
  if (moduleId === 'meters')
    return (
      fields.find((f) => f?.edit?.kind === 'counter' && f?.edit?.key === 'valeur') ||
      fields.find((f) => f?.input === 'numeric')
    );
  if (moduleId === 'temperatures') return fields.find((f) => f?.input === 'numeric') || fields[0];
  return null;
}

function PhotoPhoneScreen({ onExit }) {
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
  const modules = snapshot?.modules || [];
  const module = useMemo(() => modules.find((m) => m.id === moduleId) || null, [modules, moduleId]);
  const target = useMemo(
    () => module?.targets?.find((t) => String(t.id) === String(targetId)) || null,
    [module, targetId]
  );

  const openSnapshot = useCallback(async (id, reset = false) => {
    const next = await buildCompanionVisitSnapshot(id);
    setSnapshot(next);
    if (reset) {
      setModuleId(null);
      setTargetId(null);
    }
    return next;
  }, []);
  const refresh = useCallback(
    () => (snapshot?.visit?.id ? openSnapshot(snapshot.visit.id) : Promise.resolve(null)),
    [openSnapshot, snapshot?.visit?.id]
  );

  const loadVisits = useCallback(async () => {
    setLoading(true);
    try {
      const db = await openAppDatabase();
      const sql =
        "SELECT v.id,v.date_visite,v.statut,v.trame_id,v.modifie_le,s.nom_site,c.nom AS nom_client,i.nom AS nom_local FROM visites v JOIN sites s ON s.id=v.site_id JOIN clients c ON c.id=s.client_id LEFT JOIN installations i ON i.id=v.installation_id ORDER BY CASE WHEN v.statut='en_cours' THEN 0 ELSE 1 END,COALESCE(v.modifie_le,v.date_visite,'') DESC LIMIT 40";
      const rows = await db.getAllAsync(sql);
      setVisits(rows || []);
      const active = (rows || []).filter((r) => clean(r.statut) === 'en_cours');
      if (active.length === 1) {
        await openSnapshot(active[0].id, true);
        setStatus('Visite en cours ouverte');
      }
    } catch (e) {
      Alert.alert('Mode Photo', String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [openSnapshot]);

  useEffect(() => {
    prewarmCameraRuntime().catch(() => {});
    loadVisits().catch(() => {});
  }, [loadVisits]);

  const saveField = useCallback(
    async (field, value) => {
      if (!snapshot?.visit?.id || !field?.edit) return;
      setSavingField(String(field.id));
      try {
        setSnapshot(await applyCompanionTargetUpdate({ visiteId: snapshot.visit.id, edit: field.edit, value }));
        setStatus('✓ Enregistré');
      } catch (e) {
        Alert.alert('Enregistrement impossible', String(e?.message || e));
      } finally {
        setSavingField(null);
      }
    },
    [snapshot?.visit?.id]
  );

  const capture = useCallback(
    async ({ currentModule, currentTarget = null, plaque = false, label = null } = {}) => {
      if (!snapshot?.visit?.id || busy) return;
      const key =
        (currentModule?.id || 'photos') + ':' + (currentTarget?.id || 'general') + ':' + (plaque ? 'plate' : 'shot');
      setBusy(key);
      try {
        const uri = await prendrePhoto();
        if (!uri) return;
        const wantsOcr = plaque || currentModule?.id === 'meters' || currentModule?.id === 'temperatures';
        const ocrPromise = wantsOcr ? reconnaitreTexteImageLocale(uri).catch(() => null) : Promise.resolve(null);
        const storePromise = importCompanionPhoto({
          visiteId: snapshot.visit.id,
          uri,
          meta: {
            targetKey: currentTarget?.targetKey || null,
            label: label || (plaque ? 'Plaque signalétique' : currentTarget?.label || 'Photo terrain'),
            moduleId: currentModule?.id || 'photos'
          }
        });
        const [ocr] = await Promise.all([ocrPromise, storePromise]);
        if ((currentModule?.id === 'meters' || currentModule?.id === 'temperatures') && ocr?.text) {
          const field = numericField(currentModule.id, currentTarget);
          const found = extraireValeurOcr(ocr.text, {
            kind: currentModule.id,
            unit: field?.unit || currentTarget?.unit,
            label: currentTarget?.label
          });
          if (found && field?.edit) {
            setSnapshot(
              await applyCompanionTargetUpdate({ visiteId: snapshot.visit.id, edit: field.edit, value: found.value })
            );
            setStatus(
              '✓ ' + found.value + (field.unit || currentTarget?.unit ? ' ' + (field.unit || currentTarget.unit) : '')
            );
            return;
          }
          setTargetId(currentTarget?.id || null);
          setStatus('Photo enregistrée · valeur à vérifier');
          await refresh();
          return;
        }
        if (plaque && ocr?.text && currentTarget) {
          const data = extraireChampsPlaque(ocr.text);
          let next = snapshot;
          let count = 0;
          for (const field of currentTarget.fields || []) {
            const value = data?.[field.id];
            if (!value || clean(field.value) || !field.edit) continue;
            next = await applyCompanionTargetUpdate({ visiteId: snapshot.visit.id, edit: field.edit, value });
            count += 1;
          }
          setSnapshot(next);
          setStatus(count ? '✓ Plaque lue · ' + count + ' donnée' + (count > 1 ? 's' : '') : 'Plaque enregistrée');
          return;
        }
        await refresh();
        setStatus('✓ Photo enregistrée');
      } catch (e) {
        setStatus('Capture non enregistrée');
        Alert.alert('Capture impossible', String(e?.message || e));
      } finally {
        setBusy(null);
      }
    },
    [busy, refresh, snapshot]
  );

  const newRemark = useCallback(async () => {
    if (!snapshot?.visit?.id || busy) return;
    setBusy('remark:new');
    try {
      const uri = await prendrePhoto();
      if (!uri) return;
      const id = await ajouterRemarqueVisite(snapshot.visit.id, {
        prestation: '',
        poste: 'Observation',
        criticite: 2,
        origine: 'Mode Photo'
      });
      await importCompanionPhoto({
        visiteId: snapshot.visit.id,
        uri,
        meta: { targetKey: 'remarque||' + id, label: 'Remarque', moduleId: 'remarks' }
      });
      await refresh();
      setRemark({ id, text: '', criticite: 2 });
      setStatus('✓ Remarque créée');
    } catch (e) {
      Alert.alert('Remarque impossible', String(e?.message || e));
    } finally {
      setBusy(null);
    }
  }, [busy, refresh, snapshot?.visit?.id]);

  const dictateExisting = useCallback(async () => {
    const field = target?.fields?.find((f) => f?.edit?.kind === 'remark' && f?.edit?.key === 'prestation');
    if (!field) return;
    try {
      const out = await demarrerDicteeLocale('fr-FR');
      const spoken = clean(out?.text);
      if (spoken) await saveField(field, clean(field.value) ? clean(field.value) + ' ' + spoken : spoken);
    } catch (e) {
      Alert.alert('Dictée impossible', String(e?.message || e));
    }
  }, [saveField, target]);

  if (remark)
    return (
      <RemarkEditor
        remark={remark}
        accent={accent}
        light={light}
        onChanged={() => refresh().catch(() => {})}
        onClose={() => {
          setRemark(null);
          refresh().catch(() => {});
        }}
      />
    );

  if (module && target && snapshot?.visit) {
    const fields = target.fields || [];
    const shotKey = module.id + ':' + target.id + ':shot';
    const plateKey = module.id + ':' + target.id + ':plate';
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <Header
          title={target.label}
          subtitle={module.label}
          icon={module.icon}
          onBack={() => setTargetId(null)}
          accent={accent}
          light={light}
        />
        <Status text={status} accent={accent} light={light} />
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 36 }} keyboardShouldPersistTaps="handled">
          {module.id === 'equipment' ? (
            <View style={{ flexDirection: 'row', gap: 9 }}>
              <TouchableOpacity
                disabled={Boolean(busy)}
                onPressIn={() => prewarmCameraRuntime().catch(() => {})}
                onPress={() =>
                  capture({ currentModule: module, currentTarget: target, label: target.label + ' · Équipement' })
                }
                style={{
                  flex: 1,
                  minHeight: 82,
                  borderRadius: 16,
                  backgroundColor: accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                {busy === shotKey ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <CvcIcon name="camera" size={30} color={COLORS.white} />
                )}
                <Text style={{ color: COLORS.white, fontWeight: '900' }}>Équipement</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={Boolean(busy)}
                onPressIn={() => prewarmCameraRuntime().catch(() => {})}
                onPress={() =>
                  capture({
                    currentModule: module,
                    currentTarget: target,
                    plaque: true,
                    label: target.label + ' · Plaque signalétique'
                  })
                }
                style={{
                  flex: 1,
                  minHeight: 82,
                  borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: accent,
                  backgroundColor: light,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                {busy === plateKey ? (
                  <ActivityIndicator color={accent} />
                ) : (
                  <CvcIcon name="plate" size={30} color={accent} />
                )}
                <Text style={{ color: accent, fontWeight: '900' }}>Plaque</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              disabled={Boolean(busy)}
              onPressIn={() => prewarmCameraRuntime().catch(() => {})}
              onPress={() => capture({ currentModule: module, currentTarget: target })}
              style={{
                minHeight: 64,
                borderRadius: 16,
                backgroundColor: accent,
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {busy === shotKey ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <CvcIcon name="camera" size={31} color={COLORS.white} />
              )}
            </TouchableOpacity>
          )}
          {module.id === 'remarks' ? (
            <TouchableOpacity
              onPress={dictateExisting}
              style={[
                card,
                {
                  marginTop: 11,
                  minHeight: 50,
                  backgroundColor: light,
                  borderColor: accent,
                  flexDirection: 'row',
                  gap: 8,
                  alignItems: 'center',
                  justifyContent: 'center'
                }
              ]}
            >
              <CvcIcon name="microphone" size={23} color={accent} />
              <Text style={{ color: accent, fontWeight: '900' }}>Dicter</Text>
            </TouchableOpacity>
          ) : null}
          <View style={[card, { marginTop: 12, padding: 13 }]}>
            <Text style={{ marginBottom: fields.length ? 11 : 0, color: COLORS.ink, fontWeight: '900' }}>Données</Text>
            {fields.map((field) => (
              <Field
                key={String(field.id)}
                field={field}
                onSave={saveField}
                saving={savingField === String(field.id)}
                accent={accent}
                light={light}
              />
            ))}
            {!fields.length ? (
              <Text style={{ color: COLORS.inkSoft, fontSize: 11.5 }}>Aucune donnée complémentaire.</Text>
            ) : null}
          </View>
        </ScrollView>
      </View>
    );
  }

  if (module && snapshot?.visit) {
    const targets = module.targets || [];
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <Header
          title={module.label}
          subtitle={targets.length + ' élément' + (targets.length > 1 ? 's' : '')}
          icon={module.icon}
          onBack={() => {
            setTargetId(null);
            setModuleId(null);
          }}
          accent={accent}
          light={light}
        />
        <Status text={status} accent={accent} light={light} />
        {module.id === 'remarks' ? (
          <TouchableOpacity
            disabled={Boolean(busy)}
            onPressIn={() => prewarmCameraRuntime().catch(() => {})}
            onPress={newRemark}
            style={{
              margin: 14,
              marginBottom: 0,
              minHeight: 62,
              borderRadius: 16,
              backgroundColor: accent,
              flexDirection: 'row',
              gap: 8,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {busy === 'remark:new' ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <CvcIcon name="camera" size={27} color={COLORS.white} />
                <CvcIcon name="plus" size={18} color={COLORS.white} />
              </>
            )}
            <Text style={{ color: COLORS.white, fontWeight: '900' }}>Nouvelle remarque</Text>
          </TouchableOpacity>
        ) : null}
        {module.id === 'photos' ? (
          <View style={{ padding: 14 }}>
            <TouchableOpacity
              disabled={Boolean(busy)}
              onPressIn={() => prewarmCameraRuntime().catch(() => {})}
              onPress={() => capture({ currentModule: module, label: 'Photo générale' })}
              style={[
                card,
                {
                  minHeight: 150,
                  backgroundColor: light,
                  borderColor: accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 9
                }
              ]}
            >
              {busy ? <ActivityIndicator color={accent} /> : <CvcIcon name="camera" size={48} color={accent} />}
              <Text style={{ color: accent, fontWeight: '900' }}>Capture libre</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={targets}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ padding: 14, paddingBottom: 34 }}
            renderItem={({ item }) => (
              <TargetRow
                item={item}
                module={module}
                onOpen={(row) => setTargetId(row.id)}
                onCapture={(row) => capture({ currentModule: module, currentTarget: row })}
                busy={busy === module.id + ':' + item.id + ':shot'}
                accent={accent}
                light={light}
              />
            )}
            ListEmptyComponent={
              module.id === 'remarks' ? null : (
                <View style={{ marginTop: 60, alignItems: 'center' }}>
                  <CvcIcon name={module.icon} size={50} color={accent} />
                  <Text style={{ marginTop: 12, color: COLORS.ink, fontWeight: '900' }}>Aucun élément</Text>
                </View>
              )
            }
          />
        )}
      </View>
    );
  }

  if (snapshot?.visit)
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <Header
          title="Mode Photo"
          subtitle={[snapshot.visit.site, snapshot.visit.date].filter(Boolean).join(' · ')}
          onBack={() => {
            setSnapshot(null);
            setStatus('');
          }}
          onExit={onExit}
          accent={accent}
          light={light}
        />
        <Status text={status} accent={accent} light={light} />
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 38 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
            {modules.map((m, i) => (
              <FadeUp key={m.id} delay={i * 40} style={{ width: '48.5%' }}>
                <ModuleTile
                  item={m}
                  onPress={(row) => {
                    setModuleId(row.id);
                    setTargetId(null);
                    setStatus('');
                  }}
                  accent={accent}
                  light={light}
                />
              </FadeUp>
            ))}
          </View>
        </ScrollView>
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <Header
        title="Mode Photo"
        subtitle="Capture terrain rapide · hors ligne"
        onExit={onExit}
        accent={accent}
        light={light}
      />
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : (
        <FlatList
          data={visits}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 34 }}
          ListHeaderComponent={
            <Text style={{ marginBottom: 10, color: COLORS.inkSoft, fontSize: 11.5, fontWeight: '800' }}>
              Sélectionner la visite à renseigner
            </Text>
          }
          renderItem={({ item }) => (
            <VisitRow
              item={item}
              onPress={(row) =>
                openSnapshot(row.id, true).catch((e) => Alert.alert('Visite indisponible', String(e?.message || e)))
              }
              accent={accent}
              light={light}
            />
          )}
          ListEmptyComponent={
            <View style={{ marginTop: 70, alignItems: 'center', paddingHorizontal: 26 }}>
              <CvcIcon name="camera" size={52} color={accent} />
              <Text style={{ marginTop: 13, color: COLORS.ink, fontWeight: '900' }}>Aucune visite locale</Text>
              <Text style={{ marginTop: 6, textAlign: 'center', color: COLORS.inkSoft }}>
                Le Mode Photo utilise les visites déjà présentes sur ce téléphone.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

export { PhotoPhoneScreen };
