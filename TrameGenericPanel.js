/** Panneau de saisie générique virtualisé piloté par la définition de la trame. */
import React, { useEffect, useMemo, useState } from 'react';
import { SectionList, Text, View } from 'react-native';
import { getChampsVisite, getControlesVisite } from './db.js';
import { DurableChampGenerique } from './DurableChampGenerique.js';
import { PersistentControleGenerique } from './PersistentControleGenerique.js';
import { VmcControleGenerique } from './VmcControleGenerique.js';
import { PreAllumageControleGenerique } from './PreAllumageControleGenerique.js';
import { styles } from './styles.js';

const visiteDataCache = new Map();

function codeSection(panelId, section) {
  return panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function mapperChamps(rows = []) {
  const map = {};
  rows.forEach((row) => {
    if (!row?.section_code || !row?.cle) return;
    map[`${row.section_code}||${row.cle}`] = row.valeur;
  });
  return map;
}

function mapperControles(rows = []) {
  const map = {};
  rows.forEach((row) => {
    if (!row?.section_code || !row?.cle) return;
    map[`${row.section_code}||${row.cle}`] = row;
  });
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
    .catch((e) => {
      visiteDataCache.delete(visiteId);
      throw e;
    });

  visiteDataCache.set(visiteId, { data: existant?.data || null, promise });
  return promise;
}

export function prechargerDonneesTrameGenerique(visiteId, force = false) {
  return chargerDonneesVisite(visiteId, force);
}

export function invaliderCacheTrameGenerique(visiteId) {
  visiteDataCache.delete(visiteId);
}

export function mettreAJourCacheChamp(visiteId, key, valeur) {
  const courant = visiteDataCache.get(visiteId);
  if (!courant?.data) return;
  visiteDataCache.set(visiteId, {
    data: {
      ...courant.data,
      champsMap: { ...courant.data.champsMap, [key]: valeur },
    },
    promise: courant.promise || null,
  });
}

export function mettreAJourCacheControle(visiteId, key, patch) {
  const courant = visiteDataCache.get(visiteId);
  if (!courant?.data) return;
  const ancien = courant.data.controlesMap?.[key] || {};
  visiteDataCache.set(visiteId, {
    data: {
      ...courant.data,
      controlesMap: {
        ...courant.data.controlesMap,
        [key]: { ...ancien, ...patch },
      },
    },
    promise: courant.promise || null,
  });
}

export function TrameGenericPanel({ visiteId, panelId, sections, onSaved, ListHeaderComponent = null }) {
  const cacheInitial = visiteDataCache.get(visiteId)?.data;
  const [champsMap, setChampsMap] = useState(cacheInitial?.champsMap || {});
  const [controlesMap, setControlesMap] = useState(cacheInitial?.controlesMap || {});

  useEffect(() => {
    let actif = true;
    const cache = visiteDataCache.get(visiteId)?.data;
    if (cache) {
      setChampsMap(cache.champsMap);
      setControlesMap(cache.controlesMap);
      return () => { actif = false; };
    }
    chargerDonneesVisite(visiteId).then((data) => {
      if (!actif) return;
      setChampsMap(data.champsMap);
      setControlesMap(data.controlesMap);
    });
    return () => { actif = false; };
  }, [visiteId]);

  const listeSections = useMemo(() => {
    if (!sections) return [];
    return Object.entries(sections).map(([sub, fields]) => {
      const sectionCode = codeSection(panelId, sub);
      return {
        title: sub,
        sectionCode,
        data: (fields || []).filter((field) => field?.hiddenInApp !== true).map((field) => ({ field, sectionCode, key: `${sectionCode}||${field.cle}` })),
      };
    }).filter((section) => section.data.length > 0);
  }, [panelId, sections]);

  if (!sections) return null;

  return (
    <SectionList
      sections={listeSections}
      keyExtractor={(item) => item.key}
      ListHeaderComponent={ListHeaderComponent}
      renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
      renderItem={({ item }) => (
        <View style={styles.formCard}>
          {item.field.type === 'champ' ? (
            <DurableChampGenerique
              visiteId={visiteId}
              sectionCode={item.sectionCode}
              field={item.field}
              valeurInitiale={champsMap[item.key]}
              onSaved={(valeur) => {
                setChampsMap((courant) => ({ ...courant, [item.key]: valeur }));
                mettreAJourCacheChamp(visiteId, item.key, valeur);
                onSaved?.();
              }}
            />
          ) : item.field.vmc === true ? (
            <VmcControleGenerique
              visiteId={visiteId}
              sectionCode={item.sectionCode}
              field={item.field}
              etatInitial={controlesMap[item.key]}
              onEtatChange={(patch) => {
                setControlesMap((courant) => ({
                  ...courant,
                  [item.key]: { ...(courant[item.key] || {}), ...patch },
                }));
                mettreAJourCacheControle(visiteId, item.key, patch);
              }}
              onSaved={onSaved}
            />
          ) : item.field.preAllumage === true ? (
            <PreAllumageControleGenerique
              visiteId={visiteId}
              sectionCode={item.sectionCode}
              field={item.field}
              etatInitial={controlesMap[item.key]}
              onEtatChange={(patch) => {
                setControlesMap((courant) => ({
                  ...courant,
                  [item.key]: { ...(courant[item.key] || {}), ...patch },
                }));
                mettreAJourCacheControle(visiteId, item.key, patch);
              }}
              onSaved={onSaved}
            />
          ) : (
            <PersistentControleGenerique
              visiteId={visiteId}
              sectionCode={item.sectionCode}
              field={item.field}
              etatInitial={controlesMap[item.key]}
              onEtatChange={(patch) => {
                setControlesMap((courant) => ({
                  ...courant,
                  [item.key]: { ...(courant[item.key] || {}), ...patch },
                }));
                mettreAJourCacheControle(visiteId, item.key, patch);
              }}
              onSaved={onSaved}
            />
          )}
        </View>
      )}
      contentContainerStyle={styles.panelContent}
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled={false}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={5}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews
    />
  );
}
