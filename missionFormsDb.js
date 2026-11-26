/**
 * Trames Missions — branchement sur la base locale.
 * Requêtes : missionFormsQueries.js (testées sous Node).
 */
import { getDb } from './db.js';
import * as Q from './missionFormsQueries.js';

const withDb = (fn) => async (...args) => fn(await getDb(), ...args);

export const listerTrames = withDb(Q.queryForms);
export const lireTrame = withDb(Q.getForm);
export const enregistrerTrame = withDb(Q.saveForm);
export const dupliquerTrame = withDb(Q.duplicateForm);
export const supprimerTrame = withDb(Q.removeForm);
export const listerTramesMission = withDb(Q.queryMissionForms);
export const rattacherTrame = withDb(Q.attachForm);
export const retirerTrame = withDb(Q.detachForm);
export const listerFiches = withDb(Q.queryEntries);
export const lireFiche = withDb(Q.getEntry);
export const creerFiche = withDb(Q.createEntry);
export const enregistrerFiche = withDb(Q.saveEntryValues);
export const terminerFiche = withDb(Q.completeEntry);
export const rouvrirFiche = withDb(Q.reopenEntry);
export const supprimerFiche = withDb(Q.deleteEntry);
export const listerCiblesTrame = withDb(Q.queryFormTargets);
export const listerListesRef = withDb(Q.queryRefLists);
export const enregistrerListeRef = withDb(Q.saveRefList);
export const supprimerListeRef = withDb(Q.deleteRefList);
export const listerModelesWord = withDb(Q.queryReportTemplates);
export const ajouterModeleWord = withDb(Q.insertReportTemplate);
export const supprimerModeleWord = withDb(Q.deleteReportTemplate);
export const lireSourceModeleWord = withDb(Q.queryTemplateSource);
