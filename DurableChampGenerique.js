/** Champ générique durable pour les listes virtualisées et changements d'onglet rapides. */
import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { upsertChamp } from './db.js';
import { useDurableAutosave } from './durableAutosave.js';
import { ChipSelector, StepperNumerique, cleanLabel, extractUnit, getNumericConfig } from './GenericFields.js';
import { PhotoButton } from './PhotoButton.js';
import { styles } from './styles.js';

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

export const DurableChampGenerique = React.memo(function DurableChampGenerique({ visiteId, sectionCode, field, valeurInitiale, onSaved }) {
  const unit = extractUnit(field.cle);
  const label = cleanLabel(field.cle);
  const entiteKey = `${sectionCode}||${field.cle}`;
  const numericConfig = getNumericConfig(field.cle);
  const chipOptions = FIELD_OPTIONS[field.cle];
  const sansPhoto = sectionCode === 'infos.g_n_ral' || sectionCode === 'infos.informations_g_n_rales';
  const estDateVisite = sansPhoto && /date\s*(de\s*)?(la\s*)?visite/i.test(String(field.cle || ''));

  const sauvegarder = async (nouvelleValeur) => {
    onSaved?.(nouvelleValeur);
    await upsertChamp(visiteId, sectionCode, field.cle, nouvelleValeur);
  };

  const [valeur, setValeur, flush, setImmediate] = useDurableAutosave(valeurInitiale, sauvegarder, 450);
  const [dateTexte, setDateTexte] = useState(() => normaliserDateInitiale(valeurInitiale) || dateAujourdhuiFr());
  const [dateErreur, setDateErreur] = useState(false);

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

  return (
    <View style={styles.fieldBlock}>
      <View style={styles.fieldTop}>
        <Text style={styles.fieldLabel}>{label}{unit && !numericConfig ? ` (${unit})` : ''}</Text>
        {!sansPhoto && <PhotoButton visiteId={visiteId} entiteKey={entiteKey} label={label} />}
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
      ) : numericConfig ? (
        <StepperNumerique valeur={valeur} config={numericConfig} onChange={(v) => { setImmediate(v).catch(() => {}); }} />
      ) : chipOptions ? (
        <ChipSelector valeur={valeur} options={chipOptions} onChange={(v) => { setImmediate(v).catch(() => {}); }} />
      ) : (
        <TextInput style={styles.input} value={valeur} onChangeText={setValeur} onBlur={() => { flush().catch(() => {}); }} placeholder="Saisir..." />
      )}
    </View>
  );
});
