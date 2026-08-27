/** Gestion par visite des caissons VMC : un seul par défaut, ajout/retrait/renommage jusqu'à 6. */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, styles } from './styles.js';
import { getDb } from './db.js';

const CONFIG_SECTION = 'vmc.config';
const MAX_CAISSONS = 6;

function panelId(index) { return `p-vmc-c${index}`; }
function sectionSituation(index) { return `vmc-c${index}.situation`; }
function cleIdentification(index) { return `Identification du caisson n°${index}`; }
function cleActif(index) { return `caisson_${index}_actif`; }
function cleNom(index) { return `caisson_${index}_nom`; }

async function upsertConfig(db, visiteId, cle, valeur) {
  await db.runAsync(
    `INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)
     ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur`,
    [visiteId, CONFIG_SECTION, cle, String(valeur ?? '')]
  );
}

async function upsertIdentification(db, visiteId, index, nom) {
  await db.runAsync(
    `INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)
     ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur`,
    [visiteId, sectionSituation(index), cleIdentification(index), nom]
  );
}

function indexDepuisSection(sectionCode) {
  const match = String(sectionCode || '').match(/^vmc-c([1-6])\./);
  return match ? Number(match[1]) : null;
}

export async function chargerCaissonsVmc(visiteId) {
  const db = await getDb();
  const [configRows, identRows, donneesExistantes] = await Promise.all([
    db.getAllAsync(`SELECT cle,valeur FROM champs_visite WHERE visite_id=? AND section_code=?`, [visiteId, CONFIG_SECTION]),
    db.getAllAsync(`SELECT section_code,cle,valeur FROM champs_visite WHERE visite_id=? AND section_code LIKE 'vmc-c%.situation'`, [visiteId]),
    db.getAllAsync(
      `SELECT section_code FROM champs_visite WHERE visite_id=? AND section_code LIKE 'vmc-c%.%'
       UNION SELECT section_code FROM controles_visite WHERE visite_id=? AND section_code LIKE 'vmc-c%.%'`,
      [visiteId, visiteId]
    ),
  ]);

  const config = new Map((configRows || []).map((r) => [r.cle, String(r.valeur ?? '')]));
  const ident = new Map();
  for (const row of identRows || []) {
    const index = indexDepuisSection(row.section_code);
    if (index && row.cle === cleIdentification(index) && String(row.valeur || '').trim()) ident.set(index, String(row.valeur).trim());
  }

  const explicite = Array.from({ length: MAX_CAISSONS }, (_, i) => config.has(cleActif(i + 1))).some(Boolean);
  const utilises = new Set((donneesExistantes || []).map((r) => indexDepuisSection(r.section_code)).filter(Boolean));
  const actifsInitiaux = explicite
    ? new Set(Array.from({ length: MAX_CAISSONS }, (_, i) => i + 1).filter((i) => config.get(cleActif(i)) === '1'))
    : (utilises.size ? utilises : new Set([1]));
  if (!actifsInitiaux.size) actifsInitiaux.add(1);

  const caissons = [];
  for (let i = 1; i <= MAX_CAISSONS; i += 1) {
    const nom = String(config.get(cleNom(i)) || ident.get(i) || `Caisson ${i}`).trim() || `Caisson ${i}`;
    const actif = actifsInitiaux.has(i);
    caissons.push({ index: i, panelId: panelId(i), nom, actif });
    if (!explicite) await upsertConfig(db, visiteId, cleActif(i), actif ? '1' : '0');
    if (!config.has(cleNom(i))) await upsertConfig(db, visiteId, cleNom(i), nom);
    if (actif) await upsertIdentification(db, visiteId, i, nom);
  }
  return caissons;
}

export async function ajouterCaissonVmc(visiteId) {
  const db = await getDb();
  const caissons = await chargerCaissonsVmc(visiteId);
  const libre = caissons.find((c) => !c.actif);
  if (!libre) throw new Error('La trame Excel VMC prévoit au maximum 6 caissons.');
  const nom = libre.nom || `Caisson ${libre.index}`;
  await upsertConfig(db, visiteId, cleActif(libre.index), '1');
  await upsertConfig(db, visiteId, cleNom(libre.index), nom);
  await upsertIdentification(db, visiteId, libre.index, nom);
  return { ...(libre || {}), actif: true, nom };
}

export async function renommerCaissonVmc(visiteId, index, valeur) {
  const db = await getDb();
  const nom = String(valeur || '').trim() || `Caisson ${index}`;
  await upsertConfig(db, visiteId, cleNom(index), nom);
  await upsertIdentification(db, visiteId, index, nom);
  return nom;
}

export async function retirerCaissonVmc(visiteId, index) {
  const db = await getDb();
  const caissons = await chargerCaissonsVmc(visiteId);
  if (caissons.filter((c) => c.actif).length <= 1) throw new Error('Une visite VMC doit conserver au moins un caisson.');

  const prefixSection = `vmc-c${index}.%`;
  const prefixControle = `vmc-c${index}.%`;
  const remarques = await db.getAllAsync(`SELECT id FROM remarques WHERE visite_id=? AND controle_key LIKE ?`, [visiteId, prefixControle]);
  for (const remarque of remarques || []) {
    await db.runAsync(`DELETE FROM photos WHERE visite_id=? AND entite_key=?`, [visiteId, `remarque||${remarque.id}`]);
  }
  await db.runAsync(`DELETE FROM photos WHERE visite_id=? AND entite_key LIKE ?`, [visiteId, prefixControle]);
  await db.runAsync(`DELETE FROM remarques WHERE visite_id=? AND controle_key LIKE ?`, [visiteId, prefixControle]);
  await db.runAsync(`DELETE FROM controles_visite WHERE visite_id=? AND section_code LIKE ?`, [visiteId, prefixSection]);
  await db.runAsync(`DELETE FROM champs_visite WHERE visite_id=? AND section_code LIKE ?`, [visiteId, prefixSection]);
  await upsertConfig(db, visiteId, cleActif(index), '0');
}

export function VmcCaissonManager({ visiteId, caissons = [], onChange, onNavigate }) {
  const [edition, setEdition] = useState(null);
  const [nom, setNom] = useState('');
  const actifs = useMemo(() => caissons.filter((c) => c.actif), [caissons]);

  useEffect(() => {
    if (!edition) return;
    const c = caissons.find((x) => x.index === edition);
    setNom(c?.nom || `Caisson ${edition}`);
  }, [edition, caissons]);

  const recharger = async () => {
    const next = await chargerCaissonsVmc(visiteId);
    onChange?.(next);
    return next;
  };

  const ajouter = async () => {
    try {
      const cree = await ajouterCaissonVmc(visiteId);
      await recharger();
      onNavigate?.(cree.panelId);
    } catch (e) { Alert.alert('Caissons VMC', String(e?.message || e)); }
  };

  const demanderRetrait = (caisson) => {
    if (actifs.length <= 1) return Alert.alert('Caissons VMC', 'Il faut conserver au moins un caisson.');
    Alert.alert(
      `Retirer ${caisson.nom} ?`,
      'Les saisies, réserves et photos rattachées à ce caisson seront supprimées de cette visite.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Retirer', style: 'destructive', onPress: async () => {
          try { await retirerCaissonVmc(visiteId, caisson.index); await recharger(); }
          catch (e) { Alert.alert('Caissons VMC', String(e?.message || e)); }
        } },
      ]
    );
  };

  const enregistrerNom = async () => {
    if (!edition) return;
    try {
      await renommerCaissonVmc(visiteId, edition, nom);
      await recharger();
      setEdition(null);
    } catch (e) { Alert.alert('Caissons VMC', String(e?.message || e)); }
  };

  return <View style={{ marginBottom: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.inkSoft, marginRight: 8 }}>CAISSONS</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
        {actifs.map((c) => <View key={c.index} style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 16, backgroundColor: '#fff', marginRight: 6 }}>
          <TouchableOpacity onPress={() => onNavigate?.(c.panelId)} style={{ paddingLeft: 10, paddingVertical: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.ink }}>{c.index}. {c.nom}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEdition(c.index)} style={{ paddingHorizontal: 8, paddingVertical: 6 }}><Text style={{ color: COLORS.orangeDark, fontWeight: '800' }}>✎</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => demanderRetrait(c)} style={{ paddingRight: 9, paddingVertical: 6 }}><Text style={{ color: COLORS.inkFaint, fontWeight: '800' }}>×</Text></TouchableOpacity>
        </View>)}
      </ScrollView>
      <TouchableOpacity onPress={ajouter} disabled={actifs.length >= MAX_CAISSONS} style={{ marginLeft: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: actifs.length >= MAX_CAISSONS ? COLORS.line : COLORS.orangeLight }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: actifs.length >= MAX_CAISSONS ? COLORS.inkFaint : COLORS.orangeDark }}>+ Ajouter</Text>
      </TouchableOpacity>
    </View>

    <Modal visible={edition !== null} transparent animationType="fade" onRequestClose={() => setEdition(null)}>
      <View style={styles.modalOverlay}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Renommer le caisson n°{edition}</Text>
        <TextInput style={[styles.input, { marginTop: 12 }]} autoFocus value={nom} onChangeText={setNom} placeholder={`Caisson ${edition || ''}`} />
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setEdition(null)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={enregistrerNom}><Text style={styles.btnPrimaryText}>Enregistrer</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}
