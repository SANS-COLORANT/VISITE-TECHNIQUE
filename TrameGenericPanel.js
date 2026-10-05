/** Panneau de saisie générique virtualisé piloté par la définition de la trame. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, SectionList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getChampsVisite, getControlesVisite } from './db.js';
import { DurableChampGenerique } from './DurableChampGenerique.js';
import { PersistentControleGenerique } from './PersistentControleGenerique.js';
import { VmcControleGenerique } from './VmcControleGenerique.js';
import { PresetControleGenerique } from './PresetControleGenerique.js';
import { PreAllumagePlanCard } from './PreAllumagePlanCard.js';
import { COLORS, FONTS, styles } from './styles.js';
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

// Catégories repliées, mémorisées par visite et par onglet le temps de la
// session (le compteur « x / y » reste visible sur l'en-tête replié).
const repliesParPanneau = new Map();
const AVIS_EN_MASSE = ['S', 'S.O', 'N.S', 'N.R', 'N.V'];
const SEUIL_DECOUPAGE = 12;

// Découpage d'affichage des grandes catégories (ex. « Lutte contre
// l'incendie ») en sous-groupes selon le préfixe « Extincteurs: … ». Rien ne
// change en base ni dans les rapports : section_code et clés sont identiques.
function decouperSection(section) {
  if (section.data.length < SEUIL_DECOUPAGE) return [{ ...section, groupKey: section.sectionCode, sub: null, first: true, parent: section }];
  const groupes = [];
  for (const item of section.data) {
    const cle = String(item.field.cle || '');
    const i = cle.indexOf(':');
    const prefixe = i > 0 ? cle.slice(0, i).trim() : null;
    const nom = prefixe || 'Autres points';
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.nom === nom) dernier.items.push(item);
    else groupes.push({ nom, items: [item] });
  }
  if (groupes.length < 2) return [{ ...section, groupKey: section.sectionCode, sub: null, first: true, parent: section }];
  return groupes.map((g, idx) => ({
    title: section.title,
    sectionCode: section.sectionCode,
    data: g.items,
    groupKey: `${section.sectionCode}::${idx}:${g.nom}`,
    sub: g.nom,
    first: idx === 0,
    parent: section,
  }));
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

function TrameGenericStaticPanel({ visiteId, panelId, sections, onSaved, nextPanel = null, onNextPanel = null, trameId = 'icpe_v1' }) {
  const cacheInitial = visiteDataCache.get(visiteId)?.data;
  const listRef = useRef(null);
  const navKey = `visit-panel:${String(visiteId || '')}:${String(panelId || '')}`;
  const [champsMap, setChampsMap] = useState(cacheInitial?.champsMap || {});
  const [controlesMap, setControlesMap] = useState(cacheInitial?.controlesMap || {});
  const [aliases, setAliases] = useState({});
  const patchRef = useRef(null);
  const champRef = useRef(null);
  const handlersRef = useRef({});

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
  const sectionsAffichees = useMemo(() => (panelId.startsWith('p-pa-') ? listeSections.map((sec) => ({ ...sec, groupKey: sec.sectionCode, sub: null, first: true, parent: sec })) : listeSections.flatMap(decouperSection)), [panelId, listeSections]);
  const cleReplis = `${visiteId}|${panelId}`;
  const [replies, setReplies] = useState(() => new Set(repliesParPanneau.get(cleReplis) || []));
  const basculerRepli = useCallback((key) => {
    setReplies((courant) => {
      const next = new Set(courant);
      if (next.has(key)) next.delete(key); else next.add(key);
      repliesParPanneau.set(cleReplis, next);
      return next;
    });
  }, [cleReplis]);

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
  // Rappels stables par ligne : les cartes (mémoïsées) ne se redessinent plus
  // toutes à chaque saisie, seule la ligne modifiée change.
  patchRef.current = patchControle;
  champRef.current = (key, valeur) => { setChampsMap((courant) => ({ ...courant, [key]: valeur })); mettreAJourCacheChamp(visiteId, key, valeur); onSaved?.(); };
  const etatHandler = (key) => handlersRef.current[`e:${key}`] || (handlersRef.current[`e:${key}`] = (patch) => patchRef.current?.(key, patch));
  const champHandler = (key) => handlersRef.current[`c:${key}`] || (handlersRef.current[`c:${key}`] = (valeur) => champRef.current?.(key, valeur));

  // Avis en masse sur les contrôles encore sans avis (« Tout en S » ; appui
  // long : S.O, N.S, N.R, N.V), annulable depuis le toast.
  const avisEnMasse = async (items, avis) => {
    const cibles = items.filter((item) => item.field.type !== 'champ' && !String(controlesMap[item.key]?.avis ?? '').trim());
    if (!cibles.length) return;
    try {
      for (const item of cibles) {
        const commentaire = item.field.presets?.[avis]?.[0]?.commentaire || '';
        await upsertControlePartiel(visiteId, item.sectionCode, item.field.cle, { avis, commentaire });
        patchControle(item.key, { avis, commentaire });
      }
      onSaved?.();
      const n = cibles.length;
      feedback(`${n} contrôle${n > 1 ? 's' : ''} passé${n > 1 ? 's' : ''} en ${avis}${avis === 'N.S' ? ' · anomalies à préciser' : ''}`, {
        action: { label: 'Annuler', onPress: async () => {
          for (const item of cibles) {
            await upsertControlePartiel(visiteId, item.sectionCode, item.field.cle, { avis: null, commentaire: '' });
            patchControle(item.key, { avis: null, commentaire: '' });
          }
          onSaved?.();
        } },
      });
    } catch (e) { console.warn('Avis en masse impossible', e); }
  };
  const toutEnS = (items) => avisEnMasse(items, 'S');
  const menuAvisEnMasse = (items, titre) => {
    const n = items.filter((item) => item.field.type !== 'champ' && !String(controlesMap[item.key]?.avis ?? '').trim()).length;
    Alert.alert(`${titre}`, `${n} contrôle${n > 1 ? 's' : ''} sans avis. Tout passer en :`, [
      ...AVIS_EN_MASSE.map((avis) => ({ text: `Tout en ${avis}`, onPress: () => avisEnMasse(items, avis) })),
      { text: 'Annuler', style: 'cancel' },
    ]);
  };
  const compter = (items) => {
    let faits = 0; let sansAvis = 0;
    for (const item of items) {
      if (item.field.type === 'champ') { if (String(champsMap[item.key] ?? '').trim() !== '') faits += 1; }
      else if (String(controlesMap[item.key]?.avis ?? '').trim() !== '') faits += 1;
      else sansAvis += 1;
    }
    return { faits, sansAvis, total: items.length };
  };
  const boutonMasse = (items, titre, sansAvis) => sansAvis > 1 ? <TouchableOpacity
    accessibilityLabel={`Passer ${sansAvis} contrôles en S`}
    accessibilityHint="Appui long : choisir S.O, N.S, N.R ou N.V"
    onPress={() => toutEnS(items)}
    onLongPress={() => menuAvisEnMasse(items, titre)}
    delayLongPress={350}
    style={[styles.allSBtn, { flexDirection: 'row', alignItems: 'center', gap: 3 }]}
  ><Text style={styles.allSBtnText}>Tout en S</Text><CvcIcon name="chevron-down" size={12} color="#227A4A" strokeWidth={2.4} /></TouchableOpacity> : null;
  const visibles = sectionsAffichees.map((sec) => {
    const parentReplie = replies.has(sec.sectionCode);
    const replie = parentReplie || replies.has(sec.groupKey);
    return { ...sec, allData: sec.data, data: replie ? [] : sec.data, parentReplie, replie };
  }).filter((sec) => !(sec.parentReplie && !sec.first));
  const restants = listeSections.reduce((n, section) => n + section.data.filter((item) => item.field.type === 'champ'
    ? String(champsMap[item.key] ?? '').trim() === ''
    : String(controlesMap[item.key]?.avis ?? '').trim() === '').length, 0);
  const sauverAlias = (key, valeur, defaut) => {
    setAliases((courant) => ({ ...courant, [key]: valeur }));
    enregistrerAliasPreAllumage(visiteId, key, valeur, defaut).catch((e) => console.warn('Nom personnalisé non enregistré', e));
  };

  return <SectionList
    ref={listRef}
    sections={visibles}
    extraData={extraData}
    onScroll={(event) => setNavigationScrollOffset(navKey, event.nativeEvent.contentOffset.y)}
    scrollEventThrottle={100}
    keyExtractor={(item) => item.key}
    ListHeaderComponent={panelId === 'p-pa-batiments' ? <PreAllumagePlanCard visiteId={visiteId} onSaved={onSaved} /> : null}
    renderSectionHeader={({ section }) => {
      if (!panelId.startsWith('p-pa-')) {
        const parentItems = section.parent?.data || section.allData;
        const decoupee = Boolean(section.sub);
        const enTete = section.first ? (() => {
          const { faits, sansAvis, total } = compter(parentItems);
          const replie = replies.has(section.sectionCode);
          return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: !replie }} accessibilityLabel={`${section.title}, ${faits} sur ${total}, ${replie ? 'déplier' : 'replier'}`} onPress={() => basculerRepli(section.sectionCode)} activeOpacity={0.7} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ marginBottom: 6 }}><CvcIcon name={replie ? 'chevron-right' : 'chevron-down'} size={16} color={COLORS.inkSoft} strokeWidth={2.4} /></View>
              <Text style={[styles.sectionTitle, { flex: 1 }]}>{section.title}</Text>
            </TouchableOpacity>
            {replie ? null : boutonMasse(parentItems, section.title, sansAvis)}
            <Text style={[styles.sectionCount, faits >= total ? { color: '#227A4A' } : null]}>{faits} / {total}</Text>
          </View>;
        })() : null;
        if (!decoupee || section.parentReplie) return enTete;
        const { faits, sansAvis, total } = compter(section.allData);
        const sousReplie = replies.has(section.groupKey);
        return <View>
          {enTete}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8, marginTop: section.first ? 0 : 6, marginBottom: 4, paddingLeft: 10, borderLeftWidth: 3, borderLeftColor: faits >= total ? 'rgba(46,157,91,0.55)' : 'rgba(242,100,38,0.45)' }}>
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: !sousReplie }} accessibilityLabel={`${section.sub}, ${faits} sur ${total}`} onPress={() => basculerRepli(section.groupKey)} activeOpacity={0.7} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 34 }}>
              <CvcIcon name={sousReplie ? 'chevron-right' : 'chevron-down'} size={14} color={COLORS.inkFaint} strokeWidth={2.4} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontFamily: FONTS.bold, color: COLORS.inkSoft }}>{section.sub}</Text>
            </TouchableOpacity>
            {sousReplie ? null : boutonMasse(section.allData, section.sub, sansAvis)}
            <Text style={{ fontSize: 11, fontFamily: FONTS.bodyBold, color: faits >= total ? '#227A4A' : COLORS.inkFaint }}>{faits} / {total}</Text>
          </View>
        </View>;
      }
      const d = sectionAliasDescriptor(panelId, section.title);
      return <EditableAlias valeur={aliases[d.key] || d.base} suffix={d.suffix} onSave={(v) => sauverAlias(d.key, v, d.base)} />;
    }}
    renderItem={({ item, index, section }) => <View style={styleCarteChamp(item, index, section)}>
      {item.field.type === 'champ' ? <DurableChampGenerique visiteId={visiteId} sectionCode={item.sectionCode} field={item.field} valeurInitiale={champsMap[item.key]} displayLabel={libelleChamp(item.sectionCode, item.field.cle, aliases)} onRename={item.field.renamable ? (v) => sauverAlias(fieldAliasKey(item.sectionCode, item.field.cle), v, item.field.cle) : null} onSaved={champHandler(item.key)} /> : item.field.vmc === true ? <VmcControleGenerique visiteId={visiteId} sectionCode={item.sectionCode} field={item.field} etatInitial={controlesMap[item.key]} onEtatChange={etatHandler(item.key)} onSaved={onSaved} /> : item.field.presets ? <PresetControleGenerique visiteId={visiteId} sectionCode={item.sectionCode} field={item.field} etatInitial={controlesMap[item.key]} onEtatChange={etatHandler(item.key)} onSaved={onSaved} /> : <PersistentControleGenerique visiteId={visiteId} sectionCode={item.sectionCode} field={item.field} etatInitial={controlesMap[item.key]} onEtatChange={etatHandler(item.key)} onSaved={onSaved} trameId={trameId} />}
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
    removeClippedSubviews={false}
  />;
}
