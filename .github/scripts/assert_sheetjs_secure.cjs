#!/usr/bin/env node
'use strict';

// Security gate for METRA Play candidate: the public npm registry stops at
// vulnerable SheetJS 0.18.5. The official CDN release must be used.
const XLSX = require('xlsx');
const expected = '0.20.3';
if (XLSX.version !== expected) {
  throw new Error('METRA Play must use SheetJS ' + expected + ', found ' + XLSX.version);
}
const values = [['METRA', 'Contrôle', 'Valeur'], ['REMAR', 'Température', 67.25], ['ICPE', 'Conformité', 'S']];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(values), 'Mesures');
const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
const parsed = XLSX.read(bytes, { type: 'buffer', cellDates: true });
const data = XLSX.utils.sheet_to_json(parsed.Sheets.Mesures, { header: 1, defval: '' });
if (JSON.stringify(data) !== JSON.stringify(values)) throw new Error('SheetJS METRA Excel roundtrip regression');
const root = require('../../package.json');
const requiredUrl = 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz';
if (root.dependencies?.xlsx !== requiredUrl) throw new Error('SheetJS must be pinned to the exact official tarball');
const lock = require('../../package-lock.json');
if (lock.packages?.['node_modules/xlsx']?.version !== expected ||
    lock.packages?.['node_modules/xlsx']?.resolved !== requiredUrl ||
    !lock.packages?.['node_modules/xlsx']?.integrity) {
  throw new Error('SheetJS lockfile must pin exact official tarball with SRI integrity');
}
console.log('METRA security gate: SheetJS ' + XLSX.version + ', pinned CDN, SRI and XLSX roundtrip PASS');
