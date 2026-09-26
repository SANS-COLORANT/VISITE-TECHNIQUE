/**
 * Retour terrain unifié : toast bref + vibration légère (expo-haptics).
 * Un seul point d'entrée pour que tous les écrans réagissent de la même façon.
 */
import * as Haptics from 'expo-haptics';
import { showToast } from './PremiumDialogs.js';

export function hapticTick() {
  Haptics.selectionAsync().catch(() => {});
}

export function hapticSuccess() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function feedback(message, { tone = 'success', action = null, haptic = true } = {}) {
  if (haptic) (tone === 'success' ? hapticSuccess : hapticTick)();
  if (message) showToast(message, { tone, action });
}
