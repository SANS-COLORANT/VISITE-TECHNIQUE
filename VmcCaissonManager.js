/** Gestion par visite des caissons VMC : un seul par défaut, ajout/retrait/renommage jusqu'à 6. */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, FONTS, styles } from './styles.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { ProgressRing } from './premiumChrome.js';
import { getDb } from './db.js';
import { ButtonGlow } from './ButtonGlow.js';

const CONFIG_SECTION = 'vmc.config';
const INFOS_SECTION = 'vmc-infos.informations_g_n_rales';
const MAX_CAISSONS = 6;

function panelId(index) { return `p-vmc-c${index}`; }
function sectionSituation(index) { return `vmc-c${index}.situation`; }
function cleIdentification(index) { return `Identification du caisson n°${index}`; }
function cleActif(index) { return `caisson_${index}_actif`; }
function cleNom(index) { return `caisson_${index}_nom`; }
function libelleCaisson(index, nom) {
  const brut = String(nom || '').trim();
  const base = `Caisson n°${index}`;
  return !brut || new RegExp(`^Caisson(?: n°)? ${index}$`, 'i').test(brut) ? base : `${base} - ${brut}`;
}

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

async function synchroniserNombreCaissons(db, visiteId, nombre) {
  await db.runAsync(
    `INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?)
     ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur`,
    [visiteId, INFOS_SECTION, 'Nombre de caissons', String(nombre)]
  );
}

async function synchroniserLibellesRemarquesCaisson(db, visiteId, index, nom) {
  await db.runAsync(
    `UPDATE remarques
     SET reference_type=COALESCE(reference_type,'controle'),
         reference_id=COALESCE(reference_id,controle_key),
         reference_libelle=? || ' · ' || CASE
           WHEN instr(controle_key,'||')>0 THEN substr(controle_key,instr(controle_key,'||')+2)
           ELSE controle_key
         END
     WHERE visite_id=?
       AND controle_key LIKE ?
       AND (reference_type IS NULL OR reference_type='controle')
       AND (reference_id IS NULL OR reference_id=controle_key)`,
    [nom, visiteId, `vmc-c${index}.%`]
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
    if (actif) {
      await upsertIdentification(db, visiteId, i, nom);
      await synchroniserLibellesRemarquesCaisson(db, visiteId, i, libelleCaisson(i, nom));
    }
  }
  await synchroniserNombreCaissons(db, visiteId, caissons.filter((c) => c.actif).length);
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
  await synchroniserNombreCaissons(db, visiteId, caissons.filter((c) => c.actif).length + 1);
  return { ...(libre || {}), actif: true, nom };
}

export async function renommerCaissonVmc(visiteId, index, valeur) {
  const db = await getDb();
  const nom = String(valeur || '').trim() || `Caisson ${index}`;
  await upsertConfig(db, visiteId, cleNom(index), nom);
  await upsertIdentification(db, visiteId, index, nom);
  await synchroniserLibellesRemarquesCaisson(db, visiteId, index, libelleCaisson(index, nom));
  return nom;
}

export async function dupliquerCaissonVmc(visiteId, sourceIndex) {
  const db = await getDb();
  const caissons = await chargerCaissonsVmc(visiteId);
  const source = caissons.find((c) => c.index === sourceIndex && c.actif);
  const cible = caissons.find((c) => !c.actif);
  if (!source) throw new Error('Caisson source introuvable.');
  if (!cible) throw new Error(`La visite contient déjà ${MAX_CAISSONS} caissons.`);

  const targetIndex = cible.index;
  const sourcePrefix = `vmc-c${sourceIndex}.`;
  const targetPrefix = `vmc-c${targetIndex}.`;
  const customBase = String(source.nom || '').trim();
  const targetName = customBase && !new RegExp(`^Caisson(?: n°)? ${sourceIndex}$`, 'i').test(customBase)
    ? `${customBase} - copie`
    : `Caisson ${targetIndex}`;

  const champs = await db.getAllAsync(`SELECT section_code,cle,valeur FROM champs_visite WHERE visite_id=? AND section_code LIKE ?`, [visiteId, `${sourcePrefix}%`]);
  for (const row of champs || []) {
    const section = String(row.section_code).replace(sourcePrefix, targetPrefix);
    const cle = String(row.cle || '').replace(`n°${sourceIndex}`, `n°${targetIndex}`);
    const valeur = row.cle === cleIdentification(sourceIndex) ? targetName : row.valeur;
    await db.runAsync(`INSERT INTO champs_visite(visite_id,section_code,cle,valeur) VALUES(?,?,?,?) ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET valeur=excluded.valeur`, [visiteId, section, cle, valeur]);
  }

  const controles = await db.getAllAsync(`SELECT section_code,cle,avis,commentaire FROM controles_visite WHERE visite_id=? AND section_code LIKE ?`, [visiteId, `${sourcePrefix}%`]);
  for (const row of controles || []) {
    const section = String(row.section_code).replace(sourcePrefix, targetPrefix);
    await db.runAsync(`INSERT INTO controles_visite(visite_id,section_code,cle,avis,commentaire) VALUES(?,?,?,?,?) ON CONFLICT(visite_id,section_code,cle) DO UPDATE SET avis=excluded.avis,commentaire=excluded.commentaire`, [visiteId, section, row.cle, row.avis, row.commentaire]);
  }

  const remarques = await db.getAllAsync(`SELECT * FROM remarques WHERE visite_id=? AND controle_key LIKE ?`, [visiteId, `${sourcePrefix}%`]);
  for (const row of remarques || []) {
    const controleKey = String(row.controle_key).replace(sourcePrefix, targetPrefix);
    const field = controleKey.includes('||') ? controleKey.split('||').slice(1).join('||') : 'Élément technique';
    const ref = `${libelleCaisson(targetIndex, targetName)} · ${field}`;
    await db.runAsync(`INSERT INTO remarques(id,visite_id,controle_key,poste,prestation,delai,estimatif,origine,reference_onglet,reference_type,reference_id,reference_libelle) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, [
      `${Date.now()}_${Math.random().toString(36).slice(2)}`, visiteId, controleKey, row.poste, row.prestation, row.delai, row.estimatif,
      row.origine ? `${row.origine} · duplication` : 'Duplication caisson', row.reference_onglet, 'controle', controleKey, ref,
    ]);
  }

  // Photos are intentionally NOT duplicated: every caisson must keep its own field evidence.
  await upsertConfig(db, visiteId, cleActif(targetIndex), '1');
  await upsertConfig(db, visiteId, cleNom(targetIndex), targetName);
  await upsertIdentification(db, visiteId, targetIndex, targetName);
  await synchroniserLibellesRemarquesCaisson(db, visiteId, targetIndex, libelleCaisson(targetIndex, targetName));
  await synchroniserNombreCaissons(db, visiteId, caissons.filter((c) => c.actif).length + 1);
  return { ...cible, actif: true, nom: targetName };
}

export async function retirerCaissonVmc(visiteId, index) {
  const db = await getDb();
  const caissons = await chargerCaissonsVmc(visiteId);
  const actifs = caissons.filter((c) => c.actif);
  if (actifs.length <= 1) throw new Error('Une visite VMC doit conserver au moins un caisson.');

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
  await synchroniserNombreCaissons(db, visiteId, actifs.length - 1);
}

export function VmcCaissonManager({ visiteId, caissons = [], onChange, onNavigate, activePanelId = null, tabStates = null }) {
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

  const dupliquer = async (caisson) => {
    try {
      const cree = await dupliquerCaissonVmc(visiteId, caisson.index);
      await recharger();
      onNavigate?.(cree.panelId);
    } catch (e) { Alert.alert('Duplication VMC', String(e?.message || e)); }
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

  return <View style={{ marginBottom: 10 }}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
      {actifs.map((c) => {
        const st = tabStates?.[c.panelId] || null;
        const pct = st?.total ? Math.round((st.done / st.total) * 100) : 0;
        const on = activePanelId === c.panelId;
        const accent = st?.ns ? '#C23B2E' : st?.total && st.done >= st.total ? '#2E9D5B' : COLORS.orange;
        return <TouchableOpacity key={c.index} activeOpacity={0.85} onPress={() => onNavigate?.(c.panelId)} onLongPress={() => setEdition(c.index)} style={[caissonStyles.card, on && caissonStyles.cardOn]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={caissonStyles.num}>C{c.index}</Text>
            <ProgressRing pct={pct} size={26} strokeWidth={3.5} accent={accent} />
          </View>
          <Text numberOfLines={1} style={caissonStyles.name}>{libelleCaisson(c.index, c.nom).replace(/^Caisson n°\d+(?: - )?/, '') || 'Caisson'}</Text>
          <Text numberOfLines={1} style={[caissonStyles.meta, st?.ns ? { color: '#C23B2E', fontFamily: FONTS.bodyBold } : null]}>
            {!st?.total ? 'À faire' : st.ns ? `${st.done}/${st.total} · ${st.ns} N.S` : st.done >= st.total ? `${st.done}/${st.total} · terminé` : st.done ? `${st.done}/${st.total}` : 'À faire'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 7 }}>
            <TouchableOpacity accessibilityLabel={`Renommer ${c.nom}`} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} onPress={() => setEdition(c.index)} style={caissonStyles.mini}><CvcIcon name="edit" size={14} color={COLORS.orangeDark} /></TouchableOpacity>
            <TouchableOpacity accessibilityLabel={`Dupliquer ${libelleCaisson(c.index, c.nom)}`} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} onPress={() => dupliquer(c)} style={caissonStyles.mini}><CvcIcon name="copy" size={14} color={COLORS.orangeDark} strokeWidth={2.1} /></TouchableOpacity>
            <TouchableOpacity accessibilityLabel={`Retirer ${c.nom}`} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} onPress={() => demanderRetrait(c)} style={caissonStyles.mini}><CvcIcon name="trash" size={14} color={COLORS.inkFaint} /></TouchableOpacity>
          </View>
        </TouchableOpacity>;
      })}
      {actifs.length < MAX_CAISSONS ? <TouchableOpacity accessibilityLabel="Ajouter un caisson" activeOpacity={0.85} onPress={ajouter} style={[caissonStyles.card, caissonStyles.add]}>
        <CvcIcon name="plus" size={20} color={COLORS.orangeDark} strokeWidth={2.2} />
        <Text style={[caissonStyles.meta, { color: COLORS.orangeDark, fontFamily: FONTS.bodyBold, marginTop: 4 }]}>Caisson</Text>
      </TouchableOpacity> : null}
    </ScrollView>

    <Modal visible={edition !== null} transparent animationType="fade" onRequestClose={() => setEdition(null)}>
      <View style={styles.modalOverlay}><View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Renommer le caisson n°{edition}</Text>
        <TextInput style={[styles.input, { marginTop: 12 }]} autoFocus value={nom} onChangeText={setNom} placeholder={`Caisson ${edition || ''}`} />
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setEdition(null)}><Text style={styles.btnSecondaryText}>Annuler</Text></TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={enregistrerNom}><ButtonGlow /><Text style={styles.btnPrimaryText}>Enregistrer</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}

const caissonStyles = StyleSheet.create({
  card: { width: 112, padding: 10, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(22,21,15,0.1)' },
  cardOn: { backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 1.5, borderColor: COLORS.orange, shadowColor: COLORS.orange, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  num: { fontSize: 13, fontFamily: FONTS.black, color: COLORS.ink },
  name: { fontSize: 11.5, fontFamily: FONTS.bodySemi, color: COLORS.ink, marginTop: 5 },
  meta: { fontSize: 10.5, fontFamily: FONTS.bodyMedium, color: COLORS.inkSoft, marginTop: 2 },
  mini: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(242,100,38,0.1)' },
  add: { width: 84, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderColor: 'rgba(242,100,38,0.5)' },
});
