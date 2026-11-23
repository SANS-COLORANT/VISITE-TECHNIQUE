/**
 * Audit transverse non destructif : fait tourner chaque suite meme si une autre echoue.
 * Les vrais fichiers de l'application (SQLite, trames, exports, photos) ne sont pas modifies.
 * Cela ne remplace ni l'emulateur Android, ni une recette sur Samsung.
 */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'audit-results', 'full-audit');
fs.mkdirSync(output, { recursive: true });

const suites = [
  ['source', [['node', '.github/scripts/run_source_patches.js']]],
  ['static', [['node', '.github/scripts/audit_metra_all_screens.cjs']]],
  ['android-ui', [
    ['node', '--test', '.github/scripts/test_metra_settings_safe_area.cjs', '.github/scripts/test_metra_equipment_legacy.cjs', '.github/scripts/test_metra_play_backup_ui.cjs', '.github/scripts/test_photo_ocr_gallery_contract.cjs'],
    ['node', '.github/scripts/test_root_navigation_directory.js'],
    ['node', '.github/scripts/test_swipe_navigation.js'],
    ['node', '.github/scripts/test_remar_cta_suivant.js'],
  ]],
  ['remar', [
    ['node', '.github/scripts/test_remar_141_intranet_matrix.js'],
    ['node', '.github/scripts/test_remar_complete_20261103.js'],
    ['node', '.github/scripts/test_remar_dynamic.js'],
    ['node', '.github/scripts/test_remar_progress.js'],
    ['node', '.github/scripts/test_remar_remote_trame_selection.js'],
    ['node', '.github/scripts/test_remar_photo_context.js'],
    ['node', '.github/scripts/test_remar_supplemental_payload.js'],
  ]],
  ['intranet', [
    ['node', '.github/scripts/test_intranet_v2_fixtures.js'],
    ['node', '.github/scripts/test_intranet_visit_upload.js'],
    ['node', '.github/scripts/test_intranet_any_visit_binding.js'],
    ['node', '.github/scripts/test_intranet_first_visit_preparation.js'],
    ['node', '.github/scripts/test_intranet_error_diagnostics.js'],
    ['node', '.github/scripts/test_rcu_network_six_slots.js'],
  ]],
  ['photos', [
    ['node', '.github/scripts/test_photo_workflow.js'],
    ['node', '.github/scripts/test_photo_gallery_import.js'],
    ['node', '.github/scripts/test_visit_photo_cleanup.js'],
  ]],
  ['sql', [
    ['python3', '.github/scripts/test_missions_sqlite_compat.py'],
    ['node', '.github/scripts/test_site_intranet_lifecycle.js'],
    ['node', '.github/scripts/test_terrain_data_cleanup.js'],
    ['node', '--import', './.github/scripts/legacy_fs_resolver.mjs', '--experimental-test-module-mocks', '--test', 'tests/trameRemar.test.mjs'],
  ]],
  ['reports', [
    ['node', 'tests/reportPdfFragments.test.mjs'],
    ['node', '.github/scripts/test_lot06_report_fidelity.js'],
    ['node', '.github/scripts/test_report_row_visibility.js'],
    ['node', '.github/scripts/test_visit_date_persistence.js'],
  ]],
  ['build-security', [
    ['python3', '.github/scripts/verify_play_security.py'],
    ['node', '.github/scripts/assert_sheetjs_secure.cjs'],
    ['node', '.github/scripts/check_missions_app_compat.js'],
  ]],
];
const results = [];
const started = new Date().toISOString();

for (const [group, commands] of suites) {
  console.log('\n### ' + group);
  for (let i = 0; i < commands.length; i++) {
    const args = commands[i];
    const cmd = args[0], argv = args.slice(1);
    const begin = Date.now();
    const env = { ...process.env };
    if (cmd === 'node') {
      env.NODE_OPTIONS = [process.env.NODE_OPTIONS, '--require=./.github/scripts/test_legacy_alias_globals.js'].filter(Boolean).join(' ');
    }
    const processResult = cp.spawnSync(cmd, argv, { cwd: root, env, encoding: 'utf8', timeout: 240000, maxBuffer: 64 * 1024 * 1024 });
    const log = String(processResult.stdout || '') + '\n' + String(processResult.stderr || '');
    const name = group + '-' + String(i + 1).padStart(2, '0') + '.log';
    fs.writeFileSync(path.join(output, name), '$ ' + args.join(' ') + '\n' + log);
    const ok = processResult.status === 0 && !processResult.error;
    const record = { group, command: args.join(' '), passed: ok, exitCode: processResult.status, durationMs: Date.now() - begin, error: processResult.error ? String(processResult.error) : null, log: name };
    results.push(record);
    console.log((ok ? 'PASS' : 'FAIL') + ' ' + record.command + ' (' + record.durationMs + 'ms)');
    if (!ok) console.log(log.slice(-1500));
  }
}
const report = {
  audit: 'METRA full source and contracts audit', startedAt: started, finishedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA || 'unknown', platform: 'GitHub Actions Ubuntu Node and Python (not a real Samsung)',
  passed: results.filter((x) => x.passed).length, failed: results.filter((x) => !x.passed).length, results,
  limitations: [
    'Source checks do not prove user interaction or Android render correctness',
    'Intranet test suites use controlled fixtures and do not exercise live production',
    'Cannot prove phone camera, gallery permissions, keyboard or Samsung system nav handling',
    'Cannot establish data retention across Play update without testing real persistent install',
    'Native Play release build is validated separately, with exact commit and signing certificate',
  ],
};
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let md = '# METRA full audit: ' + (report.failed ? 'FAIL' : 'PASS') + '\n\n';
md += 'Commit: ' + report.commit + '\n\nPassed: ' + report.passed + '; failed: ' + report.failed + '\n\n';
md += '| Group | Command | Status |\n|---|---|---|\n';
for (const r of results) md += '| ' + r.group + ' | \`' + r.command.replace(/\|/g,'\\|') + '\` | ' + (r.passed?'PASS':'FAIL') + ' |\n';
md += '\n## Important limitations\n\n' + report.limitations.map(x=>'- '+x).join('\n') + '\n';
fs.writeFileSync(path.join(output,'report.md'),md);
console.log('\nMETRA AUDIT RESULT '+JSON.stringify({passed:report.passed,failed:report.failed,report: 'audit-results/full-audit/report.json'}));
if (report.failed) process.exitCode = 1;
