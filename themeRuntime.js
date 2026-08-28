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
let currentPalette = { ...CLASSIC };
let installed = false;

function normalizePalette(colors) {
  const source = colors || {};
  const value = {
    main: String(source.main || CLASSIC.main).toUpperCase(),
    dark: String(source.dark || CLASSIC.dark).toUpperCase(),
    light: String(source.light || CLASSIC.light).toUpperCase(),
  };
  return {
    main: /^#[0-9A-F]{6}$/.test(value.main) ? value.main : CLASSIC.main,
    dark: /^#[0-9A-F]{6}$/.test(value.dark) ? value.dark : CLASSIC.dark,
    light: /^#[0-9A-F]{6}$/.test(value.light) ? value.light : CLASSIC.light,
  };
}

export function setRuntimeThemeMode(mode) {
  currentMode = mode === THEME_ANIMATED ? THEME_ANIMATED : 'classic';
  currentPalette = currentMode === THEME_ANIMATED ? { ...DOOM } : { ...CLASSIC };
}

export function setRuntimeVisualPalette(colors) {
  currentPalette = normalizePalette(colors);
}

export function getRuntimeThemeMode() {
  return currentMode;
}

export function getRuntimeAccent() {
  return currentPalette.main;
}

export function getRuntimePalette() {
  return { ...currentPalette };
}

function transformOrange(value) {
  if (typeof value !== 'string') return value;
  const upper = value.toUpperCase();
  if (upper === CLASSIC.main) return currentPalette.main;
  if (upper === CLASSIC.dark) return currentPalette.dark;
  if (upper === CLASSIC.light) return currentPalette.light;
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
