import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

const activeFlushers = new Set();
let appStateSubscription = null;

function ensureAppStateFlushListener() {
  if (appStateSubscription || !AppState?.addEventListener) return;
  appStateSubscription = AppState.addEventListener('change', (nextState) => {
    if (nextState !== 'inactive' && nextState !== 'background') return;
    for (const flush of [...activeFlushers]) {
      try { Promise.resolve(flush()).catch(() => {}); } catch {}
    }
  });
}

function registerFlusher(flush) {
  activeFlushers.add(flush);
  ensureAppStateFlushListener();
  return () => {
    activeFlushers.delete(flush);
    if (!activeFlushers.size && appStateSubscription) {
      appStateSubscription.remove?.();
      appStateSubscription = null;
    }
  };
}

export async function flushDurableAutosaves() {
  await Promise.allSettled([...activeFlushers].map((flush) => Promise.resolve().then(flush)));
}

/**
 * Autosauvegarde conçue pour le terrain :
 * - saisie instantanée en mémoire pour ne jamais ralentir le clavier ;
 * - écriture SQLite temporisée pour éviter une écriture par caractère ;
 * - file d'écriture sérialisée pour ne pas réordonner deux sauvegardes ;
 * - flush sur blur, démontage et passage de l'application en arrière-plan ;
 * - une valeur externe ne peut pas écraser un brouillon local encore non persisté.
 */
export function useDurableAutosave(valeurInitiale, sauvegarder, delai = 350) {
  const initiale = valeurInitiale == null ? '' : String(valeurInitiale);
  const [valeur, setValeurState] = useState(initiale);
  const valeurRef = useRef(initiale);
  const persisteeRef = useRef(initiale);
  const timerRef = useRef(null);
  const saveRef = useRef(sauvegarder);
  const queueRef = useRef(Promise.resolve());

  useEffect(() => { saveRef.current = sauvegarder; }, [sauvegarder]);

  useEffect(() => {
    const prochaine = valeurInitiale == null ? '' : String(valeurInitiale);
    // Si l'UI possède un brouillon plus récent que SQLite, on ne le remplace
    // jamais par une valeur de parent/cache qui arrive avec retard.
    if (valeurRef.current !== persisteeRef.current) {
      if (prochaine === valeurRef.current) setValeurState(prochaine);
      return;
    }
    valeurRef.current = prochaine;
    persisteeRef.current = prochaine;
    setValeurState(prochaine);
  }, [valeurInitiale]);

  const executerSauvegarde = useCallback((force = false) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const run = async () => {
      const courante = valeurRef.current;
      if (!force && courante === persisteeRef.current) return;
      await saveRef.current?.(courante);
      persisteeRef.current = courante;
    };

    // Les écritures d'un même champ restent strictement dans l'ordre.
    queueRef.current = queueRef.current.catch(() => {}).then(run);
    return queueRef.current;
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

  // À utiliser lorsqu'une action métier vient elle-même de persister la valeur
  // (preset, changement S/N.S, etc.). Cela annule le debounce devenu inutile
  // sans déclencher une seconde sauvegarde susceptible de modifier la sémantique.
  const adopterValeurPersistee = useCallback((prochaine) => {
    const texte = prochaine == null ? '' : String(prochaine);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    valeurRef.current = texte;
    persisteeRef.current = texte;
    setValeurState(texte);
  }, []);

  useEffect(() => registerFlusher(flush), [flush]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (valeurRef.current !== persisteeRef.current) {
      // React ne peut pas attendre un cleanup asynchrone, mais l'écriture est
      // mise en file immédiatement. Le listener AppState couvre aussi le cas
      // où l'utilisateur quitte METRA avant le blur.
      executerSauvegarde().catch(() => {});
    }
  }, [executerSauvegarde]);

  return [valeur, setValeur, flush, setImmediate, adopterValeurPersistee];
}
