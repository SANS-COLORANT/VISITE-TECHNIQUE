import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Autosauvegarde adaptée aux listes virtualisées.
 * - debounce pour éviter une écriture SQLite par caractère ;
 * - flush sur blur ;
 * - flush de la dernière valeur au démontage si elle n'a pas encore été écrite.
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
    sauveeRef.current = courante;
    return Promise.resolve(saveRef.current?.(courante)).catch((error) => {
      // Autorise une nouvelle tentative au prochain changement/blur si l'écriture échoue.
      sauveeRef.current = Symbol('save-failed');
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

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (valeurRef.current !== sauveeRef.current) {
      // Ne pas attendre ici : React ne sait pas attendre un cleanup asynchrone,
      // mais l'écriture SQLite est tout de même déclenchée avant destruction du hook.
      Promise.resolve(saveRef.current?.(valeurRef.current)).catch(() => {});
    }
  }, []);

  return [valeur, setValeur, flush, setImmediate];
}
