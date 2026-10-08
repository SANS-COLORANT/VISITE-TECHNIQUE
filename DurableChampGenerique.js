/** Champ générique durable pour les listes virtualisées et changements d'onglet rapides. */
import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { upsertChamp } from './db.js';
import { useDurableAutosave } from './durableAutosave.js';
import { ChipSelector, StepperNumerique, cleanLabel, extractUnit, getNumericConfig } from './GenericFields.js';
import { PhotoButton } from './PhotoButton.js';
import { LecturePhotoButton } from './PhotoOcrReview.js';
import { styles, FONTS, COLORS } from './styles.js';
import { CvcIcon } from './MetraCvcIcons.js';
import { ChoiceField, ValueTile, TileRow } from './VisitKit.js';

const FIELD_OPTIONS = {
  'Matériaux tuyauterie': ['Acier noir', 'Cuivre', 'PVC HTA', 'Multicouche', 'Acier galvanisé'],
  'Type de distribution': ['Monotube', 'Bitube', 'Plancher chauffant'],
  'Equipement sur aller': ['Vanne papillon', 'Vanne 1/4 de tour', 'Vanne 3 voies', 'Pompe double'],
  'Equipement sur retour': ["Vanne d'équilibrage", 'Vanne 1/4 de tour', 'Té de mélange'],
  "Type d'émetteur": ['Radiateurs', 'Panneau de sol', 'Convecteurs', 'Ventilo-convecteurs'],
  'Type de robinetterie': ['Robinet thermostatique', 'Vanne 1/4 de tour', 'Vanne de régulation'],
  'Calorifuge (type / état)': ['Laine de roche + revêtement PVC', 'Armaflex', 'Laine de verre', 'Absent'],
  'Variation de vitesse': ['Fixe', 'Variable', 'Auto-adaptatif'],
  'Présence mitigeur': ['Oui', 'Non'],
  'Type de régulation': ["Loi d'eau", "Thermostat d'ambiance", 'Sonde extérieure', 'Programmable'],
  'Cycle anti-légionellose': ['Hebdomadaire', 'Quotidien', 'Absent'],
  'Production primaire': ['Chaudière gaz', 'Chaudière fioul', 'Chaudière bois', 'PAC', 'Réseau de chaleur'],
  'Production ECS': ['Ballon', 'Échangeur à plaques', 'Instantané', 'Semi-instantané'],
  'Type de LT': ['Chaufferie gaz', 'Chaufferie fioul', 'Sous-station', 'Chaufferie bois'],
  'Type de ventilation': ['VMC simple flux autoréglable', 'VMC simple flux hygroréglable', 'VMC double flux', 'VMC gaz', 'Ventilation naturelle', 'Ventilation hybride', 'Extraction mécanique'],
  'Type de bouche': ['Autoréglable', 'Hygroréglable', 'Extraction gaz', 'Extraction sanitaire', 'Insufflation', 'Mixte'],
};

function dateAujourdhuiFr() {
  const d = new Date();
  const jj = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${jj}/${mm}/${d.getFullYear()}`;
}

function normaliserDateInitiale(value) {
  const texte = String(value || '').trim();
  const iso = texte.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return texte;
}

function masquerDate(value) {
  const chiffres = String(value || '').replace(/\D/g, '').slice(0, 8);
  if (chiffres.length <= 2) return chiffres.length === 2 ? `${chiffres}/` : chiffres;
  if (chiffres.length <= 4) return `${chiffres.slice(0, 2)}/${chiffres.slice(2)}${chiffres.length === 4 ? '/' : ''}`;
  return `${chiffres.slice(0, 2)}/${chiffres.slice(2, 4)}/${chiffres.slice(4)}`;
}

function dateFrValide(value) {
  const m = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const jour = Number(m[1]);
  const mois = Number(m[2]);
  const annee = Number(m[3]);
  const d = new Date(annee, mois - 1, jour);
  return d.getFullYear() === annee && d.getMonth() === mois - 1 && d.getDate() === jour;
}

function normaliserIndex(value) {
  const brut = String(value || '').replace(/\./g, ',').replace(/[^0-9,]/g, '');
  const [entier, ...decimales] = brut.split(',');
  return decimales.length ? `${entier},${decimales.join('')}` : entier;
}

// ---------------------------------------------------------------------------
// Présentations de la refonte (README §5.1 / §5.2) : affichage seulement, la
// clé et le format stocké restent ceux de la trame (export Excel inchangé).
// ---------------------------------------------------------------------------

// Champs à réponses multiples : stockés en texte « A, B » dans la même clé.
const CHAMPS_MULTI = new Set(['Matériaux tuyauterie', 'Equipement sur aller', 'Equipement sur retour']);
const CLE_CALORIFUGE = 'Calorifuge (type / état)';
const ETATS_CALORIFUGE = ['Bon', 'Dégradé', 'Manquant'];
const CLE_BAT_LGT = 'Nbr de bât / lgt';

// « Type – État » ; lecture tolérante des valeurs historiques (type seul).
export function lireCalorifuge(valeur) {
  const texte = String(valeur || '').trim();
  const m = texte.match(/^(.*?)\s+[–-]\s+(Bon|Dégradé|Manquant)$/i);
  if (!m) return { type: texte, etat: '' };
  const etat = ETATS_CALORIFUGE.find((e) => e.toLowerCase() === m[2].toLowerCase()) || m[2];
  return { type: m[1].trim(), etat };
}
export function ecrireCalorifuge(type, etat) {
  const t = String(type || '').trim();
  const e = String(etat || '').trim();
  if (!t) return '';
  return e ? `${t} – ${e}` : t;
}

// « 4 / 186 » ; lecture tolérante (« 4 bât, 186 lgt », « 4 »).
export function lireBatLgt(valeur) {
  const texte = String(valeur || '').trim();
  if (!texte) return { bat: '', lgt: '' };
  const parts = texte.split('/');
  const nombre = (t) => (String(t || '').match(/\d+/) || [''])[0];
  if (parts.length >= 2) return { bat: nombre(parts[0]), lgt: nombre(parts.slice(1).join('/')) };
  const nombres = texte.match(/\d+/g) || [];
  return { bat: nombres[0] || '', lgt: nombres[1] || '' };
}
export function ecrireBatLgt(bat, lgt) {
  const b = String(bat ?? '').trim();
  const l = String(lgt ?? '').trim();
  if (!b && !l) return '';
  return `${b} / ${l}`.trim();
}

function CalorifugeChoix({ label, valeur, options, water, onChange }) {
  const { type, etat } = lireCalorifuge(valeur);
  const sansEtat = !type || /^absent$/i.test(type);
  return <View>
    <ChoiceField label={`${label} · type`} value={type} options={options} water={water} onChange={(t) => onChange(ecrireCalorifuge(t, /^absent$/i.test(String(t || '')) ? '' : etat))} />
    {sansEtat ? null : <ChoiceField label={`${label} · état`} value={etat} options={ETATS_CALORIFUGE} water={water} segments allowOther={false} onChange={(e) => onChange(ecrireCalorifuge(type, e))} />}
  </View>;
}

function BatimentsLogements({ valeur, onChange }) {
  const { bat, lgt } = lireBatLgt(valeur);
  return <TileRow>
    <ValueTile label="Bâtiments" value={bat} min={0} max={500} start={1} onChange={(v) => onChange(ecrireBatLgt(v, lgt))} />
    <ValueTile label="Logements" value={lgt} min={0} max={10000} start={1} onChange={(v) => onChange(ecrireBatLgt(bat, v))} />
  </TileRow>;
}

function getDurableNumericConfig(cle) {
  const standard = getNumericConfig(cle);
  // Premier appui sur un comptage vide : 1 plutôt que 0 (README refonte §8).
  if (standard) return (/Nb /.test(cle) || cle === 'Nb') && standard.start == null ? { ...standard, start: 1 } : standard;
  if (['Nombre de logements', 'Nombre de bâtiments / entrées', "Nombre d'étages", 'Nombre de caissons'].includes(cle)) {
    return {
      start: 1,
      min: 0,
      max: cle === 'Nombre de logements' ? 5000 : cle === 'Nombre de caissons' ? 12 : 200,
      step: 1,
      unit: '',
    };
  }
  return null;
}

/**
 * Props de présentation (refonte) :
 * - `choix` : liste de choix repliable sur sa valeur (ChoiceField), multi-choix
 *   pour matériaux / aller / retour, calorifuge en deux temps ;
 * - `compact` : champ court des Informations (puissance au clavier avec unité,
 *   « Nb » en tuile − / +, Bâtiments / Logements en deux tuiles) ;
 * - `water` : teinte bleu-vert (ECS) ; `photo={false}` retire le bouton photo.
 */
export const DurableChampGenerique = React.memo(function DurableChampGenerique({ visiteId, sectionCode, field, valeurInitiale, onSaved, displayLabel, onRename, picto = null, choix = false, compact = false, water = false, photo = true }) {
  const unit = extractUnit(field.cle);
  const label = cleanLabel(field.cle);
  const entiteKey = `${sectionCode}||${field.cle}`;
  const numericConfig = getDurableNumericConfig(field.cle);
  const chipOptions = FIELD_OPTIONS[field.cle];
  const sansPhoto = !photo
    || sectionCode === 'infos.g_n_ral'
    || sectionCode === 'infos.informations_g_n_rales'
    || sectionCode === 'vmc-infos.informations_g_n_rales';
  const estDateVisite = sansPhoto && /date\s*(de\s*)?(la\s*)?visite/i.test(String(field.cle || ''));

  const sauvegarder = async (nouvelleValeur) => {
    onSaved?.(nouvelleValeur);
    await upsertChamp(visiteId, sectionCode, field.cle, nouvelleValeur);
  };

  const [valeur, setValeur, flush, setImmediate] = useDurableAutosave(valeurInitiale, sauvegarder, 450);
  const [dateTexte, setDateTexte] = useState(() => normaliserDateInitiale(valeurInitiale) || dateAujourdhuiFr());
  const [dateErreur, setDateErreur] = useState(false);
  const [nomAffiche, setNomAffiche] = useState(displayLabel || field.cle);

  useEffect(() => { setNomAffiche(displayLabel || field.cle); }, [displayLabel, field.cle]);

  useEffect(() => {
    if (!estDateVisite) return;
    const initiale = normaliserDateInitiale(valeurInitiale);
    const cible = initiale || dateAujourdhuiFr();
    setDateTexte(cible);
    setDateErreur(false);
    if (!initiale) sauvegarder(cible).catch(() => {});
  }, [visiteId, sectionCode, field.cle, estDateVisite]);

  const changerDate = (texte) => {
    const masquee = masquerDate(texte);
    setDateTexte(masquee);
    setDateErreur(false);
    if (masquee.length === 10 && dateFrValide(masquee)) sauvegarder(masquee).catch(() => {});
  };

  const validerDate = () => {
    if (dateFrValide(dateTexte)) {
      setDateErreur(false);
      sauvegarder(dateTexte).catch(() => {});
      return;
    }
    setDateErreur(true);
  };

  const libelleCourt = displayLabel || label;

  // Liste de choix qui se replie sur la valeur (Distribution, Informations).
  if (choix && chipOptions && !numericConfig && !field.numericIndex && !estDateVisite) {
    const changer = (v) => { setImmediate(v).catch(() => {}); };
    if (field.cle === CLE_CALORIFUGE) return <CalorifugeChoix label={libelleCourt} valeur={valeur} options={chipOptions} water={water} onChange={changer} />;
    const multi = CHAMPS_MULTI.has(field.cle);
    const courant = String(valeur || '').trim();
    // Une valeur libre historique hors liste doit rester visible : pas de segments.
    const horsListe = !multi && courant && !chipOptions.some((o) => o.toLowerCase() === courant.toLowerCase());
    return <ChoiceField label={libelleCourt} value={valeur} options={chipOptions} multi={multi} water={water} segments={horsListe ? false : undefined} onChange={changer} />;
  }

  if (compact && !estDateVisite) {
    const titre = <Text style={compactStyles.label} numberOfLines={1}>{libelleCourt}</Text>;
    if (field.cle === CLE_BAT_LGT) return <View style={compactStyles.block}><BatimentsLogements valeur={valeur} onChange={setValeur} /></View>;
    if (/\(kW\)/.test(field.cle)) {
      return <View style={compactStyles.block}>
        {titre}
        <View style={compactStyles.inputRow}>
          <TextInput style={[styles.input, compactStyles.inputFlex]} value={valeur} onChangeText={(t) => setValeur(String(t || '').replace(/[^0-9,.]/g, ''))} onBlur={() => { flush().catch(() => {}); }} keyboardType="decimal-pad" inputMode="decimal" placeholder="—" />
          <Text style={compactStyles.suffix}>{unit || 'kW'}</Text>
        </View>
      </View>;
    }
    if (numericConfig) {
      return <View style={compactStyles.block}>
        <ValueTile label={libelleCourt} value={valeur} unit={numericConfig.unit || undefined} step={numericConfig.step} min={numericConfig.min} max={numericConfig.max} start={numericConfig.start} onChange={setValeur} />
      </View>;
    }
    if (chipOptions) {
      return <ChoiceField label={libelleCourt} value={valeur} options={chipOptions} onChange={(v) => { setImmediate(v).catch(() => {}); }} />;
    }
    return <View style={compactStyles.block}>
      {titre}
      <TextInput style={styles.input} value={valeur} onChangeText={setValeur} onBlur={() => { flush().catch(() => {}); }} placeholder="Saisir…" />
    </View>;
  }

  return (
    <View style={styles.fieldBlock}>
      <View style={styles.fieldTop}>
        {field.renamable && onRename ? <TextInput style={[styles.fieldLabel, { flex: 1, paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: '#D0D5DD' }]} value={nomAffiche} onChangeText={setNomAffiche} onBlur={() => onRename(nomAffiche)} /> : picto ? <View accessible accessibilityLabel={label} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: `${picto.teinte}18` }}><CvcIcon name={picto.icon} size={20} color={picto.teinte} strokeWidth={2.1} /></View>
          <Text numberOfLines={1} style={[styles.fieldLabel, { flex: 1, fontFamily: FONTS.bold }]}>{picto.texte}{unit && !numericConfig ? ` (${unit})` : ''}</Text>
        </View> : <Text style={styles.fieldLabel}>{label}{unit && !numericConfig ? ` (${unit})` : ''}</Text>}
        {!sansPhoto && (numericConfig ? <LecturePhotoButton visiteId={visiteId} entiteKey={entiteKey} label={field.renamable ? nomAffiche : label} kind="temperatures" unit={unit} current={{valeur}} onApply={async values=>{if(!Number.isFinite(Number(String(values.valeur).replace(',','.'))))throw new Error('Vérifie la valeur numérique.');await setImmediate(values.valeur);}}/> : <PhotoButton visiteId={visiteId} entiteKey={entiteKey} label={field.renamable ? nomAffiche : label} />)}
      </View>
      {estDateVisite ? (
        <>
          <TextInput
            style={[styles.input, dateErreur && { borderColor: '#B42318' }]}
            value={dateTexte}
            onChangeText={changerDate}
            onBlur={validerDate}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="JJ/MM/AAAA"
          />
          {dateErreur ? <Text style={{ color: '#B42318', fontSize: 11, marginTop: 5 }}>Date obligatoire au format JJ/MM/AAAA.</Text> : null}
        </>
      ) : field.numericIndex ? (
        <TextInput
          style={styles.input}
          value={valeur}
          onChangeText={(texte) => setValeur(normaliserIndex(texte))}
          onBlur={() => { flush().catch(() => {}); }}
          keyboardType="decimal-pad"
          inputMode="decimal"
          maxLength={32}
          placeholder="0,00"
        />
      ) : numericConfig ? (
        <StepperNumerique valeur={valeur} config={numericConfig} start={numericConfig.start} onChange={(v) => { setImmediate(v).catch(() => {}); }} />
      ) : chipOptions ? (
        <ChipSelector valeur={valeur} options={chipOptions} onChange={(v) => { setImmediate(v).catch(() => {}); }} />
      ) : (
        <TextInput style={styles.input} value={valeur} onChangeText={setValeur} onBlur={() => { flush().catch(() => {}); }} placeholder="Saisir..." />
      )}
    </View>
  );
});

const compactStyles = {
  block: { paddingVertical: 6 },
  label: { fontSize: 12, fontFamily: FONTS.bodySemi, color: COLORS.inkSoft, marginBottom: 5 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputFlex: { flex: 1 },
  suffix: { fontSize: 13, fontFamily: FONTS.bodyBold, color: COLORS.inkSoft },
};
