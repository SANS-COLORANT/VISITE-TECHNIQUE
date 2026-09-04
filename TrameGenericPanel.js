/** Panneau de saisie générique virtualisé piloté par la définition de la trame. */
import React, { useEffect, useMemo, useState } from 'react';
import { SectionList, Text, TextInput, View } from 'react-native';
import { getChampsVisite, getControlesVisite } from './db.js';
import { DurableChampGenerique } from './DurableChampGenerique.js';
import { PersistentControleGenerique } from './PersistentControleGenerique.js';
import { VmcControleGenerique } from './VmcControleGenerique.js';
import { PresetControleGenerique } from './PresetControleGenerique.js';
import { PreAllumagePlanCard } from './PreAllumagePlanCard.js';
import { styles } from './styles.js';
import { enregistrerAliasPreAllumage, fieldAliasKey, libelleChamp, listerAliasesPreAllumage, sectionAliasDescriptor } from './preAllumageAliases.js';
import { PreAllumageModularPanel } from './PreAllumageModularPanel.js';
import { PreAllumageInfoPanelBusiness } from './PreAllumageInfoPanelBusiness.js';
import { PreAllumageInstallationPanelV3 } from './PreAllumageInstallationPanelV3.js';
import { PreAllumageConclusionPanel } from './PreAllumageConclusionPanel.js';

const visiteDataCache = new Map();

function EditableAlias({ valeur, suffix = '', onSave }) {
  const [texte, setTexte] = useState(valeur || '');
  useEffect(() => { setTexte(valeur || ''); }, [valeur]);
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    <TextInput style={[styles.sectionTitle, { flex: 1, borderBottomWidth: 1, borderBottomColor: '#D0D5DD', paddingVertical: 3 }]} value={texte} onChangeText={setTexte} onBlur={() => onSave(texte)} />
    {suffix ? <Text style={styles.sectionTitle}>{suffix}</Text> : null}
  </View>;
}

function codeSection(panelId, section) {
  return panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
}
function mapperChamps(rows = []) {
  const map = {};
  rows.forEach((row) => { if (row?.section_code && row?.cle) map[`${row.section_code}||${row.cle}`] = row.valeur; });
  return map;
}
function mapperControles(rows = []) {
  const map = {};
  rows.forEach((row) => { if (row?.section_code && row?.cle) map[`${row.section_code}||${row.cle}`] = row; });
  return map;
}
async function chargerDonneesVisite(visiteId, force = false) {
  const existant = visiteDataCache.get(visiteId);
  if (!force && existant?.data) return existant.data;
  if (!force && existant?.promise) return existant.promise;
  const promise = Promise.all([getChampsVisite(visiteId), getControlesVisite(visiteId)])
    .then(([champs, controles]) => {
      const data = { champsMap: mapperChamps(champs), controlesMap: mapperControles(controles) };
      visiteDataCache.set(visiteId, { data, promise: null });
      return data;
    })
    .catch((e) => { visiteDataCache.delete(visiteId); throw e; });
  visiteDataCache.set(visiteId, { data: existant?.data || null, promise });
  return promise;
}
export function prechargerDonneesTrameGenerique(visiteId, force = false) { return chargerDonneesVisite(visiteId, force); }
export function invaliderCacheTrameGenerique(visiteId) { visiteDataCache.delete(visiteId); }
export function mettreAJourCacheChamp(visiteId, key, valeur) {
  const courant = visiteDataCache.get(visiteId); if (!courant?.data) return;
  visiteDataCache.set(visiteId, { data: { ...courant.data, champsMap: { ...courant.data.champsMap, [key]: valeur } }, promise: courant.promise || null });
}
export function mettreAJourCacheControle(visiteId, key, patch) {
  const courant = visiteDataCache.get(visiteId); if (!courant?.data) return;
  const ancien = courant.data.controlesMap?.[key] || {};
  visiteDataCache.set(visiteId, { data: { ...courant.data, controlesMap: { ...courant.data.controlesMap, [key]: { ...ancien, ...patch } } }, promise: courant.promise || null });
}

export function TrameGenericPanel(props) {
  if (props.panelId === 'p-pa-infos') return <PreAllumageInfoPanelBusiness {...props} />;
  if (props.panelId === 'p-pa-batiments') return <PreAllumageInstallationPanelV3 {...props} />;
  if (props.panelId === 'p-pa-conclusion') return <PreAllumageConclusionPanel {...props} />;
  if (props.panelId.startsWith('p-pa-')) return <PreAllumageModularPanel {...props} />;
  return <TrameGenericStaticPanel {...props} />;
}

function TrameGenericStaticPanel({ visiteId, panelId, sections, onSaved }) {
  const cacheInitial = visiteDataCache.get(visiteId)?.data;
  const [champsMap, setChampsMap] = useState(cacheInitial?.champsMap || {});
  const [controlesMap, setControlesMap] = useState(cacheInitial?.controlesMap || {});
  const [aliases, setAliases] = useState({});

  useEffect(() => {
    let actif = true;
    if (!panelId.startsWith('p-pa-')) return () => { actif = false; };
    listerAliasesPreAllumage(visiteId).then((r) => { if (actif) setAliases(r); }).catch((e) => console.warn('Noms personnalisés non chargés', e));
    return () => { actif = false; };
  }, [visiteId, panelId]);

  useEffect(() => {
    let actif = true;
    const cache = visiteDataCache.get(visiteId)?.data;
    if (cache) { setChampsMap(cache.champsMap); setControlesMap(cache.controlesMap); return () => { actif = false; }; }
    chargerDonneesVisite(visiteId).then((data) => { if (actif) { setChampsMap(data.champsMap); setControlesMap(data.controlesMap); } });
    return () => { actif = false; };
  }, [visiteId]);

  const listeSections = useMemo(() => {
    if (!sections) return [];
    return Object.entries(sections).map(([sub, fields]) => {
      const sectionCode = codeSection(panelId, sub);
      return { title: sub, sectionCode, data: (fields || []).filter((field) => field?.hiddenInApp !== true).map((field) => ({ field, sectionCode, key: `${sectionCode}||${field.cle}` })) };
    }).filter((section) => section.data.length > 0);
  }, [panelId, sections]);

  if (!sections) return null;
  const patchControle = (key, patch) => {
    setControlesMap((courant) => ({ ...courant, [key]: { ...(courant[key] || {}), ...patch } }));
    mettreAJourCacheControle(visiteId, key, patch);
  };
  const sauverAlias = (key, valeur, defaut) => {
    setAliases((courant) => ({ ...courant, [key]: valeur }));
    enregistrerAliasPreAllumage(visiteId, key, valeur, defaut).catch((e) => console.warn('Nom personnalisé non enregistré', e));
  };

  return <SectionList
    sections={listeSections}
    keyExtractor={(item) => item.key}
    ListHeaderComponent={panelId === 'p-pa-batiments' ? <PreAllumagePlanCard visiteId={visiteId} onSaved={onSaved} /> : null}
    renderSectionHeader={({ section }) => {
      if (!panelId.startsWith('p-pa-')) return <Text style={styles.sectionTitle}>{section.title}</Text>;
      const d = sectionAliasDescriptor(panelId, section.title);
      return <EditableAlias valeur={aliases[d.key] || d.base} suffix={d.suffix} onSave={(v) => sauverAlias(d.key, v, d.base)} />;
    }}
    renderItem={({ item }) => <View style={styles.formCard}>
      {item.field.type === 'champ' ? <DurableChampGenerique visiteId={visiteId} sectionCode={item.sectionCode} field={item.field} valeurInitiale={champsMap[item.key]} displayLabel={libelleChamp(item.sectionCode, item.field.cle, aliases)} onRename={item.field.renamable ? (v) => sauverAlias(fieldAliasKey(item.sectionCode, item.field.cle), v, item.field.cle) : null} onSaved={(valeur) => {
        setChampsMap((courant) => ({ ...courant, [item.key]: valeur })); mettreAJourCacheChamp(visiteId, item.key, valeur); onSaved?.();
      }} /> : item.field.vmc === true ? <VmcControleGenerique visiteId={visiteId} sectionCode={item.sectionCode} field={item.field} etatInitial={controlesMap[item.key]} onEtatChange={(patch) => patchControle(item.key, patch)} onSaved={onSaved} /> : item.field.presets ? <PresetControleGenerique visiteId={visiteId} sectionCode={item.sectionCode} field={item.field} etatInitial={controlesMap[item.key]} onEtatChange={(patch) => patchControle(item.key, patch)} onSaved={onSaved} /> : <PersistentControleGenerique visiteId={visiteId} sectionCode={item.sectionCode} field={item.field} etatInitial={controlesMap[item.key]} onEtatChange={(patch) => patchControle(item.key, patch)} onSaved={onSaved} />}
    </View>}
    contentContainerStyle={styles.panelContent}
    keyboardShouldPersistTaps="handled"
    stickySectionHeadersEnabled={false}
    initialNumToRender={8}
    maxToRenderPerBatch={8}
    windowSize={5}
    updateCellsBatchingPeriod={50}
    removeClippedSubviews
  />;
}
