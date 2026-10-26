import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { COLORS, FONTS, styles } from './styles.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { ButtonGlow } from './ButtonGlow.js';
import { BottomSheet, SectionBanner } from './VisitKit.js';
import { feedback } from './fieldFeedback.js';
import { listerTramesCatalogue } from './trameRegistry.js';
import { loadLocalTrames, saveLocalTrame, setLocalTrameActive } from './trameLibraryDb.js';
import { addTramePoint, changeTramePoint, editableTrameCopy, exportTramePackage, importTramePackage, removeTramePoint, renameTrameSection, writeTrameManifest } from './trameLibrary.js';
import { defaultPointPresets, draftTrameFromWorkbook } from './trameWorkbookImport.js';

const AVIS = ['S', 'N.S', 'N.R', 'S.O', 'N.V'];
const copy = (v) => JSON.parse(JSON.stringify(v));
function Action({ label, icon = 'plus', onPress, primary = false, disabled = false }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[primary ? styles.btnPrimary : styles.btnSecondary, local.action, disabled && { opacity: 0.5 }]}>
    {primary ? <ButtonGlow /> : null}
    <CvcIcon name={icon} size={18} color={primary ? '#FFFFFF' : COLORS.orange} />
    <Text style={primary ? styles.btnPrimaryText : styles.btnSecondaryText}>{label}</Text>
  </TouchableOpacity>;
}
function Entry({ label, value, onChangeText, multiline = false, ...props }) {
  return <View style={local.entry}><Text style={local.label}>{label}</Text><TextInput style={[styles.input, multiline && { minHeight: 70, textAlignVertical: 'top' }]} value={value} onChangeText={onChangeText} multiline={multiline} {...props} /></View>;
}

export function TrameLibraryPanel() {
  const [catalogue, setCatalogue] = useState(listerTramesCatalogue);
  const [draft, setDraft] = useState(null);
  const [opened, setOpened] = useState(null);
  const [point, setPoint] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [structure, setStructure] = useState(null);
  const [structureName, setStructureName] = useState('');
  const refresh = () => setCatalogue(listerTramesCatalogue());
  useEffect(() => { loadLocalTrames().then((errors) => { refresh(); if (errors.length) Alert.alert('Trame à restaurer', errors.join('\n')); }).catch((e) => Alert.alert('Bibliothèque indisponible', e.message)); }, []);
  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { Alert.alert('Trame non enregistrée', String(e.message || e)); }
    finally { setBusy(false); }
  };
  const edit = (definition) => { setDraft(editableTrameCopy(definition)); setOpened(null); setSearch(''); };
  const importModel = () => run(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], copyToCacheDirectory: true });
    if (result.canceled) return;
    const file = result.assets[0];
    if (file.size > 5 * 1024 * 1024) throw new Error('Le fichier dépasse 5 Mo.');
    let definition;
    if (/\.json$/i.test(file.name)) definition = importTramePackage(await FileSystem.readAsStringAsync(file.uri));
    else {
      const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
      const wb = XLSX.read(base64, { type: 'base64', cellStyles: true });
      const sheets = wb.SheetNames.filter((name) => /^trame/i.test(name));
      if (sheets.length > 1) throw new Error('Le classeur contient plusieurs feuilles de trame. Conserve une seule feuille TRAME dans la copie à intégrer.');
      definition = draftTrameFromWorkbook(wb, sheets[0]);
    }
    edit(definition);
    feedback('Structure importée : vérifie les types et les commentaires avant de l’enregistrer.');
  });
  const share = (definition, model = false) => run(async () => {
    if (!await Sharing.isAvailableAsync()) throw new Error('Le partage de fichiers est indisponible sur cet appareil.');
    const name = String(definition.nom).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uri = `${FileSystem.cacheDirectory}${name}${model ? '.xlsx' : '.metra.json'}`;
    if (model) {
      const wb = XLSX.read(definition.excel.templateBase64, { type: 'base64', cellStyles: true });
      if (definition.libraryManaged) writeTrameManifest(wb, definition);
      await FileSystem.writeAsStringAsync(uri, XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }), { encoding: FileSystem.EncodingType.Base64 });
    } else await FileSystem.writeAsStringAsync(uri, exportTramePackage(definition));
    await Sharing.shareAsync(uri, { mimeType: model ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/json' });
  });
  const save = () => run(async () => {
    if (!draft.nom.trim()) throw new Error('Donne un nom à cette trame.');
    await saveLocalTrame(draft); refresh(); setDraft(null); feedback('Nouvelle version enregistrée. Les anciennes visites restent inchangées.');
  });
  const closeDraft = () => Alert.alert('Quitter la modification ?', 'Le brouillon non enregistré sera abandonné. Les visites existantes ne changent pas.', [{ text: 'Continuer à modifier', style: 'cancel' }, { text: 'Abandonner le brouillon', onPress: () => setDraft(null) }]);
  const openPoint = (panel, section, field = null) => setPoint({ panel, section, oldKey: field?.cle || null, cle: field?.cle || '', type: field?.type || 'champ', input: field?.numeric ? 'number' : field?.options ? 'choice' : field?.numericIndex ? 'index' : 'text', options: (field?.options || []).join('\n'), min: String(field?.numeric?.min ?? 0), max: String(field?.numeric?.max ?? 120), step: String(field?.numeric?.step ?? 0.1), unit: field?.numeric?.unit || '', comments: Object.fromEntries(AVIS.map((avis) => [avis, field?.presets?.[avis]?.[0]?.commentaire || ''])) });
  const applyPoint = () => {
    try {
      const changes = { cle: point.cle.trim(), type: point.type, options: undefined, numeric: undefined, numericIndex: false, textOnly: false };
      if (point.type === 'controle') changes.presets = Object.fromEntries(AVIS.map((avis) => [avis, [{ label: avis, commentaire: point.comments[avis] || defaultPointPresets(changes.cle)[avis][0].commentaire, ...(avis === 'N.S' ? { reserve: point.comments[avis] || defaultPointPresets(changes.cle)[avis][0].reserve } : {}) }]]));
      else {
        changes.presets = undefined;
        if (point.input === 'choice') changes.options = point.options.split('\n').map((v) => v.trim()).filter(Boolean);
        if (point.input === 'number') changes.numeric = { min: Number(point.min.replace(',', '.')), max: Number(point.max.replace(',', '.')), step: Number(point.step.replace(',', '.')), unit: point.unit, start: Number(point.min.replace(',', '.')) };
        changes.numericIndex = point.input === 'index'; changes.textOnly = point.input === 'text';
      }
      setDraft(point.oldKey ? changeTramePoint(draft, point.panel, point.section, point.oldKey, changes) : addTramePoint(draft, point.panel, point.section, changes));
      setPoint(null);
    } catch (e) { Alert.alert('Point non modifié', e.message); }
  };
  const remove = (panel, section, field) => Alert.alert('Retirer ce point du modèle ?', 'Le retrait s’appliquera aux nouvelles visites de cette version. Les visites déjà enregistrées sont conservées.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Retirer', style: 'destructive', onPress: () => {
    try { setDraft(removeTramePoint(draft, panel, section, field.cle)); } catch (e) { Alert.alert('Point conservé', e.message); }
  } }]);
  const addStructure = () => {
    const name = structureName.trim(); if (!name) return;
    const next = copy(draft);
    if (structure.kind === 'panel') {
      const id = `p-personnel-${Date.now()}`; next.ui.panels[id] = {}; next.ui.labels[id] = name;
      const at = next.ui.tabOrder.indexOf('SEP'); next.ui.tabOrder.splice(at >= 0 ? at : next.ui.tabOrder.length, 0, id); setOpened(id);
    } else if (structure.kind === 'rename-section') {
      try { setDraft(renameTrameSection(draft, structure.panel, structure.section, name)); setStructure(null); }
      catch (e) { Alert.alert('Rubrique non modifiée', e.message); }
      return;
    } else {
      if (next.ui.panels[structure.panel][name]) { Alert.alert('Rubrique déjà présente', 'Choisis un autre nom.'); return; }
      next.ui.panels[structure.panel][name] = []; setOpened(structure.panel);
    }
    setDraft(next); setStructure(null);
  };
  const movePanel = (panel, direction) => {
    const next = copy(draft); const order = next.ui.tabOrder;
    const from = order.indexOf(panel); const target = from + direction;
    if (target < 0 || target >= order.length || !next.ui.panels[order[target]]) return;
    [order[from], order[target]] = [order[target], order[from]]; setDraft(next);
  };
  return <>
    <ScrollView key={draft ? 'edition-trame' : 'catalogue-trames'} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelContent} removeClippedSubviews={false}>
      {!draft ? <>
        <Text style={styles.sectionLabel}>Bibliothèque de trames</Text>
        <Text style={local.hint}>Importer un modèle Excel, ajuster ses points puis enregistrer une version. Les trames restent disponibles hors connexion et sont conservées avec la sauvegarde de METRA.</Text>
        <Action primary icon="download" label={busy ? 'Traitement…' : 'Intégrer une trame'} disabled={busy} onPress={importModel} />
        {catalogue.map((definition) => <View key={definition.id} style={styles.formCard}>
          <View style={local.row}><CvcIcon name="document" size={28} color={COLORS.orange} /><View style={{ flex: 1 }}><Text style={local.title}>{definition.nom}</Text><Text style={local.hint}>Version {definition.version} · {definition.actif === false ? 'Masquée pour les nouvelles visites' : 'Disponible'}</Text></View></View>
          <Action icon="edit" label={definition.libraryManaged ? 'Modifier la trame' : 'Créer une copie modifiable'} disabled={busy} onPress={() => edit(definition)} />
          <Action icon="download" label="Exporter le modèle Excel" disabled={busy} onPress={() => share(definition, true)} />
          {definition.libraryManaged ? <>
            <Action icon="export" label="Partager la trame modifiable" disabled={busy} onPress={() => share(definition)} />
            <Action icon="eye" label={definition.actif === false ? 'Réactiver la trame' : 'Masquer des nouvelles visites'} disabled={busy} onPress={() => Alert.alert('Disponibilité de la trame', 'L’historique reste accessible. Seule la liste des nouvelles visites change.', [{ text: 'Annuler', style: 'cancel' }, { text: 'Confirmer', onPress: () => run(async () => { await setLocalTrameActive(definition, definition.actif === false); refresh(); }) }])} />
          </> : null}
        </View>)}
      </> : <>
        <Text style={styles.sectionLabel}>Modifier une trame</Text>
        <Text style={local.hint}>Cette modification crée une nouvelle version pour les prochaines visites. Les anciennes visites et leurs exports restent attachés à leur modèle d’origine.</Text>
        <Entry label="Nom de la trame" value={draft.nom} onChangeText={(nom) => setDraft({ ...draft, nom })} maxLength={100} />
        <Action primary icon="check" label={busy ? 'Enregistrement…' : 'Enregistrer cette version'} disabled={busy} onPress={save} />
        <Action icon="close" label="Fermer le brouillon" disabled={busy} onPress={closeDraft} />
        <Entry label="Rechercher un point" value={search} onChangeText={setSearch} />
        {draft.ui.tabOrder.filter((panel) => draft.ui.panels[panel]).map((panel) => <View key={panel} style={styles.formCard}>
          <SectionBanner title={draft.ui.labels[panel]} open={opened === panel || Boolean(search)} onToggle={() => setOpened(opened === panel ? null : panel)} />
          {opened === panel || search ? <>
            <Entry label="Nom de l’onglet" value={draft.ui.labels[panel]} onChangeText={(name) => setDraft({ ...draft, ui: { ...draft.ui, labels: { ...draft.ui.labels, [panel]: name } } })} />
            <View style={local.row}><Action icon="chevron-up" label="Monter" onPress={() => movePanel(panel, -1)} /><Action icon="chevron-down" label="Descendre" onPress={() => movePanel(panel, 1)} /></View>
            {Object.entries(draft.ui.panels[panel]).map(([section, fields]) => <View key={section} style={local.section}>
              <Text style={local.title}>{section}</Text>
              {section !== 'Général' ? <Action icon="edit" label="Renommer la rubrique" onPress={() => { setStructureName(section); setStructure({ kind: 'rename-section', panel, section }); }} /> : null}
              {fields.filter((f) => !search || f.cle.toLowerCase().includes(search.toLowerCase())).map((field) => <View key={field.cle} style={local.pointRow}>
                <TouchableOpacity accessibilityRole="button" onPress={() => openPoint(panel, section, field)} style={{ flex: 1, paddingVertical: 12 }}><Text style={local.point}>{field.cle}</Text><Text style={local.hint}>{field.type === 'controle' ? 'Contrôle avec avis et commentaires' : field.numeric ? `Mesure (${field.numeric.unit})` : field.options ? 'Choix rapides' : 'Information'}</Text></TouchableOpacity>
                {!field.meta ? <TouchableOpacity accessibilityLabel={`Retirer ${field.cle}`} hitSlop={10} onPress={() => remove(panel, section, field)}><CvcIcon name="trash" size={20} color={COLORS.red} /></TouchableOpacity> : null}
              </View>)}
              <Action label="Ajouter un point" onPress={() => openPoint(panel, section)} />
            </View>)}
            <Action label="Ajouter une rubrique" onPress={() => { setStructureName(''); setStructure({ kind: 'section', panel }); }} />
          </> : null}
        </View>)}
        <Action label="Ajouter un onglet" onPress={() => { setStructureName(''); setStructure({ kind: 'panel' }); }} />
      </>}
    </ScrollView>
    <BottomSheet visible={Boolean(point)} onClose={() => setPoint(null)} title={point?.oldKey ? 'Modifier le point' : 'Ajouter un point'}>
      {point ? <>
        <Entry label="Intitulé" value={point.cle} onChangeText={(cle) => setPoint({ ...point, cle })} maxLength={200} />
        <View style={local.row}>{[['champ', 'Information / mesure'], ['controle', 'Contrôle avec avis']].map(([type, label]) => <Action key={type} label={label} icon={point.type === type ? 'check' : 'plus'} onPress={() => setPoint({ ...point, type })} />)}</View>
        {point.type === 'champ' ? <>
          {Object.entries({ text: 'Texte libre', choice: 'Choix rapides', number: 'Mesure avec unité', index: 'Index de compteur' }).map(([input, label]) => <Action key={input} icon={point.input === input ? 'check' : 'plus'} label={label} onPress={() => setPoint({ ...point, input })} />)}
          {point.input === 'choice' ? <Entry label="Choix proposés (un par ligne)" multiline value={point.options} onChangeText={(options) => setPoint({ ...point, options })} /> : null}
          {point.input === 'number' ? <>{['min', 'max', 'step', 'unit'].map((key) => <Entry key={key} label={{ min: 'Minimum', max: 'Maximum', step: 'Pas', unit: 'Unité' }[key]} value={point[key]} onChangeText={(value) => setPoint({ ...point, [key]: value })} />)}</> : null}
        </> : AVIS.map((avis) => <Entry key={avis} label={`Commentaire proposé pour ${avis}`} multiline value={point.comments[avis]} onChangeText={(value) => setPoint({ ...point, comments: { ...point.comments, [avis]: value } })} />)}
        <Action primary icon="check" label="Appliquer au brouillon" onPress={applyPoint} />
      </> : null}
    </BottomSheet>
    <BottomSheet visible={Boolean(structure)} onClose={() => setStructure(null)} title={structure?.kind === 'panel' ? 'Nouvel onglet' : structure?.kind === 'rename-section' ? 'Renommer la rubrique' : 'Nouvelle rubrique'}>
      <Entry label="Nom" value={structureName} onChangeText={setStructureName} maxLength={150} />
      <Action primary label="Ajouter au brouillon" onPress={addStructure} />
    </BottomSheet>
  </>;
}
const local = StyleSheet.create({
  action: { flex: 0, flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 5, minHeight: 48 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  entry: { marginVertical: 8 }, label: { fontFamily: FONTS.bodySemi, fontSize: 12, color: COLORS.inkSoft, marginBottom: 6 },
  title: { fontFamily: FONTS.bold, color: COLORS.ink, fontSize: 15 },
  hint: { fontFamily: FONTS.body, color: COLORS.inkSoft, fontSize: 12, lineHeight: 18, marginVertical: 5 },
  section: { marginVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 12 },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.line },
  point: { fontFamily: FONTS.bodySemi, color: COLORS.ink, fontSize: 13 },
});
