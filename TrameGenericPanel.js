/** Panneau de saisie générique piloté par la définition de la trame. */
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { getChampsVisite, getControlesVisite } from './db.js';
import { ChampGenerique, ControleGenerique } from './GenericFields.js';
import { styles } from './styles.js';

function codeSection(panelId, section) {
  return panelId.replace('p-', '') + '.' + String(section).toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

export function TrameGenericPanel({ visiteId, panelId, sections, onSaved }) {
  const [champsMap, setChampsMap] = useState({});
  const [controlesMap, setControlesMap] = useState({});

  useEffect(() => {
    let actif = true;
    Promise.all([getChampsVisite(visiteId), getControlesVisite(visiteId)]).then(([champs, controles]) => {
      if (!actif) return;
      setChampsMap(champs);
      setControlesMap(controles);
    });
    return () => { actif = false; };
  }, [visiteId, panelId]);

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
