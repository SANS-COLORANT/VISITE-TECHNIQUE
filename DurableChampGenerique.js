/** Champ générique durable pour les listes virtualisées et changements d'onglet rapides. */
import React from 'react';
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

export const DurableChampGenerique = React.memo(function DurableChampGenerique({ visiteId, sectionCode, field, valeurInitiale, onSaved }) {
  const unit = extractUnit(field.cle);
  const label = cleanLabel(field.cle);
  const entiteKey = `${sectionCode}||${field.cle}`;
  const numericConfig = getNumericConfig(field.cle);
  const chipOptions = FIELD_OPTIONS[field.cle];
  const sansPhoto = sectionCode === 'infos.g_n_ral' || sectionCode === 'infos.informations_g_n_rales';

  const sauvegarder = async (nouvelleValeur) => {
    await upsertChamp(visiteId, sectionCode, field.cle, nouvelleValeur);
    onSaved?.(nouvelleValeur);
  };

  const [valeur, setValeur, flush, setImmediate] = useDurableAutosave(valeurInitiale, sauvegarder, 450);

  return (
    <View style={styles.fieldBlock}>
      <View style={styles.fieldTop}>
        <Text style={styles.fieldLabel}>{label}{unit && !numericConfig ? ` (${unit})` : ''}</Text>
        {!sansPhoto && <PhotoButton visiteId={visiteId} entiteKey={entiteKey} label={label} />}
      </View>
      {numericConfig ? (
        <StepperNumerique valeur={valeur} config={numericConfig} onChange={(v) => { setImmediate(v).catch(() => {}); }} />
      ) : chipOptions ? (
        <ChipSelector valeur={valeur} options={chipOptions} onChange={(v) => { setImmediate(v).catch(() => {}); }} />
      ) : (
        <TextInput style={styles.input} value={valeur} onChangeText={setValeur} onBlur={() => { flush().catch(() => {}); }} placeholder="Saisir..." />
      )}
    </View>
  );
});
