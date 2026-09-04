/** Informations Pré-allumage compactes : une seule date visible, sans boutons photo inutiles. */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { getChampsVisite, upsertChamp } from './db.js';
import { chargerPreAllumageModulaire } from './preAllumageModularDb.js';
import { COLORS, styles } from './styles.js';

function mapChamps(rows) { return Object.fromEntries((rows || []).map((r) => [`${r.section_code}||${r.cle}`, r.valeur])); }
function masquerDate(value) {
  const chiffres = String(value || '').replace(/\D/g, '').slice(0, 8);
  if (chiffres.length <= 2) return chiffres.length === 2 ? `${chiffres}/` : chiffres;
  if (chiffres.length <= 4) return `${chiffres.slice(0, 2)}/${chiffres.slice(2)}${chiffres.length === 4 ? '/' : ''}`;
  return `${chiffres.slice(0, 2)}/${chiffres.slice(2, 4)}/${chiffres.slice(4)}`;
}
function dateAffichee(value) {
  const t = String(value || '').trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : t;
}
function dateValide(v) {
  const m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (!m) return false;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return d.getFullYear() === Number(m[3]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[1]);
}

function InfoField({ visiteId, sectionCode, field, valeurInitiale, onSaved }) {
  const label = field.displayLabel || field.libelle || field.cle;
  const estDate = field.cle === 'Date de la visite';
  const estNombre = /Nombre de sous-stations/i.test(field.cle);
  const multiline = /Observations générales/i.test(field.cle) || /adresse/i.test(label);
  const [valeur, setValeur] = useState(estDate ? dateAffichee(valeurInitiale) : String(valeurInitiale || ''));
  const [erreur, setErreur] = useState(false);
  useEffect(() => { setValeur(estDate ? dateAffichee(valeurInitiale) : String(valeurInitiale || '')); setErreur(false); }, [valeurInitiale, estDate]);

  const sauver = async () => {
    const propre = String(valeur || '').trim();
    if (estDate && !dateValide(propre)) { setErreur(true); return; }
    setErreur(false);
    await upsertChamp(visiteId, sectionCode, field.cle, propre);
    // Une seule date dans l'interface, deux cellules alimentées dans le modèle Excel.
    if (estDate) await upsertChamp(visiteId, 'pa-infos.informations_g_n_rales', 'Date de visite', propre);
    onSaved?.(propre);
  };

  return <View style={{ flex: 1, minWidth: 0, paddingVertical: 6 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}><Text style={{ flex: 1, color: COLORS.ink, fontSize: 12, fontWeight: '800' }}>{label}</Text>{estNombre ? <Text style={{ color: COLORS.inkSoft, fontSize: 9, fontWeight: '800' }}>AUTO</Text> : null}</View>
    <TextInput
      style={[styles.input, { minHeight: multiline ? 68 : 42, textAlignVertical: multiline ? 'top' : 'center', fontSize: 12 }, erreur && { borderColor: COLORS.red }]}
      multiline={multiline}
      value={valeur}
      onChangeText={(v) => { setErreur(false); setValeur(estDate ? masquerDate(v) : estNombre ? v.replace(/\D/g, '') : v); }}
      onBlur={() => sauver().catch(console.warn)}
      keyboardType={estDate || estNombre ? 'number-pad' : 'default'}
      placeholder={estDate ? 'JJ/MM/AAAA' : 'Saisir…'}
    />
    {erreur ? <Text style={{ color: COLORS.red, fontSize: 10, marginTop: 4 }}>Date attendue au format JJ/MM/AAAA.</Text> : null}
  </View>;
}

function grouper(champs, deuxColonnes) {
  const rows = []; let tampon = [];
  const vider = () => { if (tampon.length) rows.push({ key: tampon.map((x) => x.key).join('|'), items: tampon }); tampon = []; };
  for (const item of champs) {
    const large = /Observations générales|Nom du local \/ adresse/i.test(item.field.cle);
    if (large) { vider(); rows.push({ key: item.key, items: [item], large: true }); continue; }
    tampon.push(item); if (!deuxColonnes || tampon.length === 2) vider();
  }
  vider(); return rows;
}

export function PreAllumageInfoPanel({ visiteId, onSaved }) {
  const { width } = useWindowDimensions();
  const deuxColonnes = width >= 720;
  const [modele, setModele] = useState(null);
  const [champs, setChamps] = useState({});
  useEffect(() => {
    let alive = true;
    Promise.all([chargerPreAllumageModulaire(visiteId), getChampsVisite(visiteId)]).then(([m, c]) => { if (alive) { setModele(m); setChamps(mapChamps(c)); } }).catch(console.warn);
    return () => { alive = false; };
  }, [visiteId]);

  const sections = useMemo(() => {
    if (!modele) return [];
    return (modele.rubriques || []).filter((r) => r.panel_id === 'p-pa-infos').map((r) => {
      const items = (r.champs || []).filter((c) => c.field.cle !== 'Date de visite').map((c) => ({ key: `${r.section_code}||${c.field.cle}`, field: { ...c.field, displayLabel: c.libelle } }));
      return { id: r.id, title: r.nom, sectionCode: r.section_code, data: grouper(items, deuxColonnes) };
    }).filter((s) => s.data.length);
  }, [modele, deuxColonnes]);

  if (!modele) return <View style={{ padding: 30 }}><ActivityIndicator color={COLORS.orange} /></View>;
  return <SectionList
    sections={sections}
    keyExtractor={(r) => r.key}
    renderSectionHeader={({ section }) => <View style={{ marginTop: 5, marginBottom: 4 }}><Text style={{ color: COLORS.ink, fontSize: 14, fontWeight: '900' }}>{section.title}</Text></View>}
    renderItem={({ item, section }) => <View style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 3, marginBottom: 7 }}><View style={{ flexDirection: item.large || !deuxColonnes ? 'column' : 'row', gap: item.large || !deuxColonnes ? 0 : 12 }}>{item.items.map((x, i) => <View key={x.key} style={{ flex: 1, minWidth: 0, paddingLeft: deuxColonnes && !item.large && i > 0 ? 10 : 0, borderLeftWidth: deuxColonnes && !item.large && i > 0 ? 1 : 0, borderLeftColor: COLORS.line }}><InfoField visiteId={visiteId} sectionCode={section.sectionCode} field={x.field} valeurInitiale={champs[x.key]} onSaved={(v) => { setChamps((m) => ({ ...m, [x.key]: v })); onSaved?.(); }} /></View>)}</View></View>}
    contentContainerStyle={styles.panelContent}
    keyboardShouldPersistTaps="handled"
    stickySectionHeadersEnabled={false}
  />;
}
