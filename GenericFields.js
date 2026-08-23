/** Champs génériques : molette numérique, chips de sélection, contrôle Avis. */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { COLORS, styles } from './styles.js';
import { PRESCRIPTIONS } from './data.js';
import { fusionnerPrescriptions } from './reserveExtensions.js';
import { upsertChamp, listerBibliothequeReserves } from './db.js';
import { upsertControlePartiel } from './controlDb.js';
import {
  upsertRemarquePrescription,
  supprimerRemarqueControle,
  modifierRemarqueVisite,
} from './remarkDb.js';
import { PhotoButton } from './PhotoButton.js';

const PRESCRIPTIONS_COMPLETES = fusionnerPrescriptions(PRESCRIPTIONS);

// ============================================================================
// 4. COMPOSANTS GÉNÉRIQUES — champ texte / contrôle de conformité
// ============================================================================

function useSaisieAvecAutoSave(valeurInitiale, sauvegarderFn, delai = 700) {
  const [valeur, setValeurBrut] = useState(valeurInitiale || '');
  const timerRef = useRef(null);

  useEffect(() => {
    setValeurBrut(valeurInitiale || '');
  }, [valeurInitiale]);

  const setValeur = (t) => {
    setValeurBrut(t);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => sauvegarderFn(t), delai);
  };
  const surBlurFinal = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    sauvegarderFn(valeur);
  };
  const setValeurImmediate = (t) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setValeurBrut(t);
    sauvegarderFn(t);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return [valeur, setValeur, surBlurFinal, setValeurImmediate];
}

function extractUnit(cle) {
  const m = cle.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : null;
}
function cleanLabel(cle) {
  return cle.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

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

function arrondirSelonPas(valeur, step) {
  const decimales = (String(step).split('.')[1] || '').length;
  return parseFloat(valeur.toFixed(decimales));
}

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
      <TouchableOpacity style={styles.stepperValBox} onPress={() => { setTexteLibre(valeur || ''); setModeLibre(true); }}>
        <Text style={styles.stepperValText}>{valeur || '—'}{config.unit ? ` ${config.unit}` : ''}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.stepperBtn} onPress={inc}>
        <Text style={styles.stepperBtnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
});

const ChipSelector = React.memo(function ChipSelector({ valeur, options, onChange }) {
  const [modeLibre, setModeLibre] = useState(false);
  const [texteLibre, setTexteLibre] = useState(valeur && !options.includes(valeur) ? valeur : '');
  const estValeurLibre = valeur && !options.includes(valeur);

  const choisir = (opt) => onChange(valeur === opt ? '' : opt);
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
      <TouchableOpacity style={styles.chipArrowBtn} onPress={() => naviguer(-1)}><Text style={styles.chipArrowBtnText}>‹</Text></TouchableOpacity>
      <View style={styles.chipSelectRow}>
        {options.map((opt) => (
          <TouchableOpacity key={opt} style={[styles.chipOpt, valeur === opt && styles.chipOptPicked]} onPress={() => choisir(opt)}>
            <Text style={[styles.chipOptText, valeur === opt && styles.chipOptTextPicked]}>{opt}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.chipOpt, styles.chipOptAddNew]} onPress={() => setModeLibre(true)}>
          <Text style={styles.chipOptAddNewText}>+ Autre</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.chipArrowBtn} onPress={() => naviguer(1)}><Text style={styles.chipArrowBtnText}>›</Text></TouchableOpacity>
    </View>
  );
});

const ChampGenerique = React.memo(function ChampGenerique({ visiteId, sectionCode, field, valeurInitiale, onSaved }) {
  const unit = extractUnit(field.cle);
  const label = cleanLabel(field.cle);
  const entiteKey = `${sectionCode}||${field.cle}`;
  const numericConfig = getNumericConfig(field.cle);
  const chipOptions = FIELD_OPTIONS[field.cle];
  const sansPhoto = sectionCode === 'infos.g_n_ral' || sectionCode === 'infos.informations_g_n_rales';

  const sauvegarderEnBase = async (nouvelleValeur) => {
    await upsertChamp(visiteId, sectionCode, field.cle, nouvelleValeur);
    onSaved && onSaved();
  };
  const [valeur, setValeur, surBlur, setValeurImmediate] = useSaisieAvecAutoSave(valeurInitiale, sauvegarderEnBase);

  return (
    <View style={styles.fieldBlock}>
      <View style={styles.fieldTop}>
        <Text style={styles.fieldLabel}>{label}{unit && !numericConfig ? ` (${unit})` : ''}</Text>
        {!sansPhoto && <PhotoButton visiteId={visiteId} entiteKey={entiteKey} label={label} />}
      </View>
      {numericConfig ? (
        <StepperNumerique valeur={valeur} config={numericConfig} onChange={setValeurImmediate} />
      ) : chipOptions ? (
        <ChipSelector valeur={valeur} options={chipOptions} onChange={setValeurImmediate} />
      ) : (
        <TextInput style={styles.input} value={valeur} onChangeText={setValeur} onBlur={surBlur} placeholder="Saisir..." />
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

const CATEGORIE_SECTION_MAP = {
  // Conf. Local
  'conf-local.evacuations_des_eu_du_local||Type': 'Evacuations des EU - Type',
  'conf-local.evacuations_des_eu_du_local||Etat': 'Evacuations des EU - Etat',
  'conf-local.evacuations_des_eu_du_local||Traitement des condensats': 'Evacuations des EU - Condensats',
  'conf-local.evacuations_des_eu_du_local||Caillebotis': 'Evacuations des EU - Caillebotis',

  // Conf. Énergie
  'conf-energie.coupure_ext_rieure_combustible||Présence à chaque accès': 'Coupure combustible - Présence',
  'conf-energie.coupure_ext_rieure_combustible||Type (2 électrovannes minimum)': 'Coupure combustible - Type',
  'conf-energie.coupure_ext_rieure_combustible||Coffret': 'Coupure combustible - Coffret',
  'conf-energie.coupure_ext_rieure_combustible||Verre dormant': 'Coupure combustible - Verre dormant',
  'conf-energie.coupure_ext_rieure_combustible||Signalétique "Coupure combustible extérieure"': 'Coupure combustible - Signalétique',
  'conf-energie.coupure_ext_rieure_lectrique||Présence à chaque accès': 'Coupure électrique - Présence',
  'conf-energie.coupure_ext_rieure_lectrique||Coffret': 'Coupure électrique - Coffret',
  'conf-energie.coupure_ext_rieure_lectrique||Verre dormant': 'Coupure électrique - Verre dormant',
  'conf-energie.coupure_ext_rieure_lectrique||Signalétique "Coupure électrique extérieure"': 'Coupure électrique - Signalétique',
  'conf-energie.coupure_ext_rieure_lectrique||Séparation Force/Lumière/Relevage': 'Coupure électrique - Séparation F/L/R',
  'conf-energie.coupure_ext_rieure_lectrique||Signalétique Force/Lumière/Relevage': 'Coupure électrique - Signalétique F/L/R',
  'conf-energie.armoire_lectrique||Schéma électrique': 'Armoire - Schéma électrique',
  'conf-energie.armoire_lectrique||Câblage': 'Armoire - Câblage',
  'conf-energie.armoire_lectrique||Protection': 'Armoire - Protection',
  'conf-energie.armoire_lectrique||Espace libre suffisant (≥ 30 %)': 'Armoire - Espace libre',
  'conf-energie.armoire_lectrique||Eclairage': 'Armoire - Eclairage',
  'conf-energie.armoire_lectrique||Prise 220V protégée 30 mA': 'Armoire - Prise',
  'conf-energie.baes||Présence': 'BAES - Presence',
  'conf-energie.baes||Visible partout': 'BAES - Visibilité',
  'conf-energie.baes||Signalétique': 'BAES - Signalétique',
  'conf-energie.baes||Veilleuse': 'BAES - Veilleuse',
};

function getCategorieKey(cle, sectionCode) {
  const mappee = CATEGORIE_SECTION_MAP[`${sectionCode}||${cle}`];
  if (mappee) return mappee;
  if (sectionCode && sectionCode.startsWith('conf-chauffage.')) return 'Chauffage - ' + cle;
  if (sectionCode && sectionCode.startsWith('conf-ecs.')) return 'ECS - ' + cle;
  if (sectionCode && sectionCode.startsWith('conf-adouc.')) return 'Adoucisseur - ' + cle;
  if (PRESCRIPTIONS_COMPLETES[cle]) return cle;
  return cle;
}

function resoudrePrescriptions(cle, sectionCode) {
  const categorie = getCategorieKey(cle, sectionCode);
  return PRESCRIPTIONS_COMPLETES[categorie] || PRESCRIPTIONS_COMPLETES[cle] || null;
}

async function chargerCriteresPersonnalises(categorieKey) {
  const biblio = await listerBibliothequeReserves();
  return biblio
    .filter((item) => item.nom === categorieKey || item.nom.startsWith(categorieKey + ' — '))
    .map((item) => ({
      critere: item.nom.startsWith(categorieKey + ' — ') ? item.nom.slice(categorieKey.length + 3) : null,
      poste: item.poste,
      prestation: item.description,
      delai: item.delai,
      estimatif: item.prix,
    }));
}

function EditionReserveSelectionnee({ remarqueId, option, onSaved }) {
  const [prestation, setPrestation, blurPrestation] = useSaisieAvecAutoSave(
    option?.prestation || '',
    async (v) => { if (remarqueId) await modifierRemarqueVisite(remarqueId, { prestation: v }); onSaved && onSaved(); }
  );
  const [poste, setPoste, blurPoste] = useSaisieAvecAutoSave(
    option?.poste || '',
    async (v) => { if (remarqueId) await modifierRemarqueVisite(remarqueId, { poste: v }); onSaved && onSaved(); }
  );
  const [prix, setPrix, blurPrix] = useSaisieAvecAutoSave(
    option?.estimatif == null ? '' : String(option.estimatif),
    async (v) => { if (remarqueId) await modifierRemarqueVisite(remarqueId, { estimatif: v }); onSaved && onSaved(); }
  );
  const [delai, setDelai, blurDelai] = useSaisieAvecAutoSave(
    option?.delai == null ? '' : String(option.delai),
    async (v) => { if (remarqueId) await modifierRemarqueVisite(remarqueId, { delai: v }); onSaved && onSaved(); }
  );

  useEffect(() => {
    setPrestation(option?.prestation || '');
    setPoste(option?.poste || '');
    setPrix(option?.estimatif == null ? '' : String(option.estimatif));
    setDelai(option?.delai == null ? '' : String(option.delai));
  }, [remarqueId]);

  if (!remarqueId || !option) return null;
  return (
    <View style={[styles.prestationResult, { gap: 8 }]}>
      <Text style={styles.criterePanelLabel}>Réserve de cette visite — modifiable</Text>
      <TextInput
        style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
        multiline
        value={prestation}
        onChangeText={setPrestation}
        onBlur={blurPrestation}
        placeholder="Prestation / réserve"
      />
      <TextInput style={styles.input} value={poste} onChangeText={setPoste} onBlur={blurPoste} placeholder="Poste" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={prix}
          onChangeText={setPrix}
          onBlur={blurPrix}
          placeholder="Prix HT (€)"
          keyboardType="numeric"
        />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={delai}
          onChangeText={setDelai}
          onBlur={blurDelai}
          placeholder="Délai (mois)"
          keyboardType="numeric"
        />
      </View>
      <Text style={styles.importHint}>Ces modifications ne changent pas la bibliothèque.</Text>
    </View>
  );
}

const ControleGenerique = React.memo(function ControleGenerique({ visiteId, sectionCode, field, etatInitial, onSaved }) {
  const controleKey = `${sectionCode}||${field.cle}`;
  const [avis, setAvis] = useState(etatInitial?.avis || null);
  const [commentaire, setCommentaire] = useState(etatInitial?.commentaire || '');
  const [critereChoisi, setCritereChoisi] = useState(null);
  const [remarqueId, setRemarqueId] = useState(null);
  const [modeLibre, setModeLibre] = useState(false);
  const [options, setOptions] = useState(() => resoudrePrescriptions(field.cle, sectionCode) || []);
  const categorieKey = getCategorieKey(field.cle, sectionCode);

  useEffect(() => {
    setAvis(etatInitial?.avis || null);
    setCommentaire(etatInitial?.commentaire || '');
  }, [etatInitial?.avis, etatInitial?.commentaire]);

  useEffect(() => {
    let actif = true;
    const base = resoudrePrescriptions(field.cle, sectionCode) || [];
    setOptions(base);
    chargerCriteresPersonnalises(categorieKey).then((perso) => {
      if (!actif || perso.length === 0) return;
      const critieresBase = new Set(base.map((o) => (o.critere || '').trim().toLowerCase()));
      const persoInedits = perso.filter((o) => !critieresBase.has((o.critere || '').trim().toLowerCase()));
      if (persoInedits.length) setOptions([...base, ...persoInedits]);
    });
    return () => { actif = false; };
  }, [categorieKey, field.cle, sectionCode]);

  const choisirAvis = async (val) => {
    setAvis(val);
    await upsertControlePartiel(visiteId, sectionCode, field.cle, { avis: val });
    if (val !== 'N.S') {
      await supprimerRemarqueControle(visiteId, controleKey);
      setCritereChoisi(null);
      setRemarqueId(null);
      setModeLibre(false);
    }
    onSaved && onSaved();
  };

  const choisirCritere = async (opt, idx) => {
    setCritereChoisi(idx);
    setModeLibre(false);
    setCommentaire(opt.prestation || '');
    const origine = categorieKey + (opt.critere ? ' — ' + opt.critere : '');
    await upsertControlePartiel(visiteId, sectionCode, field.cle, { commentaire: opt.prestation || '' });
    const id = await upsertRemarquePrescription(visiteId, controleKey, opt, origine);
    setRemarqueId(id);
    onSaved && onSaved();
  };

  const validerCommentaireLibre = async () => {
    await upsertControlePartiel(visiteId, sectionCode, field.cle, { commentaire });
    if (commentaire.trim()) {
      const id = await upsertRemarquePrescription(
        visiteId,
        controleKey,
        { poste: 'Observation', prestation: commentaire, delai: null, estimatif: null },
        field.cle
      );
      setRemarqueId(id);
    } else {
      await supprimerRemarqueControle(visiteId, controleKey);
      setRemarqueId(null);
    }
    onSaved && onSaved();
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
          {options.length > 0 ? (
            <>
              <Text style={styles.criterePanelLabel}>Cause</Text>
              <View style={styles.critereChips}>
                {options.map((opt, idx) => (
                  <TouchableOpacity
                    key={`${categorieKey}-${idx}-${opt.critere || 'nc'}`}
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
                  onPress={() => { setModeLibre(true); setCritereChoisi(null); setRemarqueId(null); }}
                >
                  <Text style={[styles.critereChipText, modeLibre && styles.critereChipTextPicked]}>Autre</Text>
                </TouchableOpacity>
              </View>
              {critereChoisi !== null && (
                <EditionReserveSelectionnee
                  key={`${controleKey}-${critereChoisi}-${remarqueId || 'new'}`}
                  remarqueId={remarqueId}
                  option={options[critereChoisi]}
                  onSaved={onSaved}
                />
              )}
            </>
          ) : null}

          {(modeLibre || options.length === 0) && (
            <TextInput
              style={[styles.input, { marginTop: 8, height: 60 }]}
              placeholder="Décrivez le problème constaté..."
              multiline
              value={commentaire}
              onChangeText={setCommentaire}
              onBlur={validerCommentaireLibre}
            />
          )}

          <PhotoButton visiteId={visiteId} entiteKey={controleKey} label={field.cle} style={styles.photoRequiredBox} />
        </View>
      )}
    </View>
  );
});

const TypeAheadInput = React.memo(function TypeAheadInput({ valeur, options, placeholder, onChange }) {
  const [texte, setTexte] = useState(valeur || '');
  const [focus, setFocus] = useState(false);
  const blurTimer = React.useRef(null);

  useEffect(() => { setTexte(valeur || ''); }, [valeur]);

  const suggestions = texte.trim()
    ? options.filter((o) => o.toLowerCase().includes(texte.trim().toLowerCase())).slice(0, 6)
    : options.slice(0, 6);

  const choisir = (s) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setTexte(s);
    onChange(s);
    setFocus(false);
  };

  const surBlur = () => {
    onChange(texte);
    blurTimer.current = setTimeout(() => setFocus(false), 200);
  };

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
        <TouchableOpacity style={styles.chipArrowBtn} onPress={() => naviguer(-1)}><Text style={styles.chipArrowBtnText}>‹</Text></TouchableOpacity>
        <TextInput style={[styles.input, { flex: 1 }]} value={texte} onChangeText={setTexte} onFocus={() => setFocus(true)} onBlur={surBlur} placeholder={placeholder} />
        <TouchableOpacity style={styles.chipArrowBtn} onPress={() => naviguer(1)}><Text style={styles.chipArrowBtnText}>›</Text></TouchableOpacity>
      </View>
      {focus && suggestions.length > 0 && (
        <View style={styles.typeaheadSuggestions}>
          {suggestions.map((s) => (
            <TouchableOpacity key={s} style={styles.typeaheadSuggestionRow} onPress={() => choisir(s)}>
              <Text style={styles.typeaheadSuggestionText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
});

const CategorieCritereSelector = React.memo(function CategorieCritereSelector({ onRempli }) {
  const [categorie, setCategorie] = useState('');
  const [critereIdx, setCritereIdx] = useState(null);
  const [modeNouveauCritere, setModeNouveauCritere] = useState(false);
  const [nouveauCritere, setNouveauCritere] = useState('');
  const categories = Object.keys(PRESCRIPTIONS_COMPLETES).sort((a, b) => a.localeCompare(b));
  const options = PRESCRIPTIONS_COMPLETES[categorie];

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
      description: '', poste: null, delai: null, prix: null,
    });
  };

  return (
    <View>
      <Text style={styles.fieldLabel}>Catégorie</Text>
      <TypeAheadInput valeur={categorie} options={categories} placeholder="Ex: Adoucisseur - Filtre / Bypass..." onChange={choisirCategorie} />
      {!!categorie && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.fieldLabel}>Cause / critère</Text>
          <View style={styles.chipSelectRow}>
            {(options || []).map((opt, idx) => (
              <TouchableOpacity key={idx} style={[styles.chipOpt, critereIdx === idx && styles.chipOptPicked]} onPress={() => choisirCritere(idx)}>
                <Text style={[styles.chipOptText, critereIdx === idx && styles.chipOptTextPicked]}>{opt.critere || 'Non conforme'}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.chipOpt, styles.chipOptAddNew, modeNouveauCritere && styles.chipOptPicked]} onPress={() => setModeNouveauCritere(true)}>
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

export { extractUnit, cleanLabel, getNumericConfig, StepperNumerique, ChipSelector, TypeAheadInput, ChampGenerique, ControleGenerique, AVIS_OPTIONS, CategorieCritereSelector, useSaisieAvecAutoSave };
