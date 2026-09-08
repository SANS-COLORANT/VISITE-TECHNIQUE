const fs = require('fs');

const path = 'apiLatestVisitImportDb.js';
let text = fs.readFileSync(path, 'utf8');

const importLine = "import { enrichLatestImportedVisitFields } from './apiLatestVisitFieldEnrichmentDb.js';\n";
if (!text.includes(importLine.trim())) {
  const anchor = "import { DEFAULT_TRAME_ID, obtenirTrame } from './trameRegistry.js';\n";
  if (!text.includes(anchor)) throw new Error('apiLatestVisitImportDb import anchor not found');
  text = text.replace(anchor, anchor + importLine);
}

if (!text.includes('const fieldImport = await enrichLatestImportedVisitFields')) {
  const anchor = '  let importedRemarks = 0;\n';
  if (!text.includes(anchor)) throw new Error('latest visit remarks anchor not found');
  const call = `  const fieldImport = await enrichLatestImportedVisitFields({\n    db, visiteId, siteId, remoteVisitId, trameId, ref,\n  });\n\n`;
  text = text.replace(anchor, call + anchor);
}

if (!text.includes('fieldImport,\n      importedRemarks')) {
  const anchor = '      mappedCriteria,\n      importedRemarks,\n';
  if (!text.includes(anchor)) throw new Error('latest visit import summary anchor not found');
  text = text.replace(anchor, '      mappedCriteria,\n      fieldImport,\n      importedRemarks,\n');
}

const oldReturn = '  return { imported: true, visiteId, remoteVisitId, mappedCriteria, sourceCriteria, importedRemarks, created: !existing?.id };\n';
const newReturn = '  return { imported: true, visiteId, remoteVisitId, mappedCriteria, sourceCriteria, importedRemarks, fieldImport, created: !existing?.id };\n';
if (!text.includes(newReturn.trim())) {
  if (!text.includes(oldReturn)) throw new Error('latest visit return anchor not found');
  text = text.replace(oldReturn, newReturn);
}

fs.writeFileSync(path, text);
console.log('Latest Intranet visit field enrichment wired.');
