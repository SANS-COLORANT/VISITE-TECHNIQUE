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
/** Arrondit proprement selon le nombre de décimales du pas, sans dérive flottante. */
function arrondirSelonPas(valeur, step) {
  const decimales = (String(step).split('.')[1] || '').length;
  return parseFloat(valeur.toFixed(decimales));
}

/**
 * Molette numérique : boutons +/- pour aller vite, et tap sur la valeur
 * pour la taper directement au clavier (les deux méthodes cohabitent).
 */
const StepperNumerique = React.memo(function StepperNumerique({ valeur, config, onChange }) {
  const [modeLibre, setModeLibre] = useState(false);
  const [texteLibre, setTexteLibre] = useState(valeur || '');
  const num = parseFloat(valeur);
  const val = isNaN(num) ? 0 : num;

  const dec = () => onChange(String(Math.max(config.min, arrondirSelonPas(val - config.step, config.step))));
  const inc = () => onChange(String(Math.min(config.max, arrondirSelonPas(val + config.step, config.step))));

  const validerLibre = () => {
    let n = parseFloat(texteLibre.replace(',', '.'));
    if (!isNaN(n)) {
      n = Math.min(config.max, Math.max(config.min, n));
      onChange(String(arrondirSelonPas(n, config.step)));
    }
    setModeLibre(false);
  };

  if (modeLibre) {
    return (
      <View style={styles.stepperRow}>
        <TextInput
          style={styles.stepperInputLibre}
          value={texteLibre}
          onChangeText={setTexteLibre}
          onBlur={validerLibre}
          onSubmitEditing={validerLibre}
          keyboardType="numeric"
          autoFocus
        />
      </View>
    );
  }

  return (
    <View style={styles.stepperRow}>
      <TouchableOpacity style={styles.stepperBtn} onPress={dec}>
        <Text style={styles.stepperBtnText}>−</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.stepperValBox}
        onPress={() => { setTexteLibre(valeur || ''); setModeLibre(true); }}
      >
        <Text style={styles.stepperValText}>{valeur || '—'}{config.unit ? ` ${config.unit}` : ''}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.stepperBtn} onPress={inc}>
        <Text style={styles.stepperBtnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
});

/**
 * Sélecteur par chips : tap pour choisir, tap sur la chip déjà choisie pour
 * la désélectionner (retour à "aucun choix"), glissement horizontal (swipe)
 * pour naviguer d'une option à l'autre sans avoir à taper sur chacune, et
 * "+ Autre" pour une valeur non prévue.
 */
const ChipSelector = React.memo(function ChipSelector({ valeur, options, onChange }) {
  const [modeLibre, setModeLibre] = useState(false);
  const [texteLibre, setTexteLibre] = useState(valeur && !options.includes(valeur) ? valeur : '');
  const estValeurLibre = valeur && !options.includes(valeur);

  const choisir = (opt) => {
    onChange(valeur === opt ? '' : opt); // toggle : recliquer désélectionne
  };

  const naviguer = (direction) => {
    const idxActuel = options.indexOf(valeur);
    let next;
    if (idxActuel === -1) next = direction > 0 ? 0 : options.length - 1;
    else next = (idxActuel + direction + options.length) % options.length;
    onChange(options[next]);
  };

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
    <View style={styles.chipRowWithArrows}>
      <TouchableOpacity style={styles.chipArrowBtn} onPress={() => naviguer(-1)}>
        <Text style={styles.chipArrowBtnText}>‹</Text>
      </TouchableOpacity>
      <View style={styles.chipSelectRow}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.chipOpt, valeur === opt && styles.chipOptPicked]}
            onPress={() => choisir(opt)}
          >
            <Text style={[styles.chipOptText, valeur === opt && styles.chipOptTextPicked]}>{opt}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.chipOpt, styles.chipOptAddNew]} onPress={() => setModeLibre(true)}>
          <Text style={styles.chipOptAddNewText}>+ Autre</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.chipArrowBtn} onPress={() => naviguer(1)}>
        <Text style={styles.chipArrowBtnText}>›</Text>
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
  // Pas de photo sur l'en-tête (Nom client/site/local, date) ni sur les
  // informations générales basiques (adresse, nb bât...) — rien à
  // photographier de pertinent sur ces champs purement administratifs.
  const sansPhoto = sectionCode === 'infos.g_n_ral' || sectionCode === 'infos.informations_g_n_rales';

  const sauvegarder = async (nouvelleValeur) => {
    setValeur(nouvelleValeur);
    await upsertChamp(visiteId, sectionCode, field.cle, nouvelleValeur);
    onSaved && onSaved();
  };

  return (
    <View style={styles.fieldBlock}>
      <View style={styles.fieldTop}>
        <Text style={styles.fieldLabel}>{label}{unit && !numericConfig ? ` (${unit})` : ''}</Text>
        {!sansPhoto && <PhotoButton visiteId={visiteId} entiteKey={entiteKey} label={label} />}
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


/**
 * Champ avec autocomplétion : tape et des suggestions filtrées apparaissent
 * en dessous ; on peut cliquer une suggestion ou continuer à taper librement
 * (aucune sélection n'est obligatoire, contrairement à ChipSelector).
 */
const TypeAheadInput = React.memo(function TypeAheadInput({ valeur, options, placeholder, onChange }) {
  const [texte, setTexte] = useState(valeur || '');
  const [focus, setFocus] = useState(false);
  const blurTimer = React.useRef(null);

  const suggestions = texte.trim()
    ? options.filter((o) => o.toLowerCase().includes(texte.trim().toLowerCase())).slice(0, 6)
    : options.slice(0, 6);

  const choisir = (s) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setTexte(s);
    onChange(s);
    setFocus(false);
  };

  // Le onBlur du champ se déclenche AVANT le tap sur une suggestion (bug
  // classique React Native). On retarde donc la fermeture de la liste de
  // 200ms, le temps que le tap sur la suggestion ait le temps d'arriver.
  const surBlur = () => {
    onChange(texte);
    blurTimer.current = setTimeout(() => setFocus(false), 200);
  };

  // Flèches ‹ › pour naviguer dans la liste complète des options sans avoir
  // à taper sur chacune (le geste de glissement s'est avéré peu fiable ici
  // à cause des boutons de suggestion en dessous — les flèches marchent à
  // coup sûr).
  const naviguer = (direction) => {
    const idx = options.indexOf(texte);
    let next;
    if (idx === -1) next = direction > 0 ? 0 : options.length - 1;
    else next = (idx + direction + options.length) % options.length;
    choisir(options[next]);
  };

  return (
    <View>
      <View style={styles.typeaheadRow}>
        <TouchableOpacity style={styles.chipArrowBtn} onPress={() => naviguer(-1)}>
          <Text style={styles.chipArrowBtnText}>‹</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={texte}
          onChangeText={setTexte}
          onFocus={() => setFocus(true)}
          onBlur={surBlur}
          placeholder={placeholder}
        />
        <TouchableOpacity style={styles.chipArrowBtn} onPress={() => naviguer(1)}>
          <Text style={styles.chipArrowBtnText}>›</Text>
        </TouchableOpacity>
      </View>
      {focus && suggestions.length > 0 && (
        <View style={styles.typeaheadSuggestions}>
          {suggestions.map((s) => (
            <TouchableOpacity
              key={s}
              style={styles.typeaheadSuggestionRow}
              onPress={() => choisir(s)}
            >
              <Text style={styles.typeaheadSuggestionText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
});

/**
 * Sélecteur "Catégorie + Critère" pour créer une réserve : on choisit d'abord
 * un point de la trame (ex: "Adoucisseur - Filtre / Bypass") via
 * autocomplétion, puis un critère (Dégradé, Absent...) via chips — ce qui
 * pré-remplit nom/description/poste/délai/prix automatiquement, comme sur
 * un contrôle N.S. Tout reste éditable ensuite.
 */
const CategorieCritereSelector = React.memo(function CategorieCritereSelector({ onRempli }) {
  const [categorie, setCategorie] = useState('');
  const [critereIdx, setCritereIdx] = useState(null);
  const [modeNouveauCritere, setModeNouveauCritere] = useState(false);
  const [nouveauCritere, setNouveauCritere] = useState('');
  const categories = Object.keys(PRESCRIPTIONS).sort((a, b) => a.localeCompare(b));
  const options = PRESCRIPTIONS[categorie];

  const choisirCategorie = (val) => {
    setCategorie(val);
    setCritereIdx(null);
    setModeNouveauCritere(false);
    setNouveauCritere('');
  };

  const choisirCritere = (idx) => {
    setCritereIdx(idx);
    setModeNouveauCritere(false);
    const opt = options[idx];
    onRempli({
      nom: categorie + (opt.critere ? ' — ' + opt.critere : ''),
      description: opt.prestation,
      poste: opt.poste,
      delai: opt.delai,
      prix: opt.estimatif,
    });
  };

  const validerNouveauCritere = () => {
    setCritereIdx(null);
    onRempli({
      nom: categorie + (nouveauCritere.trim() ? ' — ' + nouveauCritere.trim() : ''),
      description: '',
      poste: null,
      delai: null,
      prix: null,
    });
  };

  return (
    <View>
      <Text style={styles.fieldLabel}>Catégorie</Text>
      <TypeAheadInput
        valeur={categorie}
        options={categories}
        placeholder="Ex: Adoucisseur - Filtre / Bypass..."
        onChange={choisirCategorie}
      />
      {!!categorie && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.fieldLabel}>Cause / critère</Text>
          <View style={styles.chipSelectRow}>
            {(options || []).map((opt, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.chipOpt, critereIdx === idx && styles.chipOptPicked]}
                onPress={() => choisirCritere(idx)}
              >
                <Text style={[styles.chipOptText, critereIdx === idx && styles.chipOptTextPicked]}>
                  {opt.critere || 'Non conforme'}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.chipOpt, styles.chipOptAddNew, modeNouveauCritere && styles.chipOptPicked]}
              onPress={() => setModeNouveauCritere(true)}
            >
              <Text style={[styles.chipOptAddNewText, modeNouveauCritere && styles.chipOptTextPicked]}>+ Nouveau critère</Text>
            </TouchableOpacity>
          </View>
          {modeNouveauCritere && (
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder="Ex: Dégradé, Bouché, Non conforme..."
              value={nouveauCritere}
              onChangeText={setNouveauCritere}
              onBlur={validerNouveauCritere}
              onSubmitEditing={validerNouveauCritere}
              autoFocus
            />
          )}
        </View>
      )}
    </View>
  );
});

export { extractUnit, cleanLabel, getNumericConfig, StepperNumerique, ChipSelector, TypeAheadInput, ChampGenerique, ControleGenerique, AVIS_OPTIONS, CategorieCritereSelector };
