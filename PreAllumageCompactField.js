/** Saisie Pré-allumage compacte, pensée pour le terrain et le clavier numérique. */
import React, { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { upsertChamp } from './db.js';
import { useDurableAutosave } from './durableAutosave.js';
import { PreAllumagePhotoButton } from './PreAllumagePhotoButton.js';
import { COLORS, styles } from './styles.js';

const ETATS = Object.freeze({
  index: ['N.R', 'N.A', 'À compléter'],
  temperature: ['À l’arrêt', 'N.R', 'N.A', 'À compléter'],
  numeric: ['À compléter'],
  text: ['À compléter'],
});

function unitéDepuisLibelle(texte) {
  const m = String(texte || '').match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : '';
}
function sansUnite(texte) {
  return String(texte || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}
function sansPrefixeLocal(texte, localName) {
  const brut = String(texte || '');
  if (localName && brut.startsWith(`${localName} —`)) return brut.slice(String(localName).length + 2).trim();
  return brut;
}
function estValeurEtat(v) {
  return Object.values(ETATS).flat().includes(String(v || '').trim());
}
function typeChamp(field, label) {
  const texte = `${field?.cle || ''} ${label || ''}`;
  if (field?.numericIndex || /(index|compteur|MWh|m³)/i.test(texte)) return 'index';
  if (/(température extérieure|départ chauffage|retour chauffage|départ ECS|retour ECS|arrivée primaire ECS|retour primaire ECS)/i.test(texte)) return 'temperature';
  if (/(°C|nombre de logements|nombre de bâtiments|réduit de jour|courbe de chauffe)/i.test(texte)) return 'numeric';
  return 'text';
}
function groupeTemperature(field, label) {
  const texte = `${field?.cle || ''} ${label || ''}`;
  if (/courbe de chauffe/i.test(texte)) return { hidden: true };
  if (/départ ECS|retour ECS|arrivée primaire ECS|retour primaire ECS/i.test(texte)) return { icon: '💧', label: 'ECS / primaire' };
  if (/départ chauffage|retour chauffage|réduit de jour|température de non chauffe|horaires?/i.test(texte)) return { icon: '♨', label: 'Chauffage' };
  if (/température extérieure/i.test(texte)) return { icon: '◎', label: 'Extérieur' };
  return null;
}
function normaliserNombre(texte) {
  const t = String(texte || '').replace(/\./g, ',').replace(/[^0-9,\-]/g, '');
  const signe = t.startsWith('-') ? '-' : '';
  const corps = t.replace(/-/g, '');
  const [entier, ...dec] = corps.split(',');
  return `${signe}${entier}${dec.length ? `,${dec.join('')}` : ''}`;
}
function nombre(v) {
  const texte = String(v ?? '').trim();
  if (!texte) return null;
  const n = Number(texte.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function arrondi(v) { return Math.round(v * 10) / 10; }

function EtatChip({ label, selected, onPress }) {
  return <TouchableOpacity onPress={onPress} style={{ minHeight: 30, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 15, borderWidth: 1, borderColor: selected ? COLORS.orange : COLORS.line, backgroundColor: selected ? COLORS.orangeLight : COLORS.white }}>
    <Text style={{ fontSize: 10, fontWeight: '800', color: selected ? COLORS.orangeDark : COLORS.inkSoft }}>{label}</Text>
  </TouchableOpacity>;
}

export const PreAllumageCompactField = React.memo(function PreAllumageCompactField({
  visiteId,
  sectionCode,
  field,
  valeurInitiale,
  localName,
  onSaved,
  showPhoto = false,
  showThermalBadge = true,
}) {
  const libelleBrut = field?.displayLabel || field?.libelle || field?.cle || 'Champ';
  const libelleLocal = sansPrefixeLocal(libelleBrut, localName);
  const unit = unitéDepuisLibelle(libelleLocal) || unitéDepuisLibelle(field?.cle);
  const label = sansUnite(libelleLocal);
  const kind = typeChamp(field, libelleLocal);
  const numeric = kind !== 'text';
  const entiteKey = `${sectionCode}||${field.cle}`;
  const groupe = groupeTemperature(field, libelleLocal);

  const sauvegarder = async (v) => {
    onSaved?.(v);
    await upsertChamp(visiteId, sectionCode, field.cle, v);
  };
  const [valeur, setValeur, flush, setImmediate] = useDurableAutosave(valeurInitiale, sauvegarder, 350);
  const [derniereValeur, setDerniereValeur] = useState(estValeurEtat(valeurInitiale) ? '' : String(valeurInitiale || ''));

  useEffect(() => {
    if (!estValeurEtat(valeurInitiale) && String(valeurInitiale || '').trim()) setDerniereValeur(String(valeurInitiale));
  }, [valeurInitiale]);

  const etats = ETATS[kind] || ETATS.text;
  const enEtat = estValeurEtat(valeur);
  const estHoraire = /horaires?/i.test(label);
  const valeurAffichee = enEtat ? '' : valeur;
  const warning = useMemo(() => {
    if (kind !== 'temperature' || enEtat || !String(valeur || '').trim()) return null;
    const n = nombre(valeur);
    if (n === null) return 'Valeur numérique attendue';
    if (n < -30 || n > 120) return 'Valeur inhabituelle — à vérifier';
    return null;
  }, [kind, valeur, enEtat]);

  const choisirEtat = async (etat) => {
    if (valeur === etat) {
      await setImmediate(derniereValeur || '');
      return;
    }
    if (!enEtat && String(valeur || '').trim()) setDerniereValeur(String(valeur));
    await setImmediate(etat);
  };

  const ajuster = async (delta) => {
    const actuel = nombre(valeurAffichee) ?? 0;
    const next = String(arrondi(actuel + delta)).replace('.', ',');
    setDerniereValeur(next);
    await setImmediate(next);
  };

  const changer = (t) => {
    const next = numeric && !estHoraire ? normaliserNombre(t) : t;
    setDerniereValeur(next);
    setValeur(next);
  };

  // Les points de courbe sont déjà éditables dans le composant graphique juste
  // au-dessus (T° extérieure → T° eau). Ne pas les afficher une deuxième fois.
  if (groupe?.hidden) return null;

  return <View style={{ flex: 1, minWidth: 0, paddingVertical: 4 }}>
    {showThermalBadge && groupe ? <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4, paddingHorizontal: 7, minHeight: 22, borderRadius: 11, backgroundColor: groupe.label === 'Chauffage' ? '#FFF4E8' : groupe.label === 'ECS / primaire' ? '#EEF7FF' : '#F2F4F7' }}><Text style={{ fontSize: 11 }}>{groupe.icon}</Text><Text style={{ color: COLORS.inkSoft, fontSize: 9, fontWeight: '900' }}>{groupe.label}</Text></View> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <Text numberOfLines={2} style={{ flex: 1, color: COLORS.ink, fontWeight: '800', fontSize: 12 }}>{label}</Text>
      {showPhoto ? <PreAllumagePhotoButton visiteId={visiteId} entiteKey={entiteKey} label={`${localName || ''} · ${label}`} style={{ minHeight: 32, paddingHorizontal: 8, paddingVertical: 5 }} /> : null}
    </View>

    <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 6 }}>
      {numeric && !enEtat && !estHoraire ? <TouchableOpacity onPress={() => ajuster(-1)} style={{ width: 34, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 9, backgroundColor: COLORS.white }}><Text style={{ fontSize: 20, color: COLORS.inkSoft }}>−</Text></TouchableOpacity> : null}
      {enEtat ? <TouchableOpacity onPress={() => choisirEtat(valeur)} style={{ flex: 1, minHeight: 42, justifyContent: 'center', borderWidth: 1, borderColor: COLORS.orange, borderRadius: 9, backgroundColor: COLORS.orangeLight, paddingHorizontal: 10 }}><Text style={{ color: COLORS.orangeDark, fontWeight: '900', fontSize: 12 }}>{valeur}</Text></TouchableOpacity> : <View style={{ flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: warning ? '#F79009' : COLORS.line, borderRadius: 9, backgroundColor: COLORS.white }}>
        <TextInput
          style={[styles.input, { flex: 1, minHeight: 40, borderWidth: 0, margin: 0, paddingVertical: 7, paddingHorizontal: 10, fontSize: 13 }]}
          value={valeurAffichee}
          onChangeText={changer}
          onBlur={() => flush().catch(() => {})}
          keyboardType={numeric && !estHoraire ? 'decimal-pad' : 'default'}
          inputMode={numeric && !estHoraire ? 'decimal' : 'text'}
          placeholder={estHoraire ? 'Ex. 6h-13h' : numeric ? '—' : 'Saisir…'}
        />
        {unit ? <Text style={{ paddingRight: 9, color: COLORS.inkSoft, fontWeight: '800', fontSize: 11 }}>{unit}</Text> : null}
      </View>}
      {numeric && !enEtat && !estHoraire ? <TouchableOpacity onPress={() => ajuster(1)} style={{ width: 34, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.line, borderRadius: 9, backgroundColor: COLORS.white }}><Text style={{ fontSize: 20, color: COLORS.inkSoft }}>+</Text></TouchableOpacity> : null}
    </View>

    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
      {estHoraire ? ['6h-13h', '6h-12h', '7h-13h'].map((opt) => <EtatChip key={opt} label={opt} selected={valeur === opt} onPress={() => setImmediate(valeur === opt ? '' : opt).catch(() => {})} />) : null}
      {etats.map((etat) => <EtatChip key={etat} label={etat} selected={valeur === etat} onPress={() => choisirEtat(etat).catch(() => {})} />)}
    </View>
    {warning ? <Text style={{ color: '#B54708', fontSize: 10, fontWeight: '700', marginTop: 5 }}>{warning}</Text> : null}
  </View>;
});
