/**
 * Police custom de l'app : Sora pour les titres/chiffres, Inter pour le
 * texte courant, au lieu de la police système par défaut d'Android.
 */

import { useFonts } from 'expo-font';
import { Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold } from '@expo-google-fonts/sora';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';

const FONTS = { Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold };

const FONT_HEADING_BLACK = 'Sora_800ExtraBold';
const FONT_HEADING_BOLD = 'Sora_700Bold';
const FONT_HEADING_SEMI = 'Sora_600SemiBold';
const FONT_BODY = 'Inter_400Regular';
const FONT_BODY_MEDIUM = 'Inter_500Medium';
const FONT_BODY_SEMI = 'Inter_600SemiBold';
const FONT_BODY_BOLD = 'Inter_700Bold';

function useAppFonts() {
  const [loaded] = useFonts(FONTS);
  return loaded;
}

export { useAppFonts, FONT_HEADING_BLACK, FONT_HEADING_BOLD, FONT_HEADING_SEMI, FONT_BODY, FONT_BODY_MEDIUM, FONT_BODY_SEMI, FONT_BODY_BOLD };
