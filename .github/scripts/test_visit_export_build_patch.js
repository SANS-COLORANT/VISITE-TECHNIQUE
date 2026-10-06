// Exercise the actual historical APK patch on both export batch shapes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const patch = fs.readFileSync(path.join(root, '.github/scripts/patch_visit_creation_export_type.py'), 'utf8');
const prefix = patch.slice(0, patch.indexOf('# ---------------------------------------------------------------------------'));
const bootstrap = patch.split('\n').find(line => line.startsWith('bootstrap_import = '));
const tail = patch.slice(patch.indexOf("p = Path('excelExport.js')"));
assert.ok(prefix.includes('def replace_once') && bootstrap && tail.includes('Excel ensure deferred PRE structure'));
const script = `${prefix}\n${bootstrap}\n${tail}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metra-export-patch-'));
try {
  const actual = fs.readFileSync(path.join(root, 'excelExport.js'), 'utf8');
  for (const [name, source] of [['measurement annex', actual], ['legacy batch', actual.replace('modelePreAllumage, pointsLibres]', 'modelePreAllumage]')]]) {
    const filename = path.join(dir, 'excelExport.js');
    fs.writeFileSync(filename, source);
    execFileSync(process.env.PYTHON || 'python3', ['-c', script], { cwd: dir, stdio: 'pipe' });
    const result = fs.readFileSync(filename, 'utf8');
    assert.ok(result.includes("if (trame.id === 'pre_allumage') await assurerStructureSitePreAllumage(visiteId);"), name);
    assert.equal(result.includes('modelePreAllumage, pointsLibres]'), source.includes('modelePreAllumage, pointsLibres]'));
    assert.ok(result.includes('SELECT libelle,valeur,unite FROM points_mesure_visite'), 'measurement reads preserved');
    execFileSync(process.env.PYTHON || 'python3', ['-c', script], { cwd: dir, stdio: 'pipe' });
    assert.equal(fs.readFileSync(filename, 'utf8'), result, `${name}: patch is idempotent`);
    console.log(`APK export patch validated: ${name}, bootstrap, query preservation and idempotence.`);
  }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
