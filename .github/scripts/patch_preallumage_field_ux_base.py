from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label}: marker not found')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# 1. Plan du site : compact, ouvert en pop-up et intégré au header scrollable.
# ---------------------------------------------------------------------------
plan = Path('PreAllumagePlanCard.js')
plan.write_text(r'''import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Modal, Text, TouchableOpacity, View } from 'react-native';
import { choisirEtSauverPlanSite, getPlanSitePourVisite, supprimerPlanSitePourVisite } from './sitePlanDb.js';
import { COLORS, styles } from './styles.js';

export function PreAllumagePlanCard({ visiteId, onSaved }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);

  const charger = useCallback(async () => {
    try { setPlan(await getPlanSitePourVisite(visiteId)); }
    catch (e) { console.warn('Plan du site non chargé', e); }
  }, [visiteId]);

  useEffect(() => { charger(); }, [charger]);

  const choisir = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await choisirEtSauverPlanSite(visiteId);
      if (uri) {
        setPlan((p) => ({ ...(p || {}), uri }));
        onSaved?.();
      }
    } catch (e) {
      Alert.alert('Plan du site', String(e?.message || e));
    } finally { setBusy(false); }
  };

  const supprimer = () => {
    if (!plan?.uri || busy) return;
    Alert.alert('Supprimer le plan du site ?', 'Le plan ne sera plus repris automatiquement dans les rapports Pré-allumage de ce site.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          await supprimerPlanSitePourVisite(visiteId);
          setPlan((p) => ({ ...(p || {}), uri: null }));
          onSaved?.();
        } catch (e) { Alert.alert('Suppression impossible', String(e?.message || e)); }
        finally { setBusy(false); }
      } },
    ]);
  };

  return <>
    <TouchableOpacity
      onPress={() => setVisible(true)}
      style={{ minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: plan?.uri ? '#B7D8C2' : COLORS.line, backgroundColor: plan?.uri ? '#F1FAF4' : COLORS.white }}
    >
      <Text style={{ fontSize: 14 }}>▧</Text>
      <View>
        <Text style={{ color: COLORS.ink, fontSize: 10, fontWeight: '900' }}>Plan</Text>
        <Text style={{ color: plan?.uri ? '#287A45' : COLORS.inkSoft, fontSize: 8, fontWeight: '700' }}>{plan?.uri ? 'Enregistré' : 'À ajouter'}</Text>
      </View>
    </TouchableOpacity>

    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.modalOverlay}><View style={[styles.modalSheet, { maxWidth: 760, width: '94%' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}><Text style={styles.modalTitle}>Plan du site</Text><Text style={[styles.importHint, { marginTop: 3 }]}>Le plan est enregistré au niveau du site et repris automatiquement dans les rapports Pré-allumage.</Text></View>
          <TouchableOpacity onPress={() => setVisible(false)} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 20, color: COLORS.inkSoft }}>✕</Text></TouchableOpacity>
        </View>
        {plan?.uri ? <View style={{ borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', marginTop: 12 }}>
          <Image source={{ uri: plan.uri }} style={{ width: '100%', height: 330 }} resizeMode="contain" />
        </View> : <View style={{ minHeight: 170, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.line, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', marginTop: 12, padding: 16 }}>
          <Text style={{ color: COLORS.muted, textAlign: 'center' }}>Aucun plan enregistré pour ce site.</Text>
        </View>}
        <View style={[styles.modalActions, { marginTop: 12 }]}>
          {plan?.uri ? <TouchableOpacity style={styles.btnSecondary} disabled={busy} onPress={supprimer}><Text style={styles.btnSecondaryText}>Supprimer</Text></TouchableOpacity> : null}
          <TouchableOpacity style={[styles.btnPrimary, { opacity: busy ? 0.55 : 1 }]} disabled={busy} onPress={choisir}><Text style={styles.btnPrimaryText}>{busy ? 'Traitement…' : (plan?.uri ? 'Remplacer' : 'Sélectionner un plan')}</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </>;
}
''', encoding='utf-8')

business = Path('PreAllumageInstallationPanelBusiness.js')
s = business.read_text(encoding='utf-8')
s = replace_once(
    s,
    """  return <View style={{ flex: 1 }}>
    <PreAllumagePlanCard visiteId={props.visiteId} onSaved={props.onSaved} />
    <PreAllumageInstallationPanelV3 {...props} />
  </View>;
""",
    """  return <PreAllumageInstallationPanelV3
    {...props}
    planControl={<PreAllumagePlanCard visiteId={props.visiteId} onSaved={props.onSaved} />}
  />;
""",
    'compact plan integration',
)
business.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 2. Installations : swipe local, ajout de compteurs et unité modifiable.
# ---------------------------------------------------------------------------
p = Path('PreAllumageInstallationPanelV3.js')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "import { ActivityIndicator, Alert, Modal, SectionList, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';",
    "import { ActivityIndicator, Alert, Modal, PanResponder, SectionList, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';",
    'V3 PanResponder import',
)
import_marker = "import { preparerChaufferieDynamiquePreAllumage } from './preAllumageChaufferieDb.js';\n"
counter_import = "import { ajouterCompteurPreAllumage, mettreAJourUniteCompteurPreAllumage, PREALLUMAGE_COUNTER_PRESETS, PREALLUMAGE_COUNTER_UNITS, supprimerCompteurPreAllumage } from './preAllumageCounterDb.js';\n"
if counter_import not in s:
    s = replace_once(s, import_marker, import_marker + counter_import, 'counter db import')

counter_modal = r'''
function AddCounterModal({ visible, onClose, onAdd }) {
  const [presetCode, setPresetCode] = useState('energie_thermique');
  const [nom, setNom] = useState('');
  const [unite, setUnite] = useState('MWh');
  const [autreUnite, setAutreUnite] = useState('');
  const def = PREALLUMAGE_COUNTER_PRESETS.find((x) => x.code === presetCode) || PREALLUMAGE_COUNTER_PRESETS[0];
  useEffect(() => {
    if (!visible) return;
    setPresetCode('energie_thermique');
    setNom('');
    setUnite('MWh');
    setAutreUnite('');
  }, [visible]);
  const choisirPreset = (code) => {
    const next = PREALLUMAGE_COUNTER_PRESETS.find((x) => x.code === code) || PREALLUMAGE_COUNTER_PRESETS[0];
    setPresetCode(next.code);
    setNom(next.code === 'autre' ? '' : next.label);
    setUnite(next.unit || '');
    setAutreUnite('');
  };
  const units = [...new Set([...(def.units || []), ...PREALLUMAGE_COUNTER_UNITS])];
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalOverlay}><View style={[styles.modalSheet, { maxWidth: 720, width: '94%' }]}>
    <Text style={styles.modalTitle}>Ajouter un compteur</Text>
    <Text style={[styles.importHint, { marginBottom: 10 }]}>Choisissez le type : l’unité est proposée automatiquement. Elle restera modifiable en touchant directement l’unité à droite de l’index.</Text>
    <Text style={{ color: COLORS.ink, fontWeight: '900', marginBottom: 7 }}>Type de compteur</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{PREALLUMAGE_COUNTER_PRESETS.map((x) => <TouchableOpacity key={x.code} onPress={() => choisirPreset(x.code)} style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 18, borderWidth: 1, borderColor: presetCode === x.code ? COLORS.orange : COLORS.line, backgroundColor: presetCode === x.code ? COLORS.orangeLight : COLORS.white }}><Text style={{ color: presetCode === x.code ? COLORS.orangeDark : COLORS.inkSoft, fontSize: 10, fontWeight: '900' }}>{x.label}</Text></TouchableOpacity>)}</View>
    <Text style={{ color: COLORS.ink, fontWeight: '900', marginTop: 12, marginBottom: 6 }}>Nom affiché</Text>
    <TextInput style={styles.input} value={nom} onChangeText={setNom} placeholder={def.label || 'Nom du compteur'} />
    <Text style={{ color: COLORS.ink, fontWeight: '900', marginTop: 12, marginBottom: 6 }}>Unité</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{units.map((u) => <TouchableOpacity key={u} onPress={() => { setUnite(u); setAutreUnite(''); }} style={{ minHeight: 34, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 17, borderWidth: 1, borderColor: unite === u && !autreUnite ? COLORS.orange : COLORS.line, backgroundColor: unite === u && !autreUnite ? COLORS.orangeLight : COLORS.white }}><Text style={{ color: unite === u && !autreUnite ? COLORS.orangeDark : COLORS.inkSoft, fontWeight: '900', fontSize: 10 }}>{u}</Text></TouchableOpacity>)}</View>
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 }}><TextInput style={[styles.input, { flex: 1 }]} value={autreUnite} onChangeText={setAutreUnite} placeholder="Autre unité…" /><TouchableOpacity onPress={() => { if (autreUnite.trim()) setUnite(autreUnite.trim()); }} style={[styles.btnSecondary, { minHeight: 42 }]}><Text style={styles.btnSecondaryText}>Utiliser</Text></TouchableOpacity></View>
    <View style={styles.modalActions}><TouchableOpacity style={styles.btnSecondary} onPress={onClose}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity><TouchableOpacity style={styles.btnPrimary} onPress={() => onAdd({ presetCode, nom: nom.trim() || def.label, unite: autreUnite.trim() || unite || def.unit })}><Text style={styles.btnPrimaryText}>Ajouter le compteur</Text></TouchableOpacity></View>
  </View></View></Modal>;
}
'''
if 'function AddCounterModal' not in s:
    marker = 'function ConfigModal({ visible, local, onClose, onSave }) {'
    if marker not in s:
        raise SystemExit('counter modal insertion marker not found')
    s = s.replace(marker, counter_modal + '\n' + marker, 1)

s = replace_once(
    s,
    'export function PreAllumageInstallationPanelV3({ visiteId, onSaved }) {',
    'export function PreAllumageInstallationPanelV3({ visiteId, onSaved, planControl = null }) {',
    'V3 plan prop',
)
s = replace_once(
    s,
    "  const [addLocal, setAddLocal] = useState(false); const [addEquipment, setAddEquipment] = useState(false); const [config, setConfig] = useState(false); const [actions, setActions] = useState(false); const [rename, setRename] = useState(false); const [name, setName] = useState('');",
    "  const [addLocal, setAddLocal] = useState(false); const [addEquipment, setAddEquipment] = useState(false); const [addCounter, setAddCounter] = useState(false); const [config, setConfig] = useState(false); const [actions, setActions] = useState(false); const [rename, setRename] = useState(false); const [name, setName] = useState('');",
    'V3 counter modal state',
)

swipe_marker = "  const idx = locals.findIndex((l) => l.id === active?.id); const prev = idx > 0 ? locals[idx - 1] : null; const next = idx >= 0 && idx < locals.length - 1 ? locals[idx + 1] : null;\n"
swipe_block = r'''  const localSwipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_evt, g) => locals.length > 1
      && !addLocal && !addEquipment && !addCounter && !config && !actions
      && Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.55,
    onPanResponderTerminationRequest: () => true,
    onPanResponderRelease: (_evt, g) => {
      const seuil = Math.max(64, width * 0.09);
      const versSuivant = g.dx < -seuil || g.vx < -0.55;
      const versPrecedent = g.dx > seuil || g.vx > 0.55;
      const cible = versSuivant ? next : versPrecedent ? prev : null;
      if (cible?.id) setActiveId(cible.id);
    },
  }), [locals.length, addLocal, addEquipment, addCounter, config, actions, width, prev?.id, next?.id]);
'''
if 'const localSwipe = useMemo(() => PanResponder.create' not in s:
    s = replace_once(s, swipe_marker, swipe_marker + swipe_block, 'local swipe responder')

submit_equipment = """  const submitEquipment = async (type, customName, customControl) => {
    try { await ajouterEquipementControlePreAllumage(visiteId, active.id, type, customName, customControl); setAddEquipment(false); await reload(active.id); onSaved?.(); } catch (e) { Alert.alert('Ajout impossible', e.message); }
  };
"""
counter_actions = r'''  const submitCounter = async (spec) => {
    if (!active) return;
    try {
      await ajouterCompteurPreAllumage(visiteId, active.id, spec);
      setAddCounter(false);
      await reload(active.id);
      onSaved?.();
    } catch (e) { Alert.alert('Ajout impossible', e.message); }
  };
  const changeCounterUnit = async (field, unit) => {
    try {
      await mettreAJourUniteCompteurPreAllumage(field.modularFieldId, unit);
      await reload(active?.id);
      onSaved?.();
    } catch (e) { Alert.alert('Unité du compteur', e.message); }
  };
  const removeCounter = (field) => Alert.alert('Supprimer ce compteur ?', field.displayLabel || field.cle, [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Supprimer', style: 'destructive', onPress: async () => {
      try { await supprimerCompteurPreAllumage(field.modularFieldId); await reload(active?.id); onSaved?.(); }
      catch (e) { Alert.alert('Suppression impossible', e.message); }
    } },
  ]);
'''
if 'const submitCounter = async' not in s:
    s = replace_once(s, submit_equipment, submit_equipment + counter_actions, 'counter actions')

header_button = '<PetitBouton primary label="+ Local" onPress={() => setAddLocal(true)} />'
header_new = '{planControl}<PetitBouton primary label="+ Local" onPress={() => setAddLocal(true)} />'
s = replace_once(s, header_button, header_new, 'plan button in scrollable header')

s = replace_once(
    s,
    'const dyn = estRubriqueEquipementPreAllumage(section); return <View',
    "const dyn = estRubriqueEquipementPreAllumage(section); const compteurs = section.panel_id === 'p-pa-compteurs'; return <View",
    'counter section detection',
)
section_action_marker = '</TouchableOpacity>{dyn ? <>'
section_action_new = r'''</TouchableOpacity>{compteurs ? <TouchableOpacity onPress={() => setAddCounter(true)} style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 10, borderLeftWidth: 1, borderLeftColor: COLORS.line, backgroundColor: '#FFF8F1' }}><Text style={{ color: COLORS.orangeDark, fontWeight: '900', fontSize: 10 }}>+ Compteur</Text></TouchableOpacity> : null}{dyn ? <>'''
s = replace_once(s, section_action_marker, section_action_new, 'counter add action')

old_render_field = """  const renderCompactField = (x, section, extraProps = {}) => <PreAllumageCompactField visiteId={visiteId} sectionCode={section.section_code} field={x.field} valeurInitiale={champs[x.key]} localName={active?.nom} showPhoto={section.panel_id === 'p-pa-compteurs'} onSaved={(value) => { setChamps((m) => ({ ...m, [x.key]: value })); onSaved?.(); }} {...extraProps} />;
"""
new_render_field = """  const renderCompactField = (x, section, extraProps = {}) => <PreAllumageCompactField visiteId={visiteId} sectionCode={section.section_code} field={x.field} valeurInitiale={champs[x.key]} localName={active?.nom} showPhoto={section.panel_id === 'p-pa-compteurs'} unitEditable={section.panel_id === 'p-pa-compteurs'} unitOptions={PREALLUMAGE_COUNTER_UNITS} onUnitChange={section.panel_id === 'p-pa-compteurs' ? (unit) => changeCounterUnit(x.field, unit) : null} onDelete={x.field.dynamicCounter ? () => removeCounter(x.field) : null} onSaved={(value) => { setChamps((m) => ({ ...m, [x.key]: value })); onSaved?.(); }} {...extraProps} />;
"""
s = replace_once(s, old_render_field, new_render_field, 'counter field controls')

s = replace_once(s, '<SectionList ref={listRef}', '<SectionList {...localSwipe.panHandlers} ref={listRef}', 'local swipe handlers')
modal_marker = '<AddLocalModal visible={addLocal} onClose={() => setAddLocal(false)} onSubmit={submitLocal} /><AddEquipmentModal visible={addEquipment} onClose={() => setAddEquipment(false)} onAdd={submitEquipment} local={active} />'
modal_new = modal_marker + '<AddCounterModal visible={addCounter} onClose={() => setAddCounter(false)} onAdd={submitCounter} />'
s = replace_once(s, modal_marker, modal_new, 'counter modal render')

# Small field-work hint: local swipe replaces global tab swipe in this panel.
hint_old = 'Aucun local par défaut. Ajoutez Chaufferie, Sous-station, Église, Piscine, Centre commercial… selon le site réel.'
hint_new = 'Ajoutez uniquement les locaux réels. Dans cette vue, glissez horizontalement pour passer au local précédent ou suivant.'
s = replace_once(s, hint_old, hint_new, 'local swipe hint')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 3. Compteur : unité cliquable, choix prédéfinis + autre, suppression du
#    compteur dynamique uniquement. Les +/- existants restent conservés.
# ---------------------------------------------------------------------------
p = Path('PreAllumageCompactField.js')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "import { Text, TextInput, TouchableOpacity, View } from 'react-native';",
    "import { Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';",
    'compact field Modal import',
)
s = replace_once(
    s,
    "  showThermalBadge = true,\n}) {",
    "  showThermalBadge = true,\n  unitEditable = false,\n  unitOptions = [],\n  onUnitChange,\n  onDelete,\n}) {",
    'compact field unit props',
)
s = replace_once(
    s,
    "  const unit = unitéDepuisLibelle(libelleLocal) || unitéDepuisLibelle(field?.cle);",
    "  const unit = String(field?.unit || unitéDepuisLibelle(libelleLocal) || unitéDepuisLibelle(field?.cle) || '').trim();",
    'compact field metadata unit',
)
state_marker = "  const [derniereValeur, setDerniereValeur] = useState(estValeurEtat(valeurInitiale) ? '' : String(valeurInitiale || ''));\n"
state_block = r'''  const [unitVisible, setUnitVisible] = useState(false);
  const [customUnit, setCustomUnit] = useState('');
  const choixUnites = useMemo(() => [...new Set([...(field?.unitOptions || []), ...(unitOptions || []), unit].filter(Boolean))], [field?.unitOptions, unitOptions, unit]);
  const choisirUnite = async (nextUnit) => {
    const propre = String(nextUnit || '').trim();
    if (!propre || !onUnitChange) return;
    setUnitVisible(false);
    setCustomUnit('');
    await onUnitChange(propre);
  };
'''
if 'const [unitVisible, setUnitVisible]' not in s:
    s = replace_once(s, state_marker, state_marker + state_block, 'compact field unit state')

photo_marker = "      {showPhoto ? <PreAllumagePhotoButton visiteId={visiteId} entiteKey={entiteKey} label={`${localName || ''} · ${label}`} style={{ minHeight: 32, paddingHorizontal: 8, paddingVertical: 5 }} /> : null}\n"
photo_new = photo_marker + "      {onDelete ? <TouchableOpacity onPress={onDelete} style={{ width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#F4C7C7', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF6F6' }}><Text style={{ color: COLORS.red, fontWeight: '900' }}>✕</Text></TouchableOpacity> : null}\n"
if 'onDelete ? <TouchableOpacity' not in s:
    s = replace_once(s, photo_marker, photo_new, 'dynamic counter delete')

unit_text = "        {unit ? <Text style={{ paddingRight: 9, color: COLORS.inkSoft, fontWeight: '800', fontSize: 11 }}>{unit}</Text> : null}"
unit_button = r'''        {unitEditable && onUnitChange ? <TouchableOpacity onPress={() => setUnitVisible(true)} style={{ minWidth: 48, alignSelf: 'stretch', paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: COLORS.line, backgroundColor: '#F9FAFB', borderTopRightRadius: 8, borderBottomRightRadius: 8 }}><Text style={{ color: COLORS.orangeDark, fontWeight: '900', fontSize: 10 }}>{unit || 'Unité'} ▾</Text></TouchableOpacity> : unit ? <Text style={{ paddingRight: 9, color: COLORS.inkSoft, fontWeight: '800', fontSize: 11 }}>{unit}</Text> : null}'''
s = replace_once(s, unit_text, unit_button, 'clickable counter unit')

tail = """    {warning ? <Text style={{ color: '#B54708', fontSize: 10, fontWeight: '700', marginTop: 5 }}>{warning}</Text> : null}
  </View>;
});
"""
modal_tail = r'''    {warning ? <Text style={{ color: '#B54708', fontSize: 10, fontWeight: '700', marginTop: 5 }}>{warning}</Text> : null}
    <Modal visible={unitVisible} transparent animationType="fade" onRequestClose={() => setUnitVisible(false)}><View style={styles.modalOverlay}><View style={[styles.modalSheet, { maxWidth: 520, width: '92%' }]}>
      <Text style={styles.modalTitle}>Unité du compteur</Text>
      <Text style={[styles.importHint, { marginBottom: 10 }]}>Touchez une unité pour l’appliquer. Le libellé est mis à jour sans changer la clé de stockage ni perdre l’index saisi.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{choixUnites.map((u) => <TouchableOpacity key={u} onPress={() => choisirUnite(u).catch(() => {})} style={{ minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, borderColor: unit === u ? COLORS.orange : COLORS.line, backgroundColor: unit === u ? COLORS.orangeLight : COLORS.white }}><Text style={{ color: unit === u ? COLORS.orangeDark : COLORS.inkSoft, fontWeight: '900', fontSize: 11 }}>{u}</Text></TouchableOpacity>)}</View>
      <Text style={{ color: COLORS.ink, fontWeight: '900', marginTop: 14, marginBottom: 6 }}>Autre unité</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}><TextInput autoFocus={false} style={[styles.input, { flex: 1 }]} value={customUnit} onChangeText={setCustomUnit} placeholder="Ex. impulsions, thermies…" /><TouchableOpacity onPress={() => choisirUnite(customUnit).catch(() => {})} style={[styles.btnPrimary, { minHeight: 42 }]}><Text style={styles.btnPrimaryText}>Appliquer</Text></TouchableOpacity></View>
      <TouchableOpacity style={[styles.btnSecondary, { marginTop: 12 }]} onPress={() => setUnitVisible(false)}><Text style={styles.btnSecondaryText}>Fermer</Text></TouchableOpacity>
    </View></View></Modal>
  </View>;
});
'''
s = replace_once(s, tail, modal_tail, 'counter unit modal')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 4. Courbe de chauffe : étiquettes extérieures anti-chevauchement.
# ---------------------------------------------------------------------------
p = Path('PreAllumageHeatCurve.js')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';",
    "import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';",
    'heat curve Rect import',
)
s = replace_once(s, 'const TOP = 24;', 'const TOP = 32;', 'heat curve top margin')
layout_marker = "  const tncVisible = tnc !== null && tnc >= X_MIN && tnc <= X_MAX;\n"
layout_block = r'''  const labelPosition = (point, index) => {
    const cx = xPx(point.outdoor);
    const cy = yPx(point.water === null ? Y_MIN : point.water);
    const previous = points.slice(0, index);
    const proche = previous.some((other) => {
      const oy = yPx(other.water === null ? Y_MIN : other.water);
      return Math.abs(xPx(other.outdoor) - cx) < 62 && Math.abs(oy - cy) < 46;
    });
    let labelY = cy - 24;
    if (proche && index % 2) labelY = cy + 30;
    if (labelY < TOP + 12) labelY = cy + 30;
    if (labelY > TOP + plotHeight - 10) labelY = cy - 24;
    return {
      x: clamp(cx, LEFT + 30, width - RIGHT - 30),
      y: clamp(labelY, TOP + 11, TOP + plotHeight - 11),
      cy,
      cx,
    };
  };
'''
if 'const labelPosition = (point, index)' not in s:
    s = replace_once(s, layout_marker, layout_marker + layout_block, 'heat curve label layout')

old_map = r'''          {points.map((p) => {
            const cy = yPx(p.water === null ? Y_MIN : p.water);
            return <G key={p.id}>
              <Circle cx={xPx(p.outdoor)} cy={cy} r="10" fill={p.water === null ? '#FFFFFF' : '#F97316'} stroke="#F97316" strokeWidth="3" />
              <SvgText x={xPx(p.outdoor)} y={Math.max(12, cy - 15)} textAnchor="middle" fontSize="9" fontWeight="700" fill="#344054">{formatNombre(p.outdoor)}° ext.</SvgText>
              <SvgText x={xPx(p.outdoor)} y={Math.min(TOP + plotHeight - 4, cy + 4)} textAnchor="middle" fontSize="8" fontWeight="800" fill={p.water === null ? '#667085' : '#FFFFFF'}>{p.water === null ? '—' : formatNombre(p.water)}</SvgText>
            </G>;
          })}
'''
new_map = r'''          {points.map((p, index) => {
            const pos = labelPosition(p, index);
            return <G key={p.id}>
              <Line x1={pos.cx} y1={pos.cy} x2={pos.x} y2={pos.y} stroke="#98A2B3" strokeWidth="1" strokeDasharray="2 2" />
              <Circle cx={pos.cx} cy={pos.cy} r="10" fill={p.water === null ? '#FFFFFF' : '#F97316'} stroke="#F97316" strokeWidth="3" />
              <Rect x={pos.x - 28} y={pos.y - 12} width="56" height="18" rx="5" fill="#FFFFFF" stroke="#D0D5DD" strokeWidth="1" />
              <SvgText x={pos.x} y={pos.y + 1} textAnchor="middle" fontSize="8" fontWeight="800" fill="#344054">{formatNombre(p.outdoor)}° ext.</SvgText>
              <SvgText x={pos.cx} y={Math.min(TOP + plotHeight - 4, pos.cy + 4)} textAnchor="middle" fontSize="8" fontWeight="800" fill={p.water === null ? '#667085' : '#FFFFFF'}>{p.water === null ? '—' : formatNombre(p.water)}</SvgText>
            </G>;
          })}
'''
s = replace_once(s, old_map, new_map, 'heat curve point labels')
p.write_text(s, encoding='utf-8')


# ---------------------------------------------------------------------------
# 5. Navigation globale : dans Installations Pré-allumage le swipe appartient
#    aux locaux, pas aux onglets de la visite.
# ---------------------------------------------------------------------------
p = Path('VisiteScreen.js')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "    onMoveShouldSetPanResponder: (_evt, g) => !transitionRef.current && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.45,",
    "    onMoveShouldSetPanResponder: (_evt, g) => !transitionRef.current && !(trame.id === 'pre_allumage' && activeTabRef.current === 'p-pa-batiments') && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.45,",
    'disable global swipe on preallumage installations',
)
p.write_text(s, encoding='utf-8')

print('Pré-allumage field UX applied: compact plan, local swipe, dynamic counters/units and readable heat-curve labels.')
