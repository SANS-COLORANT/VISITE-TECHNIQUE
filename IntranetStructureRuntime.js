import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { processStructureOutbox } from './intranetStructureDb.js';

/**
 * Rejoue les créations site/local dès que l'application redevient active puis
 * périodiquement. Les opérations restent idempotentes : le JSON et creationId
 * sont ceux enregistrés lors de la saisie initiale.
 */
export function IntranetStructureRuntime() {
  useEffect(() => {
    let alive = true;
    const run = () => {
      if (!alive) return;
      processStructureOutbox({ limit: 4 }).catch(() => {});
    };
    const startup = setTimeout(run, 700);
    const interval = setInterval(run, 60_000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') run(); });
    return () => {
      alive = false;
      clearTimeout(startup);
      clearInterval(interval);
      subscription.remove();
    };
  }, []);
  return null;
}
