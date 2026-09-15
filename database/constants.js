export const DATABASE_NAME = 'visite_technique.db';

// Keep this value aligned with the highest migration registered in
// database/migrations/index.js. Migrations 035-037 sont deja deployees sur
// certaines tablettes. La creation de sites/locaux Intranet utilise donc la
// migration 038 sans reutiliser ni retrograder un numero existant.
export const DATABASE_SCHEMA_VERSION = 38;

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
  SYMFONY_API: 'api_symfony',
  LEGACY_MIGRATION: 'migration_legacy',
  OCR: 'ocr',
  SYSTEM: 'systeme',
});
