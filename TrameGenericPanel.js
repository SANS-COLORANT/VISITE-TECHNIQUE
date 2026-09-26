/** Panneau de saisie générique virtualisé piloté par la définition de la trame. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SectionList, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
import { PreAllumageInstallationPanelBusiness } from './PreAllumageInstallationPanelBusiness.js';
import { PreAllumageConclusionPanel } from './PreAllumageConclusionPanel.js';
import { BoundedLruMap } from './boundedCache.js';
import { getNavigationScrollOffset, hydrateNavigationState, setNavigationScrollOffset } from './navigationMemory.js';
import { upsertControlePartiel } from './controlDb.js';
import { feedback } from './fieldFeedback.js';
import { ButtonGlow } from './ButtonGlow.js';
import { CvcIcon } from './MetraCvcIcons.js';

const visiteDataCache = new BoundedLruMap(3);

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

// Les champs consécutifs d'une section forment une seule carte (lignes fines
// entre eux) ; chaque contrôle garde sa propre carte.
function styleCarteChamp(item, index, section) {
  if (item.field.type !== 'champ') return styles.formCard;
  const data = section?.data || [];
  const avantChamp = index > 0 && data[index - 1]?.field?.type === 'champ';
  const apresChamp = index < data.length - 1 && data[index + 1]?.field?.type === 'champ';
  return [
    styles.fieldGroupItem,
    !avantChamp && styles.fieldGroupFirst,
    !apresChamp && styles.fieldGroupLast,
    avantChamp && styles.fieldGroupDivider,
  ];
}

export function TrameGenericPanel(props) {
  if (props.panelId === 'p-pa-infos') return <PreAllumageInfoPanelBusiness {...props} />;
  if (props.panelId === 'p-pa-batiments') return <PreAllumageInstallationPanelBusiness {...props} />;
  if (props.panelId === 'p-pa-conclusion') return <PreAllumageConclusionPanel {...props} />;
  if (props.panelId.startsWith('p-pa-')) return <PreAllumageModularPanel {...props} />;
  return <TrameGenericStaticPanel {...props} />;
}

function TrameGenericStaticPanel({ visiteId, panelId, sections, onSaved, nextPanel = null, onNextPanel = null }) {
  const cacheInitial = visiteDataCache.get(visiteId)?.data;
  const listRef = useRef(null);
  const navKey = `visit-panel:${String(visiteId || '')}:${String(panelId || '')}`;
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

  useEffect(() => {
    let alive = true;
    hydrateNavigationState(navKey).then((state) => {
      if (!alive) return;
      const offset = Number(state?.scrollY || 0);
      if (offset) setTimeout(() => listRef.current?.scrollToOffset?.({ offset, animated: false }), 50);
    }).catch(() => {});
    return () => { alive = false; };
  }, [navKey]);

  useEffect(() => {
    const offset = getNavigationScrollOffset(navKey);
    if (!offset || !listeSections.length) return undefined;
    const timer = setTimeout(() => listRef.current?.scrollToOffset?.({ offset, animated: false }), 50);
    return () => clearTimeout(timer);
  }, [navKey, listeSections.length]);

  if (!sections) return null;
  const extraData = { champsMap, controlesMap };
  const patchControle = (key, patch) => {
    setControlesMap((courant) => ({ ...courant, [key]: { ...(courant[key] || {}), ...patch } }));
    mettreAJourCacheControle(visiteId, key, patch);
  };
  // « Tout en S » : passe en S les contrôles de la section encore sans avis
  // (le 1er commentaire S prédéfini est repris), avec annulation possible.
  const toutEnS = async (section) => {
    const cibles = section.data.filter((item) => item.field.type !== 'champ' && !String(controlesMap[item.key]?.avis ?? '').trim());
    if (!cibles.length) return;
    try {
      for (const item of cibles) {
        const commentaire = item.field.presets?.S?.[0]?.commentaire || '';
        await upsertControlePartiel(visiteId, item.sectionCode, item.field.cle, { avis: 'S', commentaire });
        patchControle(item.key, { avis: 'S', commentaire });
      }
      onSaved?.();
      feedback(`${cibles.length} contrôle${cibles.length > 1 ? 's' : ''} passé${cibles.length > 1 ? 's' : ''} en S`, {
        action: { label: 'Annuler', onPress: async () => {
          for (const item of cibles) {
            await upsertControlePartiel(visiteId, item.sectionCode, item.field.cle, { avis: null, commentaire: '' });
            patchControle(item.key, { avis: null, commentaire: '' });
          }
          onSaved?.();
        } },
      });
    } catch (e) { console.warn('Tout en S impossible', e); }
  };
  const restants = listeSections.reduce((n, section) => n + section.data.filter((item) => item.field.type === 'champ'
    ? String(champsMap[item.key] ?? '').trim() === ''
    : String(controlesMap[item.key]?.avis ?? '').trim() === '').length, 0);
  const sauverAlias = (key, valeur, defaut) => {
    setAliases((courant) => ({ ...courant, [key]: valeur }));
    enregistrerAliasPreAllumage(visiteId, key, valeur, defaut).catch((e) => console.warn('Nom personnalisé non enregistré', e));
  };

  return <SectionList
    ref={listRef}
    sections={listeSections}
    extraData={extraData}
    onScroll={(event) => setNavigationScrollOffset(navKey, event.nativeEvent.contentOffset.y)}
    scrollEventThrottle={100}
    keyExtractor={(item) => item.key}
    ListHeaderComponent={panelId === 'p-pa-batiments' ? <PreAllumagePlanCard visiteId={visiteId} onSaved={onSaved} /> : null}
    renderSectionHeader={({ section }) => {
      if (!panelId.startsWith('p-pa-')) {
        let faits = 0;
        for (const item of section.data) {
          if (item.field.type === 'champ') { if (String(champsMap[item.key] ?? '').trim() !== '') faits += 1; }
          else if (String(controlesMap[item.key]?.avis ?? '').trim() !== '') faits += 1;
        }
        const sansAvis = section.data.filter((item) => item.field.type !== 'champ' && !String(controlesMap[item.key]?.avis ?? '').trim()).length;
        return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <Text style={[styles.sectionTitle, { flex: 1 }]}>{section.title}</Text>
          {sansAvis > 1 ? <TouchableOpacity accessibilityLabel={`Passer ${sansAvis} contrôles en S`} onPress={() => toutEnS(section)} style={styles.allSBtn}><Text style={styles.allSBtnText}>Tout en S</Text></TouchableOpacity> : null}
          <Text style={[styles.sectionCount, faits >= section.data.length ? { color: '#227A4A' } : null]}>{faits} / {section.data.length}</Text>
        </View>;
      }
      const d = sectionAliasDescriptor(panelId, section.title);
      return <EditableAlias valeur={aliases[d.key] || d.base} suffix={d.suffix} onSave={(v) => sauverAlias(d.key, v, d.base)} />;
    }}
    renderItem={({ item, index, section }) => <View style={styleCarteChamp(item, index, section)}>
      {item.field.type === 'champ' ? <DurableChampGenerique visiteId={visiteId} sectionCode={item.sectionCode} field={item.field} valeurInitiale={champsMap[item.key]} displayLabel={libelleChamp(item.sectionCode, item.field.cle, aliases)} onRename={item.field.renamable ? (v) => sauverAlias(fieldAliasKey(item.sectionCode, item.field.cle), v, item.field.cle) : null} onSaved={(valeur) => {
        setChampsMap((courant) => ({ ...courant, [item.key]: valeur })); mettreAJourCacheChamp(visiteId, item.key, valeur); onSaved?.();
      }} /> : item.field.vmc === true ? <VmcControleGenerique visiteId={visiteId} sectionCode={item.sectionCode} field={item.field} etatInitial={controlesMap[item.key]} onEtatChange={(patch) => patchControle(item.key, patch)} onSaved={onSaved} /> : item.field.presets ? <PresetControleGenerique visiteId={visiteId} sectionCode={item.sectionCode} field={item.field} etatInitial={controlesMap[item.key]} onEtatChange={(patch) => patchControle(item.key, patch)} onSaved={onSaved} /> : <PersistentControleGenerique visiteId={visiteId} sectionCode={item.sectionCode} field={item.field} etatInitial={controlesMap[item.key]} onEtatChange={(patch) => patchControle(item.key, patch)} onSaved={onSaved} />}
    </View>}
    ListFooterComponent={nextPanel && onNextPanel ? <View style={styles.nextTabCard}>
      <Text style={styles.nextTabHint}>{restants ? `${restants} élément${restants > 1 ? 's' : ''} encore à renseigner dans cet onglet` : 'Onglet complet'}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => onNextPanel(nextPanel.id)} activeOpacity={0.85} style={[styles.btnPrimary, { flex: 0, flexDirection: 'row', gap: 8 }]}>
        <ButtonGlow /><Text style={styles.btnPrimaryText}>{nextPanel.label}</Text><CvcIcon name="chevron-right" size={18} color="#FFFFFF" strokeWidth={2.4} />
      </TouchableOpacity>
    </View> : null}
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
