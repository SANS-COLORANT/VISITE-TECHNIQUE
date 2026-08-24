/** Panneau de saisie générique piloté par la définition de la trame. */
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { getChampsVisite, getControlesVisite } from './db.js';
import { ChampGenerique, ControleGenerique } from './GenericFields.js';
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

export function TrameGenericPanel({ visiteId, panelId, sections, onSaved }) {
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

  if (!sections) return null;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelContent}>
      {Object.entries(sections).map(([sub, fields]) => {
        const sectionCode = codeSection(panelId, sub);
        const champs = (fields || []).filter((f) => f.type === 'champ');
        const controles = (fields || []).filter((f) => f.type === 'controle');
        return (
          <View key={sub}>
            <Text style={styles.sectionTitle}>{sub}</Text>
            <View style={styles.formCard}>
              {champs.map((f) => (
                <ChampGenerique
                  key={f.cle}
                  visiteId={visiteId}
                  sectionCode={sectionCode}
                  field={f}
                  valeurInitiale={champsMap[`${sectionCode}||${f.cle}`]}
                  onSaved={onSaved}
                />
              ))}
              {controles.map((f) => (
                <ControleGenerique
                  key={f.cle}
                  visiteId={visiteId}
                  sectionCode={sectionCode}
                  field={f}
                  etatInitial={controlesMap[`${sectionCode}||${f.cle}`]}
                  onSaved={onSaved}
                />
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
