import { StyleSheet, processColor } from 'react-native';
import { THEME_ANIMATED } from './themePreference.js';

const CLASSIC = {
  main: '#F26426',
  dark: '#D9531A',
  light: '#FFF1EA',
};

const DOOM = {
  main: '#106836',
  dark: '#0A522A',
  light: '#E7F2EB',
};

let currentMode = 'classic';
let installed = false;

export function setRuntimeThemeMode(mode) {
  currentMode = mode === THEME_ANIMATED ? THEME_ANIMATED : 'classic';
}

export function getRuntimeThemeMode() {
  return currentMode;
}

export function getRuntimeAccent() {
  return currentMode === THEME_ANIMATED ? DOOM.main : CLASSIC.main;
}

function transformOrange(value) {
  if (currentMode !== THEME_ANIMATED || typeof value !== 'string') return value;
  const upper = value.toUpperCase();
  if (upper === CLASSIC.main) return DOOM.main;
  if (upper === CLASSIC.dark) return DOOM.dark;
  if (upper === CLASSIC.light) return DOOM.light;
  return value;
}

function processThemeColor(value) {
  return processColor(transformOrange(value));
}

export function installThemeColorPreprocessors() {
  if (installed || typeof StyleSheet.setStyleAttributePreprocessor !== 'function') return;
  installed = true;
  [
    'color',
    'backgroundColor',
    'borderColor',
    'borderTopColor',
    'borderRightColor',
    'borderBottomColor',
    'borderLeftColor',
    'shadowColor',
    'textDecorationColor',
    'tintColor',
  ].forEach((property) => {
    StyleSheet.setStyleAttributePreprocessor(property, processThemeColor);
  });
}

installThemeColorPreprocessors();
