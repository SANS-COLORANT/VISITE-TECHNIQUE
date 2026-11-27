/**
 * Missions à la carte — branchement sur la base locale.
 * Requêtes : missionModelsQueries.js (testées sous Node).
 */
import { getDb } from './db.js';
import {
  insertMissionModel,
  markMissionModelUsed,
  queryMissionModels,
  queryMissionModules,
  removeMissionModel,
  restoreMissionModulesRaw,
  saveMissionModules,
} from './missionModelsQueries.js';

export const lireBriquesMission = async (missionId) => queryMissionModules(await getDb(), missionId);
export const enregistrerBriquesMission = async (missionId, modules) => saveMissionModules(await getDb(), missionId, modules);
export const restaurerBriquesMission = async (missionId, raw) => restoreMissionModulesRaw(await getDb(), missionId, raw);
export const listerModelesMission = async () => queryMissionModels(await getDb());
export const creerModeleMission = async (model) => insertMissionModel(await getDb(), model);
export { modelFormIds } from './missionModelsQueries.js';
export const supprimerModeleMission = async (modelId) => removeMissionModel(await getDb(), modelId);
export const marquerModeleMissionUtilise = async (modelId) => markMissionModelUsed(await getDb(), modelId);
