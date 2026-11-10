/**
 * Compatriot des anciens bancs d'essai METRA : ils exécutent les sources
 * ES modules dans new Function après avoir retiré leurs imports.
 * Exposer ici les vrais utilitaires de la branche pour que les tests
 * conservent leur code runtime inchangé. Ne modifie aucune source compilée.
 */
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../../intranetStorageAliases.js'), 'utf8')
  .replace(/export\s+(?=function\s)/g, '');
const aliases = new Function(source +
  '\nreturn {legacySectionCode,canonicalSectionCode,canonicalKnownCode,candidateSectionCodes,resolveAliasValue};')();
Object.assign(globalThis, aliases, {
  candidateStorageCodes: aliases.candidateSectionCodes,
  candidateStoredValue: aliases.resolveAliasValue,
});
