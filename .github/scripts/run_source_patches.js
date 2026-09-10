const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

const CONTRACT_CHECKS = [
  ['latest API visit runtime contract', '.github/scripts/check_api_latest_visit_runtime.js'],
  ['visit carry-forward contract', '.github/scripts/check_visit_carry_forward_contract.js'],
  ['large-client performance contract', '.github/scripts/check_large_client_performance.js'],
  ['runtime responsiveness v3 contract', '.github/scripts/check_runtime_responsiveness_v3.js'],
  ['startup dependency graph contract', '.github/scripts/check_startup_dependency_graph.js'],
  ['report export workflow contract', '.github/scripts/check_report_export_workflow.js'],
  ['latest visit photos contract', '.github/scripts/check_latest_visit_photos_contract.js'],
  ['Intranet visit upload contract', '.github/scripts/check_intranet_visit_upload_contract.js'],
  ['Intranet any-visit binding contract', '.github/scripts/check_intranet_any_visit_contract.js'],
  ['Intranet visit upload executable tests', '.github/scripts/test_intranet_visit_upload.js'],
  ['photo workflow executable regression tests', '.github/scripts/test_photo_workflow.js'],
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
  'visitCarryForwardDb.js',
  'visitCreationDb.js',
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
  'apiLatestVisitImportDb.js',
  'apiLatestVisitFieldEnrichmentDb.js',
  'MetraDirectoryScreen.js',
  'ClientLatestVisitPhotosModal.js',
  'latestVisitPhotoModel.js',
  'latestVisitPhotoTasks.js',
  'PhotoDownloadStatus.js',
  'PhotoReferenceAccess.js',
  'ReferencePhotoViewer.js',
  'SitePhotoPreparationOption.js',
  'latestVisitPhotosDb.js',
  'latestVisitPhotosStorage.js',
  'intranetVisitPayload.js',
  'intranetVisitBindingDb.js',
  'intranetVisitOutboxDb.js',
  'IntranetVisitSync.js',
  'IntranetVisitDestinationPicker.js',
  'database/migrations/033_intranet_visit_outbox.js',
  'symfonyApi.js',
  'database/migrations/031_latest_visit_photos.js',
  'database/migrations/032_photo_reference_workflow.js',
];

function runNode(args, label) {
  const startedAt = Date.now();
  console.log(`\n[METRA verify] ${label}`);
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    console.error(`[METRA verify] ${label} could not start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[METRA verify] ${label} failed with exit code ${result.status}.`);
    console.error('[METRA verify] Runtime source is not in the committed prepared state. Do not repair it during install; update the source and its contracts in a dedicated PR.');
    process.exit(result.status || 1);
  }
  console.log(`[METRA verify] ${label} OK (${Date.now() - startedAt} ms)`);
}

console.log('[METRA verify] Verifying committed runtime source without modifying it.');
for (const [label, script] of CONTRACT_CHECKS) runNode([script], `contract: ${label}`);

console.log('\n[METRA verify] Validating JavaScript syntax.');
for (const file of JS_SYNTAX_FILES) runNode(['--check', file], `syntax: ${file}`);

console.log('\n[METRA verify] Committed runtime source is valid. No source patch was applied.');
