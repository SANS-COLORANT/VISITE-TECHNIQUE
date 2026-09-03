export const DATABASE_NAME = 'visite_technique.db';

// Keep this value aligned with the highest migration registered in
// database/migrations/index.js. Migration 023 adds reserve severity fields.
export const DATABASE_SCHEMA_VERSION = 23;

export const ENTITY_TYPES = Object.freeze({
  CLIENT: 'client',
  SITE: 'site',
  INSTALLATION: 'installation',
  EQUIPEMENT: 'equipement',
  RESEAU: 'reseau',
  COMPTEUR: 'compteur',
  VISITE: 'visite',
  MESURE: 'mesure',
  CONTROLE: 'controle',
});

export const DATA_ORIGINS = Object.freeze({
  MANUAL: 'manuel',
  EXCEL_IMPORT: 'import_excel',
  LEGACY_MIGRATION: 'migration_legacy',
  OCR: 'ocr',
  SYSTEM: 'systeme',
});
