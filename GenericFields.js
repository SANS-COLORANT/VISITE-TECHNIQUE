/** Champs génériques : molette numérique, chips de sélection, contrôle Avis. */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { COLORS, styles } from './styles.js';
import { PRESCRIPTIONS } from './data.js';
import { upsertChamp, upsertControle, upsertRemarqueDepuisPrescription, supprimerRemarqueParControle } from './db.js';
import { PhotoButton } from './PhotoButton.js';

// ============================================================================
// 4. COMPOSANTS GÉNÉRIQUES — champ texte / contrôle de conformité
// ============================================================================

function extractUnit(cle) {
  const m = cle.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : null;
}
function cleanLabel(cle) {
  return cle.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * Listes de valeurs courantes par champ — l'utilisateur sélectionne au lieu
 * de taper. "+ Autre" reste toujours disponible pour un cas non prévu, qui
 * s'ajoute alors à la liste pour la prochaine fois (mémorisé le temps de la
 * session ; à terme, sauvegardable en base comme "valeur perso du client").
 */
const FIELD_OPTIONS = {
  'Matériaux tuyauterie': ['Acier noir', 'Cuivre', 'PVC HTA', 'Multicouche', 'Acier galvanisé'],
  'Type de distribution': ['Monotube', 'Bitube', 'Plancher chauffant'],
  'Equipement sur aller': ['Vanne papillon', 'Vanne 1/4 de tour', 'Vanne 3 voies', 'Pompe double'],
  'Equipement sur retour': ['Vanne d\'équilibrage', 'Vanne 1/4 de tour', 'Té de mélange'],
  "Type d'émetteur": ['Radiateurs', 'Panneau de sol', 'Convecteurs', 'Ventilo-convecteurs'],
  'Type de robinetterie': ['Robinet thermostatique', 'Vanne 1/4 de tour', 'Vanne de régulation'],
  'Calorifuge (type / état)': ['Laine de roche + revêtement PVC', 'Armaflex', 'Laine de verre', 'Absent'],
  'Variation de vitesse': ['Fixe', 'Variable', 'Auto-adaptatif'],
  'Présence mitigeur': ['Oui', 'Non'],
  'Type de régulation': ['Loi d\'eau', 'Thermostat d\'ambiance', 'Sonde extérieure', 'Programmable'],
  'Cycle anti-légionellose': ['Hebdomadaire', 'Quotidien', 'Absent'],
  'Production primaire': ['Chaudière gaz', 'Chaudière fioul', 'Chaudière bois', 'PAC', 'Réseau de chaleur'],
  'Production ECS': ['Ballon', 'Échangeur à plaques', 'Instantané', 'Semi-instantané'],
  'Type de LT': ['Chaufferie gaz', 'Chaufferie fioul', 'Sous-station', 'Chaufferie bois'],
};

/**
 * Détecte si un champ est numérique (température, pH, pression, puissance,
 * index de compteur...) pour lui donner un sélecteur +/- au lieu du clavier.
 * Renvoie null si le champ n'est pas numérique, sinon les bornes/pas adaptés.
 */
function getNumericConfig(cle) {
  if (/°C/.test(cle) || /^T°/.test(cle)) {
    const isExt = /ext/i.test(cle);
    return { min: isExt ? -15 : 0, max: isExt ? 35 : 100, step: 1, unit: '°C' };
  }
  if (cle === 'pH') return { min: 0, max: 14, step: 0.1, unit: '' };
  if (/\(bar\)/.test(cle)) return { min: 0, max: 6, step: 0.1, unit: 'bar' };
  if (/\(kW\)/.test(cle)) return { min: 0, max: 2000, step: 10, unit: 'kW' };
  if (cle === 'Courbe de chauffe') return { min: 0.4, max: 3, step: 0.1, unit: '' };
  if (/Nb /.test(cle) || cle === 'Nb') return { min: 0, max: 50, step: 1, unit: '' };
  return null;
}

/** Sélecteur numérique +/-, avec appui long pour avancer plus vite. */
const StepperNumerique = React.memo(function StepperNumerique({ valeur, config, onChange }) {
  const num = parseFloat(valeur);
  const val = isNaN(num) ? 0 : num;

  const arrondir = (n) => Math.round(n / config.step) * config.step * 10 / 10;

  const dec = () => onChange(String(Math.max(config.min, arrondir(val - config.step))));
  const inc = () => onChange(String(Math.min(config.max, arrondir(val + config.step))));

  return (
    <View style={styles.stepperRow}>
      <TouchableOpacity style={styles.stepperBtn} onPress={dec}>
        <Text style={styles.stepperBtnText}>−</Text>
      </TouchableOpacity>
      <View style={styles.stepperValBox}>
        <Text style={styles.stepperValText}>{valeur || '—'}{config.unit ? ` ${config.unit}` : ''}</Text>
      </View>
      <TouchableOpacity style={styles.stepperBtn} onPress={inc}>
        <Text style={styles.stepperBtnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
});

/** Sélecteur par chips, avec "+ Autre" pour taper une valeur non prévue. */
const ChipSelector = React.memo(function ChipSelector({ valeur, options, onChange }) {
  const [modeLibre, setModeLibre] = useState(false);
  const [texteLibre, setTexteLibre] = useState(valeur && !options.includes(valeur) ? valeur : '');
  const estValeurLibre = valeur && !options.includes(valeur);

  if (modeLibre || estValeurLibre) {
    return (
      <TextInput
        style={styles.input}
        value={texteLibre || valeur}
        onChangeText={setTexteLibre}
        onBlur={() => onChange(texteLibre)}
        placeholder="Saisir la valeur..."
        autoFocus={modeLibre}
      />
    );
  }
  return (
    <View style={styles.chipSelectRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          style={[styles.chipOpt, valeur === opt && styles.chipOptPicked]}
          onPress={() => onChange(opt)}
        >
          <Text style={[styles.chipOptText, valeur === opt && styles.chipOptTextPicked]}>{opt}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={[styles.chipOpt, styles.chipOptAddNew]} onPress={() => setModeLibre(true)}>
        <Text style={styles.chipOptAddNewText}>+ Autre</Text>
      </TouchableOpacity>
    </View>
  );
});

/** Un champ générique : molette si numérique, chips si liste connue, sinon texte libre. */
const ChampGenerique = React.memo(function ChampGenerique({ visiteId, sectionCode, field, valeurInitiale, onSaved }) {
  const [valeur, setValeur] = useState(valeurInitiale || '');
  const unit = extractUnit(field.cle);
  const label = cleanLabel(field.cle);
  const entiteKey = `${sectionCode}||${field.cle}`;

  const numericConfig = getNumericConfig(field.cle);
  const chipOptions = FIELD_OPTIONS[field.cle];

  const sauvegarder = async (nouvelleValeur) => {
    setValeur(nouvelleValeur);
    await upsertChamp(visiteId, sectionCode, field.cle, nouvelleValeur);
    onSaved && onSaved();
  };

  return (
    <View style={styles.fieldBlock}>
      <View style={styles.fieldTop}>
        <Text style={styles.fieldLabel}>{label}{unit && !numericConfig ? ` (${unit})` : ''}</Text>
        <PhotoButton visiteId={visiteId} entiteKey={entiteKey} label={label} />
      </View>

      {numericConfig ? (
        <StepperNumerique valeur={valeur} config={numericConfig} onChange={sauvegarder} />
      ) : chipOptions ? (
        <ChipSelector valeur={valeur} options={chipOptions} onChange={sauvegarder} />
      ) : (
        <TextInput
          style={styles.input}
          value={valeur}
          onChangeText={setValeur}
          onBlur={() => sauvegarder(valeur)}
          placeholder="Saisir..."
        />
      )}
    </View>
  );
});

const AVIS_OPTIONS = ['S', 'N.S', 'S.O', 'N.V'];

function avisChipColor(opt) {
  if (opt === 'S') return { bg: COLORS.greenBg, border: COLORS.green, text: COLORS.green };
  if (opt === 'N.S') return { bg: COLORS.redBg, border: COLORS.red, text: COLORS.red };
  return { bg: COLORS.line, border: COLORS.inkFaint, text: COLORS.inkSoft };
}

/**
 * Un point de contrôle générique (Avis S/N.S/S.O/N.V). Si N.S est choisi et
 * qu'une préconisation existe pour cette clé, propose les critères réels
 * (bibliothèque de 142 préconisations) qui remplissent automatiquement une
 * réserve. Sinon, commentaire libre.
 */
const ControleGenerique = React.memo(function ControleGenerique({ visiteId, sectionCode, field, etatInitial, onSaved }) {
  const controleKey = `${sectionCode}||${field.cle}`;
  const [avis, setAvis] = useState(etatInitial?.avis || null);
  const [commentaire, setCommentaire] = useState(etatInitial?.commentaire || '');
  const [critereChoisi, setCritereChoisi] = useState(null);
  const [modeLibre, setModeLibre] = useState(false);

  const options = PRESCRIPTIONS[field.cle];

  const choisirAvis = async (val) => {
    setAvis(val);
    await upsertControle(visiteId, sectionCode, field.cle, { avis: val });
    if (val !== 'N.S') {
      await supprimerRemarqueParControle(visiteId, controleKey);
      setCritereChoisi(null);
      setModeLibre(false);
    }
    onSaved && onSaved();
  };

  const choisirCritere = async (opt, idx) => {
    setCritereChoisi(idx);
    setModeLibre(false);
    const origine = field.cle + (opt.critere ? ' — ' + opt.critere : '');
    await upsertControle(visiteId, sectionCode, field.cle, { commentaire: opt.prestation });
    await upsertRemarqueDepuisPrescription(visiteId, controleKey, opt, origine);
  };

  const validerCommentaireLibre = async () => {
    await upsertControle(visiteId, sectionCode, field.cle, { commentaire });
    if (commentaire.trim()) {
      await upsertRemarqueDepuisPrescription(
        visiteId, controleKey,
        { poste: 'Observation', prestation: commentaire, delai: null, estimatif: null },
        field.cle
      );
    } else {
      await supprimerRemarqueParControle(visiteId, controleKey);
    }
  };

  return (
    <View style={styles.controlRow}>
      <View style={styles.controlTop}>
        <Text style={styles.controlLabel}>{field.cle}</Text>
        <View style={styles.avisGroup}>
          {AVIS_OPTIONS.map((opt) => {
            const c = avisChipColor(opt);
            const selected = avis === opt;
            return (
              <TouchableOpacity
                key={opt}
                style={[styles.avisChip, selected && { backgroundColor: c.bg, borderColor: c.border }]}
                onPress={() => choisirAvis(opt)}
              >
                <Text style={[styles.avisChipText, selected && { color: c.text }]}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {avis === 'N.S' && (
        <View style={styles.criterePanel}>
          {options && options.length > 0 ? (
            <>
              <Text style={styles.criterePanelLabel}>Cause</Text>
              <View style={styles.critereChips}>
                {options.map((opt, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.critereChip, critereChoisi === idx && styles.critereChipPicked]}
                    onPress={() => choisirCritere(opt, idx)}
                  >
                    <Text style={[styles.critereChipText, critereChoisi === idx && styles.critereChipTextPicked]}>
                      {opt.critere || 'Non conforme'}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.critereChip, styles.critereChipCustom, modeLibre && styles.critereChipPicked]}
                  onPress={() => { setModeLibre(true); setCritereChoisi(null); }}
                >
                  <Text style={[styles.critereChipText, modeLibre && styles.critereChipTextPicked]}>Autre</Text>
                </TouchableOpacity>
              </View>
              {critereChoisi !== null && (
                <View style={styles.prestationResult}>
                  <Text style={styles.prestationTxt}>{options[critereChoisi].prestation}</Text>
                  <View style={styles.prestationMeta}>
                    <Text style={styles.prestationMetaTxt}>Poste : <Text style={styles.bold}>{options[critereChoisi].poste}</Text></Text>
                    <Text style={styles.prestationMetaTxt}>Délai : <Text style={styles.bold}>{options[critereChoisi].delai ? options[critereChoisi].delai + ' mois' : '—'}</Text></Text>
                    <Text style={styles.prestationMetaTxt}>Est. : <Text style={styles.bold}>{options[critereChoisi].estimatif ? Math.round(options[critereChoisi].estimatif) + ' €HT' : '—'}</Text></Text>
                  </View>
                </View>
              )}
            </>
          ) : null}

          {(modeLibre || !options || options.length === 0) && (
            <TextInput
              style={[styles.input, { marginTop: 8, height: 60 }]}
              placeholder="Décrivez le problème constaté..."
              multiline
              value={commentaire}
              onChangeText={setCommentaire}
              onBlur={validerCommentaireLibre}
            />
          )}

          <PhotoButton
            visiteId={visiteId}
            entiteKey={controleKey}
            label={field.cle}
            style={styles.photoRequiredBox}
          />
        </View>
      )}
    </View>
  );
});


export { extractUnit, cleanLabel, getNumericConfig, StepperNumerique, ChipSelector, ChampGenerique, ControleGenerique, AVIS_OPTIONS };
