import * as FileSystem from 'expo-file-system/legacy';
import { DATABASE_NAME } from './constants.js';
import { createRestoreJournal } from '../restoreRecoveryCore.js';

let active = false;
export function restoreSessionActive(){return active;}
export function beginRestoreSession(){
  if(active) throw new Error('Une restauration est déjà en cours.');
  active=true;
}
export function endRestoreSession(){active=false;}
export function getRestoreJournal(){
  return createRestoreJournal(FileSystem,FileSystem.documentDirectory,DATABASE_NAME);
}
export async function recoverInterruptedRestore(){
  if(active) throw new Error('Restauration en cours.');
  // This runs before SQLite opens; failed recovery blocks opening, not a reset.
  return getRestoreJournal().recover();
}
