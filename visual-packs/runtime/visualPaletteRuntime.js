import { StyleSheet, processColor } from 'react-native';

const DEFAULT_PALETTE = {
  main: '#F26426',
  dark: '#D9531A',
  light: '#FFF1EA',
};

let currentPalette = { ...DEFAULT_PALETTE };
let installed = false;

function normalizePalette(colors) {
  const source = colors || {};
  const value = {
    main: String(source.main || DEFAULT_PALETTE.main).toUpperCase(),
    dark: String(source.dark || DEFAULT_PALETTE.dark).toUpperCase(),
    light: String(source.light || DEFAULT_PALETTE.light).toUpperCase(),
  };
  return {
    main: /^#[0-9A-F]{6}$/.test(value.main) ? value.main : DEFAULT_PALETTE.main,
    dark: /^#[0-9A-F]{6}$/.test(value.dark) ? value.dark : DEFAULT_PALETTE.dark,
    light: /^#[0-9A-F]{6}$/.test(value.light) ? value.light : DEFAULT_PALETTE.light,
  };
}

export function setRuntimeVisualPalette(colors) {
  currentPalette = normalizePalette(colors);
}

export function getRuntimeAccent() {
  return currentPalette.main;
}

export function getRuntimePalette() {
  return { ...currentPalette };
}

function transformBasePalette(value) {
  if (typeof value !== 'string') return value;
  const upper = value.toUpperCase();
  if (upper === DEFAULT_PALETTE.main) return currentPalette.main;
  if (upper === DEFAULT_PALETTE.dark) return currentPalette.dark;
  if (upper === DEFAULT_PALETTE.light) return currentPalette.light;
  return value;
}

function processVisualColor(value) {
  return processColor(transformBasePalette(value));
}

export function installVisualPalettePreprocessors() {
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
    StyleSheet.setStyleAttributePreprocessor(property, processVisualColor);
  });
}

installVisualPalettePreprocessors();
