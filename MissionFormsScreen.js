/**
 * Trames & formulaires — bibliothèque et trames d'une Mission.
 *
 * Avec `missionId` : trames rattachées (nouvelle fiche, reprise, fiches
 * terminées), puis la bibliothèque pour en ajouter. Sans `missionId` :
 * bibliothèque seule (depuis l'accueil Missions). Accès aux listes de
 * référence, aux modèles Word et au partage par fichier.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FONTS } from './styles.js';
import { MISSION_COLORS, missionStyles } from './missionTheme.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { ButtonGlow } from './ButtonGlow.js';
import { BottomSheet, confirmer } from './VisitKit.js';
import { showToast } from './PremiumDialogs.js';
import { hapticSuccess } from './fieldFeedback.js';
import { missionSheetStore } from './missionSheetStore.js';
import { FORM_TARGETS, normalizeFormFields } from './missionFormEngine.js';
import { FORM_STARTERS } from './missionFormStarters.js';
import {
  creerFiche,
  dupliquerTrame,
  enregistrerTrame,
  listerCiblesTrame,
  listerFiches,
  listerTrames,
  listerTramesMission,
  rattacherTrame,
  retirerTrame,
  supprimerTrame,
} from './missionFormsDb.js';
import { exporterPackMission, importerPackMission } from './missionPackDb.js';
import { formatSheetAgo, SHEET_TYPE, SheetButton, SheetCard, SheetEmptyLine, SheetErgoProvider, SheetIconButton, SheetRow, StatusPill } from './missionSheetUi.js';

const TARGET_LABEL = Object.fromEntries(FORM_TARGETS.map((t) => [t.key, t.label]));
const errorText = (e) => String(e?.message || e || 'Erreur inconnue');

export function MissionFormsScreen({ navigation, route }) {
  const missionId = route?.params?.missionId || null;
  const newEntryFormId = route?.params?.newEntryFormId || null;
  const [library, setLibrary] = useState([]);
  const [attached, setAttached] = useState([]);
  const [entries, setEntries] = useState([]);
  const [openForm, setOpenForm] = useState(null);
  const [targetSheet, setTargetSheet] = useState(null); // { form, targets }
  const [menuForm, setMenuForm] = useState(null);
  const [startersOpen, setStartersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const gloves = useMemo(() => missionSheetStore.getGloves(), []);

  const reload = useCallback(async () => {
    const [all, linked, fiches] = await Promise.all([
      listerTrames(),
      missionId ? listerTramesMission(missionId) : Promise.resolve([]),
      missionId ? listerFiches(missionId) : Promise.resolve([]),
    ]);
    setLibrary(all);
    setAttached(linked);
    setEntries(fiches);
  }, [missionId]);

  useEffect(() => { reload().catch((e) => Alert.alert('Trames indisponibles', errorText(e))); }, [reload]);

  const attachedIds = useMemo(() => new Set(attached.map((f) => f.id)), [attached]);
  const others = library.filter((f) => !attachedIds.has(f.id));

  const openEntry = (entryId) => navigation.navigate('MissionFormFill', { missionId, entryId });

  const startEntry = useCallback(async (form) => {
    try {
      if (form.target_type === 'mission') {
        const existing = entries.find((e) => e.form_id === form.id);
        if (existing) { openEntry(existing.id); return; }
        openEntry(await creerFiche({ missionId, formId: form.id, targetType: 'mission', targetLabel: 'Mission' }));
        return;
      }
      if (form.target_type === 'free') {
        const n = entries.filter((e) => e.form_id === form.id).length + 1;
        openEntry(await creerFiche({ missionId, formId: form.id, targetType: 'free', targetLabel: `Fiche ${n}` }));
        return;
      }
      const targets = await listerCiblesTrame(missionId, form.target_type);
      setTargetSheet({ form, targets });
    } catch (e) {
      Alert.alert('Fiche non créée', errorText(e));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, missionId]);

  // Arrivée depuis le bloc « Trames » de la fiche : ouvrir directement la nouvelle fiche.
  const handledNewEntry = useRef(false);
  useEffect(() => {
    if (!newEntryFormId || !attached.length || handledNewEntry.current) return;
    handledNewEntry.current = true;
    const form = attached.find((f) => f.id === newEntryFormId);
    if (form) startEntry(form);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newEntryFormId, attached.length]);

  const pickTarget = async (target) => {
    const { form } = targetSheet;
    setTargetSheet(null);
    const existing = entries.find((e) => e.form_id === form.id && e.target_id === target.id);
    if (existing) { openEntry(existing.id); return; }
    try {
      openEntry(await creerFiche({ missionId, formId: form.id, targetType: form.target_type, targetId: target.id, targetLabel: target.label }));
    } catch (e) {
      Alert.alert('Fiche non créée', errorText(e));
    }
  };

  const attach = async (form) => {
    try {
      await rattacherTrame(missionId, form.id);
      hapticSuccess();
      showToast(form.label, { title: 'Trame ajoutée à la Mission', tone: 'success' });
      await reload();
    } catch (e) {
      Alert.alert('Trame non ajoutée', errorText(e));
    }
  };

  const fromStarter = async (starter) => {
    setStartersOpen(false);
    try {
      const formId = await enregistrerTrame({ label: starter.label, description: starter.description, targetType: starter.target, fields: starter.fields, source: `exemple:${starter.key}` });
      if (missionId) await rattacherTrame(missionId, formId);
      await reload();
      navigation.navigate('MissionFormBuilder', { formId, missionId });
    } catch (e) {
      Alert.alert('Trame non créée', errorText(e));
    }
  };

  const menuActions = (form) => [
    { label: 'Modifier la trame', icon: 'edit', onPress: () => navigation.navigate('MissionFormBuilder', { formId: form.id, missionId }) },
    { label: 'Dupliquer', icon: 'copy', onPress: async () => { await dupliquerTrame(form.id); await reload(); } },
    missionId && attachedIds.has(form.id) ? { label: 'Retirer de cette Mission', icon: 'eye-off', onPress: async () => { await retirerTrame(missionId, form.id); await reload(); showToast('Les fiches déjà remplies sont conservées.', { title: 'Trame retirée' }); } } : null,
    {
      label: Number(form.entry_count || 0) > 0 ? 'Archiver (fiches conservées)' : 'Supprimer', icon: 'trash', destructive: true,
      onPress: () => confirmer({
        title: `Supprimer « ${form.label} » ?`,
        message: Number(form.entry_count || 0) > 0 ? 'Elle a déjà des fiches : elle sera archivée et ses fiches resteront dans les Missions.' : 'Elle n’a jamais été remplie.',
        onConfirm: async () => { await supprimerTrame(form.id); await reload(); },
      }),
    },
  ].filter(Boolean);

  const exportPack = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await exporterPackMission();
      if (result) showToast(`${result.counts.forms} trame(s), ${result.counts.models} modèle(s), ${result.counts.lists} liste(s), ${result.counts.templates} modèle(s) Word`, { title: 'Fichier de partage créé', tone: 'success' });
    } catch (e) {
      Alert.alert('Partage impossible', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const importPack = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await importerPackMission();
      if (!result) return;
      await reload();
      Alert.alert('Import terminé', `${result.added.forms} trame(s), ${result.added.models} modèle(s), ${result.added.lists} liste(s) et ${result.added.templates} modèle(s) Word ajoutés.${result.skipped ? `\n${result.skipped} élément(s) déjà présents ignorés.` : ''}`);
    } catch (e) {
      Alert.alert('Import impossible', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const entriesOf = (formId) => entries.filter((e) => e.form_id === formId);

  return (
    <SheetErgoProvider gloves={gloves}>
      <View style={[{ flex: 1 }, missionStyles.screen]}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.hero}>
            <Text style={SHEET_TYPE.title}>{missionId ? 'Trames de la Mission' : 'Trames & modèles'}</Text>
            <Text style={SHEET_TYPE.meta}>Crée tes propres formulaires : champs, choix, nombres avec seuils, calculs, avis qui créent des réserves, photos, GPS. Ils sortent dans l’Excel et les modèles Word.</Text>
          </View>

          <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('MissionFormBuilder', { missionId })} style={s.primary}>
            <ButtonGlow tone="mission" radius={17} />
            <CvcIcon name="plus" size={20} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={s.primaryText}>Créer une trame</Text>
          </TouchableOpacity>
          <View style={s.row}>
            <SheetButton icon="copy" label="Partir d’un exemple" onPress={() => setStartersOpen(true)} style={{ flex: 1 }} />
          </View>

          {missionId ? (
            <SheetCard title="Rattachées à cette Mission" icon="control" count={attached.length || null}>
              {attached.length ? attached.map((form) => {
                const list = entriesOf(form.id);
                const expanded = openForm === form.id;
                return (
                  <View key={form.id} style={s.formBlock}>
                    <SheetRow
                      icon="control"
                      title={form.label}
                      meta={`${TARGET_LABEL[form.target_type] || ''} · ${form.done_count || 0}/${form.entry_count || 0} terminée(s)`}
                      onPress={() => setOpenForm(expanded ? null : form.id)}
                      accessibilityLabel={`${form.label} : afficher les fiches`}
                      right={<SheetIconButton icon="more" label={`Actions pour ${form.label}`} onPress={() => setMenuForm(form)} />}
                      last
                    />
                    <View style={s.row}>
                      <SheetButton icon="plus" label={form.target_type === 'mission' && list.length ? 'Ouvrir la fiche' : 'Nouvelle fiche'} onPress={() => startEntry(form)} style={{ flex: 1 }} />
                      {list.length ? <SheetButton icon={expanded ? 'chevron-up' : 'chevron-down'} tone="neutral" label={`${list.length} fiche(s)`} onPress={() => setOpenForm(expanded ? null : form.id)} style={{ flex: 1 }} /> : null}
                    </View>
                    {expanded ? list.map((entry, index) => (
                      <SheetRow
                        key={entry.id}
                        icon={entry.status === 'done' ? 'check' : 'edit'}
                        iconTone={entry.status === 'done' ? 'info' : 'warning'}
                        title={entry.target_label || 'Fiche'}
                        meta={`modifiée ${formatSheetAgo(entry.updated_at)}`}
                        onPress={() => openEntry(entry.id)}
                        right={<StatusPill label={entry.status === 'done' ? 'Terminée' : 'Brouillon'} tone={entry.status === 'done' ? 'info' : 'warning'} />}
                        last={index === list.length - 1}
                      />
                    )) : null}
                  </View>
                );
              }) : <SheetEmptyLine icon="control" text="Aucune trame rattachée. Ajoute-en une depuis la bibliothèque ou crée la tienne." />}
            </SheetCard>
          ) : null}

          <SheetCard title={missionId ? 'Bibliothèque' : 'Mes trames'} icon="list" count={(missionId ? others : library).length || null}>
            {(missionId ? others : library).length ? (missionId ? others : library).map((form, index, list) => {
              const fields = normalizeFormFields(form.fields_json).filter((f) => f.type !== 'section').length;
              return (
                <SheetRow
                  key={form.id}
                  icon="control"
                  iconTone="neutral"
                  title={form.label}
                  meta={`${TARGET_LABEL[form.target_type] || ''} · ${fields} champ(s) · v${form.version}${form.mission_count ? ` · ${form.mission_count} Mission(s)` : ''}`}
                  onPress={() => (missionId ? attach(form) : navigation.navigate('MissionFormBuilder', { formId: form.id }))}
                  accessibilityLabel={missionId ? `Ajouter ${form.label} à la Mission` : `Modifier ${form.label}`}
                  right={(
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {missionId ? <SheetIconButton icon="plus" label={`Ajouter ${form.label} à la Mission`} onPress={() => attach(form)} /> : null}
                      <SheetIconButton icon="more" tone="neutral" label={`Actions pour ${form.label}`} onPress={() => setMenuForm(form)} />
                    </View>
                  )}
                  last={index === list.length - 1}
                />
              );
            }) : <SheetEmptyLine icon="list" text={missionId ? 'Toutes tes trames sont déjà rattachées.' : 'Aucune trame pour l’instant.'} actionLabel="Exemples" onAction={() => setStartersOpen(true)} />}
          </SheetCard>

          <SheetCard title="Outils" icon="tools">
            <SheetRow icon="list" title="Listes de référence" meta="Marques, états, fiches CEE… importées d’un Excel, réutilisées dans les choix." onPress={() => navigation.navigate('MissionRefLists')} />
            <SheetRow icon="document" title="Modèles Word à balises" meta={missionId ? 'Ton propre rapport, rempli automatiquement avec cette Mission.' : 'Ton propre rapport, rempli automatiquement.'} onPress={() => navigation.navigate('MissionReportTemplates', { missionId })} />
            <SheetRow icon="export" title={busy ? 'Patiente…' : 'Partager mes trames et modèles'} meta="Un fichier à envoyer à un collègue : trames, listes, modèles de Mission et modèles Word." onPress={exportPack} />
            <SheetRow icon="upload" title="Importer un fichier de partage" meta="Ajoute ce qu’un collègue t’a envoyé, sans rien écraser." onPress={importPack} last />
          </SheetCard>
        </ScrollView>

        <BottomSheet visible={startersOpen} onClose={() => setStartersOpen(false)} title="Partir d’un exemple" subtitle="Une copie est créée : modifie-la librement.">
          {FORM_STARTERS.map((starter, index) => (
            <SheetRow key={starter.key} icon="control" title={starter.label} meta={starter.description} onPress={() => fromStarter(starter)} last={index === FORM_STARTERS.length - 1} />
          ))}
        </BottomSheet>

        <BottomSheet visible={Boolean(targetSheet)} onClose={() => setTargetSheet(null)} title={targetSheet ? `Nouvelle fiche · ${targetSheet.form.label}` : ''} subtitle="Pour quoi ?">
          {targetSheet?.targets?.length ? targetSheet.targets.map((target, index) => {
            const has = entries.find((e) => e.form_id === targetSheet.form.id && e.target_id === target.id);
            return <SheetRow key={target.id} icon={has ? 'edit' : 'plus'} title={target.label} meta={has ? (has.status === 'done' ? 'Fiche terminée : la rouvrir' : 'Brouillon : reprendre') : 'Nouvelle fiche'} onPress={() => pickTarget(target)} last={index === targetSheet.targets.length - 1} />;
          }) : <SheetEmptyLine icon="location" text={`Aucun élément « ${TARGET_LABEL[targetSheet?.form?.target_type] || ''} » dans cette Mission. Ajoute-les dans Patrimoine ou Inventaire.`} />}
        </BottomSheet>

        <BottomSheet visible={Boolean(menuForm)} onClose={() => setMenuForm(null)} title={menuForm?.label || ''}>
          {menuForm ? menuActions(menuForm).map((item, index, list) => (
            <SheetRow key={item.label} icon={item.icon} iconTone={item.destructive ? 'danger' : 'accent'} title={item.label} onPress={() => { setMenuForm(null); setTimeout(() => item.onPress(), 200); }} last={index === list.length - 1} />
          )) : null}
        </BottomSheet>
      </View>
    </SheetErgoProvider>
  );
}

const s = StyleSheet.create({
  content: { padding: 16, paddingBottom: 132, gap: 12 },
  hero: { gap: 6, paddingHorizontal: 4 },
  primary: { minHeight: 54, borderRadius: 17, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryText: { color: '#FFFFFF', fontFamily: FONTS.bold, fontSize: 16 },
  row: { flexDirection: 'row', gap: 8 },
  formBlock: { gap: 8, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: MISSION_COLORS.accentLine },
});
