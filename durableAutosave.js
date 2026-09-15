import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Autosauvegarde adaptée aux listes virtualisées.
 * - debounce pour éviter une écriture SQLite par caractère ;
 * - flush sur blur ;
 * - flush de la dernière valeur au démontage si elle n'a pas encore été écrite ;
 * - resynchronisation locale sans réécriture quand un autre handler a déjà persisté la valeur ;
 * - une valeur renvoyée immédiatement par le parent ne marque jamais une saisie locale encore sale comme sauvegardée.
 *
 * La fonction de sauvegarde est toujours appelée avec la valeur la plus récente,
 * même si la cellule FlatList est démontée pendant un défilement rapide.
 */
export function useDurableAutosave(valeurInitiale, sauvegarder, delai = 500) {
  const initiale = valeurInitiale == null ? '' : String(valeurInitiale);
  const [valeur, setValeurState] = useState(initiale);
  const valeurRef = useRef(initiale);
  const sauveeRef = useRef(initiale);
  const timerRef = useRef(null);
  const saveRef = useRef(sauvegarder);

  useEffect(() => { saveRef.current = sauvegarder; }, [sauvegarder]);

  useEffect(() => {
    const prochaine = valeurInitiale == null ? '' : String(valeurInitiale);
    // Cas fréquent : le parent reflète immédiatement la valeur que l'utilisateur
    // vient de saisir. Ne surtout pas la considérer comme déjà persistée, sinon le
    // debounce serait neutralisé avant l'écriture SQLite.
    if (prochaine === valeurRef.current) return;
    // Si une saisie locale attend encore sa sauvegarde, elle reste prioritaire sur
    // une valeur externe plus ancienne reçue pendant une virtualisation/re-render.
    if (valeurRef.current !== sauveeRef.current) return;
    valeurRef.current = prochaine;
    sauveeRef.current = prochaine;
    setValeurState(prochaine);
  }, [valeurInitiale]);

  const executerSauvegarde = useCallback((force = false) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const courante = valeurRef.current;
    if (!force && courante === sauveeRef.current) return Promise.resolve();
    const precedenteSauvee = sauveeRef.current;
    sauveeRef.current = courante;
    return Promise.resolve(saveRef.current?.(courante)).catch((error) => {
      // Réouvre l'état sale pour permettre une nouvelle tentative au prochain
      // changement, blur ou démontage.
      sauveeRef.current = precedenteSauvee;
      throw error;
    });
  }, []);

  const setValeur = useCallback((prochaine) => {
    const texte = prochaine == null ? '' : String(prochaine);
    valeurRef.current = texte;
    setValeurState(texte);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      executerSauvegarde().catch(() => {});
    }, delai);
  }, [delai, executerSauvegarde]);

  const flush = useCallback(() => executerSauvegarde(), [executerSauvegarde]);

  const setImmediate = useCallback((prochaine) => {
    const texte = prochaine == null ? '' : String(prochaine);
    valeurRef.current = texte;
    setValeurState(texte);
    return executerSauvegarde(true);
  }, [executerSauvegarde]);

  const replacePersisted = useCallback((prochaine) => {
    const texte = prochaine == null ? '' : String(prochaine);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    valeurRef.current = texte;
    sauveeRef.current = texte;
    setValeurState(texte);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (valeurRef.current !== sauveeRef.current) {
      // React n'attend pas un cleanup asynchrone, mais l'écriture est déclenchée
      // avant destruction de la cellule virtualisée.
      Promise.resolve(saveRef.current?.(valeurRef.current)).catch(() => {});
    }
  }, []);

  return [valeur, setValeur, flush, setImmediate, replacePersisted];
}
