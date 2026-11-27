/**
 * Fiche Mission modulable — branchement du cœur de préférences
 * (missionSheetPrefs.js) sur la base de préférences d'interface de METRA.
 * Lecture synchrone, aucune migration de la base métier.
 */
import { getPrefSync, setPrefSync } from './uiPrefs.js';
import { createMissionSheetPrefs } from './missionSheetPrefs.js';

export const missionSheetStore = createMissionSheetPrefs({ get: getPrefSync, set: setPrefSync });
