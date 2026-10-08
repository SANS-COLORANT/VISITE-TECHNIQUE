/**
 * Tuiles de mesure des onglets Relevés et Régulation (refonte build 661,
 * docs/refonte-visite-661/README.md §5.3–5.4).
 *
 * - ChampMesureTile : champ numérique de la trame (pression, température,
 *   pH, T°ext…) en tuile − / + ; même stockage qu'avant (champs_visite,
 *   section et clé inchangées, point décimal comme l'ancien stepper).
 * - ExtraMeasurementCard : point de mesure complémentaire de la visite
 *   (table points_mesure_visite, annexe « mesures complémentaires » de
 *   l'Excel), renommable et retirable avec confirmation.
 */
import React, { memo, useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { getDb, upsertChamp } from './db.js';
import { getNumericConfig } from './GenericFields.js';
import { useDurableAutosave } from './durableAutosave.js';
import { modifierPointMesureVisite } from './terrainVisitDb.js';
import { LecturePhotoButton } from './PhotoOcrReview.js';
import { ValueTile, confirmer, KIT } from './VisitKit.js';
import { CvcIcon } from './MetraCvcIcons.js';

/** Valeur stockée (point décimal) -> affichage (virgule). */
export function versAffichage(v) { return v == null ? '' : String(v).replace('.', ','); }
/** Saisie (virgule ou point) -> stockage (point, comme l'ancien stepper). */
export function versStockage(v) { return String(v ?? '').replace(',', '.'); }
/** Nombre d'une valeur de mesure, ou null si vide / illisible. */
export function nombreMesure(v) {
  const t = String(v ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
/** Retire une saisie inachevée (« 1. », « - ») avant écriture. */
function saisieComplete(v) {
  const t = String(v ?? '').trim().replace(/[.,]$/, '');
  return t === '-' ? '' : t;
}

function PhotoFooter({ children }) {
  return <View style={s.footer}>{children}</View>;
}

/** Champ numérique de la trame en tuile. `start` = valeur du premier appui. */
export const ChampMesureTile = memo(function ChampMesureTile({
  visiteId, sectionCode, field, valeurInitiale, label, onRenameLabel, start, onLive, onSaved, photo = true, water, picto,
}) {
  const cfg = getNumericConfig(field.cle) || { min: -Infinity, max: Infinity, step: 1, unit: '' };
  const key = `${sectionCode}||${field.cle}`;
  const sauvegarder = useCallback(async (v) => {
    const propre = saisieComplete(v);
    await upsertChamp(visiteId, sectionCode, field.cle, propre);
    onSaved?.(propre);
  }, [visiteId, sectionCode, field.cle, onSaved]);
  const [valeur, setValeur, , setImmediate] = useDurableAutosave(valeurInitiale, sauvegarder, 450);
  const changer = useCallback((txt) => {
    const v = versStockage(txt);
    setValeur(v);
    onLive?.(key, v);
  }, [setValeur, onLive, key]);
  const footer = photo ? (
    <PhotoFooter>
      <LecturePhotoButton visiteId={visiteId} entiteKey={key} label={label} kind="temperatures" unit={cfg.unit} current={{ valeur }}
        onApply={async (values) => {
          if (nombreMesure(values.valeur) == null) throw new Error('Vérifie la valeur numérique.');
          const v = versStockage(values.valeur);
          await setImmediate(v);
          onLive?.(key, v);
        }} />
    </PhotoFooter>
  ) : null;
  return (
    <ValueTile label={label} value={versAffichage(valeur)} onChange={changer} unit={cfg.unit} step={cfg.step} min={cfg.min} max={cfg.max}
      start={start} water={water} onRenameLabel={onRenameLabel} picto={picto} footer={footer} />
  );
});

/** Suppression d'un point de mesure complémentaire de cette visite. */
export async function retirerPointMesure(visiteId, id) {
  await (await getDb()).runAsync('DELETE FROM points_mesure_visite WHERE id=? AND visite_id=?', [id, visiteId]);
}

function configPoint(unite) {
  if (unite === 'bar') return { step: 0.1, min: 0, max: Infinity, unit: 'bar' };
  if (unite === 'pH') return { step: 0.1, min: 0, max: 14, unit: '' };
  return { step: 1, min: -Infinity, max: Infinity, unit: unite || '' };
}

/**
 * Point de mesure complémentaire en tuile. `displayName` / `onRename`
 * permettent au panneau d'afficher un nom sans le préfixe de groupe
 * (« Chauffage · Départ 2 » s'affiche « Départ 2 »).
 */
export function ExtraMeasurementCard({ point, visiteId, displayName, onRename, onRemove, start, water }) {
  const cfg = configPoint(point.unite);
  const [nom, setNom] = useState(displayName ?? point.libelle);
  useEffect(() => { setNom(displayName ?? point.libelle); }, [displayName, point.libelle]);
  const [value, setValue, , setImmediate] = useDurableAutosave(point.valeur, (v) => modifierPointMesureVisite(visiteId, point.id, 'valeur', saisieComplete(v)));
  const renommer = async (v) => {
    const ancien = nom;
    setNom(v);
    try {
      if (onRename) await onRename(v);
      else await modifierPointMesureVisite(visiteId, point.id, 'libelle', v);
    } catch (e) {
      setNom(ancien);
      Alert.alert('Renommage impossible', String(e?.message || e));
    }
  };
  const retirer = () => confirmer({
    title: 'Retirer cette mesure ?',
    message: `« ${nom} » sera retirée de cette visite et de l’annexe du rapport.`,
    label: 'Retirer',
    onConfirm: async () => {
      try { await retirerPointMesure(visiteId, point.id); onRemove?.(point.id); }
      catch (e) { Alert.alert('Suppression impossible', String(e?.message || e)); }
    },
  });
  return (
    <ValueTile label={nom} onRenameLabel={renommer} value={versAffichage(value)} onChange={(t) => setValue(versStockage(t))}
      unit={cfg.unit} step={cfg.step} min={cfg.min} max={cfg.max} start={start} water={water}
      footer={(
        <PhotoFooter>
          <TouchableOpacity accessibilityLabel={`Retirer ${nom}`} onPress={retirer} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={s.remove}>
            <CvcIcon name="trash" size={17} color={KIT.red} strokeWidth={2} />
          </TouchableOpacity>
          <LecturePhotoButton visiteId={visiteId} entiteKey={`mesure||${point.id}`} label={nom} kind="temperatures" unit={point.unite} current={{ valeur: value }}
            onApply={async (v) => { if (nombreMesure(v.valeur) == null) throw new Error('Vérifie la valeur numérique.'); await setImmediate(versStockage(v.valeur)); }} />
        </PhotoFooter>
      )} />
  );
}

const s = StyleSheet.create({
  footer: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 6 },
  remove: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: KIT.redBg },
});
