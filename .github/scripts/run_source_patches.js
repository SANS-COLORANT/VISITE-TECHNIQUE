const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

const PATCHES = [
  ['latest API visit import', '.github/scripts/patch_latest_api_visit_import.js'],
  ['client multi-site import', '.github/scripts/patch_client_multi_site_import.js'],
  ['latest API visit fields', '.github/scripts/patch_latest_api_visit_fields.js'],
  ['large-client performance', '.github/scripts/patch_large_client_performance.js'],
  ['large-client queries', '.github/scripts/patch_large_client_queries.js'],
  ['directory fast cache', '.github/scripts/patch_directory_fast_cache.js'],
  ['runtime responsiveness v3', '.github/scripts/patch_runtime_responsiveness_v3.js'],
  ['startup dependency graph', '.github/scripts/patch_startup_dependency_graph.js'],
  ['client site preview layout', '.github/scripts/patch_client_site_preview_layout.js'],
  ['report export workflow', '.github/scripts/patch_report_export_workflow.js'],
];

const CONTRACT_CHECKS = [
  ['large-client performance contract', '.github/scripts/check_large_client_performance.js'],
  ['runtime responsiveness v3 contract', '.github/scripts/check_runtime_responsiveness_v3.js'],
  ['startup dependency graph contract', '.github/scripts/check_startup_dependency_graph.js'],
  ['report export workflow contract', '.github/scripts/check_report_export_workflow.js'],
];

const JS_SYNTAX_FILES = [
  'App.js',
  'ReportScreen.js',
  'reportBuilder.js',
  'reportEditorExporter.js',
  'metraStorage.js',
  'ClientDocumentsScreen.js',
  'HomeScreen.js',
  'ClientSitesScreen.js',
  'SiteGroupsManager.js',
  'SiteVisitesScreen.js',
  'SiteOverviewPanel.js',
  'VisiteScreen.js',
  'visitPrefillDb.js',
  'ClientMapScreen.js',
  'EquipmentCatalogueBrowser.js',
  'ClientPilotageScreen.js',
  'ClientPatrimoineScreen.js',
  'clientTechnicalMatrix.js',
  'patrimoineDb.js',
  'siteHealth.js',
  'db.js',
  'database/index.js',
  'visual-packs/runtime/visualPackManager.js',
  'symfonyApiCacheDb.js',
  'MetraDirectoryScreen.js',
];

function spawnNode(args, stdio = 'inherit') {
  return spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio,
    env: process.env,
  });
}

function runNode(args, label) {
  const startedAt = Date.now();
  console.log(`\n[METRA prepare] ${label}`);
  const result = spawnNode(args, 'inherit');
  if (result.error) {
    console.error(`[METRA prepare] ${label} could not start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[METRA prepare] ${label} failed with exit code ${result.status}.`);
    process.exit(result.status || 1);
  }
  console.log(`[METRA prepare] ${label} OK (${Date.now() - startedAt} ms)`);
}

function finalStateAlreadyPrepared() {
  for (const [, script] of CONTRACT_CHECKS) {
    const result = spawnNode([script], 'ignore');
    if (result.error || result.status !== 0) return false;
  }
  return true;
}

if (finalStateAlreadyPrepared()) {
  console.log('[METRA prepare] Final prepared state already detected; source patches are skipped.');
} else {
  console.log('[METRA prepare] Applying source patches in the canonical order.');
  for (const [label, script] of PATCHES) runNode([script], `patch: ${label}`);
}

console.log('\n[METRA prepare] Validating patch contracts.');
for (const [label, script] of CONTRACT_CHECKS) runNode([script], `contract: ${label}`);

console.log('\n[METRA prepare] Validating JavaScript syntax.');
for (const file of JS_SYNTAX_FILES) runNode(['--check', file], `syntax: ${file}`);

console.log('\n[METRA prepare] Source preparation completed successfully.');
