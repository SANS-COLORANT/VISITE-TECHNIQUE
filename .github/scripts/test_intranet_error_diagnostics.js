/**
 * Guard the local preflight diagnostics: all validator issues must be
 * accessible without weakening the fail-closed Intranet upload checks.
 * Run: node .github/scripts/test_intranet_error_diagnostics.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '../../IntranetVisitSync.js'), 'utf8');
const payload = fs.readFileSync(path.join(__dirname, '../../intranetVisitPayload.js'), 'utf8');

assert.match(src, /\bShare\b.*from ['"]react-native['"]/);
assert.match(src, /function showLocalBindingAlert\(title, error\)/);
assert.match(src, /issues\.map\(\(issue, index\) =>/);
assert.match(src, /Share\.share\(\{ title: 'Diagnostic METRA - Intranet', message: fullReport \}\)/);
assert.match(src, /showLocalBindingAlert\('Envoi impossible', e\)/);
assert.match(src, /showLocalBindingAlert\('Visite non envoyable', error\)/);
assert.match(payload, /if \(issues\.length\) throw new IntranetVisitValidationError\(issues/);
assert.match(payload, /REMAR dynamique non transmissible sans perte/);
assert.match(src, /const fullReport = \[/);
assert.ok(!src.includes('Share.share({ title: \'Diagnostic METRA - Intranet\', message: preview })'),
  'shared report cannot be limited to the truncated alert preview');
console.log('9 Intranet diagnostic guards passed.');
